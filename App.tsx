import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import ClothingGallery from './components/ClothingGallery';
import ImageUploader from './components/ImageUploader';
import ResultDisplay from './components/ResultDisplay';
import InfoIcon from './components/icons/InfoIcon';
import CloseIcon from './components/icons/CloseIcon';
import SpinnerIcon from './components/icons/SpinnerIcon';
import { CLOTHING_DB } from './data/clothingDb';
import type { ClothingItem, ClothingVariant } from './types';
import { analyzeUserPhoto, generateVirtualTryOnImage } from './services/geminiService';

interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}

interface FaceDetectorInstance {
  detect: (image: HTMLImageElement) => Promise<DetectedFace[]>;
}

interface FaceDetectorConstructor {
  new (options?: { maxDetectedFaces?: number; fastMode?: boolean }): FaceDetectorInstance;
}

declare global {
  interface Window {
    FaceDetector?: FaceDetectorConstructor;
  }
}

type ModelMode = 'pro' | 'flash' | 'qwen' | 'seedream';

interface HistoryEntry {
  id: string;
  model: ModelMode;
  image: string;
  clothingName: string;
  productUrl?: string;
  createdAt: number;
}

const HISTORY_STORAGE_KEY = 'TRYON_HISTORY';
const GEMINI_KEY_STORAGE = 'GEMINI_API_KEY';
const MAX_HISTORY_ITEMS = 20;

const readLocalStorage = (key: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const writeLocalStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors in private/incognito modes
  }
};

