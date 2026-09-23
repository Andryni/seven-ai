import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';

/**
 * Shared, resilient Gemini model resolution.
 *
 * Migrated from the deprecated `@google/generative-ai` SDK (end-of-life
 * 2025-08-31, no longer receiving updates) to the actively maintained
 * `@google/genai` SDK. The new SDK exposes a single `GoogleGenAI` client
 * with stateless `ai.models.generateContent({ model, contents, config })`
 * calls instead of per-model `GenerativeModel` objects — `resolveModel`
 * below wraps that in a small adapter (`ResolvedModel`) that keeps the same
 * shape (`.generateContent(...)`, `.generateContentStream(...)`) the rest of
 * the codebase already called, so this migration does not ripple through
 * every agent file that consumes it.
 *
 * Every call site used to hardcode a single model id (`gemini-3.6-flash`).
 * That is fine the day it ships, but the Gemini API regularly retires/renames
 * models faster than this app's release cadence, and a bad id fails as a
 * flat 404 with no attempt to recover — the agent then silently drops to the
 * (much weaker) local keyword fallback with no indication of *why*.
 *
 * `resolveModel` tries a short list of known-good ids in order and sticks
 * with the first one that answers, for the lifetime of the process — so a
 * rename costs one extra request on the very first call, not one per turn.
 */

/** Newest first. Kept short: this is a safety net, not a version matrix. */
const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;

let cachedWorkingModel: string | null = null;

/** True for "this model id does not exist / is not available", as opposed to
 * quota, network or content-safety errors that no model swap would fix. */
function isModelNotFoundError(e: unknown): boolean {
  const msg = String((e as any)?.message || e || '');
  return /\b404\b|not found|is not supported for|unknown model|invalid model/i.test(msg);
}

export { isModelNotFoundError };

/** Everything the app's call sites pass as the "params" object used to be
 * shaped like `@google/generative-ai`'s `ModelParams` (minus `model`):
 * `systemInstruction`, `tools`, `generationConfig`. The new SDK folds all of
 * that (renamed to camelCase `generationConfig` -> nothing, it is just
 * `config`) into one `GenerateContentConfig`, so this type keeps the old,
 * familiar field name at the call sites and remaps it internally. */
export interface LegacyModelParams {
  systemInstruction?: string;
  tools?: GenerateContentConfig['tools'];
  generationConfig?: Partial<GenerateContentConfig>;
}

/** Minimal shape of a `@google/generative-ai` response, reproduced so every
 * call site that does `result.response.text()` / `.candidates` keeps working
 * unchanged against the new SDK's `response.text` / `.candidates` getters. */
/**
 * Token accounting as the API reports it. Absent on non-final streamed chunks
 * and on some safety-blocked responses, which is why every read site treats it
 * as optional and the HUD shows "unavailable" instead of zero.
 */
export interface UsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

interface LegacyResponseLike {
  text: () => string | undefined;
  candidates?: { content?: { parts?: any[] } }[];
  usageMetadata?: UsageMetadataLike;
}

interface LegacyResultLike {
  response: LegacyResponseLike;
}

/** Adapter exposing the same two methods every call site already used
 * (`generateContent`, `generateContentStream`) on top of the new SDK's
 * stateless `ai.models.*` functions. */
/** One incrementally-yielded chunk of a streamed response. Exposes
 * `candidates` (not just concatenated text) so callers can detect a
 * `functionCall` part arriving mid-stream — needed to keep true streaming
 * for plain-text answers while still supporting tool-calling responses,
 * which carry no meaningful text to stream at all. */
interface StreamChunkLike {
  text: () => string | undefined;
  candidates?: { content?: { parts?: any[] } }[];
  usageMetadata?: UsageMetadataLike;
}

export interface ResolvedModel {
  generateContent: (request: { contents: any } | string) => Promise<LegacyResultLike>;
  generateContentStream: (
    request: { contents: any } | string
  ) => Promise<{ stream: AsyncGenerator<StreamChunkLike> }>;
}

function wrapResponse(response: {
  text?: string;
  candidates?: any[];
  usageMetadata?: UsageMetadataLike;
}): LegacyResultLike {
  return {
    response: {
      text: () => response.text,
      candidates: response.candidates,
      // Forwarded so callers can report the real cost of a turn (the HUD brain
      // readout) rather than a made-up number.
      usageMetadata: response.usageMetadata,
    },
  };
}

function buildConfig(params: LegacyModelParams): GenerateContentConfig {
  return {
    ...(params.generationConfig || {}),
    systemInstruction: params.systemInstruction,
    tools: params.tools,
  };
}

function makeResolvedModel(ai: GoogleGenAI, modelId: string, params: LegacyModelParams): ResolvedModel {
  const config = buildConfig(params);
  return {
    generateContent: async (request) => {
      const contents = typeof request === 'string' ? request : request.contents;
      const response = await ai.models.generateContent({ model: modelId, contents, config });
      return wrapResponse(response);
    },
    generateContentStream: async (request) => {
      const contents = typeof request === 'string' ? request : request.contents;
      const stream = await ai.models.generateContentStream({ model: modelId, contents, config });
      async function* iterate() {
        for await (const chunk of stream) {
          yield {
            text: () => chunk.text,
            candidates: chunk.candidates,
            usageMetadata: chunk.usageMetadata,
          };
        }
      }
      return { stream: iterate() };
    },
  };
}

/**
 * Returns a ready-to-use model wrapper, trying `MODEL_CANDIDATES` in order
 * until one is accepted by the API (verified with a 1-token ping on the very
 * first call only). Every later call in the process reuses the cached id.
 */
export async function resolveModel(
  apiKey: string,
  params: LegacyModelParams
): Promise<{ model: ResolvedModel; modelId: string }> {
  const ai = new GoogleGenAI({ apiKey });

  if (cachedWorkingModel) {
    return { model: makeResolvedModel(ai, cachedWorkingModel, params), modelId: cachedWorkingModel };
  }

  let lastError: unknown;
  for (const candidate of MODEL_CANDIDATES) {
    try {
      // Cheapest possible real call: a 1-token ping, so the check costs
      // nothing more than the model id verification it exists for.
      await ai.models.generateContent({
        model: candidate,
        contents: 'ping',
        config: { maxOutputTokens: 1 },
      });
      cachedWorkingModel = candidate;
      return { model: makeResolvedModel(ai, candidate, params), modelId: candidate };
    } catch (e) {
      lastError = e;
      if (!isModelNotFoundError(e)) {
        // Quota/network/safety error: swapping models will not help and the
        // caller needs to see this error, not a confusing 4th retry.
        throw e;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Synchronous helper for call sites that already know a model works this
 * session (avoids re-probing on every request). Falls back to the first
 * candidate if nothing has been resolved yet. */
export function getModelSync(apiKey: string, params: LegacyModelParams): { model: ResolvedModel; modelId: string } {
  const ai = new GoogleGenAI({ apiKey });
  const modelId = cachedWorkingModel ?? MODEL_CANDIDATES[0];
  return { model: makeResolvedModel(ai, modelId, params), modelId };
}

export { MODEL_CANDIDATES };
