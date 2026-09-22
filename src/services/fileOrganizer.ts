import { useSevenStore } from '../store/useSevenStore';
import { FileCategory, OrganizeFile, OrganizeResult } from '../types';
import { selfHealing } from '../core/selfHealing';
import { storageService } from './storageService';

const EXTENSION_CATEGORIES: Record<string, FileCategory> = {
  // Images
  jpg: 'Images',
  jpeg: 'Images',
  png: 'Images',
  webp: 'Images',
  gif: 'Images',
  svg: 'Images',
  bmp: 'Images',

  // Documents
  pdf: 'Documents',
  doc: 'Documents',
  docx: 'Documents',
  txt: 'Documents',
  xlsx: 'Documents',
  csv: 'Documents',
  pptx: 'Documents',
  md: 'Documents',

  // Installers
  apk: 'Installers',
  xapk: 'Installers',
  aab: 'Installers',
  exe: 'Installers',
  dmg: 'Installers',

  // Audio
  mp3: 'Audio',
  wav: 'Audio',
  ogg: 'Audio',
  flac: 'Audio',
  m4a: 'Audio',

  // Video
  mp4: 'Video',
  mkv: 'Video',
  mov: 'Video',
  avi: 'Video',

  // Code
  js: 'Code',
  ts: 'Code',
  tsx: 'Code',
  py: 'Code',
  html: 'Code',
  css: 'Code',
  json: 'Code',
};

class FileOrganizerService {
  private static instance: FileOrganizerService;
  private downloadsDir: string;
  private logFilePath: string;

  private constructor() {
    this.downloadsDir = `${storageService.getDocumentDirectory()}Downloads/`;
    this.logFilePath = `${storageService.getDocumentDirectory()}organizer_log.json`;
  }

  public static getInstance(): FileOrganizerService {
    if (!FileOrganizerService.instance) {
      FileOrganizerService.instance = new FileOrganizerService();
    }
    return FileOrganizerService.instance;
  }

  /**
   * Initializes downloads folder with realistic files if empty
   */
  public async ensureDownloadsFolder(): Promise<void> {
    try {
      const dirInfo = await storageService.getInfo(this.downloadsDir);
      if (!dirInfo.exists) {
        await storageService.makeDirectory(this.downloadsDir);
      }

      // Check if there are files
      const files = await storageService.readDirectory(this.downloadsDir);
      if (files.length === 0) {
        // Create sample downloads files matching video 02:18
        const sampleFiles = [
          { name: 'SEVEN Commander_Resume_2026.pdf', content: '%PDF-1.4 sample resume document' },
          { name: 'neural_orb_blueprint.png', content: 'PNG_IMAGE_DATA_SAMPLE' },
          { name: 'seven_core_v3.2.apk', content: 'APK_BINARY_PACKAGE_SAMPLE' },
          { name: 'quantum_audio_mix.mp3', content: 'MP3_AUDIO_STREAM_SAMPLE' },
          { name: 'dataset_export_sept.xlsx', content: 'EXCEL_DATASET_SAMPLE' },
          { name: 'cyber_avatar.jpg', content: 'JPG_IMAGE_DATA_SAMPLE' },
        ];

        for (const f of sampleFiles) {
          await storageService.writeAsString(`${this.downloadsDir}${f.name}`, f.content);
        }
      }
    } catch (e) {
      console.warn('Downloads folder init error:', e);
    }
  }

