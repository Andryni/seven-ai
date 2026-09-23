/**
 * sevenAgent.chatStream() — pass 1 (the initial call, before any tool runs)
 * used to buffer the whole `generateContent()` response and fake progressive
 * display by re-chunking already-complete text (`replayAsChunks`). This pins
 * the upgrade to real, token-level streaming via `generateContentStream()`:
 * - a plain conversational answer streams token-by-token as chunks arrive
 *   (onToken is called per chunk, not once with the whole text);
 * - a function-calling turn is still detected the moment a `functionCall`
 *   part appears in a chunk, and the tool flow (executeTool + pass 2 real
 *   streaming) takes over exactly as before;
 * - if the stream itself throws, the turn falls back to a single buffered
 *   `generateContent()` call instead of losing the response.
 */
import { sevenAgent } from '../src/core/sevenAgent';
import { resolveModel } from '../src/core/geminiClient';
import { useSevenStore } from '../src/store/useSevenStore';
import { executeTool } from '../src/core/sevenAgentTools';

jest.mock('../src/core/geminiClient', () => ({
  resolveModel: jest.fn(),
}));
jest.mock('../src/services/openRouterService', () => ({
  openRouterService: { isConfigured: jest.fn(() => false) },
}));
jest.mock('../src/services/fileOrganizer', () => ({ fileOrganizer: {} }));
jest.mock('../src/core/daveAgent', () => ({ daveAgent: {} }));
jest.mock('../src/services/researchService', () => ({ researchService: {} }));
jest.mock('../src/services/gmailService', () => ({ gmailService: {} }));
jest.mock('../src/services/instagramService', () => ({ instagramService: {} }));
jest.mock('../src/core/selfHealing', () => ({ selfHealing: {} }));
jest.mock('../src/services/deviceControlService', () => ({ deviceControl: {} }));
jest.mock('../src/services/webSearchService', () => ({ webSearchService: {} }));
jest.mock('../src/core/sevenAgentTools', () => ({
  TOOL_DECLARATIONS: [],
  executeTool: jest.fn(),
}));

const mockedResolveModel = resolveModel as jest.Mock;
const mockedExecuteTool = executeTool as jest.Mock;

interface FakeChunkSpec {
  text?: string;
  functionCall?: { name: string; args: any };
}

/** Builds an async generator standing in for the SDK's chunk stream. */
async function* fakeStream(chunks: FakeChunkSpec[]) {
  for (const c of chunks) {
    yield {
      text: () => c.text,
      candidates: c.functionCall
        ? [{ content: { parts: [{ functionCall: c.functionCall }] } }]
        : [{ content: { parts: c.text ? [{ text: c.text }] : [] } }],
    };
  }
}

describe('sevenAgent.chatStream — pass 1 real streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSevenStore.setState({
      config: { ...useSevenStore.getState().config, geminiApiKey: 'fake-key-123456' },
      chatHistory: [],
    });
  });

  it('streams a plain conversational answer token-by-token (no buffering)', async () => {
    const generateContentStream = jest.fn().mockResolvedValue({
      stream: fakeStream([{ text: 'Hel' }, { text: 'lo ' }, { text: 'world' }]),
    });
    const generateContent = jest.fn();
    mockedResolveModel.mockResolvedValue({
      model: { generateContent, generateContentStream },
      modelId: 'gemini-3.6-flash',
    });

    const tokens: string[] = [];
    const result = await sevenAgent.chatStream('hi there', (t) => tokens.push(t));

    expect(tokens).toEqual(['Hel', 'lo ', 'world']);
    expect(result.text).toBe('Hello world');
    expect(result.toolCall).toBeUndefined();
    // The buffered call must never fire on the streaming happy path.
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('detects a functionCall mid-stream and runs the tool + pass-2 streamed synthesis', async () => {
    const generateContentStream = jest
      .fn()
      // Pass 1: stream stops as soon as the functionCall chunk appears.
      .mockResolvedValueOnce({
        stream: fakeStream([{ functionCall: { name: 'organize_files', args: {} } }]),
      })
      // Pass 2: real streamed phrasing around the tool result.
      .mockResolvedValueOnce({
        stream: fakeStream([{ text: 'Done, ' }, { text: 'files sorted.' }]),
      });
    const generateContent = jest.fn();
    mockedResolveModel.mockResolvedValue({
      model: { generateContent, generateContentStream },
      modelId: 'gemini-3.6-flash',
    });
    mockedExecuteTool.mockResolvedValue({
      text: 'Organized 12 files.',
      toolCall: { name: 'organizer', status: 'completed', summary: 'Organized 12 files.' },
    });

    const tokens: string[] = [];
    const result = await sevenAgent.chatStream('organize my downloads', (t) => tokens.push(t));

    expect(mockedExecuteTool).toHaveBeenCalledWith('organize_files', {}, expect.any(Function));
    expect(tokens.join('')).toContain('Done, files sorted.');
    expect(result.text).toBe('Done, files sorted.');
    expect(result.toolCall).toEqual({ name: 'organizer', status: 'completed', summary: 'Organized 12 files.' });
  });

  it('falls back to a buffered generateContent call if the stream throws', async () => {
    const generateContentStream = jest.fn().mockRejectedValue(new Error('stream reset'));
    const generateContent = jest.fn().mockResolvedValue({
      response: {
        text: () => 'Buffered fallback answer',
        candidates: [{ content: { parts: [{ text: 'Buffered fallback answer' }] } }],
      },
    });
    mockedResolveModel.mockResolvedValue({
      model: { generateContent, generateContentStream },
      modelId: 'gemini-3.6-flash',
    });

    const tokens: string[] = [];
    const result = await sevenAgent.chatStream('hello', (t) => tokens.push(t));

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Buffered fallback answer');
    // Fallback still reaches the UI via the chunk-replay path.
    expect(tokens.join('')).toBe('Buffered fallback answer');
  });
});
