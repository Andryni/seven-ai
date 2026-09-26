/**
 * Viseme engine — turns the text SEVEN is speaking into a timed sequence of
 * mouth shapes so an avatar can articulate words instead of flapping its jaw
 * on a raw amplitude signal.
 *
 * It is deliberately lightweight (no ML, no network): graphemes and common
 * French/English digraphs are mapped to a small set of visemes, and each
 * viseme is given a duration derived from the TTS rate. Everything the avatar
 * needs to render is a continuous `MouthShape`, so the animation can be driven
 * by interpolated transform values (mouth opening, width, lip fullness).
 */

export type VisemeId =
  /** Closed / neutral mouth. */
  | 'rest'
  /** Open vowels: a, â, à. */
  | 'A'
  /** Spread vowels: e, é, è, ê, ai, ei. */
  | 'E'
  /** Narrow spread vowels: i, y. */
  | 'I'
  /** Rounded vowels: o, ô, au, eau, eu. */
  | 'O'
  /** Tight round vowels: u, ou. */
  | 'U'
  /** Semi-vowel w / french "oi". */
  | 'W'
  /** Bilabials — lips pressed shut: m, b, p. */
  | 'MBP'
  /** Labiodentals — lower lip on upper teeth: f, v, ph. */
  | 'FV'
  | 'L'
  | 'TH'
  /** Sibilants: s, z, c(e/i). */
  | 'S'
  /** Post-alveolars: ch, sh, j, gn. */
  | 'CH'
  /** Alveolars: t, d, n. */
  | 'T'
  /** Velars: k, g, q, x. */
  | 'K'
  | 'R';

/**
 * Continuous mouth parameters. All three are animatable through RN
 * transforms, which is why they are ratios rather than raw sizes.
 */
export interface MouthShape {
  /** Vertical lip separation: 0 = closed, 1 = fully open. */
  open: number;
  /** Horizontal stretch: ~0.7 = puckered, ~1.15 = spread wide. */
  width: number;
  /** Lip fullness: 1 = relaxed, ~1.25 = pushed forward (pucker). */
  full: number;
}

export interface VisemeFrame {
  viseme: VisemeId;
  durationMs: number;
}

export const VISEME_SHAPES: Record<VisemeId, MouthShape> = {
  rest: { open: 0.05, width: 1.0, full: 1.0 },
  A: { open: 0.95, width: 1.05, full: 0.95 },
  E: { open: 0.42, width: 1.12, full: 0.95 },
  I: { open: 0.28, width: 1.1, full: 0.95 },
  O: { open: 0.72, width: 0.84, full: 1.12 },
  U: { open: 0.42, width: 0.7, full: 1.25 },
  W: { open: 0.36, width: 0.72, full: 1.22 },
  MBP: { open: 0.0, width: 1.0, full: 1.06 },
  FV: { open: 0.14, width: 1.04, full: 0.99 },
  L: { open: 0.5, width: 1.0, full: 0.98 },
  TH: { open: 0.3, width: 1.06, full: 0.98 },
  S: { open: 0.16, width: 1.1, full: 0.95 },
  CH: { open: 0.3, width: 0.92, full: 1.06 },
  T: { open: 0.22, width: 1.02, full: 1.0 },
  K: { open: 0.44, width: 1.0, full: 0.98 },
  R: { open: 0.32, width: 0.9, full: 1.06 },
};

/** Digraphs, longest first so "eau" wins over "au". */
const DIGRAPHS: { match: string; viseme: VisemeId }[] = [
  { match: 'eau', viseme: 'O' },
  { match: 'ch', viseme: 'CH' },
  { match: 'sh', viseme: 'CH' },
  { match: 'ph', viseme: 'FV' },
  { match: 'th', viseme: 'TH' },
  { match: 'ou', viseme: 'U' },
  { match: 'oi', viseme: 'W' },
  { match: 'au', viseme: 'O' },
  { match: 'ai', viseme: 'E' },
  { match: 'ei', viseme: 'E' },
  { match: 'eu', viseme: 'O' },
  { match: 'qu', viseme: 'K' },
  { match: 'gn', viseme: 'CH' },
];

