import { FunctionDeclaration, Part, SchemaType } from '@google/generative-ai';
import { resolveModel } from './geminiClient';
import { openRouterService } from '../services/openRouterService';
import { useSevenStore } from '../store/useSevenStore';
import { ChatMessage } from '../types';
import { fileOrganizer } from '../services/fileOrganizer';
import { daveAgent } from './daveAgent';
import { researchService } from '../services/researchService';
import { gmailService } from '../services/gmailService';
import { instagramService } from '../services/instagramService';
import { selfHealing } from './selfHealing';
import { deviceControl } from '../services/deviceControlService';
import { webSearchService } from '../services/webSearchService';
import { sandboxService } from '../services/sandboxService';
import { memoryService } from '../services/memoryService';

interface ToolExecutionResult {
  text: string;
  toolCall?: ChatMessage['toolCall'];
  raw?: unknown;
}

/** Shared chat result shape for both buffered and streaming paths. */
export interface ChatResult {
  text: string;
  toolCall?: ChatMessage['toolCall'];
  terminalLogs?: string[];
}

/**
 * Tool declarations exposed to Gemini function calling.
 * The model decides which tool to invoke instead of the previous brittle
 * keyword-matching chain ("includes('portfolio')"), which produced false
 * positives and could only ever fire one hard-coded intent.
 */
const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'organize_files',
    description:
      'Scan the Downloads directory, categorize files into subfolders (Images, Documents, Installers, Audio, Video, Code, Others) and record an undo journal.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'undo_file_organization',
    description: 'Undo the last file organization and restore files to their original locations.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'build_website',
    description:
      'Synthesize a complete modern responsive website (index.html, style.css, script.js) from a description using the Dave Agent.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        description: { type: SchemaType.STRING, description: 'What the website should be about and include.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'create_research_pdf',
    description: 'Research a topic in depth and compile the result into a styled PDF report.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        topic: { type: SchemaType.STRING, description: 'The research topic.' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'check_unread_emails',
    description: 'Fetch the latest unread emails from the connected Gmail account.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'check_instagram_messages',
    description: 'Report on Instagram direct messages (opens a browser session; no public DM API exists).',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_last_patch_report',
    description: 'Return the most recent self-healing patch report.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'test_self_healing',
    description: 'Run a controlled self-healing simulation: inject a bug and record the recovery patch.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'forget_memory',
    description: 'Erase the permanent user memory notes (when the user asks you to forget everything / reset your memory).',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'search_web',
    description: 'Search the live web in real-time for breaking news, topics, current events or documentation.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'The search query or topic to look up.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'make_phone_call',
    description: 'Open Android phone dialer to call a phone number.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone_number: { type: SchemaType.STRING, description: 'The phone number to call.' },
      },
      required: ['phone_number'],
    },
  },
  {
    name: 'send_sms',
    description: 'Open Android SMS messenger to send a text to a phone number.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone_number: { type: SchemaType.STRING, description: 'The phone number to message.' },
        message: { type: SchemaType.STRING, description: 'Optional text message body.' },
      },
      required: ['phone_number'],
    },
  },
  {
    name: 'open_whatsapp',
    description: 'Open WhatsApp with an optional contact phone number and prefilled message.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phone_number: { type: SchemaType.STRING, description: 'Optional contact phone number.' },
        text: { type: SchemaType.STRING, description: 'Message to send on WhatsApp.' },
      },
    },
  },
  {
    name: 'open_navigation',
    description: 'Open Android Maps / GPS navigation to a specified address or landmark.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        destination: { type: SchemaType.STRING, description: 'The address, place, city, or destination coordinates.' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'get_battery_status',
    description: 'Check Android hardware battery percentage, charging state, and low power mode status.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'read_clipboard',
    description: 'Read the latest copied text content currently stored in the device clipboard.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'copy_to_clipboard',
    description: 'Copy a specified text or code snippet to the device clipboard.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        text: { type: SchemaType.STRING, description: 'Text or code to copy to clipboard.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'execute_code_sandbox',
    description: 'Execute JavaScript code in a safe local sandbox to compute math, process arrays/strings, or verify logic.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        code: { type: SchemaType.STRING, description: 'JavaScript code to execute.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'remember_fact',
    description: 'Save a personal fact, habit, or instruction about the user into persistent long-term semantic memory.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fact: { type: SchemaType.STRING, description: 'The fact or user preference to remember forever.' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'recall_memories',
    description: 'Search long-term semantic memory for stored user preferences, projects, or personal facts.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Topic or question to look up in memory.' },
      },
      required: ['query'],
    },
  },
];

const SYSTEM_INSTRUCTION = `You are SEVEN (Seven AI), an ultra-intelligent, sharp, elegant JARVIS-like AI assistant running natively on Android.
Keep your responses intelligent, concise, futuristic, and helpful. You speak and understand both French and English fluently; respond in the language used by the user.
You have tools: live web search, phone calls, SMS, WhatsApp dispatch, GPS navigation, file organization, website synthesis (Dave Agent), research-to-PDF, Gmail reading, memory management, and a self-healing engine.
When the user asks for one of those actions, call the matching tool instead of pretending you did it.
You may CHAIN several tools when the request has multiple steps (e.g. "research X then organize my files") — after each tool result, either request the next tool or produce the final answer.
When no tool matches, answer conversationally.`;

/** Max prior messages replayed to Gemini for conversational context. */
const MAX_HISTORY_MESSAGES = 12;

/** Max tools the Director pipeline may chain in a single request. */
const MAX_TOOL_STEPS = 3;

