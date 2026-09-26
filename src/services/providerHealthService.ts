import { fetchWithTimeout } from './network';
import { verifyGeminiKey, type KeyCheck } from './keyVerification';

export type ProviderId = 'gemini' | 'openrouter' | 'brave';

export interface ProviderHealth extends KeyCheck {
  provider: ProviderId;
  latencyMs: number;
  checkedAt: number;
}

async function timed(provider: ProviderId, request: () => Promise<KeyCheck>): Promise<ProviderHealth> {
  const started = Date.now();
  const result = await request();
  return { provider, ...result, latencyMs: Date.now() - started, checkedAt: Date.now() };
}

async function verifyOpenRouter(key: string): Promise<KeyCheck> {
  if (!key.trim()) return { ok: false, message: 'No key configured' };
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key.trim()}` },
    });
    if (response.ok) return { ok: true, message: 'OpenRouter online' };
    if (response.status === 401 || response.status === 403) return { ok: false, message: 'Key rejected' };
    return { ok: false, message: `Provider answered ${response.status}` };
  } catch {
    return { ok: false, message: 'Provider unreachable' };
  }
}

async function verifyBrave(key: string): Promise<KeyCheck> {
  if (!key.trim()) return { ok: false, message: 'No key configured' };
  try {
    const response = await fetchWithTimeout(
      'https://api.search.brave.com/res/v1/web/search?q=connectivity&count=1',
      { headers: { Accept: 'application/json', 'X-Subscription-Token': key.trim() } }
    );
    if (response.ok) return { ok: true, message: 'Brave Search online' };
    if (response.status === 401 || response.status === 403) return { ok: false, message: 'Key rejected' };
    if (response.status === 429) return { ok: false, message: 'Valid endpoint; rate limit reached' };
    return { ok: false, message: `Provider answered ${response.status}` };
  } catch {
    return { ok: false, message: 'Provider unreachable' };
  }
}

export const providerHealthService = {
  verify(provider: ProviderId, key: string): Promise<ProviderHealth> {
    if (provider === 'gemini') return timed(provider, () => verifyGeminiKey(key));
    if (provider === 'openrouter') return timed(provider, () => verifyOpenRouter(key));
    return timed(provider, () => verifyBrave(key));
  },
};
