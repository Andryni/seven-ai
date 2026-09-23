import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FONT } from '../src/theme/typography';
import { View, Text, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useQuickActionCallback } from 'expo-quick-actions/hooks';
import { useShareIntentContext } from 'expo-share-intent';
import { useSevenStore } from '../src/store/useSevenStore';
import { quickActionsService, QUICK_ACTION_IDS } from '../src/services/quickActionsService';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { OrbView } from '../src/components/OrbView';
import { TerminalLog } from '../src/components/TerminalLog';
import {
  WidgetCanvas,
  defaultWidgetLayout,
  type WidgetSpec,
  type WidgetSize,
} from '../src/components/WidgetCanvas';
import { SelfHealingModal } from '../src/components/SelfHealingModal';
import { MorningBriefingModal } from '../src/components/MorningBriefingModal';
import { GideonGreeting } from '../src/components/GideonGreeting';
import { BottomNav } from '../src/components/BottomNav';
import { TapScale } from '../src/components/TapScale';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { AudioVisualizer } from '../src/components/AudioVisualizer';
import { useVoice, isMicrophoneBusy } from '../src/hooks/useVoice';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import { haptics } from '../src/services/hapticsService';
import { sevenAgent } from '../src/core/sevenAgent';
import { selfHealing } from '../src/core/selfHealing';
import { soundFx } from '../src/services/soundFxService';
import { fetchLiveBriefing } from '../src/services/liveInfoService';
import {
  Code2,
  FolderSync,
  FileText,
  ShieldCheck,
  Sparkles,
  Zap,
  Sun,
  Mail,
  WifiOff,
  Radio,
  Monitor,
  Waves,
  Move,
  RotateCcw,
  EyeOff,
  Clock,
} from 'lucide-react-native';

/**
 * The introduction is a one-shot per launch: a module-level flag survives the
 * navigation between screens but not a reload, which is exactly the lifetime we
 * want. Storing it in the config would make it a permanent "seen" flag the user
 * could never see again after reinstalling a backup of their settings.
 */
let greetedThisLaunch = false;

/** Module ids, in deck order. The persisted layout is keyed by these. */
const DECK_IDS = ['briefing', 'dave', 'organizer', 'research', 'routines', 'selfheal', 'dock'];

/**
 * What Gideon says when the app opens.
 *
 * He used to read out a six-row list of capabilities on every launch, which is
 * both repetitive and the least human possible opening — a spec sheet. This is
 * a pool of short, conversational openers that ask how the other person is,
 * picked at random once per launch (see GideonGreeting), followed by one short
 * line so he still says something *useful* rather than nothing at all.
 */
interface GreetingPool {
  lines: string[];
  hint: string;
  tapToDismiss: string;
}

/**
 * Everything the wake-word loop reads, so the loop can be armed on
 * `wakeWordActive` alone. As effect dependencies these values were recreated by
 * every render, and each re-run tore the loop down *mid-capture*: the abandoned
 * capture kept the microphone while the fresh loop politely waited for it, so
 * the radar looked dead for a second every time a line was logged.
 */
type WakeLoopDeps = {
  isAudible: boolean;
  isProcessing: boolean;
  startListening: ReturnType<typeof useVoice>['startListening'];
  handleSend: (command: string) => void;
  speak: ReturnType<typeof useVoice>['speak'];
  addTerminalLog: ReturnType<typeof useSevenStore.getState>['addTerminalLog'];
  language: 'fr' | 'en';
  userName: string;
};