/**
 * Run a Gemini call with automatic retry on transient failures (503 overload,
 * 429 quota spike). Google's flash models regularly answer 503 under load;
 * two quick retries with backoff recover most of them transparently.
 */
async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e);
      // Quota/billing exhaustion is not transient: retrying only delays the
      // honest local fallback the user is waiting on. Fail through instantly.
      const quota = /\b429\b|resource_exhausted|quota|billing/i.test(msg);
      const transient = !quota && /\b(503|429)\b|overload|high demand|temporarily|try again later/i.test(msg);
      if ((!transient && !quota) || i === attempts - 1 || quota) throw e;
      const delayMs = 900 * (i + 1) + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

export class SevenAgent {
  private static instance: SevenAgent;
  private constructor() {}

  public static getInstance(): SevenAgent {
    if (!SevenAgent.instance) {
      SevenAgent.instance = new SevenAgent();
    }
    return SevenAgent.instance;
  }

  /** True once the quota notice has been said — it is not repeated on every message. */
  private quotaNoticeShown = false;

  /** Quota/limit exhaustion (429, RESOURCE_EXHAUSTED) rather than a network outage. */
  private isQuotaError(e: unknown): boolean {
    return /429|resource_exhausted|quota|billing/i.test(String((e as any)?.message || e));
  }

  /**
   * Degrades a failed Gemini turn to the local engine instead of surfacing a
   * raw error: the app stays usable while the quota refills or the network
   * comes back. The reason is stated honestly, but only once per outage.
   */
  private async degradeToLocal(
    userPrompt: string,
    error: unknown,
    onToken?: (t: string) => void
  ): Promise<ChatResult> {
    const store = useSevenStore.getState();
    const fr = (store.config.language || 'en') === 'fr';
    const message = String((error as any)?.message || error);
    store.addTerminalLog(`Gemini unavailable — local mode (${message.slice(0, 90)})`, 'warn');

    const quota = this.isQuotaError(error);
    let notice = '';
    if (!this.quotaNoticeShown) {
      this.quotaNoticeShown = true;
      notice = quota
        ? fr
          ? '⚠ Quota Gemini atteint — je continue en mode local jusqu’au rétablissement.\n\n'
          : '⚠ Gemini quota reached — continuing in local mode until it resets.\n\n'
        : fr
          ? '⚠ Gemini injoignable — je continue en mode local.\n\n'
          : '⚠ Gemini unreachable — continuing in local mode.\n\n';
    }

    let res: ChatResult;
    // Second brain before the weak keyword engine: if the user configured an
    // OpenRouter key, a real (if less integrated) model beats string-matching.
    if (openRouterService.isConfigured(store.config.openRouterKey)) {
      try {
        res = await this.chatWithOpenRouter(userPrompt);
        const text = `${notice}${res.text}`;
        if (onToken) await this.replayAsChunks(text, onToken);
        return { ...res, text };
      } catch (e: any) {
        store.addTerminalLog(`OpenRouter fallback failed (${e?.message || e}); using local engine.`, 'warn');
      }
    }
    try {
      res = await this.chatLocalFallback(userPrompt, quota ? 'quota' : 'offline');
    } catch {
      res = {
        text: fr
          ? 'Je n’ai pas pu traiter cette commande, même en mode local.'
          : 'I could not process that command, even in local mode.',
      };
    }
    const text = `${notice}${res.text}`;
    if (onToken) await this.replayAsChunks(text, onToken);
    return { ...res, text };
  }

  // ------------------------------------------------------------------ Tools

