import * as FileSystem from 'expo-file-system/legacy';
import { resolveModel } from '../core/geminiClient';

/**
 * Cloud transcription fallback for clients such as Expo Go where the optional
 * native speech-recognition module cannot be loaded. The recording never
 * becomes a fake/sample command: either the user's own words are returned or
 * the capture fails honestly.
 */
export async function transcribeSpeechRecording(
  uri: string,
  apiKey: string,
  language: string = 'en'
): Promise<string> {
  if (!uri || !apiKey.trim()) return '';

  const audio = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!audio) return '';

  const { model } = await resolveModel(apiKey.trim(), {
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 256,
    },
    systemInstruction:
      'You are a speech-to-text engine. Return only the exact spoken words. Do not answer the request, add punctuation commentary, translate, or wrap the transcript in quotes. Return an empty string when no intelligible speech is present.',
  });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Transcribe this recording. The expected language is ${language}. Output only the transcript.`,
          },
          {
            inlineData: {
              mimeType: 'audio/mp4',
              data: audio,
            },
          },
        ],
      },
    ],
  });

  return (result.response.text() || '')
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^(["“])|(["”])$/g, '')
    .trim();
}
