import * as SecureStore from 'expo-secure-store';
import { secretConfigService, withoutSecrets } from '../src/services/secretConfigService';
import type { AssistantConfig } from '../src/types';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const base = {
  assistantName: 'Seven', userName: 'Commander', geminiApiKey: 'gemini', openRouterKey: 'openrouter',
  braveSearchApiKey: 'brave', themeColor: '#fff', voiceEnabled: true, voicePitch: 1, voiceRate: 1,
  fishAudioApiKey: 'fish', elevenLabsApiKey: 'eleven', isConfigured: true,
} as AssistantConfig;

describe('secretConfigService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes every provider credential from the preference blob', () => {
    const safe = withoutSecrets(base);
    expect(safe.geminiApiKey).toBe('');
    expect(safe.openRouterKey).toBe('');
    expect(safe.braveSearchApiKey).toBe('');
    expect(safe.fishAudioApiKey).toBe('');
    expect(safe.elevenLabsApiKey).toBe('');
    expect(safe.assistantName).toBe('Seven');
  });

  it('writes changed credentials to separate secure-store entries', async () => {
    await secretConfigService.saveUpdates({ geminiApiKey: 'new-key', braveSearchApiKey: 'brave-key' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('seven_secret_v1_geminiApiKey', 'new-key');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('seven_secret_v1_braveSearchApiKey', 'brave-key');
  });

  it('deletes a dedicated entry when a credential is cleared', async () => {
    await secretConfigService.saveUpdates({ openRouterKey: '' });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('seven_secret_v1_openRouterKey');
  });
});
