import React from 'react';
import { render } from '@testing-library/react-native';
import { HudHeader } from '../src/components/HudHeader';
import { useSevenStore } from '../src/store/useSevenStore';
import type { BrainTurnTelemetry } from '../src/core/brainTelemetry';

// lucide-react-native ships as ESM only, which the default jest-expo transform
// does not process — every test rendering an icon mocks the module it needs.
// (jest.mock calls are hoisted above the imports by babel-plugin-jest-hoist.)
jest.mock('lucide-react-native', () => ({
  Shield: 'Shield',
  Cpu: 'Cpu',
  Wifi: 'Wifi',
  BatteryCharging: 'BatteryCharging',
  Zap: 'Zap',
  BrainCircuit: 'BrainCircuit',
}));

// The header renders live device telemetry: stub the native sources so the
// test exercises the brain readout, not battery/network plumbing.
jest.mock('expo-battery', () => ({
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 },
  getBatteryLevelAsync: jest.fn().mockResolvedValue(0.5),
  addBatteryStateListener: jest.fn(() => ({ remove: jest.fn() })),
  addBatteryLevelListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    // Never resolves: keeps the telemetry hook quiet (no act() warnings) since
    // the pill under test does not depend on live network values.
    fetch: jest.fn(() => new Promise(() => {})),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

const GEMINI_KEY = 'gemini-test-key-123456';
const OPENROUTER_KEY = 'sk-or-test-key-1234567890';

function setConfig(overrides: { geminiApiKey?: string; openRouterKey?: string; language?: 'en' | 'fr' }) {
  useSevenStore.setState((state) => ({ config: { ...state.config, ...overrides } }));
}

function setTelemetry(telemetry: BrainTurnTelemetry | null) {
  useSevenStore.setState({ brainTelemetry: telemetry });
}

const turn = (overrides: Partial<BrainTurnTelemetry> = {}): BrainTurnTelemetry => ({
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  latencyMs: 812,
  latencyKind: 'total',
  tokensIn: 900,
  tokensOut: 340,
  at: 1_800_000_000_000,
  ...overrides,
});

describe('HUD brain readout', () => {
  beforeEach(() => {
    setTelemetry(null);
    setConfig({ geminiApiKey: GEMINI_KEY, openRouterKey: '', language: 'en' });
  });

  it('is visible before any request, naming the brain the config will use', () => {
    const { getByTestId, getByLabelText, queryByText } = render(<HudHeader />);

    expect(getByTestId('hud-brain-readout')).toBeTruthy();
    expect(getByLabelText(/Active brain: GEMINI \(no request yet\)/)).toBeTruthy();
    // Numbers would have to be invented before the first call, so none are shown.
    expect(queryByText('812ms')).toBeNull();
  });

  it('falls back to OpenRouter, then to the local engine, when unconfigured', () => {
    setConfig({ geminiApiKey: '', openRouterKey: OPENROUTER_KEY });
    const { getByLabelText } = render(<HudHeader />);
    expect(getByLabelText(/Active brain: OPENROUTER/)).toBeTruthy();
  });

  it('reports provider, model, latency and token cost of the last turn', () => {
    setTelemetry(turn());
    const { getByLabelText, getByText } = render(<HudHeader />);

    expect(getByText('GEMINI')).toBeTruthy();
    expect(getByText('3.6-FLASH')).toBeTruthy();
    expect(getByText('· 812ms')).toBeTruthy();
    expect(getByText('· 1.2k TOK')).toBeTruthy();
    expect(
      getByLabelText('Active brain: GEMINI 3.6-FLASH, 812ms latency, 1.2k tokens')
    ).toBeTruthy();
  });

  it('shows the engine that really answered when Gemini was only configured', () => {
    // The point of the readout: Gemini configured, quota out, keyword engine
    // answered — the HUD must say LOCAL, not GEMINI.
    setTelemetry(turn({ provider: 'local', model: undefined, latencyMs: 24, tokensIn: undefined, tokensOut: undefined }));
    const { getByText, getByLabelText, queryByText } = render(<HudHeader />);

    expect(getByText('LOCAL')).toBeTruthy();
    expect(queryByText('3.6-FLASH')).toBeNull();
    expect(getByLabelText(/Active brain: LOCAL, 24ms latency/)).toBeTruthy();
  });

  it('localizes the screen-reader label but keeps the jargon in the pill', () => {
    setConfig({ language: 'fr' });
    setTelemetry(turn({ provider: 'openrouter', model: 'openrouter/free', latencyMs: 2400, tokensIn: 100, tokensOut: 40 }));
    const { getByLabelText, getByText } = render(<HudHeader />);

    expect(getByText('OPENROUTER')).toBeTruthy();
    expect(getByText('· 2.4s')).toBeTruthy();
    expect(getByLabelText('Cerveau actif : OPENROUTER FREE, latence 2.4s, 140 tokens')).toBeTruthy();
  });
});
