/**
 * Jest setup: platform stubs + in-memory expo-file-system mock.
 * The mock is registered as an inline factory because jest-expo's
 * moduleNameMapper would otherwise bypass a root __mocks__ folder.
 *
 * Registered under BOTH specifiers: SDK 57 moved the classic API to the
 * 'expo-file-system/legacy' subpath (what the app imports), while tests
 * keep importing the package root for the shared mock helpers.
 */

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Platform = {
    OS: 'android',
    select: (options) => options.android ?? options.default,
  };
  return RN;
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const buildMockFileSystem = () => {
  const files = new Map(); // path -> string content
  const dirs = new Set();

  // Normalize: strip scheme and trailing slashes so '.../Images/' and
  // '.../Images' refer to the same entry (matches real filesystem behavior).
  const pathOf = (p) => String(p).replace('file://', '').replace(/\/+$/, '');

  // Deterministic failure injection for tests (shared by all importers).
  const failState = { failNextMove: false };

  const getInfoAsync = async (path) => {
    const key = pathOf(path);
    if (dirs.has(key)) {
      return { exists: true, isDirectory: true, size: 0, uri: path };
    }
    if (files.has(key)) {
      return { exists: true, isDirectory: false, size: files.get(key).length, uri: path };
    }
    return { exists: false, isDirectory: false, size: 0, uri: path };
  };

  const makeDirectoryAsync = async (path) => {
    dirs.add(pathOf(path));
  };

  const writeAsStringAsync = async (path, contents) => {
    files.set(pathOf(path), String(contents));
  };

  const readAsStringAsync = async (path) => {
    const key = pathOf(path);
    if (!files.has(key)) {
      throw new Error(`File not found: ${key}`);
    }
    return files.get(key);
  };

  const readDirectoryAsync = async (path) => {
    const key = pathOf(path);
    const prefix = key.endsWith('/') ? key : `${key}/`;
    const names = new Set();
    for (const full of files.keys()) {
      if (full.startsWith(prefix)) {
        const rest = full.slice(prefix.length);
        if (rest) names.add(rest.split('/')[0]);
      }
    }
    for (const dir of dirs.keys()) {
      if (dir.startsWith(prefix) && dir !== key) {
        const rest = dir.slice(prefix.length);
        if (rest) names.add(rest.split('/')[0]);
      }
    }
    return Array.from(names);
  };

  const moveAsync = async ({ from, to }) => {
    if (failState.failNextMove) {
      failState.failNextMove = false;
      throw new Error('boom');
    }
    const f = pathOf(from);
    const t = pathOf(to);
    if (files.has(f)) {
      files.set(t, files.get(f));
      files.delete(f);
    } else if (dirs.has(f)) {
      dirs.delete(f);
      dirs.add(t);
    } else {
      throw new Error(`moveAsync: source not found: ${f}`);
    }
  };

  const copyAsync = async ({ from, to }) => {
    const f = pathOf(from);
    const t = pathOf(to);
    if (!files.has(f)) {
      throw new Error(`copyAsync: source not found: ${f}`);
    }
    files.set(t, files.get(f));
  };

  const deleteAsync = async (path) => {
    files.delete(pathOf(path));
    dirs.delete(pathOf(path));
  };

  return {
    documentDirectory: 'file:///mock/documents/',
    cacheDirectory: 'file:///mock/cache/',
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    getInfoAsync,
    makeDirectoryAsync,
    writeAsStringAsync,
    readAsStringAsync,
    readDirectoryAsync,
    moveAsync,
    copyAsync,
    deleteAsync,
    __resetMockFS: () => {
      files.clear();
      dirs.clear();
      failState.failNextMove = false;
    },
    __failNextMove: () => {
      failState.failNextMove = true;
    },
  };
};

jest.mock('expo-file-system/legacy', () => buildMockFileSystem());

// expo-audio: native module — mocked so services importing it load in Jest.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn(() => ({ metering: -20 })),
  })),
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: 'granted', canAskAgain: true })),
}));
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  ...buildMockFileSystem(),
}));
