import React from 'react';

const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
    <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3" y1="6" x2="21" y2="6" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3" y1="18" x2="21" y2="18" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export default MenuIcon;
