// SDK 57: the classic callback-style API moved to the 'legacy' subpath.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * In-memory filesystem for the web platform.
 * The legacy expo-file-system methods (getInfoAsync, moveAsync...) throw
 * "not available on web" errors, which broke the Dave agent and the
 * organizer in the browser demo. This shim keeps the same contract with an
 * in-memory tree (session-scoped, like every other web-side state).
 */
const webFiles = new Map<string, string>();
const webDirs = new Set<string>();

const normalize = (p: string) => p.replace(/\/+$/, '');

async function webGetInfo(path: string) {
  const key = normalize(path);
  if (webDirs.has(key)) return { exists: true, isDirectory: true, size: 0, uri: path };
  if (webFiles.has(key)) return { exists: true, isDirectory: false, size: webFiles.get(key)!.length, uri: path };
  return { exists: false, isDirectory: false, size: 0, uri: path };
}

async function webMakeDirectory(path: string) {
  webDirs.add(normalize(path));
}

async function webWrite(path: string, content: string) {
  webFiles.set(normalize(path), content);
}

async function webRead(path: string) {
  const key = normalize(path);
  if (!webFiles.has(key)) throw new Error(`File not found: ${key}`);
  return webFiles.get(key)!;
}

async function webReadDirectory(path: string) {
  const key = normalize(path);
  const prefix = key.endsWith('/') ? key : `${key}/`;
  const names = new Set<string>();
  for (const full of webFiles.keys()) {
    if (full.startsWith(prefix)) {
      const rest = full.slice(prefix.length);
      if (rest) names.add(rest.split('/')[0]);
    }
  }
  for (const dir of webDirs) {
    if (dir.startsWith(prefix) && normalize(dir) !== key) {
      const rest = dir.slice(prefix.length);
      if (rest) names.add(rest.split('/')[0]);
    }
  }
  return Array.from(names);
}

async function webMove(from: string, to: string) {
  const f = normalize(from);
  const t = normalize(to);
  if (webFiles.has(f)) {
    webFiles.set(t, webFiles.get(f)!);
    webFiles.delete(f);
  } else if (webDirs.has(f)) {
    webDirs.delete(f);
    webDirs.add(t);
  } else {
    throw new Error(`moveAsync: source not found: ${f}`);
  }
}

async function webCopy(from: string, to: string) {
  const f = normalize(from);
  const t = normalize(to);
  if (!webFiles.has(f)) throw new Error(`copyAsync: source not found: ${f}`);
  webFiles.set(t, webFiles.get(f)!);
}

async function webDelete(path: string) {
  const key = normalize(path);
  webFiles.delete(key);
  webDirs.delete(key);
}

/**
 * Thin typed wrapper around the legacy expo-file-system API.
 *
 * IMPORTANT: unlike the previous implementation, failures are NO LONGER
 * swallowed. Every method rethrows so callers (organizer, Dave agent,
 * self-healing) can actually detect and surface problems in the terminal log.
 * On web, calls are transparently routed to the in-memory shim.
 */
class StorageService {
  private static instance: StorageService;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private get isWeb(): boolean {
    return Platform.OS === 'web';
  }

  public getDocumentDirectory(): string {
    return this.isWeb ? 'file:///web-mem/' : FileSystem.documentDirectory ?? '';
  }

  public async getInfo(
    path: string
  ): Promise<{ exists: boolean; isDirectory?: boolean; size?: number }> {
    if (this.isWeb) {
      const info = await webGetInfo(path);
      if (!info.exists) return { exists: false };
      return { exists: true, isDirectory: info.isDirectory, size: info.isDirectory ? undefined : info.size };
    }
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return { exists: false };
    }
    return {
      exists: true,
      isDirectory: info.isDirectory,
      size: info.isDirectory ? undefined : info.size,
    };
  }

  public async makeDirectory(path: string): Promise<void> {
    if (this.isWeb) return webMakeDirectory(path);
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }

  public async writeAsString(path: string, content: string): Promise<void> {
    if (this.isWeb) return webWrite(path, content);
    await FileSystem.writeAsStringAsync(path, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  public async readAsString(path: string): Promise<string> {
    if (this.isWeb) return webRead(path);
    return await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  public async readDirectory(path: string): Promise<string[]> {
    if (this.isWeb) return webReadDirectory(path);
    return await FileSystem.readDirectoryAsync(path);
  }

  public async move(from: string, to: string): Promise<void> {
    if (this.isWeb) return webMove(from, to);
    await FileSystem.moveAsync({ from, to });
  }

  public async copy(from: string, to: string): Promise<void> {
    if (this.isWeb) return webCopy(from, to);
    await FileSystem.copyAsync({ from, to });
  }

  public async deleteFile(path: string): Promise<void> {
    if (this.isWeb) return webDelete(path);
    await FileSystem.deleteAsync(path, { idempotent: true });
  }

  /**
   * Ensures a directory exists (creates it if missing) and returns its path.
   */
  public async ensureDirectory(path: string): Promise<string> {
    const info = await this.getInfo(path);
    if (!info.exists) {
      await this.makeDirectory(path);
    }
    return path;
  }
}

export const storageService = StorageService.getInstance();
