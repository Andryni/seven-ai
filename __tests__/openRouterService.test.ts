import { openRouterService } from '../src/services/openRouterService';

describe('openRouterService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('treats short/empty strings as not configured', () => {
    expect(openRouterService.isConfigured('')).toBe(false);
    expect(openRouterService.isConfigured('short')).toBe(false);
    expect(openRouterService.isConfigured(undefined)).toBe(false);
  });

  it('treats a plausible key as configured', () => {
    expect(openRouterService.isConfigured('sk-or-v1-abcdefghijklmnop')).toBe(true);
  });

  it('chat() returns the completion text on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Hello from the fallback brain.' } }] }),
    }) as any;

    const text = await openRouterService.chat('fake-key', [{ role: 'user', content: 'hi' }]);
    expect(text).toBe('Hello from the fallback brain.');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('chat() throws a readable error on a non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    }) as any;

    await expect(openRouterService.chat('bad-key', [{ role: 'user', content: 'hi' }])).rejects.toThrow(/401/);
  });

  it('chat() throws when the response has no content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as any;

    await expect(openRouterService.chat('fake-key', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /empty response/i
    );
  });
});
