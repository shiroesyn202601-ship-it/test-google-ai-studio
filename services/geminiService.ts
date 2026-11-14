import type { ViralIdea } from "../types";

// Helper functions for audio processing
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function createWavBlob(pcmData: Uint8Array, sampleRate = 24000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcmData);

  return new Blob([view], { type: 'audio/wav' });
}

export const generateViralIdeas = async (prompt: string): Promise<ViralIdea[]> => {
  try {
    const res = await fetch('/api/viral-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    if (!data.ideas || !Array.isArray(data.ideas)) {
      throw new Error("Format respons ide viral tidak valid.");
    }
    return data.ideas;
  } catch (error: any) {
    console.error("Error generating viral ideas:", error);
    throw new Error(error.message || "Gagal membuat ide viral. Silakan periksa konsol untuk detail.");
  }
};

export const generateNarration = async (prompt: string): Promise<string> => {
  try {
    const res = await fetch('/api/narration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data.narration;
  } catch (error: any) {
    console.error("Error generating narration:", error);
    throw new Error(error.message || "Failed to generate narration.");
  }
};

export const generateHookText = async (narration: string): Promise<string> => {
  try {
    const res = await fetch('/api/hook-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ narration }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data.hookText;
  } catch (error: any) {
    console.error("Error generating hook text:", error);
    throw new Error(error.message || "Failed to generate hook text.");
  }
};

export const generateAudio = async (
  narration: string,
  voice: string,
  styleInstruction: string
): Promise<string> => {
  try {
    const res = await fetch('/api/generate-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ narration, voice, styleInstruction }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    const { audioData, mimeType } = data;

    if (!audioData) {
      throw new Error("Tidak ada data audio yang diterima.");
    }

    const bytes = decode(audioData);
    let blob: Blob;

    if (mimeType && mimeType.includes('pcm')) {
      blob = createWavBlob(bytes, 24000);
    } else {
      blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
    }

    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error("Error generating audio:", error);
    throw new Error(error.message || "Gagal membuat audio.");
  }
};

export const cleanImageAndAddText = async (
  imageBase64: string,
  mimeType: string,
  hookText: string,
  aspectRatio: string,
  stylePreference: string
): Promise<string[]> => {
  try {
    const res = await fetch('/api/clean-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        hookText,
        aspectRatio,
        stylePreference,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
      throw new Error("Tidak ada gambar yang berhasil dibuat.");
    }
    return data.images;
  } catch (error: any) {
    console.error("Error cleaning image and adding text:", error);
    throw new Error(error.message || "Gagal membuat gambar thumbnail.");
  }
};

export const generateVideoFromImage = async (
  prompt: string,
  imageBase64: string,
  mimeType: string,
  model: string
) => {
  try {
    const res = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, imageBase64, mimeType, model }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data.operation;
  } catch (error: any) {
    console.error("Error starting video generation:", error);
    throw new Error(error.message || "Gagal memulai proses pembuatan video.");
  }
};

export const checkVideoOperationStatus = async (operation: any) => {
  try {
    const res = await fetch('/api/video-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data.updatedOperation;
  } catch (error: any) {
    console.error("Error checking video operation status:", error);
    throw new Error(error.message || "Gagal memeriksa status pembuatan video.");
  }
};
