import { fetchWithTimeout } from './network';
import { useSevenStore } from '../store/useSevenStore';
export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResultItem[];
  summary: string;
}

/** Wikipedia's public REST/opensearch endpoints — no key, no quota, and far
 * more reliable than DuckDuckGo's Instant Answer API for factual/"who is"/
 * "what is" queries, which very often returns nothing at all. */
async function searchWikipedia(query: string, language: 'fr' | 'en' = 'en'): Promise<SearchResultItem[]> {
  const domain = language === 'fr' ? 'fr.wikipedia.org' : 'en.wikipedia.org';
  const openSearchUrl = `https://${domain}/w/api.php?action=opensearch&search=${encodeURIComponent(
    query
  )}&limit=3&format=json&origin=*`;

  const res = await fetchWithTimeout(openSearchUrl);
  if (!res.ok) return [];
  const data = await res.json();
  // opensearch responds [query, [titles], [descriptions], [urls]]
  const titles: string[] = Array.isArray(data?.[1]) ? data[1] : [];
  const urls: string[] = Array.isArray(data?.[3]) ? data[3] : [];
  if (titles.length === 0) return [];

  // One summary fetch per candidate title gives a real extract instead of
  // opensearch's often-empty description field.
  const summaries = await Promise.all(
    titles.slice(0, 3).map(async (title, i) => {
      try {
        const summaryRes = await fetchWithTimeout(
          `https://${domain}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
        );
        if (!summaryRes.ok) return null;
        const summary = await summaryRes.json();
        if (!summary?.extract) return null;
        return {
          title: summary.title || title,
          snippet: summary.extract,
          url: summary.content_urls?.desktop?.page || urls[i] || `https://${domain}/wiki/${encodeURIComponent(title)}`,
        } satisfies SearchResultItem;
      } catch {
        return null;
      }
    })
  );

  return summaries.filter((s): s is SearchResultItem => s !== null);
}

async function searchBrave(query: string, apiKey: string): Promise<SearchResultItem[]> {
  if (!apiKey.trim()) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&safesearch=moderate`;
  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey.trim(),
    },
  });
  if (!res.ok) throw new Error(`Brave Search ${res.status}`);
  const data = await res.json();
  const results = data?.web?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item: any) => {
    if (typeof item?.url !== 'string' || typeof item?.title !== 'string') return [];
    return [{
      title: item.title,
      snippet: typeof item.description === 'string' ? item.description : '',
      url: item.url,
    }];
  });
}

/** Crossref adds recent scholarly works and stable DOI links, complementing
 * encyclopedic Wikipedia and DuckDuckGo's direct-answer index. */
async function searchCrossref(query: string): Promise<SearchResultItem[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3&select=DOI,title,abstract,published`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const items = (await res.json())?.message?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: any) => {
    const title = Array.isArray(item?.title) ? item.title[0] : undefined;
    const doi = typeof item?.DOI === 'string' ? item.DOI : undefined;
    if (!title || !doi) return [];
    const abstract = typeof item.abstract === 'string'
      ? item.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : 'Scholarly work indexed by Crossref.';
    return [{ title, snippet: abstract.slice(0, 700), url: `https://doi.org/${doi}` }];
  });
}

class WebSearchService {
  private static instance: WebSearchService;

  private constructor() {}

  public static getInstance(): WebSearchService {
    if (!WebSearchService.instance) {
      WebSearchService.instance = new WebSearchService();
    }
    return WebSearchService.instance;
  }

  /**
   * Live web search with no paid API keys.
   *
   * DuckDuckGo's Instant Answer API is tried first (it occasionally has a
   * strong direct answer), but it is not a general search engine and often
   * returns nothing for plain factual questions. Wikipedia's REST API is
   * queried as a second, more reliable source and merged in — this used to
   * be the only source and silently degraded to a placeholder link on most
   * queries.
   */
  public async searchWeb(query: string, language: 'fr' | 'en' = 'en'): Promise<WebSearchResponse> {
    const results: SearchResultItem[] = [];
    const braveKey = useSevenStore.getState().config.braveSearchApiKey || '';

    if (braveKey) {
      try {
        results.push(...(await searchBrave(query, braveKey)));
      } catch {
        // Paid/optional provider failure must not break the free fallbacks.
      }
    }

    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetchWithTimeout(apiUrl);
      const data = await response.json();

      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || 'https://duckduckgo.com',
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 3)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 40),
              snippet: topic.Text,
              url: topic.FirstURL,
            });
          }
        }
      }
    } catch {
      // DuckDuckGo unreachable: Wikipedia below may still answer.
    }

    const secondary = await Promise.allSettled([
      searchWikipedia(query, language),
      searchCrossref(query),
    ]);
    for (const settled of secondary) {
      if (settled.status !== 'fulfilled') continue;
      for (const item of settled.value) {
        if (!results.some((r) => r.url === item.url)) results.push(item);
      }
    }

    if (results.length === 0) {
      // An outbound search URL is not a result and a synthetic snippet is not
      // evidence. Return an honest empty set so callers can label the answer as
      // ungrounded instead of presenting invented research as live data.
      return {
        query,
        results: [],
        summary:
          language === 'fr'
            ? `Aucune source vérifiable trouvée pour « ${query} ».`
            : `No verifiable source was found for “${query}”.`,
      };
    }

    const summary = results.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`).join('\n\n');

    return {
      query,
      results,
      summary,
    };
  }
}

export const webSearchService = WebSearchService.getInstance();
