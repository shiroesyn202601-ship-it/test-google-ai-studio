export type Tab = 'narasi' | 'gambar' | 'video' | 'video-thumbnail' | 'audio';

export interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  error?: string;
}

export interface SceneTimeline {
  timeline: string;
  adegan: string;
  narasiAdegan: string;
  promptGambar: string;
  promptVideo: string;
  imageUrl?: string;
}

export type TimelineItemState = SceneTimeline & {
    isGenerating?: boolean;
    generationError?: string | null;
    isGeneratingThumbnail?: boolean;
};

export interface ViralIdea {
  nomor: number;
  judul: string;
  deskripsi: string;
  narasi?: string;
  timeline?: TimelineItemState[];
  hookText?: string;
  isGeneratingStory?: boolean;
  sudahRelease?: boolean;
  lastUsedPromptTemplate?: 'fakta' | 'tragedi' | 'custom' | 'kisah-hidup';
  lastUsedPromptDuration?: number;
  customPrompt?: string;
  isGeneratingAudio?: boolean;
  audioUrl?: string;
  audioError?: string;
}

export interface ImageForVideo {
  imageUrl: string;
  promptVideo: string;
  adegan: string;
  timeline: string;
}
