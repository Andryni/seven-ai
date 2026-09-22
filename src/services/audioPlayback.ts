import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

export interface PlaybackCallbacks {
  /** Fired when audio really starts coming out of the speaker — not when the
   *  request comes back. Lip-sync hangs off this so the mouth never moves
   *  before the voice is audible. */
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

let webAudio: HTMLAudioElement | null = null;
let currentPlayer: { remove(): void } | null = null;

/**
 * Fire the callbacks of the current owner on a sequence boundary and mark the
 * slot free. Used by the sentence-queue playback: when a queued clip finishes,
 * the *queue* owns the callbacks of that clip, so stopping must resolve them
 * (minus onDone) or the queue would wait for a status event that never comes.
 */
export const stopPlaybackAudioWith = async (
  onStopped?: () => void
): Promise<void> => {
  const hadPlayer = currentPlayer !== null || webAudio !== null;
  await stopPlaybackAudio();
  if (hadPlayer) onStopped?.();
};

const stopWebAudio = (): void => {
  if (!webAudio) return;
  try {
    webAudio.pause();
    webAudio.src = '';
  } catch {
    // Already torn down.
  }
  webAudio = null;
};

/**
 * Stop whatever this module is currently playing. Safe to call at any time —
 * the player or file may already be gone.
 */
export const stopPlaybackAudio = async (): Promise<void> => {
  stopWebAudio();
  if (currentPlayer) {
    const player = currentPlayer;
    currentPlayer = null;
    try {
      player.remove();
    } catch {
      // Already released.
    }
  }
};

const cleanupFile = (uri: string): void => {
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
};

/**
 * Download a synthesized clip (the response body is the audio), cache it and
 * play it. One owner for native playback so Fish Audio and ElevenLabs behave
 * identically — and so there is exactly one place that knows about audio
 * modules. Resolves `true` when playback started; `false` after calling
 * `onError`, so the caller can fall back to the system voice.
 */
export const playRemoteAudio = async (
  response: Response,
  filePrefix: string,
  callbacks: PlaybackCallbacks
): Promise<boolean> => {
  try {
    const blob = await response.blob();

    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      webAudio = audio;
      audio.onplaying = () => callbacks.onStart?.();
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (webAudio === audio) webAudio = null;
        callbacks.onDone?.();
      };
      audio.onerror = (event: unknown) => {
        URL.revokeObjectURL(url);
        if (webAudio === audio) webAudio = null;
        callbacks.onError?.(event);
      };
      await audio.play();
      return true;
    }

    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const tempUri = `${FileSystem.cacheDirectory || ''}${filePrefix}_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(tempUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // `duckOthers` pauses music apps instead of talking over them; safe on both
    // platforms, and `playsInSilentMode` keeps iOS from muting the butler.
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    }).catch(() => {});

    const player = createAudioPlayer({ uri: tempUri });
    currentPlayer = player;
    let started = false;
    player.addListener('playbackStatusUpdate', (status) => {
      if (!started && status?.playing) {
        started = true;
        callbacks.onStart?.();
      }
      if (!status?.didJustFinish) return;
      currentPlayer = null;
      player.remove();
      cleanupFile(tempUri);
      callbacks.onDone?.();
    });
    player.play();
    return true;
  } catch (error) {
    currentPlayer = null;
    callbacks.onError?.(error);
    return false;
  }
};