const LETTER_VISEMES: Record<string, VisemeId> = {
  a: 'A',
  e: 'E',
  i: 'I',
  o: 'O',
  u: 'U',
  y: 'I',
  m: 'MBP',
  b: 'MBP',
  p: 'MBP',
  f: 'FV',
  v: 'FV',
  l: 'L',
  s: 'S',
  z: 'S',
  c: 'K',
  t: 'T',
  d: 'T',
  n: 'T',
  k: 'K',
  g: 'K',
  q: 'K',
  x: 'K',
  r: 'R',
  j: 'CH',
  w: 'W',
  h: 'rest',
};

/** Vowels hold longer than consonants, so the mouth shape is readable. */
const VOWELS: VisemeId[] = ['A', 'E', 'I', 'O', 'U', 'W'];

const frameDuration = (viseme: VisemeId, rate: number): number => {
  const base = VISEME_SHAPES[viseme].open >= 0.5 ? 100 : 70;
  const vowelBoost = VOWELS.includes(viseme) ? 1.15 : 1;
  return Math.round((base * vowelBoost) / rate);
};

const cleanText = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[*_#`~>|]/g, ' ')
    .normalize('NFD')
    // Strip combining diacritics so é/è/ê all land on the same viseme.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Converts a sentence into a viseme timeline. Consecutive identical visemes
 * are merged (so a long "aaa" is one held shape), and punctuation becomes a
 * silent `rest` beat — which is what makes the pause land visually.
 */
export const textToVisemes = (text: string, options: { rate?: number } = {}): VisemeFrame[] => {
  const rate = Math.max(0.5, Math.min(options.rate ?? 1, 2));
  const clean = cleanText(text);
  const frames: VisemeFrame[] = [];

  const push = (viseme: VisemeId, durationMs: number) => {
    if (durationMs <= 0) return;
    const last = frames[frames.length - 1];
    if (last && last.viseme === viseme) {
      last.durationMs += durationMs;
    } else {
      frames.push({ viseme, durationMs });
    }
  };

  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];

    if (/[.!?]/.test(ch)) {
      push('rest', 230 / rate);
      i += 1;
      continue;
    }
    if (/[,;:]/.test(ch)) {
      push('rest', 110 / rate);
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      push('rest', 40 / rate);
      i += 1;
      continue;
    }

    const rest = clean.slice(i);
    const digraph = DIGRAPHS.find((d) => rest.startsWith(d.match));
    if (digraph) {
      push(digraph.viseme, frameDuration(digraph.viseme, rate));
      i += digraph.match.length;
      continue;
    }

    // French/English soft "c": face, city, cycle.
    if (ch === 'c') {
      const next = clean[i + 1];
      const viseme: VisemeId = next && /[eiy]/.test(next) ? 'S' : 'K';
      push(viseme, frameDuration(viseme, rate));
      i += 1;
      continue;
    }

    const mapped = LETTER_VISEMES[ch];
    if (mapped) push(mapped, frameDuration(mapped, rate));
    i += 1;
  }

  return frames;
};

/** Total estimated mouth animation time for a viseme timeline. */
export const visemeDuration = (frames: VisemeFrame[]): number =>
  frames.reduce((total, frame) => total + frame.durationMs, 0);

/** Maps a real decoder position onto the text-derived timeline. Neural audio
 * can be longer or shorter than the estimate; scaling removes cumulative drift
 * while preserving the ordered mouth shapes. */
export const visemeAtPlaybackPosition = (
  frames: VisemeFrame[],
  positionMs: number,
  durationMs: number
): VisemeFrame | undefined => {
  if (!frames.length || !Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  const total = visemeDuration(frames);
  const normalized = Math.max(0, Math.min(1, positionMs / durationMs));
  const target = normalized * total;
  let cursor = 0;
  return (
    frames.find((frame) => {
      cursor += frame.durationMs;
      return target <= cursor;
    }) || frames[frames.length - 1]
  );
};

/** All mouth shapes can be listed this way for debug/preview tooling. */
export const VISEME_IDS = Object.keys(VISEME_SHAPES) as VisemeId[];
