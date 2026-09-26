const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * `fetch` with a bounded lifetime. Mobile connections can remain half-open for
 * minutes; every user-facing request should either complete or fail with a
 * useful timeout instead of leaving the UI spinning forever.
 *
 * A caller-provided signal is preserved and forwarded to the internal
 * controller, so navigation/unmount cancellation and the deadline both work.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const upstream = init.signal;
  const abortFromUpstream = () => controller.abort(upstream?.reason);

  if (upstream?.aborted) abortFromUpstream();
  else upstream?.addEventListener('abort', abortFromUpstream, { once: true });

  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !upstream?.aborted) {
      throw new Error(`Network request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', abortFromUpstream);
  }
}

export const NETWORK_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
