import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AssistantConfig } from '../types';

export type SecretConfigKey =
  | 'geminiApiKey'
  | 'openRouterKey'
  | 'braveSearchApiKey'
  | 'fishAudioApiKey'
  | 'elevenLabsApiKey';

const SECRET_KEYS: SecretConfigKey[] = [
  'geminiApiKey',
  'openRouterKey',
  'braveSearchApiKey',
  'fishAudioApiKey',
  'elevenLabsApiKey',
];
const PREFIX = 'seven_secret_v1_';

/** Removes credentials before preferences are serialized as one JSON blob. */
export function withoutSecrets(config: AssistantConfig): AssistantConfig {
  return {
    ...config,
    geminiApiKey: '',
    openRouterKey: '',
    braveSearchApiKey: '',
    fishAudioApiKey: '',
    elevenLabsApiKey: '',
  };
}

class SecretConfigService {
  async saveUpdates(updates: Partial<AssistantConfig>): Promise<void> {
    if (Platform.OS === 'web') return; // session-only in the browser
    await Promise.all(
      SECRET_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(updates, key)).map(async (key) => {
        const value = updates[key];
        if (typeof value === 'string' && value.length > 0) {
          await SecureStore.setItemAsync(PREFIX + key, value);
        } else {
          await SecureStore.deleteItemAsync(PREFIX + key);
        }
      })
    );
  }

  async load(): Promise<Partial<AssistantConfig>> {
    if (Platform.OS === 'web') return {};
    const values = await Promise.all(SECRET_KEYS.map((key) => SecureStore.getItemAsync(PREFIX + key)));
    return SECRET_KEYS.reduce<Partial<AssistantConfig>>((result, key, index) => {
      const value = values[index];
      if (value) (result as Record<string, string>)[key] = value;
      return result;
    }, {});
  }

  /** Migrates credentials from the legacy all-in-one config exactly once. */
  async migrateLegacy(config: Partial<AssistantConfig>): Promise<void> {
    if (Platform.OS === 'web') return;
    const updates: Partial<AssistantConfig> = {};
    for (const key of SECRET_KEYS) {
      const value = config[key];
      if (typeof value === 'string' && value) (updates as Record<string, string>)[key] = value;
    }
    await this.saveUpdates(updates);
  }
}

export const secretConfigService = new SecretConfigService();
