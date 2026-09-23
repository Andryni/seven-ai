/**
 * Calendar reading (morning briefing agenda) and event creation used to not
 * exist at all. This pins: permission gating, cross-calendar aggregation +
 * chronological sort, the writable-calendar fallback used for creation, and
 * the validation that rejects malformed/inverted date ranges before they
 * ever reach the OS calendar.
 */
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { calendarService } from '../src/services/calendarService';

jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  getCalendarPermissionsAsync: jest.fn(),
  requestCalendarPermissionsAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  getDefaultCalendarAsync: jest.fn(),
  getEventsAsync: jest.fn(),
  createEventAsync: jest.fn(),
}));

const mockedCalendar = Calendar as jest.Mocked<typeof Calendar>;

describe('calendarService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calendarService.invalidateCache();
    // Reset Platform.OS to 'android' (jest.setup.js default) for every test
    // unless a test explicitly overrides it.
    (Platform as any).OS = 'android';

    mockedCalendar.getCalendarPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockedCalendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockedCalendar.getCalendarsAsync.mockResolvedValue([
      { id: 'cal-1', title: 'Personal', allowsModifications: true },
      { id: 'cal-2', title: 'Work (read-only)', allowsModifications: false },
    ] as any);
  });

  describe('getEvents', () => {
    it('returns null without permission, and never calls getEventsAsync', async () => {
      mockedCalendar.getCalendarPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
      const result = await calendarService.getEvents(new Date(), new Date());
      expect(result).toBeNull();
      expect(mockedCalendar.getEventsAsync).not.toHaveBeenCalled();
    });

    it('aggregates events across all calendars, sorted chronologically, with calendar titles attached', async () => {
      mockedCalendar.getEventsAsync.mockResolvedValue([
        {
          id: 'e2',
          calendarId: 'cal-2',
          title: 'Team standup',
          startDate: '2026-09-24T09:00:00.000Z',
          endDate: '2026-09-24T09:30:00.000Z',
          location: null,
          allDay: false,
        },
        {
          id: 'e1',
          calendarId: 'cal-1',
          title: 'Dentist',
          startDate: '2026-09-24T08:00:00.000Z',
          endDate: '2026-09-24T08:45:00.000Z',
          location: 'Downtown clinic',
          allDay: false,
        },
      ] as any);

      const events = await calendarService.getEvents(new Date('2026-09-24'), new Date('2026-09-25'));
      expect(events).not.toBeNull();
      expect(events!.map((e) => e.title)).toEqual(['Dentist', 'Team standup']);
      expect(events![0].calendarTitle).toBe('Personal');
      expect(events![1].calendarTitle).toBe('Work (read-only)');
      expect(events![0].location).toBe('Downtown clinic');
      expect(mockedCalendar.getEventsAsync).toHaveBeenCalledWith(
        ['cal-1', 'cal-2'],
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('returns an empty array when the device has no calendars at all', async () => {
      mockedCalendar.getCalendarsAsync.mockResolvedValue([] as any);
      const events = await calendarService.getEvents(new Date(), new Date());
      expect(events).toEqual([]);
      expect(mockedCalendar.getEventsAsync).not.toHaveBeenCalled();
    });

    it('returns null when the OS call throws', async () => {
      mockedCalendar.getEventsAsync.mockRejectedValue(new Error('boom'));
      const events = await calendarService.getEvents(new Date(), new Date());
      expect(events).toBeNull();
    });
  });

  describe('getTodayEvents', () => {
    it("queries a range spanning exactly today's local midnight to 23:59:59", async () => {
      mockedCalendar.getEventsAsync.mockResolvedValue([]);
      await calendarService.getTodayEvents();
      const [, start, end] = mockedCalendar.getEventsAsync.mock.calls[0];
      expect((start as Date).getHours()).toBe(0);
      expect((end as Date).getHours()).toBe(23);
      expect((start as Date).toDateString()).toBe((end as Date).toDateString());
    });
  });

  describe('createEvent', () => {
    const validInput = {
      title: 'Rendez-vous dentiste',
      startDate: new Date('2026-09-25T15:00:00'),
      endDate: new Date('2026-09-25T16:00:00'),
    };

    it('rejects an empty title without calling the OS', async () => {
      const res = await calendarService.createEvent({ ...validInput, title: '   ' });
      expect(res.success).toBe(false);
      expect(mockedCalendar.createEventAsync).not.toHaveBeenCalled();
    });

    it('rejects an end date that is before or equal to the start date', async () => {
      const res = await calendarService.createEvent({
        ...validInput,
        endDate: new Date(validInput.startDate.getTime()),
      });
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/after its start/i);
      expect(mockedCalendar.createEventAsync).not.toHaveBeenCalled();
    });

    it('rejects an invalid start date', async () => {
      const res = await calendarService.createEvent({ ...validInput, startDate: new Date('not-a-date') });
      expect(res.success).toBe(false);
      expect(mockedCalendar.createEventAsync).not.toHaveBeenCalled();
    });

    it('creates the event on the first writable calendar on Android', async () => {
      mockedCalendar.createEventAsync.mockResolvedValue('new-event-id');
      const res = await calendarService.createEvent(validInput);
      expect(res.success).toBe(true);
      expect(mockedCalendar.createEventAsync).toHaveBeenCalledWith(
        'cal-1',
        expect.objectContaining({ title: 'Rendez-vous dentiste' })
      );
    });

    it("prefers iOS's getDefaultCalendarAsync when on iOS", async () => {
      (Platform as any).OS = 'ios';
      mockedCalendar.getDefaultCalendarAsync.mockResolvedValue({ id: 'ios-default-cal' } as any);
      mockedCalendar.createEventAsync.mockResolvedValue('new-event-id');

      const res = await calendarService.createEvent(validInput);
      expect(res.success).toBe(true);
      expect(mockedCalendar.createEventAsync).toHaveBeenCalledWith('ios-default-cal', expect.anything());
    });

    it('requests permission when not already granted, and fails cleanly if refused', async () => {
      mockedCalendar.getCalendarPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
      mockedCalendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
      const res = await calendarService.createEvent(validInput);
      expect(res.success).toBe(false);
      expect(mockedCalendar.createEventAsync).not.toHaveBeenCalled();
    });

    it('fails cleanly when no calendar allows modifications', async () => {
      mockedCalendar.getCalendarsAsync.mockResolvedValue([
        { id: 'cal-2', title: 'Work (read-only)', allowsModifications: false },
      ] as any);
      const res = await calendarService.createEvent(validInput);
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/no writable calendar/i);
    });

    it('surfaces the underlying OS error message on failure', async () => {
      mockedCalendar.createEventAsync.mockRejectedValue(new Error('provider crashed'));
      const res = await calendarService.createEvent(validInput);
      expect(res.success).toBe(false);
      expect(res.message).toContain('provider crashed');
    });
  });
});
