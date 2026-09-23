/**
 * Which brain answered — and how it performed.
 *
 * SEVEN has three brains (Gemini, OpenRouter as the configured second brain,
 * and the local keyword engine) and the Settings screen has long described the
 * *configuration*, but nothing on the dashboard said which one actually
 * answered a given message. When the Gemini quota ran out the agent degraded
 * silently to the keyword engine and the user only discovered it by reading
 * the terminal log afterwards.
 *
 * This module is deliberately pure: the provider is *derived* from the
 * configured keys before the first request (so the HUD is never blank), and
 * replaced by what really answered as soon as a turn completes — sevenAgent
 * writes the measurement with `setBrainTelemetry`. Keeping the formatting here
 * means the HUD readout is unit-testable without rendering anything.
 */

export type BrainProvider = 'gemini' | 'openrouter' | 'local';

/** Measurement of one completed turn, written by `sevenAgent`. */
export interface BrainTurnTelemetry {
  provider: BrainProvider;
  /** Resolved model id, e.g. "gemini-3.6-flash" / "openrouter/free". */
  model?: string;
  /** Wall-clock latency of the turn, see `latencyKind`. */
  latencyMs: number;
  /**
   * What `latencyMs` measures. Streaming answers record time-to-first-token
   * (the wait the user actually feels — the rest of the text arrives
   * progressively), buffered ones record the whole round-trip.
   */
  latencyKind: 'total' | 'first-token';
  /** Tokens billed across this turn's calls, when the provider reports them. */
  tokensIn?: number;
  tokensOut?: number;
  /** Epoch ms of the turn. */
  at: number;
}

export interface BrainReadout {
  provider: BrainProvider;
  providerLabel: string;
  modelLabel?: string;
  latencyLabel?: string;
  tokenLabel?: string;
  /** True when the numbers come from a real turn, false on the derived state. */
  measured: boolean;
}

const PROVIDER_LABELS: Record<BrainProvider, string> = {
  gemini: 'GEMINI',
  openrouter: 'OPENROUTER',
  local: 'LOCAL',
};

/**
 * Mirrors `sevenAgent`'s precedence exactly: a Gemini key wins, a configured
 * OpenRouter key is the second brain, and the keyword engine is the floor.
 * Callers pass readiness booleans (not keys) so the OpenRouter threshold stays
 * owned by `openRouterService.isConfigured` and cannot drift from it.
 */
export function deriveBrainProvider(ready: {
  geminiReady: boolean;
  openRouterReady: boolean;
}): BrainProvider {
  if (ready.geminiReady) return 'gemini';
  if (ready.openRouterReady) return 'openrouter';
  return 'local';
}

/** `gemini-3.6-flash` → `3.6-FLASH`, `openrouter/free` → `FREE`. */
export function formatModelLabel(model?: string): string | undefined {
  if (!model) return undefined;
  const tail = model.split('/').filter(Boolean).pop() || model;
  return tail.replace(/^gemini-/, '').toUpperCase();
}

/** Sub-second latencies stay in ms; beyond that seconds read better. */
export function formatLatency(ms?: number): string | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

/** Compact token counts: 812, 1.2k, 12k. */
export function formatTokenCount(count?: number): string | undefined {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return undefined;
  if (count < 1000) return String(Math.round(count));
  if (count < 10000) {
    const short = (count / 1000).toFixed(1);
    return `${short.endsWith('.0') ? short.slice(0, -2) : short}k`;
  }
  return `${Math.round(count / 1000)}k`;
}

/**
 * The HUD readout. A measured turn always wins over the derived provider: if
 * Gemini is configured but the last answer actually came from the local
 * engine, showing "GEMINI" would be a lie — which is precisely the situation
 * this readout exists to expose. It self-corrects on the next successful
 * remote turn, which overwrites the telemetry.
 */
export function buildBrainReadout(input: {
  geminiReady: boolean;
  openRouterReady: boolean;
  telemetry: BrainTurnTelemetry | null;
}): BrainReadout {
  const telemetry = input.telemetry;
  const provider = telemetry ? telemetry.provider : deriveBrainProvider(input);
  const base: BrainReadout = {
    provider,
    providerLabel: PROVIDER_LABELS[provider],
    measured: !!telemetry,
  };
  if (!telemetry) return base;

  // Billed tokens: a tool turn makes several calls (function-call pass, then
  // the phrasing pass), each billed separately, so both are reported as one
  // turn total rather than only the last call's usage.
  const hasTokens =
    typeof telemetry.tokensIn === 'number' || typeof telemetry.tokensOut === 'number';
  const total = (telemetry.tokensIn ?? 0) + (telemetry.tokensOut ?? 0);

  return {
    ...base,
    modelLabel: formatModelLabel(telemetry.model),
    latencyLabel: formatLatency(telemetry.latencyMs),
    tokenLabel: hasTokens ? formatTokenCount(total) : undefined,
  };
}
