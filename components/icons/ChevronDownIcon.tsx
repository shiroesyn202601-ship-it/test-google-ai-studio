import React from 'react';

interface ChevronDownIconProps {
  isExpanded: boolean;
}

export const ChevronDownIcon: React.FC<ChevronDownIconProps> = ({ isExpanded }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
    >
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);
