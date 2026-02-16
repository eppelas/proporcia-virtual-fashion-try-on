import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="container mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-center">
        <a
          href="https://www.proporcia.store/"
          target="_blank"
          rel="noreferrer"
          className="text-2xl md:text-3xl font-bold tracking-tight uppercase hover:opacity-70 transition-opacity"
        >
          PROPORCIA
        </a>
      </div>
    </header>
  );
};

export default Header;
