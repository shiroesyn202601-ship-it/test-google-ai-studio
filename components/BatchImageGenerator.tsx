
import React, { useState, useCallback, useEffect } from 'react';
import { cleanImageAndAddText, generateHookText } from '../services/geminiService';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { UploadIcon } from './icons/UploadIcon';

type HookInputMode = 'manual' | 'auto';
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

const ASPECT_RATIOS: { label: string; value: AspectRatio }[] = [
    { label: 'YouTube (16:9)', value: '16:9' },
    { label: 'Shorts (9:16)', value: '9:16' },
    { label: 'Square (1:1)', value: '1:1' },
    { label: 'Portrait (4:5)', value: '4:5' }
];


const ThumbnailGenerator: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [hookText, setHookText] = useState<string>('');
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [hookInputMode, setHookInputMode] = useState<HookInputMode>('manual');
  const [narrationText, setNarrationText] = useState<string>('');
  const [isGeneratingHook, setIsGeneratingHook] = useState<boolean>(false);
  const [stylePreference, setStylePreference] = useState<string>('');

  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);

  const processFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImageBase64(base64String);
        setPreviewUrl(URL.createObjectURL(file));
        setError('');
        setGeneratedUrls([]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
              const file = items[i].getAsFile();
              if (file) {
                  processFile(file);
              }
              event.preventDefault();
              return;
          }
      }
  }, []);

  const handleGenerateHook = useCallback(async () => {
    if (!narrationText.trim()) {
        setError('Silakan masukkan narasi untuk membuat hook.');
        return;
    }
    setIsGeneratingHook(true);
    setError('');
    try {
        const generated = await generateHookText(narrationText);
        setHookText(generated);
    } catch (err: any) {
        setError(err.message || 'Gagal membuat teks hook.');
    } finally {
        setIsGeneratingHook(false);
    }
  }, [narrationText]);

  const handleGenerate = useCallback(async () => {
    if (!imageFile || !hookText.trim()) {
      setError('Silakan unggah gambar dan masukkan teks hook.');
      return;
    }
    setIsLoading(true);
    setError('');
    setGeneratedUrls([]);

    try {
      const resultUrls = await cleanImageAndAddText(imageBase64, imageFile.type, hookText, aspectRatio, stylePreference);
      setGeneratedUrls(resultUrls);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat membuat thumbnail.');
    } finally {
      setIsLoading(false);
    }
  }, [imageFile, imageBase64, hookText, aspectRatio, stylePreference]);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
  };

  const goToNextImage = useCallback(() => {
    if (!generatedUrls.length) return;
    setLightboxIndex((prevIndex) => (prevIndex + 1) % generatedUrls.length);
  }, [generatedUrls.length]);

  const goToPrevImage = useCallback(() => {
    if (!generatedUrls.length) return;
    setLightboxIndex((prevIndex) => (prevIndex - 1 + generatedUrls.length) % generatedUrls.length);
  }, [generatedUrls.length]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      if (e.key === 'ArrowRight') {
        goToNextImage();
      } else if (e.key === 'ArrowLeft') {
        goToPrevImage();
      } else if (e.key === 'Escape') {
        closeLightbox();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLightboxOpen, goToNextImage, goToPrevImage]);

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <div className="p-1 bg-gradient-to-r from-primary to-blue-400 rounded-xl">
          <div className="bg-card p-6 rounded-lg">
            <h2 className="text-3xl font-bold mb-2">Generate Thumbnail</h2>
            <p className="text-muted-foreground">Unggah, tempel, atau edit screenshot. Hapus subtitle, ubah rasio, dan tambahkan teks hook yang menarik.</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Input Column */}
          <div className="flex flex-col gap-6">
            <div>
              <label className="text-sm font-medium mb-2 block">1. Unggah atau Tempel Screenshot</label>
              <div 
                className="w-full aspect-video bg-secondary border-2 border-dashed border-border rounded-lg flex items-center justify-center relative focus-within:ring-2 focus-within:ring-primary"
                onPaste={handlePaste}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isLoading}
                  aria-label="Unggah Gambar"
                />
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain rounded-lg p-2" />
                ) : (
                  <div className="text-center text-muted-foreground pointer-events-none">
                    <UploadIcon />
                    <p>Klik, seret, atau <span className="font-semibold text-primary">tempel (paste)</span> gambar</p>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">2. Pilih Rasio Aspek</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ASPECT_RATIOS.map(ratio => (
                      <button 
                          key={ratio.value} 
                          onClick={() => setAspectRatio(ratio.value)}
                          disabled={isLoading}
                          className={`py-2 px-3 text-sm font-semibold rounded-lg transition-colors duration-200 border-2 ${aspectRatio === ratio.value ? 'bg-primary border-primary/80 text-primary-foreground' : 'bg-secondary border-border text-muted-foreground hover:border-primary'}`}
                      >
                          {ratio.label}
                      </button>
                  ))}
              </div>
            </div>

            <div>
               <label className="text-sm font-medium mb-2 block">3. Tentukan Teks Hook</label>
               <div className="flex bg-secondary border border-border rounded-lg p-1 mb-3">
                  <button onClick={() => setHookInputMode('manual')} disabled={isLoading} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors ${hookInputMode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Tulis Manual</button>
                  <button onClick={() => setHookInputMode('auto')} disabled={isLoading} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors ${hookInputMode === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Generate dari Narasi</button>
               </div>
               
               {hookInputMode === 'auto' && (
                  <div className="flex flex-col gap-2 mb-3">
                      <textarea
                        value={narrationText}
                        onChange={(e) => setNarrationText(e.target.value)}
                        placeholder="Tempelkan (paste) narasi cerita lengkap di sini, lalu klik 'Generate Hook'."
                        className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
                        rows={5}
                        disabled={isLoading || isGeneratingHook}
                      />
                      <button onClick={handleGenerateHook} disabled={isLoading || isGeneratingHook || !narrationText.trim()} className="flex items-center justify-center gap-2 bg-primary/90 text-primary-foreground font-semibold py-2 px-4 rounded-lg hover:bg-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors">
                          {isGeneratingHook ? <><Spinner size="4" className="text-white"/> Generating...</> : 'Generate Hook'}
                      </button>
                  </div>
               )}

                <textarea
                    id="hook-text"
                    value={hookText}
                    onChange={(e) => setHookText(e.target.value)}
                    placeholder={hookInputMode === 'manual' ? "Contoh: FAKTA TERSEMBUNYI PIRAMIDA..." : "Teks hook hasil generate akan muncul di sini..."}
                    className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
                    rows={3}
                    disabled={isLoading}
                />
            </div>
            
            <div>
              <label htmlFor="style-preference" className="text-sm font-medium mb-2 block">4. Preferensi Gaya (Opsional)</label>
              <textarea
                id="style-preference"
                value={stylePreference}
                onChange={(e) => setStylePreference(e.target.value)}
                placeholder="Contoh: gaya horor, font tebal warna merah dengan efek api, nuansa retro 80-an..."
                className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
                rows={3}
                disabled={isLoading}
              />
            </div>

            {error && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={isLoading || !imageFile || !hookText.trim()}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg mt-auto"
            >
              {isLoading ? <><Spinner size="5" className="text-white" /> Generating...</> : <><SparklesIcon /> Generate Thumbnail</>}
            </button>
          </div>

          {/* Output Column */}
          <div className="flex flex-col">
            <label className="text-sm font-medium mb-2 block">Hasil Thumbnail (3 Opsi)</label>
            <div className="w-full bg-secondary border border-border rounded-lg flex items-center justify-center overflow-hidden p-4 min-h-[400px]">
              {isLoading ? (
                <div className="text-center p-4">
                  <Spinner size="12" />
                  <p className="mt-4 text-muted-foreground text-sm">AI sedang membuat 3 alternatif... ini mungkin perlu waktu sejenak.</p>
                </div>
              ) : generatedUrls.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                      {generatedUrls.map((url, index) => (
                      <img 
                          key={index} 
                          src={url} 
                          alt={`Generated thumbnail ${index + 1}`} 
                          className="w-full object-cover rounded-md border border-border cursor-pointer transition-transform hover:scale-105 aspect-video" 
                          onClick={() => openLightbox(index)}
                      />
                      ))}
                  </div>
              ) : (
                <div className={`w-full flex items-center justify-center aspect-video`}>
                  <p className="text-muted-foreground px-4 text-center">3 Pilihan thumbnail Anda akan muncul di sini</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isLightboxOpen && generatedUrls.length > 0 && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button 
            className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 transition-colors z-50"
            onClick={closeLightbox}
            aria-label="Close"
          >
            &times;
          </button>

          <button 
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl p-2 bg-black/30 rounded-full hover:bg-black/60 transition-colors z-50"
            onClick={(e) => { e.stopPropagation(); goToPrevImage(); }}
            aria-label="Previous image"
          >
            &#8249;
          </button>

          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={generatedUrls[lightboxIndex]} 
              alt={`Lightbox view ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
          
          <button 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl p-2 bg-black/30 rounded-full hover:bg-black/60 transition-colors z-50"
            onClick={(e) => { e.stopPropagation(); goToNextImage(); }}
            aria-label="Next image"
          >
            &#8250;
          </button>
        </div>
      )}
    </>
  );
};

export default ThumbnailGenerator;