import { describe, expect, it, vi } from "vitest";
import {
  registerIpcRouter,
  type IpcEventLike,
  type IpcMainLike,
  type RequestHandlers,
  type ChannelSources,
} from "./router.js";
import {
  REQUEST_CHANNEL,
  SUBSCRIBE_CHANNEL,
  UNSUBSCRIBE_CHANNEL,
  type ChannelEvent,
} from "./contract.js";

// T-008 exists so the router is testable without an Electron runtime: this
// file exercises validation, unknown-channel rejection, and the subscription
// lifecycle against a plain fake, matching CLAUDE.md's "deterministic first"
// posture for anything that isn't the renderer itself.

function fakeIpcMain() {
  const handlers = new Map<string, (event: IpcEventLike, ...args: unknown[]) => unknown>();
  const listeners = new Map<string, Array<(event: IpcEventLike, ...args: unknown[]) => void>>();

  const ipcMain: IpcMainLike = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    on(channel, listener) {
      const existing = listeners.get(channel) ?? [];
      existing.push(listener);
      listeners.set(channel, existing);
    },
  };

  return {
    ipcMain,
    async invokeHandle(channel: string, event: IpcEventLike, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler registered for ${channel}`);
      return handler(event, ...args);
    },
    fireOn(channel: string, event: IpcEventLike, ...args: unknown[]) {
      for (const listener of listeners.get(channel) ?? []) listener(event, ...args);
    },
  };
}

function fakeEvent(senderId: number) {
  return { sender: { id: senderId, send: vi.fn() } } satisfies IpcEventLike;
}

const handlers: RequestHandlers = {
  "projects.list": () => ({ projects: [] }),
  "projects.get": ({ id }) => ({ project: id === "known" ? sampleProject() : null }),
  "projects.create": (input) => ({ project: { ...sampleProject(), name: input.name } }),
  "projects.open": ({ id }) => {
    if (id !== "known") throw new Error("not found");
    return { project: sampleProject() };
  },
  "templates.list": () => ({ templates: [] }),
  "attention.list": () => ({ items: [] }),
};

function sampleProject() {
  return {
    id: "known",
    name: "Sample",
    template: "web-app" as const,
    createdAt: new Date().toISOString(),
    activeBuilds: 0,
    pendingApprovals: 0,
    checksStatus: "ready" as const,
  };
}

describe("registerIpcRouter — requests", () => {
  it("rejects an unknown request name", async () => {
    const { ipcMain, invokeHandle } = fakeIpcMain();
    registerIpcRouter(ipcMain, handlers, {} as ChannelSources);
    const result = await invokeHandle(REQUEST_CHANNEL, fakeEvent(1), "nonexistent.channel", undefined);
    expect(result).toEqual({ ok: false, error: { message: expect.stringContaining("Unknown request") } });
  });

  it("rejects input that fails zod validation", async () => {
    const { ipcMain, invokeHandle } = fakeIpcMain();
    registerIpcRouter(ipcMain, handlers, {} as ChannelSources);
    const result = await invokeHandle(REQUEST_CHANNEL, fakeEvent(1), "projects.create", { name: "" });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns validated data for a well-formed request", async () => {
    const { ipcMain, invokeHandle } = fakeIpcMain();
    registerIpcRouter(ipcMain, handlers, {} as ChannelSources);
    const result = await invokeHandle(REQUEST_CHANNEL, fakeEvent(1), "projects.create", {
      name: "New Project",
      template: "api-service",
    });
    expect(result).toMatchObject({ ok: true, data: { project: { name: "New Project" } } });
  });

  it("wraps a thrown handler error instead of letting it escape", async () => {
    const { ipcMain, invokeHandle } = fakeIpcMain();
    registerIpcRouter(ipcMain, handlers, {} as ChannelSources);
    const result = await invokeHandle(REQUEST_CHANNEL, fakeEvent(1), "projects.open", { id: "missing" });
    expect(result).toEqual({ ok: false, error: { message: "not found" } });
  });
});

describe("registerIpcRouter — subscriptions", () => {
  it("streams events from the channel source to the subscribing sender", () => {
    const { ipcMain, fireOn } = fakeIpcMain();
    let push: ((event: ChannelEvent<"activity.events">) => void) | undefined;
    const sources: ChannelSources = {
      "activity.events": (_params, emit) => {
        push = emit;
        return vi.fn();
      },
    };
    registerIpcRouter(ipcMain, handlers, sources);

    const event = fakeEvent(7);
    fireOn(SUBSCRIBE_CHANNEL, event, "activity.events", "sub-1", undefined);
    expect(push).toBeTypeOf("function");

    push!({
      id: "e1",
      projectId: "p1",
      projectName: "P",
      kind: "note",
      message: "hi",
      occurredAt: new Date().toISOString(),
      needsAttention: false,
    });

    expect(event.sender.send).toHaveBeenCalledWith(
      "ibuildos:event:sub-1",
      expect.objectContaining({ id: "e1" }),
    );
  });

  it("stops the source when unsubscribed", () => {
    const { ipcMain, fireOn } = fakeIpcMain();
    const stop = vi.fn();
    const sources: ChannelSources = {
      "activity.events": () => stop,
    };
    registerIpcRouter(ipcMain, handlers, sources);

    fireOn(SUBSCRIBE_CHANNEL, fakeEvent(1), "activity.events", "sub-1", undefined);
    fireOn(UNSUBSCRIBE_CHANNEL, fakeEvent(1), "sub-1");

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("disposeSender stops every subscription opened by that sender", () => {
    const { ipcMain, fireOn } = fakeIpcMain();
    const stopA = vi.fn();
    const stopB = vi.fn();
    let calls = 0;
    const sources: ChannelSources = {
      "activity.events": () => (calls++ === 0 ? stopA : stopB),
    };
    const router = registerIpcRouter(ipcMain, handlers, sources);

    const event = fakeEvent(42);
    fireOn(SUBSCRIBE_CHANNEL, event, "activity.events", "sub-a", undefined);
    fireOn(SUBSCRIBE_CHANNEL, event, "activity.events", "sub-b", undefined);

    router.disposeSender(42);

    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
  });

  it("silently ignores a subscribe request for an unknown channel", () => {
    const { ipcMain, fireOn } = fakeIpcMain();
    registerIpcRouter(ipcMain, handlers, {} as ChannelSources);
    const event = fakeEvent(1);
    expect(() =>
      fireOn(SUBSCRIBE_CHANNEL, event, "nonexistent.channel", "sub-x", undefined),
    ).not.toThrow();
  });
});
