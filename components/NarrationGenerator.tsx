
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { generateNarration, generateViralIdeas, generateHookText } from '../services/geminiService';
import type { ViralIdea } from '../types';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { CopyIcon } from './icons/CopyIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { ImportIcon } from './icons/ImportIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

const DEFAULT_IDEA_PROMPT_TEMPLATE = `
Buatkan saya {numberOfIdeas} ide judul dan tema untuk video berdurasi {videoDuration} detik dengan topik {viralTopic}.
Hasilkan dalam format JSON dengan struktur berupa array of objects, di mana setiap object memiliki properti berikut:

"nomor" → nomor urut ide (number)

"judul" → judul video yang singkat, padat, jelas, dan clickbait (maksimal sekitar 8–12 kata)

"deskripsi" → penjelasan singkat yang relevan dengan topik video, menggambarkan isi atau pesan utama secara ringkas dan mengundang rasa penasaran penonton

Pastikan:

Judul harus menarik secara emosional, bisa memicu rasa penasaran, kaget, atau ingin tahu lebih lanjut.

Hindari kalimat yang terlalu panjang, ambigu, atau bertele-tele.

Gunakan gaya bahasa natural dan engaging, cocok untuk judul dan deskripsi YouTube Shorts atau video pendek.

Semua hasil dalam bahasa Indonesia.
`;


interface NarrationGeneratorProps {}

// Helper component for auto-sizing textarea
const AutoSizingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [props.value]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
        if (props.onChange) {
            props.onChange(e);
        }
    };

    return <textarea ref={textareaRef} {...props} onChange={handleInput} />;
};


const getNarrationStats = (narration: string | undefined, template: ViralIdea['lastUsedPromptTemplate']) => {
    if (!narration) {
        return { words: 0, chars: 0 };
    }
    
    let content = narration;
    if (template === 'tragedi') {
        const separatorIndex = content.indexOf('-----------------------------');
        if (separatorIndex !== -1) {
            content = content.substring(0, separatorIndex).trim();
        }
    }
    
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    
    return { words, chars };
};


