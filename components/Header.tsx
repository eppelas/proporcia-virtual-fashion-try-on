import React from 'react';
import MenuIcon from './icons/MenuIcon';
import SearchIcon from './icons/SearchIcon';
import HeartIcon from './icons/HeartIcon';
import BagIcon from './icons/BagIcon';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="container mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
        
        {/* Left: Menu */}
        <div className="flex items-center w-1/4">
          <button className="p-2 -ml-2 hover:opacity-60 transition-opacity">
            <MenuIcon className="w-6 h-6 stroke-1" />
          </button>
        </div>

        {/* Center: Logo */}
        <div className="flex justify-center w-2/4">
           <a href="/" className="text-2xl md:text-3xl font-bold tracking-tight uppercase">
             PROPORCIA
           </a>
        </div>

        {/* Right: Icons */}
        <div className="flex items-center justify-end gap-4 w-1/4">
           <button className="hidden md:block p-1 hover:opacity-60 transition-opacity">
             <SearchIcon className="w-5 h-5 stroke-1" />
           </button>
           <button className="hidden md:block p-1 hover:opacity-60 transition-opacity">
             <HeartIcon className="w-5 h-5 stroke-1" />
           </button>
           <button className="p-1 hover:opacity-60 transition-opacity">
             <BagIcon className="w-5 h-5 stroke-1" />
           </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
