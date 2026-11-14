

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cleanImageAndAddText } from '../services/geminiService';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { UploadIcon } from './icons/UploadIcon';

type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

const ASPECT_RATIOS: { label: string; value: AspectRatio }[] = [
    { label: 'YouTube (16:9)', value: '16:9' },
    { label: 'Shorts (9:16)', value: '9:16' },
    { label: 'Square (1:1)', value: '1:1' },
    { label: 'Portrait (4:5)', value: '4:5' }
];

const VideoToThumbnailGenerator: React.FC = () => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string>('');
    
    const [capturedFrame, setCapturedFrame] = useState<{url: string; base64: string; mimeType: string;} | null>(null);

    const [hookText, setHookText] = useState<string>('');
    const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
    const [stylePreference, setStylePreference] = useState<string>('');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    const [lightboxIndex, setLightboxIndex] = useState<number>(0);
    const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);


    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('video/')) {
            setVideoFile(file);
            setVideoUrl(URL.createObjectURL(file));
            setError('');
            setGeneratedUrls([]);
            setCapturedFrame(null);
            setHookText('');
        } else {
            setError('Silakan pilih file video yang valid.');
        }
    };

    const handleCaptureFrame = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameDataUrl = canvas.toDataURL('image/png');
            const mimeType = 'image/png';
            const base64 = frameDataUrl.split(',')[1];
            setCapturedFrame({ url: frameDataUrl, base64, mimeType });
        }
    }, []);
  
    const handleGenerate = useCallback(async () => {
        if (!capturedFrame || !hookText.trim()) {
            setError('Silakan ambil frame dari video dan masukkan teks hook.');
            return;
        }
        setIsLoading(true);
        setError('');
        setGeneratedUrls([]);

        try {
            const resultUrls = await cleanImageAndAddText(capturedFrame.base64, capturedFrame.mimeType, hookText, aspectRatio, stylePreference);
            setGeneratedUrls(resultUrls);
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan saat membuat thumbnail.');
        } finally {
            setIsLoading(false);
        }
    }, [capturedFrame, hookText, aspectRatio, stylePreference]);

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
        <div className="max-w-7xl mx-auto">
            <div className="p-1 bg-gradient-to-r from-primary to-blue-400 rounded-xl">
                <div className="bg-card p-6 rounded-lg">
                    <h2 className="text-3xl font-bold mb-2">Thumbnail from Video</h2>
                    <p className="text-muted-foreground">Unggah video, pilih frame terbaik, dan ubah menjadi thumbnail viral.</p>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left column: Video and Capture */}
                <div className="flex flex-col gap-6">
                    <div>
                        <label className="text-sm font-medium mb-2 block">1. Unggah Video</label>
                        <div className="w-full aspect-video bg-secondary border-2 border-dashed border-border rounded-lg flex items-center justify-center relative focus-within:ring-2 focus-within:ring-primary">
                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleVideoFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={isLoading}
                                aria-label="Unggah Video"
                            />
                            {videoUrl ? (
                                <video ref={videoRef} src={videoUrl} controls className="w-full h-full object-contain rounded-lg" />
                            ) : (
                                <div className="text-center text-muted-foreground pointer-events-none">
                                    <UploadIcon />
                                    <p>Klik atau seret file video ke sini</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {videoUrl && (
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={handleCaptureFrame}
                                disabled={isLoading}
                                className="w-full bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 transition-colors"
                            >
                                Ambil Frame Saat Ini
                            </button>

                            <div>
                                <label className="text-sm font-medium mb-2 block">2. Frame yang Diambil</label>
                                <div className="w-full aspect-video bg-secondary border border-border rounded-lg flex items-center justify-center">
                                    {capturedFrame ? (
                                        <img src={capturedFrame.url} alt="Captured Frame" className="w-full h-full object-contain rounded-lg" />
                                    ) : (
                                        <p className="text-muted-foreground text-center px-4">Frame yang Anda ambil akan muncul di sini</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    <canvas ref={canvasRef} className="hidden"></canvas>
                </div>

                {/* Right column: Settings and Output */}
                <div className="flex flex-col gap-6">
                    <div>
                        <label className="text-sm font-medium mb-2 block">3. Pilih Rasio Aspek</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {ASPECT_RATIOS.map(ratio => (
                                <button key={ratio.value} onClick={() => setAspectRatio(ratio.value)} disabled={isLoading}
                                    className={`py-2 px-3 text-sm font-semibold rounded-lg transition-colors duration-200 border-2 ${aspectRatio === ratio.value ? 'bg-primary border-primary/80 text-primary-foreground' : 'bg-secondary border-border text-muted-foreground hover:border-primary'}`}>
                                    {ratio.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="hook-text-video" className="text-sm font-medium mb-2 block">4. Tentukan Teks Hook</label>
                        <textarea
                            id="hook-text-video"
                            value={hookText}
                            onChange={(e) => setHookText(e.target.value)}
                            placeholder="Contoh: FAKTA TERSEMBUNYI PIRAMIDA..."
                            className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
                            rows={3}
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label htmlFor="style-preference-video" className="text-sm font-medium mb-2 block">5. Preferensi Gaya (Opsional)</label>
                        <textarea
                            id="style-preference-video"
                            value={stylePreference}
                            onChange={(e) => setStylePreference(e.target.value)}
                            placeholder="Contoh: gaya horor, font tebal warna merah..."
                            className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
                            rows={3}
                            disabled={isLoading}
                        />
                    </div>

                    {error && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{error}</p>}
                    
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !capturedFrame || !hookText.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
                        >
                        {isLoading ? <><Spinner size="5" className="text-white" /> Generating...</> : <><SparklesIcon /> Generate Thumbnail</>}
                    </button>

                    <hr className="border-border" />

                    <div className="flex flex-col">
                        <label className="text-sm font-medium mb-2 block">Hasil Thumbnail (3 Opsi)</label>
                        <div className="w-full bg-secondary border border-border rounded-lg flex items-center justify-center overflow-hidden p-4 min-h-[200px]">
                            {isLoading ? (
                                <div className="text-center p-4">
                                    <Spinner size="12" />
                                    <p className="mt-4 text-muted-foreground text-sm">AI sedang membuat 3 alternatif...</p>
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

export default VideoToThumbnailGenerator;