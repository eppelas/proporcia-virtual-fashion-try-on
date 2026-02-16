import React, { useState } from 'react';
import SpinnerIcon from './icons/SpinnerIcon';
import DownloadIcon from './icons/DownloadIcon';
import MaximizeIcon from './icons/MaximizeIcon';
import CloseIcon from './icons/CloseIcon';

interface ResultDisplayProps {
  generatedImage: string | null;
  isLoading: boolean;
  error: string | null;
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ generatedImage, isLoading, error }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = 'proporcia-try-on.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const toggleModal = () => {
    if (generatedImage) {
      setIsModalOpen(!isModalOpen);
    }
  };

  return (
    <>
      <div 
        className="w-full h-full bg-gray-50 flex items-center justify-center overflow-hidden border border-transparent relative group"
      >
          {isLoading && (
            <div className="flex flex-col items-center animate-pulse">
              <SpinnerIcon className="h-4 w-4 text-black mb-2 animate-spin" />
              <p className="text-[9px] uppercase tracking-widest text-black">AI Processing</p>
            </div>
          )}
          
          {error && !isLoading && (
            <div className="p-4 text-center max-w-[150px]">
              <p className="text-[9px] text-red-500 uppercase tracking-widest leading-relaxed">{error}</p>
            </div>
          )}

          {generatedImage ? (
             <div className="relative w-full h-full">
                <img 
                  src={generatedImage} 
                  alt="Result" 
                  className="h-full w-full object-cover cursor-pointer"
                  onClick={toggleModal}
                />
                
                {/* Floating Actions */}
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button 
                      onClick={handleDownload}
                      className="bg-white/90 hover:bg-white text-black p-2 rounded-full shadow-sm transition-colors"
                      title="Скачать"
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={toggleModal}
                      className="bg-white/90 hover:bg-white text-black p-2 rounded-full shadow-sm transition-colors"
                      title="Развернуть"
                    >
                      <MaximizeIcon className="w-4 h-4" />
                    </button>
                </div>
             </div>
          ) : (
              !isLoading && !error && (
                  <p className="text-[9px] uppercase tracking-widest text-gray-300">Результат</p>
              )
          )}
      </div>

      {/* Full Screen Modal */}
      {isModalOpen && generatedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <button 
            onClick={toggleModal}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <CloseIcon className="w-8 h-8" />
          </button>
          
          <img 
            src={generatedImage} 
            alt="Full Result" 
            className="max-h-full max-w-full object-contain shadow-2xl" 
          />
          
          <button 
            onClick={handleDownload}
            className="absolute bottom-8 bg-white text-black px-6 py-3 rounded-full font-bold uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-gray-200 transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            Скачать
          </button>
        </div>
      )}
    </>
  );
};

export default ResultDisplay;
