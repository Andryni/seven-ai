/**
 * Pure formatting logic for the home-screen widget's glance facts, tested
 * in isolation from the widget library and the headless task handler.
 */
import {
  formatWeatherGlance,
  formatNextEventGlance,
  withTimeout,
} from '../src/widgets/glanceData';
import type { LiveWeather } from '../src/services/liveInfoService';
import type { CalendarEventSummary } from '../src/services/calendarService';

const weather = (overrides: Partial<LiveWeather> = {}): LiveWeather => ({
  tempC: 20,
  condition: 'Clear sky',
  humidity: 50,
  windKmh: 10,
  location: 'Paris',
  code: 0,
  isDay: true,
  ...overrides,
});

const event = (overrides: Partial<CalendarEventSummary> = {}): CalendarEventSummary => ({
  id: '1',
  title: 'Meeting',
  startDate: new Date(2026, 0, 1, 10, 0),
  endDate: new Date(2026, 0, 1, 11, 0),
  location: null,
  calendarTitle: 'Work',
  allDay: false,
  ...overrides,
});

describe('formatWeatherGlance', () => {
  it('formats temperature, condition and location', () => {
    expect(formatWeatherGlance(weather({ tempC: 18, condition: 'Overcast', location: 'London' }), 'en')).toBe(
      '18°C Overcast • London'
    );
  });

  it('returns an honest unavailable line in English when weather is null', () => {
    expect(formatWeatherGlance(null, 'en')).toBe('Weather unavailable');
  });

  it('returns an honest unavailable line in French when weather is null', () => {
    expect(formatWeatherGlance(null, 'fr')).toBe('Météo indisponible');
  });
});

describe('formatNextEventGlance', () => {
  const now = new Date(2026, 0, 1, 9, 0);

  it('returns the earliest not-yet-ended event today', () => {
    const events = [
      event({ title: 'Later', startDate: new Date(2026, 0, 1, 16, 0), endDate: new Date(2026, 0, 1, 17, 0) }),
      event({ title: 'Sooner', startDate: new Date(2026, 0, 1, 10, 30), endDate: new Date(2026, 0, 1, 11, 0) }),
    ];
    expect(formatNextEventGlance(events, 'en', now)).toBe('10:30 AM • Sooner');
  });

  it('skips events that have already ended', () => {
    const events = [
      event({ title: 'Past', startDate: new Date(2026, 0, 1, 6, 0), endDate: new Date(2026, 0, 1, 7, 0) }),
      event({ title: 'Upcoming', startDate: new Date(2026, 0, 1, 12, 0), endDate: new Date(2026, 0, 1, 13, 0) }),
    ];
    expect(formatNextEventGlance(events, 'en', now)).toBe('12:00 PM • Upcoming');
  });

  it('formats an all-day event without a clock time', () => {
    expect(formatNextEventGlance([event({ title: 'Conference', allDay: true })], 'en', now)).toBe(
      'All day • Conference'
    );
    expect(formatNextEventGlance([event({ title: 'Conférence', allDay: true })], 'fr', now)).toBe(
      'Toute la journée • Conférence'
    );
  });

  it('reports no events today when the list is empty (permission was fine)', () => {
    expect(formatNextEventGlance([], 'en', now)).toBe('No events today');
    expect(formatNextEventGlance([], 'fr', now)).toBe('Aucun événement aujourd\u2019hui');
  });

  it('reports the agenda as unavailable when the read itself failed (null, not empty)', () => {
    expect(formatNextEventGlance(null, 'en', now)).toBe('Agenda unavailable');
    expect(formatNextEventGlance(null, 'fr', now)).toBe('Agenda indisponible');
  });
});

describe('withTimeout', () => {
  it('resolves with the promise value when it settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('fast'), 1000, 'fallback');
    expect(result).toBe('fast');
  });

  it('resolves with the fallback when the promise rejects', async () => {
    const result = await withTimeout(Promise.reject(new Error('boom')), 1000, 'fallback');
    expect(result).toBe('fallback');
  });

  it('resolves with the fallback when the promise never settles before the deadline', async () => {
    jest.useFakeTimers();
    const never = new Promise<string>(() => {});
    const pending = withTimeout(never, 5000, 'fallback');
    jest.advanceTimersByTime(5000);
    await Promise.resolve(); // flush the microtask queue after the timer fires
    await expect(pending).resolves.toBe('fallback');
    jest.useRealTimers();
  });
});
