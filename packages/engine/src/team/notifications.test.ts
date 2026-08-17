import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileNotificationAdapter,
  WebhookNotificationAdapter,
  type FetchLike,
  type NotificationEvent,
} from "./notifications.js";

function sampleEvent(): NotificationEvent {
  return {
    kind: "review-requested",
    artifactId: "ST-0042",
    recipient: "US-0001",
    message: "Story ST-0042 is ready for your review.",
    at: "2026-08-14T09:15:02Z",
    detail: { from: "building", to: "review" },
  };
}

describe("WebhookNotificationAdapter", () => {
  it("POSTs the event as JSON to the configured URL via the injected transport", async () => {
    const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
    const transport: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    };

    const adapter = new WebhookNotificationAdapter({
      url: "https://example.com/hooks/ibuildos",
      transport,
    });
    const event = sampleEvent();
    await adapter.send(event);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://example.com/hooks/ibuildos");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0]?.init.body ?? "{}")).toEqual(event);
  });

  it("merges caller-supplied headers alongside content-type", async () => {
    const calls: Array<Parameters<FetchLike>[1]> = [];
    const transport: FetchLike = async (_url, init) => {
      calls.push(init);
      return { ok: true, status: 200 };
    };

    const adapter = new WebhookNotificationAdapter({
      url: "https://example.com/hooks/ibuildos",
      transport,
      headers: { authorization: "Bearer token123" },
    });
    await adapter.send(sampleEvent());

    expect(calls[0]?.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer token123",
    });
  });

  it("throws when the transport reports a non-ok response", async () => {
    const transport: FetchLike = async () => ({ ok: false, status: 500 });
    const adapter = new WebhookNotificationAdapter({
      url: "https://example.com/hooks/ibuildos",
      transport,
    });

    await expect(adapter.send(sampleEvent())).rejects.toThrow(/500/);
  });

  it("never touches the real network — the transport is the only thing it calls", async () => {
    let calls = 0;
    const transport: FetchLike = async () => {
      calls += 1;
      return { ok: true, status: 204 };
    };
    const adapter = new WebhookNotificationAdapter({ url: "https://example.com/x", transport });

    await adapter.send(sampleEvent());

    expect(calls).toBe(1);
  });
});

describe("FileNotificationAdapter", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ibuildos-notify-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends each event as one line of JSON to the configured file", async () => {
    const path = join(dir, "outbox.jsonl");
    const adapter = new FileNotificationAdapter({ path });

    await adapter.send(sampleEvent());
    await adapter.send({ ...sampleEvent(), artifactId: "ST-0043" });

    const contents = await readFile(path, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "")).toEqual(sampleEvent());
    expect(JSON.parse(lines[1] ?? "").artifactId).toBe("ST-0043");
  });
});
