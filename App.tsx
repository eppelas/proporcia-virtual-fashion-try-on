import React, { useState } from 'react';
import Header from './components/Header';
import ClothingGallery from './components/ClothingGallery';
import ImageUploader from './components/ImageUploader';
import ResultDisplay from './components/ResultDisplay';
import InfoIcon from './components/icons/InfoIcon';
import CloseIcon from './components/icons/CloseIcon';
import { CLOTHING_DB } from './data/clothingDb';
import type { ClothingItem } from './types';
import { generateVirtualTryOnImage, validateUserImage } from './services/geminiService';

// Add type definition for window.aistudio
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
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
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(
    Boolean(process.env.API_KEY) || (typeof window !== 'undefined' && Boolean(window.localStorage.getItem('GEMINI_API_KEY')))
  );

  const resolveApiKey = (): string => {
    if (process.env.API_KEY) return process.env.API_KEY;
    if (typeof window === 'undefined') {
      throw new Error('API key unavailable in this environment');
    }

    const existing = window.localStorage.getItem('GEMINI_API_KEY');
    if (existing) return existing;

    const entered = window.prompt('Введите GEMINI_API_KEY для текущего браузера. Ключ сохранится только локально.');
    if (!entered || !entered.trim()) {
      throw new Error('API key не указан. Добавьте ключ и повторите попытку.');
    }

    const normalized = entered.trim();
    window.localStorage.setItem('GEMINI_API_KEY', normalized);
    setApiKeyConfigured(true);
    return normalized;
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

    // MANDATORY: Check for API Key selection in AI Studio bridge (if available)
    if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
            await window.aistudio.openSelectKey();
            const hasKeyAfter = await window.aistudio.hasSelectedApiKey();
            if(!hasKeyAfter) {
                setError("Необходимо выбрать API ключ для использования Nano Banana Pro");
                return;
            }
        }
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null); // Clear previous result
    
    try {
      const apiKey = resolveApiKey();

      // STEP 1: Validate User Image using AI
      // We check if it's a full body shot suitable for try-on
      const validation = await validateUserImage(userImageData.base64, userImageData.mimeType, apiKey);
      
      if (!validation.isValid) {
        throw new Error(validation.message || "Фотография не подходит. Пожалуйста, загрузите фото человека во весь рост.");
      }

      // STEP 2: Generate Try-On
      const clothingImageData = await processImageSource(selectedClothing.imageSrc);
      const resultImage = await generateVirtualTryOnImage(userImageData, clothingImageData, apiKey);
      setGeneratedImage(resultImage);

    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.message.includes("Requested entity was not found")) {
         if (window.aistudio) {
             await window.aistudio.openSelectKey();
         }
         setError("Пожалуйста, выберите корректный API ключ.");
      } else {
         setError(e instanceof Error ? e.message : "Ошибка генерации");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isButtonDisabled = !selectedClothing || !userImageData || isLoading;

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white flex flex-col">
      <Header />
      
      <main className="container mx-auto px-4 pt-4 pb-6 max-w-4xl flex-grow flex flex-col">
        {!apiKeyConfigured && (
          <div className="mb-4 border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-xs">
            API key не задан в build. При первом запуске примерки приложение запросит GEMINI_API_KEY и сохранит его в этом браузере.
          </div>
        )}
        
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
                    onImageUpload={setUserImageData}
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
