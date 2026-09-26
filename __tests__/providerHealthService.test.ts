import { providerHealthService } from '../src/services/providerHealthService';

describe('providerHealthService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not call a provider when its key is empty', async () => {
    global.fetch = jest.fn();
    const result = await providerHealthService.verify('brave', '');
    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('verifies Brave with the subscription header and records latency', async () => {
    global.fetch = jest.fn(async (_url: string, options: any) => {
      expect(options.headers['X-Subscription-Token']).toBe('secret');
      return { ok: true, status: 200 } as Response;
    }) as any;
    const result = await providerHealthService.verify('brave', ' secret ');
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('brave');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports rejected OpenRouter credentials without exposing the key', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401 } as Response)) as any;
    const result = await providerHealthService.verify('openrouter', 'private-value');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Key rejected');
    expect(JSON.stringify(result)).not.toContain('private-value');
  });
});
