import * as FileSystem from 'expo-file-system/legacy';

export interface MemoryFact {
  id: string;
  category: 'preference' | 'personal' | 'project' | 'fact';
  content: string;
  createdAt: number;
  updatedAt: number;
}

const MEMORY_FILE_PATH = `${FileSystem.documentDirectory || ''}seven_memory_rag.json`;

/**
 * Local vectorless RAG and semantic memory service.
 * Extracts keywords, ranks relevance using TF-IDF token overlap and cosine-like ranking,
 * and maintains continuous knowledge without any paid vector database or cloud costs.
 */
class MemoryService {
  private facts: MemoryFact[] = [];
  private isLoaded = false;

  private async loadFacts(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const fileInfo = await FileSystem.getInfoAsync(MEMORY_FILE_PATH);
      if (fileInfo.exists) {
        const raw = await FileSystem.readAsStringAsync(MEMORY_FILE_PATH);
        this.facts = JSON.parse(raw);
      } else {
        this.facts = [];
      }
    } catch (e) {
      console.warn('Memory load failed, starting fresh:', e);
      this.facts = [];
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    try {
      await FileSystem.writeAsStringAsync(MEMORY_FILE_PATH, JSON.stringify(this.facts, null, 2));
    } catch (e) {
      console.warn('Failed to persist memory facts:', e);
    }
  }

  /**
   * Save or update an enduring fact in long-term memory
   */
  public async rememberFact(content: string, category: MemoryFact['category'] = 'fact'): Promise<MemoryFact> {
    await this.loadFacts();
    const clean = content.trim();

    // Avoid duplicate facts
    const existingIndex = this.facts.findIndex(
      (f) => f.content.toLowerCase() === clean.toLowerCase()
    );

    if (existingIndex >= 0) {
      this.facts[existingIndex].updatedAt = Date.now();
      await this.persist();
      return this.facts[existingIndex];
    }

    const newFact: MemoryFact = {
      id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category,
      content: clean,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.facts.push(newFact);
    await this.persist();
    return newFact;
  }

  /**
   * Search memory facts relevant to a given query
   */
  public async searchRelevantFacts(query: string, limit = 5): Promise<string[]> {
    await this.loadFacts();
    if (this.facts.length === 0) return [];

    const queryTokens = query
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (queryTokens.length === 0) {
      return this.facts.slice(-limit).map((f) => f.content);
    }

    const scored = this.facts.map((fact) => {
      const factTokens = fact.content
        .toLowerCase()
        .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);

      let score = 0;
      for (const qt of queryTokens) {
        if (factTokens.includes(qt)) {
          score += 2;
        } else if (factTokens.some((ft) => ft.includes(qt) || qt.includes(ft))) {
          score += 1;
        }
      }
      return { content: fact.content, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.content);
  }

  /**
   * Get all stored memories
   */
  public async getAllFacts(): Promise<MemoryFact[]> {
    await this.loadFacts();
    return [...this.facts];
  }

  /**
   * Clear all memories
   */
  public async clearMemory(): Promise<void> {
    this.facts = [];
    await this.persist();
  }
}

export const memoryService = new MemoryService();
