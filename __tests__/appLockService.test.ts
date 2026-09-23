/**
 * The biometric gate itself: it must default to "not unlocked" on any
 * ambiguity (no hardware, no enrollment, a thrown error, an explicit
 * failure) and only ever resolve true on a real OS success — this guards
 * against ever fixing a spurious error by silently letting someone in.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { appLockService } from '../src/services/appLockService';

describe('appLockService.isAvailable', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is false on web, regardless of hardware', async () => {
    Platform.OS = 'web';
    jest.spyOn(LocalAuthentication, 'hasHardwareAsync').mockResolvedValue(true);
    jest.spyOn(LocalAuthentication, 'isEnrolledAsync').mockResolvedValue(true);
    expect(await appLockService.isAvailable()).toBe(false);
    Platform.OS = 'android';
  });

  it('is false when there is no biometric/passcode hardware at all', async () => {
    jest.spyOn(LocalAuthentication, 'hasHardwareAsync').mockResolvedValue(false);
    const enrolledSpy = jest.spyOn(LocalAuthentication, 'isEnrolledAsync');
    expect(await appLockService.isAvailable()).toBe(false);
    expect(enrolledSpy).not.toHaveBeenCalled();
  });

  it('is false when hardware exists but nothing is enrolled', async () => {
    jest.spyOn(LocalAuthentication, 'hasHardwareAsync').mockResolvedValue(true);
    jest.spyOn(LocalAuthentication, 'isEnrolledAsync').mockResolvedValue(false);
    expect(await appLockService.isAvailable()).toBe(false);
  });

  it('is true when hardware exists and something is enrolled', async () => {
    jest.spyOn(LocalAuthentication, 'hasHardwareAsync').mockResolvedValue(true);
    jest.spyOn(LocalAuthentication, 'isEnrolledAsync').mockResolvedValue(true);
    expect(await appLockService.isAvailable()).toBe(true);
  });

  it('never throws when the underlying API rejects', async () => {
    jest.spyOn(LocalAuthentication, 'hasHardwareAsync').mockRejectedValue(new Error('boom'));
    await expect(appLockService.isAvailable()).resolves.toBe(false);
  });
});

describe('appLockService.describeMethod', () => {
  afterEach(() => jest.restoreAllMocks());

  it('names both when face and fingerprint are supported', async () => {
    jest.spyOn(LocalAuthentication, 'supportedAuthenticationTypesAsync').mockResolvedValue([
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);
    expect(await appLockService.describeMethod('en')).toMatch(/fingerprint/i);
  });

  it('names face recognition alone', async () => {
    jest.spyOn(LocalAuthentication, 'supportedAuthenticationTypesAsync').mockResolvedValue([
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    ]);
    expect(await appLockService.describeMethod('en')).toMatch(/face/i);
  });

  it('names fingerprint alone', async () => {
    jest.spyOn(LocalAuthentication, 'supportedAuthenticationTypesAsync').mockResolvedValue([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);
    expect(await appLockService.describeMethod('en')).toMatch(/fingerprint/i);
  });

  it('falls back to a passcode description when nothing biometric is reported', async () => {
    jest.spyOn(LocalAuthentication, 'supportedAuthenticationTypesAsync').mockResolvedValue([]);
    expect(await appLockService.describeMethod('en')).toMatch(/passcode/i);
  });

  it('returns a French description when asked', async () => {
    jest.spyOn(LocalAuthentication, 'supportedAuthenticationTypesAsync').mockResolvedValue([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);
    expect(await appLockService.describeMethod('fr')).toMatch(/empreinte/i);
  });

  it('never throws when the underlying API rejects', async () => {
    jest.spyOn(LocalAuthentication, 'supportedAuthenticationTypesAsync').mockRejectedValue(
      new Error('boom')
    );
    await expect(appLockService.describeMethod('en')).resolves.toEqual(expect.any(String));
  });
});

describe('appLockService.authenticate', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is always true on web (no biometric concept to gate)', async () => {
    Platform.OS = 'web';
    const spy = jest.spyOn(LocalAuthentication, 'authenticateAsync');
    expect(await appLockService.authenticate('Unlock', 'Cancel')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    Platform.OS = 'android';
  });

  it('resolves true on an explicit OS success', async () => {
    jest.spyOn(LocalAuthentication, 'authenticateAsync').mockResolvedValue({ success: true });
    expect(await appLockService.authenticate('Unlock', 'Cancel')).toBe(true);
  });

  it('resolves false on an explicit OS failure (e.g. user cancel)', async () => {
    jest.spyOn(LocalAuthentication, 'authenticateAsync').mockResolvedValue({
      success: false,
      error: 'user_cancel',
    });
    expect(await appLockService.authenticate('Unlock', 'Cancel')).toBe(false);
  });

  it('resolves false, never throws, when the OS call itself rejects', async () => {
    jest.spyOn(LocalAuthentication, 'authenticateAsync').mockRejectedValue(new Error('boom'));
    await expect(appLockService.authenticate('Unlock', 'Cancel')).resolves.toBe(false);
  });
});
