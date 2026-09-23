/**
 * `resolveModel` must try the candidate list in order and cache the first
 * one that actually answers, so a renamed/retired primary model degrades to
 * a working one instead of failing the whole agent with an opaque 404.
 */

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Re-import fresh for every test so the module-level `cachedWorkingModel`
// does not leak between cases.
function freshGeminiClient(): typeof import('../src/core/geminiClient') {
  jest.resetModules();
  mockGenerateContent.mockReset();
  mockGetGenerativeModel.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/core/geminiClient');
}

describe('geminiClient — resolveModel', () => {
  it('uses the first candidate when it answers', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'pong' } });

    const { modelId } = await resolveModel('fake-key', {});

    expect(modelId).toBe('gemini-3.6-flash');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next candidate on a 404 "model not found" error', async () => {
    const { resolveModel } = freshGeminiClient();
    mockGenerateContent
      .mockRejectedValueOnce(new Error('404 Not Found: model not found'))
      .mockResolvedValueOnce({ response: { text: () => 'pong' } });

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
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'pong' } });

    await resolveModel('fake-key', {});
    mockGenerateContent.mockClear();
    const second = await resolveModel('fake-key', {});

    expect(second.modelId).toBe('gemini-3.6-flash');
    // No probing generateContent call on the second resolution.
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
