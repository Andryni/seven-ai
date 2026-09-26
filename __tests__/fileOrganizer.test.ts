import { fileOrganizer } from '../src/services/fileOrganizer';
import { storageService } from '../src/services/storageService';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy');

/**
 * Integration-style tests for the Smart Storage Organizer against the
 * in-memory expo-file-system mock. These verify the core P0 fix: the
 * organizer must REALLY write, move and restore files, and surface errors
 * instead of swallowing them.
 */

const DOCS = storageService.getDocumentDirectory();
const DOWNLOADS = `${DOCS}Downloads/`;

const resetFS = () => {
  (FileSystem as any).__resetMockFS?.();
};

describe('fileOrganizer', () => {
  beforeEach(() => {
    resetFS();
  });

  test('ensureDownloadsFolder creates an honest empty sandbox', async () => {
    await fileOrganizer.ensureDownloadsFolder();

    const info = await storageService.getInfo(DOWNLOADS);
    const files = await storageService.readDirectory(DOWNLOADS);
    expect(info.exists).toBe(true);
    expect(files).toEqual([]);
  }, 15000);

  test('organizeDownloads moves files into category subfolders and records the journal', async () => {
    // Add real test fixtures; production no longer seeds staged demo files.
    await storageService.writeAsString(`${DOWNLOADS}photo.png`, 'PNGDATA');
    await storageService.writeAsString(`${DOWNLOADS}report.pdf`, 'PDFDATA');
    await storageService.writeAsString(`${DOWNLOADS}app.apk`, 'APKDATA');

    const result = await fileOrganizer.organizeDownloads();

    expect(result.totalFiles).toBe(3);
    expect(result.categories['Images']).toBe(1);
    expect(result.categories['Documents']).toBe(1);
    expect(result.categories['Installers']).toBe(1);

    // Files must REALLY have moved
    const moved = await storageService.getInfo(`${DOWNLOADS}Images/photo.png`);
    expect(moved.exists).toBe(true);

    const journalRaw = await storageService.readAsString(`${DOCS}organizer_log.json`);
    const journal = JSON.parse(journalRaw);
    expect(journal.files).toHaveLength(3);
    expect(journal.status).toBe('active');
  }, 20000);

  test('undoLastOrganization restores files to their original location', async () => {
    await storageService.writeAsString(`${DOWNLOADS}clip.mp4`, 'VIDEODATA');
    const organized = await fileOrganizer.organizeDownloads();
    expect(organized.totalFiles).toBe(1);

    expect((await storageService.getInfo(`${DOWNLOADS}Video/clip.mp4`)).exists).toBe(true);

    const undo = await fileOrganizer.undoLastOrganization();
    expect(undo.restoredCount).toBe(1);

    const restored = await storageService.getInfo(`${DOWNLOADS}clip.mp4`);
    expect(restored.exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}Video/clip.mp4`)).exists).toBe(false);
  }, 20000);

  test('organizeDownloads propagates failures instead of fabricating results', async () => {
    await storageService.writeAsString(`${DOWNLOADS}photo.png`, 'PNGDATA');

    // The mock itself throws on the next moveAsync call — a realistic
    // mid-operation failure while relocating the first discovered file.
    (FileSystem as any).__failNextMove();

    await expect(fileOrganizer.organizeDownloads()).rejects.toThrow('boom');
  }, 15000);
});
