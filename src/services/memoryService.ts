import * as FileSystem from 'expo-file-system/legacy';

export interface MemoryFact {
  id: string;
  category: 'preference' | 'personal' | 'project' | 'fact';
  content: string;
  createdAt: number;
  updatedAt: number;
  /** User-visible provenance and ranking metadata for cognitive memory. */
  source?: 'user' | 'conversation' | 'import';
  importance?: number;
  confidence?: number;
  expiresAt?: number | null;
  /** Bidirectional local semantic links to related memories. */
  relatedIds?: string[];
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
        const now = Date.now();
        this.facts = (JSON.parse(raw) as MemoryFact[])
          .filter((fact) => !fact.expiresAt || fact.expiresAt > now)
          .map((fact) => ({
            ...fact,
            source: fact.source || 'user',
            importance: fact.importance ?? 0.6,
            confidence: fact.confidence ?? 1,
            expiresAt: fact.expiresAt ?? null,
            relatedIds: fact.relatedIds ?? [],
          }));
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
  public async rememberFact(
    content: string,
    category: MemoryFact['category'] = 'fact',
    metadata: Pick<MemoryFact, 'source' | 'importance' | 'confidence' | 'expiresAt'> = {}
  ): Promise<MemoryFact> {
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

    const tokens = new Set(clean.toLowerCase().replace(/[^\w\s\u00C0-\u017F]/g, ' ').split(/\s+/).filter((token) => token.length > 3));
    const related = this.facts
      .map((fact) => ({
        fact,
        overlap: [...tokens].filter((token) => fact.content.toLowerCase().includes(token)).length,
      }))
      .filter((entry) => entry.overlap >= 2 || (entry.overlap >= 1 && entry.fact.category === category))
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5)
      .map((entry) => entry.fact.id);
    const newId = `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newFact: MemoryFact = {
      id: newId,
      category,
      content: clean,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: metadata.source || 'user',
      importance: Math.max(0, Math.min(1, metadata.importance ?? 0.6)),
      confidence: Math.max(0, Math.min(1, metadata.confidence ?? 1)),
      expiresAt: metadata.expiresAt ?? null,
      relatedIds: related,
    };

    this.facts = this.facts.map((fact) => related.includes(fact.id)
      ? { ...fact, relatedIds: [...new Set([...(fact.relatedIds || []), newId])].slice(0, 5) }
      : fact);
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
      const importance = fact.importance ?? 0.6;
      const confidence = fact.confidence ?? 1;
      return { content: fact.content, score: score * (0.65 + importance * 0.35) * confidence };
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
   * Update the content/category of an existing fact (used by the Memory
   * screen's edit action). Returns the updated fact, or null if the id no
   * longer exists (e.g. deleted from another surface in the meantime).
   */
  public async updateFact(
    id: string,
    updates: { content?: string; category?: MemoryFact['category'] }
  ): Promise<MemoryFact | null> {
    await this.loadFacts();
    const index = this.facts.findIndex((f) => f.id === id);
    if (index < 0) return null;

    const content = updates.content !== undefined ? updates.content.trim() : this.facts[index].content;
    if (!content) return null;

    this.facts[index] = {
      ...this.facts[index],
      content,
      category: updates.category ?? this.facts[index].category,
      updatedAt: Date.now(),
    };
    await this.persist();
    return this.facts[index];
  }

  /**
   * Delete a single remembered fact by id (used by the Memory screen so the
   * user can remove one wrong/outdated fact without wiping everything).
   * Returns true if a fact was actually removed.
   */
  public async deleteFact(id: string): Promise<boolean> {
    await this.loadFacts();
    const before = this.facts.length;
    this.facts = this.facts
      .filter((f) => f.id !== id)
      .map((fact) => ({ ...fact, relatedIds: (fact.relatedIds || []).filter((relatedId) => relatedId !== id) }));
    if (this.facts.length === before) return false;
    await this.persist();
    return true;
  }

  public async importFacts(facts: MemoryFact[]): Promise<void> {
    const now = Date.now();
    this.facts = facts
      .filter((fact) => fact && typeof fact.id === 'string' && typeof fact.content === 'string')
      .filter((fact) => !fact.expiresAt || fact.expiresAt > now)
      .slice(0, 1000);
    this.isLoaded = true;
    await this.persist();
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
