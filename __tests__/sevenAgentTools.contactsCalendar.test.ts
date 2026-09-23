/**
 * make_phone_call / send_sms / open_whatsapp used to only accept a raw
 * phone number; list_calendar_events / create_calendar_event did not exist
 * at all. This pins the tool-execution layer that resolves a spoken
 * contact_name into a number (and reports ambiguity/not-found/permission
 * errors back to the model as text instead of throwing), plus the calendar
 * read/write tool wiring including its date-range defaults and validation.
 *
 * Every module sevenAgentTools.ts imports that isn't relevant to this test
 * (Gemini-backed agents, Gmail/Instagram OAuth, research/print) is mocked
 * out so this file exercises exactly the device/contacts/calendar path.
 */
import { executeTool } from '../src/core/sevenAgentTools';
import { deviceControl } from '../src/services/deviceControlService';
import { contactsService } from '../src/services/contactsService';
import { calendarService } from '../src/services/calendarService';

jest.mock('../src/services/fileOrganizer', () => ({ fileOrganizer: {} }));
jest.mock('../src/core/daveAgent', () => ({ daveAgent: {} }));
jest.mock('../src/services/researchService', () => ({ researchService: {} }));
jest.mock('../src/services/gmailService', () => ({ gmailService: {} }));
jest.mock('../src/services/instagramService', () => ({ instagramService: {} }));
jest.mock('../src/core/selfHealing', () => ({ selfHealing: {} }));
jest.mock('../src/services/webSearchService', () => ({ webSearchService: {} }));
jest.mock('../src/services/sandboxService', () => ({ sandboxService: {} }));
jest.mock('../src/services/memoryService', () => ({ memoryService: {} }));

jest.mock('../src/services/deviceControlService', () => ({
  deviceControl: {
    callNumber: jest.fn(),
    sendSms: jest.fn(),
    openWhatsApp: jest.fn(),
  },
}));

jest.mock('../src/services/contactsService', () => ({
  contactsService: {
    resolveContactByName: jest.fn(),
  },
}));

jest.mock('../src/services/calendarService', () => ({
  calendarService: {
    hasPermission: jest.fn(),
    requestPermission: jest.fn(),
    getEvents: jest.fn(),
    createEvent: jest.fn(),
  },
}));

const mockedDeviceControl = deviceControl as jest.Mocked<typeof deviceControl>;
const mockedContacts = contactsService as jest.Mocked<typeof contactsService>;
const mockedCalendar = calendarService as jest.Mocked<typeof calendarService>;

describe('executeTool — contact-aware device actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('make_phone_call', () => {
    it('dials directly when phone_number is given, without touching contacts', async () => {
      mockedDeviceControl.callNumber.mockResolvedValue({ success: true, message: 'Dialer opened for 12345' });
      const res = await executeTool('make_phone_call', { phone_number: '12345' });
      expect(mockedContacts.resolveContactByName).not.toHaveBeenCalled();
      expect(mockedDeviceControl.callNumber).toHaveBeenCalledWith('12345');
      expect(res.toolCall?.status).toBe('completed');
    });

    it('resolves contact_name to a phone number and dials it', async () => {
      mockedContacts.resolveContactByName.mockResolvedValue({
        status: 'found',
        contact: { id: '1', name: 'Maman', phoneNumbers: ['+261340000001'], exact: true },
      });
      mockedDeviceControl.callNumber.mockResolvedValue({ success: true, message: 'Dialer opened for +261340000001' });

      const res = await executeTool('make_phone_call', { contact_name: 'Maman' });
      expect(mockedDeviceControl.callNumber).toHaveBeenCalledWith('+261340000001');
      expect(res.text).toContain('Maman');
      expect(res.toolCall?.summary).toContain('Maman');
    });

    it('surfaces an ambiguous-match error without calling the dialer', async () => {
      mockedContacts.resolveContactByName.mockResolvedValue({
        status: 'ambiguous',
        matches: [
          { id: '1', name: 'Jean Dupont', phoneNumbers: ['1'], exact: false },
          { id: '2', name: 'Jean Rakoto', phoneNumbers: ['2'], exact: false },
        ],
      });
      const res = await executeTool('make_phone_call', { contact_name: 'Jean' });
      expect(mockedDeviceControl.callNumber).not.toHaveBeenCalled();
      expect(res.text).toMatch(/several contacts/i);
      expect(res.text).toContain('Jean Dupont');
      expect(res.toolCall?.status).toBe('failed');
    });

    it('surfaces a not-found error without calling the dialer', async () => {
      mockedContacts.resolveContactByName.mockResolvedValue({ status: 'not_found' });
      const res = await executeTool('make_phone_call', { contact_name: 'Nobody' });
      expect(mockedDeviceControl.callNumber).not.toHaveBeenCalled();
      expect(res.text).toMatch(/no contact named/i);
    });

    it('surfaces a permission_denied error without calling the dialer', async () => {
      mockedContacts.resolveContactByName.mockResolvedValue({ status: 'permission_denied' });
      const res = await executeTool('make_phone_call', { contact_name: 'Maman' });
      expect(mockedDeviceControl.callNumber).not.toHaveBeenCalled();
      expect(res.text).toMatch(/permission/i);
    });

    it('asks for more info when neither phone_number nor contact_name is given', async () => {
      const res = await executeTool('make_phone_call', {});
      expect(mockedDeviceControl.callNumber).not.toHaveBeenCalled();
      expect(res.text).toMatch(/need either/i);
    });
  });

  describe('send_sms', () => {
    it('resolves contact_name and forwards the message body', async () => {
      mockedContacts.resolveContactByName.mockResolvedValue({
        status: 'found',
        contact: { id: '2', name: 'Jean Dupont', phoneNumbers: ['+261340000002'], exact: true },
      });
      mockedDeviceControl.sendSms.mockResolvedValue({ success: true, message: 'SMS composer opened' });

      const res = await executeTool('send_sms', { contact_name: 'Jean Dupont', message: 'Salut !' });
      expect(mockedDeviceControl.sendSms).toHaveBeenCalledWith('+261340000002', 'Salut !');
      expect(res.toolCall?.summary).toContain('Jean Dupont');
    });
  });

  describe('open_whatsapp', () => {
    it('works with no recipient at all (text-only share)', async () => {
      mockedDeviceControl.openWhatsApp.mockResolvedValue({ success: true, message: 'WhatsApp dispatched successfully.' });
      const res = await executeTool('open_whatsapp', { text: 'Hello' });
      expect(mockedContacts.resolveContactByName).not.toHaveBeenCalled();
      expect(mockedDeviceControl.openWhatsApp).toHaveBeenCalledWith(undefined, 'Hello');
      expect(res.toolCall?.status).toBe('completed');
    });

    it('resolves contact_name before opening WhatsApp', async () => {
      mockedContacts.resolveContactByName.mockResolvedValue({
        status: 'found',
        contact: { id: '1', name: 'Maman', phoneNumbers: ['+261340000001'], exact: true },
      });
      mockedDeviceControl.openWhatsApp.mockResolvedValue({ success: true, message: 'WhatsApp dispatched successfully.' });
      await executeTool('open_whatsapp', { contact_name: 'Maman', text: 'Coucou' });
      expect(mockedDeviceControl.openWhatsApp).toHaveBeenCalledWith('+261340000001', 'Coucou');
    });
  });
});

