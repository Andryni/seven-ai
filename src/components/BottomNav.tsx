import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  LayoutGrid,
  MessageSquare,
  History,
  Code2,
  FolderSync,
  Settings,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSevenStore } from '../store/useSevenStore';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { t } from '../theme/i18n';
import { FONT } from '../theme/typography';
import { haptics } from '../services/hapticsService';
import { TapScale } from './TapScale';

/** `key` is the screen identity, `route` where a tap lands. */
export const NAV_TABS = [
  { key: 'dashboard', route: '/', labelKey: 'nav.dashboard', Icon: LayoutGrid },
  { key: 'chat', route: '/chat', labelKey: 'nav.chat', Icon: MessageSquare },
  { key: 'history', route: '/history', labelKey: 'nav.history', Icon: History },
  { key: 'dave', route: '/dave', labelKey: 'nav.dave', Icon: Code2 },
  { key: 'organizer', route: '/organizer', labelKey: 'nav.organizer', Icon: FolderSync },
  { key: 'settings', route: '/settings', labelKey: 'nav.settings', Icon: Settings },
] as const;

export type NavKey = (typeof NAV_TABS)[number]['key'];

interface Props {
  /** Which tab is the screen you are looking at. */
  active: NavKey;
  /** Chat can sit above the bar; the deck and modals should not. */
  translucent?: boolean;
}

/**
 * Single tab bar for the whole app.
 *
 * The dashboard used to own the only copy, which left every other screen —
 * chat, history, the agents, settings — with no way back except the hardware
 * back button. One component means one place to keep the labels localized, the
 * safe-area inset correct, and the motion consistent.
 *
 * The indicator is a single absolutely-positioned bar that springs to the
 * active tab, rather than a border that materialises under whichever label is
 * selected: the travel is what makes the switch read as movement.
 */
export const BottomNav: React.FC<Props> = ({ active, translucent = false }) => {
  const router = useRouter();
  const pathname = usePathname();
  const config = useSevenStore((s) => s.config);
  const palette = useTheme();
  const styles = useThemeStyles(navStyles);
  const insets = useSafeAreaInsets();

  // Route truth wins over the legacy `active` hint. Several secondary screens
  // historically passed `dashboard`, which disabled the Dashboard button even
  // though the user was on /memory, /routines or /operations.
  const routeIndex = NAV_TABS.findIndex((tab) => tab.route === pathname);
  const hintedIndex = NAV_TABS.findIndex((tab) => tab.key === active);
  const activeIndex = routeIndex >= 0 ? routeIndex : hintedIndex >= 0 && active !== 'dashboard' ? hintedIndex : -1;
  const [barWidth, setBarWidth] = useState(0);

  // Fractional index → one spring to the right slot. Fractional so the bar
  // keeps its place when the bar is measured a second time after a rotation.
  const slide = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: Math.max(0, activeIndex),
      friction: 9,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [slide, activeIndex]);

  const slot = barWidth > 0 ? barWidth / NAV_TABS.length : 0;
  const translateX = slide.interpolate({
    inputRange: [0, Math.max(1, NAV_TABS.length - 1)],
    // Half a slot of margin centres the bar under its label.
    outputRange: [slot * 0.25, slot * (NAV_TABS.length - 0.75)],
    extrapolate: 'clamp',
  });

  const language = config.language ?? 'en';

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: translucent ? 'rgba(3,6,10,0.92)' : palette.bgDeep,
          paddingBottom: Math.max(insets.bottom, 6),
        },
      ]}
    >
      {barWidth > 0 && activeIndex >= 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: slot * 0.5, backgroundColor: palette.accent, transform: [{ translateX }] },
          ]}
        />
      )}

      <View style={styles.row} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
        {NAV_TABS.map((tab) => {
          const isActive = tab.route === pathname;
          const color = isActive ? palette.accent : palette.textFaint;
          return (
            <TapScale
              key={tab.key}
              scaleTo={0.9}
              accessibilityLabel={t(tab.labelKey, language)}
              style={styles.tab}
              onPress={() => {
                if (isActive) return;
                haptics.light();
                router.replace(tab.route as never);
              }}
            >
              <Animated.View style={{ transform: [{ scale: isActive ? 1.06 : 1 }] }}>
                <tab.Icon size={13} color={color} />
              </Animated.View>
              <Text numberOfLines={1} style={[styles.label, { color }]}>
                {t(tab.labelKey, language)}
              </Text>
            </TapScale>
          );
        })}
      </View>
    </View>
  );
};

const navStyles = (t: Palette) =>
  ({
    wrap: {
      borderTopWidth: 1,
      borderTopColor: t.border,
      paddingTop: 6,
    },
    indicator: {
      position: 'absolute',
      top: 0,
      left: 0,
      height: 2,
      borderRadius: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 3,
    },
    label: {
      fontFamily: FONT.mono,
      fontSize: 8.5,
      fontWeight: '700',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
  } as const);

/** Tiny helper for screens that only need the entrance motion. */
export const navEase = Easing.out(Easing.cubic);
