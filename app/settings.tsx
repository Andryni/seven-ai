import React, { useEffect, useMemo, useState } from 'react';
import { FONT } from '../src/theme/typography';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import Slider from '@react-native-community/slider';
import { useSevenStore } from '../src/store/useSevenStore';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { HudHeader } from '../src/components/HudHeader';
import { ConnectorCard } from '../src/components/ConnectorCard';
import { SelfHealingModal } from '../src/components/SelfHealingModal';
import { CapabilityHero } from '../src/components/CapabilityHero';
import { ProviderHealthPanel } from '../src/components/ProviderHealthPanel';
import { StorageGuardrails } from '../src/components/StorageGuardrails';
import { OrbView } from '../src/components/OrbView';
import { gmailService } from '../src/services/gmailService';
import { instagramService } from '../src/services/instagramService';
import { briefingNotifications } from '../src/services/briefingNotificationService';
import { JARVIS_VOICE_MODELS, verifyFishAudioKey } from '../src/services/fishAudioService';
import { selfHealing } from '../src/core/selfHealing';
import { BottomNav } from '../src/components/BottomNav';
import { useVoice } from '../src/hooks/useVoice';
import { useDraft } from '../src/hooks/useDraft';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette, ThemeName, UiMode } from '../src/theme/theme';
import { t } from '../src/theme/i18n';
import { haptics } from '../src/services/hapticsService';
import { appLockService } from '../src/services/appLockService';
import {
  Settings,
  ChevronLeft,
  Volume2,
  ShieldCheck,
  ExternalLink,
  Info,
  CheckCircle2,
  Bug,
  Play,
  Square,
  Palette as PaletteIcon,
  Brain,
  Bell,
  Monitor,
  Trash2,
} from 'lucide-react-native';

const VOICE_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'ja-JP', label: '日本語' },
];

const VOICE_TEST_PHRASES: Record<string, string> = {
  'fr-FR': 'Tous les systèmes sont opérationnels. Synthèse vocale Seven AI calibrée et prête.',
  'en-US': 'All systems operational. Seven AI voice synthesis calibrated and standing by.',
  'en-GB': 'All systems operational. Seven AI voice synthesis calibrated and standing by.',
  'es-ES': 'Todos los sistemas operativos. Síntesis de voz de Seven AI lista.',
  'de-DE': 'Alle Systeme betriebsbereit. Sprachausgabe von Seven AI kalibriert.',
  'it-IT': 'Tutti i sistemi sono operativi. Sintesi vocale di Seven AI pronta.',
};

const ACCENT_THEMES: { id: ThemeName; dot: string }[] = [
  { id: 'seven', dot: '#00E5FF' },
  { id: 'crimson', dot: '#FF3366' },
  { id: 'matrix', dot: '#4ADE80' },
];

type UiModeSetting = UiMode | 'auto';

