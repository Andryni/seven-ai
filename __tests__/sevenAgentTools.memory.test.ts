/**
 * remember_fact / recall_memories / forget_memory expose the on-device RAG
 * memory (memoryService) and the Settings free-text notes (config.memoryNotes)
 * to the agent. This pins: remember_fact/recall_memories actually call the
 * real memoryService (never simulate), and forget_memory clears BOTH memory
 * stores — a real bug where it used to only clear config.memoryNotes and
 * silently left every remembered fact behind forever, now that the Memory
 * screen makes those facts directly user-visible.
 */
import { executeTool } from '../src/core/sevenAgentTools';
import { memoryService } from '../src/services/memoryService';
import { useSevenStore } from '../src/store/useSevenStore';

jest.mock('../src/services/fileOrganizer', () => ({ fileOrganizer: {} }));
jest.mock('../src/core/daveAgent', () => ({ daveAgent: {} }));
jest.mock('../src/services/researchService', () => ({ researchService: {} }));
jest.mock('../src/services/gmailService', () => ({ gmailService: {} }));
jest.mock('../src/services/instagramService', () => ({ instagramService: {} }));
jest.mock('../src/core/selfHealing', () => ({ selfHealing: {} }));
jest.mock('../src/services/deviceControlService', () => ({ deviceControl: {} }));
jest.mock('../src/services/webSearchService', () => ({ webSearchService: {} }));
jest.mock('../src/services/sandboxService', () => ({ sandboxService: {} }));
jest.mock('../src/services/contactsService', () => ({ contactsService: {} }));
jest.mock('../src/services/calendarService', () => ({ calendarService: {} }));
jest.mock('../src/services/routineService', () => ({
  routineService: {},
  validateTrigger: jest.fn(() => null),
}));

jest.mock('../src/services/memoryService', () => ({
  memoryService: {
    rememberFact: jest.fn(),
    searchRelevantFacts: jest.fn(),
    getAllFacts: jest.fn(),
    clearMemory: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockedMemoryService = memoryService as jest.Mocked<typeof memoryService>;

describe('executeTool — memory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, memoryNotes: '' },
    });
  });

  describe('remember_fact', () => {
    it('calls the real memoryService and echoes back the stored fact', async () => {
      mockedMemoryService.rememberFact.mockResolvedValue({
        id: 'f1',
        category: 'fact',
        content: 'I prefer concise answers',
        createdAt: 1,
        updatedAt: 1,
      });
      const result = await executeTool('remember_fact', { fact: 'I prefer concise answers' });
      expect(mockedMemoryService.rememberFact).toHaveBeenCalledWith('I prefer concise answers');
      expect(result.text).toMatch(/I prefer concise answers/);
      expect(result.toolCall?.name).toBe('memory');
      expect(result.toolCall?.status).toBe('completed');
    });
  });

  describe('recall_memories', () => {
    it('reports relevant memories found via the real semantic search', async () => {
      mockedMemoryService.searchRelevantFacts.mockResolvedValue(['My stack is React/Node']);
      const result = await executeTool('recall_memories', { query: 'what stack do I use' });
      expect(mockedMemoryService.searchRelevantFacts).toHaveBeenCalledWith('what stack do I use');
      expect(result.text).toMatch(/React\/Node/);
      expect(result.toolCall?.summary).toMatch(/Recalled 1 memory/);
    });

    it('reports honestly when nothing matches instead of fabricating a memory', async () => {
      mockedMemoryService.searchRelevantFacts.mockResolvedValue([]);
      const result = await executeTool('recall_memories', { query: 'nonexistent topic' });
      expect(result.text).toMatch(/No memories found/i);
    });
  });

  describe('forget_memory', () => {
    it('clears both the Settings memory notes AND the remembered-facts RAG store', async () => {
      useSevenStore.setState({
        config: { ...useSevenStore.getState().config, memoryNotes: 'Some permanent note' },
      });
      mockedMemoryService.getAllFacts.mockResolvedValue([
        { id: 'f1', category: 'fact', content: 'x', createdAt: 1, updatedAt: 1 },
      ]);

      const result = await executeTool('forget_memory', {});

      expect(useSevenStore.getState().config.memoryNotes).toBe('');
      expect(mockedMemoryService.clearMemory).toHaveBeenCalledTimes(1);
      expect(result.text).toMatch(/erased/i);
      expect(result.toolCall?.name).toBe('memory');
    });

    it('still calls clearMemory even when only remembered facts exist (no Settings notes)', async () => {
      useSevenStore.setState({ config: { ...useSevenStore.getState().config, memoryNotes: '' } });
      mockedMemoryService.getAllFacts.mockResolvedValue([
        { id: 'f1', category: 'fact', content: 'x', createdAt: 1, updatedAt: 1 },
      ]);

      const result = await executeTool('forget_memory', {});
      expect(mockedMemoryService.clearMemory).toHaveBeenCalledTimes(1);
      expect(result.text).toMatch(/erased/i);
    });

    it('reports memory was already empty when both stores are empty', async () => {
      mockedMemoryService.getAllFacts.mockResolvedValue([]);
      const result = await executeTool('forget_memory', {});
      expect(result.text).toMatch(/already empty/i);
      // Still safe/idempotent to call clearMemory even when there was nothing.
      expect(mockedMemoryService.clearMemory).toHaveBeenCalledTimes(1);
    });
  });
});
