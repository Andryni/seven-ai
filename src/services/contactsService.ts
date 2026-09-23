import * as Contacts from 'expo-contacts/legacy';

/**
 * Bridges the device address book into the agent so voice/chat commands can
 * say "appelle Maman" or "envoie un SMS à Jean" instead of requiring a raw
 * phone number. Everything here is read-only against the OS contact store —
 * SEVEN never creates, edits, or deletes a contact.
 *
 * The legacy API (`expo-contacts/legacy`) is used deliberately: it is the
 * stable, fully cross-platform surface (the new class-based API in SDK 57
 * has uneven Android coverage for some fields) and its behavior matches
 * years of production usage across Expo apps.
 */

export interface ResolvedContact {
  id: string;
  name: string;
  /** All phone numbers on file for this contact, in device order. */
  phoneNumbers: string[];
  /** True when the matched name was an exact case-insensitive match. */
  exact: boolean;
}

export type ContactLookupResult =
  | { status: 'found'; contact: ResolvedContact }
  /** More than one contact matches the query closely enough to be ambiguous. */
  | { status: 'ambiguous'; matches: ResolvedContact[] }
  | { status: 'not_found' }
  | { status: 'permission_denied' }
  | { status: 'unavailable'; reason: string };

class ContactsService {
  private static instance: ContactsService;
  private cache: ResolvedContact[] | null = null;
  private cacheAt = 0;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  public static getInstance(): ContactsService {
    if (!ContactsService.instance) {
      ContactsService.instance = new ContactsService();
    }
    return ContactsService.instance;
  }

  /** Clears the in-memory contact cache (e.g. after granting permission). */
  public invalidateCache(): void {
    this.cache = null;
    this.cacheAt = 0;
  }

  public async hasPermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      return status === Contacts.PermissionStatus.GRANTED;
    } catch {
      return false;
    }
  }

  public async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      return status === Contacts.PermissionStatus.GRANTED;
    } catch {
      return false;
    }
  }

  /**
   * Loads (and caches for 5 minutes) every contact that has at least one
   * phone number. A short TTL keeps memory/CPU bounded on large address
   * books while still reflecting a newly added contact within one session.
   */
  private async loadContacts(): Promise<ResolvedContact[] | null> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < ContactsService.CACHE_TTL_MS) {
      return this.cache;
    }

    const granted = await this.hasPermission();
    if (!granted) return null;

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      const resolved: ResolvedContact[] = data
        .filter((c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          phoneNumbers: (c.phoneNumbers || [])
            .map((p) => p.number || '')
            .filter((n) => n.trim().length > 0),
          exact: false,
        }))
        .filter((c) => c.phoneNumbers.length > 0);

      this.cache = resolved;
      this.cacheAt = now;
      return resolved;
    } catch {
      return null;
    }
  }

  /**
   * Resolves a spoken/typed name (e.g. "maman", "Jean Dupont") to a device
   * contact. Matching is diacritic- and case-insensitive, and tries in
   * order: exact full-name match, then "query is a whole word inside the
   * name" (so "Jean" matches "Jean Dupont" but not "Jeanne"), then a loose
   * substring fallback. Multiple equally strong matches are reported as
   * ambiguous so the caller can ask the user to disambiguate rather than
   * silently guessing and calling the wrong person.
   */
  public async resolveContactByName(query: string): Promise<ContactLookupResult> {
    const trimmed = query.trim();
    if (!trimmed) return { status: 'not_found' };

    const granted = await this.hasPermission();
    if (!granted) return { status: 'permission_denied' };

    const contacts = await this.loadContacts();
    if (contacts === null) return { status: 'unavailable', reason: 'Could not read the address book.' };
    if (contacts.length === 0) return { status: 'not_found' };

    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip accents
        .toLowerCase()
        .trim();

    const q = normalize(trimmed);
    const qWords = q.split(/\s+/).filter(Boolean);

    const exact = contacts.filter((c) => normalize(c.name) === q);
    if (exact.length === 1) {
      return { status: 'found', contact: { ...exact[0], exact: true } };
    }
    if (exact.length > 1) {
      return { status: 'ambiguous', matches: exact.map((c) => ({ ...c, exact: true })) };
    }

    // Whole-word match: every query word appears as a whole word in the name.
    const wholeWord = contacts.filter((c) => {
      const nameWords = normalize(c.name).split(/\s+/).filter(Boolean);
      return qWords.every((w) => nameWords.includes(w));
    });
    if (wholeWord.length === 1) {
      return { status: 'found', contact: wholeWord[0] };
    }
    if (wholeWord.length > 1) {
      return { status: 'ambiguous', matches: wholeWord };
    }

    // Loose substring fallback (handles nicknames/partial typing).
    const substring = contacts.filter((c) => normalize(c.name).includes(q));
    if (substring.length === 1) {
      return { status: 'found', contact: substring[0] };
    }
    if (substring.length > 1) {
      return { status: 'ambiguous', matches: substring.slice(0, 5) };
    }

    return { status: 'not_found' };
  }
}

export const contactsService = ContactsService.getInstance();
