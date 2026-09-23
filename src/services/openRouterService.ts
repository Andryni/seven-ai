/**
 * OpenRouter chat completion — the second brain.
 *
 * The Settings screen has had an "OpenRouter key (optional)" field for a
 * while, badged ACTIVE/OPTIONAL on the connectors card, but nothing ever
 * read it: typing a key there did precisely nothing. This service makes it
 * real — plain `fetch` against the OpenAI-compatible `/chat/completions`
 * endpoint, no SDK needed — and `sevenAgent` calls it when Gemini has no key
 * configured or is unreachable, so a user who only has an OpenRouter key
 * still gets a real model instead of the keyword fallback.
 */

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Token usage as reported by OpenRouter (absent on some routed models). */
export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface OpenRouterResult {
  text: string;
  /** Model that actually answered — OpenRouter resolves `openrouter/free` itself. */
  model?: string;
  usage?: OpenRouterUsage;
}

/** Reads a token count defensively: OpenRouter omits or nulls these fields. */
function readTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Free-tier router: OpenRouter itself picks an available free model. Kept
 * as the default so a pasted key works with zero extra configuration. */
const DEFAULT_MODEL = 'openrouter/free';

class OpenRouterService {
  private static instance: OpenRouterService;
  private constructor() {}

  public static getInstance(): OpenRouterService {
    if (!OpenRouterService.instance) {
      OpenRouterService.instance = new OpenRouterService();
    }
    return OpenRouterService.instance;
  }

  public isConfigured(apiKey?: string): boolean {
    return !!apiKey && apiKey.trim().length > 10;
  }

  /** Cheap key check for onboarding/settings — mirrors verifyGeminiKey. */
  public async verifyKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    const key = apiKey.trim();
    if (!key) return { ok: false, message: 'No key entered' };
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) return { ok: true, message: 'OpenRouter key valid' };
      if (res.status === 401) return { ok: false, message: 'Key rejected by OpenRouter' };
      return { ok: false, message: `OpenRouter answered ${res.status}` };
    } catch {
      return { ok: false, message: 'Could not reach OpenRouter (offline?)' };
    }
  }

  /**
   * Non-streaming completion — used as SEVEN's fallback brain. Kept
   * deliberately simple (no tool calling): OpenRouter here is a safety net
   * for plain conversation, not a second Director pipeline to maintain.
   *
   * Returns the answering model and token usage alongside the text so the HUD
   * can state which brain answered and what it cost (see brainTelemetry.ts).
   */
  public async chatWithUsage(
    apiKey: string,
    messages: OpenRouterMessage[],
    model: string = DEFAULT_MODEL
  ): Promise<OpenRouterResult> {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Required by OpenRouter for attribution; harmless if ignored.
        'X-Title': 'Seven AI',
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      throw new Error('OpenRouter returned an empty response');
    }

    const promptTokens = readTokenCount(data?.usage?.prompt_tokens);
    const completionTokens = readTokenCount(data?.usage?.completion_tokens);

    return {
      text,
      model: typeof data?.model === 'string' && data.model ? data.model : model,
      usage:
        promptTokens === undefined && completionTokens === undefined
          ? undefined
          : { promptTokens, completionTokens },
    };
  }

  /** Text-only convenience wrapper around `chatWithUsage`. */
  public async chat(
    apiKey: string,
    messages: OpenRouterMessage[],
    model: string = DEFAULT_MODEL
  ): Promise<string> {
    const { text } = await this.chatWithUsage(apiKey, messages, model);
    return text;
  }
}

export const openRouterService = OpenRouterService.getInstance();
