/**
 * Pins the centralized language-aware date/time formatting. The expected
 * strings are pinned for BOTH languages, so these tests would catch any
 * regression to `toLocaleTimeString([])` (device-locale formatting), which
 * produced machine-dependent output (the original bug: "10:30 AM" asserted,
 * "10:30" received on a fr-FR Windows box — and mixed-language UI strings).
 */
import {
  formatClockTime,
  formatClockTimeWithSeconds,
  formatLongDate,
  formatIsoDate,
} from '../src/core/datetime';

// 10:30 local time on 2026-09-23 (Wednesday). Local-noon-safe: hour/minute
// are given explicitly, so no UTC shifting can move the date.
const AT = new Date(2026, 8, 23, 10, 30, 45);

describe('formatClockTime', () => {
  it('formats 24h in French', () => {
    expect(formatClockTime(AT, 'fr')).toBe('10:30');
  });

  it('formats 12h with meridiem in English', () => {
    expect(formatClockTime(AT, 'en')).toMatch(/^10:30(\s)?(AM|am)$/);
  });
});

describe('formatClockTimeWithSeconds', () => {
  it('keeps seconds for terminal-log timestamps (fr)', () => {
    expect(formatClockTimeWithSeconds(AT, 'fr')).toBe('10:30:45');
  });

  it('keeps seconds for terminal-log timestamps (en)', () => {
    expect(formatClockTimeWithSeconds(AT, 'en')).toMatch(/^10:30:45(\s)?(AM|am)$/);
  });
});

describe('formatLongDate', () => {
  it('formats a French weekday + date', () => {
    const out = formatLongDate(AT, 'fr');
    expect(out.toLowerCase()).toContain('septembre');
    expect(out).toContain('23');
  });

  it('formats an English weekday + date', () => {
    const out = formatLongDate(AT, 'en');
    expect(out.toLowerCase()).toContain('september');
    expect(out).toContain('23');
  });
});

describe('formatIsoDate', () => {
  it('returns a zero-padded YYYY-MM-DD string', () => {
    expect(formatIsoDate(AT)).toBe('2026-09-23');
  });

  it('ignores language (ISO is language-neutral) and stays zero-padded', () => {
    expect(formatIsoDate(new Date(2026, 0, 5), 'fr')).toBe('2026-01-05');
  });
});
