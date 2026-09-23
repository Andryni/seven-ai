/**
 * Pure helpers behind the on-device font-cap check (`scripts/device-acceptance.cjs`).
 *
 * The question the check has to answer is narrow and objective: when the OS font
 * scale grows, does our text grow *less* than the system asked? The app caps it
 * at 1.3 through the Metro shim (see src/theme/fontScaling.ts), so the measured
 * ratio between two font scales must land near `min(high, cap) / min(low, cap)`
 * rather than `high / low`.
 *
 * Measuring the same *strings* at both scales removes every other source of
 * variance (different base sizes, different widgets on screen), which is why
 * the logic below pairs nodes by text instead of comparing aggregates.
 */

/** Attributes of one `<node …>` element of a uiautomator dump. */
function readAttr(attributeBlob, name) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attributeBlob);
  return match ? match[1] : '';
}

/**
 * Parses the XML produced by `uiautomator dump`. Deliberately regex-based: the
 * dump is a flat list of self-closing `<node>` elements with a fixed attribute
 * shape, and the check must run with no extra dependency on the device machine.
 */
function parseUiDump(xml) {
  const nodes = [];
  const nodeRe = /<node\b([^>]*?)\/?>/g;
  let match;
  while ((match = nodeRe.exec(xml)) !== null) {
    const attributes = match[1];
    const bounds = /bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"/.exec(attributes);
    const node = {
      text: readAttr(attributes, 'text'),
      contentDesc: readAttr(attributes, 'content-desc'),
      resourceId: readAttr(attributes, 'resource-id'),
      className: readAttr(attributes, 'class'),
      packageName: readAttr(attributes, 'package'),
    };
    if (bounds) {
      node.bounds = { x1: +bounds[1], y1: +bounds[2], x2: +bounds[3], y2: +bounds[4] };
      node.width = node.bounds.x2 - node.bounds.x1;
      node.height = node.bounds.y2 - node.bounds.y1;
    } else {
      node.bounds = null;
      node.width = 0;
      node.height = 0;
    }
    nodes.push(node);
  }
  return nodes;
}

/** Text nodes that carry a measurable box (what the OS actually painted). */
function measurableTextNodes(nodes, filter) {
  return nodes.filter(
    (node) =>
      node.height > 0 &&
      node.width > 0 &&
      node.text.trim().length > 0 &&
      (!filter || filter.test(node.text))
  );
}

/** Accepts either raw dump XML or an already parsed node list. */
function asNodes(value) {
  return typeof value === 'string' ? parseUiDump(value) : value;
}

/**
 * Pairs the same string across two dumps and returns its height ratio.
 * Strings that only exist in one dump (a timestamp, a percentage) are dropped
 * rather than guessed at.
 */
function pairTextHeights(lowDump, highDump, filter) {
  const nodesLow = asNodes(lowDump);
  const nodesHigh = asNodes(highDump);
  const byText = new Map();
  for (const node of measurableTextNodes(nodesLow, filter)) {
    if (!byText.has(node.text)) byText.set(node.text, []);
    byText.get(node.text).push(node.height);
  }

  const pairs = [];
  for (const node of measurableTextNodes(nodesHigh, filter)) {
    const low = byText.get(node.text);
    if (!low || !low.length) continue;
    // Same text can legitimately appear twice (two tiles with the same label):
    // compare like with like by taking the first measurement of each dump.
    const ratio = node.height / low[0];
    pairs.push({ text: node.text, low: low[0], high: node.height, ratio });
  }
  return pairs;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

/**
 * Only nodes that actually grew carry information: a fixed-height box (a tile
 * with a pinned size, an icon label) stays identical at both scales and would
 * drag the median towards 1.0.
 */
function summarizeRatios(pairs, minRatio = 1.02) {
  const scaling = pairs.filter((pair) => pair.ratio >= minRatio).map((pair) => pair.ratio);
  const all = pairs.map((pair) => pair.ratio);
  return {
    paired: pairs.length,
    scalingCount: scaling.length,
    scaled: scaling,
    median: median(scaling),
    p10: percentile(scaling, 10),
    p90: percentile(scaling, 90),
    minAll: all.length ? Math.min(...all) : 0,
    maxAll: all.length ? Math.max(...all) : 0,
  };
}

/** What the ratio should be, with and without the cap. */
function expectedRatios(lowScale, highScale, cap) {
  return {
    capped: Math.min(highScale, cap) / Math.min(lowScale, cap),
    uncapped: highScale / lowScale,
  };
}

/**
 * The verdict. Anything between the two hypotheses is reported as inconclusive
 * rather than rounded towards the answer we are hoping for — a measurement that
 * cannot distinguish capped from uncapped must not claim a pass.
 */
function classifyRatio(ratio, { lowScale, highScale, cap, tolerance = 0.08 }) {
  const expected = expectedRatios(lowScale, highScale, cap);
  const toCapped = Math.abs(ratio - expected.capped);
  const toUncapped = Math.abs(ratio - expected.uncapped);

  let verdict = 'inconclusive';
  if (toCapped <= tolerance && toCapped < toUncapped) verdict = 'capped';
  else if (toUncapped <= tolerance && toUncapped < toCapped) verdict = 'uncapped';

  return { verdict, ratio, expected, toCapped, toUncapped };
}

module.exports = {
  classifyRatio,
  expectedRatios,
  measurableTextNodes,
  median,
  pairTextHeights,
  parseUiDump,
  percentile,
  summarizeRatios,
};
