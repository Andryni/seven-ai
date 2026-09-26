import { useSevenStore } from '../store/useSevenStore';
import { FileCategory, OrganizeFile, OrganizeResult } from '../types';
import { selfHealing } from '../core/selfHealing';
import { storageService } from './storageService';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

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

  public usesPublicDirectory(): boolean {
    return Platform.OS === 'android' && !!useSevenStore.getState().config.organizerDirectoryUri;
  }

  /** Lets the user grant scoped access to the real Android Downloads (or any
   * chosen) directory. No broad MANAGE_EXTERNAL_STORAGE permission is used. */
  public async selectPublicDirectory(): Promise<{ granted: boolean; uri?: string }> {
    if (Platform.OS !== 'android') return { granted: false };
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return { granted: false };
    await useSevenStore.getState().setConfig({ organizerDirectoryUri: permission.directoryUri });
    useSevenStore.getState().addTerminalLog('Public directory access granted through Android SAF.', 'success');
    return { granted: true, uri: permission.directoryUri };
  }

  public async usePrivateSandbox(): Promise<void> {
    await useSevenStore.getState().setConfig({ organizerDirectoryUri: undefined });
  }

  private safName(uri: string): string {
    try {
      const decoded = decodeURIComponent(uri);
      return decoded.slice(decoded.lastIndexOf('/') + 1).split(':').pop() || decoded;
    } catch {
      return uri.slice(uri.lastIndexOf('/') + 1);
    }
  }

  private async safCopyDelete(from: string, targetDir: string, name: string): Promise<string> {
    const content = await FileSystem.StorageAccessFramework.readAsStringAsync(from, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const target = await FileSystem.StorageAccessFramework.createFileAsync(
      targetDir,
      name,
      'application/octet-stream'
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(target, content, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.StorageAccessFramework.deleteAsync(from);
    return target;
  }

  /** Creates the app-private organizer directory. It deliberately does not
   * seed fake files: an empty result must mean “no files”, not a staged demo. */
  public async ensureDownloadsFolder(): Promise<void> {
    try {
      const dirInfo = await storageService.getInfo(this.downloadsDir);
      if (!dirInfo.exists) {
        await storageService.makeDirectory(this.downloadsDir);
      }
    } catch (e) {
      console.warn('Organizer sandbox init error:', e);
      throw e;
    }
  }

  private async organizePublicDirectory(directoryUri: string): Promise<OrganizeResult> {
    const store = useSevenStore.getState();
    const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
    const categoryDirs = new Map<string, string>();
    const moveList: OrganizeFile[] = [];
    const categoryCounts: Record<string, number> = {};

    // Existing category directories are reused. SAF returns opaque content URIs,
    // so the display name is decoded only for classification and UI output.
    for (const uri of entries) {
      const name = this.safName(uri);
      if (Object.values(EXTENSION_CATEGORIES).includes(name as FileCategory) || name === 'Others') {
        categoryDirs.set(name, uri);
      }
    }

    for (const sourceUri of entries) {
      const name = this.safName(sourceUri);
      const parts = name.split('.');
      const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
      if (!ext) continue; // category directory or extensionless entry
      const category = EXTENSION_CATEGORIES[ext] || 'Others';
      let targetDir = categoryDirs.get(category);
      if (!targetDir) {
        targetDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(directoryUri, category);
        categoryDirs.set(category, targetDir);
      }
      const targetUri = await this.safCopyDelete(sourceUri, targetDir, name);
      moveList.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        originalPath: sourceUri,
        newPath: targetUri,
        category,
        size: 0,
        extension: ext,
      });
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      store.addTerminalLog(`Moved public file: ${name} -> ${category}/`, 'cmd');
    }

    const result: OrganizeResult = {
      id: `org-${Date.now()}`,
      timestamp: Date.now(),
      totalFiles: moveList.length,
      categories: categoryCounts,
      files: moveList,
      status: 'active',
      message: `Organized ${moveList.length} public file(s) through Android scoped storage.`,
    };
    await storageService.writeAsString(this.logFilePath, JSON.stringify(result, null, 2));
    store.setOrganizeResult(result);
    store.addTerminalLog(result.message, 'success');
    return result;
  }

  /**
   * Scans downloads, groups by category, moves files into subfolders, and records undo log
   */
  public async organizeDownloads(): Promise<OrganizeResult> {
    const store = useSevenStore.getState();
    store.setStatus('organizing');
    const publicUri = Platform.OS === 'android' ? store.config.organizerDirectoryUri : undefined;
    if (publicUri) {
      store.addTerminalLog('Scanning user-selected Android directory through SAF...', 'cmd');
      try {
        return await this.organizePublicDirectory(publicUri);
      } finally {
        store.setStatus('idle');
      }
    }

    store.addTerminalLog('Scanning app-private organizer sandbox (/Downloads/)...', 'cmd');
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
    const publicUri = Platform.OS === 'android' ? store.config.organizerDirectoryUri : undefined;
    for (const f of log.files) {
      try {
        if (publicUri && f.newPath.startsWith('content://')) {
          await this.safCopyDelete(f.newPath, publicUri, f.name);
          restored++;
          store.addTerminalLog(`Restored public file: ${f.name}`, 'info');
          continue;
        }
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