describe('executeTool — calendar tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list_calendar_events', () => {
    it('requests permission when missing and reports failure cleanly if refused', async () => {
      mockedCalendar.hasPermission.mockResolvedValue(false);
      mockedCalendar.requestPermission.mockResolvedValue(false);
      const res = await executeTool('list_calendar_events', {});
      expect(mockedCalendar.getEvents).not.toHaveBeenCalled();
      expect(res.toolCall?.status).toBe('failed');
    });

    it('formats a populated agenda into readable lines', async () => {
      mockedCalendar.hasPermission.mockResolvedValue(true);
      mockedCalendar.getEvents.mockResolvedValue([
        {
          id: '1',
          title: 'Dentiste',
          startDate: new Date('2026-09-24T08:00:00'),
          endDate: new Date('2026-09-24T08:45:00'),
          location: 'Clinique',
          calendarTitle: 'Personal',
          allDay: false,
        },
      ]);
      const res = await executeTool('list_calendar_events', {});
      expect(res.text).toContain('Dentiste');
      expect(res.text).toContain('Clinique');
      expect(res.toolCall?.status).toBe('completed');
    });

    it('reports a clean "no events" message for an empty agenda', async () => {
      mockedCalendar.hasPermission.mockResolvedValue(true);
      mockedCalendar.getEvents.mockResolvedValue([]);
      const res = await executeTool('list_calendar_events', {});
      expect(res.text).toMatch(/no events/i);
    });

    it('rejects an invalid date string before touching the calendar', async () => {
      mockedCalendar.hasPermission.mockResolvedValue(true);
      const res = await executeTool('list_calendar_events', { start_date: 'not-a-date' });
      expect(mockedCalendar.getEvents).not.toHaveBeenCalled();
      expect(res.text).toMatch(/invalid/i);
    });
  });

  describe('create_calendar_event', () => {
    it('forwards title/start/end/location/notes and reports success', async () => {
      mockedCalendar.createEvent.mockResolvedValue({ success: true, message: '"Réunion" was added to your calendar.' });
      const res = await executeTool('create_calendar_event', {
        title: 'Réunion',
        start_iso: '2026-09-24T15:00:00',
        end_iso: '2026-09-24T16:00:00',
        location: 'Bureau',
        notes: 'Apporter le rapport',
      });
      expect(mockedCalendar.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Réunion', location: 'Bureau', notes: 'Apporter le rapport' })
      );
      expect(res.toolCall?.status).toBe('completed');
    });

    it('defaults the end time to one hour after start when end_iso is omitted', async () => {
      mockedCalendar.createEvent.mockResolvedValue({ success: true, message: 'ok' });
      await executeTool('create_calendar_event', { title: 'Appel', start_iso: '2026-09-24T15:00:00' });
      const arg = mockedCalendar.createEvent.mock.calls[0][0];
      expect(arg.endDate.getTime() - arg.startDate.getTime()).toBe(60 * 60 * 1000);
    });

    it('surfaces a failure message from the service as-is', async () => {
      mockedCalendar.createEvent.mockResolvedValue({ success: false, message: 'No writable calendar found.' });
      const res = await executeTool('create_calendar_event', { title: 'X', start_iso: '2026-09-24T15:00:00' });
      expect(res.toolCall?.status).toBe('failed');
      expect(res.text).toBe('No writable calendar found.');
    });
  });
});
