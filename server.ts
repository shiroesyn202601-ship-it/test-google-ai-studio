import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1500
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const rawMsg = error?.message || String(error);
      const isTransient =
        rawMsg.includes('429') ||
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('503') ||
        rawMsg.includes('UNAVAILABLE') ||
        rawMsg.includes('500') ||
        rawMsg.includes('INTERNAL');
      if (!isTransient || attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function generateWithCascade(
  ai: GoogleGenAI,
  buildConfig: (model: string) => any
): Promise<any> {
  let lastError: any = null;

  for (const model of TEXT_MODELS) {
    try {
      const config = buildConfig(model);
      const response = await ai.models.generateContent(config);
      return response;
    } catch (error: any) {
      lastError = error;
      const rawMsg = error?.message || String(error);
      console.warn(`[Gemini] Model ${model} failed with message: ${rawMsg.substring(0, 150)}... Trying next fallback if applicable.`);
      
      const isQuotaOrTransient =
        rawMsg.includes('429') ||
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('503') ||
        rawMsg.includes('UNAVAILABLE') ||
        rawMsg.includes('500') ||
        rawMsg.includes('INTERNAL');

      if (!isQuotaOrTransient) {
        // Break early if it's a fatal client error like bad schema or bad auth
        if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('401') || rawMsg.includes('403')) {
          throw error;
        }
      }
      // If quota or transient, try next model in cascade
    }
  }

  throw lastError;
}

function extractErrorMessage(error: any, defaultMsg: string): string {
  if (!error) return defaultMsg;
  const rawMsg = typeof error === 'string' ? error : error.message || '';

  // Look for JSON payload in "ApiError: { ... }" or "{ ... }"
  const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) {
        if (parsed.error.code === 429 || parsed.error.status === 'RESOURCE_EXHAUSTED') {
          return 'Batas kuota sementara tercapai. Mohon tunggu beberapa detik lalu coba lagi.';
        }
        return parsed.error.message;
      }
    } catch {
      // ignore json parse error
    }
  }

  if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
    return 'Batas kuota sementara tercapai. Mohon tunggu beberapa detik lalu coba lagi.';
  }
  if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
    return 'Server sedang mengalami lonjakan permintaan sementara. Silakan coba sesaat lagi.';
  }

  return rawMsg || defaultMsg;
}

