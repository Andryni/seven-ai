import {
  textToVisemes,
  visemeDuration,
  VISEME_SHAPES,
  VISEME_IDS,
  visemeAtPlaybackPosition,
  type VisemeId,
} from '../src/core/visemes';

const ids = (text: string, rate?: number): VisemeId[] =>
  textToVisemes(text, rate ? { rate } : undefined).map((f) => f.viseme);

describe('viseme engine', () => {
  it('maps bilabials to a closed mouth', () => {
    const frames = textToVisemes('maman');
    expect(frames[0].viseme).toBe('MBP');
    expect(VISEME_SHAPES.MBP.open).toBe(0);
  });

  it('keeps vowels distinct instead of collapsing them', () => {
    expect(ids('a')).toEqual(['A']);
    expect(ids('i')).toEqual(['I']);
    expect(ids('o')).toEqual(['O']);
    expect(ids('u')).toEqual(['U']);
    // "ou" is a digraph, not two vowels.
    expect(ids('ou')).toEqual(['U']);
    expect(ids('oi')).toEqual(['W']);
  });

  it('handles accented French text (é/è/ê all map to E)', () => {
    expect(ids('été')).toEqual(['E', 'T', 'E']);
  });

  it('applies the soft-c rule', () => {
    expect(ids('ceci')).toEqual(['S', 'E', 'S', 'I']);
    expect(ids('chat')).toEqual(['CH', 'A', 'T']);
    expect(ids('colis')).toContain('K');
  });

  it('inserts silent beats for punctuation', () => {
    const frames = textToVisemes('Bonjour, oui.');
    expect(frames.some((f) => f.viseme === 'rest')).toBe(true);
    const paused = textToVisemes('oui. non');
    const withoutPause = textToVisemes('oui non');
    expect(visemeDuration(paused)).toBeGreaterThan(visemeDuration(withoutPause));
  });

  it('merges consecutive identical visemes', () => {
    const frames = textToVisemes('aaa');
    expect(frames).toHaveLength(1);
    expect(frames[0].viseme).toBe('A');
  });

  it('speaks faster when the rate goes up', () => {
    const slow = visemeDuration(textToVisemes('bonjour commandant', { rate: 0.8 }));
    const normal = visemeDuration(textToVisemes('bonjour commandant', { rate: 1 }));
    const fast = visemeDuration(textToVisemes('bonjour commandant', { rate: 1.8 }));
    expect(slow).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(fast);
    expect(fast).toBeGreaterThan(0);
  });

  it('strips markdown, code blocks and urls', () => {
    const frames = textToVisemes('**Important** https://example.com/a/b `code`');
    expect(frames.length).toBeGreaterThan(0);
    expect(visemeDuration(frames)).toBeLessThan(visemeDuration(textToVisemes('important example com a b code')));
  });

  it('always produces exactly one frame per distinct consecutive sound', () => {
    const frames = textToVisemes('systems online');
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i].viseme).not.toBe(frames[i - 1].viseme);
      expect(frames[i].durationMs).toBeGreaterThan(0);
    }
  });

  it('tracks the real decoder clock without accumulating timing drift', () => {
    const frames = textToVisemes('a mime');
    expect(visemeAtPlaybackPosition(frames, 0, 4000)?.viseme).toBe(frames[0].viseme);
    expect(visemeAtPlaybackPosition(frames, 4000, 4000)?.viseme).toBe(
      frames[frames.length - 1].viseme
    );
    expect(visemeAtPlaybackPosition([], 10, 100)).toBeUndefined();
  });

  it('returns nothing for text without pronounceable characters', () => {
    expect(textToVisemes('')).toEqual([]);
    expect(textToVisemes('   ').every((f) => f.viseme === 'rest')).toBe(true);
  });

  it('defines a renderable shape for every viseme', () => {
    VISEME_IDS.forEach((id) => {
      const shape = VISEME_SHAPES[id];
      expect(shape.open).toBeGreaterThanOrEqual(0);
      expect(shape.open).toBeLessThanOrEqual(1);
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.full).toBeGreaterThan(0);
    });
  });
});
