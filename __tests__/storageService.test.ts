import { storageService } from '../src/services/storageService';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy');

/**
 * Verifies the storage wrapper contract: operations must actually persist and
 * errors must propagate (the old implementation swallowed everything in
 * silent catch blocks, which is why the app "did nothing").
 */
describe('storageService', () => {
  beforeEach(() => {
    (FileSystem as any).__resetMockFS?.();
  });

  test('writeAsString then readAsString round-trips content', async () => {
    const path = `${storageService.getDocumentDirectory()}test/example.txt`;
    await storageService.ensureDirectory(`${storageService.getDocumentDirectory()}test/`);
    await storageService.writeAsString(path, 'hello seven');
    await expect(storageService.readAsString(path)).resolves.toBe('hello seven');
  });

  test('readAsString throws for missing files (no silent empty string)', async () => {
    await expect(
      storageService.readAsString(`${storageService.getDocumentDirectory()}missing/ghost.txt`)
    ).rejects.toThrow();
  });

  test('getInfo reports non-existent paths honestly', async () => {
    const info = await storageService.getInfo(`${storageService.getDocumentDirectory()}nope.bin`);
    expect(info.exists).toBe(false);
  });

  test('move relocates a file and drops the original', async () => {
    const base = storageService.getDocumentDirectory();
    const src = `${base}move-src.txt`;
    const dst = `${base}moved/move-dst.txt`;
    await storageService.ensureDirectory(`${base}moved/`);
    await storageService.writeAsString(src, 'move me');
    await storageService.move(src, dst);
    expect((await storageService.getInfo(src)).exists).toBe(false);
    expect((await storageService.getInfo(dst)).exists).toBe(true);
  });
});
