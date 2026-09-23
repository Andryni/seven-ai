/**
 * The store side of the reduce-motion setting: it defaults to 'auto' (trust
 * the OS) and `setConfig` persists an explicit override like any other
 * config field, which is what the Settings screen's three chips call.
 */
import { useSevenStore } from '../src/store/useSevenStore';

describe('reduceMotion config field', () => {
  it('defaults to "auto"', () => {
    expect(useSevenStore.getState().config.reduceMotion).toBe('auto');
  });

  it('setConfig persists an explicit "on" override', async () => {
    await useSevenStore.getState().setConfig({ reduceMotion: 'on' });
    expect(useSevenStore.getState().config.reduceMotion).toBe('on');
  });

  it('setConfig persists an explicit "off" override', async () => {
    await useSevenStore.getState().setConfig({ reduceMotion: 'off' });
    expect(useSevenStore.getState().config.reduceMotion).toBe('off');
  });

  it('setConfig can switch back to "auto"', async () => {
    await useSevenStore.getState().setConfig({ reduceMotion: 'on' });
    await useSevenStore.getState().setConfig({ reduceMotion: 'auto' });
    expect(useSevenStore.getState().config.reduceMotion).toBe('auto');
  });
});
