/**
 * Static SVG path/landmark constants for the Gideon head, split out of
 * `GideonAvatar.tsx` (which had grown past 1400 lines). These are fixed
 * geometry — they never depend on props or state — so they were being
 * recomputed on every render for no reason; hoisting them to module scope
 * both trims the component and avoids that needless per-render work.
 */

export const HEAD_PATH =
  'M 100 22 C 84 22 70 29 63 42 C 58 51 56 60 56 70 C 56 79 55 87 55 94 ' +
  'C 55 102 57 110 61 118 C 65 126 71 133 79 139 C 85 144 92 149 100 149 ' +
  'C 108 149 115 144 121 139 C 129 133 135 126 139 118 C 143 110 145 102 145 94 ' +
  'C 145 87 144 79 144 70 C 144 60 142 51 137 42 C 130 29 116 22 100 22 Z';

export const NECK_PATH = 'M 82 138 C 82 150 80 158 76 167 L 124 167 C 120 158 118 150 118 138 Z';

export const BUST_PATH = 'M 30 200 C 30 180 60 167 100 167 C 140 167 170 180 170 200 Z';

export const COLUMN_PATH = 'M 88 152 L 112 152 L 146 200 L 54 200 Z';

export const SCAN_LINES: number[] = Array.from({ length: 15 }, (_, i) => 30 + i * 8);

export const LANDMARKS: [number, number][] = [
  [100, 22],
  [100, 44],
  [81.6, 86],
  [118.4, 86],
  [100, 107],
  [93.5, 114.5],
  [106.5, 114.5],
  [100, 132],
  [86, 132],
  [114, 132],
  [100, 150],
  [55, 94],
  [145, 94],
  [44, 92],
  [156, 92],
  [62, 118],
  [138, 118],
  [100, 168],
];
