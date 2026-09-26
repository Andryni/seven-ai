import { fileOrganizer } from '../src/services/fileOrganizer';
import { storageService } from '../src/services/storageService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('expo-file-system/legacy');
jest.mock('expo-document-picker');

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

  test('imports user-selected local files into the private workspace without overwriting names', async () => {
    const sourceA = 'file:///mock/cache/report.pdf';
    const sourceB = 'file:///mock/cache/report-copy.pdf';
    await storageService.writeAsString(sourceA, 'FIRST');
    await storageService.writeAsString(sourceB, 'SECOND');
    await storageService.writeAsString(`${DOWNLOADS}report.pdf`, 'EXISTING');
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: sourceA, name: 'report.pdf', mimeType: 'application/pdf' },
        { uri: sourceB, name: 'report.pdf', mimeType: 'application/pdf' },
      ],
    });

    const result = await fileOrganizer.importLocalFiles();

    expect(result).toMatchObject({ imported: 2, cancelled: false });
    expect((await storageService.getInfo(`${DOWNLOADS}report.pdf`)).exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}report (2).pdf`)).exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}report (3).pdf`)).exists).toBe(true);
  });

  test('does not alter storage when the local file picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });
    await expect(fileOrganizer.importLocalFiles()).resolves.toEqual({
      imported: 0,
      names: [],
      cancelled: true,
    });
  });

  test('preview is non-destructive and exclusions are honored on confirmation', async () => {
    await storageService.writeAsString(`${DOWNLOADS}keep.pdf`, 'PDFDATA');
    await storageService.writeAsString(`${DOWNLOADS}move.png`, 'PNGDATA');

    const plan = await fileOrganizer.previewOrganization();
    expect(plan.totalFiles).toBe(2);
    expect((await storageService.getInfo(`${DOWNLOADS}keep.pdf`)).exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}move.png`)).exists).toBe(true);

    const excluded = plan.files.find((file) => file.name === 'keep.pdf')!;
    const result = await fileOrganizer.organizeDownloads([excluded.originalPath]);
    expect(result.totalFiles).toBe(1);
    expect((await storageService.getInfo(`${DOWNLOADS}keep.pdf`)).exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}Images/move.png`)).exists).toBe(true);
  }, 20000);

  test('indexes semantic names and flags probable duplicates without deleting them', async () => {
    jest.spyOn(Crypto, 'digestStringAsync').mockResolvedValue('a'.repeat(64));
    await storageService.writeAsString(`${DOWNLOADS}report.pdf`, 'SAME');
    await storageService.writeAsString(`${DOWNLOADS}report (2).pdf`, 'SAME');
    const plan = await fileOrganizer.previewOrganization();
    const insights = fileOrganizer.buildInsights(plan);

    expect(insights.duplicateGroups).toHaveLength(1);
    expect(fileOrganizer.searchInsights(insights, 'report')).toHaveLength(2);
    const exact = await fileOrganizer.confirmDuplicates(insights);
    expect(exact).toHaveLength(1);
    expect(exact[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect((await storageService.getInfo(`${DOWNLOADS}report.pdf`)).exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}report (2).pdf`)).exists).toBe(true);
  });

  test('preserves both files when a destination name already exists', async () => {
    await storageService.makeDirectory(`${DOWNLOADS}Documents/`);
    await storageService.writeAsString(`${DOWNLOADS}Documents/report.pdf`, 'OLD');
    await storageService.writeAsString(`${DOWNLOADS}report.pdf`, 'NEW');

    const result = await fileOrganizer.organizeDownloads();
    expect(result.totalFiles).toBe(1);
    expect((await storageService.getInfo(`${DOWNLOADS}Documents/report.pdf`)).exists).toBe(true);
    expect((await storageService.getInfo(`${DOWNLOADS}Documents/report (2).pdf`)).exists).toBe(true);
  });

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

  test('keeps a bounded history so multiple organization sessions can be undone', async () => {
    await storageService.writeAsString(`${DOWNLOADS}first.png`, 'ONE');
    await fileOrganizer.organizeDownloads();
    await storageService.writeAsString(`${DOWNLOADS}second.pdf`, 'TWO');
    await fileOrganizer.organizeDownloads();

    expect((await fileOrganizer.undoLastOrganization()).restoredCount).toBe(1);
    expect((await storageService.getInfo(`${DOWNLOADS}second.pdf`)).exists).toBe(true);
    expect((await fileOrganizer.undoLastOrganization()).restoredCount).toBe(1);
    expect((await storageService.getInfo(`${DOWNLOADS}first.png`)).exists).toBe(true);
  });

  test('organizeDownloads propagates failures instead of fabricating results', async () => {
    await storageService.writeAsString(`${DOWNLOADS}photo.png`, 'PNGDATA');

    // The mock itself throws on the next moveAsync call — a realistic
    // mid-operation failure while relocating the first discovered file.
    (FileSystem as any).__failNextMove();

    await expect(fileOrganizer.organizeDownloads()).rejects.toThrow('boom');
  }, 15000);
});