  private async executeTool(
    name: string,
    args: Record<string, any>,
    /** Called with human-readable progress lines while the tool runs. */
    onEvent?: (line: string) => void
  ): Promise<ToolExecutionResult> {
    const store = useSevenStore.getState();

    switch (name) {
      case 'organize_files': {
        onEvent?.('STORAGE KERNEL: scanning downloads directory...');
        const result = await fileOrganizer.organizeDownloads();
        return {
          text: `Storage scan complete. ${result.message} A full journal has been recorded at organizer_log.json for atomic undo.`,
          toolCall: {
            name: 'organizer',
            status: 'completed',
            summary: `Organized ${result.totalFiles} files into categorized folders with Undo protection.`,
            result,
          },
          raw: result,
        };
      }

      case 'undo_file_organization': {
        onEvent?.('STORAGE KERNEL: initiating rollback from organizer journal...');
        const undoRes = await fileOrganizer.undoLastOrganization();
        return {
          text: undoRes.message,
          toolCall: {
            name: 'organizer',
            status: 'completed',
            summary: `Restored ${undoRes.restoredCount} files to root storage.`,
          },
          raw: undoRes,
        };
      }

      case 'build_website': {
        onEvent?.('DAVE AGENT: spinning up web synthesis pipeline...');
        const description = String(args?.description || 'developer portfolio website');
        store.setStatus('building');
        const project = await daveAgent.buildProject(description);
        return {
          text: `I have completed the synthesis for your website "${project.name}". All 3 modules (index.html, style.css, script.js) have been compiled and mounted into SevenUploads. You can preview it live or open it in your browser.`,
          toolCall: {
            name: 'dave_build',
            status: 'completed',
            summary: `Synthesized 3 files in SevenUploads/${project.name}/ (HTML, CSS, JS).`,
            projectId: project.id,
            filePath: project.folderPath,
          },
          raw: { name: project.name },
        };
      }

      case 'create_research_pdf': {
        onEvent?.('RESEARCH CORE: querying deep intelligence synthesis matrix...');
        const topic = String(args?.topic || 'AI and Autonomous Systems');
        const doc = await researchService.researchTopicAndCreatePdf(topic);
        return {
          text: `Research document "${doc.title}" compiled and exported to PDF successfully. High-resolution print formatting applied with executive briefing layout.`,
          toolCall: {
            name: 'research_pdf',
            status: 'completed',
            summary: `Document: "${doc.title}" generated and saved to device storage.`,
            filePath: doc.pdfUri,
          },
          raw: { title: doc.title, pdfUri: doc.pdfUri },
        };
      }

      case 'check_unread_emails': {
        onEvent?.('GMAIL CONNECTOR: fetching unread messages...');
        const summary = await gmailService.fetchUnreadEmails();
        return {
          text: summary,
          toolCall: {
            name: 'gmail_read',
            status: 'completed',
            summary: 'Fetched unread messages from the connected Gmail account.',
          },
        };
      }

      case 'check_instagram_messages': {
        onEvent?.('INSTAGRAM CONNECTOR: checking DM bridge status...');
        const summary = await instagramService.checkDirectMessages();
        return {
          text: summary,
          toolCall: {
            name: 'instagram_check',
            status: 'completed',
            summary: 'Instagram DM check (browser session; no public DM API).',
          },
        };
      }

      case 'get_last_patch_report': {
        const lastPatch = selfHealing.getLastPatch();
        if (!lastPatch) {
          return {
            text: 'No active patches found. The runtime is nominal with zero recorded regressions.',
          };
        }
        return {
          text: `Last patch ID is ${lastPatch.id}, targeting ${lastPatch.targetFile}. Error resolved: "${lastPatch.error}". Source: ${lastPatch.engine}.`,
          toolCall: {
            name: 'self_heal',
            status: 'completed',
            patchId: lastPatch.id,
            summary: `Patch ${lastPatch.id} on ${lastPatch.targetFile}`,
          },
        };
      }

      case 'test_self_healing': {
        onEvent?.('ANTI-PANIC ENGINE: injecting controlled regression...');
        const patch = await selfHealing.simulateBugAndAutoFix();
        return {
          text: `Anti-Panic Engine triggered and recovered. Captured runtime error, synthesized a fix report and recorded patch ID: ${patch.id}.`,
          toolCall: {
            name: 'self_heal',
            status: 'completed',
            patchId: patch.id,
            summary: `Recovered from simulated runtime regression. Patch ${patch.id} recorded.`,
          },
        };
      }

      case 'forget_memory': {
        const hadMemory = !!store.config.memoryNotes?.trim();
        await store.setConfig({ memoryNotes: '' });
        return {
          text: hadMemory
            ? 'Permanent memory erased. I will treat every future conversation as a fresh start.'
            : 'My permanent memory was already empty — nothing to forget.',
          toolCall: {
            name: 'self_heal',
            status: 'completed',
            summary: 'Long-term memory cleared by user request.',
          },
        };
      }

      case 'search_web': {
        const query = String(args.query || '').trim();
        onEvent?.(`WEB INTELLIGENCE: querying live index for "${query}"...`);
        const searchRes = await webSearchService.searchWeb(
          query,
          (store.config.language || 'en') === 'fr' ? 'fr' : 'en'
        );
        return {
          text: searchRes.summary,
          toolCall: {
            name: 'web_search',
            status: 'completed',
            summary: `Web search: ${searchRes.results.length} live source(s) extracted for "${query}".`,
            result: searchRes.results,
          },
        };
      }

      case 'make_phone_call': {
        const phone = String(args.phone_number || '').trim();
        onEvent?.(`TELEPHONY MATRIX: initiating call to ${phone}...`);
        const res = await deviceControl.callNumber(phone);
        return {
          text: res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: `Call: ${phone}`,
          },
        };
      }

      case 'send_sms': {
        const phone = String(args.phone_number || '').trim();
        const msg = String(args.message || '').trim();
        onEvent?.(`SMS SUBSYSTEM: dispatching to ${phone}...`);
        const res = await deviceControl.sendSms(phone, msg);
        return {
          text: res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: `SMS to ${phone}`,
          },
        };
      }

