/**
 * Barge-in support: interrupting SEVEN by simply talking over it, instead of
 * having to tap a stop button first.
 *
 * There is no hardware acoustic echo cancellation available through Expo's
 * audio APIs, so listening for an interruption while text-to-speech plays
 * through the speaker means the recognizer regularly hears fragments of
 * SEVEN's own sentence back through the microphone. `looksLikeSelfEcho`
 * gives the caller a cheap, deterministic way to tell the two apart: a real
 * interruption ("wait", "stop", a completely different question) shares
 * almost no words with the sentence currently being spoken, while an echo
 * is, by definition, mostly those same words. It is not perfect (a user
 * that happens to repeat several of SEVEN's own words back would be
 * filtered out), but it needs no audio DSP or native module and degrades
 * gracefully: worst case, a genuine short interruption is missed and the
 * conversation carries on exactly as it does today.
 */

/** Lowercases, strips accents/punctuation and splits into words. */
function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // fold accents: "arrête" ~ "arrete"
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * True when `heard` (whatever the recognizer just picked up) looks like
 * SEVEN's own voice bleeding back into the microphone rather than the user
 * actually saying something. `spokenText` is the sentence SEVEN is (or was)
 * speaking at the time.
 */
export function looksLikeSelfEcho(heard: string, spokenText: string): boolean {
  const heardWords = toWords(heard || '');
  if (heardWords.length === 0) return true; // nothing meaningful heard — ignore it

  // Short interruption commands must always win, even in the rare case where
  // SEVEN's sentence itself contains the same word (for example: "you can say
  // stop at any time"). Missing an explicit stop would be worse than one false
  // positive interruption.
  const interruptionWords = new Set([
    'stop',
    'pause',
    'wait',
    'cancel',
    'no',
    'arrete',
    'attends',
    'annule',
    'non',
    'silence',
  ]);
  if (heardWords.length <= 4 && heardWords.some((word) => interruptionWords.has(word))) return false;

  const spokenWords = new Set(toWords(spokenText || ''));
  if (spokenWords.size === 0) return false; // nothing being said — cannot be an echo of it

  const overlap = heardWords.filter((w) => spokenWords.has(w)).length;
  // 60%+ of the heard words already appear in the sentence being spoken:
  // treated as the assistant's own voice, not a real interruption.
  return overlap / heardWords.length >= 0.6;
}
