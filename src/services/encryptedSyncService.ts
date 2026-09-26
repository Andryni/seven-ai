import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { useSevenStore } from '../store/useSevenStore';
import { withoutSecrets } from './secretConfigService';
import { fetchWithTimeout } from './network';
import { storageService } from './storageService';
import { memoryService } from './memoryService';

export interface SyncEnvelope {
  version: 1;
  deviceId: string;
  updatedAt: number;
  nonce: string;
  ciphertext: string;
  algorithm: 'XChaCha20-Poly1305';
}
export interface SyncStatus {
  phase: 'idle' | 'syncing' | 'success' | 'conflict' | 'error';
  lastSyncAt?: number;
  detail: string;
  remoteRevision?: string;
}

const DEVICE_FILE = `${storageService.getDocumentDirectory()}sync_device_id.txt`;
const STATUS_FILE = `${storageService.getDocumentDirectory()}sync_status.json`;

async function deriveKey(secret: string): Promise<Uint8Array> {
  if (secret.trim().length < 16) throw new Error('The sync encryption key must contain at least 16 characters.');
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, secret, { encoding: Crypto.CryptoEncoding.HEX });
  return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}

class EncryptedSyncService {
  private async deviceId(): Promise<string> {
    const info = await storageService.getInfo(DEVICE_FILE);
    if (info.exists) return storageService.readAsString(DEVICE_FILE);
    const id = `seven-${Date.now()}-${Buffer.from(Crypto.getRandomBytes(8)).toString('hex')}`;
    await storageService.writeAsString(DEVICE_FILE, id);
    return id;
  }

  async createEnvelope(payload: unknown, secret: string): Promise<SyncEnvelope> {
    const key = await deriveKey(secret);
    const nonce = Crypto.getRandomBytes(24);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
    return {
      version: 1,
      deviceId: await this.deviceId(),
      updatedAt: Date.now(),
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      algorithm: 'XChaCha20-Poly1305',
    };
  }

  async openEnvelope(envelope: SyncEnvelope, secret: string): Promise<unknown> {
    if (envelope.version !== 1 || envelope.algorithm !== 'XChaCha20-Poly1305') throw new Error('Unsupported encrypted sync envelope.');
    const key = await deriveKey(secret);
    const nonce = Uint8Array.from(Buffer.from(envelope.nonce, 'base64'));
    const ciphertext = Uint8Array.from(Buffer.from(envelope.ciphertext, 'base64'));
    const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async push(): Promise<SyncStatus> {
    const state = useSevenStore.getState();
    const config = state.config;
    const endpoint = config.syncEndpoint?.trim().replace(/\/$/, '');
    if (!config.syncEnabled || !endpoint) throw new Error('Encrypted sync is not configured.');
    if (!config.syncEncryptionKey) throw new Error('A sync encryption key is required.');
    const deviceId = await this.deviceId();
    const payload = {
      schema: 1,
      exportedAt: Date.now(),
      config: withoutSecrets(config),
      memory: await memoryService.getAllFacts(),
      chatSessions: state.chatSessions,
      routines: state.automationRoutines,
      projects: state.daveProjects,
      research: state.researchDocs,
    };
    const envelope = await this.createEnvelope(payload, config.syncEncryptionKey);
    const previous = await this.status();
    const response = await fetchWithTimeout(`${endpoint}/v1/snapshots/${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(config.syncToken ? { Authorization: `Bearer ${config.syncToken}` } : {}),
        ...(previous.remoteRevision ? { 'If-Match': previous.remoteRevision } : {}),
      },
      body: JSON.stringify(envelope),
    }, 30_000);
    if (response.status === 409 || response.status === 412) {
      return this.saveStatus({ phase: 'conflict', detail: 'Remote data changed. Pull and review before overwriting.', remoteRevision: response.headers.get('etag') || undefined });
    }
    if (!response.ok) throw new Error(`Sync endpoint returned ${response.status}.`);
    return this.saveStatus({ phase: 'success', detail: 'Encrypted snapshot uploaded.', lastSyncAt: Date.now(), remoteRevision: response.headers.get('etag') || undefined });
  }

  async pull(): Promise<{ status: SyncStatus; payload?: unknown }> {
    const config = useSevenStore.getState().config;
    const endpoint = config.syncEndpoint?.trim().replace(/\/$/, '');
    if (!config.syncEnabled || !endpoint || !config.syncEncryptionKey) throw new Error('Encrypted sync is not configured.');
    const response = await fetchWithTimeout(`${endpoint}/v1/snapshots/${encodeURIComponent(await this.deviceId())}`, {
      headers: config.syncToken ? { Authorization: `Bearer ${config.syncToken}` } : {},
    }, 30_000);
    if (response.status === 404) return { status: await this.saveStatus({ phase: 'idle', detail: 'No remote snapshot exists yet.' }) };
    if (!response.ok) throw new Error(`Sync endpoint returned ${response.status}.`);
    const envelope = await response.json() as SyncEnvelope;
    const payload = await this.openEnvelope(envelope, config.syncEncryptionKey);
    const status = await this.saveStatus({ phase: 'success', detail: 'Encrypted snapshot downloaded and verified. Import requires explicit confirmation.', lastSyncAt: Date.now(), remoteRevision: response.headers.get('etag') || undefined });
    return { status, payload };
  }

  async applyPulledPayload(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object' || (payload as any).schema !== 1) throw new Error('Invalid synchronized snapshot schema.');
    const data = payload as { memory?: unknown; chatSessions?: unknown; routines?: unknown; projects?: unknown; research?: unknown };
    useSevenStore.getState().importPortableSnapshot({
      chatSessions: Array.isArray(data.chatSessions) ? data.chatSessions as any : undefined,
      routines: Array.isArray(data.routines) ? data.routines as any : undefined,
      projects: Array.isArray(data.projects) ? data.projects as any : undefined,
      research: Array.isArray(data.research) ? data.research as any : undefined,
    });
    if (Array.isArray(data.memory)) await memoryService.importFacts(data.memory as any);
  }

  async status(): Promise<SyncStatus> {
    try {
      const info = await storageService.getInfo(STATUS_FILE);
      return info.exists ? JSON.parse(await storageService.readAsString(STATUS_FILE)) : { phase: 'idle', detail: 'Never synchronized.' };
    } catch { return { phase: 'idle', detail: 'Never synchronized.' }; }
  }

  private async saveStatus(status: SyncStatus): Promise<SyncStatus> {
    await storageService.writeAsString(STATUS_FILE, JSON.stringify(status));
    return status;
  }
}

export const encryptedSyncService = new EncryptedSyncService();
