import { useSevenStore } from '../store/useSevenStore';
import { PatchLog } from '../types';
import { storageService } from '../services/storageService';
import { resolveModel } from './geminiClient';

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
      store.addTerminalLog('Capturing diagnostics and preparing a repair suggestion...', 'patch');

      const patchId = this.generatePatchId();
      let fixedCode = '';
      let fixSource = 'local heuristic';

      const apiKey = store.config.geminiApiKey;
      if (apiKey && apiKey.trim().length > 5) {
        try {
          store.addTerminalLog('Requesting a Gemini repair suggestion...', 'cmd');
          const { model } = await resolveModel(apiKey, {});
          const prompt = `You are SEVEN Diagnostics. Suggest a fix for this failing code. The suggestion will be reviewed and is NOT applied automatically:\n\nTarget: ${targetFile}\nError: ${message}\nCode:\n${originalCode}\n\nReturn ONLY the fixed code without markdown backticks or commentary.`;
          const result = await model.generateContent(prompt);
          fixedCode = (result.response.text() || '')
            .trim()
            .replace(/^```[a-z]*\n/i, '')
            .replace(/\n```$/i, '');
          fixSource = 'Gemini suggestion';
        } catch (geminiErr: any) {
          store.addTerminalLog(`Gemini synthesis fallback: ${geminiErr?.message || geminiErr}`, 'warn');
          fixedCode = this.fallbackAstFix(originalCode, message);
        }
      } else {
        fixedCode = this.fallbackAstFix(originalCode, message);
      }

      store.addTerminalLog(`Repair suggestion [ID: ${patchId}] recorded via ${fixSource}`, 'patch');

      const risk: NonNullable<PatchLog['risk']> = /auth|token|payment|delete|credential/i.test(`${targetFile} ${message}`)
        ? 'critical'
        : /storage|database|network|permission/i.test(`${targetFile} ${message}`)
          ? 'high'
          : originalCode.length > 5000
            ? 'medium'
            : 'low';
      const canaryChecks = [
        'Suggestion is non-empty',
        'Suggestion contains no markdown fence',
        'Original failure remains propagated to caller',
      ];
      const canaryPassed = !!fixedCode.trim() && !fixedCode.includes('```');
      const patchRecord: PatchLog = {
        id: patchId,
        timestamp: Date.now(),
        targetFile,
        error: message,
        originalSnippet: originalCode.slice(0, 160) + (originalCode.length > 160 ? '...' : ''),
        fixedSnippet: fixedCode.slice(0, 160) + (fixedCode.length > 160 ? '...' : ''),
        status: 'suggested',
        engine: `SEVEN diagnostics (${fixSource})`,
        synthesizerOutput: `Diagnostic ${patchId} recorded for task "${taskName}". Suggestion not applied; original failure re-raised.`,
        reproductionSteps: [
          `Start operation: ${taskName}`,
          `Execute target: ${targetFile}`,
          `Observe error: ${message}`,
        ],
        risk,
        canary: { status: canaryPassed ? 'passed' : 'failed', checks: canaryChecks },
        rollbackPlan: `Keep the current ${targetFile} snapshot; if a reviewed patch is later applied and health checks regress, restore that snapshot atomically.`,
      };

      store.addPatchLog(patchRecord);

      // Best-effort append to patches.log (never mask the original error)
      try {
        const docDir = storageService.getDocumentDirectory();
        if (docDir) {
          const logPath = `${docDir}patches.log`;
          const logLine = `[${new Date().toISOString()}] DIAGNOSTIC ${patchId} | TASK: ${taskName} | FILE: ${targetFile} | ERROR: ${message}\n`;
          const existing = await storageService.readAsString(logPath).catch(() => '');
          await storageService.writeAsString(logPath, existing + logLine);
        }
      } catch (logErr) {
        console.warn('Failed to write patches.log:', logErr);
      }

      store.addTerminalLog(`Diagnostic ${patchId} recorded; suggestion was not applied. Re-raising original error.`, 'warn');
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
    return `// Suggested guard by Seven AI diagnostics\ntry {\n  ${code}\n} catch (e) {\n  console.warn("Suggested diagnostic guard caught:", e);\n}`;
  }

  /**
   * Get the most recent patch log
   */
  public getLastPatch(): PatchLog | null {
    const store = useSevenStore.getState();
    return store.patchLogs.length > 0 ? store.patchLogs[0] : null;
  }

  /**
   * Trigger a controlled failure to test the diagnostic reporter.
   * The wrapped task intentionally throws; wrapExecution records the patch
   * report and rethrows, which we swallow here (it is the expected outcome).
   */
  public async simulateBugAndAutoFix(): Promise<PatchLog> {
    const store = useSevenStore.getState();
    store.setStatus('healing');
    store.addTerminalLog('SIMULATION: Triggering a controlled runtime failure...', 'warn');

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
      throw new Error('Diagnostic simulation failed to produce a report.');
    }

    store.addTerminalLog(`Diagnostic ${lastPatch.id} recorded; repair suggestion requires review [OK]`, 'success');
    store.setStatus('idle');
    return lastPatch;
  }
}

export const selfHealing = SelfHealingEngine.getInstance();
