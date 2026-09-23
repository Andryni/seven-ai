import { FunctionDeclaration, Type } from '@google/genai';
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

/**
 * Tool declarations and execution, split out of `sevenAgent.ts`.
 *
 * `sevenAgent.ts` had grown past 1300 lines mixing three different
 * concerns: the Gemini function-calling wiring, the tool declarations
 * (what the model is told it can call), and the tool implementations
 * (what actually runs on the device for each one). `executeTool` reads
 * from `useSevenStore.getState()` directly and does not touch any
 * `SevenAgent` instance state, so it moves here as a plain function with
 * no behavior change — every call site keeps working via `sevenAgent.ts`
 * re-exporting `TOOL_DECLARATIONS` and calling `executeTool` the same way
 * it called `this.executeTool` before.
 */

export interface ToolExecutionResult {
  text: string;
  toolCall?: ChatMessage['toolCall'];
  raw?: unknown;
}

/**
 * Tool declarations exposed to Gemini function calling.
 * The model decides which tool to invoke instead of the previous brittle
 * keyword-matching chain ("includes('portfolio')"), which produced false
 * positives and could only ever fire one hard-coded intent.
 */
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'organize_files',
    description:
      'Scan the Downloads directory, categorize files into subfolders (Images, Documents, Installers, Audio, Video, Code, Others) and record an undo journal.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'undo_file_organization',
    description: 'Undo the last file organization and restore files to their original locations.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'build_website',
    description:
      'Synthesize a complete modern responsive website (index.html, style.css, script.js) from a description using the Dave Agent.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING, description: 'What the website should be about and include.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'create_research_pdf',
    description: 'Research a topic in depth and compile the result into a styled PDF report.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'The research topic.' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'check_unread_emails',
    description: 'Fetch the latest unread emails from the connected Gmail account.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'check_instagram_messages',
    description: 'Report on Instagram direct messages (opens a browser session; no public DM API exists).',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_last_patch_report',
    description: 'Return the most recent self-healing patch report.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'test_self_healing',
    description: 'Run a controlled self-healing simulation: inject a bug and record the recovery patch.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'forget_memory',
    description: 'Erase the permanent user memory notes (when the user asks you to forget everything / reset your memory).',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'search_web',
    description: 'Search the live web in real-time for breaking news, topics, current events or documentation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'The search query or topic to look up.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'make_phone_call',
    description: 'Open Android phone dialer to call a phone number.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone_number: { type: Type.STRING, description: 'The phone number to call.' },
      },
      required: ['phone_number'],
    },
  },
  {
    name: 'send_sms',
    description: 'Open Android SMS messenger to send a text to a phone number.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone_number: { type: Type.STRING, description: 'The phone number to message.' },
        message: { type: Type.STRING, description: 'Optional text message body.' },
      },
      required: ['phone_number'],
    },
  },
  {
    name: 'open_whatsapp',
    description: 'Open WhatsApp with an optional contact phone number and prefilled message.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone_number: { type: Type.STRING, description: 'Optional contact phone number.' },
        text: { type: Type.STRING, description: 'Message to send on WhatsApp.' },
      },
    },
  },
  {
    name: 'open_navigation',
    description: 'Open Android Maps / GPS navigation to a specified address or landmark.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: { type: Type.STRING, description: 'The address, place, city, or destination coordinates.' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'get_battery_status',
    description: 'Check Android hardware battery percentage, charging state, and low power mode status.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'read_clipboard',
    description: 'Read the latest copied text content currently stored in the device clipboard.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'copy_to_clipboard',
    description: 'Copy a specified text or code snippet to the device clipboard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: 'Text or code to copy to clipboard.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'execute_code_sandbox',
    description: 'Execute JavaScript code in a safe local sandbox to compute math, process arrays/strings, or verify logic.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING, description: 'JavaScript code to execute.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'remember_fact',
    description: 'Save a personal fact, habit, or instruction about the user into persistent long-term semantic memory.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fact: { type: Type.STRING, description: 'The fact or user preference to remember forever.' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'recall_memories',
    description: 'Search long-term semantic memory for stored user preferences, projects, or personal facts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Topic or question to look up in memory.' },
      },
      required: ['query'],
    },
  },
];

export async function executeTool(
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
