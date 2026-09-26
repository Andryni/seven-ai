import { fetchWithTimeout } from './network';
import { playRemoteAudio, stopPlaybackAudio } from './audioPlayback';

export interface ElevenLabsVoiceOptions {
  text: string;
  apiKey: string;
  voiceId?: string;
  modelId?: string;
}

/**
 * Legacy neural TTS engine, kept for configs that still hold an ElevenLabs
 * key. Playback is delegated to the shared audio module, exactly like the Fish
 * Audio engine — one owner for how synthesized clips are played.
 */
class ElevenLabsService {
  async stopAudio(): Promise<void> {
    await stopPlaybackAudio();
  }

  /**
   * Synthesize and play. Resolves `true` when playback started, `false` when
   * it did not (the caller falls back to the system voice).
   */
  async speak(
    options: ElevenLabsVoiceOptions,
    callbacks?: {
      onStart?: () => void;
      onDone?: () => void;
      onError?: (error: unknown) => void;
    }
  ): Promise<boolean> {
    const {
      text,
      apiKey,
      voiceId = 'EXAVITQu4vr4xnSDxMaL', // Rachel — natural clear voice
      modelId = 'eleven_multilingual_v2', // French, English and 27 more languages
    } = options;

    if (!apiKey?.trim() || !text.trim()) {
      callbacks?.onError?.(new Error('ElevenLabs API key is missing.'));
      return false;
    }

    await this.stopAudio();

    try {
      const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey.trim(),
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 160)}`);
      }

      // Shared playback: Web Audio on web, expo-audio on native. `onStart` is
      // forwarded so it fires when playback begins, not when the HTTP call
      // returns — that is what keeps the lip-sync in step with the voice.
      return playRemoteAudio(response, 'elevenlabs', {
        onStart: callbacks?.onStart,
        onDone: callbacks?.onDone,
        onError: callbacks?.onError,
      });
    } catch (error) {
      console.warn('ElevenLabs TTS error:', error);
      callbacks?.onError?.(error);
      return false;
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
