
import React from 'react';

interface TabButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, icon, isActive, onClick }) => {
  const baseClasses = "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card focus:ring-primary";
  const activeClasses = "bg-primary text-primary-foreground shadow-lg";
  const inactiveClasses = "text-muted-foreground hover:bg-secondary hover:text-foreground";

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default TabButton;