const GREETING_COPY: Record<'fr' | 'en', GreetingPool> = {
  fr: {
    lines: [
      'Bonjour {name}. Comment se passe votre journée ?',
      'Ravi de vous revoir, {name}. Vous tenez le coup ?',
      'Me revoilà, {name}. Quoi de neuf de votre côté ?',
      'Bonjour {name}. J’espère que tout va bien — comment vous sentez-vous ?',
      'Salut {name}. Prêt quand vous l’êtes, mais d’abord : comment ça va ?',
      'Content de vous entendre, {name}. Comment allez-vous aujourd’hui ?',
      'Bonjour {name}. Nouvelle journée, nouvelle page. On commence par quoi ?',
      'Me voilà, {name}. Vous avez bien dormi ?',
    ],
    hint: 'Je vous écoute.',
    tapToDismiss: 'TOUCHEZ POUR FERMER',
  },
  en: {
    lines: [
      'Good day, {name}. How is your day going?',
      'Good to see you again, {name}. Holding up well?',
      'I am back, {name}. What is new on your side?',
      'Hello {name}. I hope all is well — how are you feeling?',
      'Hi {name}. Ready when you are, but first: how are you?',
      'Good to hear you, {name}. How are you doing today?',
      'Good morning, {name}. New day, new page. Where do we start?',
      'Here I am, {name}. Did you sleep well?',
    ],
    hint: 'I am listening.',
    tapToDismiss: 'TAP TO DISMISS',
  },
};

