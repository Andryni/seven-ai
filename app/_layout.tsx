import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareIntentProvider } from 'expo-share-intent';
import { useSevenStore } from '../src/store/useSevenStore';
import { fileOrganizer } from '../src/services/fileOrganizer';
import { ThemeProvider, PALETTES } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { installWebFonts, NATIVE_FONT_MAP } from '../src/theme/typography';
import { SandboxExecutorHost } from '../src/components/SandboxExecutorHost';
import { LaunchSplash } from '../src/components/LaunchSplash';

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
  const uiMode = useSevenStore((s) => s.config.uiMode ?? 'dark');

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
          <Stack.Screen name="settings" />
        </Stack>
      </View>

      {/* Offscreen JS sandbox host (Hermes-safe code execution). No-op on web. */}
      <SandboxExecutorHost />

      {/* Animated boot sequence shown on every cold launch. */}
      {showSplash && <LaunchSplash onFinish={() => setShowSplash(false)} />}
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
