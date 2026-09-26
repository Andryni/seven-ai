import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareIntentProvider } from '../src/services/shareIntentAdapter';
import { useSevenStore } from '../src/store/useSevenStore';
import { useWidgetRefresh } from '../src/hooks/useWidgetRefresh';
import { fileOrganizer } from '../src/services/fileOrganizer';
import { routineService } from '../src/services/routineService';
import { installNotificationHandler } from '../src/services/notificationPresentation';
import { getNotificationsModule } from '../src/services/notificationsAdapter';
import { operationService } from '../src/services/operationService';
import { autonomousCoreService } from '../src/services/autonomousCoreService';
import { ThemeProvider, PALETTES } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { useResolvedUiMode } from '../src/hooks/useResolvedUiMode';
import { installWebFonts, NATIVE_FONT_MAP } from '../src/theme/typography';
import { SandboxExecutorHost } from '../src/components/SandboxExecutorHost';
import { LaunchSplash } from '../src/components/LaunchSplash';
import { AppLockScreen } from '../src/components/AppLockScreen';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { useAppLock } from '../src/hooks/useAppLock';
import { useConditionalRoutines } from '../src/hooks/useConditionalRoutines';

// NOTE: the OS font-scaling cap (maxFontSizeMultiplier) is no longer installed
// here. React 19 removed defaultProps for function components and no longer
// folds it for RN host components either, so a runtime patch of
// `Text.defaultProps` silently did nothing on device. The cap is now applied
// at Metro module resolution instead — a shim re-exports react-native with
// Text/TextInput wrapped to inject the cap (see metro.config.js and
// src/theme/fontScaling.ts for the full story).

// Routines and briefings are reminders: without an installed handler,
// expo-notifications shows nothing at all while the app is foregrounded, so a
// routine firing on an open app used to be invisible. Module scope installs the
// policy exactly once per process, before anything can schedule a notification.
installNotificationHandler();
void operationService.initialize();
void autonomousCoreService.initialize();

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
  const language = useSevenStore((s) => s.config.language ?? 'en');
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
    loadSavedConfig().then(() => {
      // Only meaningful once the persisted routines are in the store: the OS
      // scheduler loses scheduled notifications on reinstall/cleared data/
      // force-stop, and routines saved while notification permission was
      // denied never got armed in the first place. Re-arming is silent (no
      // permission prompt at startup).
      routineService.rescheduleAll().catch(() => {});
    });
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
  // one notification: `handleNotificationResponse` is idempotent per tap
  // (persisted stamp on the routine) and clears the OS "last response" slot
  // after processing, so a cold launch no longer replays yesterday's tap
  // over and over.
  useEffect(() => {
    const notifications = getNotificationsModule();
    if (!notifications) return;

    const runFromResponse = (response: import('expo-notifications').NotificationResponse | null) => {
      const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
      routineService.handleNotificationResponse(data, response).then(({ ran, outcome }) => {
        if (ran && outcome) {
          useSevenStore.getState().addTerminalLog(`ROUTINE: ${outcome}`, 'success');
        }
      });
    };

    notifications.getLastNotificationResponseAsync().then(runFromResponse);
    const subscription = notifications.addNotificationResponseReceivedListener(runFromResponse);
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
          <AppErrorBoundary palette={palette} language={language}>
            <RootFrame palette={palette} />
          </AppErrorBoundary>
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
  useConditionalRoutines();
  // Push a fresh glance row to the home-screen widget on every foreground —
  // Android's own 30-minute widget timer alone leaves weather/agenda stale.
  useWidgetRefresh();

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
          <Stack.Screen name="memory" />
          <Stack.Screen name="autonomy" />
          <Stack.Screen name="intelligence" />
          <Stack.Screen name="operations" />
          <Stack.Screen name="standby" />
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