export default function DashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ briefing?: string }>();
  const config = useSevenStore((s) => s.config);
  const setConfig = useSevenStore((s) => s.setConfig);
  const status = useSevenStore((s) => s.status);
  const audioAmplitude = useSevenStore((s) => s.audioAmplitude);
  const addChatMessage = useSevenStore((s) => s.addChatMessage);
  const updateChatMessage = useSevenStore((s) => s.updateChatMessage);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const palette = useTheme();
  const styles = useThemeStyles(dashboardStyles);
  const language = config.language ?? 'en';

  const [showSelfHealingModal, setShowSelfHealingModal] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedCommand, setQueuedCommand] = useState<string | null>(null);
  // ARRANGE mode: the module deck stops navigating and starts moving.
  const [arranging, setArranging] = useState(false);
  /** '' until the launch greeting has been picked. */
  const [greetingLine, setGreetingLine] = useState('');

  const queuedRef = useRef<string | null>(null);

  const { isRecording, isAudible, spokenText, speak, startListening, stopListening, voiceMode } =
    useVoice();

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = textToSend;
      if (!query?.trim() || isProcessing) return;

      // Offline: queue the command instead of failing silently.
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        queuedRef.current = query;
        setQueuedCommand(query);
        addTerminalLog(`OFFLINE: "${query.slice(0, 40)}" queued until reconnect.`, 'warn');
        haptics.warning();
        return;
      }

      haptics.light();
      soundFx.playTelemetryPing();
      setIsProcessing(true);

      addChatMessage({ sender: 'user', text: query });

      // Progressive display: create the assistant placeholder immediately so the
      // catch block can fill it on failure (no ghost "PROCESSING…" bubble).
      const reply = addChatMessage({ sender: 'seven', text: '' });

      try {
        let acc = '';

        const result = await sevenAgent.chatStream(query, (token) => {
          if (token) {
            acc += token;
            updateChatMessage(reply.id, { text: acc });
          }
        });

        updateChatMessage(reply.id, {
          text: result.text,
          toolCall: result.toolCall,
          terminalLogs: result.terminalLogs,
        });

        if (config.voiceEnabled) speak(result.text);
      } catch (e: any) {
        haptics.error();
        addTerminalLog(`EXECUTION ERROR: ${e?.message || e}`, 'error');
        // Fill the pending placeholder bubble instead of appending a new one,
        // otherwise the "PROCESSING DIRECTIVE…" ghost stays forever.
        updateChatMessage(reply.id, {
          text:
            language === 'fr'
              ? 'Une exception est survenue pendant le traitement de votre directive. Le moteur d’auto-réparation a été mobilisé.'
              : 'Encountered an exception while processing your directive. Auto-healing matrix has been dispatched.',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [
      isProcessing,
      addChatMessage,
      addTerminalLog,
      updateChatMessage,
      config.voiceEnabled,
      speak,
      language,
    ]
  );

  // Offline detection + automatic flush of the queued command on reconnect.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      setIsOffline(!online);
      if (online && queuedRef.current) {
        const cmd = queuedRef.current;
        queuedRef.current = null;
        setQueuedCommand(null);
        addTerminalLog('Back online — flushing queued command.', 'info');
        handleSend(cmd);
      }
    });
    return () => unsubscribe();
  }, [handleSend, addTerminalLog]);

  // Long-press-the-app-icon shortcuts: JARVIS reachable without opening the
  // app first. Re-registered whenever the UI language changes so the labels
  // stay localized.
  useEffect(() => {
    quickActionsService.registerDefaultActions(language);
  }, [language]);

  // "Morning briefing" from the home-screen widget arrives as a deep link
  // (seven://?briefing=1) since OPEN_URI cannot target a screen without a
  // route of its own — organizer/research/dave already have one. Adjusted
  // during render (React's documented pattern for deriving state from a
  // changing prop) rather than in an effect, so opening the modal cannot
  // trigger a cascading extra render.
  const [handledBriefingParam, setHandledBriefingParam] = useState<string | undefined>(undefined);
  if (params.briefing === '1' && handledBriefingParam !== params.briefing) {
    setHandledBriefingParam(params.briefing);
    setShowBriefingModal(true);
  }
  useEffect(() => {
    if (params.briefing === '1') {
      router.setParams({ briefing: undefined });
    }
  }, [params.briefing, router]);

  // Shared content ("Share ->" from another app) always lands here first —
  // the OS opens the app at its root route regardless of what screen was
  // last shown. Only the chat screen knows how to consume a share intent
  // (it owns the vision/document pipeline), so hop over there immediately;
  // chat.tsx reads the same context and resets it once handled.
  const { hasShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (hasShareIntent) {
      router.push('/chat');
    }
  }, [hasShareIntent, router]);

  useQuickActionCallback(
    useCallback(
      (action) => {
        switch (action.id) {
          case QUICK_ACTION_IDS.organize:
            router.push('/organizer');
            break;
          case QUICK_ACTION_IDS.briefing:
            setShowBriefingModal(true);
            break;
          case QUICK_ACTION_IDS.research:
            router.push('/research');
            break;
          case QUICK_ACTION_IDS.build:
            router.push('/dave');
            break;
          default:
            break;
        }
      },
      [router]
    )
  );

  const [wakeWordActive, setWakeWordActive] = useState(false);
  const wakeWordRef = useRef(false);
  const wakeLoopRef = useRef<WakeLoopDeps>({
    isAudible: false,
    isProcessing: false,
    startListening: () => false,
    handleSend: () => {},
    speak: () => Promise.resolve(),
    addTerminalLog: () => {},
    language: 'fr',
    userName: '',
  });

  // Declared before the loop: effects run in order, so the loop always reads
  // values from the same render it was armed in.
  useEffect(() => {
    wakeLoopRef.current = {
      isAudible,
      isProcessing,
      startListening,
      handleSend,
      speak,
      addTerminalLog,
      language,
      userName: config.userName ?? '',
    };
  });

  useEffect(() => {
    wakeWordRef.current = wakeWordActive;
  }, [wakeWordActive]);

  // Wake word background detector loop
  useEffect(() => {
    if (!wakeWordActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Every path through the loop re-arms it through this helper, so a thrown
    // error can never leave the radar silently dead (which is what happened
    // when startListening threw: the loop simply stopped).
    const schedule = (ms: number) => {
      if (cancelled || !wakeWordRef.current) return;
      // Replace any pending tick instead of stacking a second one: the loop is
      // re-armed from several places (result, closure, decline) and must stay a
      // single self-rescheduling chain.
      if (timer) clearTimeout(timer);
      timer = setTimeout(runWakeLoop, ms);
    };

    /** Read fresh each tick: the ref is replaced on every render. */
    const deps = () => wakeLoopRef.current;

    const runWakeLoop = () => {
      if (cancelled || !wakeWordRef.current) return;
      // Yield on the *global* microphone state, not this screen's local one:
      // the dashboard stays mounted underneath the chat, so its own isRecording
      // says nothing about whether another screen is listening right now.
      if (deps().isAudible || isMicrophoneBusy() || deps().isProcessing) {
        schedule(1000);
        return;
      }

      try {
        // Background priority: the radar asks politely and steps aside if the
        // user is driving the microphone from the chat or voice mode.
        const accepted = deps().startListening((transcript) => {
          if (cancelled || !wakeWordRef.current) return;
          if (transcript) {
            // Strict wake phrase: the utterance must START with an optional
            // attention word followed by "seven" as a standalone word. Prevents
            // false triggers on any sentence merely containing "seven".
            const wakeMatch = transcript
              .toLowerCase()
              .match(/^(?:hey|hi|ok|okay|salut|dis|dis moi|écoute)?[\s,]*seven\b[\s,:!?.]*(.*)$/);
            if (wakeMatch) {
              const { handleSend: send, speak: say, addTerminalLog: log, language: lang, userName } =
                deps();
              haptics.success();
              soundFx.playActivationChime();
              log('WAKE WORD DETECTED: [HEY SEVEN] // Receptive matrix active', 'success');
              const cleanCommand = (wakeMatch[1] || '').trim();
              if (cleanCommand) {
                send(cleanCommand);
              } else {
                say(
                  lang === 'fr'
                    ? 'À votre écoute, Commandant.'
                    : `Standing by${userName ? `, ${userName}` : ''}.`
                );
              }
            }
          }
          schedule(800);
        }, { priority: 'background', onClosed: () => schedule(1200) });

        if (!accepted) {
          // Someone else owns the microphone — come back later instead of
          // fighting for it.
          schedule(1200);
        }
      } catch (e) {
        console.warn('Wake word loop could not start capture:', e);
        schedule(1500);
      }
    };

    runWakeLoop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Armed on the toggle alone — see `WakeLoopDeps`.
  }, [wakeWordActive]);

  // ---------------------------------------------------------------- Deck
  // The module deck is a free canvas: tiles are placed from persisted
  // fractions, so an arrangement the user made survives a reload and a resize.
  const deckLayout = useMemo(
    () => ({
      ...defaultWidgetLayout(DECK_IDS),
      ...(config.widgetLayout ?? {}),
    }),
    [config.widgetLayout]
  );

  const hiddenWidgets = useMemo(() => config.widgetHidden ?? [], [config.widgetHidden]);

  const moveWidget = useCallback(
    (id: string, position: { x: number; y: number }) => {
      const existing = config.widgetLayout?.[id];
      setConfig({
        widgetLayout: { ...(config.widgetLayout ?? {}), [id]: { ...position, size: existing?.size } },
      });
    },
    [config.widgetLayout, setConfig]
  );

  const resizeWidget = useCallback(
    (id: string, size: WidgetSize) => {
      const current = deckLayout[id] ?? { x: 0, y: 0 };
      setConfig({ widgetLayout: { ...(config.widgetLayout ?? {}), [id]: { ...current, size } } });
    },
    [config.widgetLayout, deckLayout, setConfig]
  );

  const toggleWidgetHidden = useCallback(
    (id: string) => {
      const next = hiddenWidgets.includes(id)
        ? hiddenWidgets.filter((value) => value !== id)
        : [...hiddenWidgets, id];
      setConfig({ widgetHidden: next });
    },
    [hiddenWidgets, setConfig]
  );

  const resetDeck = useCallback(() => {
    haptics.medium();
    setConfig({ widgetLayout: defaultWidgetLayout(DECK_IDS), widgetHidden: [] });
  }, [setConfig]);

  // ------------------------------------------------------------------ Widgets
  const widgets = useMemo<WidgetSpec[]>(() => {
    const specs: WidgetSpec[] = [
      {
        id: 'briefing',
        title: t('mod.briefing.title', language),
        desc: t('mod.briefing.desc', language),
        icon: <Sun size={15} color={palette.warning} />,
        borderColor: palette.warning,
        onPress: () => {
          haptics.light();
          setShowBriefingModal(true);
        },
      },
      {
        id: 'dave',
        title: t('mod.dave.title', language),
        desc: t('mod.dave.desc', language),
        icon: <Code2 size={15} color={palette.info} />,
        borderColor: palette.info,
        onPress: () => {
          haptics.light();
          router.push('/dave');
        },
      },
      {
        id: 'organizer',
        title: t('mod.organizer.title', language),
        desc: t('mod.organizer.desc', language),
        icon: <FolderSync size={15} color={palette.success} />,
        borderColor: palette.success,
        onPress: () => {
          haptics.light();
          router.push('/organizer');
        },
      },
      {
        id: 'research',
        title: t('mod.research.title', language),
        desc: t('mod.research.desc', language),
        icon: <FileText size={15} color={palette.accent} />,
        borderColor: palette.accent,
        onPress: () => {
          haptics.light();
          router.push('/research');
        },
      },
      {
        id: 'routines',
        title: t('mod.routines.title', language),
        desc: t('mod.routines.desc', language),
        icon: <Clock size={15} color={palette.warning} />,
        borderColor: palette.warning,
        onPress: () => {
          haptics.light();
          router.push('/routines');
        },
      },
      {
        id: 'selfheal',
        title: t('mod.selfheal.title', language),
        desc: t('mod.selfheal.desc', language),
        icon: <ShieldCheck size={15} color={palette.error} />,
        borderColor: palette.error,
        onPress: () => {
          haptics.light();
          setShowSelfHealingModal(true);
        },
      },
      {
        id: 'dock',
        title: t('mod.dock.title', language),
        desc: t('mod.dock.desc', language),
        icon: <Monitor size={15} color={palette.accent} />,
        borderColor: palette.accent,
        onPress: () => {
          haptics.medium();
          router.push('/standby');
        },
      },
    ];
    return specs.filter((spec) => !hiddenWidgets.includes(spec.id));
  }, [hiddenWidgets, language, palette, router]);

  // Gideon greets the user once per launch, a beat after the boot animation so
  // the two do not talk over each other. Waiting for `isConfigured` matters:
  // the saved config arrives asynchronously, and on a cold start the first
  // render still sees the defaults — which would greet the wrong callsign.
  //
  // The line is drawn here, inside the timer callback, rather than during
  // render: the pick is random, and render must stay pure.
  //
  // Real facts are folded into the greeting when they arrive in time: weather
  // and the top headline come from keyless public services (Open-Meteo, RSS),
  // so this costs no Gemini quota. If they are slow, the greeting simply goes
  // out without them — never later than the timeout.
  useEffect(() => {
    if (greetedThisLaunch || !config.isConfigured) return;
    greetedThisLaunch = true;
    const pool = GREETING_COPY[config.language ?? 'en'];
    const callsign = config.userName || (config.language === 'fr' ? 'Commandant' : 'Commander');
    const language: 'fr' | 'en' = config.language === 'fr' ? 'fr' : 'en';

    let cancelled = false;
    let said = false;
    const say = (facts: string) => {
      // Exactly one utterance per launch: the first of the facts arriving or
      // the timeout wins, and a slow fetch can never re-speak over it.
      if (cancelled || said) return;
      said = true;
      const line = pool.lines[Math.floor(Math.random() * pool.lines.length)].replace(
        '{name}',
        callsign
      );
      setGreetingLine(pool.hint ? `${line} ${pool.hint}${facts}` : `${line}${facts}`);
    };

    // Facts get ~4.5s; the boot animation covers most of it. After that the
    // greeting goes out without them rather than late.
    const timeout = setTimeout(() => say(''), 4500);
    fetchLiveBriefing(language)
      .then(({ weather, news }) => {
        clearTimeout(timeout);
        let facts = '';
        if (weather) {
          facts +=
            language === 'fr'
              ? ` Il fait ${weather.tempC}°C à ${weather.location}, ${weather.condition.toLowerCase()}.`
              : ` It is ${weather.tempC}°C in ${weather.location}, ${weather.condition.toLowerCase()}.`;
        }
        if (news.length) {
          facts +=
            language === 'fr'
              ? ` À la une : ${news[0].title}.`
              : ` Headlines: ${news[0].title}.`;
        }
        say(facts);
      })
      .catch(() => {
        clearTimeout(timeout);
        say('');
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [config.isConfigured, config.language, config.userName]);

  const openVoiceMode = () => {
    haptics.medium();
    soundFx.playActivationChime();
    router.push({ pathname: '/chat', params: { voice: '1' } });
  };

  const statusTone =
    status === 'healing'
      ? palette.error
      : status === 'building'
      ? palette.info
      : status === 'organizing'
      ? palette.success
      : status === 'speaking'
      ? palette.warning
      : palette.accent;

  return (
    <ParticleBackground>
      {/* Top HUD: brand line, telemetry, clock. */}
      <HudHeader onPressStatus={() => setShowSelfHealingModal(true)} />

      {/* Scrolling is disabled while arranging, otherwise the drag gestures
          would scroll the page instead of moving a tile. */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!arranging}
        showsVerticalScrollIndicator={false}
      >
        {/* Offline banner */}
        {(isOffline || queuedCommand) && (
          <View style={styles.offlineBanner}>
            <WifiOff size={11} color={palette.warning} />
            <Text style={styles.offlineText}>
              {queuedCommand
                ? `${t('dash.offlineQueued', language)}: "${queuedCommand.slice(0, 32)}"`
                : t('dash.offlineQueued', language)}
            </Text>
          </View>
        )}

        {/* Central holographic head */}
        <ScreenReveal index={0}>
          <View style={styles.orbSection}>
            <OrbView
              size={270}
              status={status}
              amplitude={audioAmplitude}
              themeColor={palette.accent}
              mode="gideon"
              gyroEnabled={config.gyroEnabled ?? true}
              speechText={spokenText}
              speechRate={config.voiceRate}
            />

            {/* Waveform: runs on real sound only, never during synthesis. */}
            <View style={styles.visualizerRow}>
              <AudioVisualizer
                isActive={
                  isAudible ||
                  isRecording ||
                  status === 'thinking' ||
                  status === 'building' ||
                  status === 'organizing'
                }
                barCount={22}
                color={palette.accent}
              />
            </View>

            <View style={styles.statusReadout}>
              <View style={[styles.statusLight, { backgroundColor: statusTone }]} />
              <Text style={styles.statusReadoutText}>
                {voiceMode === 'demo' && isRecording ? '[DEMO MIC] ' : ''}
                {t(`dash.status.${status}`, language)}
              </Text>
            </View>
          </View>
        </ScreenReveal>

        {/* Wake word radar + immersive voice mode */}
        <ScreenReveal index={1}>
          <View style={styles.voiceControls}>
            <TapScale
              scaleTo={0.94}
              accessibilityLabel={
                wakeWordActive ? t('dash.wakeArmed', language) : t('dash.wakeEnable', language)
              }
              style={[styles.wakeWordBadge, wakeWordActive && styles.wakeWordBadgeActive]}
              onPress={() => {
                haptics.medium();
                const next = !wakeWordActive;
                setWakeWordActive(next);
                if (next) {
                  soundFx.playTelemetryPing();
                  addTerminalLog(
                    'WAKE WORD RADAR: Listening for "Hey Seven" / "Dis Seven"...',
                    'info'
                  );
                } else {
                  stopListening();
                }
              }}
            >
              <Radio size={12} color={wakeWordActive ? palette.bgDeep : palette.accent} />
              <Text style={[styles.wakeWordText, wakeWordActive && styles.wakeWordTextActive]}>
                {wakeWordActive ? t('dash.wakeArmed', language) : t('dash.wakeEnable', language)}
              </Text>
            </TapScale>

            <TapScale
              grow
              scaleTo={0.94}
              accessibilityLabel={t('dash.voiceMode', language)}
              style={styles.voiceModeBadge}
              onPress={openVoiceMode}
            >
              <Waves size={12} color={palette.warning} />
              <Text style={styles.voiceModeText}>{t('dash.voiceMode', language)}</Text>
            </TapScale>
          </View>
        </ScreenReveal>

        {/* Once per launch: a short, different, conversational hello. */}
        {greetingLine !== '' && (
          <GideonGreeting
            sentence={greetingLine}
            palette={palette}
            tapToDismiss={GREETING_COPY[language].tapToDismiss}
            onSpeak={speak}
            onDismiss={() => setGreetingLine('')}
          />
        )}

        {/* Module deck: a free canvas. Tiles are draggable in ARRANGE mode, can
            be hidden by tapping them there, and the whole arrangement is the
            user's — positions and visibility both persist. */}
        <ScreenReveal index={2}>
          <View style={styles.deckHeader}>
            <Text style={styles.deckHeaderLabel}>{t('dash.modules', language)}</Text>
            <View style={styles.deckHeaderActions}>
              {hiddenWidgets.length > 0 && (
                <TapScale
                  scaleTo={0.92}
                  style={styles.smallBtn}
                  accessibilityLabel={t('dash.restoreHidden', language)}
                  onPress={() => {
                    haptics.medium();
                    setConfig({ widgetHidden: [] });
                  }}
                >
                  <RotateCcw size={10} color={palette.accent} />
                  <Text style={styles.smallBtnText}>{t('dash.restoreHidden', language)}</Text>
                </TapScale>
              )}
              <TapScale
                scaleTo={0.92}
                style={[styles.arrangeBtn, arranging && styles.arrangeBtnActive]}
                accessibilityLabel={
                  arranging ? t('dash.arrangeDone', language) : t('dash.arrange', language)
                }
                onPress={() => {
                  haptics.medium();
                  setArranging((value) => !value);
                }}
              >
                <Move size={11} color={arranging ? palette.bgDeep : palette.accent} />
                <Text style={[styles.arrangeBtnText, arranging && styles.arrangeBtnTextActive]}>
                  {arranging ? t('dash.arrangeDone', language) : t('dash.arrange', language)}
                </Text>
              </TapScale>
            </View>
          </View>

          {arranging && (
            <View style={styles.arrangeHint}>
              <EyeOff size={10} color={palette.textDim} />
              <Text style={styles.arrangeHintText}>{t('dash.arrangeHint', language)}</Text>
              <TapScale
                scaleTo={0.92}
                style={styles.resetBtn}
                accessibilityLabel={t('dash.reset', language)}
                onPress={resetDeck}
              >
                <Text style={styles.resetBtnText}>{t('dash.reset', language)}</Text>
              </TapScale>
            </View>
          )}

          <WidgetCanvas
            widgets={widgets}
            layout={deckLayout}
            onMove={moveWidget}
            onHide={toggleWidgetHidden}
            onResize={resizeWidget}
            editing={arranging}
            palette={palette}
          />
        </ScreenReveal>

        {/* Quick Commands (direct actions through the agent) */}
        <ScreenReveal index={3}>
          <View style={styles.commandsRow}>
            <TapScale
              scaleTo={0.95}
              style={styles.commandBtn}
              accessibilityLabel={t('dash.organize', language)}
              onPress={() => handleSend('organize downloads')}
            >
              <FolderSync size={12} color={palette.success} />
              <Text style={styles.commandBtnText}>{t('dash.organize', language)}</Text>
            </TapScale>
            <TapScale
              scaleTo={0.95}
              style={styles.commandBtn}
              accessibilityLabel={t('dash.emails', language)}
              onPress={() => handleSend('check unread emails')}
            >
              <Mail size={12} color={palette.info} />
              <Text style={styles.commandBtnText}>{t('dash.emails', language)}</Text>
            </TapScale>
            <TapScale
              scaleTo={0.95}
              style={styles.commandBtn}
              accessibilityLabel={t('dash.briefing', language)}
              onPress={() => {
                haptics.light();
                setShowBriefingModal(true);
              }}
            >
              <Zap size={12} color={palette.warning} />
              <Text style={styles.commandBtnText}>{t('dash.briefing', language)}</Text>
            </TapScale>
          </View>
        </ScreenReveal>

        {/* Live Terminal Log Component */}
        <ScreenReveal index={4}>
          <TerminalLog maxHeight={140} title="SEVEN_OS // TELEMETRY & KERNEL LOG" />
        </ScreenReveal>

        {/* Quick Prompt Chips — localized, so a French user gets French ideas. */}
        <ScreenReveal index={5}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickPromptsScroll}
            contentContainerStyle={styles.quickPromptsContainer}
          >
            {Array.from({ length: 9 }, (_, idx) => t(`dash.qp.${idx}`, language)).map((prompt) => (
              <TapScale
                key={prompt}
                scaleTo={0.94}
                style={styles.promptChip}
                accessibilityLabel={prompt}
                onPress={() => handleSend(prompt)}
              >
                <Sparkles size={10} color={palette.accent} />
                <Text style={styles.promptChipText}>{prompt}</Text>
              </TapScale>
            ))}
          </ScrollView>
        </ScreenReveal>
      </ScrollView>

      {/* Navigation. The command input that used to live here is gone: typing
          belongs to the chat screen, which owns the conversation, the image and
          document attachments and the transcript history. */}
      <BottomNav active="dashboard" />

      <MorningBriefingModal
        visible={showBriefingModal}
        onClose={() => setShowBriefingModal(false)}
      />

      <SelfHealingModal
        visible={showSelfHealingModal}
        onClose={() => setShowSelfHealingModal(false)}
        onSimulateBug={async () => {
          await selfHealing.simulateBugAndAutoFix();
        }}
      />
    </ParticleBackground>
  );
}

const dashboardStyles = (t: Palette) =>
  ({
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 20,
    },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.warning,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      marginTop: 4,
    },
    offlineText: {
      fontFamily: FONT.uiMedium,
      color: t.warning,
      fontSize: 10,
      fontWeight: '700',
      flex: 1,
    },
    orbSection: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    visualizerRow: {
      marginTop: 4,
      alignItems: 'center',
    },
    statusReadout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
    },
    statusLight: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusReadoutText: {
      fontFamily: FONT.uiMedium,
      color: t.text,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1.2,
    },
    voiceControls: {
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    },
    wakeWordBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 5,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.accent,
    },
    wakeWordBadgeActive: {
      backgroundColor: t.accent,
    },
    wakeWordText: {
      fontFamily: FONT.uiMedium,
      color: t.accent,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.9,
    },
    wakeWordTextActive: {
      color: t.bgDeep,
    },
    voiceModeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 5,
      backgroundColor: t.accentSoft,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.warning,
    },
    voiceModeText: {
      fontFamily: FONT.uiMedium,
      color: t.warning,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    deckHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      marginBottom: -4,
      paddingHorizontal: 2,
    },
    deckHeaderLabel: {
      fontFamily: FONT.uiMedium,
      color: t.textFaint,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 2.4,
      textTransform: 'uppercase',
    },
    deckHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    smallBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    smallBtnText: {
      fontFamily: FONT.uiMedium,
      color: t.accent,
      fontSize: 8,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    arrangeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: t.accent,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    arrangeBtnActive: {
      backgroundColor: t.accent,
    },
    arrangeBtnText: {
      fontFamily: FONT.uiMedium,
      color: t.accent,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    arrangeBtnTextActive: {
      color: t.bgDeep,
    },
    arrangeHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    arrangeHintText: {
      flex: 1,
      fontFamily: FONT.ui,
      color: t.textDim,
      fontSize: 9,
    },
    resetBtn: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 3,
      backgroundColor: t.accentSoft,
    },
    resetBtnText: {
      fontFamily: FONT.uiMedium,
      color: t.accent,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    commandsRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 6,
      marginBottom: 10,
    },
    commandBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.borderStrong,
      borderRadius: 5,
      paddingVertical: 8,
    },
    commandBtnText: {
      fontFamily: FONT.uiMedium,
      color: t.text,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    quickPromptsScroll: {
      marginTop: 8,
      marginBottom: 6,
    },
    quickPromptsContainer: {
      gap: 6,
      paddingHorizontal: 2,
    },
    promptChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      gap: 4,
    },
    promptChipText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 9.5,
    },
  } as const);
