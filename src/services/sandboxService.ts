import { Platform } from 'react-native';

export interface SandboxExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  logs: string[];
  executionTimeMs: number;
}

/**
 * Lightweight and safe JavaScript execution engine running locally.
 *
 * Two execution paths:
 * 1. FAST PATH (web / engines allowing dynamic code): `new Function`.
 * 2. WEBVIEW PATH (Hermes / engines forbidding `eval` and `new Function`):
 *    an offscreen WebView registered via `registerExecutor` runs the code in
 *    a real browser JS engine and posts the result back. This also gives a
 *    genuinely isolated sandbox — the code cannot touch app state at all.
 */
class SandboxService {
  /**
   * Callback installed by the offscreen <SandboxExecutorHost /> WebView.
   * Null until the host is mounted (native only).
   */
  private webviewExecutor: ((code: string) => Promise<SandboxExecutionResult>) | null = null;

  /** Whether the fast `new Function` path is usable on this JS engine. */
  private fastPathProbe: boolean | null = null;

  public registerExecutor(fn: (code: string) => Promise<SandboxExecutionResult>): void {
    this.webviewExecutor = fn;
  }

  public unregisterExecutor(fn: (code: string) => Promise<SandboxExecutionResult>): void {
    if (this.webviewExecutor === fn) this.webviewExecutor = null;
  }

  /** Probe once whether `new Function` works on the current engine. */
  private hasFastPath(): boolean {
    if (this.fastPathProbe === null) {
      try {
        // eslint-disable-next-line no-new-func
        this.fastPathProbe = new Function('return 1')() === 1;
      } catch {
        this.fastPathProbe = false;
      }
    }
    return this.fastPathProbe;
  }

  /**
   * Async execution — the primary entry point used by the agent.
   * Prefers the WebView sandbox on native (Hermes-safe), fast path elsewhere.
   */
  public async executeAsync(code: string): Promise<SandboxExecutionResult> {
    if (Platform.OS !== 'web' && this.webviewExecutor) {
      try {
        return await this.webviewExecutor(code);
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || String(e),
          logs: [],
          executionTimeMs: 0,
        };
      }
    }
    return this.execute(code);
  }

  /**
   * Synchronous execution using `new Function`.
   * Works on web; on Hermes (native) the Function constructor is disabled and
   * a clear error result is returned instead of crashing.
   */
  public execute(code: string): SandboxExecutionResult {
    if (!this.hasFastPath()) {
      return {
        success: false,
        error:
          'Dynamic code execution is disabled on this JavaScript engine (Hermes). The offscreen WebView sandbox will be used automatically when available.',
        logs: [],
        executionTimeMs: 0,
      };
    }

    const startTime = Date.now();
    const logs: string[] = [];

    // Custom console to capture execution outputs
    const sandboxConsole = {
      log: (...args: any[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      warn: (...args: any[]) => logs.push('[WARN] ' + args.join(' ')),
      error: (...args: any[]) => logs.push('[ERROR] ' + args.join(' ')),
    };

    try {
      // Disallow dangerous global escapes
      const sanitizedCode = code
        .replace(/window/g, 'undefined')
        .replace(/document/g, 'undefined')
        .replace(/process/g, 'undefined')
        .replace(/require/g, 'undefined')
        .replace(/import/g, 'undefined');

      // Wrap code into an immediately executed function with Math, Date, JSON available
      const runner = new Function(
        'console',
        'Math',
        'JSON',
        'Date',
        `
        "use strict";
        try {
          ${sanitizedCode}
        } catch(err) {
          throw err;
        }
        `
      );

      const returnedValue = runner(sandboxConsole, Math, JSON, Date);
      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        result: returnedValue !== undefined ? returnedValue : logs.length > 0 ? logs.join('\n') : 'Code executed with zero return.',
        logs,
        executionTimeMs,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.message || String(e),
        logs,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}

export const sandboxService = new SandboxService();
