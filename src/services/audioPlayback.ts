import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Buffer } from 'buffer';

export interface PlaybackCallbacks {
  /** Fired when audio really starts coming out of the speaker — not when the
   *  request comes back. Lip-sync hangs off this so the mouth never moves
   *  before the voice is audible. */
  onStart?: () => void;
  /** Real playback clock when the platform exposes it. */
  onProgress?: (positionMs: number, durationMs?: number) => void;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

let webAudio: HTMLAudioElement | null = null;
let currentPlayer: { remove(): void } | null = null;
/** Monotonic ownership token: a late HTTP/base64 conversion may never replace
 * audio requested more recently. */
let playbackGeneration = 0;

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
  playbackGeneration += 1;
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
  // Claim the one global playback slot before doing any expensive conversion.
  // If a newer utterance arrives while this response is decoded, the token
  // check below prevents the stale clip from suddenly starting afterwards.
  await stopPlaybackAudio();
  const generation = playbackGeneration;
  try {
    if (Platform.OS === 'web') {
      const blob = await response.blob();
      if (generation !== playbackGeneration) return false;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      webAudio = audio;
      audio.onplaying = () => {
        if (generation === playbackGeneration) callbacks.onStart?.();
      };
      audio.ontimeupdate = () =>
        generation === playbackGeneration && callbacks.onProgress?.(
          Math.round(audio.currentTime * 1000),
          Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined
        );
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (webAudio === audio) webAudio = null;
        if (generation === playbackGeneration) callbacks.onDone?.();
      };
      audio.onerror = (event: unknown) => {
        URL.revokeObjectURL(url);
        if (webAudio === audio) webAudio = null;
        if (generation === playbackGeneration) callbacks.onError?.(event);
      };
      await audio.play();
      return true;
    }

    // On native, Response.blob() round-trips through React Native's blob store
    // and then through FileReader/base64. Besides the warning it emits, that
    // blocks the JS thread noticeably for speech clips. Convert the response
    // bytes directly instead.
    const bytes = await response.arrayBuffer();
    if (generation !== playbackGeneration) return false;
    const base64 = Buffer.from(bytes).toString('base64');

    const tempUri = `${FileSystem.cacheDirectory || ''}${filePrefix}_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(tempUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (generation !== playbackGeneration) {
      cleanupFile(tempUri);
      return false;
    }

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
      if (
        typeof status?.currentTime === 'number' &&
        Number.isFinite(status.currentTime)
      ) {
        callbacks.onProgress?.(
          Math.round(status.currentTime * 1000),
          typeof status.duration === 'number' && Number.isFinite(status.duration)
            ? Math.round(status.duration * 1000)
            : undefined
        );
      }
      if (generation !== playbackGeneration) return;
      if (!started && status?.playing) {
        started = true;
        callbacks.onStart?.();
      }
      if (!status?.didJustFinish) return;
      if (currentPlayer === player) currentPlayer = null;
      player.remove();
      cleanupFile(tempUri);
      callbacks.onDone?.();
    });
    player.play();
    return true;
  } catch (error) {
    if (generation === playbackGeneration) {
      currentPlayer = null;
      callbacks.onError?.(error);
    }
    return false;
  }
};
