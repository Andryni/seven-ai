import { useSevenStore } from '../store/useSevenStore';
import { FileCategory, OrganizeFile, OrganizeResult } from '../types';
import { selfHealing } from '../core/selfHealing';
import { storageService } from './storageService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { resolveModel } from '../core/geminiClient';
import { localInferenceService } from './localInferenceService';

export interface OrganizerInsights {
  files: OrganizeFile[];
  duplicateGroups: { id: string; files: OrganizeFile[]; reclaimableBytes: number }[];
  indexedAt: number;
}

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
  private historyFilePath: string;

  private constructor() {
    this.downloadsDir = `${storageService.getDocumentDirectory()}Downloads/`;
    this.logFilePath = `${storageService.getDocumentDirectory()}organizer_log.json`;
    this.historyFilePath = `${storageService.getDocumentDirectory()}organizer_history.json`;
  }

  private async readHistory(): Promise<OrganizeResult[]> {
    try {
      const info = await storageService.getInfo(this.historyFilePath);
      if (!info.exists) return [];
      const parsed = JSON.parse(await storageService.readAsString(this.historyFilePath));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async recordJournal(result: OrganizeResult): Promise<void> {
    const history = await this.readHistory();
    const next = [result, ...history.filter((entry) => entry.id !== result.id)].slice(0, 10);
    await Promise.all([
      storageService.writeAsString(this.logFilePath, JSON.stringify(result, null, 2)),
      storageService.writeAsString(this.historyFilePath, JSON.stringify(next, null, 2)),
    ]);
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

  /** Import real files selected from Android/iOS storage into the active
   * organizer workspace. The picker always requires an explicit user action;
   * SEVEN never crawls storage behind the user's back. In public-directory
   * mode bytes are copied through SAF, while private mode keeps them in the
   * app sandbox. Existing names are preserved with a numeric suffix. */
  public async importLocalFiles(): Promise<{ imported: number; names: string[]; cancelled: boolean }> {
    const selection = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (selection.canceled) return { imported: 0, names: [], cancelled: true };

    const publicUri = Platform.OS === 'android'
      ? useSevenStore.getState().config.organizerDirectoryUri
      : undefined;
    const importedNames: string[] = [];

    if (publicUri) {
      const existingUris = await FileSystem.StorageAccessFramework.readDirectoryAsync(publicUri);
      const existingNames = new Set(existingUris.map((uri) => this.safName(uri).toLowerCase()));
      for (const asset of selection.assets) {
        const safeOriginal = asset.name.replace(/[\\/]/g, '_') || `import-${Date.now()}`;
        const dot = safeOriginal.lastIndexOf('.');
        const stem = dot > 0 ? safeOriginal.slice(0, dot) : safeOriginal;
        const extension = dot > 0 ? safeOriginal.slice(dot) : '';
        let name = safeOriginal;
        let suffix = 2;
        while (existingNames.has(name.toLowerCase())) name = `${stem} (${suffix++})${extension}`;
        const content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const target = await FileSystem.StorageAccessFramework.createFileAsync(
          publicUri,
          name,
          asset.mimeType || 'application/octet-stream'
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(target, content, {
          encoding: FileSystem.EncodingType.Base64,
        });
        existingNames.add(name.toLowerCase());
        importedNames.push(name);
      }
    } else {
      await this.ensureDownloadsFolder();
      for (const asset of selection.assets) {
        const safeOriginal = asset.name.replace(/[\\/]/g, '_') || `import-${Date.now()}`;
        const dot = safeOriginal.lastIndexOf('.');
        const stem = dot > 0 ? safeOriginal.slice(0, dot) : safeOriginal;
        const extension = dot > 0 ? safeOriginal.slice(dot) : '';
        let name = safeOriginal;
        let suffix = 2;
        let destination = `${this.downloadsDir}${name}`;
        while ((await storageService.getInfo(destination)).exists) {
          name = `${stem} (${suffix++})${extension}`;
          destination = `${this.downloadsDir}${name}`;
        }
        await FileSystem.copyAsync({ from: asset.uri, to: destination });
        importedNames.push(name);
      }
    }

    const store = useSevenStore.getState();
    store.addTerminalLog(
      `Imported ${importedNames.length} local file(s) into the active organizer workspace.`,
      'success'
    );
    return { imported: importedNames.length, names: importedNames, cancelled: false };
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
    const existing = await FileSystem.StorageAccessFramework.readDirectoryAsync(targetDir).catch(() => []);
    const existingNames = new Set(existing.map((uri) => this.safName(uri).toLowerCase()));
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let safeName = name;
    let suffix = 2;
    while (existingNames.has(safeName.toLowerCase())) {
      safeName = `${stem} (${suffix++})${extension}`;
    }

    const content = await FileSystem.StorageAccessFramework.readAsStringAsync(from, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const target = await FileSystem.StorageAccessFramework.createFileAsync(
      targetDir,
      safeName,
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

  private categoryFor(name: string): { extension: string; category: FileCategory } {
    const parts = name.split('.');
    const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
    return { extension, category: EXTENSION_CATEGORIES[extension] || 'Others' };
  }

  /** Scans without creating folders or moving bytes. The returned paths are
   * stable identifiers used by the confirmation UI to exclude individual
   * files from the eventual operation. */
  public async previewOrganization(): Promise<OrganizeResult> {
    const store = useSevenStore.getState();
    const publicUri = Platform.OS === 'android' ? store.config.organizerDirectoryUri : undefined;
    const files: OrganizeFile[] = [];
    const categories: Record<string, number> = {};

    if (publicUri) {
      const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(publicUri);
      for (const uri of entries) {
        const name = this.safName(uri);
        const { extension, category } = this.categoryFor(name);
        if (!extension) continue;
        files.push({
          id: uri,
          name,
          originalPath: uri,
          newPath: `${category}/${name}`,
          category,
          size: 0,
          extension,
        });
        categories[category] = (categories[category] || 0) + 1;
      }
    } else {
      await this.ensureDownloadsFolder();
      const entries = await storageService.readDirectory(this.downloadsDir);
      for (const name of entries) {
        const originalPath = `${this.downloadsDir}${name}`;
        const info = await storageService.getInfo(originalPath);
        if (info.isDirectory) continue;
        const { extension, category } = this.categoryFor(name);
        files.push({
          id: originalPath,
          name,
          originalPath,
          newPath: `${this.downloadsDir}${category}/${name}`,
          category,
          size: info.exists && 'size' in info && info.size ? info.size : 0,
          extension,
        });
        categories[category] = (categories[category] || 0) + 1;
      }
    }

    return {
      id: `preview-${Date.now()}`,
      timestamp: Date.now(),
      totalFiles: files.length,
      categories,
      files,
      status: 'active',
      message: `Previewed ${files.length} file(s). No file has been moved yet.`,
    };
  }

  /** Builds a local, privacy-preserving index and flags probable duplicates.
   * Candidates are deliberately not deleted: users remain in control. */
  public buildInsights(result: OrganizeResult): OrganizerInsights {
    const groups = new Map<string, OrganizeFile[]>();
    const files = result.files.map((file) => {
      const stem = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/\s*\(\d+\)$/, '')
        .replace(/[-_]+/g, ' ')
        .toLowerCase()
        .trim();
      const key = `${stem}|${file.extension}|${file.size || 'unknown'}`;
      const semanticText = `${stem} ${file.category} ${file.extension}`.toLowerCase();
      const indexed = { ...file, semanticText };
      groups.set(key, [...(groups.get(key) || []), indexed]);
      return indexed;
    });

    const duplicateGroups = [...groups.entries()]
      .filter(([, candidates]) => candidates.length > 1)
      .map(([id, candidates]) => ({
        id,
        files: candidates.map((file) => ({ ...file, duplicateGroup: id })),
        reclaimableBytes: candidates.slice(1).reduce((sum, file) => sum + file.size, 0),
      }));
    const duplicateIds = new Set(duplicateGroups.map((group) => group.id));
    return {
      files: files.map((file) => {
        const group = [...groups.entries()].find(([, candidates]) => candidates.some((item) => item.id === file.id));
        return group && duplicateIds.has(group[0]) ? { ...file, duplicateGroup: group[0] } : file;
      }),
      duplicateGroups,
      indexedAt: Date.now(),
    };
  }

  /** Confirms duplicate candidates by SHA-256 of their actual bytes. This is
   * explicit because hashing very large media can consume battery and I/O. */
  public async confirmDuplicates(insights: OrganizerInsights): Promise<{ hash: string; files: OrganizeFile[]; reclaimableBytes: number }[]> {
    const candidates = insights.duplicateGroups.flatMap((group) => group.files);
    const unique = [...new Map(candidates.map((file) => [file.id, file])).values()];
    const hashed = await Promise.all(unique.map(async (file) => {
      const path = (await storageService.getInfo(file.originalPath)).exists ? file.originalPath : file.newPath;
      const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, { encoding: Crypto.CryptoEncoding.HEX });
      return { file, hash };
    }));
    const groups = new Map<string, OrganizeFile[]>();
    hashed.forEach(({ file, hash }) => groups.set(hash, [...(groups.get(hash) || []), file]));
    return [...groups.entries()].filter(([, files]) => files.length > 1).map(([hash, files]) => ({
      hash, files, reclaimableBytes: files.slice(1).reduce((sum, file) => sum + file.size, 0),
    }));
  }

  public searchInsights(insights: OrganizerInsights, query: string): OrganizeFile[] {
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    if (!terms.length) return insights.files;
    return insights.files
      .map((file) => ({
        file,
        score: terms.reduce((score, term) => {
          const text = `${file.name} ${file.semanticText || ''} ${file.ocrText || ''}`.toLowerCase();
          return score + (text.includes(term) ? 1 : 0);
        }, 0),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.file);
  }

  /** Explicit cloud OCR for a single image. The API key stays in local secure
   * configuration and image bytes are only sent after this direct action. */
  public async recognizeImageText(file: OrganizeFile): Promise<string> {
    const config = useSevenStore.getState().config;
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(file.extension)) {
      throw new Error('OCR supports JPG, PNG and WEBP images.');
    }
    const data = await FileSystem.readAsStringAsync(file.originalPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mimeType = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
    if (config.localInferenceEnabled && config.localModelEndpoint) {
      return (await localInferenceService.analyzeImage(data, mimeType)).text;
    }
    if (config.privacyProfile === 'local' || config.cloudVisionEnabled === false) {
      throw new Error('Cloud vision is disabled by the active privacy profile. Configure local OCR instead.');
    }
    const key = config.geminiApiKey?.trim();
    if (!key) throw new Error('Configure a local multimodal endpoint or Gemini before using OCR.');
    const { model } = await resolveModel(key, {
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      systemInstruction: 'Extract visible text accurately. Return plain text only. Never invent missing words.',
    });
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Perform OCR on this image. Preserve reading order.' },
          { inlineData: { mimeType: `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`, data } },
        ],
      }],
    });
    return (result.response.text() || '').trim();
  }

  private async organizePublicDirectory(
    directoryUri: string,
    excludedPaths: ReadonlySet<string>
  ): Promise<OrganizeResult> {
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
      if (excludedPaths.has(sourceUri)) continue;
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
    await this.recordJournal(result);
    store.setOrganizeResult(result);
    store.addTerminalLog(result.message, 'success');
    return result;
  }

  /**
   * Scans downloads, groups by category, moves files into subfolders, and records undo log
   */
  public async organizeDownloads(excluded: string[] = []): Promise<OrganizeResult> {
    const store = useSevenStore.getState();
    const excludedPaths = new Set(excluded);
    store.setStatus('organizing');
    const publicUri = Platform.OS === 'android' ? store.config.organizerDirectoryUri : undefined;
    if (publicUri) {
      store.addTerminalLog('Scanning user-selected Android directory through SAF...', 'cmd');
      try {
        return await this.organizePublicDirectory(publicUri, excludedPaths);
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
          if (excludedPaths.has(itemPath)) continue;
          const itemInfo = await storageService.getInfo(itemPath);

          // Skip existing directories
          if (itemInfo.isDirectory) continue;

          // Detect category
          const parts = item.split('.');
          const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
          const category = EXTENSION_CATEGORIES[ext] || 'Others';

          const targetSubdir = `${this.downloadsDir}${category}/`;
          let targetName = item;

          // Create category subfolder if not exists
          const targetDirInfo = await storageService.getInfo(targetSubdir);
          if (!targetDirInfo.exists) {
            await storageService.makeDirectory(targetSubdir);
            store.addTerminalLog(`Created subfolder: ${category}/`, 'info');
          }

          // Never overwrite an existing file silently. Keep the original name
          // where possible, then append a familiar numeric suffix.
          const dot = item.lastIndexOf('.');
          const stem = dot > 0 ? item.slice(0, dot) : item;
          const extensionWithDot = dot > 0 ? item.slice(dot) : '';
          let targetPath = `${targetSubdir}${targetName}`;
          let suffix = 2;
          while ((await storageService.getInfo(targetPath)).exists) {
            targetName = `${stem} (${suffix++})${extensionWithDot}`;
            targetPath = `${targetSubdir}${targetName}`;
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
        await this.recordJournal(result);
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

    let history = await this.readHistory();
    let log: OrganizeResult | null = history.find((entry) => entry.status === 'active') || null;

    // Backward compatibility for installations with only the original
    // single-journal file.
    if (!log) {
      try {
        const logFileInfo = await storageService.getInfo(this.logFilePath);
        if (logFileInfo.exists) {
          const raw = await storageService.readAsString(this.logFilePath);
          const legacy = JSON.parse(raw) as OrganizeResult;
          if (legacy.status === 'active') log = legacy;
        }
      } catch (e) {
        console.warn('Could not read organizer_log.json:', e);
      }
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

    // Update the bounded history, then expose the next reversible operation so
    // Undo can be repeated instead of being limited to one session.
    log.status = 'undone';
    history = [log, ...history.filter((entry) => entry.id !== log!.id)].slice(0, 10);
    await storageService
      .writeAsString(this.historyFilePath, JSON.stringify(history, null, 2))
      .catch(() => {});
    const nextActive = history.find((entry) => entry.status === 'active');
    await storageService
      .writeAsString(this.logFilePath, JSON.stringify(nextActive || log, null, 2))
      .catch(() => {});
    store.setOrganizeResult(nextActive || log);
    store.setStatus('idle');

    return { restoredCount: restored, message: undoMsg };
  }
}

export const fileOrganizer = FileOrganizerService.getInstance();
