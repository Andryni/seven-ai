/**
 * The microphone's delivery path, tested against what the device really does.
 *
 * Measured on the handset: the recogniser streams partial results while you
 * speak, then ends the session with "empty final recognition results" and
 * `no-speech` — it frequently never emits a final. Building the command from
 * finals alone showed the words on screen and then threw them away, which is
 * exactly the reported "I speak and nothing happens".
 */
import { renderHook, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useVoice, isMicrophoneBusy } from '../src/hooks/useVoice';

// The Android endpointer options only exist on Android, and this suite exists to
// pin them down.
Platform.OS = 'android';

type Handler = (payload: unknown) => void;

const mockHandlers = new Map<string, Handler[]>();
const mockStart = jest.fn();
const mockAbort = jest.fn();

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    start: (options: unknown) => mockStart(options),
    stop: jest.fn(),
    abort: () => mockAbort(),
    requestPermissionsAsync: async () => ({ granted: true }),
    isRecognitionAvailable: () => true,
    addListener: (event: string, handler: Handler) => {
      const list = mockHandlers.get(event) ?? [];
      list.push(handler);
      mockHandlers.set(event, list);
      return {
        remove: () => {
          mockHandlers.set(
            event,
            (mockHandlers.get(event) ?? []).filter((h) => h !== handler)
          );
        },
      };
    },
  },
}));

/** Replays events exactly as ExpoSpeechService logs them on the phone. */
const emit = (event: string, payload?: unknown) => {
  act(() => {
    (mockHandlers.get(event) ?? []).forEach((handler) => handler(payload));
  });
};

const partial = (transcript: string) =>
  emit('result', { isFinal: false, results: [{ transcript, confidence: 0 }] });

describe('voice capture', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHandlers.clear();
    mockStart.mockClear();
    mockAbort.mockClear();
  });

  afterEach(() => {
    // Testing Library unmounts the rendered hooks here, which is also what
    // releases the module-level microphone ownership between tests.
    jest.useRealTimers();
  });

  it('delivers the interim transcript even when no final is ever emitted', async () => {
    const onRecognized = jest.fn();
    const { result } = renderHook(() => useVoice());

    await act(async () => {
      result.current.startListening(onRecognized, { priority: 'foreground' });
    });

    partial('allume');
    partial('allume la lumière du salon');

    // The recogniser gave up with empty final results, as it does on device.
    emit('end');
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onRecognized).toHaveBeenCalledTimes(1);
    expect(onRecognized.mock.calls[0][0]).toBe('allume la lumière du salon');
  });

  it('stitches a final onto the interim words instead of losing them', async () => {
    const onRecognized = jest.fn();
    const { result } = renderHook(() => useVoice());

    await act(async () => {
      result.current.startListening(onRecognized, { priority: 'foreground' });
    });

    partial('ouvre le');
    emit('result', { isFinal: true, results: [{ transcript: 'dossier clients' }] });
    emit('speechend');
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onRecognized.mock.calls[0][0]).toBe('ouvre le dossier clients');
  });

  it('asks Android for a patient endpointer instead of the default', async () => {
    const { result } = renderHook(() => useVoice());

    await act(async () => {
      result.current.startListening(jest.fn(), { priority: 'foreground' });
    });

    const options = mockStart.mock.calls[0][0] as {
      interimResults: boolean;
      androidIntentOptions: Record<string, number>;
    };
    // Live words on screen depend on interim results…
    expect(options.interimResults).toBe(true);
    // …and "it cuts the microphone off after two words" is the endpointer.
    expect(options.androidIntentOptions.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS).toBeGreaterThan(
      2000
    );
    expect(options.androidIntentOptions.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS).toBeGreaterThan(
      1000
    );
  });

  it('never lets two captures own the microphone at once', async () => {
    // Two screens, as in the app: the dashboard stays mounted under the chat.
    const chat = renderHook(() => useVoice());
    const dashboard = renderHook(() => useVoice());

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = chat.result.current.startListening(jest.fn(), { priority: 'foreground' });
    });
    expect(accepted).toBe(true);
    expect(isMicrophoneBusy()).toBe(true);

    // The wake word asks politely while a command owns the microphone.
    await act(async () => {
      accepted = dashboard.result.current.startListening(jest.fn(), { priority: 'background' });
    });
    expect(accepted).toBe(false);
    expect(mockAbort).not.toHaveBeenCalled();
  });

  it('releases the microphone when a screen unmounts mid-capture', async () => {
    const chat = renderHook(() => useVoice());

    await act(async () => {
      chat.result.current.startListening(jest.fn(), { priority: 'foreground' });
    });
    expect(isMicrophoneBusy()).toBe(true);

    // Navigating away used to leave the session owned by a dead hook, so every
    // later request was declined and the microphone never worked again.
    chat.unmount();
    expect(isMicrophoneBusy()).toBe(false);
  });
});
