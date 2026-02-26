import React, { useState } from 'react';
import type { ClothingItem } from '../types';

interface ClothingGalleryProps {
  items: ClothingItem[];
  selectedItem: ClothingItem | null;
  onSelectItem: (item: ClothingItem) => void;
  onItemInvalidated?: (id: number) => void;
}

const ITEMS_PER_PAGE = 8; // Show all available preset items (2 rows of 4)

const ClothingGallery: React.FC<ClothingGalleryProps> = ({ 
  items, 
  selectedItem, 
  onSelectItem,
  onItemInvalidated
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

  const currentItems = items.slice(
    currentPage * ITEMS_PER_PAGE, 
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const handleNext = () => {
    if (currentPage < totalPages - 1) setCurrentPage(p => p + 1);
  };

  const handlePrev = () => {
    if (currentPage > 0) setCurrentPage(p => p - 1);
  };

  const handleImageError = (id: number) => {
    setBrokenImages(prev => ({ ...prev, [id]: true }));
    onItemInvalidated?.(id);
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Коллекция</h3>
        
        {totalPages > 1 && (
            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                <button 
                    onClick={handlePrev} 
                    disabled={currentPage === 0}
                    className={`hover:text-black transition-colors ${currentPage === 0 ? 'text-gray-200' : 'text-gray-500'}`}
                >
                    Prev
                </button>
                <span className="text-gray-200">|</span>
                <button 
                    onClick={handleNext}
                    disabled={currentPage === totalPages - 1}
                    className={`hover:text-black transition-colors ${currentPage === totalPages - 1 ? 'text-gray-200' : 'text-gray-500'}`}
                >
                    Next
                </button>
            </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-8">
        {currentItems.map((item) => {
          const isBroken = brokenImages[item.id];
          const hasImage = item.imageSrc && item.imageSrc.length > 0;
          
          return (
            <div
              key={item.id}
              onClick={() => {
                if (!isBroken && hasImage) {
                  onSelectItem(item);
                }
              }}
              className="group cursor-pointer flex flex-col"
            >
              <div className={`relative aspect-[3/4] w-full overflow-hidden bg-gray-50 mb-3
                 ${selectedItem?.id === item.id ? 'ring-1 ring-black p-[2px]' : ''}
                 hover:shadow-sm transition-shadow
              `}>
                {!isBroken ? (
                        <>
                            <img 
                                src={item.imageSrc} 
                                alt={item.name} 
                                onError={() => handleImageError(item.id)}
                                className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105
                                ${selectedItem?.id === item.id ? 'opacity-100' : 'opacity-95'}
                                `} 
                            />
                        </>
                    ) : (
                         <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 text-[10px] text-center p-2 overflow-hidden break-all">
                             <span className="mb-2 font-bold text-red-300">URL ERROR</span>
                             <span className="text-[8px] opacity-50 leading-tight line-clamp-4">{item.imageSrc}</span>
                         </div>
                    )
                }

                 {selectedItem?.id === item.id && !isBroken && hasImage && (
                   <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-black rounded-full" />
                 )}
              </div>

              <div className="text-center">
                <p className={`text-[10px] uppercase tracking-wider transition-colors truncate px-2
                    ${selectedItem?.id === item.id ? 'text-black font-bold' : 'text-gray-500 group-hover:text-black'}
                `}>
                  {item.name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClothingGallery;
