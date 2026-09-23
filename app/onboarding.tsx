import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FONT } from '../src/theme/typography';
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Speech from 'expo-speech';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { OrbView } from '../src/components/OrbView';
import { haptics } from '../src/services/hapticsService';
import { useDraft } from '../src/hooks/useDraft';
import { verifyGeminiKey } from '../src/services/keyVerification';
import {
  JARVIS_VOICE_MODELS,
  fishAudioService,
  fishVoiceFor,
  verifyFishAudioKey,
} from '../src/services/fishAudioService';
import type { AssistantStatus } from '../src/types';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  CircleAlert,
  Cpu,
  ExternalLink,
  Key,
  Languages,
  LoaderCircle,
  Palette,
  Radio,
  Rocket,
  ShieldCheck,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react-native';

/**
 * First-run setup, as a wizard instead of one long form.
 *
 * Two things changed on purpose. Every step *verifies* what it asks for — the
 * old screen accepted any string and only revealed a typo later, as a model
 * that quietly fell back to offline synthesis. And the copy is bilingual here
 * rather than in `theme/i18n.ts`: this screen runs *before* a configuration
 * exists, and it has to re-render in the language you pick, live.
 */

const THEME_OPTIONS = [
  { id: 'seven', label: 'SEVEN', color: '#00E5FF' },
  { id: 'crimson', label: 'CRIMSON', color: '#FF3366' },
  { id: 'matrix', label: 'MATRIX', color: '#4ADE80' },
] as const;

const VOICE_LANGUAGE_OPTIONS = [
  { code: 'en-US', label: 'ENGLISH', flag: 'EN' },
  { code: 'fr-FR', label: 'FRANÇAIS', flag: 'FR' },
  { code: 'en-GB', label: 'ENGLISH UK', flag: 'UK' },
  { code: 'es-ES', label: 'ESPAÑOL', flag: 'ES' },
] as const;

const VOICE_SAMPLES: Record<string, string> = {
  'fr-FR': 'Bonjour, je suis Gideon. Tous les systèmes sont opérationnels.',
  'en-US': 'Good morning, I am Gideon. All systems operational.',
  'en-GB': 'Good morning, I am Gideon. All systems operational.',
  'es-ES': 'Buenos días, soy Gideon. Todos los sistemas están operativos.',
};

type StepId = 'identity' | 'brain' | 'voice' | 'aura';
const STEPS: StepId[] = ['identity', 'brain', 'voice', 'aura'];

interface CheckResult {
  phase: 'idle' | 'checking' | 'ok' | 'fail';
  message: string;
}

const IDLE: CheckResult = { phase: 'idle', message: '' };

