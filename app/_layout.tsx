import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareIntentProvider } from 'expo-share-intent';
import { useSevenStore } from '../src/store/useSevenStore';
import { fileOrganizer } from '../src/services/fileOrganizer';
import { routineService } from '../src/services/routineService';
import { ThemeProvider, PALETTES } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { useResolvedUiMode } from '../src/hooks/useResolvedUiMode';
import { installWebFonts, NATIVE_FONT_MAP } from '../src/theme/typography';
import { installFontScalingCaps } from '../src/theme/fontScaling';
import { SandboxExecutorHost } from '../src/components/SandboxExecutorHost';
import { LaunchSplash } from '../src/components/LaunchSplash';
import { AppLockScreen } from '../src/components/AppLockScreen';
import { useAppLock } from '../src/hooks/useAppLock';

// Cap OS-driven font scaling app-wide before first paint. Module scope (not
// inside the component) so it runs exactly once per process, the same way
// `Text.defaultProps` itself only needs to be set once — re-running it on
// every RootLayout render/re-mount would be harmless (it's idempotent) but
// pointless.
installFontScalingCaps();

const PUBLIC_ROUTES = ['/onboarding'];

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  // Register the real faces (Orbitron / Rajdhani / JetBrains Mono) before the
  // first paint. fontFamily strings resolve at draw time, so gating the tree
  // here is what makes every module-scope stylesheet render with them.
  const [fontsLoaded] = useFonts(NATIVE_FONT_MAP);
  const loadSavedConfig = useSevenStore((s) => s.loadSavedConfig);
  const isInitialized = useSevenStore((s) => s.isInitialized);
  const isConfigured = useSevenStore((s) => s.config.isConfigured);
  const themeName = useSevenStore((s) => s.config.theme ?? 'seven');
  // Resolves 'auto' against the live OS appearance setting; 'dark'/'light'
  // pin it. Kept out of the store itself so the app never has to persist
  // "what dark/light currently means" — only the user's actual preference.
  const configuredUiMode = useSevenStore((s) => s.config.uiMode ?? 'dark');
  const uiMode = useResolvedUiMode(configuredUiMode);

  useEffect(() => {
    // Web gets the display/ui/mono families from Google Fonts; native maps each
    // role to a face the OS already ships (see theme/typography.ts).
    installWebFonts();
    loadSavedConfig();
    // Prepare downloads demo environment
    fileOrganizer.ensureDownloadsFolder().catch(() => {});
    // One line in logcat saying which bundle is actually running: the only way
    // to tell an over-the-air update apart from the APK-embedded one.
    if (Platform.OS !== 'web' && Updates.isEnabled) {
      console.log(
        `[ota] source=${Updates.isEmbeddedLaunch ? 'embedded' : 'ota'} ` +
          `updateId=${Updates.updateId ?? 'none'} ` +
          `runtime=${Updates.runtimeVersion ?? 'none'} ` +
          `channel=${Updates.channel ?? 'none'}`
      );
    }
  }, [loadSavedConfig]);

  // Automation routines fire as OS local notifications (see routineService);
  // tapping one — or the app simply being cold-launched by the OS from it —
  // is what actually runs the routine's action. Both the live listener
  // (app already running) and the last-response check (app was launched by
  // the tap) funnel into the same handler so a routine never runs twice for
  // one notification.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const runFromResponse = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
      routineService.handleNotificationResponse(data).then(({ ran, outcome }) => {
        if (ran && outcome) {
          useSevenStore.getState().addTerminalLog(`ROUTINE: ${outcome}`, 'success');
        }
      });
    };

    Notifications.getLastNotificationResponseAsync().then(runFromResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener(runFromResponse);
    return () => subscription.remove();
  }, []);

  // Redirect to onboarding until the assistant has been configured
  useEffect(() => {
    if (!isInitialized) return;
    if (!isConfigured && !PUBLIC_ROUTES.includes(pathname)) {
      router.replace('/onboarding');
    }
  }, [isInitialized, isConfigured, pathname, router]);

  const palette = PALETTES[themeName][uiMode];

  // Fonts are bundled (not fetched), so this gate is a few frames at worst —
  // and the splash animation covers it. Rendering before they are registered
  // would draw the first screens with system fallbacks.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: palette.bg }} />;
  }

  return (
    <ShareIntentProvider
      options={{
        // A background share intent (the OS opening SEVEN from another
        // app's "Share ->" menu) is meaningfully different from the user
        // just switching apps and back — resetting on background would
        // wipe it before the chat screen ever gets to read it.
        resetOnBackground: false,
      }}
    >
      <ThemeProvider themeName={themeName} uiMode={uiMode}>
        <SafeAreaProvider>
          <RootFrame palette={palette} />
        </SafeAreaProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}

/**
 * Everything that needs the real window insets.
 *
 * The status bar inset is applied once, here, for the whole app. Previously no
 * screen accounted for it, so every page drew its first row underneath the
 * phone's own clock/battery strip — the dashboard's brand line was literally
 * behind the system icons. Doing it at the root fixes all nine screens at once
 * and means no screen has to remember. The *bottom* inset is deliberately left
 * to whoever renders the tab bar, because only that component knows whether it
 * is even on screen.
 */
const RootFrame: React.FC<{ palette: Palette }> = ({ palette }) => {
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(true);
  const { locked, unlock } = useAppLock();
  const language = useSevenStore((s) => s.config.language ?? 'en');

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <StatusBar style={palette.isDark ? 'light' : 'dark'} />
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="history" />
          <Stack.Screen name="organizer" />
          <Stack.Screen name="dave" />
          <Stack.Screen name="research" />
          <Stack.Screen name="routines" />
          <Stack.Screen name="settings" />
        </Stack>
      </View>

      {/* Offscreen JS sandbox host (Hermes-safe code execution). No-op on web. */}
      <SandboxExecutorHost />

      {/* Animated boot sequence shown on every cold launch. */}
      {showSplash && <LaunchSplash onFinish={() => setShowSplash(false)} />}

      {/* Biometric lock, on top of the splash too: a cold launch with app
          lock enabled should never flash the dashboard before locking. */}
      {locked && <AppLockScreen onUnlock={unlock} language={language} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
});
