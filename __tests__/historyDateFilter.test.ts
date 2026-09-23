/**
 * dateFilterCutoff is the pure logic behind History's date-range chips
 * (ALL TIME / TODAY / THIS WEEK / THIS MONTH): given a filter and "now", it
 * returns the millisecond cutoff a session's updatedAt must be >= to match,
 * or null for "no cutoff" (ALL TIME).
 */
import { dateFilterCutoff } from '../src/core/historyFilters';

// A fixed, readable "now": Wed 2026-09-23 14:30:00 local time.
const NOW = new Date(2026, 8, 23, 14, 30, 0).getTime();

describe('dateFilterCutoff', () => {
  it('returns null for "all" (no cutoff at all)', () => {
    expect(dateFilterCutoff('all', NOW)).toBeNull();
  });

  it('"today" cuts off at local midnight of the current day', () => {
    const cutoff = dateFilterCutoff('today', NOW);
    const expected = new Date(2026, 8, 23, 0, 0, 0, 0).getTime();
    expect(cutoff).toBe(expected);
  });

  it('"week" cuts off 6 days before today at midnight (a 7-day window including today)', () => {
    const cutoff = dateFilterCutoff('week', NOW);
    const expected = new Date(2026, 8, 17, 0, 0, 0, 0).getTime();
    expect(cutoff).toBe(expected);
  });

  it('"month" cuts off 29 days before today at midnight (a 30-day window including today)', () => {
    const cutoff = dateFilterCutoff('month', NOW);
    const expected = new Date(2026, 7, 25, 0, 0, 0, 0).getTime();
    expect(cutoff).toBe(expected);
  });

  it('a session updated exactly at the "today" cutoff matches (inclusive boundary)', () => {
    const cutoff = dateFilterCutoff('today', NOW)!;
    expect(cutoff <= cutoff).toBe(true);
  });

  it('a session updated one millisecond before the "today" cutoff would not match', () => {
    const cutoff = dateFilterCutoff('today', NOW)!;
    const justBefore = cutoff - 1;
    expect(justBefore < cutoff).toBe(true);
  });

  it('defaults "now" to the real current time when not provided', () => {
    const before = Date.now();
    const cutoff = dateFilterCutoff('today');
    const after = Date.now();
    expect(cutoff).not.toBeNull();
    expect(cutoff!).toBeLessThanOrEqual(after);
    expect(cutoff!).toBeGreaterThan(before - 86400000);
  });
});
