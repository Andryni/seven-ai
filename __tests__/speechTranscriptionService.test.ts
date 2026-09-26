const mockReadAsStringAsync = jest.fn();
const mockGenerateContent = jest.fn();
const mockResolveModel = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
}));

jest.mock('../src/core/geminiClient', () => ({
  resolveModel: (...args: unknown[]) => mockResolveModel(...args),
}));

// Mocks must be installed before the service module is evaluated.
// eslint-disable-next-line import/first
import { transcribeSpeechRecording } from '../src/services/speechTranscriptionService';

describe('transcribeSpeechRecording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadAsStringAsync.mockResolvedValue('REAL_AUDIO_BASE64');
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '“Quel temps fait-il à Antananarivo ?”' },
    });
    mockResolveModel.mockResolvedValue({
      model: { generateContent: mockGenerateContent },
      modelId: 'gemini-test',
    });
  });

  it("returns the user's actual transcript and sends the recorded audio", async () => {
    await expect(
      transcribeSpeechRecording('file:///recording.m4a', 'api-key', 'fr-FR')
    ).resolves.toBe('Quel temps fait-il à Antananarivo ?');

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const request = mockGenerateContent.mock.calls[0][0];
    expect(request.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: 'audio/mp4', data: 'REAL_AUDIO_BASE64' },
    });
  });

  it('never invents a transcript when credentials are unavailable', async () => {
    await expect(
      transcribeSpeechRecording('file:///recording.m4a', '', 'fr-FR')
    ).resolves.toBe('');
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
