
import React, { useState } from 'react';
import type { Tab } from './types';
import TabButton from './components/TabButton';
import NarrationGenerator from './components/NarrationGenerator';
import ThumbnailGenerator from './components/BatchImageGenerator';
import ImageToVideoGenerator from './components/ImageToVideoGenerator';
import VideoToThumbnailGenerator from './components/VideoToThumbnailGenerator';
import { TextIcon } from './components/icons/TextIcon';
import { ImageIcon } from './components/icons/ImageIcon';
import { FilmIcon } from './components/icons/FilmIcon';
import ThemeToggle from './components/ThemeToggle';
import { MoonIcon } from './components/icons/MoonIcon';
import { MenuIcon } from './components/icons/MenuIcon';
import AudioGenerator from './components/AudioGenerator';

const SoundWaveIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10v4" />
        <path d="M6 7v10" />
        <path d="M10 4v16" />
        <path d="M14 7v10" />
        <path d="M18 10v4" />
    </svg>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('narasi');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
       <header className="w-full bg-card p-4 flex items-center justify-between border-b border-border sticky top-0 z-30">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
                <div className="bg-primary p-2 rounded-lg">
                    <MoonIcon className="text-primary-foreground h-6 w-6"/>
                </div>
                <h1 className="text-xl font-bold">Content Studio</h1>
            </div>
            <nav className="hidden md:flex gap-2">
              <TabButton
                label="Generate Narasi"
                icon={<TextIcon />}
                isActive={activeTab === 'narasi'}
                onClick={() => handleTabClick('narasi')}
              />
              <TabButton
                label="Generate Thumbnail"
                icon={<ImageIcon />}
                isActive={activeTab === 'gambar'}
                onClick={() => handleTabClick('gambar')}
              />
               <TabButton
                label="Thumbnail from Video"
                icon={<FilmIcon />}
                isActive={activeTab === 'video-thumbnail'}
                onClick={() => handleTabClick('video-thumbnail')}
              />
               <TabButton
                label="Text to Speech"
                icon={<SoundWaveIcon />}
                isActive={activeTab === 'audio'}
                onClick={() => handleTabClick('audio')}
              />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button 
              className="md:hidden p-2 rounded-md hover:bg-secondary"
              onClick={() => setIsMobileMenuOpen(prev => !prev)}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              <MenuIcon className="h-6 w-6" />
            </button>
          </div>
        </header>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-card border-b border-border shadow-md sticky top-[73px] z-20">
            <nav className="flex flex-col gap-1 p-2">
              <TabButton
                label="Generate Narasi"
                icon={<TextIcon />}
                isActive={activeTab === 'narasi'}
                onClick={() => handleTabClick('narasi')}
              />
              <TabButton
                label="Generate Thumbnail"
                icon={<ImageIcon />}
                isActive={activeTab === 'gambar'}
                onClick={() => handleTabClick('gambar')}
              />
               <TabButton
                label="Thumbnail from Video"
                icon={<FilmIcon />}
                isActive={activeTab === 'video-thumbnail'}
                onClick={() => handleTabClick('video-thumbnail')}
              />
               <TabButton
                label="Text to Speech"
                icon={<SoundWaveIcon />}
                isActive={activeTab === 'audio'}
                onClick={() => handleTabClick('audio')}
              />
            </nav>
          </div>
        )}


      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div style={{ display: activeTab === 'narasi' ? 'block' : 'none' }}>
          <NarrationGenerator />
        </div>
        <div style={{ display: activeTab === 'gambar' ? 'block' : 'none' }}>
          <ThumbnailGenerator />
        </div>
        <div style={{ display: activeTab === 'video-thumbnail' ? 'block' : 'none' }}>
            <VideoToThumbnailGenerator />
        </div>
        <div style={{ display: activeTab === 'audio' ? 'block' : 'none' }}>
          <AudioGenerator />
        </div>
      </main>
    </div>
  );
};

export default App;
