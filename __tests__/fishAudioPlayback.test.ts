const mockFetchWithTimeout = jest.fn();
const mockPlayRemoteAudio = jest.fn();
const mockStopPlaybackAudio = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/services/network', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

jest.mock('../src/services/audioPlayback', () => ({
  playRemoteAudio: (...args: unknown[]) => mockPlayRemoteAudio(...args),
  stopPlaybackAudio: (...args: unknown[]) => mockStopPlaybackAudio(...args),
}));

// Mocks must be registered before this singleton module is evaluated.
// eslint-disable-next-line import/first
import { fishAudioService } from '../src/services/fishAudioService';

const response = () => ({ ok: true }) as Response;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const longText = [
  'This is the first sufficiently long sentence for sequential playback.',
  'This is the second sufficiently long sentence for sequential playback.',
  'This is the third sufficiently long sentence for sequential playback.',
].join(' ');

describe('Fish Audio streamed playback ownership', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockStopPlaybackAudio.mockResolvedValue(undefined);
    mockFetchWithTimeout.mockResolvedValue(response());
    mockPlayRemoteAudio.mockResolvedValue(true);
    await fishAudioService.stopAudio();
    jest.clearAllMocks();
  });

  it('waits for a sentence to finish before starting the next one', async () => {
    const done = jest.fn();
    const speaking = fishAudioService.speakStreamed(
      { text: longText, apiKey: 'key' },
      { onDone: done }
    );

    await tick();
    expect(mockPlayRemoteAudio).toHaveBeenCalledTimes(1);

    mockPlayRemoteAudio.mock.calls[0][2].onStart();
    mockPlayRemoteAudio.mock.calls[0][2].onDone();
    await tick();
    expect(mockPlayRemoteAudio).toHaveBeenCalledTimes(2);

    mockPlayRemoteAudio.mock.calls[1][2].onDone();
    await tick();
    expect(mockPlayRemoteAudio).toHaveBeenCalledTimes(3);

    mockPlayRemoteAudio.mock.calls[2][2].onDone();
    await expect(speaking).resolves.toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('uses exactly one remainder fallback after a mid-stream failure', async () => {
    const fallback = jest.fn();
    const onError = jest.fn();
    const speaking = fishAudioService.speakStreamed(
      { text: longText, apiKey: 'key', onSystemFallback: fallback },
      { onError }
    );

    await tick();
    mockPlayRemoteAudio.mock.calls[0][2].onStart();
    mockPlayRemoteAudio.mock.calls[0][2].onDone();
    await tick();
    mockPlayRemoteAudio.mock.calls[1][2].onError(new Error('decoder failed'));

    await expect(speaking).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback.mock.calls[0][0]).toContain('third sufficiently long sentence');
    expect(onError).not.toHaveBeenCalled();
  });
});
