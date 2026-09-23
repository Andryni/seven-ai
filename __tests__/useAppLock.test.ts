/**
 * `useAppLock` drives *when* the lock screen shows: immediately when the
 * feature is turned on, on every foreground return, and it must clear the
 * moment a real authentication succeeds — never on a mere re-render.
 */
import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAppLock } from '../src/hooks/useAppLock';
import { useSevenStore } from '../src/store/useSevenStore';
import { appLockService } from '../src/services/appLockService';

describe('useAppLock', () => {
  let listeners: ((state: string) => void)[];
  let addEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    listeners = [];
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, appLockEnabled: false },
    });
    addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(
      ((_event: string, handler: (state: string) => void) => {
        listeners.push(handler);
        return { remove: jest.fn() };
      }) as typeof AppState.addEventListener
    );
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    jest.restoreAllMocks();
  });

  const emit = (state: 'active' | 'background' | 'inactive') => {
    act(() => {
      listeners.forEach((l) => l(state));
    });
  };

  it('is unlocked when the feature is off', () => {
    const { result } = renderHook(() => useAppLock());
    expect(result.current.locked).toBe(false);
  });

  it('starts locked the instant the feature is turned on', () => {
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, appLockEnabled: true },
    });
    const { result } = renderHook(() => useAppLock());
    expect(result.current.locked).toBe(true);
  });

  it('re-locks when the app returns to the foreground from the background', () => {
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, appLockEnabled: true },
    });
    const { result } = renderHook(() => useAppLock());
    act(() => {
      result.current.unlock('', '');
    });

    emit('background');
    emit('active');

    expect(result.current.locked).toBe(true);
  });

  it('does not re-lock when the feature is disabled', () => {
    const { result } = renderHook(() => useAppLock());
    emit('background');
    emit('active');
    expect(result.current.locked).toBe(false);
  });

  it('unlock() clears the lock only on a real authentication success', async () => {
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, appLockEnabled: true },
    });
    jest.spyOn(appLockService, 'authenticate').mockResolvedValue(true);
    const { result } = renderHook(() => useAppLock());
    expect(result.current.locked).toBe(true);

    await act(async () => {
      await result.current.unlock('Unlock SEVEN', 'Cancel');
    });

    expect(result.current.locked).toBe(false);
  });

  it('unlock() keeps the lock up on an authentication failure', async () => {
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, appLockEnabled: true },
    });
    jest.spyOn(appLockService, 'authenticate').mockResolvedValue(false);
    const { result } = renderHook(() => useAppLock());

    await act(async () => {
      await result.current.unlock('Unlock SEVEN', 'Cancel');
    });

    expect(result.current.locked).toBe(true);
  });

  it('turning the feature off clears a stale lock screen immediately', () => {
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, appLockEnabled: true },
    });
    const { result, rerender } = renderHook(() => useAppLock());
    expect(result.current.locked).toBe(true);

    act(() => {
      useSevenStore.setState({
        config: { ...useSevenStore.getState().config, appLockEnabled: false },
      });
    });
    rerender({});

    expect(result.current.locked).toBe(false);
  });
});
