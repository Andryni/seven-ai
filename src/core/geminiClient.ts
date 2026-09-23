import { GoogleGenerativeAI, type GenerativeModel, type ModelParams } from '@google/generative-ai';

/**
 * Shared, resilient Gemini model resolution.
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

/**
 * Returns a ready-to-use GenerativeModel, trying `MODEL_CANDIDATES` in order
 * until one is accepted by the API (verified with a 1-token ping on the very
 * first call only). Every later call in the process reuses the cached id.
 */
export async function resolveModel(
  apiKey: string,
  params: Omit<ModelParams, 'model'>
): Promise<{ model: GenerativeModel; modelId: string }> {
  const genAI = new GoogleGenerativeAI(apiKey);

  if (cachedWorkingModel) {
    return { model: genAI.getGenerativeModel({ ...params, model: cachedWorkingModel }), modelId: cachedWorkingModel };
  }

  let lastError: unknown;
  for (const candidate of MODEL_CANDIDATES) {
    const model = genAI.getGenerativeModel({ ...params, model: candidate });
    try {
      // Cheapest possible real call: a 1-token ping, so the check costs
      // nothing more than the model id verification it exists for.
      await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 },
      });
      cachedWorkingModel = candidate;
      return { model, modelId: candidate };
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
export function getModelSync(apiKey: string, params: Omit<ModelParams, 'model'>): { model: GenerativeModel; modelId: string } {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = cachedWorkingModel ?? MODEL_CANDIDATES[0];
  return { model: genAI.getGenerativeModel({ ...params, model: modelId }), modelId };
}

export { MODEL_CANDIDATES };