const NarrationGenerator: React.FC<NarrationGeneratorProps> = () => {
  const historyRef = useRef<HTMLDivElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const excelTableRef = useRef<HTMLTableElement>(null);
  
  const [viralTopic, setViralTopic] = useState<string>('sejarah konflik, sejarah beridinya, sejarah runtuhnya, fakta yang jarang di ketauhi, informasi tertutup yang bocor ke publik seputar');
  const [ideaHistory, setIdeaHistory] = useState<Record<string, ViralIdea[]>>(() => {
    try {
      const savedHistory = localStorage.getItem('contentStudioIdeaHistory');
      if (!savedHistory) return {};
      const parsedHistory = JSON.parse(savedHistory);
      // Restore transient state defaults to ensure consistency
      for (const topic in parsedHistory) {
        if (Array.isArray(parsedHistory[topic])) {
          parsedHistory[topic] = parsedHistory[topic].map((idea: ViralIdea) => ({
            ...idea,
            isGeneratingStory: false,
            isGeneratingAudio: false,
            audioError: undefined,
          }));
        }
      }
      return parsedHistory;
    } catch (error) {
      console.error("Could not parse or initialize idea history from localStorage", error);
      return {};
    }
  });
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState<boolean>(false);
  const [isGeneratingMoreIdeas, setIsGeneratingMoreIdeas] = useState<boolean>(false);
  const [ideaError, setIdeaError] = useState<string>('');
  
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<boolean>(false);
  const [numberOfIdeas, setNumberOfIdeas] = useState<number>(20);
  const [numMoreIdeas, setNumMoreIdeas] = useState<number>(20);
  const [videoDuration, setVideoDuration] = useState<number>(50);
  const [ideaPromptTemplate, setIdeaPromptTemplate] = useState<string>(DEFAULT_IDEA_PROMPT_TEMPLATE);

  const [prompt, setPrompt] = useState<string>('');
  const [expandedIdeaIds, setExpandedIdeaIds] = useState<Set<number>>(new Set());

  // Prompt Modal State
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);
  const [promptModalTemplate, setPromptModalTemplate] = useState<'fakta' | 'tragedi' | 'custom' | 'kisah-hidup'>('fakta');
  const [promptModalDuration, setPromptModalDuration] = useState<number>(videoDuration);
  const [promptModalIdea, setPromptModalIdea] = useState<ViralIdea | null>(null);
  const [promptModalCustomText, setPromptModalCustomText] = useState<string>('');

  // Generation options state
  const [generationPromptTemplate, setGenerationPromptTemplate] = useState<'fakta' | 'tragedi' | 'kisah-hidup'>('fakta');
  
  // Copy state
  const [copiedDescIndex, setCopiedDescIndex] = useState<number | null>(null);
  const [copiedTitleIndex, setCopiedTitleIndex] = useState<number | null>(null);
  const [copiedHookIndex, setCopiedHookIndex] = useState<number | null>(null);
  const [narrationCopied, setNarrationCopied] = useState<boolean>(false);
  const [promptCopied, setPromptCopied] = useState<boolean>(false);
  const [excelViewCopied, setExcelViewCopied] = useState<boolean>(false);

  // Selection state
  const [selectedIdeas, setSelectedIdeas] = useState<Set<number>>(new Set());

  // Filter and View state
  const [releaseFilter, setReleaseFilter] = useState<'all' | 'released' | 'unreleased'>('all');
  const [generationFilter, setGenerationFilter] = useState<'all' | 'generated' | 'ungenerated'>('all');
  const [viewMode, setViewMode] = useState<'normal' | 'excel'>('normal');


  const viralIdeas = activeTopic ? ideaHistory[activeTopic] || [] : [];
  const isAnyStoryGenerating = viralIdeas.some(idea => idea.isGeneratingStory || idea.isGeneratingAudio);

  const filteredIdeas = viralIdeas.filter(idea => {
    // Release filter
    let releaseMatch = true;
    if (releaseFilter === 'released') {
        releaseMatch = !!idea.sudahRelease;
    } else if (releaseFilter === 'unreleased') {
        releaseMatch = !idea.sudahRelease;
    }

    // Generation filter
    const isGenerated = !!idea.narasi;
    let generationMatch = true;
    if (generationFilter === 'generated') {
        generationMatch = isGenerated;
    } else if (generationFilter === 'ungenerated') {
        generationMatch = !isGenerated;
    }
    
    return releaseMatch && generationMatch;
  });


  // Effect for saving history to localStorage
  useEffect(() => {
    try {
        const cleanHistoryForStorage = (history: Record<string, ViralIdea[]>) => {
            const cleanedHistory: Record<string, any> = {};
            for (const topic in history) {
                if (Array.isArray(history[topic])) {
                    cleanedHistory[topic] = history[topic].map(idea => {
                        const { isGeneratingStory, isGeneratingAudio, audioError, ...restOfIdea } = idea;
                        return {
                            ...restOfIdea,
                            // Do not save transient or blob states
                            audioUrl: undefined,
                        };
                    });
                }
            }
            return cleanedHistory;
        };
        const cleanedHistory = cleanHistoryForStorage(ideaHistory);
        localStorage.setItem('contentStudioIdeaHistory', JSON.stringify(cleanedHistory));
    } catch (error) {
        console.error("Could not save idea history to localStorage", error);
    }
  }, [ideaHistory]);

  // Effect for closing history dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
            setIsHistoryOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Effect to handle plain text copy from Excel view
  useEffect(() => {
    const tableEl = excelTableRef.current;
    if (!tableEl) return;

    const handleCopy = (event: ClipboardEvent) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !tableEl.contains(selection.anchorNode)) {
            return;
        }
        event.preventDefault();
        const tsvData = selection.toString();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', tsvData);
        } else {
            navigator.clipboard.writeText(tsvData);
        }
    };

    document.addEventListener('copy', handleCopy);

    return () => {
        document.removeEventListener('copy', handleCopy);
    };
  }, [viewMode]);

  const updateIdea = useCallback((ideaId: number, updates: Partial<ViralIdea>) => {
    if (!activeTopic) return;
    setIdeaHistory(prevHistory => {
        const currentTopicIdeas = prevHistory[activeTopic] || [];
        const newTopicIdeas = currentTopicIdeas.map(idea =>
            idea.nomor === ideaId ? { ...idea, ...updates } : idea
        );
        return {
            ...prevHistory,
            [activeTopic]: newTopicIdeas
        };
    });
  }, [activeTopic]);

  const handleInputChange = (ideaId: number, field: 'judul' | 'hookText' | 'narasi', value: string) => {
    updateIdea(ideaId, { [field]: value });
  };

  const handleGenerateIdeas = useCallback(async () => {
    if (!viralTopic.trim()) {
        setIdeaError('Topik tidak boleh kosong.');
        return;
    }
    setIsGeneratingIdeas(true);
    setIdeaError('');
    setExpandedIdeaIds(new Set());
    setSelectedIdeas(new Set());
    
    // Reset filters and view mode
    setReleaseFilter('all');
    setGenerationFilter('all');
    setViewMode('normal');

    try {
        const finalPrompt = ideaPromptTemplate
            .replace('{numberOfIdeas}', String(numberOfIdeas))
            .replace('{videoDuration}', String(videoDuration))
            .replace('{viralTopic}', viralTopic);

        const result = await generateViralIdeas(finalPrompt);
        
        const newIdeas = [];
        for (const idea of result) {
            let hookText = '';
            try {
                const hookSourceText = `${idea.judul}. ${idea.deskripsi}`;
                hookText = await generateHookText(hookSourceText);
            } catch (hookError) {
                console.warn(`Fallback hook for idea "${idea.judul}":`, hookError);
                hookText = idea.judul;
            }
            newIdeas.push({ ...idea, hookText: hookText || idea.judul, isGeneratingStory: false, sudahRelease: false });
        }
        
        setIdeaHistory(prevHistory => {
            return {
                ...prevHistory,
                [viralTopic]: newIdeas
            };
        });
        setActiveTopic(viralTopic);

    } catch (err: any) {
        setIdeaError(err.message || 'Terjadi kesalahan saat membuat ide.');
    } finally {
        setIsGeneratingIdeas(false);
    }
  }, [viralTopic, numberOfIdeas, videoDuration, ideaPromptTemplate]);
  
  const handleGenerateMoreIdeas = useCallback(async () => {
    if (!activeTopic) return;

    setIsGeneratingMoreIdeas(true);
    setIdeaError('');

    try {
        const existingIdeas = ideaHistory[activeTopic] || [];
        const existingTitles = existingIdeas.map(idea => idea.judul).join('\n- ');
        
        const exclusionPromptPart = existingTitles.length > 0
            ? `\n\nPENTING: Jangan membuat ulang ide dengan judul yang mirip dengan yang ada di daftar ini:\n- ${existingTitles}`
            : '';

        const finalPrompt = `Buatkan saya list ${numMoreIdeas} judul dan tema BARU untuk video berdurasi ${videoDuration} detik dengan topik ${viralTopic}.${exclusionPromptPart}\n\nBuat dalam format JSON dengan struktur array of objects, di mana setiap object memiliki properti 'nomor' (number), 'judul' (string), dan 'deskripsi' (string). Pastikan judulnya clickbait, menarik, dan relevan dengan topik.`;

        const result = await generateViralIdeas(finalPrompt);
        
        const maxNomor = Math.max(0, ...existingIdeas.map(idea => idea.nomor));
        
        const newIdeas = [];
        for (let index = 0; index < result.length; index++) {
            const idea = result[index];
            const newNomor = maxNomor + 1 + index;
            let hookText = '';
            try {
                const hookSourceText = `${idea.judul}. ${idea.deskripsi}`;
                hookText = await generateHookText(hookSourceText);
            } catch (hookError) {
                console.warn(`Fallback hook for idea "${idea.judul}":`, hookError);
                hookText = idea.judul;
            }
            newIdeas.push({
                ...idea,
                nomor: newNomor,
                hookText: hookText || idea.judul,
                isGeneratingStory: false,
                sudahRelease: false,
            });
        }

        setIdeaHistory(prevHistory => ({
            ...prevHistory,
            [activeTopic]: [...existingIdeas, ...newIdeas]
        }));

    } catch (err: any) {
        setIdeaError(err.message || 'Terjadi kesalahan saat membuat ide tambahan.');
    } finally {
        setIsGeneratingMoreIdeas(false);
    }
  }, [activeTopic, ideaHistory, videoDuration, viralTopic, numMoreIdeas]);

  const createFaktaMenarikPrompt = useCallback((idea: ViralIdea, duration: number) => {
    const wordCountMin = Math.round(duration * 3.5);
    const wordCountMax = Math.round(duration * 4.2);
    return `Buatkan naskah video short dengan topik: "${idea.judul} - ${idea.deskripsi}". 
Naskah berdurasi ${duration} detik dengan jumlah kata ${wordCountMin}–${wordCountMax}. 

Ketentuan naskah:
- Gaya storytelling singkat, padat, dan memikat sejak awal.
- Gunakan bahasa dramatis, informatif, dan misterius, seolah membuka “tabir rahasia” 
- Sertakan kalimat retoris atau pertanyaan yang memancing rasa penasaran.
- Suasana harus intens, bikin nagih, dan penuh emosi seperti karya manusia yang cocok untuk video pendek
- output nya berupa naskah tanpa keterangan apapun

Struktur alur cerita:
1. HOOK: berupa pertanyaan, pernyataan ekstrem, fakta dari hal yang akan di bahas

2. KONFLIK & VALUE:
   Bangun ketegangan secara bertahap. buat pembaca merasa seperti didalam cerita. Gunakan kalimat pendek dan ritme yang cepat, buat supaya pendengar merasa masuk kedalam cerita ini

3. TWIST / RAHASIA LEBIH DALAM: Sajikan plot twist atau lapisan misteri kedua. 

4. CALL TO ACTION & Pertanyaan Interaktif - 1 kalimat di akhir
   Ajak penonton untuk berinteraksi. Ini penting untuk meningkatkan engagement. 
   HAL YANG WAJIB Hindari mengajak like atau subscribe channel ini
   Buat pertanyaan singkat yang memancing diskusi atau komentar terkait cerita.
   Contoh: "Gimana menurutmu, apakah Edith pantas jadi pahlawan?" atau 
   "Kira-kira cerita apalagi yang bikin kamu penasaran? Coba komen di bawah!`;
  }, []);

  const createTragediPrompt = useCallback((idea: ViralIdea) => {
    return `Tulis sebuah narasi tragedi dengan gaya dokumenter jurnalistik.
Gunakan bahasa Indonesia yang padat, lugas, dan berjarak emosional.
Tulisan harus terasa seperti laporan naratif yang bisa dibacakan oleh narator dokumenter,
bukan seperti cerita atau opini pribadi.

🎯 TUJUAN:
Membuat narasi tragedi berdasarkan fakta-fakta yang banyak diberitakan oleh media berita nasional atau internasional.
Narasi harus membangun tensi dan rasa berat melalui data, kronologi, dan fakta nyata — bukan melalui bahasa emosional.

TOPIK:
${idea.judul} - ${idea.deskripsi}


📘 GAYA PENULISAN:
Gunakan nada objektif, tenang, dan dokumenter.
Hindari kalimat puitis, reflektif, atau moralistik.
Gunakan kalimat yang jelas
Gunakan ritme: kalimat panjang (penjelasan) → kalimat pendek (penegasan).
Pilih kata konkret: “terbakar”, “menghantam”, “meledak”, “lenyap”, “tergelincir”.
Hindari kata abstrak seperti “kerapuhan”, “air mata”, atau “harapan”.
Gunakan penanda waktu alami seperti: “pagi itu”, “beberapa menit kemudian”, “tak lama setelah itu”.
Hindari elipsis (...), tanda seru, dan pertanyaan retoris.
Bangun ketegangan melalui urutan fakta, bukan gaya bahasa.

🏗️ STRUKTUR PENULISAN:
Paragraf 1 – Fakta Utama
Kalimat pertama wajib dimulai dengan: “Inilah tragedi [nama tragedi].” dilanjut dengan penjelasan singkat.
Lanjutkan 2–3 kalimat fakta konkret: lokasi, jumlah korban, dan hal unik dari kejadian.
Hindari opini atau emosi.
bagian ini adalah hook jadi buat se-menarik mungkin

Paragraf 2–4 – Kronologi Kejadian
sebutkan waktu kejadian, 
Jelaskan peristiwa secara linier dari awal hingga puncak tragedi.
Gunakan waktu spesifik dan alur bergerak maju.
Gunakan kalimat faktual yang menggambarkan urutan dengan jelas.

Paragraf 5 – Dampak dan Korban
Cantumkan jumlah korban tewas, hilang, dan selamat.
Tambahkan fakta unik atau penting (misalnya korban pejabat, warga sipil di lokasi, atau anak-anak).
Hindari kalimat emosional.

Paragraf 6–7 – Penyelidikan atau Kejanggalan
Jelaskan hasil penyelidikan resmi, teori penyebab, atau fakta teknis.
Jika ada versi berbeda, tulis dengan netral: “Laporan lain menyebut...” atau “Penyebab pastinya masih belum jelas.”
Hindari opini atau spekulasi moral.

Paragraf 8 – Penutup
Gunakan satu kalimat pendek dan datar untuk menutup.
Contoh pola: “Hingga kini, tragedi ini masih dikenang sebagai salah satu yang paling kelam dalam sejarah.”
Jangan menambahkan ajakan emosional atau kesimpulan moral.


🧩 ATURAN TAMBAHAN:
Gunakan fakta-fakta yang umum diberitakan di media utama.
Hindari menambah detail yang tidak bisa diverifikasi.
Gunakan tanda titik untuk mengakhiri hampir semua kalimat.
Setiap paragraf maksimal 3–6 kalimat.
Hindari repetisi dan kalimat pengisi.
Pastikan narasi utama berada dalam rentang 1.400–1.700 karakter termasuk spasi, tidak boleh kurang atau lebih.

🎯 FOKUS AKHIR:
Teks harus terasa seperti naskah voice-over dokumenter tragedi.
Nada harus datar, faktual, dan menggugah lewat data, bukan emosi.
Bangun ketegangan perlahan melalui kronologi, dan akhiri dengan kalimat sunyi yang menandakan peringatan.`;
  }, []);

  const createKisahHidupPrompt = useCallback((idea: ViralIdea, duration: number) => {
    const wordCountMin = Math.round(duration * 3.5);
    const wordCountMax = Math.round(duration * 4.2);
    return `Buatkan saya cerita pendek dari tema: "${idea.judul} - ${idea.deskripsi}". Cerita harus maksimal ${wordCountMin}–${wordCountMax} kata, intens, bikin nagih, dan penuh emosi seperti karya manusia yang cocok untuk video pendek, konten storytelling, atau narasi dramatis berdurasi maksimal ${duration} detik dengan struktur format:
 
HOOK (Kalimat pertama – maksimal 2 kalimat) Buat pembuka yang nge-hook, bisa berupa pertanyaan mencurigakan, pernyataan aneh, atau situasi ekstrem. 

KONFLIK (isi tengah) Bangun ketegangan secara bertahap. Fokus pada emosi, tindakan dan dilema. Buat pembaca merasa seperti didalam cerita. Gunakan kalimat pendek dan ritme yang cepat jika ingin membangun intensitas. 

TWIST Ubah arah cerita dengan cara tak terduga. Hindari ending klise. Lebih baik jika pembaca harus membacanya dua kali untuk benar-benar paham. 

CTA (Call to Action & Pertanyaan Interaktif - 1 kalimat di akhir) Ajak penonton untuk berinteraksi. Ini penting untuk meningkatkan engagement. Buat pertanyaan singkat yang memancing diskusi atau komentar terkait cerita. 
Contoh: "Gimana menurutmu, apakah Edith pantas jadi pahlawan?" atau "Kira-kira cerita apalagi yang bikin kamu penasaran? Coba komen di bawah!". SUARA PENULIS/NUANSA (optional) Tambahkan gaya bahasa unik, nyeleneh atau puitis untuk memberi “rasa manusia”. 

Aturan tambahan: Gunakan bahasa Indonesia yang hidup dan santai. Hindari terlalu baku. Cerita harus punya ketegangan emosional tinggi (tekanan batin, rahasia besar, pertaruhan hidup mati, dll). Gunakan format 3 paragraf atau maksimal 6 baris.;`;
  }, []);

  const handleGenerateForIdea = async (idea: ViralIdea) => {
    const wasExpanded = expandedIdeaIds.has(idea.nomor);
    updateIdea(idea.nomor, { isGeneratingStory: true });
    setIdeaError('');
    try {
        let storyPrompt: string;
        if (generationPromptTemplate === 'tragedi') {
            storyPrompt = createTragediPrompt(idea);
        } else if (generationPromptTemplate === 'kisah-hidup') {
            storyPrompt = createKisahHidupPrompt(idea, videoDuration);
        } else { // fakta
            storyPrompt = createFaktaMenarikPrompt(idea, videoDuration);
        }
        setPrompt(storyPrompt);
        const newNarration = await generateNarration(storyPrompt);
        let newHook = '';
        try {
            newHook = await generateHookText(newNarration);
        } catch (hookErr) {
            console.warn('Gagal membuat hook dari narasi, gunakan judul:', hookErr);
            newHook = idea.judul;
        }
        
        updateIdea(idea.nomor, { 
            narasi: newNarration, 
            hookText: newHook || idea.judul,
            lastUsedPromptTemplate: generationPromptTemplate,
            audioUrl: undefined,
            audioError: undefined,
        });

        if (!wasExpanded) {
            setExpandedIdeaIds(prevIds => {
                const newIds = new Set(prevIds);
                newIds.add(idea.nomor);
                return newIds;
            });
        }

    } catch (err: any) {
        console.error(`Gagal generate untuk ide #${idea.nomor}:`, err);
        setIdeaError(err.message || `Gagal generate untuk ide #${idea.nomor}.`);
    } finally {
        updateIdea(idea.nomor, { isGeneratingStory: false });
    }
  };
  
  const handleGenerateNarrationFromModal = async () => {
    if (!promptModalIdea) return;

    const idea = promptModalIdea;
    
    updateIdea(idea.nomor, { isGeneratingStory: true });
    setIsPromptModalOpen(false);
    setIdeaError('');

    try {
      let storyPrompt: string;
      if (promptModalTemplate === 'custom') {
          storyPrompt = promptModalCustomText;
      } else if (promptModalTemplate === 'tragedi') {
          storyPrompt = createTragediPrompt(idea);
      } else if (promptModalTemplate === 'kisah-hidup') {
          storyPrompt = createKisahHidupPrompt(idea, promptModalDuration);
      } else { // 'fakta'
          storyPrompt = createFaktaMenarikPrompt(idea, promptModalDuration);
      }

      if (!storyPrompt.trim()) {
           throw new Error("Prompt kustom tidak boleh kosong.");
      }
      
      const newNarration = await generateNarration(storyPrompt);
      let newHook = '';
      try {
          newHook = await generateHookText(newNarration);
      } catch (hookErr) {
          console.warn('Gagal membuat hook dari modal narasi, gunakan judul:', hookErr);
          newHook = idea.judul;
      }

      // Save the result AND the last used settings
      updateIdea(idea.nomor, {
          narasi: newNarration,
          hookText: newHook || idea.judul,
          lastUsedPromptTemplate: promptModalTemplate,
          lastUsedPromptDuration: promptModalDuration,
          customPrompt: promptModalCustomText,
          audioUrl: undefined,
          audioError: undefined,
      });

    } catch (err: any) {
        console.error(`Gagal generate narasi dari modal untuk ide #${idea.nomor}:`, err);
        setIdeaError(err.message || `Gagal generate narasi dari modal untuk ide #${idea.nomor}.`);
    } finally {
        updateIdea(idea.nomor, { isGeneratingStory: false });
    }
  };
  
  const handleToggleExpand = (ideaId: number) => {
    const idea = viralIdeas.find(i => i.nomor === ideaId);
    if(idea) {
        const storyPrompt = createFaktaMenarikPrompt(idea, videoDuration);
        setPrompt(storyPrompt);
    }
    setExpandedIdeaIds(prevIds => {
        const newIds = new Set(prevIds);
        if (newIds.has(ideaId)) {
            newIds.delete(ideaId);
        } else {
            newIds.add(ideaId);
        }
        return newIds;
    });
  };

  const handleSelectTopicFromHistory = (topic: string) => {
    setViralTopic(topic);
    setActiveTopic(topic);
    setExpandedIdeaIds(new Set());
    setSelectedIdeas(new Set());
    setIsHistoryOpen(false);
  };
  
  const handleGenerateSelectedStories = async () => {
      const ideasToGenerate = viralIdeas.filter(idea => selectedIdeas.has(idea.nomor));
      if (ideasToGenerate.length === 0) return;

      for (const idea of ideasToGenerate) {
          try {
              await handleGenerateForIdea(idea);
          } catch (error) {
              console.error(`Gagal dalam batch generation untuk ide #${idea.nomor}`, error);
          }
      }
      setSelectedIdeas(new Set());
  };

  const handleDeleteSelectedIdeas = useCallback(() => {
    if (!activeTopic || selectedIdeas.size === 0) return;

    setIdeaHistory(prevHistory => {
        const currentTopicIdeas = prevHistory[activeTopic] || [];
        const newTopicIdeas = currentTopicIdeas.filter(idea => !selectedIdeas.has(idea.nomor));
        return {
            ...prevHistory,
            [activeTopic]: newTopicIdeas,
        };
    });

    setExpandedIdeaIds(prev => {
        const newSet = new Set(prev);
        selectedIdeas.forEach(id => newSet.delete(id));
        return newSet;
    });
    
    setSelectedIdeas(new Set());
    setIsDeleteConfirmOpen(false);
  }, [activeTopic, selectedIdeas]);

  const handleToggleSelect = (ideaId: number) => {
      setSelectedIdeas(prev => {
          const newSelection = new Set(prev);
          if (newSelection.has(ideaId)) {
              newSelection.delete(ideaId);
          } else {
              newSelection.add(ideaId);
          }
          return newSelection;
      });
  };

  const handleToggleSelectAll = () => {
      const currentFilteredIds = filteredIdeas.map(idea => idea.nomor);
      const allFilteredSelected = currentFilteredIds.length > 0 && currentFilteredIds.every(id => selectedIdeas.has(id));

      if (allFilteredSelected) {
          setSelectedIdeas(prev => {
              const newSelection = new Set(prev);
              currentFilteredIds.forEach(id => newSelection.delete(id));
              return newSelection;
          });
      } else {
          setSelectedIdeas(prev => new Set([...prev, ...currentFilteredIds]));
      }
  };

  const handleToggleReleaseStatus = useCallback((ideaId: number) => {
    if (!activeTopic) return;
    setIdeaHistory(prevHistory => {
        const currentTopicIdeas = prevHistory[activeTopic] || [];
        const newTopicIdeas = currentTopicIdeas.map(idea =>
            idea.nomor === ideaId ? { ...idea, sudahRelease: !idea.sudahRelease } : idea
        );
        return {
            ...prevHistory,
            [activeTopic]: newTopicIdeas
        };
    });
  }, [activeTopic]);

  const handleCopyDescription = useCallback((text: string, index: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedDescIndex(index);
    setTimeout(() => {
        setCopiedDescIndex(null);
    }, 2000);
  }, []);

  const handleCopyTitleText = useCallback((text: string, index: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTitleIndex(index);
    setTimeout(() => {
        setCopiedTitleIndex(null);
    }, 2000);
  }, []);

   const handleCopyHook = useCallback((text: string, index: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedHookIndex(index);
    setTimeout(() => {
        setCopiedHookIndex(null);
    }, 2000);
  }, []);

  const handleCopyNarration = useCallback((idea: ViralIdea) => {
    if (idea?.narasi) {
        navigator.clipboard.writeText(idea.narasi);
        setNarrationCopied(true);
        setTimeout(() => {
            setNarrationCopied(false);
        }, 2000);
    }
  }, []);

  const displayedPromptInModal = useMemo(() => {
    if (!promptModalIdea) return '';
    if (promptModalTemplate === 'tragedi') {
        return createTragediPrompt(promptModalIdea);
    }
    if (promptModalTemplate === 'kisah-hidup') {
        return createKisahHidupPrompt(promptModalIdea, promptModalDuration);
    }
    return createFaktaMenarikPrompt(promptModalIdea, promptModalDuration);
  }, [promptModalIdea, promptModalTemplate, promptModalDuration, createFaktaMenarikPrompt, createTragediPrompt, createKisahHidupPrompt]);

  const handleCopyPromptNarration = useCallback(() => {
    const textToCopy = promptModalTemplate === 'custom'
        ? promptModalCustomText
        : displayedPromptInModal;

    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy);
        setPromptCopied(true);
        setTimeout(() => {
            setPromptCopied(false);
        }, 2000);
    }
  }, [displayedPromptInModal, promptModalTemplate, promptModalCustomText]);

  const handleOpenPromptModal = (idea: ViralIdea) => {
    setPromptModalIdea(idea);
    setPromptModalTemplate(idea.lastUsedPromptTemplate || 'fakta');
    setPromptModalDuration(idea.lastUsedPromptDuration || videoDuration);
    setPromptModalCustomText(idea.customPrompt || '');
    setIsPromptModalOpen(true);
  };
  
  const handleDownloadIdeasJson = useCallback(() => {
    if (!activeTopic || viralIdeas.length === 0) return;
  
    const dataToDownload = {
      topic: activeTopic,
      ideas: viralIdeas.map(idea => ({
        nomor: idea.nomor,
        judul: idea.judul,
        deskripsi: idea.deskripsi,
        narasi: idea.narasi,
        hookText: idea.hookText,
        sudahRelease: !!idea.sudahRelease,
      }))
    };
  
    const dataStr = JSON.stringify(dataToDownload, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const sanitizedTopic = activeTopic.trim().toLowerCase()
        .replace(/[\s,.]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50);

    const exportFileDefaultName = `${day}-${month}-${year}-${hours}${minutes}-${sanitizedTopic}.json`;
  
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [activeTopic, viralIdeas]);

  const handleImportIdeasJson = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const text = e.target?.result as string;
              if (!text) throw new Error("File is empty.");
              const data = JSON.parse(text);
              if (!data.topic || typeof data.topic !== 'string' || !Array.isArray(data.ideas)) {
                  throw new Error("Invalid JSON format. Must include 'topic' (string) and 'ideas' (array).");
              }
              
              const importedTopic = data.topic;
              const seenNumbers = new Set<number>();
              const ideasWithUniqueNumbers: ViralIdea[] = [];
              let maxNomorInFile = 0;
              data.ideas.forEach((idea: any) => {
                  if (typeof idea.nomor === 'number' && idea.nomor > maxNomorInFile) {
                      maxNomorInFile = idea.nomor;
                  }
              });

              data.ideas.forEach((idea: any) => {
                  let currentNomor = idea.nomor;
                  if (typeof currentNomor !== 'number' || seenNumbers.has(currentNomor)) {
                      maxNomorInFile++;
                      currentNomor = maxNomorInFile;
                  }
                  seenNumbers.add(currentNomor);

                  ideasWithUniqueNumbers.push({
                      nomor: currentNomor,
                      judul: idea.judul ?? '',
                      deskripsi: idea.deskripsi ?? '',
                      narasi: idea.narasi,
                      hookText: idea.hookText,
                      isGeneratingStory: false,
                      sudahRelease: idea.sudahRelease ?? false,
                  });
              });

              setIdeaHistory(prev => ({
                  ...prev,
                  [importedTopic]: ideasWithUniqueNumbers
              }));
              setViralTopic(importedTopic);
              setActiveTopic(importedTopic);
              setExpandedIdeaIds(new Set());
              setIdeaError('');
              alert(`Successfully imported ${ideasWithUniqueNumbers.length} ideas for topic: "${importedTopic}"`);

          } catch (err: any) {
              setIdeaError(`Failed to import file: ${err.message}`);
          } finally {
              if (event.target) event.target.value = '';
          }
      };
      reader.onerror = () => {
          setIdeaError(`Failed to read the file.`);
          if (event.target) event.target.value = '';
      }
      reader.readAsText(file);
  };

  const durationOptions = Array.from({ length: 15 }, (_, i) => 50 + i * 10);

  const getRowClass = (idea: ViralIdea) => {
    if (idea.sudahRelease) return 'bg-primary/20 hover:bg-primary/30';
    if (selectedIdeas.has(idea.nomor)) return 'bg-primary/20';
    return 'hover:bg-secondary/50';
  };

  const getFilterButtonClass = (filter: 'all' | 'released' | 'unreleased') => {
    const base = "px-3 py-1 text-sm font-semibold rounded-full transition-colors";
    if (releaseFilter === filter) return `${base} bg-primary text-primary-foreground`;
    return `${base} bg-muted text-muted-foreground hover:bg-secondary`;
  };

  const getGenerationFilterButtonClass = (filter: 'all' | 'generated' | 'ungenerated') => {
    const base = "px-3 py-1 text-sm font-semibold rounded-full transition-colors";
    if (generationFilter === filter) return `${base} bg-primary text-primary-foreground`;
    return `${base} bg-muted text-muted-foreground hover:bg-secondary`;
  };

  const generateTsv = useCallback(() => {
    const headers = ['No.', 'Judul', 'Deskripsi', 'Hook', 'Narasi'];
    const rows = filteredIdeas.map(idea => [
        idea.nomor,
        `"${(idea.judul || '').replace(/"/g, '""')}"`,
        `"${(idea.deskripsi || '').replace(/"/g, '""')}"`,
        `"${(idea.hookText || '').replace(/"/g, '""')}"`,
        `"${(idea.narasi || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`
    ].join('\t'));
    return [headers.join('\t'), ...rows].join('\n');
  }, [filteredIdeas]);

  const handleCopyExcelView = useCallback(() => {
    const tsvData = generateTsv();
    navigator.clipboard.writeText(tsvData);
    setExcelViewCopied(true);
    setTimeout(() => setExcelViewCopied(false), 2000);
  }, [generateTsv]);

  return (
    <>
      {isPromptModalOpen && promptModalIdea && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex items-center justify-center p-4" onClick={() => setIsPromptModalOpen(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-3xl w-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold truncate pr-4">Opsi Prompt Cerita</h3>
                 <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                        onClick={handleCopyPromptNarration}
                        className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold py-2 px-4 rounded-lg hover:bg-primary/90 transition-colors duration-200"
                    >
                        <CopyIcon copied={promptCopied} />
                        {promptCopied ? 'Tersalin!' : 'Salin Prompt'}
                    </button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 p-3 bg-secondary rounded-lg border border-border">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Template:</span>
                    <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
                        <button onClick={() => setPromptModalTemplate('fakta')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${promptModalTemplate === 'fakta' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Fakta Menarik</button>
                        <button onClick={() => setPromptModalTemplate('tragedi')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${promptModalTemplate === 'tragedi' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Tragedi</button>
                        <button onClick={() => setPromptModalTemplate('kisah-hidup')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${promptModalTemplate === 'kisah-hidup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Kisah Hidup</button>
                        <button onClick={() => setPromptModalTemplate('custom')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${promptModalTemplate === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Custom</button>
                    </div>
                </div>
                {promptModalTemplate !== 'tragedi' && (
                  <div className="flex items-center gap-2">
                      <label htmlFor="prompt-duration" className="text-sm font-medium text-muted-foreground flex-shrink-0">Durasi Video:</label>
                      <select
                          id="prompt-duration"
                          value={promptModalDuration}
                          onChange={(e) => setPromptModalDuration(Number(e.target.value))}
                          className="bg-background border border-border rounded-lg p-2 focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-200"
                      >
                          {durationOptions.map(d => (
                              <option key={d} value={d}>{d} detik</option>
                          ))}
                      </select>
                  </div>
                )}
            </div>

            <div className="bg-secondary border border-border rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                {promptModalTemplate === 'custom' ? (
                    <textarea
                        value={promptModalCustomText}
                        onChange={(e) => setPromptModalCustomText(e.target.value)}
                        placeholder="Tulis atau edit prompt kustom Anda di sini..."
                        className="w-full h-full bg-background/50 border border-border focus:ring-2 focus:ring-primary focus:outline-none rounded-md p-2 transition-all duration-200 text-sm leading-relaxed font-mono resize-y min-h-[250px]"
                        aria-label="Custom Prompt Editor"
                    />
                ) : (
                    <p className="whitespace-pre-wrap leading-relaxed font-mono text-sm">{displayedPromptInModal}</p>
                )}
            </div>
            <div className="mt-6 flex justify-end items-center gap-4">
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="bg-secondary text-secondary-foreground font-semibold py-2 px-6 rounded-lg hover:bg-muted transition-colors duration-200"
              >
                Tutup
              </button>
              <button
                onClick={handleGenerateNarrationFromModal}
                disabled={promptModalIdea?.isGeneratingStory}
                className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold py-2 px-6 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {promptModalIdea?.isGeneratingStory ? <Spinner size="4" /> : <SparklesIcon />}
                Generate Ulang Narasi
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-2xl p-8 max-w-md w-full">
                <h3 className="text-xl font-bold mb-4">Konfirmasi Penghapusan</h3>
                <p className="text-muted-foreground mb-6">
                    Apakah Anda yakin ingin menghapus {selectedIdeas.size} ide yang dipilih? Tindakan ini tidak dapat diurungkan.
                </p>
                <div className="flex justify-end gap-4">
                    <button
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className="bg-secondary text-secondary-foreground font-semibold py-2 px-5 rounded-lg hover:bg-muted transition-colors"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleDeleteSelectedIdeas}
                        className="bg-destructive text-destructive-foreground font-semibold py-2 px-5 rounded-lg hover:bg-destructive/90 transition-colors"
                    >
                        Hapus
                    </button>
                </div>
            </div>
        </div>
       )}

      <div className="max-w-7xl mx-auto flex flex-col h-full">
        {/* Viral Idea Generator */}
        <div className="mb-10">
          <div className="p-1 bg-gradient-to-r from-primary to-blue-400 rounded-xl shadow-lg">
              <div className="bg-card p-6 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Generator Ide Konten Viral</h2>
                    <p className="text-muted-foreground">Temukan ide judul & tema untuk video pendek berdasarkan topik pilihan Anda.</p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-border flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label htmlFor="num-ideas" className="text-sm font-medium">Jumlah Ide Konten</label>
                            <input
                            type="number"
                            id="num-ideas"
                            value={numberOfIdeas}
                            onChange={(e) => setNumberOfIdeas(parseInt(e.target.value, 10) || 1)}
                            min="1"
                            max="50"
                            className="w-full bg-secondary border border-border rounded-lg p-3 focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-200"
                            disabled={isGeneratingIdeas || isGeneratingMoreIdeas || isAnyStoryGenerating}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="duration" className="text-sm font-medium">Target Durasi Video (detik)</label>
                            <input
                            type="number"
                            id="duration"
                            value={videoDuration}
                            onChange={(e) => setVideoDuration(parseInt(e.target.value, 10) || 1)}
                            min="1"
                            className="w-full bg-secondary border border-border rounded-lg p-3 focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-200"
                            disabled={isGeneratingIdeas || isGeneratingMoreIdeas || isAnyStoryGenerating}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <label htmlFor="idea-prompt-template" className="text-sm font-medium">Template Prompt Ide</label>
                            <button
                                onClick={() => setIdeaPromptTemplate(DEFAULT_IDEA_PROMPT_TEMPLATE)}
                                className="text-xs text-primary hover:text-primary/80 transition-colors font-semibold"
                            >
                                Reset ke Default
                            </button>
                        </div>
                        <textarea
                            id="idea-prompt-template"
                            value={ideaPromptTemplate}
                            onChange={(e) => setIdeaPromptTemplate(e.target.value)}
                            className="w-full bg-secondary border border-border rounded-lg p-3 focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-200 min-h-[120px] font-mono text-sm"
                            rows={5}
                            disabled={isGeneratingIdeas || isGeneratingMoreIdeas || isAnyStoryGenerating}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Variabel yang tersedia: <code className="bg-muted text-primary px-1 rounded">{'{numberOfIdeas}'}</code>, <code className="bg-muted text-primary px-1 rounded">{'{videoDuration}'}</code>, <code className="bg-muted text-primary px-1 rounded">{'{viralTopic}'}</code>
                        </p>
                    </div>
                </div>
              </div>
          </div>
          <div className="flex flex-col gap-6 mt-8">
            <div className="flex flex-col gap-2">
                <label htmlFor="viral-topic" className="text-sm font-medium">Masukkan Topik Utama</label>
                <textarea
                    id="viral-topic"
                    value={viralTopic}
                    onChange={(e) => setViralTopic(e.target.value)}
                    placeholder="Contoh: sejarah, sains, teknologi, memasak"
                    className="w-full bg-secondary border border-border rounded-lg p-3 focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-200 min-h-[80px]"
                    rows={3}
                    disabled={isGeneratingIdeas || isGeneratingMoreIdeas || isAnyStoryGenerating}
                />
            </div>
            
            {ideaError && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{ideaError}</p>}

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button
                onClick={handleGenerateIdeas}
                disabled={isGeneratingIdeas || !viralTopic.trim() || isGeneratingMoreIdeas || isAnyStoryGenerating}
                className="w-full sm:w-auto flex-grow flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                {isGeneratingIdeas ? <><Spinner size="5" className="text-white" /> Generating...</> : <><SparklesIcon /> Generate Ide</>}
              </button>
              <button
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={isAnyStoryGenerating}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-muted disabled:bg-secondary/50 disabled:cursor-not-allowed transition-colors duration-200"
                  title="Impor dari file JSON"
              >
                  <ImportIcon />
                  <span>Impor JSON</span>
              </button>
              <input
                  type="file"
                  ref={importFileInputRef}
                  onChange={handleImportIdeasJson}
                  className="hidden"
                  accept="application/json"
              />
               <div className="relative" ref={historyRef}>
                  <button 
                      onClick={() => setIsHistoryOpen(prev => !prev)}
                      disabled={isAnyStoryGenerating}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-muted disabled:bg-secondary/50 disabled:cursor-not-allowed transition-colors duration-200"
                      title="Riwayat Generate Ide"
                  >
                      <HistoryIcon />
                      <span>Riwayat</span>
                  </button>
                  {isHistoryOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-popover border border-border rounded-lg shadow-xl z-20">
                          <div className="p-2">
                              <h4 className="font-semibold text-sm px-2 pb-1 border-b border-border mb-1">Riwayat Topik</h4>
                              {Object.keys(ideaHistory).length > 0 ? (
                                  <ul className="max-h-60 overflow-y-auto">
                                      {Object.keys(ideaHistory).map(topic => (
                                          <li key={topic}>
                                              <button 
                                                  onClick={() => handleSelectTopicFromHistory(topic)}
                                                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                                              >
                                                  {topic}
                                              </button>
                                          </li>
                                      ))}
                                  </ul>
                              ) : (
                                  <p className="text-xs text-muted-foreground px-2 py-2">Belum ada riwayat.</p>
                              )}
                          </div>
                      </div>
                  )}
              </div>
            </div>

            {(isGeneratingIdeas && viralIdeas.length === 0) && (
                <div className="text-center py-10">
                    <Spinner size="12" className="text-primary" />
                    <p className="mt-4 text-muted-foreground">Mencari ide-ide brilian...</p>
                </div>
            )}

            {viralIdeas.length > 0 && (
              <div className="mt-4 bg-card border border-border rounded-lg">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Hasil Ide Konten untuk: <span className="text-primary">{activeTopic}</span></h3>
                    <button
                        onClick={handleDownloadIdeasJson}
                        className="flex items-center gap-2 bg-secondary text-secondary-foreground text-sm font-semibold py-2 px-4 rounded-lg hover:bg-muted"
                    >
                        <DownloadIcon />
                        Unduh JSON
                    </button>
                </div>
                <div className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border bg-card/50">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Status Release:</span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => setReleaseFilter('all')} className={getFilterButtonClass('all')}>Semua</button>
                                <button onClick={() => setReleaseFilter('unreleased')} className={getFilterButtonClass('unreleased')}>Belum Release</button>
                                <button onClick={() => setReleaseFilter('released')} className={getFilterButtonClass('released')}>Sudah Release</button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Status Generate:</span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => setGenerationFilter('all')} className={getGenerationFilterButtonClass('all')}>Semua</button>
                                <button onClick={() => setGenerationFilter('ungenerated')} className={getGenerationFilterButtonClass('ungenerated')}>Belum Generate</button>
                                <button onClick={() => setGenerationFilter('generated')} className={getGenerationFilterButtonClass('generated')}>Sudah Generate</button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Template Prompt:</span>
                            <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
                                <button 
                                    onClick={() => setGenerationPromptTemplate('fakta')} 
                                    disabled={isAnyStoryGenerating}
                                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${generationPromptTemplate === 'fakta' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    Fakta Menarik
                                </button>
                                <button 
                                    onClick={() => setGenerationPromptTemplate('tragedi')} 
                                    disabled={isAnyStoryGenerating}
                                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${generationPromptTemplate === 'tragedi' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    Tragedi
                                </button>
                                <button 
                                    onClick={() => setGenerationPromptTemplate('kisah-hidup')} 
                                    disabled={isAnyStoryGenerating}
                                    className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${generationPromptTemplate === 'kisah-hidup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                >
                                    Kisah Hidup
                                </button>
                            </div>
                        </div>
                    </div>
                     <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg">
                        <button onClick={() => setViewMode('normal')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'normal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Tampilan Normal</button>
                        <button onClick={() => setViewMode('excel')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'excel' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Tampilan Excel</button>
                    </div>
                </div>

                {viewMode === 'excel' ? (
                  <div className="p-4">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-semibold">Tampilan Excel (Dapat Dipilih & Disalin)</h4>
                           <button
                              onClick={handleCopyExcelView}
                              className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold py-2 px-4 rounded-lg hover:bg-primary/90"
                          >
                              <CopyIcon copied={excelViewCopied} />
                              {excelViewCopied ? 'Tersalin!' : 'Salin Semua (TSV)'}
                          </button>
                      </div>
                      <div className="overflow-auto border border-border rounded-lg max-h-[70vh]">
                        <table ref={excelTableRef} className="w-full text-left table-auto border-collapse">
                          <thead className="bg-secondary sticky top-0 z-10">
                            <tr>
                              {['No.', 'Judul', 'Deskripsi', 'Hook', 'Narasi'].map(header => (
                                <th key={header} className="p-3 text-sm font-semibold text-muted-foreground border-b border-r border-border whitespace-nowrap">{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredIdeas.map((idea) => (
                              <tr key={idea.nomor} className="group hover:bg-muted/50">
                                <td className="p-2 border-b border-r border-border text-sm align-top text-center">{idea.nomor}</td>
                                <td className="p-2 border-b border-r border-border text-sm align-top">{idea.judul}</td>
                                <td className="p-2 border-b border-r border-border text-sm align-top">{idea.deskripsi}</td>
                                <td className="p-2 border-b border-r border-border text-sm align-top">{idea.hookText}</td>
                                <td className="p-2 border-b border-border text-sm align-top whitespace-pre-wrap">{idea.narasi}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                  </div>
                ) : (
                <>
                {/* Desktop View */}
                <div className="overflow-x-auto hidden md:block">
                    <table className="w-full text-left table-fixed">
                      <thead className="bg-secondary">
                        <tr>
                          <th className="p-2 w-[4%] text-center"></th>
                          <th className="p-4 w-[4%] text-center">
                            <input
                                type="checkbox"
                                onChange={handleToggleSelectAll}
                                checked={filteredIdeas.length > 0 && filteredIdeas.every(idea => selectedIdeas.has(idea.nomor))}
                                disabled={isAnyStoryGenerating}
                                className="h-5 w-5 bg-background border-border text-primary rounded focus:ring-2 focus:ring-offset-secondary focus:ring-ring"
                            />
                          </th>
                          <th className="p-4 w-[5%] text-sm font-semibold text-muted-foreground">No.</th>
                          <th className="p-4 w-[25%] text-sm font-semibold text-muted-foreground">Judul</th>
                          <th className="p-4 w-[30%] text-sm font-semibold text-muted-foreground">Deskripsi Singkat</th>
                          <th className="p-4 w-[20%] text-sm font-semibold text-muted-foreground">Hook</th>
                          <th className="p-4 w-[10%] text-sm font-semibold text-muted-foreground">Aksi</th>
                          <th className="p-4 w-[6%] text-sm font-semibold text-muted-foreground text-center">Release</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIdeas.map((idea) => {
                          const isExpanded = expandedIdeaIds.has(idea.nomor);
                          const narrationStats = getNarrationStats(idea.narasi, idea.lastUsedPromptTemplate);
                          return (
                          <React.Fragment key={idea.nomor}>
                            <tr className={`border-t border-border transition-colors ${getRowClass(idea)}`}>
                                <td className="p-2 align-middle text-center">
                                    <button onClick={() => handleToggleExpand(idea.nomor)} className="p-1 rounded-full hover:bg-secondary text-muted-foreground">
                                        <ChevronDownIcon isExpanded={isExpanded} />
                                    </button>
                                </td>
                                <td className="p-4 align-middle text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIdeas.has(idea.nomor)}
                                        onChange={() => handleToggleSelect(idea.nomor)}
                                        disabled={isAnyStoryGenerating}
                                        className="h-5 w-5 bg-background border-border text-primary rounded focus:ring-2 focus:ring-offset-card focus:ring-ring"
                                    />
                                </td>
                                <td className="p-4 align-middle text-muted-foreground font-medium">{idea.nomor}</td>
                                <td className="p-4 align-middle font-semibold cursor-pointer relative group break-words" onClick={() => handleToggleSelect(idea.nomor)}>
                                    <span>{idea.judul}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCopyTitleText(idea.judul, idea.nomor); }}
                                        className="absolute top-2 right-2 p-1.5 bg-secondary rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 hover:bg-muted"
                                        title="Salin judul"
                                    >
                                        <CopyIcon copied={copiedTitleIndex === idea.nomor} />
                                    </button>
                                </td>
                                <td className="p-4 align-middle text-sm relative group break-words">
                                    <span>{idea.deskripsi}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCopyDescription(idea.deskripsi, idea.nomor); }}
                                        className="absolute top-2 right-2 p-1.5 bg-secondary rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 hover:bg-muted"
                                        title="Salin deskripsi"
                                    >
                                        <CopyIcon copied={copiedDescIndex === idea.nomor} />
                                    </button>
                                </td>
                                <td className="p-4 align-middle text-sm relative group break-words">
                                    <span className="text-blue-400 dark:text-blue-300">{idea.hookText}</span>
                                    {idea.hookText && <button
                                        onClick={(e) => { e.stopPropagation(); handleCopyHook(idea.hookText, idea.nomor); }}
                                        className="absolute top-2 right-2 p-1.5 bg-secondary rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 hover:bg-muted"
                                        title="Salin hook"
                                    >
                                        <CopyIcon copied={copiedHookIndex === idea.nomor} />
                                    </button>}
                                </td>
                                <td className="p-4 align-middle">
                                    {idea.isGeneratingStory ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Spinner size="4" />
                                            <span>Generating...</span>
                                        </div>
                                    ) : (idea.narasi) ? (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => handleGenerateForIdea(idea)}
                                            disabled={isAnyStoryGenerating}
                                            className="bg-primary/80 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed"
                                            title={`Generate ulang untuk: ${idea.judul}`}
                                        >
                                            Generate Ulang
                                        </button>
                                        <button
                                            onClick={() => handleToggleExpand(idea.nomor)}
                                            className="bg-secondary text-secondary-foreground text-xs font-bold py-1.5 px-3 rounded-md hover:bg-muted transition-colors duration-200"
                                            title={`Lihat hasil untuk: ${idea.judul}`}
                                        >
                                            {isExpanded ? 'Tutup Hasil' : 'Lihat Hasil'}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleGenerateForIdea(idea)}
                                        disabled={isAnyStoryGenerating}
                                        className="bg-primary text-primary-foreground text-xs font-bold py-1.5 px-3 rounded-md hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed"
                                        title={`Generate untuk: ${idea.judul}`}
                                    >
                                        Generate
                                    </button>
                                )}
                                </td>
                                <td className="p-4 align-middle text-center">
                                    <input
                                        type="checkbox"
                                        checked={!!idea.sudahRelease}
                                        onChange={() => handleToggleReleaseStatus(idea.nomor)}
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={isAnyStoryGenerating}
                                        className="h-5 w-5 bg-background border-border text-primary rounded focus:ring-2 focus:ring-offset-card focus:ring-primary cursor-pointer"
                                    />
                                </td>
                            </tr>
                            {isExpanded && (
                                <tr className="bg-secondary/30">
                                    <td colSpan={8} className="p-0 border-l-4 border-primary">
                                        <div className="p-6">
                                            {idea.isGeneratingStory ? (
                                                <div className="text-center py-10">
                                                    <Spinner size="12" />
                                                    <p className="mt-4 text-muted-foreground">Membuat narasi... Proses ini mungkin memakan waktu.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    {ideaError && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{ideaError}</p>}
                                                    
                                                    <div className="space-y-4 bg-card/50 border border-border rounded-lg p-4">
                                                        <div>
                                                            <label htmlFor={`judul-edit-${idea.nomor}`} className="text-xs font-semibold text-muted-foreground uppercase">Judul</label>
                                                            <input
                                                                id={`judul-edit-${idea.nomor}`}
                                                                type="text"
                                                                value={idea.judul}
                                                                onChange={(e) => handleInputChange(idea.nomor, 'judul', e.target.value)}
                                                                className="text-xl font-bold bg-transparent border-0 border-b-2 border-border/50 focus:border-primary focus:ring-0 focus:outline-none p-1 w-full transition-colors duration-200"
                                                                aria-label="Edit Judul"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label htmlFor={`hook-edit-${idea.nomor}`} className="text-xs font-semibold text-muted-foreground uppercase">Hook Text</label>
                                                            <input
                                                                id={`hook-edit-${idea.nomor}`}
                                                                type="text"
                                                                value={idea.hookText || ''}
                                                                onChange={(e) => handleInputChange(idea.nomor, 'hookText', e.target.value)}
                                                                placeholder="Tulis hook di sini..."
                                                                className="text-sm font-semibold text-blue-400 dark:text-blue-300 bg-transparent border-0 border-b-2 border-border/50 focus:border-primary focus:ring-0 focus:outline-none p-1 w-full transition-colors duration-200"
                                                                aria-label="Edit Hook Text"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="bg-card/50 border border-border rounded-lg p-4">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h4 className="text-base font-semibold">Narasi</h4>
                                                            <div className="flex items-center gap-4">
                                                                <button
                                                                    onClick={() => handleOpenPromptModal(idea)}
                                                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                                                                >
                                                                    <BookOpenIcon />
                                                                    Lihat Prompt
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCopyNarration(idea)}
                                                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                                                                >
                                                                    <CopyIcon copied={narrationCopied} />
                                                                    {narrationCopied ? 'Tersalin!' : 'Salin'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <AutoSizingTextarea
                                                            value={idea.narasi || ''}
                                                            onChange={(e) => handleInputChange(idea.nomor, 'narasi', e.target.value)}
                                                            placeholder="Tulis atau edit narasi di sini..."
                                                            className="w-full bg-background/50 border border-border focus:ring-2 focus:ring-primary focus:outline-none rounded-md p-2 transition-all duration-200 text-sm leading-relaxed text-foreground/80 overflow-y-hidden"
                                                            aria-label="Edit Narasi"
                                                        />
                                                         <div className="text-right text-xs text-muted-foreground mt-1 font-mono">
                                                            {narrationStats.words} kata / {narrationStats.chars} karakter
                                                        </div>
                                                    </div>
                                                    
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                          </React.Fragment>
                        )})}
                      </tbody>
                    </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-4 p-2">
                    {filteredIdeas.map((idea) => {
                        const isExpanded = expandedIdeaIds.has(idea.nomor);
                        const narrationStats = getNarrationStats(idea.narasi, idea.lastUsedPromptTemplate);

                        return (
                            <div key={idea.nomor} className={`bg-card border border-border rounded-lg shadow-sm transition-all duration-300 ${getRowClass(idea)}`}>
                                <div className="flex items-start p-3" onClick={() => handleToggleExpand(idea.nomor)}>
                                    <div className="flex items-center pt-1 pr-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedIdeas.has(idea.nomor)}
                                            onChange={() => handleToggleSelect(idea.nomor)}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={isAnyStoryGenerating}
                                            className="h-5 w-5 bg-background border-border text-primary rounded focus:ring-2 focus:ring-offset-card focus:ring-ring"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold break-words">{idea.nomor}. {idea.judul}</p>
                                        <p className="text-xs text-muted-foreground mt-1 break-words">{idea.deskripsi}</p>
                                        {idea.hookText && <p className="text-sm text-blue-400 dark:text-blue-300 mt-1 break-words">{idea.hookText}</p>}
                                    </div>
                                    <div className="ml-2 flex flex-col items-center gap-2">
                                        <button className="p-1 rounded-full hover:bg-secondary text-muted-foreground">
                                            <ChevronDownIcon isExpanded={isExpanded} />
                                        </button>
                                        <input
                                            type="checkbox"
                                            title={idea.sudahRelease ? "Tandai sebagai 'Belum Release'" : "Tandai sebagai 'Sudah Release'"}
                                            checked={!!idea.sudahRelease}
                                            onChange={() => handleToggleReleaseStatus(idea.nomor)}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={isAnyStoryGenerating}
                                            className="h-5 w-5 bg-background border-border text-primary rounded focus:ring-2 focus:ring-offset-card focus:ring-primary cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="p-4 border-t border-border bg-secondary/30">
                                        <div className="space-y-4">
                                            {idea.isGeneratingStory ? (
                                                <div className="text-center py-5">
                                                    <Spinner size="8" />
                                                    <p className="mt-2 text-sm text-muted-foreground">Generating...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-end items-center gap-4">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleOpenPromptModal(idea); }}
                                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                        >
                                                            <BookOpenIcon />
                                                            Prompt
                                                        </button>
                                                        {idea.narasi && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleCopyNarration(idea); }}
                                                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                            >
                                                                <CopyIcon copied={narrationCopied} />
                                                                {narrationCopied ? 'Tersalin!' : 'Salin'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {(idea.narasi) ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleGenerateForIdea(idea); }}
                                                            disabled={isAnyStoryGenerating}
                                                            className="w-full bg-primary/80 text-white text-sm font-bold py-2 px-3 rounded-md hover:bg-primary/90 disabled:bg-primary/50"
                                                        >
                                                            Generate Ulang Narasi
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleGenerateForIdea(idea); }}
                                                            disabled={isAnyStoryGenerating}
                                                            className="w-full bg-primary text-primary-foreground text-sm font-bold py-2 px-3 rounded-md hover:bg-primary/90 disabled:bg-primary/50"
                                                        >
                                                            Generate Narasi
                                                        </button>
                                                    )}

                                                    {idea.narasi && (
                                                      <div>
                                                        <AutoSizingTextarea
                                                            value={idea.narasi}
                                                            onChange={(e) => { e.stopPropagation(); handleInputChange(idea.nomor, 'narasi', e.target.value); }}
                                                            className="w-full bg-background/50 border border-border focus:ring-2 focus:ring-primary focus:outline-none rounded-md p-2 text-sm overflow-y-hidden"
                                                            aria-label="Edit Narasi"
                                                        />
                                                        <div className="text-right text-xs text-muted-foreground mt-1 font-mono">
                                                            {narrationStats.words} kata / {narrationStats.chars} karakter
                                                        </div>
                                                      </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                </>
                )}


                <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                      {selectedIdeas.size > 0 && (
                        <>
                            <p className="text-sm font-semibold">{selectedIdeas.size} ide terpilih</p>
                            <button
                                onClick={handleGenerateSelectedStories}
                                disabled={isAnyStoryGenerating}
                                className="flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-semibold py-2 px-4 rounded-lg hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors duration-200"
                            >
                                <SparklesIcon />
                                Generate Terpilih
                            </button>
                             <button
                                onClick={() => setIsDeleteConfirmOpen(true)}
                                disabled={isAnyStoryGenerating}
                                className="flex items-center justify-center gap-2 bg-destructive text-destructive-foreground text-sm font-semibold py-2 px-4 rounded-lg hover:bg-destructive/90 disabled:bg-destructive/50 disabled:cursor-not-allowed transition-colors"
                            >
                                <TrashIcon />
                                Hapus Terpilih
                            </button>
                        </>
                      )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex flex-col gap-1">
                          <label htmlFor="num-more-ideas" className="text-xs font-medium">Tambah Ide Baru</label>
                          <input
                              type="number"
                              id="num-more-ideas"
                              value={numMoreIdeas}
                              onChange={(e) => setNumMoreIdeas(parseInt(e.target.value, 10) || 1)}
                              min="1"
                              max="50"
                              className="w-24 bg-secondary border border-border rounded-lg p-2 focus:ring-2 focus:ring-ring focus:outline-none transition-colors duration-200"
                              disabled={isGeneratingMoreIdeas || isGeneratingIdeas || isAnyStoryGenerating}
                          />
                      </div>
                      <button
                          onClick={handleGenerateMoreIdeas}
                          disabled={isGeneratingMoreIdeas || isGeneratingIdeas || isAnyStoryGenerating}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-semibold py-3 px-6 rounded-lg hover:bg-muted disabled:bg-secondary/50 disabled:cursor-not-allowed transition-colors"
                          >
                          {isGeneratingMoreIdeas ? <><Spinner size="5"/> Generating...</> : 'Generate Lebih Banyak'}
                      </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default NarrationGenerator;
