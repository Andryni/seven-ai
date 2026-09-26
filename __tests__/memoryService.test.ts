/**
 * memoryService is the on-device RAG store behind remember_fact /
 * recall_memories and (as of the Memory screen) the only place a user can
 * see or manage what SEVEN has permanently remembered about them. This
 * pins: real JSON persistence via expo-file-system, dedup-on-remember,
 * TF-IDF-ish relevance ranking, and the CRUD surface the Memory screen
 * depends on (getAllFacts / updateFact / deleteFact / clearMemory) — none
 * of which existed as a directly testable contract before.
 */
import { memoryService } from '../src/services/memoryService';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy');

const resetFS = () => {
  (FileSystem as any).__resetMockFS?.();
};

describe('memoryService', () => {
  beforeEach(async () => {
    resetFS();
    // The service caches `isLoaded`/`facts` in memory across calls within a
    // process, so every test needs a real clean slate on both the mock
    // filesystem AND the service's in-memory cache.
    await memoryService.clearMemory();
  });

  describe('rememberFact', () => {
    it('persists a new fact with a generated id and timestamps', async () => {
      const fact = await memoryService.rememberFact('I prefer concise answers', 'preference');
      expect(fact.id).toMatch(/^fact_/);
      expect(fact.content).toBe('I prefer concise answers');
      expect(fact.category).toBe('preference');
      expect(fact.createdAt).toBeGreaterThan(0);
      expect(fact.updatedAt).toBe(fact.createdAt);

      const all = await memoryService.getAllFacts();
      expect(all).toHaveLength(1);
    });

    it('defaults to the "fact" category when none is given', async () => {
      const fact = await memoryService.rememberFact('My stack is React/Node');
      expect(fact.category).toBe('fact');
    });

    it('trims whitespace from the stored content', async () => {
      const fact = await memoryService.rememberFact('   spaced out   ');
      expect(fact.content).toBe('spaced out');
    });

    it('updates the timestamp instead of duplicating an identical fact (case-insensitive)', async () => {
      const first = await memoryService.rememberFact('I live in Antananarivo');
      const second = await memoryService.rememberFact('i live in antananarivo');
      expect(second.id).toBe(first.id);

      const all = await memoryService.getAllFacts();
      expect(all).toHaveLength(1);
    });

    it('creates bidirectional semantic relations and cleans them on deletion', async () => {
      const first = await memoryService.rememberFact('React project uses TypeScript components', 'project');
      const second = await memoryService.rememberFact('TypeScript project uses React hooks', 'project');
      let all = await memoryService.getAllFacts();
      expect(all.find((fact) => fact.id === first.id)?.relatedIds).toContain(second.id);
      expect(second.relatedIds).toContain(first.id);

      await memoryService.deleteFact(second.id);
      all = await memoryService.getAllFacts();
      expect(all[0].relatedIds).not.toContain(second.id);
    });

    it('actually survives being reloaded from disk (real persistence, not just in-memory)', async () => {
      await memoryService.rememberFact('Persisted fact');
      // Simulate a fresh service instance reading the same file.
      const raw = await FileSystem.readAsStringAsync(
        `${(FileSystem as any).documentDirectory}seven_memory_rag.json`
      );
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].content).toBe('Persisted fact');
    });
  });

  describe('searchRelevantFacts', () => {
    beforeEach(async () => {
      await memoryService.rememberFact('My favorite programming language is TypeScript');
      await memoryService.rememberFact('I have a dog named Rex');
      await memoryService.rememberFact('My stack is React and Node');
    });

    it('ranks facts sharing query tokens above unrelated ones', async () => {
      const results = await memoryService.searchRelevantFacts('what programming language do I like');
      expect(results[0]).toMatch(/TypeScript/);
    });

    it('returns an empty array when nothing matches', async () => {
      const results = await memoryService.searchRelevantFacts('xyzxyz nonsense query');
      expect(results).toEqual([]);
    });

    it('falls back to the most recent facts for a query with no meaningful (>2 char) tokens', async () => {
      const results = await memoryService.searchRelevantFacts('a an');
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects the limit parameter', async () => {
      const results = await memoryService.searchRelevantFacts('my', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('updateFact', () => {
    it('updates content and bumps updatedAt without changing the id or createdAt', async () => {
      const fact = await memoryService.rememberFact('Old content');
      await new Promise((r) => setTimeout(r, 5));
      const updated = await memoryService.updateFact(fact.id, { content: 'New content' });
      expect(updated?.id).toBe(fact.id);
      expect(updated?.content).toBe('New content');
      expect(updated?.createdAt).toBe(fact.createdAt);
      expect(updated!.updatedAt).toBeGreaterThan(fact.updatedAt);
    });

    it('can change the category alone', async () => {
      const fact = await memoryService.rememberFact('Something', 'fact');
      const updated = await memoryService.updateFact(fact.id, { category: 'personal' });
      expect(updated?.category).toBe('personal');
      expect(updated?.content).toBe('Something');
    });

    it('returns null for a non-existent id without throwing', async () => {
      const updated = await memoryService.updateFact('missing-id', { content: 'x' });
      expect(updated).toBeNull();
    });

    it('rejects clearing the content to empty', async () => {
      const fact = await memoryService.rememberFact('Keep me');
      const updated = await memoryService.updateFact(fact.id, { content: '   ' });
      expect(updated).toBeNull();
      const all = await memoryService.getAllFacts();
      expect(all.find((f) => f.id === fact.id)?.content).toBe('Keep me');
    });

    it('persists the update to disk', async () => {
      const fact = await memoryService.rememberFact('Before edit');
      await memoryService.updateFact(fact.id, { content: 'After edit' });
      const raw = await FileSystem.readAsStringAsync(
        `${(FileSystem as any).documentDirectory}seven_memory_rag.json`
      );
      expect(JSON.parse(raw)[0].content).toBe('After edit');
    });
  });

  describe('deleteFact', () => {
    it('removes exactly the targeted fact and leaves the others', async () => {
      const a = await memoryService.rememberFact('Fact A');
      const b = await memoryService.rememberFact('Fact B');

      const removed = await memoryService.deleteFact(a.id);
      expect(removed).toBe(true);

      const all = await memoryService.getAllFacts();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(b.id);
    });

    it('returns false for an id that does not exist, without touching other facts', async () => {
      await memoryService.rememberFact('Untouched');
      const removed = await memoryService.deleteFact('missing-id');
      expect(removed).toBe(false);
      expect(await memoryService.getAllFacts()).toHaveLength(1);
    });
  });

  describe('clearMemory', () => {
    it('wipes every fact and persists the empty state', async () => {
      await memoryService.rememberFact('One');
      await memoryService.rememberFact('Two');
      await memoryService.clearMemory();

      expect(await memoryService.getAllFacts()).toEqual([]);
      const raw = await FileSystem.readAsStringAsync(
        `${(FileSystem as any).documentDirectory}seven_memory_rag.json`
      );
      expect(JSON.parse(raw)).toEqual([]);
    });
  });
});
