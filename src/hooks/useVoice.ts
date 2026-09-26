import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { useSevenStore } from '../store/useSevenStore';
import { fishAudioService, fishVoiceFor } from '../services/fishAudioService';

/**
 * Native speech recognition is optional, and in expo-speech-recognition v57 its
 * surface is `start() / stop() / abort()` plus events — there is no
 * `startSpeechRecognitionAsync`. Calling that missing method threw an uncaught
 * TypeError straight out of the press handler, which is what killed the app the
 * moment the mic (or the wake word) was touched. So the shape is verified once,
 * here, and anything unexpected degrades to the clearly-labelled demo path
 * instead of throwing.
 */
interface SpeechModule {
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  requestPermissionsAsync?: () => Promise<{ granted: boolean }>;
  getPermissionsAsync?: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable?: () => boolean;
  addListener?: (event: string, listener: (payload: any) => void) => { remove: () => void };
}

const loadSpeechModule = (): SpeechModule | null => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    const candidate = mod?.ExpoSpeechRecognitionModule;
    if (candidate && typeof candidate.start === 'function') return candidate as SpeechModule;
  } catch {
    // Module absent from this build — the demo path below still speaks.
  }
  return null;
};

const SPEECH_MODULE = loadSpeechModule();

/**
 * Who wants the microphone, and how badly.
 *
 * `foreground` is a person pressing the mic (chat, voice mode). `background` is
 * the wake-word radar, which listens on its own. A background listener must
 * never take the device from a foreground one — that is what made the chat's
 * microphone die a second after opening when "Hey Seven" was armed: the
 * dashboard stays mounted underneath, its loop asked for the mic every 800 ms,
 * and every request tore down the session the user was actually using.
 */
export type CapturePriority = 'foreground' | 'background';

interface LiveSession {
  owner: symbol;
  priority: CapturePriority;
  stop: () => void;
}

/** One microphone session for the whole app, with a single named owner. */
let liveSession: LiveSession | null = null;

/** One speech turn for the whole app. Several screens can mount useVoice at
 * once; without global ownership each hook could start its own TTS engine. */
let activeSpeechTurn = 0;
let activeSpeechOwner: symbol | null = null;
let resetActiveSpeechUi: (() => void) | null = null;

/**
 * True while *any* screen holds the microphone.
 *
 * Exported so the wake-word loop can yield on the real, global state of the
 * device instead of its own local `isRecording` — the two differ as soon as
 * another screen is the one listening.
 */
export const isMicrophoneBusy = (): boolean => liveSession !== null;

/**
 * Android ends a recognition session on silence and reports it as an error
 * (`no-speech`, `speech-timeout`). Treating those as fatal is what closed the
 * microphone a moment after it opened, so while the user still wants to talk
 * they are treated as recoverable and the session is reopened.
 */
const RECOVERABLE_SPEECH_ERRORS = [
  'no-speech',
  'speech-timeout',
  'client',
  'busy',
  'network',
];

const hasFrench = (text: string): boolean =>
  /[éàèùâêîôûçëïüœæ]|(bonjour|salut|merci|d'accord|système|commande|dossier|fichier|recherche)/i.test(
    text
  );

/**
 * Which language to actually speak in. The configured voice language wins, but
 * a reply written in the other language is read with the matching accent — an
 * English voice reading French is the fastest way to sound broken.
 */
const resolveSpokenLanguage = (
  text: string,
  configured: string | undefined,
  uiLanguage: string | undefined
): string => {
  const isFrenchText = hasFrench(text);
  let target = configured || (uiLanguage === 'fr' ? 'fr-FR' : 'en-US');
  if (isFrenchText && !target.startsWith('fr')) target = 'fr-FR';
  else if (!isFrenchText && uiLanguage === 'en' && target.startsWith('fr')) target = 'en-US';
  return target;
};

/** Speech recognition must listen in the language the user actually speaks. */
const resolveRecognitionLanguage = (
  configured: string | undefined,
  uiLanguage: string | undefined
): string => {
  if (configured && configured.trim()) return configured.trim();
  return uiLanguage === 'fr' ? 'fr-FR' : 'en-US';
};

