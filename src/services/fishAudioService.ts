import { fetchWithTimeout } from './network';
import { Platform } from 'react-native';
import { playRemoteAudio, stopPlaybackAudio } from './audioPlayback';

const TTS_URL = 'https://api.fish.audio/v1/tts';

/**
 * `s2.1-pro-free` is Fish's free developer tier; the paid models bill per
 * character. Kept as a constant so a paying user can switch without a code
 * change (the header also accepts s1 / s2-pro / s2.1-pro).
 */
export const FISH_MODEL = 's2.1-pro-free';

/**
 * Public community voice models on fish.audio, by reference id. `reference_id`
 * is the model id from a voice's page URL (fish.audio/m/<id>).
 *
 * JARVIS is the point of this engine: a British butler baritone for English
 * and the deep French take for French. They are two different models — one does
 * not switch language convincingly — so the language picks the voice, and the
 * user can override either id in Settings.
 */
export const JARVIS_VOICE_MODELS = {
  en: {
    id: '612b878b113047d9a770c069c8b4fdfe',
    label: 'JARVIS (MCU)',
    detail: 'Butler britannique, anglais',
  },
  fr: {
    id: 'e9362f63a00c41209aec3851a8c30ea8',
    label: 'JARVIS FR',
    detail: 'Grave, accent français',
  },
} as const;

export type FishLanguage = keyof typeof JARVIS_VOICE_MODELS;

/** Best default voice for a BCP-47-ish tag ('fr-FR' → French). */
export const fishVoiceFor = (language: string | undefined): string => {
  const isFrench = (language || '').toLowerCase().startsWith('fr');
  return JARVIS_VOICE_MODELS[isFrench ? 'fr' : 'en'].id;
};

/** Is this reference id one of the bundled Jarvis voices? */
export const isJarvisVoice = (id: string | undefined): boolean =>
  !!id &&
  (id === JARVIS_VOICE_MODELS.en.id || id === JARVIS_VOICE_MODELS.fr.id);

export interface FishAudioOptions {
  text: string;
  apiKey: string;
  /** Voice model reference id. Falls back to the language's Jarvis voice. */
  referenceId?: string;
  language?: string;
  /** 0.5 – 2.0 speaking rate, folded into Fish's `prosody.speed`. */
  rate?: number;
  /** `low` trades a little quality for a noticeably faster first byte.
   *  It is the default: in a voice conversation the silence before the first
   *  word is felt far more than the codec difference. */
  latency?: 'low' | 'balanced' | 'normal';
}

export interface FishAudioCallbacks {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

interface FishRequestBody {
  text: string;
  reference_id: string;
  format: string;
  latency: string;
  temperature: number;
  top_p: number;
  normalize: boolean;
  chunk_length: number;
  prosody: { speed: number };
}

const buildBody = (options: FishAudioOptions, text: string): FishRequestBody => ({
  text,
  reference_id: options.referenceId || fishVoiceFor(options.language),
  format: 'mp3',
  latency: options.latency || 'low',
  temperature: 0.7,
  top_p: 0.7,
  // Improves stability of numbers and dates in English and French.
  normalize: true,
  chunk_length: 300,
  prosody: { speed: Math.min(2, Math.max(0.5, options.rate || 1)) },
});

/**
 * Check a Fish Audio key without burning a full synthesis: a one-word request
 * either returns audio (key good) or a 401/403 (key bad). Rejections are
 * translated into something a human can act on, because "401" tells a user
 * nothing about whether they pasted a key at all.
 */
/**
 * Fish Audio has no CORS headers, which means a browser cannot call the API at
 * all — the request dies in the preflight before the key is ever looked at. On
 * a phone there is no such restriction. Detecting it matters: otherwise every
 * web user is told their perfectly good key was rejected.
 */
export const FISH_WEB_BLOCKED =
  'Direct calls are blocked by the browser (CORS). The neural voice works in the Android/iOS build; on web the system voice is used instead.';

const isBrowserNetworkBlock = (error: unknown): boolean =>
  error instanceof TypeError ||
  (typeof error === 'object' && error !== null && String((error as Error).message || '').includes('Failed to fetch'));

export const verifyFishAudioKey = async (
  apiKey: string
): Promise<{ ok: boolean; message: string }> => {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'No key entered' };
  if (key.length < 16) return { ok: false, message: 'Key looks too short' };

  try {
    const response = await fetchWithTimeout(TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: FISH_MODEL,
      },
      body: JSON.stringify(buildBody({ text: 'ok', apiKey: key }, 'ok')),
    });

    if (response.ok) return { ok: true, message: 'Voice synthesis online' };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'Key rejected by Fish Audio' };
    }
    if (response.status === 402) {
      return { ok: false, message: 'Key valid but the account has no credit' };
    }
    if (response.status === 429) {
      return { ok: false, message: 'Key valid but rate limited — retry later' };
    }
    return { ok: false, message: `Fish Audio answered ${response.status}` };
  } catch (error) {
    if (Platform.OS === 'web' && isBrowserNetworkBlock(error)) {
      return { ok: false, message: FISH_WEB_BLOCKED };
    }
    return { ok: false, message: 'Could not reach Fish Audio (offline?)' };
  }
};

class FishAudioService {
  async stopAudio(): Promise<void> {
    await stopPlaybackAudio();
  }

  /**
   * Synthesize and play. Resolves `true` when playback was handed to the audio
   * layer, `false` when it never started (the caller then falls back to the
   * system voice instead of going silent).
   */
  async speak(options: FishAudioOptions, callbacks?: FishAudioCallbacks): Promise<boolean> {
    const text = options.text.trim();
    if (!options.apiKey?.trim() || !text) return false;

    await this.stopAudio();

    try {
      const response = await fetchWithTimeout(TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey.trim()}`,
          'Content-Type': 'application/json',
          model: FISH_MODEL,
        },
        body: JSON.stringify(buildBody(options, text)),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Fish Audio ${response.status}: ${detail.slice(0, 160)}`);
      }

