/**
 * `useReducedMotion` is the single source of truth every ambient animation
 * checks before it loops: the OS accessibility setting must be honored
 * (including live changes, no restart needed), and the in-app override must
 * be able to win in either direction.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from '../src/hooks/useReducedMotion';
import { useSevenStore } from '../src/store/useSevenStore';

describe('useReducedMotion', () => {
  let changeHandler: ((enabled: boolean) => void) | null = null;
  let removeSpy: jest.Mock;
  let isReduceMotionEnabledSpy: jest.SpyInstance;
  let addEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    changeHandler = null;
    removeSpy = jest.fn();
    isReduceMotionEnabledSpy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    addEventListenerSpy = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation(((_event: string, handler: (enabled: boolean) => void) => {
        changeHandler = handler;
        return { remove: removeSpy } as unknown;
      }) as typeof AccessibilityInfo.addEventListener);
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, reduceMotion: 'auto' },
    });
  });

  afterEach(() => {
    isReduceMotionEnabledSpy.mockRestore();
    addEventListenerSpy.mockRestore();
  });

  it('defaults to false while the OS check is still in flight', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('picks up the OS setting once isReduceMotionEnabled resolves', async () => {
    isReduceMotionEnabledSpy.mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reacts live to reduceMotionChanged without needing a remount', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      changeHandler?.(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      changeHandler?.(false);
    });
    expect(result.current).toBe(false);
  });

  it('removes its subscription on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('the "on" override forces reduced motion even if the OS reports it off', async () => {
    isReduceMotionEnabledSpy.mockResolvedValue(false);
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, reduceMotion: 'on' },
    });
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('the "off" override keeps motion on even if the OS reports reduce-motion', async () => {
    isReduceMotionEnabledSpy.mockResolvedValue(true);
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, reduceMotion: 'off' },
    });
    const { result } = renderHook(() => useReducedMotion());
    // Give the (irrelevant, overridden) OS promise a tick to resolve too.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it('tolerates a platform where isReduceMotionEnabled is unavailable', async () => {
    isReduceMotionEnabledSpy.mockRejectedValue(new Error('not supported'));
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });
});
