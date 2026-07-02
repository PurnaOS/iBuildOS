// Assembles the POST handler table for the Studio (registered with the server).
// authoring/review (12b.2) + operate/agent (12b.3). The harness runner is
// injectable so tests exercise agent-assist without a live coding agent.
import type { PostHandler } from "./server.ts";
import { handleAuthor, handleDiscard } from "./author.ts";
import { handleSimulate } from "./simulate.ts";
import { handleOperate } from "./operate.ts";
import { handleAgentFactory, defaultRunner, type HarnessRunner } from "./agent.ts";

export function studioHandlers(opts: { harnessRunner?: HarnessRunner } = {}): Record<string, PostHandler> {
  return {
    "/api/author": (ctx, req, bcast) => handleAuthor(ctx, req, bcast),
    "/api/discard": (ctx, req, bcast) => handleDiscard(ctx, req, bcast),
    "/api/simulate": (ctx, req) => handleSimulate(ctx, req),
    "/api/operate": (ctx, req) => handleOperate(ctx, req),
    "/api/agent": handleAgentFactory(opts.harnessRunner ?? defaultRunner()),
  };
}
