/**
 * The boot splash's dual-ring spin is pure flourish (2.6s infinite loop);
 * the boot log reveal and progress fill communicate real loading state and
 * must keep running regardless.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { LaunchSplash } from '../src/components/LaunchSplash';
import { useReducedMotion } from '../src/hooks/useReducedMotion';

jest.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(),
}));

describe('LaunchSplash under reduce-motion', () => {
  let loopSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    loopSpy = jest.spyOn(Animated, 'loop');
  });

  afterEach(() => {
    loopSpy.mockRestore();
    jest.useRealTimers();
  });

  it('spins its rings when motion is not reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    render(<LaunchSplash onFinish={() => {}} />);
    expect(loopSpy).toHaveBeenCalledTimes(1);
  });

  it('does not spin its rings when motion is reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<LaunchSplash onFinish={() => {}} />);
    expect(loopSpy).not.toHaveBeenCalled();
  });

  it('still finishes and calls onFinish under reduce-motion', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const onFinish = jest.fn();
    render(<LaunchSplash onFinish={onFinish} />);
    act(() => {
      jest.advanceTimersByTime(3200);
    });
    expect(onFinish).toHaveBeenCalled();
  });
});
