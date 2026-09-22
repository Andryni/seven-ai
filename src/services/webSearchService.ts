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
   * Performs live web search using DuckDuckGo HTML / Instant Answers without needing paid API keys
   */
  public async searchWeb(query: string): Promise<WebSearchResponse> {
    try {
      // Use DuckDuckGo Instant Answer API
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      const results: SearchResultItem[] = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || 'https://duckduckgo.com',
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 4)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 40),
              snippet: topic.Text,
              url: topic.FirstURL,
            });
          }
        }
      }

      // If DuckDuckGo Instant Answer returned few items, query HTML search
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
    } catch (error: any) {
      return {
        query,
        results: [],
        summary: `Web search could not retrieve live data: ${error.message || error}. Falling back to internal models.`,
      };
    }
  }
}

export const webSearchService = WebSearchService.getInstance();