function fallbackExtractHook(narration: string): string {
  if (!narration) return '';
  const firstSentence = narration.split(/[.!?\n]/)[0]?.trim() || narration.trim();
  const words = firstSentence.split(/\s+/).slice(0, 9).join(' ');
  return words ? words + '...' : 'Fakta Menarik Yang Mengejutkan!';
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasKey: !!apiKey });
  });

  // 1. Generate viral ideas
  app.post('/api/viral-ideas', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const response = await generateWithCascade(ai, (model) => ({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nomor: { type: Type.INTEGER, description: 'Nomor urut ide' },
                judul: { type: Type.STRING, description: 'Judul video yang menarik' },
                deskripsi: { type: Type.STRING, description: 'Deskripsi singkat tentang ide konten' },
              },
              required: ['nomor', 'judul', 'deskripsi'],
            },
          },
        },
      }));

      let jsonText = (response.text || '').trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const ideas = JSON.parse(jsonText);
      res.json({ ideas });
    } catch (error: any) {
      console.error('Error generating viral ideas:', error);
      res.status(500).json({
        error: extractErrorMessage(error, 'Gagal membuat ide viral. Silakan coba lagi.'),
      });
    }
  });

  // 2. Generate narration
  app.post('/api/narration', async (req, res) => {
    try {
      const { prompt, temperature, topP } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const response = await generateWithCascade(ai, (model) => ({
        model,
        contents: prompt,
        config: {
          temperature: typeof temperature === 'number' ? temperature : 0.7,
          topP: typeof topP === 'number' ? topP : 0.95,
        },
      }));

      res.json({ narration: response.text || '' });
    } catch (error: any) {
      console.error('Error generating narration:', error);
      res.status(500).json({
        error: extractErrorMessage(error, 'Gagal membuat narasi.'),
      });
    }
  });

  // 3. Generate hook text
  app.post('/api/hook-text', async (req, res) => {
    const { narration } = req.body;
    if (!narration) {
      return res.status(400).json({ error: 'Narration is required' });
    }

    try {
      const prompt = `Berdasarkan cerita berikut, buatkan satu kalimat hook yang sangat pendek (maksimal 7-10 kata), clickbait, dan membuat penasaran untuk thumbnail video. PENTING: Pastikan tidak ada salah ketik (typo) dan gunakan bahasa Indonesia yang baik dan benar. Berikan HANYA teks hook-nya saja, tanpa format tambahan seperti tanda kutip atau asterisks.

Cerita:
"${narration}"`;

      const response = await generateWithCascade(ai, (model) => ({
        model,
        contents: prompt,
      }));

      const cleanText = (response.text || '').trim().replace(/["*]/g, '');
      res.json({ hookText: cleanText || fallbackExtractHook(narration) });
    } catch (error: any) {
      console.warn('Error generating hook text with AI, using fallback hook:', error?.message);
      // Graceful fallback to avoid breaking the idea generation flow
      const fallback = fallbackExtractHook(narration);
      res.json({ hookText: fallback });
    }
  });

  // 4. Generate audio (TTS)
  app.post('/api/generate-audio', async (req, res) => {
    try {
      const { narration, voice, styleInstruction } = req.body;
      if (!narration) {
        return res.status(400).json({ error: 'Narration is required' });
      }

      const voiceName = voice || 'Zephyr';
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: narration,
                  speechMetadata: {
                    style: styleInstruction || 'Clear, professional news anchor',
                  },
                } as any,
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
              },
            },
          },
        })
      );

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/pcm;rate=24000';

      if (!audioData) {
        return res.status(500).json({ error: 'No audio data received from model.' });
      }

      res.json({ audioData, mimeType });
    } catch (error: any) {
      console.error('Error generating audio:', error);
      res.status(500).json({
        error: extractErrorMessage(error, 'Gagal membuat audio.'),
      });
    }
  });

  // 5. Clean image and add text
  app.post('/api/clean-image', async (req, res) => {
    try {
      const { imageBase64, mimeType, hookText, aspectRatio, stylePreference } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }

      const defaultStyleInstruction =
        "Tambahkan teks berikut ke gambar yang sudah bersih dengan gaya font yang SANGAT MENONJOL, SINEMATIK, INDAH, dan MUDAH DIBACA yang cocok untuk thumbnail video viral. Posisikan teks secara strategis untuk dampak maksimal. Terapkan efek visual seperti bayangan, garis luar, atau gradien agar teksnya benar-benar 'pop out' dari latar belakang.";
      const stylePrompt = stylePreference?.trim()
        ? `\n\nPertimbangkan juga preferensi gaya tambahan dari pengguna ini: "${stylePreference}"`
        : '';

      const prompt = `Anda adalah seorang desainer thumbnail profesional. Tugas Anda adalah melakukan tugas-tugas berikut:
1. Ubah rasio aspek gambar menjadi ${aspectRatio || '16:9'}. Pangkas gambar secara cerdas jika perlu untuk mempertahankan elemen visual utama.
2. Hapus teks: identifikasi dan hapus SEMUA teks atau subtitle yang ada pada gambar asli.
3. Tambahkan teks baru: ${defaultStyleInstruction} ${stylePrompt}
Teks yang harus ada di gambar: "${hookText || ''}"
Hasilkan gambar thumbnail berkualitas tinggi, dramatis, dan sangat menarik.`;

      let targetAspectRatio: '16:9' | '9:16' | '1:1' | '3:4' | '4:3' = '16:9';
      if (aspectRatio === '9:16' || aspectRatio === '1:1' || aspectRatio === '3:4' || aspectRatio === '4:3') {
        targetAspectRatio = aspectRatio;
      } else if (aspectRatio === '4:5') {
        targetAspectRatio = '3:4';
      }

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: mimeType || 'image/jpeg',
                },
              },
              { text: prompt },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: targetAspectRatio,
            },
          },
        })
      );

      const images: string[] = [];
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData?.data) {
            const partMime = part.inlineData.mimeType || 'image/png';
            images.push(`data:${partMime};base64,${part.inlineData.data}`);
          }
        }
      }

      if (images.length === 0) {
        return res.status(500).json({ error: 'Tidak ada gambar yang dihasilkan oleh model.' });
      }

      res.json({ images });
    } catch (error: any) {
      console.error('Error cleaning image and adding text:', error);
      res.status(500).json({
        error: extractErrorMessage(error, 'Gagal membuat gambar thumbnail.'),
      });
    }
  });

  // 6. Generate video from image
  app.post('/api/generate-video', async (req, res) => {
    try {
      const { prompt, imageBase64, mimeType, model } = req.body;
      let targetModel = model || 'veo-3.1-lite-generate-preview';
      if (targetModel.includes('2.0') || !targetModel.startsWith('veo-3.1')) {
        targetModel = 'veo-3.1-lite-generate-preview';
      }

      const operation = await withRetry(() =>
        ai.models.generateVideos({
          model: targetModel,
          prompt: prompt || 'A cinematic high quality video',
          image: {
            imageBytes: imageBase64,
            mimeType: mimeType || 'image/png',
          },
          config: {
            numberOfVideos: 1,
          },
        })
      );

      res.json({ operation });
    } catch (error: any) {
      console.error('Error starting video generation:', error);
      res.status(500).json({
        error: extractErrorMessage(error, 'Gagal memulai proses pembuatan video.'),
      });
    }
  });

  // 7. Check video operation status
  app.post('/api/video-status', async (req, res) => {
    try {
      const { operation } = req.body;
      const updatedOperation = await withRetry(() =>
        ai.operations.getVideosOperation({ operation })
      );
      res.json({ updatedOperation });
    } catch (error: any) {
      console.error('Error checking video operation status:', error);
      res.status(500).json({
        error: extractErrorMessage(error, 'Gagal memeriksa status pembuatan video.'),
      });
    }
  });

  // Vite development middleware or static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/{*splat}', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
          return next();
        }
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
