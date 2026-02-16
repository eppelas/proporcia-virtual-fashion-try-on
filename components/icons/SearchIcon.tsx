import React from 'react';

const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="11" cy="11" r="7" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M20 20L17 17" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export default SearchIcon;