const App: React.FC = () => {
  const [clothingItems, setClothingItems] = useState<ClothingItem[]>(CLOTHING_DB);
  
  const [selectedClothing, setSelectedClothing] = useState<ClothingItem | null>(null);
  const [userImageData, setUserImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [generatedImagePro, setGeneratedImagePro] = useState<string | null>(null);
  const [isLoadingPro, setIsLoadingPro] = useState<boolean>(false);
  const [isUploadChecking, setIsUploadChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPro, setErrorPro] = useState<string | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [analysisHint, setAnalysisHint] = useState<string | null>(null);
  const selectedModel: ModelMode = 'pro';
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as HistoryEntry[];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : [];
    } catch {
      return [];
    }
  });
  const [currentResultImage, setCurrentResultImage] = useState<string | null>(null);
  const [previewHistoryId, setPreviewHistoryId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => {
    return readLocalStorage(GEMINI_KEY_STORAGE);
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  useEffect(() => {
    writeLocalStorage(GEMINI_KEY_STORAGE, apiKey.trim());
  }, [apiKey]);

  useEffect(() => {
    writeLocalStorage(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const loadImageElement = (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      image.src = base64;
    });
  };

  const getDataUrlMimeType = (dataUrl: string, fallback = 'image/jpeg'): string => {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    return match?.[1] || fallback;
  };

  const getBottomAverageColor = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    sampleHeight: number
  ): { r: number; g: number; b: number } => {
    const safeSampleHeight = Math.max(1, Math.min(sampleHeight, height));
    const imageData = ctx.getImageData(0, height - safeSampleHeight, width, safeSampleHeight).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const pixels = imageData.length / 4;
    for (let i = 0; i < imageData.length; i += 4) {
      r += imageData[i];
      g += imageData[i + 1];
      b += imageData[i + 2];
    }
    return {
      r: Math.round(r / pixels),
      g: Math.round(g / pixels),
      b: Math.round(b / pixels),
    };
  };

  const extendImageDownwardForOutpaint = async (
    imageData: { base64: string; mimeType: string },
    targetAspectRatio = 9 / 16
  ): Promise<{ base64: string; mimeType: string }> => {
    const image = await loadImageElement(imageData.base64);
    const targetHeight = Math.ceil(image.width / targetAspectRatio);
    if (targetHeight <= image.height) {
      return imageData;
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageData;

    // Anchor the original photo at the top and add neutral continuation below.
    ctx.drawImage(image, 0, 0);
    const extraHeight = targetHeight - image.height;
    const sampleHeight = Math.max(16, Math.round(image.height * 0.06));
    const avg = getBottomAverageColor(ctx, image.width, image.height, sampleHeight);
    ctx.fillStyle = `rgb(${avg.r}, ${avg.g}, ${avg.b})`;
    ctx.fillRect(0, image.height, image.width, extraHeight);

    const seamGradient = ctx.createLinearGradient(0, image.height - sampleHeight, 0, targetHeight);
    seamGradient.addColorStop(0, 'rgba(0,0,0,0)');
    seamGradient.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = seamGradient;
    ctx.fillRect(0, image.height - sampleHeight, image.width, targetHeight - (image.height - sampleHeight));

    const outputMimeType = imageData.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
    const outputBase64 = canvas.toDataURL(outputMimeType, 0.95);
    return { base64: outputBase64, mimeType: outputMimeType };
  };

  const lockUpperAreaFromSource = async (
    sourceImageBase64: string,
    outpaintedImageBase64: string
  ): Promise<string> => {
    const [sourceImage, outpaintedImage] = await Promise.all([
      loadImageElement(sourceImageBase64),
      loadImageElement(outpaintedImageBase64),
    ]);

    if (outpaintedImage.height <= sourceImage.height) {
      return outpaintedImageBase64;
    }

    const canvas = document.createElement('canvas');
    canvas.width = outpaintedImage.width;
    canvas.height = outpaintedImage.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return outpaintedImageBase64;

    ctx.drawImage(outpaintedImage, 0, 0);
    const sourceScaledHeight = Math.round(sourceImage.height * (outpaintedImage.width / sourceImage.width));
    ctx.drawImage(
      sourceImage,
      0,
      0,
      sourceImage.width,
      sourceImage.height,
      0,
      0,
      outpaintedImage.width,
      sourceScaledHeight
    );

    const outputMime = getDataUrlMimeType(outpaintedImageBase64, 'image/jpeg');
    return canvas.toDataURL(outputMime.includes('png') ? 'image/png' : 'image/jpeg', 0.95);
  };

  const validateUploadedPhotoLocally = async (
    base64: string
  ): Promise<{ isValid: boolean; message?: string; needsAiCheck?: boolean }> => {
    const image = await loadImageElement(base64);

    // Base sanity checks (work in any browser).
    if (image.width < 400 || image.height < 500) {
      return {
        isValid: false,
        message: 'Слишком маленькое изображение. Загрузите фото лучшего качества.',
      };
    }

    const detectorCtor = window.FaceDetector;
    if (!detectorCtor) {
      return {
        isValid: true,
        needsAiCheck: true,
      };
    }

    const detector = new detectorCtor({ maxDetectedFaces: 1, fastMode: true });
    const faces = await detector.detect(image);
    if (!faces.length) {
      return {
        isValid: false,
        message: 'Похоже, это не фото человека. Загрузите портрет или фото в полный рост.',
      };
    }

    const faceHeightRatio = faces[0].boundingBox.height / image.height;
    if (faceHeightRatio > 0.42) {
      return {
        isValid: false,
        message: 'Слишком крупный портрет. Нужна фигура хотя бы примерно на 2/3 кадра.',
      };
    }

    return { isValid: true };
  };

  const handleUserImageUpload = async (fileData: { base64: string; mimeType: string }) => {
    setCurrentResultImage(null);
    setPreviewHistoryId(null);
    setError(null);
    setAnalysisHint(null);
    try {
      setIsUploadChecking(true);
      const localValidation = await validateUploadedPhotoLocally(fileData.base64);
      if (!localValidation.isValid) {
        setUserImageData(null);
        setGeneratedImagePro(null);
        setError(localValidation.message || 'Фото не подходит для примерки.');
        return;
      }
      setUserImageData(fileData);

      // In browsers without FaceDetector (e.g., Arc), run AI validation right after upload
      // only when Gemini key is available. Otherwise keep photo and continue.
      const normalizedApiKey = apiKey.trim();
      if (localValidation.needsAiCheck && !normalizedApiKey) {
        setAnalysisHint('Автопроверка фото пропущена: в этом браузере она требует Gemini key.');
        return;
      }

      if (localValidation.needsAiCheck && normalizedApiKey) {
        const analysis = await analyzeUserPhoto(
          fileData.base64,
          fileData.mimeType,
          normalizedApiKey
        );
        if (!analysis.isValid || analysis.bodyCoverage === 'portrait') {
          setUserImageData(null);
          setGeneratedImagePro(null);
          setError(
            analysis.message || 'Фото не подходит для примерки. Нужен человек минимум от колен и выше.'
          );
          return;
        }
        setAnalysisHint('Фото проверено при загрузке.');
      }
    } catch (validationError) {
      setUserImageData(null);
      setGeneratedImagePro(null);
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'Не удалось проверить изображение.'
      );
    } finally {
      setIsUploadChecking(false);
    }
  };

  const pickVariantForPose = (
    item: ClothingItem,
    pose: 'front' | 'side' | 'three_quarter' | 'unknown'
  ): ClothingVariant => {
    const variants: ClothingVariant[] =
      item.gallery && item.gallery.length > 0
        ? item.gallery
        : [{ view: 'front', imageSrc: item.imageSrc }];

    const exact = variants.find((variant) => variant.view === pose);
    if (exact) return exact;

    if (pose === 'three_quarter') {
      return (
        variants.find((variant) => variant.view === 'three_quarter') ||
        variants.find((variant) => variant.view === 'front') ||
        variants.find((variant) => variant.view === 'side') ||
        variants[0]
      );
    }

    return variants.find((variant) => variant.view === 'front') || variants[0];
  };

  const handleInvalidatedItem = (id: number) => {
    if (selectedClothing?.id === id) {
      setSelectedClothing(null);
      setError('Выбранная карточка look недоступна. Выберите другой look или загрузите свою вещь.');
    }
  };

  const isLongGarment = (item: ClothingItem): boolean =>
    item.lengthHint === 'maxi' || item.lengthHint === 'floor';

  const shouldOutpaintBottom = (item: ClothingItem): boolean =>
    item.lengthHint === 'floor';

  const processImageSource = async (src: string): Promise<{ base64: string; mimeType: string }> => {
    try {
      if (src.startsWith('data:')) {
        const mimeTypeMatch = src.match(/data:(image\/[a-zA-Z0-9-.+]+);base64,/);
        if (!mimeTypeMatch || !mimeTypeMatch[1]) throw new Error("Invalid data URL format");
        return { base64: src, mimeType: mimeTypeMatch[1] };
      }
      
      if (src.includes('proporcia.store') && !src.match(/\.(jpeg|jpg|png|webp)$/i)) {
          throw new Error("Ссылка ведет на страницу товара, а не на картинку. Пожалуйста, используйте прямую ссылку на изображение или загрузите фото вручную.");
      }

      const response = await fetch(src, { mode: 'cors' });
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const mimeType = base64.match(/data:(image\/[a-zA-Z0-9-.+]+);base64,/)?.[1] || blob.type;
          resolve({ base64, mimeType });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Error processing image:", err);
      throw new Error(err instanceof Error ? err.message : "Не удалось загрузить изображение вещи.");
    }
  };

  const pushHistory = (model: ModelMode, image: string) => {
    setHistory((prev) => {
      const next = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          model,
          image,
          clothingName: selectedClothing?.name || 'Look',
          productUrl: selectedClothing?.productUrl,
          createdAt: Date.now(),
        },
        ...prev,
      ].slice(0, MAX_HISTORY_ITEMS);
      return next;
    });
  };

  const handleTryOn = async () => {
    if (!selectedClothing || !userImageData) {
      setError("Выберите вещь и загрузите фото");
      return;
    }

    setPreviewHistoryId(null);
    setCurrentResultImage(null);
    setIsLoadingPro(true);
    setError(null);
    setErrorPro(null);
    setAnalysisHint(null);
    
    try {
      const normalizedApiKey = apiKey.trim();
      if (!normalizedApiKey) {
        throw new Error('Введите Gemini API key: он нужен для обязательной проверки фото перед генерацией.');
      }

      // STEP 1: Validate user photo + detect pose for view matching
      let analysis: Awaited<ReturnType<typeof analyzeUserPhoto>> = {
        isValid: true,
        message: '',
        pose: 'front',
        bodyCoverage: 'two_thirds',
      };
      analysis = await analyzeUserPhoto(userImageData.base64, userImageData.mimeType, normalizedApiKey);
      if (!analysis.isValid) {
        throw new Error(
          analysis.message || "Фотография не подходит. Пожалуйста, загрузите фото человека во весь рост."
        );
      }
      if (analysis.bodyCoverage === 'portrait') {
        throw new Error('Слишком крупный портрет. Нужен кадр минимум от колен и выше.');
      }

      const selectedVariant = pickVariantForPose(selectedClothing, analysis.pose);
      const isLongSelectedGarment = isLongGarment(selectedClothing);
      const shouldForceTallCanvas = shouldOutpaintBottom(selectedClothing);

      // STEP 2: Generate Try-On
      const clothingImageData = await processImageSource(selectedVariant.imageSrc);
      const fitContext = {
        userPose: analysis.pose,
        clothingView: selectedVariant.view,
        bodyCoverage: analysis.bodyCoverage,
        clothingName: selectedClothing.name,
        clothingFitHint: selectedClothing.fitHint,
        clothingLengthHint: selectedClothing.lengthHint,
        designNotes: selectedClothing.designNotes,
        isLongGarment: isLongSelectedGarment,
        forceTallCanvas: shouldForceTallCanvas,
      };

      const runGeminiTryOn = async (): Promise<string> => {
        const baseTryOn = await generateVirtualTryOnImage(
          userImageData,
          clothingImageData,
          normalizedApiKey,
          'pro',
          {
            ...fitContext,
            forceTallCanvas: false,
            generationStage: 'fit',
          }
        );

        if (!shouldForceTallCanvas) {
          return baseTryOn;
        }

        const extendedBaseTryOn = await extendImageDownwardForOutpaint({
          base64: baseTryOn,
          mimeType: getDataUrlMimeType(baseTryOn, 'image/jpeg'),
        });

        const outpaintedBottom = await generateVirtualTryOnImage(
          extendedBaseTryOn,
          clothingImageData,
          normalizedApiKey,
          'pro',
          {
            ...fitContext,
            forceTallCanvas: true,
            generationStage: 'outpaint_bottom',
          }
        );

        return lockUpperAreaFromSource(baseTryOn, outpaintedBottom);
      };

      const image = await runGeminiTryOn();
      setGeneratedImagePro(image);
      setCurrentResultImage(image);
      setPreviewHistoryId(null);
      pushHistory('pro', image);

    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Ошибка генерации";
      setError(message);
      setErrorPro(message);
    } finally {
      setIsLoadingPro(false);
    }
  };

  const isLoading = isLoadingPro;
  const previewHistoryItem = previewHistoryId ? history.find((entry) => entry.id === previewHistoryId) || null : null;
  const activeResultImage = previewHistoryItem?.image || currentResultImage;
  const activeModel = previewHistoryItem?.model || selectedModel;
  const activeResultModelLabel =
    activeModel === 'pro'
      ? 'Nano Banana Pro'
      : activeModel === 'flash'
        ? 'Flash Image'
        : activeModel === 'qwen'
          ? 'Qwen Image Edit'
          : activeModel === 'seedream'
            ? 'Seedream 4.0'
          : '';
  const activeBuyUrl = previewHistoryItem
    ? previewHistoryItem.productUrl
    : selectedClothing?.productUrl;
  const isButtonDisabled =
    !selectedClothing ||
    !userImageData ||
    isLoading ||
    isUploadChecking ||
    !apiKey.trim();

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white flex flex-col">
      <Header />
      
      <main className="container mx-auto px-4 pt-4 pb-6 max-w-4xl flex-grow flex flex-col">
        {/* SECTION 1: GALLERY */}
        <div className="mb-6">
              <ClothingGallery 
                items={clothingItems} 
                selectedItem={selectedClothing} 
                onSelectItem={(item) => {
                  setSelectedClothing(item);
                  setCurrentResultImage(null);
                  setPreviewHistoryId(null);
                  setError(null);
                }}
                onItemInvalidated={handleInvalidatedItem}
              />
        </div>

        <div className="mb-4">
          <label htmlFor="gemini-api-key-input" className="block text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
            Введите код (Gemini API key)
          </label>
          <div className="flex gap-2">
            <input
              id="gemini-api-key-input"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="AIza..."
              spellCheck={false}
              autoComplete="off"
              className="flex-1 w-full border border-gray-300 px-4 py-3 text-xs font-mono tracking-wide bg-white focus:outline-none focus:border-black"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((current) => !current)}
              className="px-4 border border-gray-300 text-[10px] uppercase tracking-[0.12em] font-bold hover:border-black transition-colors"
            >
              {showApiKey ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.1em] text-gray-400">
            Ключ сохраняется локально в браузере на этом устройстве.
          </div>
        </div>

        {/* SECTION 2: WORKSTATION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 items-start">
          {/* Left: User Upload */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-gray-500 mb-2">Ваше фото</div>
            <div className="relative max-w-[380px] mx-auto aspect-[3/4]">
              <button
                onClick={() => setIsInfoModalOpen(true)}
                className="absolute top-2 right-2 z-10 p-1.5 bg-white/80 rounded-full hover:bg-black hover:text-white transition-colors text-gray-500 shadow-sm"
                title="Требования к фото"
              >
                <InfoIcon className="w-4 h-4" />
              </button>
              <ImageUploader onImageUpload={handleUserImageUpload} userImage={userImageData?.base64 || null} />
            </div>
            {history.length > 0 && (
              <div className="max-w-[380px] mx-auto mt-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-gray-500 mb-2">Предыдущие генерации</div>
                <div className="grid grid-cols-4 gap-2 max-h-[190px] overflow-y-auto pr-1">
                  {history.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setPreviewHistoryId(entry.id);
                        setCurrentResultImage(null);
                        setError(null);
                      }}
                      className={`relative aspect-[3/4] border transition-colors ${
                        previewHistoryId === entry.id ? 'border-black' : 'border-gray-200 hover:border-gray-400'
                      }`}
                      title={`${entry.clothingName} • ${
                        entry.model === 'pro'
                          ? 'Nano Banana Pro'
                          : entry.model === 'flash'
                            ? 'Flash Image'
                            : entry.model === 'qwen'
                              ? 'Qwen Image Edit'
                              : 'Seedream 4.0'
                      }`}
                    >
                      <img src={entry.image} alt={entry.clothingName} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Result */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
                {activeResultModelLabel || 'Результат'}
              </div>
            </div>
            <div className="max-w-[380px] mx-auto">
              <ResultDisplay 
                generatedImage={activeResultImage}
                isLoading={isLoadingPro}
                error={errorPro}
                buyUrl={activeBuyUrl}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-3 text-[10px] uppercase tracking-[0.12em] text-red-500">
            {error}
          </div>
        )}
        {/* SECTION 3: BUTTON */}
        <div className="mt-auto">
             <button
                onClick={handleTryOn}
                disabled={isButtonDisabled}
                className={`w-full py-5 text-sm font-bold uppercase tracking-[0.25em] transition-all border border-black
                ${isButtonDisabled 
                    ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed' 
                    : 'bg-black text-white hover:bg-gray-900 shadow-lg'}`}
            >
                {isUploadChecking || isLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    {isUploadChecking ? 'Проверяем фото...' : 'Анализ фото и генерация...'}
                  </span>
                ) : (
                  'Примерить образ'
                )}
            </button>
        </div>
      </main>

      {/* Info Modal */}
      {isInfoModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-8 relative shadow-2xl animate-fade-in">
            <button 
              onClick={() => setIsInfoModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-black transition-colors"
            >
              <CloseIcon className="w-6 h-6" />
            </button>

            <div className="text-center mb-6">
              <InfoIcon className="w-8 h-8 mx-auto mb-4 text-black" />
              <h2 className="text-lg font-bold uppercase tracking-widest">Инструкция</h2>
            </div>

            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <p>Для идеального результата виртуальной примерки следуйте этим правилам:</p>
              
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-black">Полный рост:</strong> Фотография должна захватывать вас целиком или хотя бы от колен и выше.
                </li>
                <li>
                  <strong className="text-black">Хороший свет:</strong> Избегайте слишком темных фото или резких теней на теле.
                </li>
                <li>
                  <strong className="text-black">Поза:</strong> Встаньте прямо или в естественную позу, не перекрывайте тело руками слишком сильно.
                </li>
                <li>
                  <strong className="text-black">Фильтр:</strong> Система автоматически проверит фото. Если на нем нет человека во весь рост, примерка не начнется.
                </li>
              </ul>
              
              <p className="text-xs text-gray-400 mt-6 border-t pt-4">
                * Искусственный интеллект старается сохранить вашу позу и освещение, меняя только одежду.
              </p>
            </div>

            <button 
              onClick={() => setIsInfoModalOpen(false)}
              className="w-full mt-8 bg-black text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-900 transition-colors"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
  };

export default App;