const COPY = {
  en: {
    stepNames: ['IDENTITY', 'NEURAL CORE', 'VOICE', 'AURA'],
    stepTitles: ['Who am I speaking to?', 'Connect the brain', 'Give me a voice', 'Choose the light'],
    stepHints: [
      'Names are how we address each other. Both can be changed later in Settings.',
      'The Gemini key powers reasoning, research and code. Verification is free — it only lists the models your key can reach.',
      'Fish Audio renders the JARVIS voices. Pick the language you want to be spoken to in, and listen before you commit.',
      'The aura tints the whole interface and Gideon\u2019s hologram. Google is optional, only for real Gmail access.',
    ],
    assistantName: 'ASSISTANT NAME',
    userName: 'YOUR CALLSIGN',
    uiLanguage: 'INTERFACE LANGUAGE',
    geminiKey: 'GEMINI API KEY',
    geminiHelp:
      'No key? Skip it — I fall back to offline synthesis. Research and code generation need one.',
    fishKey: 'FISH AUDIO API KEY',
    fishHelp: 'Create a key at fish.audio → API keys. The JARVIS voices are preconfigured.',
    voiceLanguage: 'SPOKEN LANGUAGE',
    voiceModel: 'VOICE MODEL',
    customVoice: 'CUSTOM VOICE ID (OPTIONAL)',
    webBlocked:
      'Browsers block direct Fish Audio calls (CORS). The JARVIS voice plays in the Android / iOS build; in a browser you will hear the system voice.',
    googleClientId: 'GOOGLE OAUTH CLIENT ID (OPTIONAL)',
    theme: 'AURA THEME',
    verify: 'VERIFY',
    verified: 'VERIFIED',
    retry: 'RETRY',
    preview: 'PREVIEW VOICE',
    stop: 'STOP',
    getKey: 'GET KEY',
    skip: 'SKIP',
    back: 'BACK',
    next: 'CONTINUE',
    launch: 'LAUNCH GIDEON',
    launching: 'IGNITION SEQUENCE…',
    security: 'Keys are AES-256 encrypted in the hardware keystore and never leave your device unencrypted.',
    bootTitle: 'IGNITION SEQUENCE',
    bootLaunch: 'Launching Gideon core',
    bootHandshake: 'Handshaking with the neural core',
    bootVoice: 'Calibrating the JARVIS voice engine',
    bootVault: 'Sealing keys in the hardware vault',
    bootReady: 'Core online',
    warnings: {
      short: 'That key looks too short',
      offline: 'No network — verification skipped',
    },
  },
  fr: {
    stepNames: ['IDENTITÉ', 'CŒUR NEURAL', 'VOIX', 'AURA'],
    stepTitles: ['À qui est-ce que je parle ?', 'Connectez le cerveau', 'Donnez-moi une voix', 'Choisissez la lumière'],
    stepHints: [
      'Les noms servent à nous adresser l\u2019un à l\u2019autre. Modifiables plus tard dans les Réglages.',
      'La clé Gemini alimente le raisonnement, la recherche et le code. La vérification est gratuite : elle liste seulement les modèles accessibles.',
      'Fish Audio joue les voix JARVIS. Choisissez la langue dans laquelle je vous parle, et écoutez avant de valider.',
      'L\u2019aura teinte toute l\u2019interface et l\u2019hologramme de Gideon. Google est optionnel, uniquement pour le vrai Gmail.',
    ],
    assistantName: 'NOM DE L\u2019ASSISTANT',
    userName: 'VOTRE INDICATIF',
    uiLanguage: 'LANGUE DE L\u2019INTERFACE',
    geminiKey: 'CLÉ API GEMINI',
    geminiHelp:
      'Pas de clé ? Passez — je bascule sur la synthèse hors ligne. La recherche et le code en ont besoin.',
    fishKey: 'CLÉ API FISH AUDIO',
    fishHelp: 'Créez une clé sur fish.audio → API keys. Les voix JARVIS sont préconfigurées.',
    voiceLanguage: 'LANGUE PARLÉE',
    voiceModel: 'MODÈLE DE VOIX',
    customVoice: 'ID DE VOIX PERSONNALISÉ (OPTIONNEL)',
    webBlocked:
      'Les navigateurs bloquent les appels directs à Fish Audio (CORS). La voix JARVIS est jouée dans la build Android / iOS ; dans un navigateur vous entendrez la voix système.',
    googleClientId: 'CLIENT ID OAUTH GOOGLE (OPTIONNEL)',
    theme: 'THÈME D\u2019AURA',
    verify: 'VÉRIFIER',
    verified: 'VÉRIFIÉ',
    retry: 'RÉESSAYER',
    preview: 'ÉCOUTER LA VOIX',
    stop: 'ARRÊTER',
    getKey: 'OBTENIR UNE CLÉ',
    skip: 'PASSER',
    back: 'RETOUR',
    next: 'CONTINUER',
    launch: 'LANCER GIDEON',
    launching: 'SÉQUENCE D\u2019ALLUMAGE…',
    security:
      'Les clés sont chiffrées AES-256 dans le keystore matériel et ne quittent jamais l\u2019appareil en clair.',
    bootTitle: 'SÉQUENCE D\u2019ALLUMAGE',
    bootLaunch: 'Lancement du cœur Gideon',
    bootHandshake: 'Poignée de main avec le cœur neural',
    bootVoice: 'Calibrage du moteur vocal JARVIS',
    bootVault: 'Scellement des clés dans le coffre matériel',
    bootReady: 'Cœur en ligne',
    warnings: {
      short: 'Cette clé semble trop courte',
      offline: 'Pas de réseau — vérification ignorée',
    },
  },
};

type Copy = (typeof COPY)['en'];

/** A verification that never hangs the wizard: a timeout is a soft pass. */
const withTimeout = async <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timer!);
  return result;
};

const openLink = async (url: string) => {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    if (typeof window !== 'undefined') window.open(url, '_blank');
  }
};

// --------------------------------------------------------------------------- UI

