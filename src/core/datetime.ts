/**
 * Centralized, language-aware date/time formatting.
 *
 * `toLocaleTimeString([])` (empty locale) formats with the *device's* locale,
 * which is not the app's UI language — SEVEN runs in French while the phone
 * runs in English and vice versa, so every ad-hoc call site produced mixed-
 * language output ("10:30" inside an English UI, "10:30 AM" in a French one).
 * It also made deterministic unit tests impossible: the expected string
 * depended on the machine running them (this repo's Windows/ICU resolves to
 * fr-FR, so a test asserting "10:30 AM" failed locally while passing in CI).
 *
 * Every helper here takes the app language explicitly and pins the locale
 * accordingly, so output is stable on any device and in any test
 * environment. All functions are pure (given `language`, `Date`, options)
 * and live outside React/Native so they can be unit tested directly.
 */

export type AppLanguage = 'fr' | 'en';

const LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  fr: 'fr-FR',
  en: 'en-US',
};

/** Clock time "10:30" (fr) / "10:30 AM" (en). */
export function formatClockTime(date: Date, language: AppLanguage): string {
  return date.toLocaleTimeString(LOCALE_BY_LANGUAGE[language], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Timestamp with seconds "14:07:33" (fr) / "2:07:33 PM" (en) — used by the
 *  terminal log lines in the store, which have always shown seconds. */
export function formatClockTimeWithSeconds(date: Date, language: AppLanguage): string {
  return date.toLocaleTimeString(LOCALE_BY_LANGUAGE[language], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Full date "23/09/2026" (fr) / "9/23/2026" (en) — standby dock header. */
export function formatLongDate(date: Date, language: AppLanguage): string {
  return date.toLocaleDateString(LOCALE_BY_LANGUAGE[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Local date "2026-09-23" for ISO-style arguments the agent/tools emit. */
export function formatIsoDate(date: Date, language?: AppLanguage): string {
  const locale = language ? LOCALE_BY_LANGUAGE[language] : 'en-CA';
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