export default function SettingsScreen() {
  const router = useRouter();
  const config = useSevenStore((s) => s.config);
  const setConfig = useSevenStore((s) => s.setConfig);
  const googleState = useSevenStore((s) => s.googleState);
  const instagramState = useSevenStore((s) => s.instagramState);
  const patchLogs = useSevenStore((s) => s.patchLogs);
  const messageCount = useSevenStore((s) => s.chatHistory.length);
  const sessionCount = useSevenStore((s) => s.chatSessions.length);
  const routineCount = useSevenStore((s) => s.automationRoutines.length);
  const addTerminalLog = useSevenStore((s) => s.addTerminalLog);

  const palette = useTheme();
  const styles = useThemeStyles(settingsStyles);
  const lang = config.language ?? 'en';

  // Persisted fields use drafts so a saved key shows up as soon as the config
  // hydrates — see src/hooks/useDraft.ts.
  const [assistantName, setAssistantName] = useDraft(config.assistantName || 'Seven AI');
  const [userName, setUserName] = useDraft(config.userName || 'Commander');
  const [geminiApiKey, setGeminiApiKey] = useDraft(config.geminiApiKey || '');
  const [openRouterKey, setOpenRouterKey] = useDraft(config.openRouterKey || '');
  const [braveSearchApiKey, setBraveSearchApiKey] = useDraft(config.braveSearchApiKey || '');
  const [googleClientId, setGoogleClientId] = useDraft(config.googleClientId || '');
  const [voiceEnabled, setVoiceEnabled] = useDraft(config.voiceEnabled);
  const [voicePitch, setVoicePitch] = useDraft(config.voicePitch || 1.0);
  const [voiceRate, setVoiceRate] = useDraft(config.voiceRate || 1.0);
  const [voiceLanguage, setVoiceLanguage] = useDraft(config.voiceLanguage || 'en-US');
  const [voiceBargeInEnabled, setVoiceBargeInEnabled] = useDraft(
    config.voiceBargeInEnabled !== false
  );
  const [voiceEngine, setVoiceEngine] = useDraft<'system' | 'fish' | 'elevenlabs'>(
    config.voiceEngine || 'system'
  );
  const [fishApiKey, setFishApiKey] = useDraft(config.fishAudioApiKey || '');
  const [fishVoiceIdEn, setFishVoiceIdEn] = useDraft(
    config.fishVoiceIdEn || JARVIS_VOICE_MODELS.en.id
  );
  const [fishVoiceIdFr, setFishVoiceIdFr] = useDraft(
    config.fishVoiceIdFr || JARVIS_VOICE_MODELS.fr.id
  );
  const [fishCheck, setFishCheck] = useState<
    { phase: 'idle' | 'checking' | 'ok' | 'fail'; message: string }
  >({ phase: 'idle', message: '' });
  const [elevenLabsApiKey, setElevenLabsApiKey] = useDraft(config.elevenLabsApiKey || '');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useDraft(
    config.elevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL'
  );
  const [memoryNotes, setMemoryNotes] = useDraft(config.memoryNotes || '');
  const [briefingEnabled, setBriefingEnabled] = useDraft(config.morningBriefingEnabled ?? false);
  const [city, setCity] = useDraft(config.city || 'Antananarivo');
  const [showSelfHealingModal, setShowSelfHealingModal] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  // App lock: the switch only ever turns on if the device actually has
  // biometrics/passcode enrolled, checked live (never trusted from a stale
  // cached value — someone could have removed their fingerprint since).
  const [appLockAvailable, setAppLockAvailable] = useState<boolean | null>(null);
  const [appLockMethod, setAppLockMethod] = useState('');
  useEffect(() => {
    let mounted = true;
    appLockService.isAvailable().then((v) => mounted && setAppLockAvailable(v));
    appLockService.describeMethod(lang).then((v) => mounted && setAppLockMethod(v));
    return () => {
      mounted = false;
    };
  }, [lang]);

  // ---- OTA update channel (EAS Updates) ----
  // `expo-updates` exports the launched update's facts synchronously; on web it
  // is a no-op shim, so the section reports that honestly instead of lying.
  const [otaPhase, setOtaPhase] = useState<'idle' | 'checking' | 'uptodate' | 'ready' | 'error'>(
    'idle'
  );
  const [otaReloading, setOtaReloading] = useState(false);
  const otaSupported = Platform.OS !== 'web' && Updates.isEnabled;
  const otaIsOta = otaSupported && !Updates.isEmbeddedLaunch && !!Updates.updateId;

  const otaCreatedLabel = useMemo(() => {
    const created = Updates.createdAt;
    if (!created) return '—';
    try {
      return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(created);
    } catch {
      return created.toISOString().slice(0, 16).replace('T', ' ');
    }
  }, [lang]);

  const handleCheckUpdate = async () => {
    if (!otaSupported || otaPhase === 'checking') return;
    haptics.light();
    setOtaPhase('checking');
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setOtaPhase('uptodate');
        return;
      }
      await Updates.fetchUpdateAsync();
      setOtaPhase('ready');
    } catch {
      setOtaPhase('error');
    }
  };

  const handleRestartUpdate = async () => {
    setOtaReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setOtaReloading(false);
    }
  };

  const { speak, stopSpeaking } = useVoice();

  // ---- Appearance: applied instantly (no SAVE required) ----

  const applyAccent = (theme: ThemeName) => {
    haptics.light();
    setConfig({ theme });
  };

  const applyUiMode = (mode: UiModeSetting) => {
    haptics.light();
    setConfig({ uiMode: mode });
  };

  const applyLanguage = (language: 'fr' | 'en') => {
    haptics.light();
    setConfig({ language });
  };

  const handleToggleBriefing = async (enabled: boolean) => {
    setBriefingEnabled(enabled);
    haptics.light();
    if (enabled) {
      const result = await briefingNotifications.scheduleDailyBriefing();
      const granted = result === 'scheduled';
      setConfig({ morningBriefingEnabled: granted });
      setBriefingEnabled(granted);
      const message =
        result === 'scheduled'
          ? 'MORNING BRIEFING: scheduled daily at 08:00.'
          : result === 'denied'
            ? 'MORNING BRIEFING: permission denied.'
            : result === 'unsupported'
              ? 'MORNING BRIEFING: local notifications are unavailable on this platform.'
              : 'MORNING BRIEFING: could not reach the scheduler.';
      addTerminalLog(message, granted ? 'success' : 'warn');
    } else {
      await briefingNotifications.cancelDailyBriefing();
      setConfig({ morningBriefingEnabled: false });
      addTerminalLog('MORNING BRIEFING: cancelled.', 'info');
    }
  };

  const handleSaveProfile = async () => {
    // Secret fields: an empty input means "unchanged" (the field may not have
    // been hydrated yet, or is intentionally left blank). Never wipe a stored
    // key just because the textbox was empty on save.
    await setConfig({
      assistantName: assistantName.trim() || 'Seven AI',
      userName: userName.trim() || 'Commander',
      geminiApiKey: geminiApiKey.trim() || config.geminiApiKey || '',
      openRouterKey: openRouterKey.trim() || config.openRouterKey || '',
      braveSearchApiKey: braveSearchApiKey.trim() || config.braveSearchApiKey || '',
      googleClientId: googleClientId.trim() || config.googleClientId || '',
      voiceEnabled,
      voicePitch,
      voiceRate,
      voiceLanguage,
      voiceEngine,
      voiceBargeInEnabled,
      fishAudioApiKey: fishApiKey.trim() || config.fishAudioApiKey || '',
      fishVoiceIdEn: fishVoiceIdEn.trim() || JARVIS_VOICE_MODELS.en.id,
      fishVoiceIdFr: fishVoiceIdFr.trim() || JARVIS_VOICE_MODELS.fr.id,
      elevenLabsApiKey: elevenLabsApiKey.trim() || config.elevenLabsApiKey || '',
      elevenLabsVoiceId: elevenLabsVoiceId.trim() || 'EXAVITQu4vr4xnSDxMaL',
      memoryNotes: memoryNotes.trim(),
    });
    setSavedSuccess(true);
    haptics.success();
    setTimeout(() => setSavedSuccess(false), 2000);
    addTerminalLog('SETTINGS UPDATED: Hardware vault & voice engine configured.', 'success');
  };

  /** Verify the Fish key here too — a wrong key should not be discovered while
   *  talking to someone. */
  const handleVerifyFish = async () => {
    haptics.light();
    const key = fishApiKey.trim();
    if (!key) {
      setFishCheck({ phase: 'fail', message: 'No key entered' });
      return;
    }
    setFishCheck({ phase: 'checking', message: '' });
    const result = await verifyFishAudioKey(key);
    setFishCheck({ phase: result.ok ? 'ok' : 'fail', message: result.message });
    haptics[result.ok ? 'success' : 'error']();
    addTerminalLog(
      result.ok
        ? 'VOICE ENGINE: Fish Audio key verified.'
        : `VOICE ENGINE: Fish Audio check failed — ${result.message}.`,
      result.ok ? 'success' : 'warn'
    );
  };

  const handleTestVoice = () => {
    haptics.light();
    if (isTestingVoice) {
      stopSpeaking();
      setIsTestingVoice(false);
      return;
    }
    setIsTestingVoice(true);
    const phrase =
      VOICE_TEST_PHRASES[voiceLanguage] ||
      (voiceLanguage.startsWith('fr')
        ? VOICE_TEST_PHRASES['fr-FR']
        : VOICE_TEST_PHRASES['en-US']);
    speak(phrase);
    const durationMs = Math.min(15000, 4000 + (1.2 - voiceRate) * 3000);
    setTimeout(() => setIsTestingVoice(false), durationMs);
  };

  const handleConnectGoogle = async () => {
    const clientId = config.googleClientId?.trim();
    if (!clientId || clientId.length < 10) {
      addTerminalLog('Set a Google OAuth Client ID first (below), then connect.', 'warn');
      Alert.alert(
        'Client ID requis',
        'Entrez un Google OAuth Client ID (section Hardaware Keystore) avant de connecter Google Workspace. Le redirect URI à whitelister est affiché dans le terminal.'
      );
      return;
    }
    await gmailService.connectGoogleOAuth(clientId);
  };

  const handleDisconnectGoogle = async () => {
    await gmailService.disconnectGoogle();
    addTerminalLog('Google Workspace disconnected. Tokens cleared.', 'info');
  };

  const handleConnectInstagram = async () => {
    await instagramService.connectViaBrowser();
  };

  const handleGetApiKey = async () => {
    try {
      await WebBrowser.openBrowserAsync('https://aistudio.google.com/app/apikey');
    } catch {
      if (typeof window !== 'undefined') {
        window.open('https://aistudio.google.com/app/apikey', '_blank');
      }
    }
  };

  return (
    <ParticleBackground>
      <HudHeader />

      {/* Screen Sub-Header */}
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityLabel={t('nav.dashboard', lang)}
          onPress={() => router.push('/')}
        >
          <ChevronLeft size={16} color={palette.accent} />
          <Text style={styles.backBtnText}>{t('nav.dashboard', lang)}</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Settings size={15} color={palette.accent} />
          <Text style={styles.titleText}>{t('settings.title', lang)}</Text>
        </View>

        <TouchableOpacity
          style={styles.onboardingLink}
          accessibilityLabel={lang === 'fr' ? "Assistant de configuration" : 'Setup wizard'}
          onPress={() => router.push('/onboarding')}
        >
          <Text style={styles.onboardingLinkText}>{t('settings.wizard', lang)}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Section 0: Appearance */}
        <Text style={styles.sectionHeading}>{t('settings.appearance', lang).toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.appearanceRow}>
            <PaletteIcon size={15} color={palette.accent} />
            <Text style={styles.inputLabel}>{t('settings.accent', lang).toUpperCase()}</Text>
          </View>
          <View style={styles.chipRow}>
            {ACCENT_THEMES.map((theme) => (
              <TouchableOpacity
                key={theme.id}
                style={[
                  styles.langChip,
                  config.theme === theme.id && styles.langChipActive,
                ]}
                accessibilityLabel={t(`settings.theme.${theme.id}`, lang)}
                onPress={() => applyAccent(theme.id)}
              >
                <View style={[styles.themeDot, { backgroundColor: theme.dot }]} />
                <Text
                  style={[
                    styles.langChipText,
                    config.theme === theme.id && styles.langChipTextActive,
                  ]}
                >
                  {t(`settings.theme.${theme.id}`, lang)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{t('settings.uiMode', lang).toUpperCase()}</Text>
            <View style={styles.chipRow}>
              {(['auto', 'dark', 'light'] as UiModeSetting[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.langChip,
                    (config.uiMode ?? 'dark') === mode && styles.langChipActive,
                  ]}
                  accessibilityLabel={t(`settings.mode.${mode}`, lang)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (config.uiMode ?? 'dark') === mode }}
                  onPress={() => applyUiMode(mode)}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      (config.uiMode ?? 'dark') === mode && styles.langChipTextActive,
                    ]}
                  >
                    {t(`settings.mode.${mode}`, lang)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(config.uiMode ?? 'dark') === 'auto' && (
              <Text style={styles.avatarEngineHint}>{t('settings.mode.autoHint', lang)}</Text>
            )}
          </View>

          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{t('settings.language', lang).toUpperCase()}</Text>
            <View style={styles.chipRow}>
              {(['en', 'fr'] as const).map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.langChip, lang === l && styles.langChipActive]}
                  accessibilityLabel={l === 'en' ? 'English' : 'Français'}
                  onPress={() => applyLanguage(l)}
                >
                  <Text style={[styles.langChipText, lang === l && styles.langChipTextActive]}>
                    {l.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Avatar Core Engine — Gideon is the single holographic identity.
              The legacy orb engines are retired (see store config migration). */}
          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{t('settings.avatarEngine', lang)}</Text>
            <View style={styles.chipRow}>
              <View style={[styles.langChip, styles.langChipActive]}>
                <Text style={[styles.langChipText, styles.langChipTextActive]}>
                  GIDEON HOLOGRAM
                </Text>
              </View>
            </View>
            <Text style={styles.avatarEngineHint}>
              Hologramme projecteur — tête filaire translucide, yeux et bouche articulés.
            </Text>
          </View>

          <View style={styles.avatarCalibrationCard}>
            <OrbView
              mode="gideon"
              size={118}
              status={isTestingVoice ? 'speaking' : 'idle'}
              speechText={
                isTestingVoice
                  ? VOICE_TEST_PHRASES[voiceLanguage] || VOICE_TEST_PHRASES['en-US']
                  : ''
              }
              speechRate={voiceRate}
              gyroEnabled={config.gyroEnabled ?? true}
              themeColor={palette.accent}
            />
            <View style={styles.avatarCalibrationCopy}>
              <Text style={styles.calibrationTitle}>
                {lang === 'fr' ? 'CALIBRATION GIDEON' : 'GIDEON CALIBRATION'}
              </Text>
              <Text style={styles.avatarEngineHint}>
                {lang === 'fr'
                  ? 'Utilisez TESTER LA VOIX plus bas pour vérifier ensemble la voix, les visèmes et la mâchoire.'
                  : 'Use TEST VOICE below to verify voice, visemes and jaw movement together.'}
              </Text>
            </View>
          </View>

          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{lang === 'fr' ? 'QUALITÉ AVATAR' : 'AVATAR QUALITY'}</Text>
            <View style={styles.chipRow}>
              {(['performance', 'balanced', 'high'] as const).map((quality) => (
                <TouchableOpacity
                  key={quality}
                  style={[
                    styles.langChip,
                    (config.avatarQuality ?? 'balanced') === quality && styles.langChipActive,
                  ]}
                  onPress={() => setConfig({ avatarQuality: quality })}
                  accessibilityState={{ selected: (config.avatarQuality ?? 'balanced') === quality }}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      (config.avatarQuality ?? 'balanced') === quality && styles.langChipTextActive,
                    ]}
                  >
                    {quality === 'performance'
                      ? 'PERF'
                      : quality === 'balanced'
                        ? lang === 'fr' ? 'ÉQUILIBRÉE' : 'BALANCED'
                        : lang === 'fr' ? 'HAUTE' : 'HIGH'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {[
            {
              key: 'avatarParallaxIntensity' as const,
              label: lang === 'fr' ? 'INTENSITÉ PARALLAXE' : 'PARALLAX INTENSITY',
              value: config.avatarParallaxIntensity ?? 1,
              min: 0,
              max: 2,
            },
            {
              key: 'avatarExpressionIntensity' as const,
              label: lang === 'fr' ? 'EXPRESSIVITÉ' : 'EXPRESSIVENESS',
              value: config.avatarExpressionIntensity ?? 1,
              min: 0.5,
              max: 1.5,
            },
            {
              key: 'avatarMouthIntensity' as const,
              label: lang === 'fr' ? 'AMPLITUDE DE LA BOUCHE' : 'MOUTH AMPLITUDE',
              value: config.avatarMouthIntensity ?? 1,
              min: 0.65,
              max: 1.4,
            },
          ].map((control) => (
            <View key={control.key} style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.inputLabel}>{control.label}</Text>
                <Text style={styles.sliderValue}>{control.value.toFixed(2)}×</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={control.min}
                maximumValue={control.max}
                step={0.05}
                value={control.value}
                minimumTrackTintColor={palette.accent}
                maximumTrackTintColor={palette.borderStrong}
                thumbTintColor={palette.accent}
                onSlidingComplete={(value) => setConfig({ [control.key]: value })}
              />
            </View>
          ))}

          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{lang === 'fr' ? 'REGARD CONTEXTUEL' : 'CONTEXTUAL GAZE'}</Text>
            <Switch
              value={config.avatarGazeEnabled !== false}
              onValueChange={(value) => setConfig({ avatarGazeEnabled: value })}
              trackColor={{ false: palette.bgElevated, true: palette.accent }}
              thumbColor="#FFF"
            />
          </View>

          {/* Gyroscope Motion Toggle */}
          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{t('settings.gyroscope', lang)}</Text>
            <Switch
              value={config.gyroEnabled ?? true}
              onValueChange={(val) => {
                haptics.light();
                setConfig({ gyroEnabled: val });
              }}
              trackColor={{ false: palette.bgElevated, true: palette.accent }}
              thumbColor="#FFF"
            />
          </View>

          {/* HUD Dock (Standby) — a real differentiator (desk/charger mode)
              that used to be reachable only via a dashboard widget a user
              could hide. Surfacing it here means it survives even if that
              widget is hidden or the arrangement is reset. */}
          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>
              {lang === 'fr' ? 'MODE BUREAU / CHARGEUR (HUD DOCK)' : 'DESK / CHARGER MODE (HUD DOCK)'}
            </Text>
            <TouchableOpacity
              style={styles.getKeyBtn}
              accessibilityLabel={lang === 'fr' ? 'Ouvrir le mode HUD Dock' : 'Open HUD Dock mode'}
              onPress={() => {
                haptics.medium();
                router.push('/standby');
              }}
            >
              <Monitor size={10} color={palette.bgDeep} />
              <Text style={styles.getKeyBtnText}>{lang === 'fr' ? 'OUVRIR' : 'OPEN'}</Text>
            </TouchableOpacity>
          </View>

          {/* Icon label captions — the app leans heavily on icon-only
              buttons (chat header, history actions...); this toggle prints
              a small caption under them for anyone unsure what a bare icon
              does, without permanently widening every touch target. */}
          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>
              {lang === 'fr' ? 'LIBELLÉS SOUS LES ICÔNES' : 'ICON BUTTON LABELS'}
            </Text>
            <Switch
              value={config.showIconLabels ?? false}
              onValueChange={(val) => {
                haptics.light();
                setConfig({ showIconLabels: val });
              }}
              trackColor={{ false: palette.bgElevated, true: palette.accent }}
              thumbColor="#FFF"
            />
          </View>

          {/* Reduce motion — 'auto' trusts the OS accessibility setting
              (AccessibilityInfo.isReduceMotionEnabled, live-updated); 'on'/
              'off' override it. Only ambient/decorative loops are affected —
              blinking, expressions, lip-sync and loading feedback never stop. */}
          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{t('settings.reduceMotion', lang).toUpperCase()}</Text>
            <View style={styles.chipRow}>
              {(['auto', 'on', 'off'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.langChip, (config.reduceMotion ?? 'auto') === mode && styles.langChipActive]}
                  accessibilityLabel={t(`settings.reduceMotion.${mode}`, lang)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (config.reduceMotion ?? 'auto') === mode }}
                  onPress={() => {
                    haptics.light();
                    setConfig({ reduceMotion: mode });
                  }}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      (config.reduceMotion ?? 'auto') === mode && styles.langChipTextActive,
                    ]}
                  >
                    {t(`settings.reduceMotion.${mode}`, lang)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.avatarEngineHint}>{t('settings.reduceMotionHint', lang)}</Text>
          </View>

          {/* App lock — biometric/passcode gate on the whole app. The switch
              is disabled (never silently ignored) when the device has
              nothing enrolled, so the user always understands why. */}
          <View style={[styles.appearanceRow, styles.appearanceRowSpaced]}>
            <Text style={styles.inputLabel}>{t('settings.appLock', lang).toUpperCase()}</Text>
            <Switch
              // Unlabelled switches announce as "switch, off" to a screen
              // reader; this one also gives end-to-end tests a stable, unique
              // handle (the row's own APP LOCK text is a separate node).
              accessibilityLabel={t('settings.appLockToggle', lang)}
              value={!!config.appLockEnabled && !!appLockAvailable}
              disabled={!appLockAvailable}
              onValueChange={(val) => {
                haptics.light();
                setConfig({ appLockEnabled: val });
              }}
              trackColor={{ false: palette.bgElevated, true: palette.accent }}
              thumbColor="#FFF"
            />
          </View>
          <Text style={styles.avatarEngineHint}>
            {appLockAvailable === false
              ? t('settings.appLockUnavailable', lang)
              : t('settings.appLockHint', lang).replace('{method}', appLockMethod)}
          </Text>
        </View>

        {/* Section 1: Connectors & Integrations */}
        <Text style={styles.sectionHeading}>{t('settings.connectors', lang)}</Text>

        {/* Google Workspace Connector */}
        <ConnectorCard
          type="google"
          title="Google Workspace"
          subtitle="Real OAuth2 PKCE + Gmail API (read-only)"
          connected={googleState.connected}
          details={{
            email: googleState.accountEmail,
            unreadEmails: googleState.unreadEmailsCount,
          }}
          onConnect={handleConnectGoogle}
          onSync={handleConnectGoogle}
          onViewDetails={() => {
            Alert.alert(
              'Google Workspace',
              `Account: ${googleState.accountEmail || 'Not connected'}\nUnread Emails (last sync): ${googleState.unreadEmailsCount}\n\nGmail is read via the real Gmail API. Calendar & Drive are not implemented.`
            );
          }}
        />
        {googleState.connected && (
          <TouchableOpacity
            style={styles.disconnectBtn}
            accessibilityLabel="Disconnect Google"
            onPress={handleDisconnectGoogle}
          >
            <Text style={styles.disconnectText}>{t('settings.disconnectGoogle', lang)}</Text>
          </TouchableOpacity>
        )}

        {/* Note on OAuth2 vs App Passwords */}
        <View style={styles.oauthExplainerBox}>
          <Info size={13} color={palette.info} />
          <Text style={styles.oauthExplainerText}>
            Security Architecture: SEVEN utilizes modern OAuth2 token exchange with Scoped Access
            Tokens stored in expo-secure-store. Insecure legacy App Passwords are discontinued for safety.
          </Text>
        </View>

        {/* Instagram Browser Connector */}
        <ConnectorCard
          type="instagram"
          title="Instagram Connect"
          subtitle="Opens browser session (no public DM API)"
          connected={instagramState.connected}
          details={{}}
          onConnect={handleConnectInstagram}
          onSync={handleConnectInstagram}
          onViewDetails={() => {
            Alert.alert(
              'Instagram Session',
              'Instagram does not provide a public API to read DMs. This connector only opens a real browser session.'
            );
          }}
        />

        {/* Section 2: Identity & Persona */}
        <Text style={styles.sectionHeading}>{t('settings.profile', lang)}</Text>
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.assistantIdentifier', lang)}</Text>
            <TextInput
              style={styles.textInput}
              value={assistantName}
              onChangeText={setAssistantName}
              placeholder="Seven AI"
              placeholderTextColor={palette.textFaint}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.userCallsign', lang)}</Text>
            <TextInput
              style={styles.textInput}
              value={userName}
              onChangeText={setUserName}
              placeholder="SEVEN Commander"
              placeholderTextColor={palette.textFaint}
            />
          </View>
        </View>

        {/* Section 3: API Keys & Hardware SecureStore */}
        <Text style={styles.sectionHeading}>{t('settings.secureStore', lang)}</Text>
        <CapabilityHero
          eyebrow={t('settings.vaultEyebrow', lang)}
          title={t('settings.vaultTitle', lang)}
          description={t('settings.vaultDescription', lang)}
          icon={<ShieldCheck size={24} color={palette.accent} />}
          metric={{
            value: String(
              [geminiApiKey, openRouterKey, braveSearchApiKey, fishApiKey, elevenLabsApiKey].filter(
                (value) => value.trim().length > 0
              ).length
            ),
            label: t('settings.keysConfigured', lang),
          }}
          chips={
            Platform.OS === 'web'
              ? [{ label: t('settings.sessionOnly', lang), tone: 'warning' }]
              : [
                  { label: t('settings.individualEntries', lang), tone: 'success' },
                  { label: t('settings.sanitizedPrefs', lang), tone: 'accent' },
                ]
          }
        />
        <ProviderHealthPanel
          language={lang}
          providers={[
            { id: 'gemini', label: 'Gemini', key: geminiApiKey },
            { id: 'openrouter', label: 'OpenRouter', key: openRouterKey },
            { id: 'brave', label: 'Brave Search', key: braveSearchApiKey },
          ]}
        />
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <View style={styles.inputHeaderRow}>
              <Text style={styles.inputLabel}>{t('settings.geminiKey', lang)}</Text>
              <TouchableOpacity
                style={styles.getKeyBtn}
                accessibilityLabel="Get Gemini API key"
                onPress={handleGetApiKey}
              >
                <ExternalLink size={10} color={palette.bgDeep} />
                <Text style={styles.getKeyBtnText}>{t('settings.getApi', lang)}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              value={geminiApiKey}
              onChangeText={setGeminiApiKey}
              placeholder="AIzaSy... (system secure store on mobile)"
              placeholderTextColor={palette.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              // Masked like the other secrets: the settings screen is often
              // open over a shoulder, and the vault claim should be visible too.
              secureTextEntry
            />
            {!!config.geminiApiKey && (
              <TouchableOpacity
                style={styles.removeSecretBtn}
                onPress={async () => {
                  setGeminiApiKey('');
                  await setConfig({ geminiApiKey: '' });
                }}
              >
                <Trash2 size={11} color={palette.error} />
                <Text style={styles.removeSecretText}>{lang === 'fr' ? 'SUPPRIMER LA CLÉ' : 'REMOVE KEY'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.googleClientId', lang)}</Text>
            <TextInput
              style={styles.textInput}
              value={googleClientId}
              onChangeText={setGoogleClientId}
              placeholder="xxxxx.apps.googleusercontent.com"
              placeholderTextColor={palette.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputHeaderRow}>
              <Text style={styles.inputLabel}>{t('settings.openRouterKey', lang)}</Text>
              <View
                style={[
                  styles.fallbackBadge,
                  { borderColor: config.openRouterKey ? palette.success : palette.textFaint },
                ]}
              >
                <View
                  style={[
                    styles.fallbackBadgeDot,
                    { backgroundColor: config.openRouterKey ? palette.success : palette.textFaint },
                  ]}
                />
                <Text
                  style={[
                    styles.fallbackBadgeText,
                    { color: config.openRouterKey ? palette.success : palette.textFaint },
                  ]}
                >
                  {config.openRouterKey ? 'SET' : 'NOT SET'}
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.textInput}
              value={openRouterKey}
              onChangeText={setOpenRouterKey}
              placeholder="sk-or-v1-..."
              placeholderTextColor={palette.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            {!!config.openRouterKey && (
              <TouchableOpacity
                style={styles.removeSecretBtn}
                onPress={async () => {
                  setOpenRouterKey('');
                  await setConfig({ openRouterKey: '' });
                }}
              >
                <Trash2 size={11} color={palette.error} />
                <Text style={styles.removeSecretText}>{lang === 'fr' ? 'SUPPRIMER LA CLÉ' : 'REMOVE KEY'}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.oauthExplainerText}>
              {lang === 'fr'
                ? 'Utilisé automatiquement si Gemini n’est pas configuré ou reste inaccessible — des réponses conversationnelles réelles plutôt que le moteur local par mots-clés.'
                : 'Used automatically when Gemini has no key configured or is unreachable — real conversational answers instead of the local keyword engine.'}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.braveKey', lang)}</Text>
            <TextInput
              style={styles.textInput}
              value={braveSearchApiKey}
              onChangeText={setBraveSearchApiKey}
              placeholder="BSA..."
              placeholderTextColor={palette.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            {!!config.braveSearchApiKey && (
              <TouchableOpacity
                style={styles.removeSecretBtn}
                onPress={async () => {
                  setBraveSearchApiKey('');
                  await setConfig({ braveSearchApiKey: '' });
                }}
              >
                <Trash2 size={11} color={palette.error} />
                <Text style={styles.removeSecretText}>{lang === 'fr' ? 'SUPPRIMER LA CLÉ' : 'REMOVE KEY'}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.oauthExplainerText}>{t('settings.braveHint', lang)}</Text>
          </View>
        </View>

        <StorageGuardrails
          language={lang}
          messages={messageCount}
          sessions={sessionCount}
          routines={routineCount}
        />

        {/* Section 4: Long-term memory */}
        <Text style={styles.sectionHeading}>{t('settings.memory', lang).toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.appearanceRow}>
            <Brain size={15} color={palette.accent} />
            <Text style={styles.memoryHint}>{t('settings.memoryHint', lang)}</Text>
          </View>
          <TextInput
            style={[styles.textInput, styles.memoryInput]}
            value={memoryNotes}
            onChangeText={setMemoryNotes}
            placeholder={
              lang === 'fr'
                ? 'Ex: je préfère les réponses en français, mon stack est React/Node...'
                : 'Ex: I prefer concise answers, my stack is React/Node...'
            }
            placeholderTextColor={palette.textFaint}
            multiline
          />
        </View>

        {/* Section 5: Morning briefing notification */}
        <Text style={styles.sectionHeading}>{t('settings.briefing', lang).toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelLeft}>
              <Bell size={16} color={palette.warning} />
              <View>
                <Text style={styles.switchTitle}>{t('settings.briefing', lang)}</Text>
                <Text style={styles.switchDesc}>{t('settings.briefingHint', lang)}</Text>
              </View>
            </View>
            <Switch
              value={briefingEnabled}
              onValueChange={handleToggleBriefing}
              trackColor={{ false: palette.bgElevated, true: palette.accent }}
              thumbColor="#FFF"
            />
          </View>

          {/* Real-briefing city: Open-Meteo needs a place name, not GPS. */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings.city', lang).toUpperCase()}</Text>
            <TextInput
              style={styles.textInput}
              value={city}
              onChangeText={setCity}
              onEndEditing={() => {
                const clean = city.trim();
                if (clean && clean !== (config.city || '')) {
                  setConfig({ city: clean });
                  addTerminalLog(`BRIEFING CITY SET: ${clean} — weather/news will resolve there.`, 'info');
                }
              }}
              placeholder="Antananarivo"
              placeholderTextColor={palette.textFaint}
              autoCorrect={false}
            />
            <Text style={styles.switchDesc}>{t('settings.cityHint', lang)}</Text>
          </View>
        </View>

        {/* Section 6: Voice & Speech */}
        <Text style={styles.sectionHeading}>{t('settings.audio', lang)}</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelLeft}>
              <Volume2 size={16} color={palette.success} />
              <View>
                <Text style={styles.switchTitle}>{t('settings.tts', lang)}</Text>
                <Text style={styles.switchDesc}>{t('settings.ttsHint', lang)}</Text>
              </View>
            </View>
            <Switch
              value={voiceEnabled}
              onValueChange={setVoiceEnabled}
              trackColor={{ false: palette.bgElevated, true: palette.success }}
              thumbColor="#FFF"
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelLeft}>
              <Volume2 size={16} color={palette.accent} />
              <View>
                <Text style={styles.switchTitle}>
                  {lang === 'fr' ? 'Interruption vocale' : 'Voice barge-in'}
                </Text>
                <Text style={styles.switchDesc}>
                  {lang === 'fr'
                    ? 'Parlez pendant la réponse pour interrompre SEVEN'
                    : 'Speak over a response to interrupt SEVEN'}
                </Text>
              </View>
            </View>
            <Switch
              value={voiceBargeInEnabled}
              onValueChange={setVoiceBargeInEnabled}
              trackColor={{ false: palette.bgElevated, true: palette.accent }}
              thumbColor="#FFF"
            />
          </View>

          {/* Pitch slider */}
          <View style={styles.sliderGroup}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderLabel}>{t('settings.pitch', lang).toUpperCase()}</Text>
              <Text style={styles.sliderValue}>{voicePitch.toFixed(2)}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={2.0}
              step={0.05}
              value={voicePitch}
              onValueChange={setVoicePitch}
              minimumTrackTintColor={palette.success}
              maximumTrackTintColor={palette.border}
              thumbTintColor={palette.success}
            />
          </View>

          {/* Rate slider */}
          <View style={styles.sliderGroup}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderLabel}>{t('settings.speed', lang).toUpperCase()}</Text>
              <Text style={styles.sliderValue}>{voiceRate.toFixed(2)}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={2.0}
              step={0.05}
              value={voiceRate}
              onValueChange={setVoiceRate}
              minimumTrackTintColor={palette.info}
              maximumTrackTintColor={palette.border}
              thumbTintColor={palette.info}
            />
          </View>

          {/* Language selector */}
          <View style={styles.sliderGroup}>
            <Text style={styles.sliderLabel}>{t('settings.voiceLanguage', lang)}</Text>
            <View style={styles.langRow}>
              {VOICE_LANGUAGES.map((voiceLang) => (
                <TouchableOpacity
                  key={voiceLang.code}
                  style={[
                    styles.langChip,
                    voiceLanguage === voiceLang.code && styles.langChipActive,
                  ]}
                  accessibilityLabel={voiceLang.label}
                  onPress={() => setVoiceLanguage(voiceLang.code)}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      voiceLanguage === voiceLang.code && styles.langChipTextActive,
                    ]}
                  >
                    {voiceLang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Voice Engine Mode (System TTS vs Fish Audio JARVIS vs legacy ElevenLabs) */}
          <View style={styles.sliderGroup}>
            <Text style={styles.sliderLabel}>{t('settings.voiceEngine', lang)}</Text>
            <View style={styles.langRow}>
              {(
                [
                  { id: 'fish', label: 'FISH AUDIO (JARVIS)' },
                  { id: 'system', label: 'EXPO SPEECH (SYSTEM)' },
                  { id: 'elevenlabs', label: 'ELEVENLABS HD' },
                ] as const
              ).map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.langChip, voiceEngine === option.id && styles.langChipActive]}
                  accessibilityLabel={option.label}
                  onPress={() => {
                    haptics.light();
                    setVoiceEngine(option.id);
                  }}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      voiceEngine === option.id && styles.langChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {voiceEngine === 'fish' && (
              <Text style={styles.voiceTestHint}>
                {lang === 'fr'
                  ? 'Le modèle change avec la langue parlée : JARVIS FR en français, JARVIS EN en anglais.'
                  : 'The model follows the spoken language: JARVIS FR for French, JARVIS EN for English.'}
              </Text>
            )}
          </View>

          {voiceEngine === 'fish' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.fishKey', lang)}</Text>
                <TextInput
                  style={styles.textInput}
                  value={fishApiKey}
                  onChangeText={(value) => {
                    setFishApiKey(value);
                    setFishCheck({ phase: 'idle', message: '' });
                  }}
                  placeholder="fish_..."
                  placeholderTextColor={palette.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <View style={styles.fishVerifyRow}>
                  <TouchableOpacity
                    style={[styles.fishVerifyBtn, { borderColor: palette.accent }]}
                    accessibilityLabel="Verify Fish Audio key"
                    onPress={handleVerifyFish}
                    disabled={fishCheck.phase === 'checking'}
                  >
                    <Text style={[styles.fishVerifyText, { color: palette.accent }]}>
                      {fishCheck.phase === 'checking'
                        ? '…'
                        : fishCheck.phase === 'ok'
                          ? `✓ ${fishCheck.message}`
                          : fishCheck.phase === 'fail'
                            ? `✕ ${fishCheck.message}`
                            : lang === 'fr'
                              ? 'VÉRIFIER LA CLÉ'
                              : 'VERIFY KEY'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.jarvisEnglish', lang)}</Text>
                <TextInput
                  style={styles.textInput}
                  value={fishVoiceIdEn}
                  onChangeText={setFishVoiceIdEn}
                  placeholder={JARVIS_VOICE_MODELS.en.id}
                  placeholderTextColor={palette.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.jarvisFrench', lang)}</Text>
                <TextInput
                  style={styles.textInput}
                  value={fishVoiceIdFr}
                  onChangeText={setFishVoiceIdFr}
                  placeholder={JARVIS_VOICE_MODELS.fr.id}
                  placeholderTextColor={palette.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </>
          )}

          {voiceEngine === 'elevenlabs' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.elevenKey', lang)}</Text>
                <TextInput
                  style={styles.textInput}
                  value={elevenLabsApiKey}
                  onChangeText={setElevenLabsApiKey}
                  placeholder="xi-api-key..."
                  placeholderTextColor={palette.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('settings.voiceId', lang)}</Text>
                <TextInput
                  style={styles.textInput}
                  value={elevenLabsVoiceId}
                  onChangeText={setElevenLabsVoiceId}
                  placeholder="EXAVITQu4vr4xnSDxMaL"
                  placeholderTextColor={palette.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </>
          )}

          {/* Voice test button */}
          <TouchableOpacity
            style={[styles.voiceTestBtn, isTestingVoice && styles.voiceTestBtnActive]}
            accessibilityLabel={
              isTestingVoice ? t('common.stop', lang) : t('settings.testVoice', lang)
            }
            onPress={handleTestVoice}
          >
            {isTestingVoice ? (
              <>
                <Square size={14} color={palette.bgDeep} />
                <Text style={styles.voiceTestBtnText}>{t('common.stop', lang)}</Text>
              </>
            ) : (
              <>
                <Play size={14} color={palette.bgDeep} />
                <Text style={styles.voiceTestBtnText}>{t('settings.testVoice', lang).toUpperCase()}</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.voiceTestHint}>
            {lang === 'fr'
              ? 'Appliqué instantanément. SAUVEGARDER pour persister.'
              : 'Applies instantly. Press SAVE & APPLY to persist these values.'}
          </Text>
        </View>

        {/* Section 7: Anti-Panic Engine & Self-Healing */}
        <Text style={styles.sectionHeading}>{t('settings.diagnostics', lang)}</Text>
        <View style={styles.card}>
          <View style={styles.astStatusRow}>
            <View style={styles.astHeaderLeft}>
              <ShieldCheck size={16} color={palette.error} />
              <View>
                <Text style={styles.astTitle}>{t('settings.diagnosticsStatus', lang)}</Text>
                <Text style={styles.astDesc}>
                  Total Patches Applied: {patchLogs.length} | Last: #{patchLogs[0]?.id || 'NONE'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.viewPatchBtn}
              accessibilityLabel={lang === 'fr' ? 'Inspecter les correctifs' : 'Inspect patches'}
              onPress={() => setShowSelfHealingModal(true)}
            >
              <Bug size={12} color={palette.text} />
              <Text style={styles.viewPatchBtnText}>{t('settings.inspect', lang)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 8: OTA update channel */}
        <Text style={styles.sectionHeading}>{t('settings.updates', lang)}</Text>
        <View style={styles.card}>
          <View style={styles.otaRow}>
            <Text style={styles.inputLabel}>{t('settings.updatesSource', lang)}</Text>
            <Text
              style={[styles.otaValue, { color: otaIsOta ? palette.accent : palette.textDim }]}
            >
              {!otaSupported
                ? t('settings.updatesWeb', lang)
                : otaIsOta
                  ? `${t('settings.updatesOta', lang)} · ${(Updates.updateId || '').slice(0, 8)}`
                  : t('settings.updatesEmbedded', lang)}
            </Text>
          </View>
          <View style={styles.otaRow}>
            <Text style={styles.inputLabel}>{t('settings.updatesRuntime', lang)}</Text>
            <Text style={styles.otaValue}>{(Updates.runtimeVersion || '—').slice(0, 12)}</Text>
          </View>
          <View style={styles.otaRow}>
            <Text style={styles.inputLabel}>{t('settings.updatesChannel', lang)}</Text>
            <Text style={styles.otaValue}>{Updates.channel || '—'}</Text>
          </View>
          <View style={styles.otaRow}>
            <Text style={styles.inputLabel}>{t('settings.updatesPublished', lang)}</Text>
            <Text style={styles.otaValue}>{otaCreatedLabel}</Text>
          </View>
          {otaSupported && (
            <TouchableOpacity
              style={[styles.otaBtn, { borderColor: palette.accent }]}
              accessibilityLabel={
                otaPhase === 'ready' ? t('settings.updatesReady', lang) : t('settings.updatesCheck', lang)
              }
              onPress={otaPhase === 'ready' ? handleRestartUpdate : handleCheckUpdate}
              disabled={otaPhase === 'checking' || otaReloading}
            >
              <Text style={[styles.otaBtnText, { color: palette.accent }]}>
                {otaPhase === 'checking'
                  ? t('settings.updatesChecking', lang)
                  : otaPhase === 'ready'
                    ? t('settings.updatesReady', lang)
                    : otaPhase === 'uptodate'
                      ? t('settings.updatesUpToDate', lang)
                      : otaPhase === 'error'
                        ? t('settings.updatesError', lang)
                        : t('settings.updatesCheck', lang)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Save Settings Button */}
        <TouchableOpacity
          style={styles.saveBtn}
          accessibilityLabel={t('common.save', lang)}
          onPress={handleSaveProfile}
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 size={16} color={palette.bgDeep} />
              <Text style={styles.saveBtnText}>{t('settings.saved', lang)}</Text>
            </>
          ) : (
            <Text style={styles.saveBtnText}>{t('common.save', lang)}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <SelfHealingModal
        visible={showSelfHealingModal}
        onClose={() => setShowSelfHealingModal(false)}
        onSimulateBug={async () => {
          await selfHealing.simulateBugAndAutoFix();
        }}
      />

      <BottomNav active="settings" />
    </ParticleBackground>
  );
}

const settingsStyles = (t: Palette) =>
  ({
    topNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: t.bgDeep,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    backBtnText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 9.5,
      fontWeight: '700',
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    titleText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    onboardingLink: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: t.accentSoft,
      borderRadius: 3,
    },
    onboardingLinkText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 9,
      fontWeight: '700',
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 40,
    },
    sectionHeading: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      marginTop: 12,
      marginBottom: 6,
    },
    card: {
      backgroundColor: t.bgElevated,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      marginBottom: 8,
    },
    appearanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    appearanceRowSpaced: {
      justifyContent: 'space-between',
      marginBottom: 4,
      marginTop: 8,
    },
    themeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    oauthExplainerBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: t.accentSoft,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.border,
      padding: 10,
      marginVertical: 4,
    },
    oauthExplainerText: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9,
      lineHeight: 13,
      flex: 1,
    },
    inputGroup: {
      marginBottom: 10,
    },
    inputHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    fallbackBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      borderWidth: 1,
    },
    fallbackBadgeDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    fallbackBadgeText: {
      fontFamily: FONT.mono,
      fontSize: 7.5,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    inputLabel: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    memoryHint: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9,
      flex: 1,
      lineHeight: 13,
    },
    memoryInput: {
      minHeight: 70,
      textAlignVertical: 'top',
      paddingTop: 8,
    },
    getKeyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accent,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 3,
      gap: 3,
    },
    getKeyBtnText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 8.5,
      fontWeight: '800',
    },
    removeSecretBtn: {
      minHeight: 36,
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      marginTop: 5,
      borderRadius: 7,
      backgroundColor: t.bgDeep,
      borderWidth: 1,
      borderColor: t.error,
    },
    removeSecretText: {
      color: t.error,
      fontFamily: FONT.monoBold,
      fontSize: 8.5,
    },
    textInput: {
      backgroundColor: t.bgDeep,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: t.text,
      fontFamily: FONT.mono,
      fontSize: 11.5,
      marginTop: 4,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    switchLabelLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    switchTitle: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 11,
      fontWeight: '700',
    },
    switchDesc: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9,
    },
    astStatusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    astHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    astTitle: {
      fontFamily: FONT.mono,
      color: t.error,
      fontSize: 11,
      fontWeight: '700',
    },
    astDesc: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9,
    },
    viewPatchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.error,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 4,
      gap: 4,
    },
    viewPatchBtnText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 9,
      fontWeight: '800',
    },
    otaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    otaValue: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.4,
      flexShrink: 1,
      textAlign: 'right',
    },
    otaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 4,
      paddingVertical: 9,
      marginTop: 8,
    },
    otaBtnText: {
      fontFamily: FONT.mono,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accent,
      paddingVertical: 12,
      borderRadius: 6,
      gap: 6,
      marginTop: 10,
      marginBottom: 20,
    },
    saveBtnText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1,
    },
    disconnectBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.error,
      borderWidth: 1,
      borderColor: t.error,
      paddingVertical: 8,
      borderRadius: 5,
      marginTop: 4,
      marginBottom: 8,
      opacity: 0.85,
    },
    disconnectText: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    sliderGroup: {
      marginTop: 14,
    },
    sliderLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    sliderLabel: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    sliderValue: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '800',
    },
    slider: {
      width: '100%',
      height: 32,
    },
    langRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    langChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: t.bgDeep,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    langChipActive: {
      backgroundColor: t.accentSoft,
      borderColor: t.accent,
    },
    langChipText: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9.5,
    },
    langChipTextActive: {
      color: t.accent,
      fontWeight: '800',
    },
    avatarEngineHint: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 8.5,
      marginTop: 5,
      lineHeight: 12,
    },
    avatarCalibrationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.bgDeep,
      borderWidth: 1,
      borderColor: t.borderStrong,
      borderRadius: 12,
      padding: 8,
      marginBottom: 10,
      overflow: 'hidden',
    },
    avatarCalibrationCopy: {
      flex: 1,
      minWidth: 0,
    },
    calibrationTitle: {
      color: t.accent,
      fontFamily: FONT.display,
      fontSize: 13,
      letterSpacing: 0.8,
    },
    voiceTestBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.success,
      paddingVertical: 10,
      borderRadius: 5,
      gap: 6,
      marginTop: 16,
    },
    voiceTestBtnActive: {
      backgroundColor: t.accent,
    },
    voiceTestBtnText: {
      fontFamily: FONT.mono,
      color: t.bgDeep,
      fontSize: 10.5,
      fontWeight: '900',
      letterSpacing: 1,
    },
    voiceTestHint: {
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 8.5,
      marginTop: 6,
      textAlign: 'center',
    },
    fishVerifyRow: {
      flexDirection: 'row',
      marginTop: 8,
    },
    fishVerifyBtn: {
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    fishVerifyText: {
      fontFamily: FONT.mono,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  } as const);
