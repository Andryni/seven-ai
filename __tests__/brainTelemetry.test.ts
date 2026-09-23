import {
  buildBrainReadout,
  deriveBrainProvider,
  formatLatency,
  formatModelLabel,
  formatTokenCount,
  type BrainTurnTelemetry,
} from '../src/core/brainTelemetry';

const turn = (overrides: Partial<BrainTurnTelemetry> = {}): BrainTurnTelemetry => ({
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  latencyMs: 812,
  latencyKind: 'total',
  at: 1_800_000_000_000,
  ...overrides,
});

describe('deriveBrainProvider', () => {
  it('prefers Gemini, then OpenRouter, then the local engine', () => {
    expect(deriveBrainProvider({ geminiReady: true, openRouterReady: true })).toBe('gemini');
    expect(deriveBrainProvider({ geminiReady: false, openRouterReady: true })).toBe('openrouter');
    expect(deriveBrainProvider({ geminiReady: false, openRouterReady: false })).toBe('local');
  });
});

describe('formatModelLabel', () => {
  it('strips the vendor prefix and uppercases', () => {
    expect(formatModelLabel('gemini-3.6-flash')).toBe('3.6-FLASH');
    expect(formatModelLabel('openrouter/free')).toBe('FREE');
    expect(formatModelLabel('meta/llama-3.1-70b')).toBe('LLAMA-3.1-70B');
  });

  it('returns undefined without a model', () => {
    expect(formatModelLabel(undefined)).toBeUndefined();
    expect(formatModelLabel('')).toBeUndefined();
  });
});

describe('formatLatency', () => {
  it('keeps sub-second values in ms', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(812)).toBe('812ms');
    expect(formatLatency(999.6)).toBe('1000ms');
  });

  it('switches to seconds past a second', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(2400)).toBe('2.4s');
    expect(formatLatency(12_400)).toBe('12s');
  });

  it('refuses nonsense instead of printing it', () => {
    expect(formatLatency(undefined)).toBeUndefined();
    expect(formatLatency(-5)).toBeUndefined();
    expect(formatLatency(Number.NaN)).toBeUndefined();
  });
});

describe('formatTokenCount', () => {
  it('prints small counts verbatim', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(812)).toBe('812');
  });

  it('abbreviates thousands', () => {
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(1240)).toBe('1.2k');
    expect(formatTokenCount(9999)).toBe('10k');
    expect(formatTokenCount(12_400)).toBe('12k');
  });

  it('refuses nonsense instead of printing it', () => {
    expect(formatTokenCount(undefined)).toBeUndefined();
    expect(formatTokenCount(-1)).toBeUndefined();
  });
});

describe('buildBrainReadout', () => {
  it('shows the configured brain before any request has been made', () => {
    const readout = buildBrainReadout({
      geminiReady: false,
      openRouterReady: true,
      telemetry: null,
    });
    expect(readout.provider).toBe('openrouter');
    expect(readout.providerLabel).toBe('OPENROUTER');
    expect(readout.measured).toBe(false);
    // No numbers yet — inventing a latency before the first call would be a lie.
    expect(readout.latencyLabel).toBeUndefined();
    expect(readout.tokenLabel).toBeUndefined();
  });

  it('reports the measured turn, provider, model, latency and token total', () => {
    const readout = buildBrainReadout({
      geminiReady: true,
      openRouterReady: false,
      telemetry: turn({ tokensIn: 900, tokensOut: 340 }),
    });
    expect(readout).toMatchObject({
      providerLabel: 'GEMINI',
      modelLabel: '3.6-FLASH',
      latencyLabel: '812ms',
      tokenLabel: '1.2k',
      measured: true,
    });
  });

  it('shows the engine that really answered, not the configured one', () => {
    // Gemini is configured but the quota was out and the keyword engine
    // answered: saying GEMINI here is exactly the lie this readout prevents.
    const readout = buildBrainReadout({
      geminiReady: true,
      openRouterReady: true,
      telemetry: turn({ provider: 'local', model: undefined, latencyMs: 24 }),
    });
    expect(readout.providerLabel).toBe('LOCAL');
    expect(readout.modelLabel).toBeUndefined();
    expect(readout.latencyLabel).toBe('24ms');
  });

  it('omits the token count when the provider reports no usage', () => {
    const readout = buildBrainReadout({
      geminiReady: true,
      openRouterReady: false,
      telemetry: turn({ tokensIn: undefined, tokensOut: undefined }),
    });
    expect(readout.tokenLabel).toBeUndefined();
    expect(readout.latencyLabel).toBe('812ms');
  });

  it('reports a streamed first-token wait as a normal latency', () => {
    const readout = buildBrainReadout({
      geminiReady: true,
      openRouterReady: false,
      telemetry: turn({ latencyMs: 430, latencyKind: 'first-token', tokensIn: 0, tokensOut: 12 }),
    });
    expect(readout.latencyLabel).toBe('430ms');
    expect(readout.tokenLabel).toBe('12');
  });
});