      case 'open_whatsapp': {
        const phone = args.phone_number ? String(args.phone_number).trim() : undefined;
        const txt = args.text ? String(args.text).trim() : undefined;
        onEvent?.('MESSENGER BRIDGE: launching WhatsApp...');
        const res = await deviceControl.openWhatsApp(phone, txt);
        return {
          text: res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: 'WhatsApp dispatch',
          },
        };
      }

      case 'open_navigation': {
        const dest = String(args.destination || '').trim();
        onEvent?.(`GEO NAVIGATION: routing coordinates to "${dest}"...`);
        const res = await deviceControl.openMaps(dest);
        return {
          text: res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: `Navigation to ${dest}`,
          },
        };
      }

      case 'get_battery_status': {
        onEvent?.('POWER MATRIX: reading hardware battery telemetry...');
        const res = await deviceControl.getBatteryStatus();
        return {
          text: res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: res.message,
          },
        };
      }

      case 'read_clipboard': {
        onEvent?.('MEMORY BUFFER: polling clipboard content...');
        const res = await deviceControl.readClipboard();
        return {
          text: res.data ? `Clipboard Content:\n"${res.data}"` : res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: 'Read clipboard',
          },
        };
      }

      case 'copy_to_clipboard': {
        const txt = String(args.text || '').trim();
        onEvent?.('MEMORY BUFFER: copying to system clipboard...');
        const res = await deviceControl.copyToClipboard(txt);
        return {
          text: res.message,
          toolCall: {
            name: 'device_action',
            status: res.success ? 'completed' : 'failed',
            summary: 'Copied to clipboard',
          },
        };
      }

      case 'execute_code_sandbox': {
        const code = String(args.code || '').trim();
        onEvent?.('CODE MATRIX: executing JavaScript snippet in sandbox...');
        const exec = await sandboxService.executeAsync(code);
        return {
          text: exec.success
            ? `Sandbox Execution Success (${exec.executionTimeMs}ms):\nResult: ${JSON.stringify(exec.result, null, 2)}\nLogs: ${exec.logs.join(' | ') || 'None'}`
            : `Sandbox Execution Error (${exec.executionTimeMs}ms): ${exec.error}`,
          toolCall: {
            name: 'code_sandbox',
            status: exec.success ? 'completed' : 'failed',
            summary: `Executed code snippet (${exec.executionTimeMs}ms)`,
          },
        };
      }

      case 'remember_fact': {
        const fact = String(args.fact || '').trim();
        onEvent?.('NEURAL RAG: saving fact to persistent long-term storage...');
        const stored = await memoryService.rememberFact(fact);
        return {
          text: `Fact securely committed to persistent memory: "${stored.content}".`,
          toolCall: {
            name: 'memory',
            status: 'completed',
            summary: `Remembered: "${stored.content.slice(0, 40)}..."`,
          },
        };
      }

      case 'recall_memories': {
        const query = String(args.query || '').trim();
        onEvent?.(`NEURAL RAG: searching semantic memory for "${query}"...`);
        const results = await memoryService.searchRelevantFacts(query);
        return {
          text: results.length > 0
            ? `Relevant Memories:\n${results.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
            : `No memories found matching "${query}".`,
          toolCall: {
            name: 'memory',
            status: 'completed',
            summary: `Recalled ${results.length} memory records`,
          },
        };
      }

      default:
        return { text: `Unknown tool "${name}".` };
    }
  }

  // --------------------------------------------------------------- Gemini AI

  /**
   * System instruction enriched with the user's persistent memory notes so
   * every request is personalized without replaying old chats.
   */
  private getSystemInstruction(): string {
    const notes = useSevenStore.getState().config.memoryNotes?.trim();
    if (!notes) return SYSTEM_INSTRUCTION;
    return `${SYSTEM_INSTRUCTION}

PERMANENT USER MEMORY (follow these preferences in every answer):
${notes}`;
  }

  /**
   * Resolves a working Gemini model, trying a short list of known-good ids
   * (see `geminiClient.ts`) instead of hardcoding one — a renamed/retired
   * model id used to fail as an opaque 404 that silently dropped the whole
   * agent to the weak keyword fallback with no clue why.
   */
  private async getModel(apiKey: string) {
    const { model, modelId } = await resolveModel(apiKey, {
      systemInstruction: this.getSystemInstruction(),
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    });
    if (modelId !== 'gemini-3.6-flash') {
      useSevenStore
        .getState()
        .addTerminalLog(`NEURAL CORE: using fallback model "${modelId}" (primary unavailable)`, 'warn');
    }
    return model;
  }

  /**
   * Builds multi-turn Gemini `contents` from the stored chat history so
   * exchanges are contextual instead of isolated one-shot prompts.
   *
   * - 'user' messages map to role "user", assistant replies to role "model".
   * - Empty/system/placeholder messages (e.g. the streaming placeholder) are
   *   skipped.
   * - The current prompt is appended unless it is already the last user turn
   *   (screens add it to the store before calling the agent).
   * - Gemini requires the first turn to be a user turn.
   */
  private buildChatContents(history: ChatMessage[], currentPrompt: string) {
    const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

    const recent = history
      .filter((m) => (m.sender === 'user' || m.sender === 'seven') && m.text.trim().length > 0)
      .slice(-MAX_HISTORY_MESSAGES);

    for (const msg of recent) {
      contents.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      });
    }

    const lastText = contents.length > 0 ? contents[contents.length - 1].parts[0].text : '';
    if (lastText !== currentPrompt) {
      contents.push({ role: 'user', parts: [{ text: currentPrompt }] });
    }

    while (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }

    return contents;
  }

  /**
   * Plain conversational completion via OpenRouter — the second brain used
   * when Gemini has no key configured or is unreachable. Deliberately no
   * tool calling here: a handful of recent turns plus the system
   * instruction is enough for it to behave like SEVEN in conversation, and
   * keeping it text-only avoids maintaining a second Director pipeline.
   */
  private async chatWithOpenRouter(userPrompt: string): Promise<{ text: string }> {
    const store = useSevenStore.getState();
    const config = store.config;
    const apiKey = (config.openRouterKey || '').trim();

    store.addTerminalLog('Gemini unavailable — routing through OpenRouter...', 'cmd');

    const history = useSevenStore.getState().chatHistory;
    const recent = history
      .filter((m) => (m.sender === 'user' || m.sender === 'seven') && m.text.trim().length > 0)
      .slice(-MAX_HISTORY_MESSAGES);

    const messages = [
      { role: 'system' as const, content: this.getSystemInstruction() },
      ...recent.map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      })),
      { role: 'user' as const, content: userPrompt },
    ];

    const text = await openRouterService.chat(apiKey, messages);
    store.addTerminalLog('OpenRouter response received [200 OK]', 'success');
    return { text };
  }

  private async chatWithGemini(
    userPrompt: string,
    onToken?: (token: string) => void
  ): Promise<{ text: string; toolCall?: ChatMessage['toolCall'] }> {
    const store = useSevenStore.getState();
    const config = store.config;
    const apiKey = config.geminiApiKey;

    store.addTerminalLog('Querying Gemini 2.0 Flash neural brain [function calling]...', 'cmd');
    const model = await this.getModel(apiKey);

    // Multi-turn context: replay prior exchanges plus the current prompt.
    const history = useSevenStore.getState().chatHistory;
    const contents = this.buildChatContents(history, userPrompt);

    const result = await withTransientRetry(() => model.generateContent({ contents }));
    const candidate = result.response.candidates?.[0];
    const functionCallPart: Part | undefined = candidate?.content?.parts?.find(
      (p: any) => p.functionCall
    );

    // No tool matched: plain conversational answer.
    if (!functionCallPart?.functionCall) {
      const text = result.response.text();
      store.addTerminalLog('Gemini response received [200 OK]', 'success');
      return { text };
    }

    const { name, args } = functionCallPart.functionCall as { name: string; args: Record<string, any> };
    store.addTerminalLog(`Gemini requested tool: ${name}`, 'cmd');

    let toolResult: ToolExecutionResult;
    try {
      toolResult = await this.executeTool(name, args || {});
    } catch (e: any) {
      const message = e?.message || String(e);
      store.addTerminalLog(`Tool ${name} failed: ${message}`, 'error');
      // Report the failure honestly to both the model and the user.
      toolResult = {
        text: `The tool "${name}" failed: ${message}`,
        toolCall: {
          name: this.mapToolToToolCallName(name),
          status: 'failed',
          summary: message,
        },
      };
      return toolResult;
    }

    // ---- Tool chain (Director pipeline) ----
    // After each tool result the model either phrases the final answer OR
    // requests the next tool ("research X then organize my files" chains two
    // tools). Single-tool flows cost exactly one follow-up call, same as before.
    let chainContents: { role: 'user' | 'model'; parts: any[] }[] = [
      ...contents,
      { role: 'model', parts: [functionCallPart] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name,
              response: { result: toolResult.text.slice(0, 4000) },
            },
          },
        ],
      },
    ];
    let lastToolCall = toolResult.toolCall;
    let lastToolText = toolResult.text;

    try {
      for (let step = 0; step < MAX_TOOL_STEPS; step++) {
        const followUp = await model.generateContent({ contents: chainContents });
        const cand = followUp.response.candidates?.[0];
        const nextCallPart: Part | undefined = cand?.content?.parts?.find(
          (p: any) => p.functionCall
        );

        if (!nextCallPart?.functionCall) {
          const finalText = followUp.response.text() || lastToolText;
          return { text: finalText, toolCall: lastToolCall };
        }

        const { name: nextName, args: nextArgs } = nextCallPart.functionCall as {
          name: string;
          args: Record<string, any>;
        };
        store.addTerminalLog(
          `DIRECTOR PIPELINE: chaining tool ${nextName} (step ${step + 2})`,
          'cmd'
        );

        let nextResult: ToolExecutionResult;
        try {
          nextResult = await this.executeTool(nextName, nextArgs || {});
        } catch (e: any) {
          const message = e?.message || String(e);
          store.addTerminalLog(`Tool ${nextName} failed: ${message}`, 'error');
          nextResult = { text: `The tool "${nextName}" failed: ${message}` };
        }

        lastToolCall = nextResult.toolCall || lastToolCall;
        lastToolText = nextResult.text;

        chainContents = [
          ...chainContents,
          { role: 'model', parts: [nextCallPart] },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: nextName,
                  response: { result: nextResult.text.slice(0, 4000) },
                },
              },
            ],
          },
        ];
      }

      // Chain limit reached: summarize the completed steps.
      const limitFollowUp = await model.generateContent({
        contents: [
          ...chainContents,
          { role: 'user', parts: [{ text: 'Tool chain limit reached. Summarize the completed steps now.' }] },
        ],
      });
      return { text: limitFollowUp.response.text() || lastToolText, toolCall: lastToolCall };
    } catch (e: any) {
      store.addTerminalLog(`Post-tool synthesis failed (${e?.message || e}); returning raw tool output.`, 'warn');
      return { text: lastToolText, toolCall: lastToolCall };
    }
  }

  /**
   * Streaming variant: emits text chunks as they arrive from Gemini so the UI
   * can render the answer progressively. Tool flows still work — tools emit
   * progress events through onToken (prefixed lines shown as status), the
   * first pass runs unstreamed (needed to finalize the function call), and the
   * second pass (post-tool phrasing) streams its tokens.
   */
  public async chatStream(
    userPrompt: string,
    onToken: (token: string) => void,
    image?: { uri?: string; base64?: string; mimeType?: string }
  ): Promise<ChatResult> {
    const store = useSevenStore.getState();
    const config = store.config;

    store.setStatus('thinking');
    store.addTerminalLog(`USER PROMPT: "${userPrompt || (image ? '[Image Analysis]' : '')}"`, 'cmd');

    try {
      // No Gemini key: try OpenRouter (if the user configured one) before
      // falling all the way back to the keyword engine. No streaming on
      // this path — it is a safety net, not a second Director pipeline.
      if (!config.geminiApiKey || config.geminiApiKey.trim().length <= 5) {
        if (image) {
          const res = {
            text: 'Vision / Image analysis requires a Gemini API key. Configure your API key in Settings.',
            toolCall: {
              name: 'vision' as const,
              status: 'failed' as const,
              summary: 'Missing Gemini API key',
            },
          };
          await this.replayAsChunks(res.text, onToken);
          return res;
        }
        if (openRouterService.isConfigured(config.openRouterKey)) {
          try {
            const res = await this.chatWithOpenRouter(userPrompt);
            await this.replayAsChunks(res.text, onToken);
            return res;
          } catch (e: any) {
            store.addTerminalLog(`OpenRouter fallback failed (${e?.message || e}); using local engine.`, 'warn');
          }
        }
        const res = await this.chatLocalFallback(userPrompt);
        return res;
      }

      const model = await this.getModel(config.geminiApiKey);

      // Multi-turn context for pass 1
      const history = useSevenStore.getState().chatHistory;
      const contents: any[] = this.buildChatContents(history, userPrompt);

      // If an image was attached to this prompt, append inline image data part to user turn
      if (image && image.base64) {
        const imagePart = {
          inlineData: {
            data: image.base64,
            mimeType: image.mimeType || 'image/jpeg',
          },
        };
        // Insert into the last user turn in contents
        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
          contents[contents.length - 1].parts.push(imagePart);
        } else {
          contents.push({
            role: 'user',
            parts: [{ text: userPrompt || 'Analyze and describe what is visible in this image in detail.' }, imagePart],
          });
        }
        store.addTerminalLog('OCULAR SUBSYSTEM: Multimodal image attached to Gemini payload', 'info');
      }

      // ---- Pass 1 (unstreamed): collect the full answer / function call ----
      const result = await withTransientRetry(() => model.generateContent({ contents }));
      // A successful remote call ends the current outage: the next failure may
      // state its reason again.
      this.quotaNoticeShown = false;
      const candidate = result.response.candidates?.[0];
      const functionCallPart: Part | undefined = candidate?.content?.parts?.find(
        (p: any) => p.functionCall
      );

      if (!functionCallPart?.functionCall) {
        // Conversational answer: replay it to the UI in chunks so the user
        // still sees a progressive reveal.
        const fullText = result.response.text();
        await this.replayAsChunks(fullText, onToken);
        store.addTerminalLog('Gemini response received [200 OK]', 'success');
        return {
          text: fullText,
          toolCall: image ? { name: 'vision', status: 'completed', summary: 'Ocular analysis completed' } : undefined,
        };
      }

      // ---- Tool flow ----
      const { name, args } = functionCallPart.functionCall as { name: string; args: Record<string, any> };
      store.addTerminalLog(`Gemini requested tool: ${name}`, 'cmd');
      onToken(`⟨${name}⟩\n`);

      let toolResult: ToolExecutionResult;
      try {
        toolResult = await this.executeTool(name, args || {}, (line) => onToken(`⟨${line}⟩\n`));
      } catch (e: any) {
        const message = e?.message || String(e);
        store.addTerminalLog(`Tool ${name} failed: ${message}`, 'error');
        const failText = `The tool "${name}" failed: ${message}`;
        await this.replayAsChunks(failText, onToken);
        return {
          text: failText,
          toolCall: {
            name: this.mapToolToToolCallName(name),
            status: 'failed',
            summary: message,
          },
        };
      }

      // ---- Pass 2 (streamed): phrase the final answer around tool output ----
      try {
        const request = {
          contents: [
            ...contents,
            { role: 'model', parts: [functionCallPart] },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name,
                    response: { result: toolResult.text.slice(0, 4000) },
                  },
                },
              ],
            },
          ],
        };

        const stream = await model.generateContentStream(request);
        let fullText = '';
        for await (const chunk of stream.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullText += chunkText;
            onToken(chunkText);
          }
        }
        if (!fullText) {
          fullText = toolResult.text;
          await this.replayAsChunks(fullText, onToken);
        }
        return { text: fullText, toolCall: toolResult.toolCall };
      } catch (e: any) {
        store.addTerminalLog(`Post-tool synthesis failed (${e?.message || e}); returning raw tool output.`, 'warn');
        await this.replayAsChunks(toolResult.text, onToken);
        return { text: toolResult.text, toolCall: toolResult.toolCall };
      }
    } catch (e: any) {
      // Vision cannot degrade locally; everything else can.
      if (image) {
        const fr = (config.language || 'en') === 'fr';
        throw new Error(
          fr
            ? 'L’analyse d’image nécessite Gemini (indisponible : quota ou réseau).'
            : 'Image analysis needs Gemini (unavailable: quota or network).'
        );
      }
      return await this.degradeToLocal(userPrompt, e, onToken);
    } finally {
      store.setStatus('idle');
    }
  }

  /** Emits an already-complete text through onToken in small chunks. */
  private async replayAsChunks(text: string, onToken: (t: string) => void): Promise<void> {
    const CHUNK = 6;
    for (let i = 0; i < text.length; i += CHUNK) {
      onToken(text.slice(i, i + CHUNK));
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  private mapToolToToolCallName(name: string): ChatMessage['toolCall'] extends undefined ? never : NonNullable<ChatMessage['toolCall']>['name'] {
    switch (name) {
      case 'organize_files':
      case 'undo_file_organization':
        return 'organizer';
      case 'build_website':
        return 'dave_build';
      case 'create_research_pdf':
        return 'research_pdf';
      case 'check_unread_emails':
        return 'gmail_read';
      case 'check_instagram_messages':
        return 'instagram_check';
      case 'get_last_patch_report':
      case 'test_self_healing':
        return 'self_heal';
      case 'search_web':
        return 'web_search';
      case 'make_phone_call':
      case 'send_sms':
      case 'open_whatsapp':
      case 'open_navigation':
      case 'get_battery_status':
      case 'read_clipboard':
      case 'copy_to_clipboard':
        return 'device_action';
      case 'execute_code_sandbox':
        return 'code_sandbox';
      case 'remember_fact':
      case 'recall_memories':
      case 'forget_memory':
        return 'memory';
      default:
        return 'organizer';
    }
  }

  // ------------------------------------------------- Local keyword fallback

  private async chatLocalFallback(
    userPrompt: string,
    /** Why the remote brain is out — shapes the conversational replies. */
    reason: 'no-key' | 'quota' | 'offline' = 'no-key'
  ): Promise<{ text: string; toolCall?: ChatMessage['toolCall'] }> {
    const store = useSevenStore.getState();
    const config = store.config;
    const lower = userPrompt.toLowerCase().trim();

    // Dave Agent (website building)
    if (
      (lower.includes('make') && lower.includes('website')) ||
      (lower.includes('build') && lower.includes('website')) ||
      (lower.includes('create') && lower.includes('website')) ||
      lower.includes('portfolio') ||
      lower.startsWith('dave:')
    ) {
      const cleanTopic = userPrompt.replace(/dave:/i, '').trim();
      const project = await daveAgent.buildProject(cleanTopic);
      return {
        text: `I have completed the synthesis for your website "${project.name}". All 3 modules (index.html, style.css, script.js) have been compiled and mounted into SevenUploads. You can preview it live or open it in your browser.`,
        toolCall: {
          name: 'dave_build',
          status: 'completed',
          summary: `Synthesized 3 files in SevenUploads/${project.name}/ (HTML, CSS, JS).`,
          projectId: project.id,
          filePath: project.folderPath,
        },
      };
    }

    // Organizer
    if (
      lower.includes('organize downloads') ||
      lower.includes('organize files') ||
      lower.includes('clean downloads') ||
      lower.includes('sort downloads') ||
      lower.includes('smart organizer')
    ) {
      const result = await fileOrganizer.organizeDownloads();
      return {
        text: `Storage scan complete. ${result.message} A full journal has been recorded at organizer_log.json for atomic undo.`,
        toolCall: {
          name: 'organizer',
          status: 'completed',
          summary: `Organized ${result.totalFiles} files into categorized folders with Undo protection.`,
          result,
        },
      };
    }

    // Undo
    if (
      lower.includes('undo organization') ||
      lower.includes('undo last organization') ||
      lower.includes('restore downloads')
    ) {
      const undoRes = await fileOrganizer.undoLastOrganization();
      return { text: undoRes.message,
        toolCall: {
          name: 'organizer',
          status: 'completed',
          summary: `Restored ${undoRes.restoredCount} files to root storage.`,
        },
      };
    }

    // Research to PDF
    if (
      (lower.includes('research') && lower.includes('pdf')) ||
      lower.includes('create a pdf') ||
      lower.includes('generate report')
    ) {
      const topicMatch = userPrompt.match(/research (?:on|about)?\s*(.*?)(?:\s*and create a pdf|\s*to pdf|$)/i);
      const topic = topicMatch && topicMatch[1] ? topicMatch[1].trim() : 'AI and Autonomous Systems';
      const doc = await researchService.researchTopicAndCreatePdf(topic);
      return {
        text: `Research document "${doc.title}" compiled and exported to PDF successfully.`,
        toolCall: {
          name: 'research_pdf',
          status: 'completed',
          summary: `Document: "${doc.title}" generated.`,
          filePath: doc.pdfUri,
        },
      };
    }

    // Self-healing
    if (lower.includes('last patch') || lower.includes('check patches')) {
      const lastPatch = selfHealing.getLastPatch();
      if (lastPatch) {
        return {
          text: `Last patch ID is ${lastPatch.id}, targeting ${lastPatch.targetFile}. Error: "${lastPatch.error}". Source: ${lastPatch.engine}.`,
          toolCall: {
            name: 'self_heal',
            status: 'completed',
            patchId: lastPatch.id,
            summary: `Patch ${lastPatch.id} on ${lastPatch.targetFile}`,
          },
        };
      }
      return { text: 'No active patches found. The runtime is nominal with zero recorded regressions.' };
    }

    if (lower.includes('simulate bug') || lower.includes('trigger self-heal') || lower.includes('test self healing')) {
      const patch = await selfHealing.simulateBugAndAutoFix();
      return {
        text: `Anti-Panic Engine triggered and recovered. Patch ID: ${patch.id}.`,
        toolCall: {
          name: 'self_heal',
          status: 'completed',
          patchId: patch.id,
          summary: `Recovered from simulated regression. Patch ${patch.id} recorded.`,
        },
      };
    }

    // Gmail / Instagram
    if (lower.includes('check email') || lower.includes('read gmail') || lower.includes('unread emails')) {
      const summary = await gmailService.fetchUnreadEmails();
      return {
        text: summary,
        toolCall: {
          name: 'gmail_read',
          status: 'completed',
          summary: 'Fetched unread messages.',
        },
      };
    }

    if (lower.includes('check instagram') || lower.includes('instagram dm') || lower.includes('unread dms')) {
      const summary = await instagramService.checkDirectMessages();
      return {
        text: summary,
        toolCall: {
          name: 'instagram_check',
          status: 'completed',
          summary: 'Instagram DM check (browser session).',
        },
      };
    }

    // Web search fallback
    if (lower.startsWith('search ') || lower.startsWith('cherche ') || lower.includes('search web') || lower.includes('recherche sur le web')) {
      const query = userPrompt.replace(/^(search|cherche|search web|recherche sur le web)\s*(for|sur|about|:)?\s*/i, '').trim();
      const res = await webSearchService.searchWeb(
        query || 'AI developments',
        (config.language || 'en') === 'fr' ? 'fr' : 'en'
      );
      return {
        text: res.summary,
        toolCall: {
          name: 'web_search',
          status: 'completed',
          summary: `Web search: ${res.results.length} result(s) for "${query}".`,
          result: res.results,
        },
      };
    }

    // Telephony / Call
    if (lower.startsWith('call ') || lower.startsWith('appelle ') || lower.includes('phone call')) {
      const numMatch = userPrompt.match(/[\d\+\s-]{4,15}/);
      const number = numMatch ? numMatch[0].trim() : '112';
      const res = await deviceControl.callNumber(number);
      return {
        text: res.message,
        toolCall: {
          name: 'device_action',
          status: res.success ? 'completed' : 'failed',
          summary: `Call ${number}`,
        },
      };
    }

    // Navigation / Maps
    if (lower.startsWith('navigate to ') || lower.startsWith('guidage ') || lower.startsWith('maps ') || lower.includes('open maps')) {
      const dest = userPrompt.replace(/^(navigate to|guidage vers|maps to|open maps to)\s*/i, '').trim() || 'Paris';
      const res = await deviceControl.openMaps(dest);
      return {
        text: res.message,
        toolCall: {
          name: 'device_action',
          status: res.success ? 'completed' : 'failed',
          summary: `Navigate to ${dest}`,
        },
      };
    }

    // Battery status fallback
    if (lower.includes('battery') || lower.includes('batterie')) {
      const res = await deviceControl.getBatteryStatus();
      return {
        text: res.message,
        toolCall: {
          name: 'device_action',
          status: res.success ? 'completed' : 'failed',
          summary: res.message,
        },
      };
    }

    // Clipboard fallback
    if (lower.includes('clipboard') || lower.includes('presse-papier') || lower.includes('presse papier')) {
      const res = await deviceControl.readClipboard();
      return {
        text: res.data ? `Clipboard Content:\n"${res.data}"` : res.message,
        toolCall: {
          name: 'device_action',
          status: res.success ? 'completed' : 'failed',
          summary: 'Read clipboard',
        },
      };
    }

    // Plain conversational fallback (no key configured, or Gemini unreachable).
    // Phrased for the reason: with a quota outage the key exists — telling the
    // user to add one would be nonsense.
    const fr = (config.language || 'en') === 'fr';
    const fallbackResponses =
      reason === 'no-key'
        ? [
            `Acknowledged, ${config.userName || 'Commander'}. All Seven AI neural subsystems are operational. Add a Gemini API key in Settings to unlock full conversational intelligence. Meanwhile I can organize downloads, build a website, create a research PDF, or report the last patch.`,
            `Understood. I have logged your directive. You can ask me to "organize downloads", "make a developer portfolio website", "research on AI and create a PDF", or "check unread emails".`,
            `Telemetry confirmed. Seven AI orbital arrays are tracking at 60 FPS. Awaiting your next command, ${config.userName || 'Commander'}.`,
          ]
        : fr
          ? [
              `Bien reçu, ${config.userName || 'Commandant'}. Gemini est momentanément indisponible, je réponds en mode local. Je peux organiser vos téléchargements, créer un site, générer un PDF de recherche, lire la batterie ou le presse-papiers.`,
              `Directive enregistrée. En mode local je sais : organiser les fichiers, créer un portfolio, préparer un PDF, vérifier la batterie. Le cerveau distant reviendra avec le quota.`,
              `Systèmes nominaux, ${config.userName || 'Commandant'}. Je reste opérationnel en local en attendant le rétablissement de Gemini.`,
            ]
          : [
              `Acknowledged, ${config.userName || 'Commander'}. Gemini is temporarily unavailable, so I am answering in local mode. I can still organize downloads, build a website, generate a research PDF, or report battery and clipboard.`,
              `Directive logged. In local mode I can: organize files, build a portfolio, prepare a PDF, check the battery. The remote brain will be back with the quota.`,
              `All systems nominal, ${config.userName || 'Commander'}. Staying operational in local mode until Gemini recovers.`,
            ];
    return { text: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)] };
  }

  // ------------------------------------------------------------------- Chat

  /**
   * Main conversational and tool-execution interface (buffered).
   * Prefer chatStream() for progressive display; this simply awaits it.
   */
  public async chat(userPrompt: string): Promise<ChatResult> {
    const store = useSevenStore.getState();
    const config = store.config;

    store.setStatus('thinking');
    store.addTerminalLog(`USER PROMPT: "${userPrompt}"`, 'cmd');

    try {
      if (config.geminiApiKey && config.geminiApiKey.trim().length > 5) {
        try {
          const res = await this.chatWithGemini(userPrompt);
          this.quotaNoticeShown = false;
          return res;
        } catch (e) {
          return await this.degradeToLocal(userPrompt, e);
        }
      }
      if (openRouterService.isConfigured(config.openRouterKey)) {
        try {
          return await this.chatWithOpenRouter(userPrompt);
        } catch (e: any) {
          store.addTerminalLog(`OpenRouter fallback failed (${e?.message || e}); using local engine.`, 'warn');
        }
      }
      const res = await this.chatLocalFallback(userPrompt);
      return res;
    } finally {
      store.setStatus('idle');
    }
  }
}

export const sevenAgent = SevenAgent.getInstance();
