/**
 * Pure date-range logic behind History's filter chips (ALL TIME / TODAY /
 * THIS WEEK / THIS MONTH). Kept out of app/history.tsx (which imports
 * expo-router, unparseable by jest without a heavier mock) so it stays
 * directly unit-testable.
 */
export type DateFilter = 'all' | 'today' | 'week' | 'month';

/**
 * Millisecond cutoff for a date filter — sessions updated before it are
 * excluded — or `null` for 'all' (no cutoff). `now` defaults to the real
 * current time but is overridable so tests don't depend on the clock.
 */
export function dateFilterCutoff(filter: DateFilter, now: number = Date.now()): number | null {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  switch (filter) {
    case 'today':
      return startOfToday.getTime();
    case 'week':
      return startOfToday.getTime() - 6 * 86400000;
    case 'month':
      return startOfToday.getTime() - 29 * 86400000;
    case 'all':
    default:
      return null;
  }
}