/** Spinner that becomes a check or an alert — the "is it OK?" moment. */
const StatusBadge: React.FC<{ result: CheckResult; accent: string }> = ({ result, accent }) => {
  const spin = useMemo(() => new Animated.Value(0), []);
  const pop = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (result.phase !== 'checking') return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [result.phase, spin]);

  useEffect(() => {
    if (result.phase !== 'ok' && result.phase !== 'fail') return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: false }).start();
  }, [result.phase, pop]);

  if (result.phase === 'idle') return null;

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const tone = result.phase === 'ok' ? '#00FFA3' : result.phase === 'fail' ? '#FF6B8A' : accent;

  return (
    <Animated.View
      style={[
        styles.statusBadge,
        {
          borderColor: tone + '66',
          backgroundColor: tone + '14',
          opacity: result.phase === 'checking' ? 1 : pop,
          transform: [{ scale: result.phase === 'checking' ? 1 : pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        },
      ]}
    >
      {result.phase === 'checking' && (
        <Animated.View style={{ transform: [{ rotate }] }}>
          <LoaderCircle size={11} color={tone} />
        </Animated.View>
      )}
      {result.phase === 'ok' && <Check size={11} color={tone} />}
      {result.phase === 'fail' && <CircleAlert size={11} color={tone} />}
      <Text style={[styles.statusText, { color: tone }]} numberOfLines={3}>
        {result.phase === 'checking' ? '…' : result.message}
      </Text>
    </Animated.View>
  );
};

const Field: React.FC<{
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  helper?: string;
}> = ({ icon, label, right, children, helper }) => (
  <View style={styles.fieldGroup}>
    <View style={styles.fieldLabelRow}>
      {icon}
      <Text style={styles.fieldLabel}>{label}</Text>
      {right}
    </View>
    {children}
    {!!helper && <Text style={styles.helperText}>{helper}</Text>}
  </View>
);

// ---------------------------------------------------------------------- Screen

export default function OnboardingScreen() {
  const router = useRouter();
  const currentConfig = useSevenStore((s) => s.config);
  const setConfig = useSevenStore((s) => s.setConfig);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  // Identity. Drafts (not raw state) so reopening the wizard from Settings —
  // which is a real button — prefills what is actually saved instead of the
  // defaults captured before the config hydrated.
  const [assistantName, setAssistantName] = useDraft(currentConfig.assistantName || 'Gideon');
  const [userName, setUserName] = useDraft(currentConfig.userName || 'Commander');
  const [uiLanguage, setUiLanguage] = useDraft<'en' | 'fr'>(currentConfig.language ?? 'en');

  // Keys
  const [geminiApiKey, setGeminiApiKey] = useDraft(currentConfig.geminiApiKey || '');
  const [fishApiKey, setFishApiKey] = useDraft(currentConfig.fishAudioApiKey || '');
  const [googleClientId, setGoogleClientId] = useDraft(currentConfig.googleClientId || '');
  const [neural, setNeural] = useState<CheckResult>(IDLE);
  const [voiceCheck, setVoiceCheck] = useState<CheckResult>(IDLE);

  // Voice
  const [voiceLanguage, setVoiceLanguage] = useDraft(currentConfig.voiceLanguage || 'en-US');
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [testing, setTesting] = useState(false);

  // Aura
  const [themeId, setThemeId] = useDraft<'seven' | 'ultron' | 'crimson' | 'matrix'>(
    currentConfig.theme ?? 'seven'
  );

  // Launch
  const [launching, setLaunching] = useState(false);
  const [bootLine, setBootLine] = useState(0);
  const [bootDone, setBootDone] = useState(false);

  // The avatar mirrors what the wizard is doing: thinking while it verifies,
  // speaking while a voice sample plays. Derived, not stored — a second copy of
  // this in state could only ever disagree with the checks.
  const avatarStatus: AssistantStatus = testing
    ? 'speaking'
    : neural.phase === 'checking' || voiceCheck.phase === 'checking'
      ? 'thinking'
      : launching && !bootDone
        ? 'building'
        : 'idle';

  const c: Copy = COPY[uiLanguage];
  const selectedTheme = THEME_OPTIONS.find((o) => o.id === themeId) ?? THEME_OPTIONS[0];
  const accent = selectedTheme.color;

  // Step transition: each step slides in rather than swapping instantly.
  const slide = useMemo(() => new Animated.Value(1), []);
  useEffect(() => {
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [stepIndex, slide]);

  const bootFade = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (!launching) return;
    Animated.timing(bootFade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [launching, bootFade]);

  const voiceIdFor = useCallback(
    (code: string) =>
      customVoiceId.trim() || (code.startsWith('fr')
        ? currentConfig.fishVoiceIdFr || JARVIS_VOICE_MODELS.fr.id
        : currentConfig.fishVoiceIdEn || JARVIS_VOICE_MODELS.en.id),
    [customVoiceId, currentConfig.fishVoiceIdFr, currentConfig.fishVoiceIdEn]
  );

  // ---- verification --------------------------------------------------------

  const runNeuralCheck = useCallback(async (): Promise<CheckResult> => {
    const key = geminiApiKey.trim();
    if (!key) {
      const result: CheckResult = { phase: 'idle', message: '' };
      setNeural(result);
      return result;
    }
    setNeural({ phase: 'checking', message: '' });
    const check = await withTimeout(
      verifyGeminiKey(key),
      8000,
      { ok: false, message: c.warnings.offline }
    );
    const result: CheckResult = check.ok
      ? { phase: 'ok', message: check.message }
      : { phase: 'fail', message: check.message };
    setNeural(result);
    haptics[check.ok ? 'success' : 'error']();
    return result;
  }, [geminiApiKey, c.warnings.offline]);

  const runVoiceCheck = useCallback(async (): Promise<CheckResult> => {
    const key = fishApiKey.trim();
    if (!key) {
      const result: CheckResult = { phase: 'idle', message: '' };
      setVoiceCheck(result);
      return result;
    }
    if (key.length < 16) {
      const result: CheckResult = { phase: 'fail', message: c.warnings.short };
      setVoiceCheck(result);
      return result;
    }
    setVoiceCheck({ phase: 'checking', message: '' });
    const check = await withTimeout(verifyFishAudioKey(key), 10000, {
      ok: false,
      message: c.warnings.offline,
    });
    const result: CheckResult = check.ok
      ? { phase: 'ok', message: check.message }
      : { phase: 'fail', message: check.message };
    setVoiceCheck(result);
    haptics[check.ok ? 'success' : 'error']();
    return result;
  }, [fishApiKey, c.warnings.offline, c.warnings.short]);

  /** A verified key that is then edited is no longer verified — otherwise the
   *  green tick would be a lie the moment someone fixes a typo. */
  const editGeminiKey = (value: string) => {
    setGeminiApiKey(value);
    setNeural(IDLE);
  };

  const editFishKey = (value: string) => {
    setFishApiKey(value);
    setVoiceCheck(IDLE);
  };

  // ---- voice preview -------------------------------------------------------

  const previewVoice = useCallback(async () => {
    haptics.light();
    if (testing) {
      await fishAudioService.stopAudio();
      await Speech.stop();
      setTesting(false);
      return;
    }

    const sample = VOICE_SAMPLES[voiceLanguage] || VOICE_SAMPLES['en-US'];
    setTesting(true);
    const key = fishApiKey.trim();

    if (key) {
      await Speech.stop();
      const played = await fishAudioService.speak(
        {
          text: sample,
          apiKey: key,
          referenceId: voiceIdFor(voiceLanguage),
          language: voiceLanguage,
          rate: currentConfig.voiceRate || 1,
        },
        {
          onDone: () => setTesting(false),
          onError: () => setTesting(false),
        }
      );
      if (played) return;
    }

    // No key, or Fish refused: the system voice still lets you hear the accent.
    Speech.speak(sample, {
      language: voiceLanguage,
      pitch: currentConfig.voicePitch || 1,
      rate: currentConfig.voiceRate || 1,
      onDone: () => setTesting(false),
      onError: () => setTesting(false),
      onStopped: () => setTesting(false),
    });
  }, [testing, voiceLanguage, fishApiKey, voiceIdFor, currentConfig.voicePitch, currentConfig.voiceRate]);

  useEffect(
    () => () => {
      fishAudioService.stopAudio();
      Speech.stop();
    },
    []
  );

  // ---- navigation ----------------------------------------------------------

  const canContinue = step === 'identity' ? assistantName.trim().length > 0 : true;

  const goNext = () => {
    haptics.light();
    const isLast = stepIndex === STEPS.length - 1;
    if (isLast) {
      void handleLaunch();
      return;
    }
    // Moving on verifies whatever this step asked for, so a mistake surfaces
    // where it was made rather than three screens later.
    if (step === 'brain' && geminiApiKey.trim() && neural.phase !== 'ok') void runNeuralCheck();
    if (step === 'voice' && fishApiKey.trim() && voiceCheck.phase !== 'ok') void runVoiceCheck();
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  };

  const goBack = () => {
    haptics.light();
    setStepIndex((i) => Math.max(0, i - 1));
  };

  // ---- launch --------------------------------------------------------------

  const bootLines = useMemo(() => {
    const lines = [c.bootLaunch];
    if (geminiApiKey.trim()) lines.push(c.bootHandshake);
    if (fishApiKey.trim()) lines.push(c.bootVoice);
    lines.push(c.bootVault, c.bootReady);
    return lines;
  }, [c, geminiApiKey, fishApiKey]);

  const handleLaunch = async () => {
    if (launching) return;
    setLaunching(true);
    haptics.medium();

    // Re-verify both keys, then walk the ignition list in step with the checks
    // so the overlay reports real outcomes instead of a fake progress bar.
    const [neuralResult, voiceResult] = await Promise.all([
      geminiApiKey.trim() ? runNeuralCheck() : Promise.resolve(IDLE),
      fishApiKey.trim() ? runVoiceCheck() : Promise.resolve(IDLE),
    ]);

    setBootLine(1);
    for (let i = 1; i < bootLines.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 420));
      setBootLine(i + 1);
    }

    try {
      await setConfig({
        assistantName: assistantName.trim() || 'Gideon',
        userName: userName.trim() || 'Commander',
        language: uiLanguage,
        geminiApiKey: geminiApiKey.trim(),
        googleClientId: googleClientId.trim(),
        fishAudioApiKey: fishApiKey.trim(),
        // A key that verified (or at least was entered) unlocks the neural
        // voice; otherwise the wizard leaves the system voice selected.
        voiceEngine: fishApiKey.trim() ? 'fish' : 'system',
        voiceLanguage,
        fishVoiceIdEn: voiceSelectionFor('en-US'),
        fishVoiceIdFr: voiceSelectionFor('fr-FR'),
        theme: themeId,
        themeColor: selectedTheme.color,
        isConfigured: true,
      });

      addTerminalLog(
        neuralResult.phase === 'ok'
          ? 'NEURAL CORE ONLINE: Gemini key verified.'
          : 'NEURAL CORE: no key — offline synthesis active.',
        neuralResult.phase === 'ok' ? 'success' : 'warn'
      );
      addTerminalLog(
        voiceResult.phase === 'ok'
          ? 'VOICE ENGINE ONLINE: Fish Audio calibrated to the JARVIS voice.'
          : 'VOICE ENGINE: system synthesis (no Fish Audio key).',
        voiceResult.phase === 'ok' ? 'success' : 'warn'
      );
      addTerminalLog(`Assistant Matrix initialized as "${assistantName}". Welcome, ${userName}.`, 'info');

      setBootDone(true);
      await new Promise((resolve) => setTimeout(resolve, 520));
      haptics.success();
      router.replace('/');
    } catch (error) {
      setLaunching(false);
      setBootDone(false);
      console.warn('Onboarding save failed:', error);
      addTerminalLog('ONBOARDING ERROR: configuration could not be sealed.', 'error');
    }
  };

  /** Which JARVIS model the wizard should store for a given spoken language. */
  const voiceSelectionFor = (code: string) => {
    const custom = customVoiceId.trim();
    if (custom) return custom;
    return fishVoiceFor(code);
  };

  const stepStyle = {
    opacity: slide,
    transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
  };

  // ---- render --------------------------------------------------------------

  return (
    <ParticleBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <OrbView size={128} themeColor={accent} status={avatarStatus} />
          <Text style={[styles.brand, { color: accent }]}>GIDEON</Text>
          <Text style={styles.brandSub}>INITIALIZATION PROTOCOL</Text>
        </View>

        {/* Progress rail — dots + a fill that tracks the step. */}
        <View style={styles.rail}>
          {STEPS.map((id, index) => (
            <React.Fragment key={id}>
              <View
                style={[
                  styles.railDot,
                  {
                    borderColor: index <= stepIndex ? accent : 'rgba(255,255,255,0.2)',
                    backgroundColor: index < stepIndex ? accent : 'transparent',
                  },
                ]}
              >
                {index < stepIndex && <Check size={9} color="#050508" />}
              </View>
              {index < STEPS.length - 1 && (
                <View
                  style={[
                    styles.railBar,
                    { backgroundColor: index < stepIndex ? accent : 'rgba(255,255,255,0.14)' },
                  ]}
                />
              )}
            </React.Fragment>
          ))}
        </View>

        <Animated.View style={[styles.card, { borderColor: accent + '55' }, stepStyle]}>
          <Text style={[styles.stepIndex, { color: accent }]}>
            {String(stepIndex + 1).padStart(2, '0')} // {c.stepNames[stepIndex]}
          </Text>
          <Text style={styles.stepTitle}>{c.stepTitles[stepIndex]}</Text>
          <Text style={styles.stepHint}>{c.stepHints[stepIndex]}</Text>

          {step === 'identity' && (
            <>
              <Field icon={<Cpu size={14} color={accent} />} label={c.assistantName}>
                <TextInput
                  style={styles.input}
                  value={assistantName}
                  onChangeText={setAssistantName}
                  placeholder="Gideon, FRIDAY, JARVIS…"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  autoCapitalize="words"
                />
              </Field>
              <Field icon={<User size={14} color={accent} />} label={c.userName}>
                <TextInput
                  style={styles.input}
                  value={userName}
                  onChangeText={setUserName}
                  placeholder="Commander…"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                />
              </Field>
              <Field icon={<Languages size={14} color={accent} />} label={c.uiLanguage}>
                <View style={styles.chipRow}>
                  {(['en', 'fr'] as const).map((code) => (
                    <TouchableOpacity
                      key={code}
                      style={[styles.chip, uiLanguage === code && { borderColor: accent, backgroundColor: accent + '1F' }]}
                      accessibilityLabel={code === 'en' ? 'English' : 'Français'}
                      onPress={() => setUiLanguage(code)}
                    >
                      <Text style={[styles.chipText, uiLanguage === code && { color: accent }]}>
                        {code === 'en' ? 'ENGLISH' : 'FRANÇAIS'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
            </>
          )}

          {step === 'brain' && (
            <Field
              icon={<Key size={14} color="#00FFA3" />}
              label={c.geminiKey}
              helper={c.geminiHelp}
              right={
                <TouchableOpacity
                  style={styles.linkBtn}
                  accessibilityLabel={c.getKey}
                  onPress={() => openLink('https://aistudio.google.com/app/apikey')}
                >
                  <ExternalLink size={10} color="#050508" />
                  <Text style={styles.linkBtnText}>{c.getKey}</Text>
                </TouchableOpacity>
              }
            >
              <TextInput
                style={styles.input}
                value={geminiApiKey}
                onChangeText={editGeminiKey}
                placeholder="AIzaSy…"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.verifyRow}>
                <TouchableOpacity
                  style={[styles.verifyBtn, { borderColor: accent }]}
                  accessibilityLabel={c.verify}
                  onPress={runNeuralCheck}
                  disabled={neural.phase === 'checking'}
                >
                  {neural.phase === 'ok' ? <Check size={12} color={accent} /> : <Radio size={12} color={accent} />}
                  <Text style={[styles.verifyBtnText, { color: accent }]}>
                    {neural.phase === 'ok' ? c.verified : neural.phase === 'fail' ? c.retry : c.verify}
                  </Text>
                </TouchableOpacity>
                <StatusBadge result={neural} accent={accent} />
              </View>
            </Field>
          )}

          {step === 'voice' && (
            <>
              <Field
                icon={<Key size={14} color="#8CD6FF" />}
                label={c.fishKey}
                helper={c.fishHelp}
                right={
                  <TouchableOpacity
                    style={styles.linkBtn}
                    accessibilityLabel={c.getKey}
                    onPress={() => openLink('https://fish.audio/go-api/')}
                  >
                    <ExternalLink size={10} color="#050508" />
                    <Text style={styles.linkBtnText}>{c.getKey}</Text>
                  </TouchableOpacity>
                }
              >
                <TextInput
                  style={styles.input}
                  value={fishApiKey}
                  onChangeText={editFishKey}
                  placeholder="fish_…"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.verifyRow}>
                  <TouchableOpacity
                    style={[styles.verifyBtn, { borderColor: accent }]}
                    accessibilityLabel={c.verify}
                    onPress={runVoiceCheck}
                    disabled={voiceCheck.phase === 'checking'}
                  >
                    {voiceCheck.phase === 'ok' ? <Check size={12} color={accent} /> : <Radio size={12} color={accent} />}
                    <Text style={[styles.verifyBtnText, { color: accent }]}>
                      {voiceCheck.phase === 'ok' ? c.verified : voiceCheck.phase === 'fail' ? c.retry : c.verify}
                    </Text>
                  </TouchableOpacity>
                  <StatusBadge result={voiceCheck} accent={accent} />
                </View>
              </Field>

              <Field icon={<Languages size={14} color={accent} />} label={c.voiceLanguage}>
                <View style={styles.chipRow}>
                  {VOICE_LANGUAGE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.code}
                      style={[
                        styles.chip,
                        voiceLanguage === option.code && { borderColor: accent, backgroundColor: accent + '1F' },
                      ]}
                      accessibilityLabel={option.label}
                      onPress={() => {
                        haptics.light();
                        setVoiceLanguage(option.code);
                      }}
                    >
                      <Text style={[styles.chipFlag, voiceLanguage === option.code && { color: accent }]}>
                        {option.flag}
                      </Text>
                      <Text style={[styles.chipText, voiceLanguage === option.code && { color: accent }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>

              <Field icon={<AudioLines size={14} color={accent} />} label={c.voiceModel}>
                <View style={styles.voiceCardRow}>
                  {(['en', 'fr'] as const).map((lang) => {
                    const model = JARVIS_VOICE_MODELS[lang];
                    const active = customVoiceId.trim() === '' && voiceIdFor(voiceLanguage) === model.id;
                    return (
                      <TouchableOpacity
                        key={lang}
                        style={[styles.voiceCard, active && { borderColor: accent, backgroundColor: accent + '14' }]}
                        accessibilityLabel={model.label}
                        onPress={() => {
                          haptics.light();
                          setCustomVoiceId('');
                          setVoiceLanguage(lang === 'fr' ? 'fr-FR' : 'en-US');
                        }}
                      >
                        <Sparkles size={13} color={active ? accent : 'rgba(255,255,255,0.4)'} />
                        <Text style={[styles.voiceCardTitle, active && { color: accent }]}>{model.label}</Text>
                        <Text style={styles.voiceCardDetail}>{model.detail}</Text>
                        {active && <Text style={[styles.voiceCardTag, { color: accent }]}>SELECTED</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.input, styles.inputTight]}
                  value={customVoiceId}
                  onChangeText={setCustomVoiceId}
                  placeholder={c.customVoice}
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.previewBtn, { borderColor: accent + '88' }]}
                  accessibilityLabel={testing ? c.stop : c.preview}
                  onPress={previewVoice}
                >
                  {testing ? <Volume2 size={14} color={accent} /> : <AudioLines size={14} color={accent} />}
                  <Text style={[styles.previewBtnText, { color: accent }]}>
                    {testing ? c.stop : c.preview}
                  </Text>
                </TouchableOpacity>
                {/* Said where it matters: a browser cannot reach Fish Audio at
                    all, so the preview here is the system voice. */}
                {Platform.OS === 'web' && <Text style={styles.helperText}>{c.webBlocked}</Text>}
              </Field>
            </>
          )}

          {step === 'aura' && (
            <>
              <Field icon={<Palette size={14} color={accent} />} label={c.theme}>
                <View style={styles.chipRow}>
                  {THEME_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.themeCard,
                        themeId === option.id && { borderColor: option.color, backgroundColor: option.color + '14' },
                      ]}
                      accessibilityLabel={option.label}
                      onPress={() => {
                        haptics.light();
                        setThemeId(option.id);
                      }}
                    >
                      <View style={[styles.themeDot, { backgroundColor: option.color }]} />
                      <Text style={[styles.themeLabel, themeId === option.id && { color: option.color }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
              <Field icon={<Key size={14} color="#FFA500" />} label={c.googleClientId}>
                <TextInput
                  style={styles.input}
                  value={googleClientId}
                  onChangeText={setGoogleClientId}
                  placeholder="xxxxx.apps.googleusercontent.com"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
            </>
          )}

          <View style={styles.securityRow}>
            <ShieldCheck size={13} color="#00FFA3" />
            <Text style={styles.securityText}>{c.security}</Text>
          </View>
        </Animated.View>

        {/* Controls */}
        <View style={styles.controls}>
          {stepIndex > 0 && (
            <TouchableOpacity
              style={styles.ghostBtn}
              accessibilityLabel={c.back}
              onPress={goBack}
              disabled={launching}
            >
              <ArrowLeft size={14} color="rgba(255,255,255,0.75)" />
              <Text style={styles.ghostBtnText}>{c.back}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: accent, opacity: canContinue && !launching ? 1 : 0.5 },
            ]}
            accessibilityLabel={
              stepIndex === STEPS.length - 1 ? (launching ? c.launching : c.launch) : c.next
            }
            onPress={goNext}
            disabled={!canContinue || launching}
          >
            {stepIndex === STEPS.length - 1 ? (
              <Rocket size={16} color="#050508" />
            ) : (
              <ArrowRight size={16} color="#050508" />
            )}
            <Text style={styles.primaryBtnText}>
              {stepIndex === STEPS.length - 1 ? (launching ? c.launching : c.launch) : c.next}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Ignition overlay: the checklist reports what actually happened. */}
      {launching && (
        <Animated.View style={[styles.bootOverlay, { opacity: bootFade }]}>
          <Text style={[styles.bootTitle, { color: accent }]}>{c.bootTitle}</Text>
          {bootLines.map((line, index) => {
            const reached = index < bootLine;
            const failed =
              (line === c.bootHandshake && neural.phase === 'fail') ||
              (line === c.bootVoice && voiceCheck.phase === 'fail');
            return (
              <View key={line} style={styles.bootRow}>
                {reached ? (
                  failed ? (
                    <CircleAlert size={12} color="#FF6B8A" />
                  ) : (
                    <Check size={12} color="#00FFA3" />
                  )
                ) : (
                  <LoaderCircle size={12} color="rgba(255,255,255,0.3)" />
                )}
                <Text
                  style={[
                    styles.bootText,
                    { color: reached ? (failed ? '#FF6B8A' : 'rgba(255,255,255,0.92)') : 'rgba(255,255,255,0.4)' },
                  ]}
                >
                  {line}
                </Text>
              </View>
            );
          })}
          {bootDone && <Text style={[styles.bootReady, { color: accent }]}>✓</Text>}
        </Animated.View>
      )}
    </ParticleBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 28, paddingBottom: 44 },
  header: { alignItems: 'center', marginBottom: 14 },
  brand: {
    fontFamily: FONT.display,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 8,
    marginTop: 6,
  },
  brandSub: {
    fontFamily: FONT.uiMedium,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9.5,
    fontWeight: '500',
    letterSpacing: 3,
    marginTop: 4,
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  railDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBar: { height: 2, width: 34, borderRadius: 1 },
  card: {
    backgroundColor: 'rgba(8,12,18,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
  },
  stepIndex: {
    fontFamily: FONT.mono,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '800',
  },
  stepTitle: {
    fontFamily: FONT.display,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 8,
  },
  stepHint: {
    // Explanations are prose: the readable face, at a size meant to be read.
    fontFamily: FONT.ui,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 16,
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  fieldLabel: {
    fontFamily: FONT.mono,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
    fontFamily: FONT.ui,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  inputTight: { marginTop: 8, paddingVertical: 8, fontSize: 11 },
  helperText: {
    fontFamily: FONT.ui,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10.5,
    marginTop: 6,
    lineHeight: 14,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  linkBtnText: { fontFamily: FONT.mono, color: '#050508', fontSize: 8.5, fontWeight: '800' },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verifyBtnText: {
    fontFamily: FONT.uiMedium,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexShrink: 1,
  },
  statusText: { fontFamily: FONT.mono, fontSize: 9, flexShrink: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipFlag: { fontFamily: FONT.mono, fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.5)' },
  chipText: {
    fontFamily: FONT.uiMedium,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.8)',
  },
  voiceCardRow: { flexDirection: 'row', gap: 10 },
  voiceCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  voiceCardTitle: { fontFamily: FONT.mono, color: '#FFF', fontSize: 11, fontWeight: '800' },
  voiceCardDetail: { fontFamily: FONT.mono, color: 'rgba(255,255,255,0.45)', fontSize: 8.5 },
  voiceCardTag: { fontFamily: FONT.mono, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    marginTop: 10,
  },
  previewBtnText: { fontFamily: FONT.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  themeCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingVertical: 12,
  },
  themeDot: { width: 18, height: 18, borderRadius: 9 },
  themeLabel: {
    fontFamily: FONT.mono,
    fontSize: 8.5,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  securityText: {
    fontFamily: FONT.ui,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    flex: 1,
    lineHeight: 14,
  },
  controls: { flexDirection: 'row', gap: 10, marginTop: 16 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  ghostBtnText: { fontFamily: FONT.mono, color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 6,
    paddingVertical: 14,
  },
  primaryBtnText: {
    fontFamily: FONT.uiMedium,
    color: '#050508',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  bootOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3,6,10,0.94)',
    justifyContent: 'center',
    paddingHorizontal: 34,
    gap: 12,
  },
  bootTitle: {
    fontFamily: FONT.mono,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 10,
  },
  bootRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bootText: { fontFamily: FONT.mono, fontSize: 10.5, flex: 1 },
  bootReady: { fontFamily: FONT.mono, fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: 18 },
});
