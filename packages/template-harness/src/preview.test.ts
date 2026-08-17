import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { pollPreview, resolvePreviewUrl } from "./preview.js";

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

function neverExits(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise(() => {
    // Intentionally never settles — models a dev process that's still running.
  });
}

async function listen(handler: RequestListener): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected an AddressInfo");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe("resolvePreviewUrl", () => {
  it("returns the URL unchanged when it has no {port} token", () => {
    expect(resolvePreviewUrl("http://localhost:4319", undefined)).toBe("http://localhost:4319");
  });

  it("substitutes {port} when a port is supplied", () => {
    expect(resolvePreviewUrl("http://localhost:{port}", 5173)).toBe("http://localhost:5173");
  });

  it("throws when {port} is present but no port was supplied", () => {
    expect(() => resolvePreviewUrl("http://localhost:{port}", undefined)).toThrow(/\{port\}/);
  });
});

describe("pollPreview", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("passes once the server responds with the expected status", async () => {
    const started = await listen((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    server = started.server;

    const result = await pollPreview(
      started.url,
      { path: "/", status: 200 },
      { timeoutMs: 2000, intervalMs: 25, devExited: neverExits() },
    );

    expect(result.status).toBe("pass");
    expect(result.name).toBe("preview:poll");
  });

  it("retries until the server comes up (matches TP-003's 'not ready on the first attempt' case)", async () => {
    let readyAt = Date.now() + 150;
    const started = await listen((_req, res) => {
      if (Date.now() < readyAt) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("ok");
    });
    server = started.server;

    const result = await pollPreview(
      started.url,
      { path: "/", status: 200 },
      { timeoutMs: 3000, intervalMs: 25, devExited: neverExits() },
    );

    expect(result.status).toBe("pass");
  });

  it("fails when the server never returns the expected status (times out)", async () => {
    const started = await listen((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    server = started.server;

    const result = await pollPreview(
      started.url,
      { path: "/", status: 200 },
      { timeoutMs: 300, intervalMs: 25, devExited: neverExits() },
    );

    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/timed out/);
  });

  it("fails fast when the dev process exits instead of waiting out the full timeout", async () => {
    const start = Date.now();
    const result = await pollPreview(
      "http://127.0.0.1:1", // nothing listens here
      { path: "/", status: 200 },
      {
        timeoutMs: 3000,
        intervalMs: 25,
        devExited: Promise.resolve({ code: 1, signal: null }),
      },
    );
    const elapsed = Date.now() - start;

    expect(result.status).toBe("fail");
    expect(result.detail).toContain("dev process exited");
    expect(elapsed).toBeLessThan(1000);
  });
});
