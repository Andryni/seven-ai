/**
 * Contact-name resolution used to require a raw phone number for every
 * make_phone_call / send_sms / open_whatsapp tool call. This pins the
 * matching logic (exact > whole-word > substring, diacritic/case
 * insensitive, ambiguity reporting) plus the permission/error paths, since
 * a wrong "found" result here means SEVEN calls the wrong person.
 */
import * as Contacts from 'expo-contacts/legacy';
import { contactsService } from '../src/services/contactsService';

jest.mock('expo-contacts/legacy', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Fields: { PhoneNumbers: 'phoneNumbers' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));

const mockedContacts = Contacts as jest.Mocked<typeof Contacts>;

const CONTACTS_FIXTURE = [
  { id: '1', name: 'Maman', phoneNumbers: [{ number: '+261340000001', label: 'mobile' }] },
  { id: '2', name: 'Jean Dupont', phoneNumbers: [{ number: '+261340000002', label: 'mobile' }] },
  { id: '3', name: 'Jeanne Martin', phoneNumbers: [{ number: '+261340000003', label: 'mobile' }] },
  { id: '4', name: 'Jean Rakoto', phoneNumbers: [{ number: '+261340000004', label: 'mobile' }] },
  { id: '5', name: 'Éric Beaumont', phoneNumbers: [{ number: '+261340000005', label: 'mobile' }] },
  { id: '6', name: 'No Number Guy', phoneNumbers: [] },
];

describe('contactsService', () => {
  beforeEach(() => {
    contactsService.invalidateCache();
    jest.clearAllMocks();
    mockedContacts.getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as any);
    mockedContacts.getContactsAsync.mockResolvedValue({
      data: CONTACTS_FIXTURE as any,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('resolves an exact name match to its phone number', async () => {
    const result = await contactsService.resolveContactByName('Maman');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.contact.phoneNumbers[0]).toBe('+261340000001');
      expect(result.contact.exact).toBe(true);
    }
  });

  it('is case- and accent-insensitive', async () => {
    const result = await contactsService.resolveContactByName('éRIC beaumont');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.contact.name).toBe('Éric Beaumont');
    }
  });

  it('matches a whole word within a full name ("Jean" -> "Jean Dupont" and "Jean Rakoto", ambiguous)', async () => {
    const result = await contactsService.resolveContactByName('Jean');
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.matches.map((m) => m.name).sort()).toEqual(['Jean Dupont', 'Jean Rakoto']);
    }
  });

  it('does not whole-word-match "Jean" against "Jeanne Martin"', async () => {
    const result = await contactsService.resolveContactByName('Jean Martin');
    // "Jean" is not a whole word inside "Jeanne Martin", but "Martin" is;
    // whole-word requires every query word present, so this should fall
    // through to not_found (no contact has both "jean" and "martin" as words).
    expect(result.status).toBe('not_found');
  });

  it('resolves a full "First Last" query to the exact contact even when other contacts share the first name', async () => {
    const result = await contactsService.resolveContactByName('Jean Dupont');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.contact.id).toBe('2');
    }
  });

  it('falls back to substring match for partial typing', async () => {
    const result = await contactsService.resolveContactByName('Dup');
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.contact.name).toBe('Jean Dupont');
    }
  });

  it('reports not_found when nothing matches', async () => {
    const result = await contactsService.resolveContactByName('Zzzznobody');
    expect(result.status).toBe('not_found');
  });

  it('excludes contacts without any phone number', async () => {
    const result = await contactsService.resolveContactByName('No Number Guy');
    expect(result.status).toBe('not_found');
  });

  it('reports permission_denied without ever calling getContactsAsync', async () => {
    mockedContacts.getPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    } as any);
    const result = await contactsService.resolveContactByName('Maman');
    expect(result.status).toBe('permission_denied');
    expect(mockedContacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it('reports unavailable when the OS call throws', async () => {
    mockedContacts.getContactsAsync.mockRejectedValue(new Error('boom'));
    const result = await contactsService.resolveContactByName('Maman');
    expect(result.status).toBe('unavailable');
  });

  it('returns not_found for an empty query without touching the OS', async () => {
    const result = await contactsService.resolveContactByName('   ');
    expect(result.status).toBe('not_found');
    expect(mockedContacts.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('caches contacts across calls within the TTL (getContactsAsync called once)', async () => {
    await contactsService.resolveContactByName('Maman');
    await contactsService.resolveContactByName('Jean Dupont');
    expect(mockedContacts.getContactsAsync).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after invalidateCache()', async () => {
    await contactsService.resolveContactByName('Maman');
    contactsService.invalidateCache();
    await contactsService.resolveContactByName('Maman');
    expect(mockedContacts.getContactsAsync).toHaveBeenCalledTimes(2);
  });
});
