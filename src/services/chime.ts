/**
 * Jarvis-style UI chimes — synthesized in pure JavaScript (a tiny PCM WAV
 * generator), so they cost no assets, no native module and no OTA runtime
 * change. Three sounds cover the voice-mode choreography:
 *  - `boot`:  the two-note rising hook played when voice mode opens,
 *  - `wake`:  a short blip when the mic is armed,
 *  - `ack`:   a lower confirmation when a reply arrives.
 *
 * Playback goes through the same expo-audio layer as the TTS clips (data URI),
 * and every call is best-effort: a chime that cannot play must never break the
 * flow it decorates.
 */
import { Platform } from 'react-native';

type ToneSpec = {
  freq: number;
  /** Relative start of this tone, in seconds. */
  at: number;
  dur: number;
  gain: number;
  /** Additive overtone richness (1 = pure sine, up to 3 = JARVIS-ish timbre). */
  harmonics?: number;
};

export type ChimeName = 'boot' | 'wake' | 'ack';

const RECIPES: Record<ChimeName, ToneSpec[]> = {
  boot: [
    { freq: 392, at: 0, dur: 0.14, gain: 0.5, harmonics: 2 }, // G4
    { freq: 587.33, at: 0.13, dur: 0.22, gain: 0.55, harmonics: 3 }, // D5
    { freq: 784, at: 0.26, dur: 0.3, gain: 0.4, harmonics: 2 }, // G5 sparkle
  ],
  wake: [{ freq: 880, at: 0, dur: 0.07, gain: 0.35, harmonics: 1 }],
  ack: [
    { freq: 523.25, at: 0, dur: 0.1, gain: 0.4, harmonics: 2 }, // C5
    { freq: 392, at: 0.09, dur: 0.16, gain: 0.32, harmonics: 2 }, // G4
  ],
};

const SAMPLE_RATE = 22050;

/** Render the chime to a 16-bit mono PCM WAV, returned as a base64 data URI. */
const renderWav = (name: ChimeName): string => {
  const tones = RECIPES[name];
  const totalSec = Math.max(...tones.map((s) => s.at + s.dur)) + 0.05;
  const frames = Math.ceil(totalSec * SAMPLE_RATE);
  const samples = new Float32Array(frames);

  for (const tone of tones) {
    const start = Math.floor(tone.at * SAMPLE_RATE);
    const len = Math.floor(tone.dur * SAMPLE_RATE);
    const harmonics = tone.harmonics ?? 1;
    for (let i = 0; i < len && start + i < frames; i++) {
      const s = i / SAMPLE_RATE;
      // Soft attack, exponential decay — the classic "glass ping".
      const env = Math.min(1, s / 0.008) * Math.exp(-s * 9);
      let sample = 0;
      for (let h = 1; h <= harmonics; h++) {
        sample += Math.sin(2 * Math.PI * tone.freq * h * s) / h;
      }
      samples[start + i] += sample * env * tone.gain * 0.5;
    }
  }

  const dataSize = frames * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v * 0x7fff, true);
  }

  // ArrayBuffer → base64 without Buffer (Hermes has no Buffer).
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = typeof btoa === 'function' ? btoa(binary) : global.btoa(binary);
  return `data:audio/wav;base64,${b64}`;
};

const cache = new Map<ChimeName, string>();
const getChimeUri = (name: ChimeName): string => {
  let uri = cache.get(name);
  if (!uri) {
    uri = renderWav(name);
    cache.set(name, uri);
  }
  return uri;
};

/** Fire-and-forget chime; resolves true if playback actually started. */
export const playChime = async (name: ChimeName): Promise<boolean> => {
  try {
    const { createAudioPlayer } = await import('expo-audio');
    const player = createAudioPlayer({ uri: getChimeUri(name) });
    player.play();
    // Players are tiny (~0.5 s); release them once the tail has passed.
    setTimeout(() => {
      try {
        player.release();
      } catch {
        // Already gone.
      }
    }, 1500);
    return true;
  } catch {
    // Decorative only — never let a chime break the flow.
    return false;
  }
};

/** Whether chimes are worth trying on this platform (web has no expo-audio). */
export const chimesSupported = (): boolean => Platform.OS !== 'web';
