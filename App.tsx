import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import ClothingGallery from './components/ClothingGallery';
import ImageUploader from './components/ImageUploader';
import ResultDisplay from './components/ResultDisplay';
import InfoIcon from './components/icons/InfoIcon';
import CloseIcon from './components/icons/CloseIcon';
import { CLOTHING_DB } from './data/clothingDb';
import type { ClothingItem } from './types';
import { generateVirtualTryOnImage, validateUserImage } from './services/geminiService';

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

const App: React.FC = () => {
  const [clothingItems, setClothingItems] = useState<ClothingItem[]>(CLOTHING_DB);
  
  const [selectedClothing, setSelectedClothing] = useState<ClothingItem | null>(null);
  const [userImageData, setUserImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('GEMINI_API_KEY') || '';
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (apiKey.trim()) {
      window.localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
      return;
    }
    window.localStorage.removeItem('GEMINI_API_KEY');
  }, [apiKey]);

  const loadImageElement = (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      image.src = base64;
    });
  };

  const validateUploadedPhotoLocally = async (
    base64: string
  ): Promise<{ isValid: boolean; message?: string }> => {
    const image = await loadImageElement(base64);
    const detectorCtor = window.FaceDetector;
    if (!detectorCtor) {
      return {
        isValid: false,
        message:
          'Ваш браузер не поддерживает автоматическую проверку фото. Откройте приложение в Chrome.',
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
    setError(null);
    try {
      const localValidation = await validateUploadedPhotoLocally(fileData.base64);
      if (!localValidation.isValid) {
        setUserImageData(null);
        setGeneratedImage(null);
        setError(localValidation.message || 'Фото не подходит для примерки.');
        return;
      }
      setUserImageData(fileData);
    } catch (validationError) {
      setUserImageData(null);
      setGeneratedImage(null);
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'Не удалось проверить изображение.'
      );
    }
  };

  const handleItemUpdate = (id: number, newSrc: string) => {
    setClothingItems(prevItems => 
      prevItems.map(item => 
        item.id === id ? { ...item, imageSrc: newSrc } : item
      )
    );
    const updatedItem = clothingItems.find(i => i.id === id);
    if (updatedItem) {
       setSelectedClothing({ ...updatedItem, imageSrc: newSrc });
    }
  };

  const handleInvalidatedItem = (id: number) => {
    if (selectedClothing?.id === id) {
      setSelectedClothing(null);
      setError('Выбранная карточка look недоступна. Выберите другой look или загрузите свою вещь.');
    }
  };

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

  const handleTryOn = async () => {
    if (!selectedClothing || !userImageData) {
      setError("Выберите вещь и загрузите фото");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null); // Clear previous result
    
    try {
      const normalizedApiKey = apiKey.trim();
      if (!normalizedApiKey) {
        throw new Error('Введите Gemini API key в поле выше.');
      }

      // STEP 1: Validate User Image using AI
      // We check if it's a full body shot suitable for try-on
      const validation = await validateUserImage(
        userImageData.base64,
        userImageData.mimeType,
        normalizedApiKey
      );
      
      if (!validation.isValid) {
        throw new Error(validation.message || "Фотография не подходит. Пожалуйста, загрузите фото человека во весь рост.");
      }

      // STEP 2: Generate Try-On
      const clothingImageData = await processImageSource(selectedClothing.imageSrc);
      const resultImage = await generateVirtualTryOnImage(
        userImageData,
        clothingImageData,
        normalizedApiKey
      );
      setGeneratedImage(resultImage);

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setIsLoading(false);
    }
  };

  const isButtonDisabled = !selectedClothing || !userImageData || !apiKey.trim() || isLoading;

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white flex flex-col">
      <Header />
      
      <main className="container mx-auto px-4 pt-4 pb-6 max-w-4xl flex-grow flex flex-col">
        {/* SECTION 1: GALLERY */}
        <div className="mb-6">
             <ClothingGallery 
                items={clothingItems} 
                selectedItem={selectedClothing} 
                onSelectItem={setSelectedClothing}
                onUpdateItem={handleItemUpdate}
                onItemInvalidated={handleInvalidatedItem}
              />
        </div>

        {/* SECTION 2: WORKSTATION */}
        <div className="flex flex-row gap-4 h-[600px] mb-4">
            {/* Left: User Upload */}
            <div className="flex-1 h-full relative">
                {/* Instructions Button */}
                <button 
                  onClick={() => setIsInfoModalOpen(true)}
                  className="absolute top-2 right-2 z-10 p-1.5 bg-white/80 rounded-full hover:bg-black hover:text-white transition-colors text-gray-500 shadow-sm"
                  title="Требования к фото"
                >
                  <InfoIcon className="w-4 h-4" />
                </button>

                <ImageUploader 
                    onImageUpload={handleUserImageUpload}
                    userImage={userImageData?.base64 || null}
                />
            </div>

            {/* Right: Result */}
            <div className="flex-1 h-full">
                <ResultDisplay 
                    generatedImage={generatedImage}
                    isLoading={isLoading}
                    error={error}
                />
            </div>
        </div>

        <div className="mb-4">
          <label htmlFor="api-key-input" className="block text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
            Введите код (Gemini API key)
          </label>
          <div className="flex gap-2">
            <input
              id="api-key-input"
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
        </div>

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
                {isLoading ? 'Анализ фото и генерация...' : 'Примерить образ'}
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
