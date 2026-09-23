// The probe is a CommonJS script shipped outside the app bundle; loading it with
// require() is what lets this test run it against captured dump shapes.
/* eslint-disable @typescript-eslint/no-require-imports */
const probe = require('../scripts/lib/font-scale-probe.cjs');
/* eslint-enable @typescript-eslint/no-require-imports */

const {
  classifyRatio,
  expectedRatios,
  pairTextHeights,
  parseUiDump,
  summarizeRatios,
} = probe as {
  classifyRatio: (
    ratio: number,
    options: { lowScale: number; highScale: number; cap: number; tolerance?: number }
  ) => { verdict: string; ratio: number; expected: { capped: number; uncapped: number } };
  expectedRatios: (low: number, high: number, cap: number) => { capped: number; uncapped: number };
  pairTextHeights: (
    low: string,
    high: string,
    filter?: RegExp
  ) => { text: string; low: number; high: number; ratio: number }[];
  parseUiDump: (xml: string) => {
    text: string;
    contentDesc: string;
    height: number;
    width: number;
  }[];
  summarizeRatios: (
    pairs: { ratio: number }[],
    minRatio?: number
  ) => { paired: number; scalingCount: number; median: number; p10: number; p90: number };
};

/** A node as uiautomator writes it: attributes in one blob, bounds in pixels. */
const node = (attrs: string) => `<node ${attrs} />`;

const dump = (nodes: string[]) =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<hierarchy rotation="0">\n${nodes
    .map((n) => `  ${n}`)
    .join('\n')}\n</hierarchy>`;

const textNode = (text: string, height: number, top = 100) =>
  node(
    `index="0" text="${text}" resource-id="" class="android.widget.TextView" package="com.seven.ai" content-desc="" bounds="[40,${top}][400,${
      top + height
    }]"`
  );

describe('parseUiDump', () => {
  it('reads text, content-desc and pixel box of every node', () => {
    const nodes = parseUiDump(
      dump([
        textNode('SYSTEMS NOMINAL', 28),
        node(
          'index="1" text="" class="android.view.ViewGroup" package="com.seven.ai" content-desc="Active brain: GEMINI" bounds="[16,600][240,626]"'
        ),
      ])
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ text: 'SYSTEMS NOMINAL', height: 28, width: 360 });
    expect(nodes[1]).toMatchObject({ text: '', contentDesc: 'Active brain: GEMINI', height: 26 });
  });

  it('survives a node without bounds instead of throwing', () => {
    const nodes = parseUiDump(dump([node('index="0" text="X" class="android.widget.TextView"')]));
    expect(nodes[0].height).toBe(0);
    expect(nodes[0].bounds).toBeNull();
  });
});

describe('pairTextHeights', () => {
  const lowDump = dump([textNode('IDLE', 18), textNode('MODULES', 27), textNode('10:30', 20, 400)]);
  // 1.3x of the capped scale for the real labels; the clock is a fixed-height box.
  const highDump = dump([
    textNode('IDLE', 26),
    textNode('MODULES', 39),
    textNode('11:45', 20, 400),
  ]);

  it('pairs identical strings and reports their ratio', () => {
    const pairs = pairTextHeights(lowDump, highDump);
    expect(pairs.map((p) => p.text)).toEqual(['IDLE', 'MODULES']);
    expect(pairs[0].ratio).toBeCloseTo(1.444, 2);
  });

  it('drops strings that only exist in one of the dumps', () => {
    const pairs = pairTextHeights(lowDump, highDump);
    expect(pairs.some((p) => /1[01]:\d\d/.test(p.text))).toBe(false);
  });

  it('can focus on a single label', () => {
    const pairs = pairTextHeights(lowDump, highDump, /^MODULES$/);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].high).toBe(39);
  });
});

describe('summarizeRatios', () => {
  it('ignores boxes that did not scale, which carry no information', () => {
    const summary = summarizeRatios([
      { ratio: 1.444 },
      { ratio: 1.44 },
      { ratio: 1.0 },
      { ratio: 1.0 },
    ]);
    expect(summary.paired).toBe(4);
    expect(summary.scalingCount).toBe(2);
    expect(summary.median).toBeCloseTo(1.442, 3);
  });

  it('reports nothing (median 0) when no text scaled at all', () => {
    const summary = summarizeRatios([{ ratio: 1.0 }, { ratio: 1.0 }]);
    expect(summary.scalingCount).toBe(0);
    expect(summary.median).toBe(0);
  });
});

describe('expectedRatios', () => {
  it('is 1.3/0.9 with the cap and 1.6/0.9 without it', () => {
    const { capped, uncapped } = expectedRatios(0.9, 1.6, 1.3);
    expect(capped).toBeCloseTo(1.444, 3);
    expect(uncapped).toBeCloseTo(1.778, 3);
  });

  it('does not clamp a low scale that is already under the cap', () => {
    expect(expectedRatios(1.0, 1.3, 1.3).capped).toBeCloseTo(1.3, 3);
  });
});

describe('classifyRatio', () => {
  const options = { lowScale: 0.9, highScale: 1.6, cap: 1.3 };

  it('calls a capped measurement capped', () => {
    expect(classifyRatio(1.44, options).verdict).toBe('capped');
  });

  it('calls an uncapped measurement uncapped', () => {
    expect(classifyRatio(1.78, options).verdict).toBe('uncapped');
  });

  it('refuses to claim a pass for a value between the two hypotheses', () => {
    // 1.61 is the midpoint: it cannot distinguish the two, so it must not pass.
    expect(classifyRatio(1.61, options).verdict).toBe('inconclusive');
  });

  it('reports how far the measurement is from each hypothesis', () => {
    const result = classifyRatio(1.45, options);
    expect(result.toCapped).toBeLessThan(result.toUncapped);
    expect(result.expected.capped).toBeCloseTo(1.444, 3);
  });
});
