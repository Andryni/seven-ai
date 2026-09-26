import { storageService } from './storageService';

export interface CloudJournalEntry {
  id: string;
  timestamp: number;
  provider: 'gemini' | 'openrouter' | 'brave' | 'fish' | 'elevenlabs' | 'other';
  action: string;
  model?: string;
  status: 'sent' | 'completed' | 'failed';
  /** Deliberately metadata-only: prompts, media, responses and credentials are never journaled. */
  dataClass?: 'text' | 'audio' | 'image' | 'document' | 'search' | 'metadata';
}

type Listener = (entries: CloudJournalEntry[]) => void;

class CloudJournalService {
  private entries: CloudJournalEntry[] = [];
  private loaded = false;
  private listeners = new Set<Listener>();
  private readonly path = `${storageService.getDocumentDirectory()}cloud_journal.json`;

  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const info = await storageService.getInfo(this.path);
      if (info.exists) {
        const parsed = JSON.parse(await storageService.readAsString(this.path));
        if (Array.isArray(parsed)) this.entries = parsed.slice(0, 200);
      }
    } catch {
      this.entries = [];
    }
    this.emit();
  }

  getEntries(): CloudJournalEntry[] {
    return [...this.entries];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => this.listeners.delete(listener);
  }

  async record(entry: Omit<CloudJournalEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.initialize();
    this.entries = [{ ...entry, id: `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() }, ...this.entries].slice(0, 200);
    await storageService.writeAsString(this.path, JSON.stringify(this.entries));
    this.emit();
  }

  async clear(): Promise<void> {
    this.entries = [];
    await storageService.deleteFile(this.path).catch(() => {});
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getEntries();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const cloudJournalService = new CloudJournalService();
