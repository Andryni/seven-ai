import { useState } from 'react';

/**
 * A form field that follows a persisted value.
 *
 * The saved configuration arrives asynchronously (SecureStore / localStorage),
 * so `useState(config.fishAudioApiKey)` captures the *default* on the first
 * render and never updates: the user opens Settings and sees empty key fields
 * for keys they did save. The obvious fix — an effect that writes the saved
 * value into state when it lands — is worse: it would overwrite whatever the
 * user had already typed while hydration was in flight.
 *
 * So the draft stays `null` until the field is actually edited, and the
 * displayed value is "what I typed, or else what is saved".
 */
export const useDraft = <T,>(saved: T) => {
  const [draft, setDraft] = useState<T | null>(null);
  return [draft ?? saved, setDraft] as const;
};
