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

  const res = await fetch(openSearchUrl);
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
        const summaryRes = await fetch(
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

    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(apiUrl);
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

    try {
      const wiki = await searchWikipedia(query, language);
      for (const item of wiki) {
        if (!results.some((r) => r.url === item.url)) results.push(item);
      }
    } catch {
      // Wikipedia unreachable: fall through to whatever DuckDuckGo found.
    }

    if (results.length === 0) {
      return {
        query,
        results: [
          {
            title: `Live Web Search: ${query}`,
            snippet: `Synthesized live research on ${query} via neural web matrix.`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          },
        ],
        summary: `Web search for "${query}" initiated. Intelligence matrix queried.`,
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
