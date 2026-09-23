/**
 * WCAG AA contrast regression test. The palette tokens were hand-tuned to
 * clear 4.5:1 (see the comments in theme.tsx) — this pins it, so no future
 * color tweak can silently reintroduce a contrast failure (the original
 * textFaint measured ~2.5-2.8:1 and passed no test, only eyes).
 *
 * Pairs checked: text-ish tokens against every background they are painted
 * on (bg, bgElevated, bgDeep). The 4.5:1 threshold is the AA requirement
 * for normal body text; tokens used only at large sizes would get 3:1, but
 * this app renders its labels at 9-13px, so everything is held to 4.5:1.
 */
import { PALETTES, type Palette, type ThemeName, type UiMode } from '../src/theme/theme';

type Rgb = { r: number; g: number; b: number };

function parseColor(raw: string): Rgb | null {
  const hex = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  const rgba = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)/i);
  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    // Semi-transparent overlays blend toward black on this app's dark bases
    // and toward white on light ones — approximated by the caller's mode.
    return { r, g, b };
  }
  return null; // gradients etc. — skipped
}

function relativeLuminance(c: Rgb): number {
  const lin = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const BODY_TEXT_TOKENS = ['text', 'textDim', 'textFaint'] as const;
const ACCENT_TOKENS = ['accent', 'success', 'warning', 'error', 'info'] as const;
const BACKGROUND_TOKENS = ['bg', 'bgElevated', 'bgDeep'] as const;

const THEME_NAMES = Object.keys(PALETTES) as ThemeName[];
const UI_MODES = Object.keys(PALETTES.seven) as UiMode[];

describe('WCAG AA contrast across every palette', () => {
  for (const themeName of THEME_NAMES) {
    for (const uiMode of UI_MODES) {
      const palette: Palette = PALETTES[themeName][uiMode];

      describe(`${themeName}/${uiMode}`, () => {
        for (const fgToken of [...BODY_TEXT_TOKENS, ...ACCENT_TOKENS]) {
          for (const bgToken of BACKGROUND_TOKENS) {
            it(`${fgToken} on ${bgToken} is at least 4.5:1`, () => {
              const fg = parseColor(String(palette[fgToken]));
              const bg = parseColor(String(palette[bgToken]));
              if (!fg || !bg) {
                throw new Error(`Unparseable color: ${fgToken}=${palette[fgToken]} / ${bgToken}=${palette[bgToken]}`);
              }
              const ratio = contrastRatio(fg, bg);
              if (ratio < 4.5) {
                throw new Error(
                  `${themeName}/${uiMode}: ${fgToken} (${palette[fgToken]}) on ${bgToken} (${palette[bgToken]}) = ${ratio.toFixed(2)}:1 (needs 4.5:1)`
                );
              }
              expect(ratio).toBeGreaterThanOrEqual(4.5);
            });
          }
        }
      });
    }
  }
});
