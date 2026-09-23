import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

/**
 * Bridges the device calendar into the agent: reading today's/upcoming
 * agenda for the morning briefing, and creating events from a natural
 * language request ("mets un rendez-vous demain à 15h avec le dentiste").
 *
 * Uses the legacy expo-calendar API for the same reason as
 * `contactsService`: it is the stable, fully cross-platform surface with
 * predictable Android + iOS behavior.
 */

export interface CalendarEventSummary {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  calendarTitle: string;
  allDay: boolean;
}

export interface CreateEventInput {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
}

export type CalendarActionResult =
  | { success: true; message: string; data?: unknown }
  | { success: false; message: string };

class CalendarService {
  private static instance: CalendarService;
  private writableCalendarId: string | null = null;

  public static getInstance(): CalendarService {
    if (!CalendarService.instance) {
      CalendarService.instance = new CalendarService();
    }
    return CalendarService.instance;
  }

  /** Clears the cached writable-calendar id (e.g. after granting permission, or in tests). */
  public invalidateCache(): void {
    this.writableCalendarId = null;
  }

  public async hasPermission(): Promise<boolean> {
    try {
      const { status } = await Calendar.getCalendarPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  public async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Finds (and caches for the process lifetime) a calendar SEVEN is allowed
   * to write new events into. Prefers the device's default calendar; falls
   * back to the first calendar reporting `allowsModifications`.
   */
  private async getWritableCalendarId(): Promise<string | null> {
    if (this.writableCalendarId) return this.writableCalendarId;

    try {
      if (Platform.OS === 'ios') {
        const defaultCal = await Calendar.getDefaultCalendarAsync();
        if (defaultCal?.id) {
          this.writableCalendarId = defaultCal.id;
          return this.writableCalendarId;
        }
      }

      const calendars = await Calendar.getCalendarsAsync(
        Platform.OS === 'ios' ? Calendar.EntityTypes.EVENT : undefined
      );
      const writable = calendars.find((c) => c.allowsModifications);
      if (writable) {
        this.writableCalendarId = writable.id;
        return this.writableCalendarId;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Every calendar on the device that can produce events (used to read the
   * agenda even from read-only synced calendars, e.g. a company Exchange
   * calendar — briefing should show those too, only creation is restricted
   * to a writable one).
   */
  private async getAllCalendarIds(): Promise<{ id: string; title: string }[]> {
    try {
      const calendars = await Calendar.getCalendarsAsync(
        Platform.OS === 'ios' ? Calendar.EntityTypes.EVENT : undefined
      );
      return calendars.map((c) => ({ id: c.id, title: c.title }));
    } catch {
      return [];
    }
  }

  /**
   * Lists events between `startDate` and `endDate` across every calendar on
   * the device, sorted chronologically. Returns `null` when permission is
   * missing or the calendar store can't be read (caller decides how to
   * message that, since briefing vs. chat need different phrasing).
   */
  public async getEvents(startDate: Date, endDate: Date): Promise<CalendarEventSummary[] | null> {
    const granted = await this.hasPermission();
    if (!granted) return null;

    const calendars = await this.getAllCalendarIds();
    if (calendars.length === 0) return [];

    const titleById = new Map(calendars.map((c) => [c.id, c.title]));

    try {
      const events = await Calendar.getEventsAsync(
        calendars.map((c) => c.id),
        startDate,
        endDate
      );

      return events
        .map((e) => ({
          id: e.id,
          title: e.title || '(untitled event)',
          startDate: new Date(e.startDate),
          endDate: new Date(e.endDate),
          location: e.location || null,
          calendarTitle: titleById.get(e.calendarId) || 'Calendar',
          allDay: !!e.allDay,
        }))
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    } catch {
      return null;
    }
  }

  /** Convenience wrapper: every event happening "today" in local time. */
  public async getTodayEvents(): Promise<CalendarEventSummary[] | null> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return this.getEvents(start, end);
  }

  /**
   * Creates a new calendar event. Validates that `endDate` is strictly
   * after `startDate` (a common voice-transcription edge case: "de 15h à
   * 15h" or a parser bug producing an inverted range) before touching the
   * OS calendar, and surfaces a clear, actionable message on every failure
   * path (no permission, no writable calendar, OS rejection).
   */
  public async createEvent(input: CreateEventInput): Promise<CalendarActionResult> {
    const title = input.title.trim();
    if (!title) {
      return { success: false, message: 'The event needs a title.' };
    }
    if (!(input.startDate instanceof Date) || Number.isNaN(input.startDate.getTime())) {
      return { success: false, message: 'The event start date/time is invalid.' };
    }
    if (!(input.endDate instanceof Date) || Number.isNaN(input.endDate.getTime())) {
      return { success: false, message: 'The event end date/time is invalid.' };
    }
    if (input.endDate.getTime() <= input.startDate.getTime()) {
      return { success: false, message: 'The event end time must be after its start time.' };
    }

    const granted = await this.hasPermission();
    if (!granted) {
      const nowGranted = await this.requestPermission();
      if (!nowGranted) {
        return {
          success: false,
          message: 'Calendar access was not granted, so I cannot create the event.',
        };
      }
    }

    const calendarId = await this.getWritableCalendarId();
    if (!calendarId) {
      return {
        success: false,
        message: 'No writable calendar was found on this device to add the event to.',
      };
    }

    try {
      const eventId = await Calendar.createEventAsync(calendarId, {
        title,
        startDate: input.startDate,
        endDate: input.endDate,
        location: input.location,
        notes: input.notes,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return {
        success: true,
        message: `"${title}" was added to your calendar.`,
        data: { id: eventId },
      };
    } catch (e: any) {
      return { success: false, message: `Failed to create the event: ${e?.message || e}` };
    }
  }
}

export const calendarService = CalendarService.getInstance();
