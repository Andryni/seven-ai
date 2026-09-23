import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { FONT } from '../theme/typography';
import { t } from '../theme/i18n';
import { haptics } from '../services/hapticsService';

interface AppLockScreenProps {
  onUnlock: (promptMessage: string, cancelLabel: string) => Promise<boolean>;
  language: 'fr' | 'en';
}

/**
 * Full-screen overlay shown whenever `useAppLock` says the app is locked.
 * Mounted above everything else in `_layout.tsx` (same tier as
 * `LaunchSplash`), so nothing behind it — chat history, API keys, the
 * dashboard — is ever visible until authentication succeeds.
 *
 * Prompts automatically on mount (the whole point is to not require an
 * extra tap most of the time) but always leaves a manual retry button for
 * when the user dismissed the OS sheet or it failed.
 */
export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock, language }) => {
  const palette = useTheme();
  const styles = useThemeStyles(lockStyles);
  const [failed, setFailed] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const attempt = useCallback(async () => {
    setAuthenticating(true);
    setFailed(false);
    const success = await onUnlock(t('applock.prompt', language), t('common.cancel', language));
    setAuthenticating(false);
    if (!success) {
      setFailed(true);
      haptics.warning();
    }
  }, [onUnlock, language]);

  useEffect(() => {
    // Deferred a tick so the very first paint (icon + title) lands before the
    // OS auth sheet steals focus, and so the state updates inside `attempt`
    // land in their own commit rather than synchronously inside this effect.
    const timer = setTimeout(() => {
      attempt();
    }, 0);
    return () => clearTimeout(timer);
    // Only ever auto-prompt once per mount (i.e. once per lock event) — a
    // dependency on `attempt` would re-fire the OS sheet on every re-render,
    // since `attempt` is recreated whenever `failed`/`authenticating` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: palette.bgDeep }]}>
      <View style={[styles.iconRing, { borderColor: palette.accent }]}>
        <Fingerprint size={40} color={palette.accent} />
      </View>
      <Text style={styles.title}>{t('applock.title', language)}</Text>
      <Text style={styles.subtitle}>{t('applock.subtitle', language)}</Text>
      {failed && <Text style={styles.error}>{t('applock.failed', language)}</Text>}
      <TouchableOpacity
        style={[styles.unlockBtn, { backgroundColor: palette.accent }]}
        onPress={attempt}
        disabled={authenticating}
        accessibilityRole="button"
        accessibilityLabel={t('applock.unlock', language)}
      >
        <Text style={[styles.unlockBtnText, { color: palette.bgDeep }]}>
          {t('applock.unlock', language)}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const lockStyles = (t: Palette) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10000,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    iconRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 3,
    },
    subtitle: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 11,
      letterSpacing: 1,
      marginTop: 8,
    },
    error: {
      fontFamily: FONT.mono,
      color: t.error,
      fontSize: 10,
      letterSpacing: 0.5,
      marginTop: 16,
      textAlign: 'center',
    },
    unlockBtn: {
      marginTop: 28,
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 8,
    },
    unlockBtnText: {
      fontFamily: FONT.mono,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 2,
    },
  });
