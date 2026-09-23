/**
 * looksLikeSelfEcho() is the deterministic filter that lets barge-in tell a
 * real interruption apart from the assistant's own voice bleeding back into
 * the microphone while it speaks (there is no hardware/software acoustic
 * echo cancellation available through Expo's audio APIs for this app).
 */
import { looksLikeSelfEcho } from '../src/core/voiceBargeIn';

describe('looksLikeSelfEcho', () => {
  it('treats a transcript that mostly repeats the spoken sentence as an echo', () => {
    const spoken = "J'ai organisé douze fichiers dans votre dossier Téléchargements avec succès.";
    const heard = 'organisé douze fichiers dans votre dossier';
    expect(looksLikeSelfEcho(heard, spoken)).toBe(true);
  });

  it('treats an unrelated interruption as real speech, not an echo', () => {
    const spoken = "J'ai organisé douze fichiers dans votre dossier Téléchargements avec succès.";
    const heard = 'attends, annule ça';
    expect(looksLikeSelfEcho(heard, spoken)).toBe(false);
  });

  it('is accent/case/punctuation-insensitive', () => {
    const spoken = 'Arrête, je continue plus tard.';
    const heard = 'ARRETE JE CONTINUE PLUS TARD';
    expect(looksLikeSelfEcho(heard, spoken)).toBe(true);
  });

  it('treats empty/whitespace-only transcripts as non-actionable (echo-like, ignored)', () => {
    expect(looksLikeSelfEcho('', 'anything SEVEN is saying')).toBe(true);
    expect(looksLikeSelfEcho('   ', 'anything SEVEN is saying')).toBe(true);
  });

  it('treats any heard words as real when nothing is currently being spoken', () => {
    expect(looksLikeSelfEcho('hello there', '')).toBe(false);
  });

  it('never filters an explicit short stop command even if SEVEN just said that word', () => {
    expect(looksLikeSelfEcho('stop', 'You can say stop at any time.')).toBe(false);
    expect(looksLikeSelfEcho('arrête', "Dites arrête pour annuler.")).toBe(false);
  });

  it('handles an English example the same way', () => {
    const spoken = 'The weather today in Antananarivo is sunny with a high of twenty six degrees.';
    expect(looksLikeSelfEcho('weather today in antananarivo is sunny', spoken)).toBe(true);
    expect(looksLikeSelfEcho('hey stop please', spoken)).toBe(false);
  });
});
