import { webSearchService } from '../src/services/webSearchService';
import { useSevenStore } from '../src/store/useSevenStore';

/**
 * DuckDuckGo's Instant Answer API is not a general search engine and often
 * comes back empty for plain factual questions — Wikipedia is queried as a
 * second, more reliable source and merged in. These tests pin that behavior.
 */
describe('webSearchService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    useSevenStore.setState((state) => ({
      config: { ...state.config, braveSearchApiKey: '' },
    }));
  });

  it('merges a DuckDuckGo abstract with Wikipedia summaries', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('duckduckgo.com')) {
        return {
          ok: true,
          json: async () => ({
            AbstractText: 'DuckDuckGo direct answer.',
            AbstractURL: 'https://duckduckgo.com/x',
            Heading: 'DDG Heading',
            RelatedTopics: [],
          }),
        } as any;
      }
      if (url.includes('opensearch')) {
        return {
          ok: true,
          json: async () => ['madagascar', ['Madagascar'], [''], ['https://en.wikipedia.org/wiki/Madagascar']],
        } as any;
      }
      if (url.includes('rest_v1/page/summary')) {
        return {
          ok: true,
          json: async () => ({
            title: 'Madagascar',
            extract: 'Madagascar is an island country in the Indian Ocean.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Madagascar' } },
          }),
        } as any;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as any;

    const res = await webSearchService.searchWeb('madagascar');
    expect(res.results.some((r) => r.title === 'DDG Heading')).toBe(true);
    expect(res.results.some((r) => r.title === 'Madagascar')).toBe(true);
    expect(res.summary).toContain('Madagascar is an island country');
  });

  it('falls back to Wikipedia alone when DuckDuckGo has nothing', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('duckduckgo.com')) {
        return { ok: true, json: async () => ({ RelatedTopics: [] }) } as any;
      }
      if (url.includes('opensearch')) {
        return {
          ok: true,
          json: async () => ['react', ['React (software)'], [''], ['https://en.wikipedia.org/wiki/React_(software)']],
        } as any;
      }
      if (url.includes('rest_v1/page/summary')) {
        return {
          ok: true,
          json: async () => ({
            title: 'React (software)',
            extract: 'React is a JavaScript library for building user interfaces.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/React_(software)' } },
          }),
        } as any;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as any;

    const res = await webSearchService.searchWeb('react framework');
    expect(res.results).toHaveLength(1);
    expect(res.results[0].title).toBe('React (software)');
  });

  it('uses Brave Search when an optional key is configured', async () => {
    useSevenStore.setState((state) => ({
      config: { ...state.config, braveSearchApiKey: 'brave-test-key' },
    }));
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('api.search.brave.com')) {
        return {
          ok: true,
          json: async () => ({ web: { results: [{ title: 'Current source', description: 'Fresh result', url: 'https://example.com/current' }] } }),
        } as any;
      }
      throw new Error('free fallback offline');
    }) as any;

    const res = await webSearchService.searchWeb('current topic');
    expect(res.results).toContainEqual({
      title: 'Current source',
      snippet: 'Fresh result',
      url: 'https://example.com/current',
    });
  });

  it('returns an honest empty result when all sources are unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    const res = await webSearchService.searchWeb('anything');
    expect(res.results).toHaveLength(0);
    expect(res.summary).toContain('No verifiable source');
  });
});
