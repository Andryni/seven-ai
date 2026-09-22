import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

/**
 * The type system.
 *
 * Every screen declared its own generic monospace family — 231 declarations
 * across 23 files — with no scale and no roles. That is why the interface read
 * as a "generic AI demo": one face for a clock, a button, a caption and a log
 * line gives the eye nowhere to land, and `monospace` resolves to whatever the
 * platform happens to have (Courier, DejaVu…).
 *
 * Three faces, three jobs, borrowed from instrument-panel practice:
 *   display — Orbitron. Geometric, wide, engineered. Headings, clock, brand.
 *             Never for body copy: it has no lowercase rhythm at small sizes.
 *   ui      — Rajdhani. Condensed technical sans. Labels, buttons, prose.
 *             Tall x-height keeps 9–11 px legible.
 *   mono    — JetBrains Mono. Telemetry, logs, ids, numbers. Fixed advance
 *             makes readings comparable column to column.
 *
 * Hybrid delivery: on web the families are injected as Google Fonts (no bundle
 * weight, `font-display: swap`); on native we map each job to the closest face
 * the OS already ships, so nothing looks accidental if custom fonts are not
 * linked yet.
 */

const isWeb = Platform.OS === 'web';

/**
 * Native faces, bundled through @expo-google-fonts and registered once in
 * `app/_layout.tsx` with `useFonts`. The fontFamily strings below are resolved
 * by the native text renderer at draw time, so a module-scope StyleSheet
 * picks them up as soon as they are registered — no restyle needed.
 *
 * These are the real faces, not stand-ins: this is what replaces the
 * platform `sans-serif` / `monospace` defaults that made the interface look
 * generic.
 */
export const FONT = {
  display: isWeb ? '"Orbitron", "Rajdhani", system-ui, sans-serif' : 'Orbitron_700Bold',
  ui: isWeb ? '"Rajdhani", "Inter", system-ui, sans-serif' : 'Rajdhani_400Regular',
  uiMedium: isWeb ? '"Rajdhani", "Inter", system-ui, sans-serif' : 'Rajdhani_700Bold',
  mono: isWeb ? '"JetBrains Mono", ui-monospace, monospace' : 'JetBrainsMono_400Regular',
  monoBold: isWeb ? '"JetBrains Mono", ui-monospace, monospace' : 'JetBrainsMono_700Bold',
} as const;

/**
 * The exact faces registered in the root layout. Keep in sync with FONT:
 * any family referenced here must be loaded before the first paint, or text
 * silently falls back to the platform default.
 */
/**
 * The exact faces registered in the root layout. Bundled as .ttf assets under
 * `assets/fonts` (copied from Google Fonts, OFL-licensed) rather than npm
 * packages: an asset is JS-side, so adding one does not change the native
 * fingerprint and stays deliverable by OTA.
 */
export const NATIVE_FONT_MAP = {
  Orbitron_700Bold: require('../../assets/fonts/Orbitron_700Bold.ttf'),
  Rajdhani_400Regular: require('../../assets/fonts/Rajdhani_400Regular.ttf'),
  Rajdhani_700Bold: require('../../assets/fonts/Rajdhani_700Bold.ttf'),
  JetBrainsMono_400Regular: require('../../assets/fonts/JetBrainsMono_400Regular.ttf'),
  JetBrainsMono_700Bold: require('../../assets/fonts/JetBrainsMono_700Bold.ttf'),
} as const;

/** Font families for the CSS injector — keep in sync with FONT above. */
export const WEB_FONT_FAMILIES = ['Orbitron', 'Rajdhani', 'JetBrains Mono'] as const;

/**
 * Injects the three families on web. Runs once from the root layout; the
 * stylesheet is injected before first paint in practice, and swaps in if it
 * is not, so text is never invisible (Google serves these with
 * `font-display: swap`).
 */
export const installWebFonts = () => {
  if (!isWeb || typeof document === 'undefined') return;
  if (document.getElementById('seven-fonts')) return;

  const families =
    'family=Orbitron:wght@500;700;900' +
    '&family=Rajdhani:wght@400;500;600;700' +
    '&family=JetBrains+Mono:wght@400;500;700';

  const link = document.createElement('link');
  link.id = 'seven-fonts';
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);

  // Warm the connection early: the CSS and the woff2 files are on two hosts.
  ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].forEach((href) => {
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = href;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
  });
};

/**
 * Named roles instead of magic sizes. `data` and `metric` carry tabular
 * numerals: a clock that jitters, or a column of percentages that changes
 * width as it counts, reads as broken.
 */
export const TYPE = {
  /** Screen-defining numbers: the dock clock, big readouts. */
  hero: {
    fontFamily: FONT.display,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  /** Page titles and the brand mark. */
  title: {
    fontFamily: FONT.display,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  /** Section headings above a block of content. */
  section: {
    fontFamily: FONT.uiMedium,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  /** Field labels, chip text, button captions. */
  label: {
    fontFamily: FONT.uiMedium,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  /** Readable prose: assistant answers, descriptions, hints. */
  body: {
    fontFamily: FONT.ui,
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.25,
    lineHeight: 19,
  },
  /** Secondary prose, one step down. */
  caption: {
    fontFamily: FONT.ui,
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  /** Telemetry, ids, log lines, code. */
  data: {
    fontFamily: FONT.mono,
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  /** Numbers that must not reflow as they change. */
  metric: {
    fontFamily: FONT.monoBold,
    fontSize: 11,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  /** The smallest tier: overline labels, disclaimers. */
  micro: {
    fontFamily: FONT.ui,
    fontSize: 8.5,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
} as const satisfies Record<string, TextStyle>;

/** Fixed-width digits. Exported as a reference because inside an `as const`
 *  StyleSheet a literal array would be readonly and rejected by TextStyle. */
export const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

export type TypeRole = keyof typeof TYPE;

/** `font(role, overrides)` — spread into a StyleSheet entry. */
export const font = (role: TypeRole, overrides?: TextStyle): TextStyle => ({
  ...TYPE[role],
  ...overrides,
});
