import { CoreBackend } from "./core.js";
import { StreamsBackend } from "./streams.js";
import { InsightsBackend } from "./insights.js";

// Composes the per-domain backends — core: projects/templates/attention
// (./core.ts); streams and insights: placeholders for future work packages
// (./streams.ts, ./insights.ts) — into the one object constructed in
// src/main/index.ts and wired to the IPC router in src/main/ipc.ts. Each
// domain owns its own file body, so future work on streams/insights never
// touches core.ts (and vice versa): `backend.core.listProjects()`, one day
// `backend.streams.*`/`backend.insights.*`.
export class Backend {
  readonly core: CoreBackend;
  readonly streams: StreamsBackend;
  readonly insights: InsightsBackend;

  constructor() {
    this.core = new CoreBackend();
    this.streams = new StreamsBackend();
    this.insights = new InsightsBackend();
  }

  /** Releases every domain's timers/listeners — call once, e.g. from
   * Electron's 'before-quit' (see src/main/index.ts). */
  dispose(): void {
    this.core.dispose();
    this.streams.dispose();
    this.insights.dispose();
  }
}
