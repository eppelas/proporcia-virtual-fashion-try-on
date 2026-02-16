import React, { useRef } from 'react';
import UploadIcon from './icons/UploadIcon';
import { readUploadImageFile } from '../utils/imageFile';

interface ImageUploaderProps {
  onImageUpload: (fileData: { base64: string; mimeType: string }) => void;
  userImage: string | null;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, userImage }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const imageData = await readUploadImageFile(file);
        onImageUpload(imageData);
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : 'Не удалось загрузить изображение.'
        );
      }
    }
  };

  return (
    <div className="w-full h-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/png, image/jpeg, image/webp, image/heic, image/heif, .heic, .heif"
      />
      
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`relative w-full h-full bg-gray-50 cursor-pointer overflow-hidden border border-transparent hover:border-gray-200 transition-colors
            ${!userImage ? 'flex flex-col items-center justify-center' : ''}
        `}
      >
        {userImage ? (
          <>
            <img src={userImage} alt="Preview" className="h-full w-full object-cover" />
            <div className="absolute bottom-0 w-full bg-white/90 py-2 text-center opacity-0 hover:opacity-100 transition-opacity">
                 <span className="text-[9px] uppercase font-bold tracking-widest">Изменить фото</span>
            </div>
          </>
        ) : (
          <>
            <UploadIcon className="h-4 w-4 text-gray-400 mb-2" />
            <p className="text-[9px] uppercase tracking-widest text-black font-bold">Ваше фото</p>
          </>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;
