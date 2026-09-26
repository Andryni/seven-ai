import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { sandboxService } from '../services/sandboxService';
import type { SandboxExecutionResult } from '../services/sandboxService';

/**
 * Offscreen WebView that gives SEVEN a real browser-grade JavaScript engine.
 *
 * Hermes (the React Native JS engine) forbids `eval` / `new Function`, so the
 * local code-sandbox tool cannot run user code natively. Mounting this 1px
 * host (in the root layout) registers a WebView-backed executor with the
 * sandbox service: code runs inside the WebView's JS engine and posts the
 * result back. The code can never touch app state — a real process boundary.
 *
 * On web this component renders null (the fast `new Function` path is used).
 */
const EXECUTOR_HTML = `<!DOCTYPE html>
<html>
<head>
  <!-- Code may calculate locally but cannot contact a server, load a resource,
       submit a form or navigate a parent. unsafe-eval is required solely for
       the isolated runner's Function constructor. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src 'none'; media-src 'none'; style-src 'none'; form-action 'none'; base-uri 'none'">
</head>
<body>
<script>
  function serialize(v) {
    if (v === undefined) return '__undefined__';
    try { return JSON.stringify(v, function (k, val) { return typeof val === 'function' ? String(val) : val; }); }
    catch (e) { return String(v); }
  }

  async function run(raw) {
    var logs = [];
    var sandboxConsole = {
      log: function () { logs.push(Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ')); },
      warn: function () { logs.push('[WARN] ' + Array.prototype.map.call(arguments, String).join(' ')); },
      error: function () { logs.push('[ERROR] ' + Array.prototype.map.call(arguments, String).join(' ')); },
    };
    var started = Date.now();
    try {
      var runner = new Function('console', 'Math', 'JSON', 'Date', '"use strict";' + raw);
      var value = runner(sandboxConsole, Math, JSON, Date);
      return {
        success: true,
        result: serialize(value),
        resultUndefined: value === undefined,
        logs: logs,
        executionTimeMs: Date.now() - started,
      };
    } catch (e) {
      return {
        success: false,
        error: (e && e.message) ? e.message : String(e),
        logs: logs,
        executionTimeMs: Date.now() - started,
      };
    }
  }

  document.addEventListener('message', function (event) { handle(event.data); });
  window.addEventListener('message', function (event) { handle(event.data); });

  async function handle(data) {
    var req;
    try { req = JSON.parse(data); } catch (e) { return; }
    if (!req || req.type !== 'SEVEN_SANDBOX_RUN') return;
    var res = await run(String(req.code || ''));
    res.requestId = req.requestId;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(res));
    }
  }

  // Signal readiness to the host app
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SEVEN_SANDBOX_READY' }));
  }
</script>
</body>
</html>`;

interface PendingRequest {
  resolve: (r: SandboxExecutionResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const SandboxExecutorHost: React.FC = () => {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  // A blocking infinite loop cannot be interrupted from inside that WebView.
  // Remounting creates a fresh renderer after the host-side deadline expires.
  const [generation, setGeneration] = useState(0);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const requestSeqRef = useRef(0);

  useEffect(() => {
    // The Map instance is created once and never reassigned, so capturing it
    // here is stable for both the executor and the cleanup below.
    const pending = pendingRef.current;

    const executor = (code: string) =>
      new Promise<SandboxExecutionResult>((resolve) => {
        if (!readyRef.current || !webViewRef.current) {
          resolve({
            success: false,
            error: 'Sandbox WebView not ready yet.',
            logs: [],
            executionTimeMs: 0,
          });
          return;
        }
        const requestId = `req_${Date.now()}_${requestSeqRef.current++}`;
        // Hard timeout: user code with an infinite loop must not hang the tool.
        const timer = setTimeout(() => {
          if (pending.has(requestId)) {
            pending.delete(requestId);
            resolve({
              success: false,
              error: 'Sandbox execution timed out (5s limit). Infinite loop or blocking code?',
              logs: [],
              executionTimeMs: 5000,
            });
            readyRef.current = false;
            setGeneration((value) => value + 1);
          }
        }, 5000);
        pending.set(requestId, { resolve, timer });
        webViewRef.current?.postMessage(
          JSON.stringify({ type: 'SEVEN_SANDBOX_RUN', requestId, code })
        );
      });

    sandboxService.registerExecutor(executor);
    return () => {
      sandboxService.unregisterExecutor(executor);
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.resolve({ success: false, error: 'Sandbox host unmounted.', logs: [], executionTimeMs: 0 });
      }
      pending.clear();
    };
  }, [generation]);

  if (Platform.OS === 'web') return null;

  const handleMessage = (event: any) => {
    let data: any;
    try {
      data = JSON.parse(event?.nativeEvent?.data || '{}');
    } catch {
      return;
    }

    if (data?.type === 'SEVEN_SANDBOX_READY') {
      readyRef.current = true;
      return;
    }

    if (data?.requestId && pendingRef.current.has(data.requestId)) {
      const pending = pendingRef.current.get(data.requestId)!;
      pendingRef.current.delete(data.requestId);
      clearTimeout(pending.timer);
      pending.resolve({
        success: !!data.success,
        result:
          data.result === undefined || data.result === '__undefined__'
            ? data.logs?.length > 0
              ? data.logs.join('\n')
              : 'Code executed with zero return.'
            : safeParse(data.result),
        error: data.error,
        logs: Array.isArray(data.logs) ? data.logs : [],
        executionTimeMs: data.executionTimeMs ?? 0,
      });
    }
  };

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <WebView
        key={generation}
        ref={webViewRef}
        source={{ html: EXECUTOR_HTML, baseUrl: 'about:blank' }}
        onMessage={handleMessage}
        originWhitelist={['about:blank']}
        onShouldStartLoadWithRequest={(request) =>
          request.url === 'about:blank' || request.url.startsWith('data:text/html')
        }
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        style={styles.webView}
      />
    </View>
  );
};

function safeParse(raw: any): any {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  webView: {
    width: 1,
    height: 1,
  },
});
