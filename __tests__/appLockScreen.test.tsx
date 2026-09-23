/**
 * The lock overlay must prompt automatically (the whole point is to not
 * need an extra tap most of the time), show a retry affordance and a clear
 * failure message when the OS sheet is dismissed or fails, and never
 * double-prompt on its own re-renders.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { AppLockScreen } from '../src/components/AppLockScreen';

jest.mock('lucide-react-native', () => ({ Fingerprint: 'Fingerprint' }));

describe('AppLockScreen', () => {
  it('prompts automatically on mount', async () => {
    const onUnlock = jest.fn().mockResolvedValue(true);
    render(<AppLockScreen onUnlock={onUnlock} language="en" />);
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
  });

  it('shows a failure message when authentication fails', async () => {
    const onUnlock = jest.fn().mockResolvedValue(false);
    const { findByText } = render(<AppLockScreen onUnlock={onUnlock} language="en" />);
    expect(await findByText(/try again/i)).toBeTruthy();
  });

  it('shows no failure message while awaiting the very first attempt', () => {
    const onUnlock = jest.fn(() => new Promise<boolean>(() => {}));
    const { queryByText } = render(<AppLockScreen onUnlock={onUnlock} language="en" />);
    expect(queryByText(/try again/i)).toBeNull();
  });

  it('lets the user retry manually after a failure', async () => {
    const onUnlock = jest.fn().mockResolvedValue(false);
    const { getByLabelText, findByText } = render(
      <AppLockScreen onUnlock={onUnlock} language="en" />
    );
    await findByText(/try again/i);
    await act(async () => {
      fireEvent.press(getByLabelText('UNLOCK'));
    });
    expect(onUnlock).toHaveBeenCalledTimes(2);
  });

  it('renders French copy when asked', async () => {
    const onUnlock = jest.fn().mockResolvedValue(true);
    const { findByText } = render(<AppLockScreen onUnlock={onUnlock} language="fr" />);
    expect(await findByText('SEVEN VERROUILLÉ')).toBeTruthy();
  });
});
