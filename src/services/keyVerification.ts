/**
 *
 * Onboarding used to accept any string and thank you for it: a typo only
 * surfaced later, as a model that quietly fell back to offline synthesis. These
 * checks are deliberately *cheap* — a model listing and a one-word synthesis —
 * so they can run while the user watches, and they always answer with something
 * actionable instead of an HTTP code.
 */

export interface KeyCheck {
  ok: boolean;
  message: string;
}

/** Gemini: listing the models validates the key without spending tokens. */
export const verifyGeminiKey = async (apiKey: string): Promise<KeyCheck> => {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'No key entered' };
  if (key.length < 20) return { ok: false, message: 'Key looks too short' };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );
    if (response.ok) {
      const data = await response.json().catch(() => null);
      const count = Array.isArray(data?.models) ? data.models.length : 0;
      return {
        ok: true,
        message: count > 0 ? `Neural core online — ${count} models` : 'Neural core online',
      };
    }
    if (response.status === 400 || response.status === 403) {
      return { ok: false, message: 'Key rejected by Google' };
    }
    if (response.status === 429) {
      return { ok: false, message: 'Key valid but quota is exhausted' };
    }
    return { ok: false, message: `Google answered ${response.status}` };
  } catch {
    return { ok: false, message: 'Could not reach Google (offline?)' };
  }
};

/** Does the store already look like a usable Gemini key? (No network call.) */
export const looksLikeGeminiKey = (apiKey: string | undefined): boolean =>
  !!apiKey && apiKey.trim().length >= 20;

export { verifyFishAudioKey } from './fishAudioService';
