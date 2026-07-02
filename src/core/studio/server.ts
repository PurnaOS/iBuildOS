// The Studio HTTP server: Bun.serve bound to loopback, a fetch router over the
// read oracles (api.ts) + the SPA shell (app.ts), and an in-process SSE
// Broadcaster. Pure orchestration — it computes no findings of its own and never
// mutates the deterministic engine. Port of the legacy Go serve.go.
import { stableStringify } from "../graphx/encode.ts";
import {
  type StudioContext,
  apiStatus, apiGraph, apiMatrix, apiGaps, apiFindings, apiConfig, apiTypes,
  apiInstructions, apiAgentsMD, apiMine, apiWorkspaces, apiBoard, apiTeam, apiNode, apiRequirements,
} from "./api.ts";
import { renderApp } from "./app.ts";
import { diff as gitDiff } from "./git.ts";
import { preflight } from "./agent.ts";

// Broadcaster fans named SSE events out to every connected /api/events client.
// Non-blocking: a callback that throws never wedges a publisher.
export class Broadcaster {
  private subs = new Set<(name: string, data: string) => void>();
  subscribe(fn: (name: string, data: string) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  publish(name: string, data: string): void {
    for (const fn of [...this.subs]) {
      try {
        fn(name, data);
      } catch {
        /* drop for a misbehaving subscriber */
      }
    }
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(stableStringify(obj), { status, headers: { "content-type": "application/json" } });
}
function textResp(s: string, type = "text/plain; charset=utf-8", status = 200): Response {
  return new Response(s, { status, headers: { "content-type": type } });
}

function sseResponse(bcast: Broadcaster): Response {
  let unsub = () => {};
  let beat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          /* client gone */
        }
      };
      send("event: ready\ndata: ok\n\n");
      unsub = bcast.subscribe((name, data) => send(`event: ${name}\ndata: ${data.replaceAll("\n", "\\n")}\n\n`));
      beat = setInterval(() => send(": ping\n\n"), 25000);
    },
    cancel() {
      unsub();
      if (beat) clearInterval(beat);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}

function getApi(ctx: StudioContext, path: string, q: URLSearchParams): Response {
  switch (path) {
    case "/api/status": return json(apiStatus(ctx));
    case "/api/matrix": return json(apiMatrix(ctx));
    case "/api/requirements": return json(apiRequirements(ctx));
    case "/api/gaps": return json(apiGaps(ctx));
    case "/api/findings": return json(apiFindings(ctx));
    case "/api/config": return json(apiConfig(ctx));
    case "/api/types": return json(apiTypes(ctx));
    case "/api/agents.md": return textResp(apiAgentsMD(ctx), "text/markdown; charset=utf-8");
    case "/api/mine": return json(apiMine(ctx, q.get("as")?.trim() || "you"));
    case "/api/node": {
      const key = q.get("key");
      if (!key) return json({ error: "node requires ?key=" }, 400);
      return json(apiNode(ctx, key));
    }
    case "/api/diff": {
      let d = "";
      try { d = gitDiff(ctx.bundleDir); } catch { d = ""; }
      return textResp(d, "text/plain; charset=utf-8");
    }
    case "/api/workspaces": return json(apiWorkspaces(ctx));
    case "/api/board": return json(apiBoard(ctx));
    case "/api/team": return json(apiTeam(ctx));
    case "/api/agent/preflight": return json(preflight(ctx.cfg));
    case "/api/graph": {
      const p: Parameters<typeof apiGraph>[1] = {};
      const node = q.get("node"); if (node) p.node = node;
      const depth = q.get("depth"); if (depth) p.depth = Number(depth);
      const rel = q.get("rel"); if (rel) p.rels = rel.split(",").map((s) => s.trim()).filter(Boolean);
      const body = q.get("body"); if (body === "excerpt" || body === "full" || body === "none") p.body = body;
      return json(apiGraph(ctx, p));
    }
    default:
      if (path.startsWith("/api/instructions/")) {
        return json(apiInstructions(ctx, decodeURIComponent(path.slice("/api/instructions/".length))));
      }
      return textResp("not found\n", "text/plain; charset=utf-8", 404);
  }
}

export type PostHandler = (ctx: StudioContext, req: Request, bcast: Broadcaster, q: URLSearchParams) => Promise<Response>;

// makeFetch builds the request handler. postHandlers is the extensible POST table
// (authoring/review/operate/agent are registered by later sub-phases).
export function makeFetch(
  ctx: StudioContext,
  bcast: Broadcaster,
  postHandlers: Record<string, PostHandler> = {},
): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/") return textResp(renderApp(ctx), "text/html; charset=utf-8");
      if (req.method === "GET" && path === "/healthz") return textResp("ok\n");
      if (req.method === "GET" && path === "/api/events") return sseResponse(bcast);
      if (req.method === "GET" && path.startsWith("/api/")) return getApi(ctx, path, url.searchParams);
      if (req.method === "POST" && postHandlers[path]) return await postHandlers[path]!(ctx, req, bcast, url.searchParams);
      return textResp("not found\n", "text/plain; charset=utf-8", 404);
    } catch (e) {
      return textResp(`error: ${(e as Error).message}\n`, "text/plain; charset=utf-8", 500);
    }
  };
}

export interface RunningStudio {
  port: number;
  bcast: Broadcaster;
  stop: () => void;
}

// serve starts the Studio on loopback. The host is hardcoded to 127.0.0.1 — the
// server is never exposed beyond localhost (no hostname flag exists to override).
export function serve(ctx: StudioContext, port: number, postHandlers: Record<string, PostHandler> = {}): RunningStudio {
  const bcast = new Broadcaster();
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: makeFetch(ctx, bcast, postHandlers) });
  return { port: server.port ?? port, bcast, stop: () => server.stop(true) };
}
