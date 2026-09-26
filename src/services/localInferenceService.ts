import { useSevenStore } from '../store/useSevenStore';
import { fetchWithTimeout } from './network';

export interface LocalInferenceResult {
  text: string;
  provider: 'device-endpoint' | 'extractive-local';
  model: string;
  latencyMs: number;
}

class LocalInferenceService {
  async complete(prompt: string, context = ''): Promise<LocalInferenceResult> {
    const started = Date.now();
    const config = useSevenStore.getState().config;
    const endpoint = config.localModelEndpoint?.trim().replace(/\/$/, '');
    if (config.localInferenceEnabled && endpoint) {
      if (!/^https?:\/\//i.test(endpoint)) throw new Error('Local model endpoint must be an HTTP(S) URL.');
      const response = await fetchWithTimeout(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.localModelToken ? { Authorization: `Bearer ${config.localModelToken}` } : {}),
        },
        body: JSON.stringify({
          model: config.localModelName || 'local-model',
          messages: [
            { role: 'system', content: 'You are SEVEN local core. Be concise, private and truthful.' },
            ...(context ? [{ role: 'system', content: `Local context:\n${context.slice(0, 12000)}` }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        }),
      }, 45_000);
      if (!response.ok) throw new Error(`Local inference endpoint returned ${response.status}.`);
      const json = await response.json();
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('Local model returned no text.');
      return { text: text.trim(), provider: 'device-endpoint', model: json?.model || config.localModelName || 'local-model', latencyMs: Date.now() - started };
    }

    // A deterministic offline fallback is useful for document triage and
    // summaries, but is explicitly labeled extractive rather than pretending
    // to be a generative model.
    const source = context || prompt;
    const sentences = source.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
    const terms = prompt.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
    const ranked = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: terms.reduce((score, term) => score + (sentence.toLowerCase().includes(term) ? 1 : 0), 0),
    })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).sort((a, b) => a.index - b.index);
    return {
      text: ranked.map((entry) => entry.sentence).join(' ') || 'No local evidence was available.',
      provider: 'extractive-local',
      model: 'SEVEN extractive core',
      latencyMs: Date.now() - started,
    };
  }

  async analyzeImage(base64: string, mimeType: string, prompt = 'Extract all visible text in reading order. Return plain text only.'): Promise<LocalInferenceResult> {
    const started = Date.now();
    const config = useSevenStore.getState().config;
    const endpoint = config.localModelEndpoint?.trim().replace(/\/$/, '');
    if (!config.localInferenceEnabled || !endpoint) throw new Error('A local multimodal endpoint is required for offline OCR.');
    const response = await fetchWithTimeout(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.localModelToken ? { Authorization: `Bearer ${config.localModelToken}` } : {}) },
      body: JSON.stringify({
        model: config.localModelName || 'local-model',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }] }],
        temperature: 0,
      }),
    }, 60_000);
    if (!response.ok) throw new Error(`Local multimodal endpoint returned ${response.status}.`);
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Local OCR returned no text.');
    return { text: text.trim(), provider: 'device-endpoint', model: json?.model || config.localModelName || 'local-model', latencyMs: Date.now() - started };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const result = await this.complete('Reply only with LOCAL_OK.');
      return { ok: true, detail: `${result.provider} · ${result.model} · ${result.latencyMs} ms` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const localInferenceService = new LocalInferenceService();
