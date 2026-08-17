import type { StepResult } from "./types.js";

// TP-003 step 4: poll `preview.url` + `preview.ready` (ContractComponentSchema's
// `preview` shape — `{ url, ready: { path, status } }`) until it responds with
// the expected status or the timeout elapses. Races against the dev process's
// own exit so a crashed dev server fails fast with a clear reason instead of
// silently burning the full timeout.

/** Substitutes a literal "{port}" token in a preview URL, when present and a port was supplied.
 * Real templates may use this token so the actual bound port (assigned by whatever starts the
 * dev server) gets filled in later — the concrete allocation strategy lives in the
 * not-yet-merged contract-runner; this harness only does the textual substitution. */
export function resolvePreviewUrl(urlTemplate: string, port: number | undefined): string {
  if (!urlTemplate.includes("{port}")) return urlTemplate;
  if (port === undefined) {
    throw new Error(`preview URL "${urlTemplate}" has an unresolved "{port}" token and no port option was supplied`);
  }
  return urlTemplate.replaceAll("{port}", String(port));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PollPreviewOptions {
  timeoutMs: number;
  intervalMs: number;
  /** Resolves when the dev process exits, for any reason — used to fail fast instead of waiting
   * out the full timeout when the dev server has clearly died. */
  devExited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export async function pollPreview(
  baseUrl: string,
  ready: { path: string; status: number },
  options: PollPreviewOptions,
): Promise<StepResult> {
  const start = performance.now();
  const name = "preview:poll";
  const fullUrl = new URL(ready.path, baseUrl).toString();
  const deadline = start + options.timeoutMs;

  let devExitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  void options.devExited.then((info) => {
    devExitInfo = info;
  });

  let attempts = 0;
  let lastError = "no attempt made";

  while (performance.now() < deadline) {
    if (devExitInfo) {
      return {
        name,
        status: "fail",
        durationMs: performance.now() - start,
        detail: `dev process exited (code ${devExitInfo.code}, signal ${devExitInfo.signal}) before ${fullUrl} became ready, after ${attempts} attempt(s); last error: ${lastError}`,
      };
    }

    attempts++;
    try {
      const perAttemptTimeout = Math.min(Math.max(options.intervalMs * 4, 500), 5000);
      const response = await fetchWithTimeout(fullUrl, perAttemptTimeout);
      if (response.status === ready.status) {
        return {
          name,
          status: "pass",
          durationMs: performance.now() - start,
          detail: `${fullUrl} responded ${response.status} after ${attempts} attempt(s) (${Math.round(performance.now() - start)}ms)`,
        };
      }
      lastError = `got status ${response.status}, expected ${ready.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(options.intervalMs);
  }

  if (devExitInfo) {
    return {
      name,
      status: "fail",
      durationMs: performance.now() - start,
      detail: `dev process exited (code ${devExitInfo.code}, signal ${devExitInfo.signal}) before ${fullUrl} became ready, after ${attempts} attempt(s); last error: ${lastError}`,
    };
  }

  return {
    name,
    status: "fail",
    durationMs: performance.now() - start,
    detail: `timed out after ${options.timeoutMs}ms polling ${fullUrl} for status ${ready.status} (${attempts} attempt(s); last error: ${lastError})`,
  };
}
