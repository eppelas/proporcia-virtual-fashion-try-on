export type UploadedImageData = {
  base64: string;
  mimeType: string;
};

const HEIC_EXT_PATTERN = /\.(heic|heif)$/i;

const isHeicLikeFile = (file: File): boolean => {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type.includes('heic') || type.includes('heif') || HEIC_EXT_PATTERN.test(name);
};

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsDataURL(file);
  });
};

const canvasToJpegDataUrl = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не удалось подготовить изображение.');
  }
  draw(ctx);
  return canvas.toDataURL('image/jpeg', 0.95);
};

const convertWithImageBitmap = async (file: File): Promise<string> => {
  if (!('createImageBitmap' in window)) {
    throw new Error('createImageBitmap not supported');
  }

  const bitmap = await createImageBitmap(file);
  try {
    return canvasToJpegDataUrl(bitmap.width, bitmap.height, (ctx) => {
      ctx.drawImage(bitmap, 0, 0);
    });
  } finally {
    bitmap.close();
  }
};

const convertWithImageTag = async (file: File): Promise<string> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = objectUrl;
    });

    return canvasToJpegDataUrl(image.naturalWidth, image.naturalHeight, (ctx) => {
      ctx.drawImage(image, 0, 0);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const convertHeicToJpeg = async (file: File): Promise<UploadedImageData> => {
  try {
    const base64 = await convertWithImageBitmap(file);
    return { base64, mimeType: 'image/jpeg' };
  } catch {
    try {
      const base64 = await convertWithImageTag(file);
      return { base64, mimeType: 'image/jpeg' };
    } catch {
      throw new Error(
        'Формат HEIC/HEIF не декодируется в этом браузере. Откройте в Safari/Chrome на iPhone или экспортируйте фото в JPG.'
      );
    }
  }
};

export const readUploadImageFile = async (file: File): Promise<UploadedImageData> => {
  if (isHeicLikeFile(file)) {
    return convertHeicToJpeg(file);
  }

  const base64 = await readFileAsDataUrl(file);
  const mimeType = file.type || 'image/jpeg';
  return { base64, mimeType };
};
