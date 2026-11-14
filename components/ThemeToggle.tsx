import React, { useState, useEffect } from 'react';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';

const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      if (theme) {
        return theme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };
  
  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      aria-label="Toggle theme"
    >
      <SunIcon className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <MoonIcon className="absolute top-2 left-2 h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};

export default ThemeToggle;
