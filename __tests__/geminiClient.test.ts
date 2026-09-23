/**
 * `resolveModel` must try the candidate list in order and cache the first
 * one that actually answers, so a renamed/retired primary model degrades to
 * a working one instead of failing the whole agent with an opaque 404.
 *
 * Mocks `@google/genai` (the actively-maintained SDK this app migrated to
 * from the deprecated `@google/generative-ai`) at the `ai.models.*` level,
 * matching its stateless client shape.
 */

const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    },
  })),
}));

// Re-import fresh for every test so the module-level `cachedWorkingModel`
// does not leak between cases.
function freshGeminiClient(): typeof import('../src/core/geminiClient') {
  jest.resetModules();
  mockGenerateContent.mockReset();
  mockGenerateContentStream.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/core/geminiClient');
}

describe('geminiClient — resolveModel', () => {
  it('uses the first candidate when it answers', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent.mockResolvedValue({ text: 'pong' });

    const { modelId } = await resolveModel('fake-key', {});

    expect(modelId).toBe('gemini-3.6-flash');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next candidate on a 404 "model not found" error', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent
      .mockRejectedValueOnce(new Error('404 Not Found: model not found'))
      .mockResolvedValueOnce({ text: 'pong' });

    const { modelId } = await resolveModel('fake-key', {});

    expect(modelId).toBe('gemini-2.5-flash');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('does not swap models on a quota error — it surfaces it immediately', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED: quota exceeded'));

    await expect(resolveModel('fake-key', {})).rejects.toThrow(/quota/i);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('caches the working model id across calls (no re-probe)', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent.mockResolvedValue({ text: 'pong' });

    await resolveModel('fake-key', {});
    mockGenerateContent.mockClear();
    const second = await resolveModel('fake-key', {});

    expect(second.modelId).toBe('gemini-3.6-flash');
    // No probing generateContent call on the second resolution.
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('generateContent on the resolved model returns a legacy-shaped result', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent
      .mockResolvedValueOnce({ text: 'pong' }) // probe
      .mockResolvedValueOnce({ text: 'hello world', candidates: [{ content: { parts: [] } }] });

    const { model } = await resolveModel('fake-key', {});
    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });

    expect(result.response.text()).toBe('hello world');
    expect(result.response.candidates).toEqual([{ content: { parts: [] } }]);
  });
});
