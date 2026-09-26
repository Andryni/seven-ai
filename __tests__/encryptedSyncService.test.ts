import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { encryptedSyncService } from '../src/services/encryptedSyncService';

jest.mock('expo-file-system/legacy');

describe('encryptedSyncService', () => {
  beforeEach(() => {
    (FileSystem as any).__resetMockFS?.();
    jest.spyOn(Crypto, 'digestStringAsync').mockImplementation(async (_algorithm, value) => {
      const seed = [...value].reduce((sum, char) => (sum + char.charCodeAt(0)) % 255, 1);
      return Array.from({ length: 32 }, (_, index) => ((seed + index * 17) % 256).toString(16).padStart(2, '0')).join('');
    });
    jest.spyOn(Crypto, 'getRandomBytes').mockReturnValue(Uint8Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it('round-trips an authenticated encrypted envelope without plaintext leakage', async () => {
    const payload = { memory: ['private fact'], profile: 'work' };
    const envelope = await encryptedSyncService.createEnvelope(payload, 'correct horse battery staple');
    expect(envelope.algorithm).toBe('XChaCha20-Poly1305');
    expect(envelope.ciphertext).not.toContain('private fact');
    await expect(encryptedSyncService.openEnvelope(envelope, 'correct horse battery staple')).resolves.toEqual(payload);
  });

  it('rejects a wrong encryption key', async () => {
    const envelope = await encryptedSyncService.createEnvelope({ secret: true }, 'first sufficiently long passphrase');
    await expect(encryptedSyncService.openEnvelope(envelope, 'second sufficiently long passphrase')).rejects.toThrow();
  });
});