  /**
   * Scans downloads, groups by category, moves files into subfolders, and records undo log
   */
  public async organizeDownloads(): Promise<OrganizeResult> {
    const store = useSevenStore.getState();
    store.setStatus('organizing');
    store.addTerminalLog('Scanning /storage/emulated/0/Download...', 'cmd');

    await this.ensureDownloadsFolder();

    return await selfHealing.wrapExecution(
      'Organize Downloads',
      'organizer_log.json',
      '// File Organizer System Task',
      async () => {
        // Read directory contents
        const items = await storageService.readDirectory(this.downloadsDir);
        store.addTerminalLog(`Discovered ${items.length} items in root storage directory.`, 'info');

        const moveList: OrganizeFile[] = [];
        const categoryCounts: Record<string, number> = {};

        for (const item of items) {
          const itemPath = `${this.downloadsDir}${item}`;
          const itemInfo = await storageService.getInfo(itemPath);

          // Skip existing directories
          if (itemInfo.isDirectory) continue;

          // Detect category
          const parts = item.split('.');
          const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
          const category = EXTENSION_CATEGORIES[ext] || 'Others';

          const targetSubdir = `${this.downloadsDir}${category}/`;
          const targetPath = `${targetSubdir}${item}`;

          // Create category subfolder if not exists
          const targetDirInfo = await storageService.getInfo(targetSubdir);
          if (!targetDirInfo.exists) {
            await storageService.makeDirectory(targetSubdir);
            store.addTerminalLog(`Created subfolder: ${category}/`, 'info');
          }

          // Move file
          await storageService.move(itemPath, targetPath);

          const fileSize = itemInfo.exists && 'size' in itemInfo && itemInfo.size ? itemInfo.size : 1024;

          moveList.push({
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            name: item,
            originalPath: itemPath,
            newPath: targetPath,
            category,
            size: fileSize,
            extension: ext,
          });

          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
          store.addTerminalLog(`+ Moved: ${item} -> ${category}/${item}`, 'cmd');
        }

        const createdCategories = Object.keys(categoryCounts).map((c) => c.toLowerCase()).join(', ');
        const summaryMsg = `Organized ${moveList.length} files into subfolders. Created ${createdCategories || 'no new folders'}.`;

        const result: OrganizeResult = {
          id: `org-${Date.now()}`,
          timestamp: Date.now(),
          totalFiles: moveList.length,
          categories: categoryCounts,
          files: moveList,
          status: 'active',
          message: summaryMsg,
        };

        // Save undo journal to JSON file
        await storageService.writeAsString(this.logFilePath, JSON.stringify(result, null, 2));
        store.addTerminalLog(`* Undo journal recorded: ${this.logFilePath}`, 'success');
        store.addTerminalLog(summaryMsg, 'success');

        store.setOrganizeResult(result);
        store.setStatus('idle');
        return result;
      }
    );
  }

  /**
   * Restores files to original paths from the last organizer log
   */
  public async undoLastOrganization(): Promise<{ restoredCount: number; message: string }> {
    const store = useSevenStore.getState();
    store.setStatus('organizing');
    store.addTerminalLog('Initiating Rollback from organizer_log.json...', 'cmd');

    let log: OrganizeResult | null = store.lastOrganizeResult;

    try {
      const logFileInfo = await storageService.getInfo(this.logFilePath);
      if (logFileInfo.exists) {
        const raw = await storageService.readAsString(this.logFilePath);
        log = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Could not read organizer_log.json:', e);
    }

    if (!log || !log.files || log.files.length === 0) {
      store.addTerminalLog('No previous organization session found to undo.', 'warn');
      store.setStatus('idle');
      return { restoredCount: 0, message: 'No files to undo.' };
    }

    let restored = 0;
    for (const f of log.files) {
      try {
        const checkCurrent = await storageService.getInfo(f.newPath);
        if (checkCurrent.exists) {
          await storageService.move(f.newPath, f.originalPath);
          restored++;
          store.addTerminalLog(`- Restored: ${f.name} -> /Downloads/`, 'info');
        }
      } catch (err) {
        store.addTerminalLog(`! Failed to restore ${f.name}: ${err}`, 'warn');
      }
    }

    const undoMsg = `Rollback complete: Restored ${restored} files to root Downloads directory.`;
    store.addTerminalLog(undoMsg, 'success');

    // Update log status to undone
    log.status = 'undone';
    await storageService.writeAsString(this.logFilePath, JSON.stringify(log, null, 2)).catch(() => {});
    store.setOrganizeResult(log);
    store.setStatus('idle');

    return { restoredCount: restored, message: undoMsg };
  }
}

export const fileOrganizer = FileOrganizerService.getInstance();