const DEMO_COMMANDS = [
  'make a good developer portfolio website',
  'organize downloads',
  'research on AI and create a PDF',
  'what was the last patch?',
  'check unread emails',
];

/** Recorder dB (-60..0) and recogniser volume (-2..10) both land in 0..1. */
const clamp01 = (value: number): number => Math.min(1, Math.max(0.05, value));

export const useVoice = () => {
  const [isRecording, setIsRecording] = useState(false);
  /**
   * Live transcription of what is being said right now.
   *
   * Populated from intermediate recognition results, so words appear on screen
   * as they are spoken instead of only after the utterance is finished.
   */
  const [partialTranscript, setPartialTranscript] = useState('');
  // `isSpeaking` spans the whole speaking turn (synthesis included);
  // `isAudible` is true only while sound is actually coming out. Everything
  // that moves with the voice — the lips, the waveform — keys off `isAudible`,
  // so Gideon no longer mouths a sentence during the seconds the neural voice
  // spends being synthesized. That was the "mouth moves before he answers" bug.
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudible, setIsAudible] = useState(false);
  // Text handed to TTS for the current utterance. The avatar lip-syncs on it
  // (see src/core/visemes.ts), so it is set when the voice becomes audible and
  // cleared the moment speech stops — never before, or the mouth moves in
  // silence while the voice is still being synthesized.
  const [spokenText, setSpokenText] = useState('');
  const [speechPositionMs, setSpeechPositionMs] = useState<number | undefined>();
  const [speechDurationMs, setSpeechDurationMs] = useState<number | undefined>();
  const [voiceMode, setVoiceMode] = useState<'real' | 'demo'>(
    SPEECH_MODULE ? 'real' : 'demo'
  );

  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<{ remove: () => void }[]>([]);
  const mountedRef = useRef(true);
  /** Stable identity for this hook instance, used as the microphone owner. */
  const ownerRef = useRef<symbol>(Symbol('voice'));
  /** Whether this instance still wants the microphone open. */
  const wantActiveRef = useRef(false);

  const setStatus = useSevenStore((s) => s.setStatus);
  const setAudioAmplitude = useSevenStore((s) => s.setAudioAmplitude);
  const config = useSevenStore((s) => s.config);

  // Only used when there is no native recogniser: the recorder is the single
  // mic user in that case, and it feeds a real waveform for the demo path.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef<typeof recorder | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    recorderRef.current = recorder;
    // Captured for the cleanup: this instance's identity never changes.
    const owner = ownerRef.current;
    return () => {
      mountedRef.current = false;
      /**
       * Hand the microphone back on unmount.
       *
       * A capture that outlives its screen left this module believing the
       * device was still busy — and since every later request is declined while
       * someone owns it, the chat's mic and the wake word went dead until the
       * app was restarted (navigate away mid-capture and the voice mode simply
       * stopped working).
       */
      if (liveSession?.owner === owner) {
        wantActiveRef.current = false;
        try {
          SPEECH_MODULE?.abort();
        } catch {}
        liveSession = null;
      }
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }
      if (demoTimeoutRef.current) {
        clearTimeout(demoTimeoutRef.current);
        demoTimeoutRef.current = null;
      }
      listenersRef.current.forEach((sub) => {
        try {
          sub.remove();
        } catch {}
      });
      listenersRef.current = [];
      const rec = recorderRef.current;
      recorderRef.current = null;
      if (rec) {
        try {
          void rec.stop();
        } catch {}
      }
      // A screen may disappear while its neural request is still in flight.
      // Invalidate it now so it cannot begin talking over the next screen.
      if (activeSpeechOwner === owner) {
        activeSpeechTurn += 1;
        activeSpeechOwner = null;
        resetActiveSpeechUi = null;
        void fishAudioService.stopAudio();
        void Speech.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Waveform -------------------------------------------------------------

  const stopAmplitudeAnimation = useCallback(() => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }
    setAudioAmplitude(0);
  }, [setAudioAmplitude]);

  /** Synthetic envelope: used while speaking, where there is no input to meter. */
  const startSyntheticAmplitude = useCallback(() => {
    if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    waveIntervalRef.current = setInterval(() => {
      setAudioAmplitude(Math.random() * 0.7 + 0.3);
    }, 120);
  }, [setAudioAmplitude]);

  /** Real metering from the recorder — demo path only (no recogniser running). */
  const startRecorderAmplitude = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return false;

      if (Platform.OS === 'ios') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
      }

      await recorder.prepareToRecordAsync();
      recorder.record();

      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = setInterval(() => {
        try {
          const status = recorder.getStatus();
          const metering = typeof status?.metering === 'number' ? status.metering : -60;
          setAudioAmplitude(clamp01((metering + 60) / 60));
        } catch {
          // Recorder released mid-poll.
        }
      }, 120);
      return true;
    } catch (e) {
      console.warn('Recorder metering unavailable:', e);
      return false;
    }
  }, [recorder, setAudioAmplitude]);

  const releaseRecorder = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      rec.stop().catch(() => {});
    } catch {
      // Not prepared / already stopped.
    }
  }, []);

  // --- TTS ------------------------------------------------------------------

  const speak = useCallback(
    async (text: string, onDone?: () => void) => {
      if (!config.voiceEnabled) {
        onDone?.();
        return;
      }

      // Reset the visual state owned by another mounted useVoice instance
      // (for example the dashboard underneath a briefing modal).
      resetActiveSpeechUi?.();
      const resetLocalUi = () => {
        if (!mountedRef.current) return;
        setIsSpeaking(false);
        setIsAudible(false);
        setSpokenText('');
        setSpeechPositionMs(undefined);
        setSpeechDurationMs(undefined);
        stopAmplitudeAnimation();
      };

      const turn = ++activeSpeechTurn;
      activeSpeechOwner = ownerRef.current;
      resetActiveSpeechUi = resetLocalUi;
      const isCurrentTurn = () =>
        turn === activeSpeechTurn && activeSpeechOwner === ownerRef.current;

      // Cancel every backend, not only the backend selected by this hook.
      // This matters when navigation leaves a Fish voice alive and the next
      // screen uses the system or ElevenLabs voice.
      await Promise.allSettled([fishAudioService.stopAudio(), Speech.stop()]);
      if (!isCurrentTurn()) return;

      // A transcription that cannot be recognized should never leave the mouth
      // open: anything below is either set on real playback start or cleared.
      /**
       * The single place that marks the voice as audible. Called from the
       * real "playback started" signal of each engine, never from the request
       * that merely *asks* for audio.
       */
      const beginAudible = (cleanText: string) => {
        if (!isCurrentTurn()) return;
        setSpeechPositionMs(0);
        setSpeechDurationMs(undefined);
        setIsAudible(true);
        setSpokenText(cleanText);
        startSyntheticAmplitude();
      };

      const finish = () => {
        if (!isCurrentTurn()) return;
        activeSpeechOwner = null;
        resetActiveSpeechUi = null;
        resetLocalUi();
        setStatus('idle');
      };

      const speakWithSystem = (cleanText: string, language: string, done?: () => void) => {
        if (!isCurrentTurn()) return;
        const completed = () => {
          if (!isCurrentTurn()) return;
          finish();
          done?.();
        };
        Speech.speak(cleanText, {
          pitch: config.voicePitch || 1.0,
          rate: config.voiceRate || 1.0,
          language,
          // Lip-sync starts here — the platform's own "audio began" signal.
          onStart: () => beginAudible(cleanText),
          onDone: completed,
          onError: completed,
          onStopped: completed,
        });
      };

      try {
        // The turn is open (so the HUD can say TRANSMITTING), but nothing
        // moves yet: no sound, no motion.
        setIsSpeaking(true);
        setStatus('speaking');

        const cleanText = text
          .replace(/[*_#`~]/g, '')
          .replace(/https?:\/\/\S+/g, 'link')
          // 600: long enough for a briefing (weather + three headlines) while
          // still bounded — a whole article read aloud would be minutes.
          .slice(0, 600);

        const targetLanguage = resolveSpokenLanguage(
          cleanText,
          config.voiceLanguage,
          config.language
        );
        const isFrench = targetLanguage.startsWith('fr');

        // Engine 1 — Fish Audio: the JARVIS voices, streamed sentence by
        // sentence. The first sentence starts speaking while the rest is still
        // being synthesized — that is the perceived-latency lever. A French
        // reply goes to the French model, an English one to the English model.
        if (config.voiceEngine === 'fish' && config.fishAudioApiKey?.trim()) {
          await Speech.stop();
          const played = await fishAudioService.speakStreamed(
            {
              text: cleanText,
              apiKey: config.fishAudioApiKey.trim(),
              referenceId:
                (isFrench ? config.fishVoiceIdFr : config.fishVoiceIdEn) ||
                fishVoiceFor(targetLanguage),
              language: targetLanguage,
              rate: config.voiceRate || 1,
              onSystemFallback: (rest) => {
                if (!isCurrentTurn()) return;
                // Fish died mid-turn: only the unspoken remainder changes
                // engine. The stream reports the turn as handled, preventing a
                // second full-text fallback from starting at the same time.
                console.warn('Fish Audio failed mid-turn, system voice takes over');
                speakWithSystem(rest, targetLanguage, onDone);
              },
            },
            {
              onStart: () => beginAudible(cleanText),
              onDone: () => {
                if (!isCurrentTurn()) return;
                finish();
                onDone?.();
              },
              onError: () => {
                // The single fallback below owns recovery. Starting it here as
                // well produced two concurrent system utterances.
                console.warn('Fish Audio failed, falling back to the system voice');
              },
            }
          );
          if (!isCurrentTurn()) return;
          if (played) return;
        }

        // Engine 2 — legacy ElevenLabs, for configs that still hold a key.
        if (config.voiceEngine === 'elevenlabs' && config.elevenLabsApiKey?.trim()) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { elevenLabsService } = require('../services/elevenLabsService');
          await Speech.stop();
          const played = await elevenLabsService.speak(
            {
              text: cleanText,
              apiKey: config.elevenLabsApiKey.trim(),
              voiceId: config.elevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL',
            },
            {
              onStart: () => beginAudible(cleanText),
              onProgress: (positionMs: number, durationMs?: number) => {
                if (!isCurrentTurn()) return;
                setSpeechPositionMs(positionMs);
                if (durationMs) setSpeechDurationMs(durationMs);
              },
              onDone: () => {
                if (!isCurrentTurn()) return;
                finish();
                onDone?.();
              },
              onError: () => {
                // Recovery is centralized after `speak` returns false.
                console.warn('ElevenLabs failed, falling back to the system voice');
              },
            }
          );
          if (!isCurrentTurn()) return;
          if (played) return;
        }

        // Engine 3 — the system voice, always available.
        await Speech.stop();
        if (isCurrentTurn()) speakWithSystem(cleanText, targetLanguage, onDone);
      } catch (e) {
        if (!isCurrentTurn()) return;
        console.warn('Speech error:', e);
        finish();
        onDone?.();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.voiceEnabled,
      config.voicePitch,
      config.voiceRate,
      config.voiceEngine,
      config.voiceLanguage,
      config.language,
      config.fishAudioApiKey,
      config.fishVoiceIdFr,
      config.fishVoiceIdEn,
      config.elevenLabsApiKey,
      config.elevenLabsVoiceId,
      setStatus,
      stopAmplitudeAnimation,
      startSyntheticAmplitude,
    ]
  );

  const stopSpeaking = useCallback(async () => {
    activeSpeechTurn += 1;
    activeSpeechOwner = null;
    resetActiveSpeechUi?.();
    resetActiveSpeechUi = null;
    try {
      try {
        await fishAudioService.stopAudio();
      } catch {}
      if (config.voiceEngine === 'elevenlabs') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { elevenLabsService } = require('../services/elevenLabsService');
          await elevenLabsService.stopAudio();
        } catch {}
      }
      await Speech.stop();
    } catch (e) {
      console.warn('Stop speech error:', e);
    }
    setIsSpeaking(false);
    setIsAudible(false);
    setSpokenText('');
    stopAmplitudeAnimation();
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.voiceEngine, setStatus, stopAmplitudeAnimation]);

  // --- STT ------------------------------------------------------------------

  /**
   * Tears down this instance's subscriptions and the amplitude animation. The
   * microphone itself is released by the session's own `stop`, so this stays a
   * pure subscription teardown and can never close someone else's capture.
   */
  const clearSession = useCallback(() => {
    listenersRef.current.forEach((sub) => {
      try {
        sub.remove();
      } catch {}
    });
    listenersRef.current = [];
    if (demoTimeoutRef.current) {
      clearTimeout(demoTimeoutRef.current);
      demoTimeoutRef.current = null;
    }
    stopAmplitudeAnimation();
  }, [stopAmplitudeAnimation]);

  /**
   * Native capture. Returns `true` when the recogniser accepted the request.
   *
   * There is deliberately no recorder alongside it: the waveform comes from the
   * recogniser's own volume events, because two audio clients on one microphone
   * is exactly what crashed the app on device.
   */
  const startNativeCapture = useCallback(
    (
      onRecognized: (transcript: string) => void,
      owner: symbol,
      priority: CapturePriority,
      /** Called when the capture closed with no transcript at all. */
      onClosed?: () => void,
      /** Live interim words, used by barge-in to cut playback immediately. */
      onPartial?: (transcript: string) => void,
      /** Reject recognizer results caused by the assistant's own speaker echo. */
      shouldIgnore?: (transcript: string) => boolean
    ): boolean => {
      const speech = SPEECH_MODULE;
      if (!speech) return false;

      let settled = false;
      /** Consecutive reopenings with no transcript — a guard, not a feature. */
      let restarts = 0;
      // A foreground command gets a long runway; the wake word is re-armed by
      // its own loop anyway, so it gives up sooner.
      const RESTART_LIMIT = priority === 'foreground' ? 20 : 8;
      /**
       * Timestamp of the last `start()`, and the single reopening that may be
       * pending. The platform (and this library's own "continuous" emulation on
       * older devices) also reopens sessions by itself, which produced three
       * `Start recognition.` calls inside 50 ms — and a recogniser started while
       * it is already starting answers `busy` and drops the audio. Continuity is
       * therefore owned here: one driver, one session, one pending reopening.
       */
      let lastStartAt = 0;
      let restartTimer: ReturnType<typeof setTimeout> | null = null;

      /**
       * Words gathered from the finals of the current utterance.
       *
       * Continuous recognition reports one final per phrase, so acting on the
       * first one would send "open the…" while the user is still saying "…maps".
       * Finals are therefore accumulated and only acted on once the speaker has
       * actually stopped for a beat.
       */
      let assembled = '';
      /**
       * The newest *partial* transcript.
       *
       * On device the recogniser streams partials while you speak but does not
       * always follow up with a final: the session ends on "empty final
       * recognition results". Relying on finals alone meant the words appeared
       * on screen and were then thrown away — nothing was ever sent. Whatever
       * was heard last is therefore kept as the utterance too.
       */
      let lastPartial = '';
      let finalizeTimer: ReturnType<typeof setTimeout> | null = null;

      /** Best known words for the current utterance. */
      const heard = () => (assembled || lastPartial).trim();
      // The wake word is a short phrase, so the radar does not wait long.
      const graceMs = priority === 'foreground' ? 900 : 350;

      const clearFinalizeTimer = () => {
        if (finalizeTimer) {
          clearTimeout(finalizeTimer);
          finalizeTimer = null;
        }
      };

      const releaseIfOwner = () => {
        if (liveSession?.owner === owner) liveSession = null;
      };

      const stopSession = () => {
        clearFinalizeTimer();
        if (restartTimer) {
          clearTimeout(restartTimer);
          restartTimer = null;
        }
        try {
          speech.abort();
        } catch {}
        clearSession();
        releaseIfOwner();
      };

      const closeDown = (finalTranscript: string | null) => {
        stopSession();
        stopAmplitudeAnimation();
        if (mountedRef.current) {
          setIsRecording(false);
          setPartialTranscript(finalTranscript ?? '');
          setStatus('idle');
        }
      };

      const deliver = (transcript: string) => {
        if (settled) return;
        settled = true;
        wantActiveRef.current = false;
        // Never print recognized speech: logcat may be collected in support
        // reports and voice transcripts can contain private information.
        // Keep the last recognized words on screen: they are what the user
        // just said, and clearing them here would blank the transcript the
        // moment it becomes useful.
        closeDown(transcript);
        onRecognized(transcript);
      };

      const settle = () => {
        if (settled) return;
        settled = true;
        wantActiveRef.current = false;
        closeDown(null);
        // A closed capture with no transcript must still hand control back, or
        // a background loop would stop retrying and the radar would go quiet.
        onClosed?.();
      };

      const attach = (event: string, handler: (payload: any) => void) => {
        try {
          const sub = speech.addListener?.(event, handler);
          if (sub) listenersRef.current.push(sub);
        } catch {
          // Older/absent event emitter — other events still cover the flow.
        }
      };

      /**
       * The recogniser's endpointer is aggressive by default: it closes the
       * session after a short pause, which reads as "the microphone stopped by
       * itself". These are the documented Android knobs for that endpointer.
       * Recognisers are free to ignore them, but the ones that honour them stop
       * cutting the user off after two words.
       */
      const buildOptions = () => ({
        lang: resolveRecognitionLanguage(config.voiceLanguage, config.language),
        // Without interim results the transcript stays empty until the
        // utterance is over — i.e. nothing shows up while you speak.
        interimResults: true,
        maxAlternatives: 1,
        // Continuity is owned here rather than by the platform: on this class
        // of device the library emulates it and restarts the recogniser itself,
        // which collides with our own reopening. One driver, one session.
        continuous: false,
        requiresOnDeviceRecognition: false,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
        ...(Platform.OS === 'android'
          ? {
              androidIntentOptions: {
                // Do not stop before this much audio has been captured.
                EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1200,
                // Do not treat a short mid-sentence pause as the end.
                EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1800,
                // Think time before the utterance is considered complete.
                EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
              },
            }
          : {}),
      });

      const startRecognition = (): boolean => {
        lastStartAt = Date.now();
        try {
          speech.start(buildOptions());
          return true;
        } catch (e) {
          console.warn('Speech recognition could not start:', e);
          lastStartAt = 0;
          return false;
        }
      };

      /**
       * Reopens the session while the microphone is still wanted.
       *
       * One retry is ever pending: `end`, `nomatch` and `error` all report the
       * same closed session, and reacting three times started three competing
       * recognisers. Bounded too, so a recogniser that fails instantly can never
       * become a hot loop.
       */
      const restart = () => {
        if (settled || !wantActiveRef.current || restartTimer) return;
        restarts += 1;
        if (restarts > RESTART_LIMIT) {
          console.warn('Speech recognition kept ending — closing it to avoid a hot loop.');
          settle();
          return;
        }
        // Never `start()` while the previous one is still settling: the
        // recogniser answers `busy` and that utterance's audio is lost.
        const wait = Math.max(260, 700 - (Date.now() - lastStartAt));
        restartTimer = setTimeout(() => {
          restartTimer = null;
          if (settled || !wantActiveRef.current) return;
          if (!startRecognition()) settle();
        }, wait);
      };

      /**
       * Acts on everything heard so far. Called after a beat of silence, or as
       * soon as the platform closes the session — whichever comes first, so a
       * recognised phrase is never dropped on the floor.
       */
      const finalize = () => {
        clearFinalizeTimer();
        const text = heard();
        if (text && shouldIgnore?.(text)) {
          // Playback leaked into the microphone. Forget only this recognizer
          // phrase and keep the barge-in radar open for the user's real voice.
          assembled = '';
          lastPartial = '';
          if (mountedRef.current) setPartialTranscript('');
          restart();
        } else if (text) deliver(text);
        else if (wantActiveRef.current) restart();
        else settle();
      };

      const scheduleFinalize = () => {
        clearFinalizeTimer();
        finalizeTimer = setTimeout(() => {
          finalizeTimer = null;
          if (!settled) finalize();
        }, graceMs);
      };

      attach('volumechange', (payload) => {
        const value = typeof payload?.value === 'number' ? payload.value : -2;
        setAudioAmplitude(clamp01((value + 2) / 12));
      });

      attach('result', (payload) => {
        const first = payload?.results?.[0];
        const transcript: string | undefined =
          first?.transcript ?? first?.[0]?.transcript ?? payload?.transcript;
        if (!transcript) return;

        if (payload?.isFinal === false) {
          // Live transcription: this is what makes the words appear on screen
          // while they are still being spoken.
          restarts = 0;
          lastPartial = assembled ? `${assembled} ${transcript}` : transcript;
          if (mountedRef.current) setPartialTranscript(lastPartial);
          if (!shouldIgnore?.(lastPartial)) onPartial?.(lastPartial);
          // A partial is progress, not a stopping point: re-arm the grace so a
          // run of partials ends the utterance even when no final ever comes.
          scheduleFinalize();
          return;
        }

        restarts = 0;
        // A final normally contains the whole utterance, so it supersedes the
        // partials — but when the recogniser reopened mid-sentence the final
        // only covers the tail, and the words heard before it must not vanish.
        if (assembled) {
          assembled = `${assembled} ${transcript}`.replace(/\s+/g, ' ');
        } else {
          const partial = lastPartial.trim();
          const lower = partial.toLowerCase();
          const covers = partial
            ? transcript.toLowerCase().startsWith(lower) || lower.includes(transcript.toLowerCase())
            : false;
          assembled = partial && !covers ? `${partial} ${transcript}`.replace(/\s+/g, ' ') : transcript;
        }
        lastPartial = assembled;
        if (mountedRef.current) setPartialTranscript(assembled);
        scheduleFinalize();
      });

      // The platform reports that the speaker stopped. That is the natural end
      // of an utterance, so give the words a short grace and act on them —
      // interim results are not always followed by a final.
      attach('speechend', () => {
        if (settled || !wantActiveRef.current) return;
        if (heard()) scheduleFinalize();
      });

      attach('error', (payload) => {
        const code = String(payload?.error ?? payload?.code ?? '');
        // Silence-based endings are recoverable while the user still wants to
        // talk; anything else (not-allowed, audio-capture, language-not-supported)
        // is a real failure and closes the microphone honestly.
        if (RECOVERABLE_SPEECH_ERRORS.includes(code) && wantActiveRef.current && !settled) {
          // Words were already heard: act on them instead of throwing them away.
          if (heard()) finalize();
          else restart();
          return;
        }
        console.warn('Speech recognition error:', code || payload?.message || payload);
        settle();
      });

      // Heard nothing: not a reason to close the microphone.
      attach('nomatch', () => {
        if (!wantActiveRef.current || settled) return;
        if (heard()) finalize();
        else restart();
      });

      // The service disconnected, or the platform ended the session. Reopen it
      // for as long as the user still wants to talk.
      attach('end', () => {
        if (settled) return;
        // The user pressed stop: cancel rather than send a half utterance.
        if (!wantActiveRef.current) {
          clearFinalizeTimer();
          settle();
          return;
        }
        if (heard()) {
          finalize();
          return;
        }
        restart();
      });

      const run = async () => {
        try {
          const permission = await (speech.requestPermissionsAsync?.() ??
            speech.getPermissionsAsync?.() ??
            Promise.resolve({ granted: true }));
          if (!permission?.granted) {
            console.warn('Microphone permission denied — the demo voice path is used');
            settle();
            return false;
          }
        } catch {
          // Permission API absent: start() will surface its own error event.
        }
        if (settled) return false;
        return startRecognition();
      };

      liveSession = { owner, priority, stop: stopSession };
      void run();
      return true;
    },
    [
      clearSession,
      config.language,
      config.voiceLanguage,
      setAudioAmplitude,
      setStatus,
      stopAmplitudeAnimation,
    ]
  );

  // Demo fallback (surfaced in the UI via voiceMode === 'demo'): a short capture
  // with a real waveform, then a sample command so the flow stays explorable.
  const runDemo = useCallback(
    (onRecognized?: (transcript: string) => void) => {
      if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
      demoTimeoutRef.current = setTimeout(() => {
        demoTimeoutRef.current = null;
        if (!mountedRef.current) return;
        setIsRecording(false);
        stopAmplitudeAnimation();
        setStatus('idle');
        onRecognized?.(DEMO_COMMANDS[Math.floor(Math.random() * DEMO_COMMANDS.length)]);
      }, 2500);
    },
    [setStatus, stopAmplitudeAnimation]
  );

  /**
   * Opens the microphone for this instance.
   *
   * Returns `false` when the request was declined because someone else already
   * owns the device — the caller is expected to back off, not to retry harder.
   */
  const startListening = useCallback(
    (
      onRecognized?: (transcript: string) => void,
      options?: {
        priority?: CapturePriority;
        onClosed?: () => void;
        onPartial?: (transcript: string) => void;
        shouldIgnore?: (transcript: string) => boolean;
      }
    ): boolean => {
      const priority: CapturePriority = options?.priority ?? 'foreground';
      const owner = ownerRef.current;
      const current = liveSession;

      if (current && current.owner !== owner) {
        // A background radar never takes the microphone from anyone, and two
        // foreground sessions must not coexist. Whichever request has no right
        // to the device declines instead of tearing the other one down.
        if (priority === 'background' || current.priority === 'foreground') return false;
        current.stop();
      }

      wantActiveRef.current = true;
      setIsRecording(true);
      setPartialTranscript('');
      setStatus('listening');

      if (SPEECH_MODULE) {
        setVoiceMode('real');
        const started = startNativeCapture(
          (transcript) => onRecognized?.(transcript),
          owner,
          priority,
          options?.onClosed,
          options?.onPartial,
          options?.shouldIgnore
        );
        if (!started) {
          setVoiceMode('demo');
          runDemo(onRecognized);
        }
        return true;
      }

      setVoiceMode('demo');
      liveSession = {
        owner,
        priority,
        stop: () => {
          releaseRecorder();
          if (liveSession?.owner === owner) liveSession = null;
        },
      };
      void startRecorderAmplitude().then((micOk) => {
        if (!micOk && mountedRef.current) startSyntheticAmplitude();
      });
      runDemo(onRecognized);
      return true;
    },
    [
      runDemo,
      startNativeCapture,
      startRecorderAmplitude,
      startSyntheticAmplitude,
      releaseRecorder,
      setStatus,
    ]
  );

  const stopListening = useCallback(() => {
    wantActiveRef.current = false;
    setIsRecording(false);
    setPartialTranscript('');
    if (demoTimeoutRef.current) {
      clearTimeout(demoTimeoutRef.current);
      demoTimeoutRef.current = null;
    }

    const ownerHold = liveSession?.owner === ownerRef.current;
    if (ownerHold) {
      try {
        SPEECH_MODULE?.abort();
      } catch {}
      releaseRecorder();
      liveSession = null;
    }
    clearSession();
    stopAmplitudeAnimation();
    setStatus('idle');
  }, [clearSession, releaseRecorder, setStatus, stopAmplitudeAnimation]);

  return {
    isRecording,
    /** Words recognized so far in the current utterance (live). */
    partialTranscript,
    /** A speaking turn is open (synthesis may still be in flight). */
    isSpeaking,
    /** Sound is coming out of the speaker right now. */
    isAudible,
    /** Text currently being spoken ('' when silent) — drives the visemes. */
    spokenText,
    /** Real neural-audio playback clock when exposed by the engine. */
    speechPositionMs,
    speechDurationMs,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    voiceMode, // 'real' | 'demo' — surface this in the UI to be honest about capabilities
  };
};