      // Both platforms: the shared playback module caches the mp3 and plays it
      // (Web Audio on web, expo-audio on native). Resolves false when playback
      // never started — the caller then falls back to the system voice.
      // `onStart` is forwarded, not called here: the response arriving is not
      // the same thing as the voice being audible.
      return playRemoteAudio(response, 'fish', {
        onStart: callbacks?.onStart,
        onDone: callbacks?.onDone,
        onError: callbacks?.onError,
      });
    } catch (error) {
      if (Platform.OS === 'web' && isBrowserNetworkBlock(error)) {
        console.warn(`Fish Audio unavailable here: ${FISH_WEB_BLOCKED}`);
      } else {
        console.warn('Fish Audio TTS error:', error);
      }
      // Returning false (rather than throwing) is what lets the caller fall
      // back to the system voice: no key, no credit, no browser — always heard.
      callbacks?.onError?.(error);
      return false;
    }
  }

  /**
   * Sentence-streamed speaking — the perceived-latency lever.
   *
   * The naive path waits for the *whole* reply to be synthesized before a
   * single audible word; Fish regularly needs seconds for a paragraph. Here the
   * text is split into sentences and spoken as a chain: clip 1 is requested
   * immediately, and each next clip is requested while the previous one is
   * still playing (prefetch), so the network round-trips hide behind playback
   * instead of stacking in front of it.
   *
   * `onStart` fires when the first clip is actually audible; `onDone` when the
   * last clip finishes. Any failed clip degrades the *remaining* text to the
   * system voice by invoking `onSystemFallback(rest)` — the caller keeps one
   * voice for the whole turn.
   */
  async speakStreamed(
    options: FishAudioOptions & {
      /** Remaining text, handed to the system voice when Fish fails mid-turn. */
      onSystemFallback?: (remainingText: string) => void;
    },
    callbacks?: FishAudioCallbacks
  ): Promise<boolean> {
    const full = options.text.trim();
    if (!options.apiKey?.trim() || !full) return false;

    const sentences = splitSentences(full);
    if (sentences.length <= 1) {
      // One short utterance: streaming has nothing to overlap, use the simple
      // path (its error handling stays the single source of truth).
      return this.speak(options, callbacks);
    }

    let cancelled = false;
    let started = false;
    const firstStart = () => {
      if (started) return;
      started = true;
      callbacks?.onStart?.();
    };

    return new Promise<boolean>((resolve) => {
      void (async () => {
        let index = 0;
        // One clip in flight ahead of playback: enough to hide a round-trip,
        // small enough that a cancel wastes at most one synthesis.
        let prefetched: { sentence: string; response: Response } | null = null;

        const requestClip = async (sentence: string): Promise<Response> => {
          const response = await fetchWithTimeout(TTS_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey!.trim()}`,
              'Content-Type': 'application/json',
              model: FISH_MODEL,
            },
            body: JSON.stringify(buildBody(options, sentence)),
          });
          if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Fish Audio ${response.status}: ${detail.slice(0, 120)}`);
          }
          return response;
        };

        const prefetchNext = () => {
          if (cancelled || prefetched || index >= sentences.length) return;
          const sentence = sentences[index];
          requestClip(sentence)
            .then((response) => {
              prefetched = { sentence, response };
            })
            .catch(() => {
              // Leave `prefetched` empty: the play loop will retry once inline
              // and otherwise fall back for the rest.
            });
        };

        try {
          // Prime the very first clip before anything else — the latency the
          // user actually feels is this request plus nothing else.
          const first = sentences[index];
          const firstResponse = await requestClip(first);
          if (cancelled) {
            resolve(false);
            return;
          }
          index += 1;
          prefetchNext();

          while (index <= sentences.length) {
            const clip = prefetched ?? { sentence: sentences[index - 1], response: firstResponse };
            void clip;
            // Play the clip we have; refetch inline if prefetch lost it.
            const current =
              index === 1
                ? { sentence: first, response: firstResponse }
                : prefetched ?? null;
            if (!current) {
              const response = await requestClip(sentences[index - 1]);
              prefetched = { sentence: sentences[index - 1], response };
              continue;
            }
            prefetched = null;
            index += 1;
            prefetchNext();

            const played = await playRemoteAudio(current.response, 'fish', {
              onStart: firstStart,
              onDone: () => {
                if (index > sentences.length && !cancelled) {
                  callbacks?.onDone?.();
                  resolve(true);
                }
              },
              onError: () => {
                cancelled = true;
                callbacks?.onError?.(new Error('clip failed'));
                // Hand what was never spoken to the system voice.
                const rest = sentences.slice(index - 1).join(' ');
                options.onSystemFallback?.(rest || full);
                resolve(false);
              },
            });
            if (!played || cancelled) {
              if (!started) resolve(played);
              return;
            }
          }
        } catch (error) {
          console.warn('Fish Audio streamed TTS error:', error);
          callbacks?.onError?.(error);
          options.onSystemFallback?.(full);
          resolve(false);
        }
      })();
    });
  }
}

/**
 * Splits into speakable sentences. Boundaries: .!?… followed by space/end,
 * keeping the punctuation; very short fragments are merged so the synth does
 * not get one-word clips (they sound choppy and cost one request each).
 */
export const splitSentences = (text: string): string[] => {
  const raw = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…:])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const piece of raw) {
    const last = merged[merged.length - 1];
    if (last && (last.length < 24 || piece.length < 24)) {
      merged[merged.length - 1] = `${last} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged.length ? merged : [text];
};

export const fishAudioService = new FishAudioService();
