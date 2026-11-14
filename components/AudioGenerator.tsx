
import React, { useState, useCallback } from 'react';
import { generateAudio } from '../services/geminiService';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { CopyIcon } from './icons/CopyIcon';

const PRESET_TEXT = `Inilah tragedi Penerbangan 574.
Sebuah pesawat Boeing 737 milik Adam Air yang lenyap dari radar dalam penerbangan dari Surabaya ke Manado pada 1 Januari 2007. Pesawat ini membawa 102 orang—96 penumpang dan 6 awak kabin. Tak ada satupun yang selamat. Pagi itu, cuaca di atas Selat Makassar sangat buruk. Pesawat berjuang melawan angin kencang dan badai petir. Beberapa menit sebelum hilang, pilot melaporkan masalah pada sistem navigasi. Namun, itu adalah komunikasi terakhir mereka. Tim SAR gabungan dari Indonesia, Amerika Serikat, dan Singapura dikerahkan. Pencarian besar-besaran selama berhari-hari tidak membuahkan hasil. Baru sepuluh hari kemudian, kotak hitam pesawat ditemukan di kedalaman 2.000 meter di bawah laut. Rekaman suara kokpit mengungkap percakapan terakhir yang mengerikan. Pilot terdengar panik saat mencoba mengendalikan pesawat yang menukik tajam ke laut dengan kecepatan mendekati kecepatan suara. Laporan akhir Komite Nasional Keselamatan Transportasi (KNKT) menyimpulkan bahwa kerusakan sistem navigasi dan kesalahan pilot menjadi penyebab utama. Tragedi ini menjadi salah satu kecelakaan pesawat paling mematikan dalam sejarah penerbangan Indonesia.
`;

const DEFAULT_STYLE_INSTRUCTION = `Style: Formal and professional news anchor/broadcaster.
Tone: Objective, authoritative, clear, and informative.
Pace (Kecepatan): Consistent, slightly deliberate, measured, and not rushed, appropriate for delivering important information.
Projection (Volume): Medium to high, strong and steady.
Accent/Articulation: Standard Indonesian (Baku) with very clear and crisp articulation.
Vocal Quality: Mature, deep, and resonant male voice.
Emphasis: Subtle emphasis on key words and phrases to highlight important details, typical of a professional news report.
Acoustic Quality: Studio quality, no background noise, clear, high fidelity.`;

const VOICE_OPTIONS = [
    { id: 'Zephyr', name: 'Zephyr (Male, Calm)' },
    { id: 'Puck', name: 'Puck (Male, Energetic)' },
    { id: 'Charon', name: 'Charon (Male, Deep)' },
    { id: 'Kore', name: 'Kore (Female, Calm)' },
    { id: 'Fenrir', name: 'Fenrir (Female, Energetic)' },
];


const AudioGenerator: React.FC = () => {
    const [text, setText] = useState<string>('');
    const [voice, setVoice] = useState<string>('Zephyr');
    const [styleInstruction, setStyleInstruction] = useState<string>(DEFAULT_STYLE_INSTRUCTION);
    const [audioUrl, setAudioUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [narrationCopied, setNarrationCopied] = useState<boolean>(false);

    const handleGenerate = useCallback(async () => {
        if (!text.trim()) {
            setError('Silakan masukkan teks untuk diubah menjadi suara.');
            return;
        }
        setIsLoading(true);
        setError('');
        setAudioUrl('');

        // Clean up previous blob URL
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }

        try {
            const resultUrl = await generateAudio(text, voice, styleInstruction);
            setAudioUrl(resultUrl);
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan saat membuat audio.');
        } finally {
            setIsLoading(false);
        }
    }, [text, voice, audioUrl, styleInstruction]);

    const handleCopyNarration = useCallback(() => {
        if (text) {
            navigator.clipboard.writeText(text);
            setNarrationCopied(true);
            setTimeout(() => {
                setNarrationCopied(false);
            }, 2000);
        }
    }, [text]);

    return (
        <div className="max-w-4xl mx-auto">
            <div className="p-1 bg-gradient-to-r from-primary to-blue-400 rounded-xl">
                <div className="bg-card p-6 rounded-lg">
                    <h2 className="text-3xl font-bold mb-2">Text to Speech Generator</h2>
                    <p className="text-muted-foreground">Ubah naskah atau teks apapun menjadi narasi audio berkualitas tinggi.</p>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Input Column */}
                <div className="flex flex-col gap-6">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label htmlFor="narration-text" className="text-sm font-medium">1. Masukkan Teks Narasi</label>
                             <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setText(PRESET_TEXT)}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Gunakan Teks Contoh
                                </button>
                                <button
                                    onClick={handleCopyNarration}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    <CopyIcon copied={narrationCopied} />
                                    {narrationCopied ? 'Tersalin!' : 'Salin Teks'}
                                </button>
                             </div>
                        </div>
                        <textarea
                            id="narration-text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Tulis atau tempelkan (paste) naskah Anda di sini..."
                            className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200 min-h-[200px]"
                            rows={8}
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label htmlFor="style-instruction" className="text-sm font-medium mb-2 block">2. Instruksi Gaya (Style Instruction)</label>
                        <textarea
                            id="style-instruction"
                            value={styleInstruction}
                            onChange={(e) => setStyleInstruction(e.target.value)}
                            placeholder="Jelaskan gaya, nada, dan kecepatan suara yang diinginkan..."
                            className="w-full bg-secondary border border-border rounded-lg p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200 font-mono text-xs"
                            rows={8}
                            disabled={isLoading}
                        />
                    </div>
                    
                    <div>
                        <label htmlFor="voice-select" className="text-sm font-medium mb-2 block">3. Pilih Suara Narator</label>
                        <select 
                            id="voice-select" 
                            value={voice} 
                            onChange={e => setVoice(e.target.value)} 
                            disabled={isLoading} 
                            className="w-full bg-secondary border border-border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
                        >
                            {VOICE_OPTIONS.map(opt => (
                               <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                        </select>
                    </div>

                    {error && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{error}</p>}

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !text.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg mt-auto"
                    >
                        {isLoading ? <><Spinner size="5" className="text-white" /> Generating...</> : <><SparklesIcon /> Generate Audio</>}
                    </button>
                </div>

                {/* Output Column */}
                <div className="flex flex-col">
                    <label className="text-sm font-medium mb-2 block">Hasil Audio</label>
                    <div className="w-full bg-secondary border border-border rounded-lg flex items-center justify-center p-4 min-h-[400px]">
                        {isLoading ? (
                            <div className="text-center p-4">
                                <Spinner size="12" />
                                <p className="mt-4 text-muted-foreground text-sm">AI sedang mengubah teks menjadi suara... mohon tunggu.</p>
                            </div>
                        ) : audioUrl ? (
                            <div className="w-full flex flex-col items-center gap-4">
                                <p className="text-sm font-semibold">Audio berhasil dibuat!</p>
                                <audio src={audioUrl} controls className="w-full" />
                                <a 
                                    href={audioUrl} 
                                    download={`narasi_${new Date().getTime()}.wav`}
                                    className="bg-primary/90 text-primary-foreground text-sm font-semibold py-2 px-4 rounded-lg hover:bg-primary"
                                >
                                    Unduh Audio (.wav)
                                </a>
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground p-4">
                                <p>Hasil audio narasi Anda akan muncul di sini.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AudioGenerator;
