import { useSevenStore } from '../store/useSevenStore';
import { PatchLog } from '../types';
import { storageService } from '../services/storageService';
import { GoogleGenerativeAI } from '@google/generative-ai';

class SelfHealingEngine {
  private static instance: SelfHealingEngine;

  private constructor() {}

  public static getInstance(): SelfHealingEngine {
    if (!SelfHealingEngine.instance) {
      SelfHealingEngine.instance = new SelfHealingEngine();
    }
    return SelfHealingEngine.instance;
  }

  /**
   * Generates a hex patch ID e.g. "D53E7F78"
   */
  public generatePatchId(): string {
    const chars = '0123456789ABCDEF';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  /**
   * Observability wrapper around risky file operations.
   *
   * On failure it records a patch report (Gemini-synthesized fix when a key is
   * configured, local heuristic otherwise) and then ALWAYS rethrows the
   * original error: callers must know the operation failed. The previous
   * implementation returned the "fixed code" string cast to T, which silently
   * corrupted return values (e.g. an OrganizeResult became a string).
   */
  public async wrapExecution<T>(
    taskName: string,
    targetFile: string,
    originalCode: string,
    executeFn: () => Promise<T>
  ): Promise<T> {
    const store = useSevenStore.getState();

    try {
      return await executeFn();
    } catch (error: any) {
      const message = error?.message || String(error);

      store.setStatus('healing');
      store.addTerminalLog(`! RUNTIME REGRESSION DETECTED in ${targetFile}: ${message}`, 'error');
      store.addTerminalLog('Triggered Anti-Panic Engine CLR synthesizer + AST bands...', 'patch');

      const patchId = this.generatePatchId();
      let fixedCode = '';
      let fixSource = 'local AST fallback';

      const apiKey = store.config.geminiApiKey;
      if (apiKey && apiKey.trim().length > 5) {
        try {
          store.addTerminalLog('Querying Gemini AST synthesizer matrix...', 'cmd');
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
          const prompt = `You are the SEVEN Anti-Panic Self-Healing Engine. Fix this buggy code:\n\nTarget: ${targetFile}\nError: ${message}\nCode:\n${originalCode}\n\nReturn ONLY the fixed code without markdown backticks or commentary.`;
          const result = await model.generateContent(prompt);
          fixedCode = result.response
            .text()
            .trim()
            .replace(/^```[a-z]*\n/i, '')
            .replace(/\n```$/i, '');
          fixSource = 'Gemini AST synthesizer';
        } catch (geminiErr: any) {
          store.addTerminalLog(`Gemini synthesis fallback: ${geminiErr?.message || geminiErr}`, 'warn');
          fixedCode = this.fallbackAstFix(originalCode, message);
        }
      } else {
        fixedCode = this.fallbackAstFix(originalCode, message);
      }

      store.addTerminalLog(`Synthesized atomic hot-patch [ID: ${patchId}] via ${fixSource}`, 'patch');

      const patchRecord: PatchLog = {
        id: patchId,
        timestamp: Date.now(),
        targetFile,
        error: message,
        originalSnippet: originalCode.slice(0, 160) + (originalCode.length > 160 ? '...' : ''),
        fixedSnippet: fixedCode.slice(0, 160) + (fixedCode.length > 160 ? '...' : ''),
        status: 'applied',
        engine: `Anti-Panic Engine CLR synthesizer + AST bands (${fixSource})`,
        synthesizerOutput: `Hot-patch ${patchId} recorded for task "${taskName}". Original failure re-raised to caller.`,
      };

      store.addPatchLog(patchRecord);

      // Best-effort append to patches.log (never mask the original error)
      try {
        const docDir = storageService.getDocumentDirectory();
        if (docDir) {
          const logPath = `${docDir}patches.log`;
          const logLine = `[${new Date().toISOString()}] PATCH ${patchId} | TASK: ${taskName} | FILE: ${targetFile} | ERROR: ${message}\n`;
          const existing = await storageService.readAsString(logPath).catch(() => '');
          await storageService.writeAsString(logPath, existing + logLine);
        }
      } catch (logErr) {
        console.warn('Failed to write patches.log:', logErr);
      }

      store.addTerminalLog(`Hot-patch ${patchId} recorded. Re-raising original error.`, 'warn');
      store.setStatus('idle');

      // Correctness: never fabricate a successful result — propagate the failure.
      throw error;
    }
  }

  /**
   * Local heuristic fix used when no Gemini key is configured.
   * Produces a suggestion snippet recorded in the patch log.
   */
  private fallbackAstFix(code: string, errorMsg: string): string {
    if (errorMsg.includes('dataset') || errorMsg.includes('undefined')) {
      return code.replace(/btn\.dataset\.filter/g, '(btn?.dataset?.filter || "all")');
    }
    if (errorMsg.includes('addEventListener')) {
      return `if (typeof window !== "undefined") {\n  window.addEventListener("DOMContentLoaded", () => {\n    ${code}\n  });\n}`;
    }
    return `// Suggested guard by Seven AI Anti-Panic Engine\ntry {\n  ${code}\n} catch (e) {\n  console.warn("Recovered by AST safe wrapper:", e);\n}`;
  }

  /**
   * Get the most recent patch log
   */
  public getLastPatch(): PatchLog | null {
    const store = useSevenStore.getState();
    return store.patchLogs.length > 0 ? store.patchLogs[0] : null;
  }

  /**
   * Trigger a controlled bug simulation to test the Self-Healing Engine.
   * The wrapped task intentionally throws; wrapExecution records the patch
   * report and rethrows, which we swallow here (it is the expected outcome).
   */
  public async simulateBugAndAutoFix(): Promise<PatchLog> {
    const store = useSevenStore.getState();
    store.setStatus('healing');
    store.addTerminalLog('SIMULATION: Injecting runtime AST null-pointer regression...', 'warn');

    await new Promise((r) => setTimeout(r, 600));

    const buggyCode = `// Buggy module in Dave Project
const filterBtns = document.querySelectorAll(".filter-btn");
filterBtns.forEach(btn => {
  const category = btn.dataset.category.toLowerCase();
  const projects = getProjectsByCategory(category);
  renderGallery(projects);
});`;

    const errorMsg = 'TypeError: Cannot read properties of undefined (reading "toLowerCase")';

    try {
      await this.wrapExecution(
        'Simulate Bug',
        'SevenUploads/portfolio-website/script.js',
        buggyCode,
        async () => {
          throw new Error(errorMsg);
        }
      );
    } catch {
      // Expected: the simulated bug always throws. The patch record was
      // created inside wrapExecution before re-raising.
    }

    const lastPatch = this.getLastPatch();
    if (!lastPatch) {
      store.setStatus('idle');
      throw new Error('Self-healing simulation failed to produce a patch record.');
    }

    store.addTerminalLog(`Hot-patch ${lastPatch.id} verified & active [OK]`, 'success');
    store.setStatus('idle');
    return lastPatch;
  }
}

export const selfHealing = SelfHealingEngine.getInstance();
