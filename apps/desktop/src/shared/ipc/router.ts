import {
  requests,
  channels,
  REQUEST_CHANNEL,
  SUBSCRIBE_CHANNEL,
  UNSUBSCRIBE_CHANNEL,
  SUBSCRIPTION_EVENT_PREFIX,
  type RequestName,
  type RequestInput,
  type RequestOutput,
  type ChannelName,
  type ChannelParams,
  type ChannelEvent,
  type RouterResult,
} from "./contract.js";

// Main-process side of T-008's router, built against a minimal structural
// interface (IpcMainLike/IpcEventLike) instead of Electron's own types. That
// means registerIpcRouter can be exercised in Vitest with a plain in-memory
// fake — no Electron runtime needed to test zod validation, unknown-channel
// rejection, or subscribe/unsubscribe lifecycle (see src/main/ipc.test.ts).

export interface IpcSenderLike {
  id: number;
  send(channel: string, ...args: unknown[]): void;
}

export interface IpcEventLike {
  sender: IpcSenderLike;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcEventLike, ...args: unknown[]) => unknown | Promise<unknown>,
  ): void;
  on(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => void): void;
}

export type RequestHandlers = {
  [K in RequestName]: (input: RequestInput<K>) => Promise<RequestOutput<K>> | RequestOutput<K>;
};

// A channel "source" is how main produces events for one subscription: given
// the (validated) params and an `emit` callback, start producing events and
// return a function that stops.
export type ChannelSources = {
  [K in ChannelName]: (
    params: ChannelParams<K>,
    emit: (event: ChannelEvent<K>) => void,
  ) => () => void;
};

export interface IpcRouter {
  /** Stop every subscription opened by a given renderer WebContents (call this
   * from that WebContents's 'destroyed' event — leaking timers/intervals
   * otherwise). */
  disposeSender(senderId: number): void;
}

export function registerIpcRouter(
  ipcMain: IpcMainLike,
  handlers: RequestHandlers,
  sources: ChannelSources,
): IpcRouter {
  ipcMain.handle(
    REQUEST_CHANNEL,
    async (_event, name: unknown, rawInput: unknown): Promise<RouterResult<unknown>> => {
      if (typeof name !== "string" || !isRequestName(name)) {
        return { ok: false, error: { message: `Unknown request channel: ${String(name)}` } };
      }
      const def = requests[name];
      const parsedInput = def.input.safeParse(rawInput);
      if (!parsedInput.success) {
        return {
          ok: false,
          error: { message: `Invalid input for "${name}": ${parsedInput.error.message}` },
        };
      }
      try {
        const handler = handlers[name] as (input: unknown) => unknown;
        const result = await handler(parsedInput.data);
        const parsedOutput = def.output.safeParse(result);
        if (!parsedOutput.success) {
          return {
            ok: false,
            error: {
              message: `Handler for "${name}" returned an unexpected shape: ${parsedOutput.error.message}`,
            },
          };
        }
        return { ok: true, data: parsedOutput.data };
      } catch (err) {
        return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
      }
    },
  );

  // subscriptionId -> stop function, plus a reverse index by sender so a
  // destroyed WebContents can be cleaned up in one call.
  const active = new Map<string, () => void>();
  const bySender = new Map<number, Set<string>>();

  ipcMain.on(
    SUBSCRIBE_CHANNEL,
    (event, name: unknown, subscriptionId: unknown, rawParams: unknown) => {
      if (typeof name !== "string" || !isChannelName(name) || typeof subscriptionId !== "string") {
        return;
      }
      const def = channels[name];
      const parsedParams = def.params.safeParse(rawParams);
      if (!parsedParams.success) return;

      const sender = event.sender;
      const source = sources[name] as (params: unknown, emit: (e: unknown) => void) => () => void;
      const stop = source(parsedParams.data, (evt) => {
        const parsedEvent = def.event.safeParse(evt);
        if (!parsedEvent.success) return;
        sender.send(`${SUBSCRIPTION_EVENT_PREFIX}${subscriptionId}`, parsedEvent.data);
      });

      active.set(subscriptionId, stop);
      const forSender = bySender.get(sender.id) ?? new Set<string>();
      forSender.add(subscriptionId);
      bySender.set(sender.id, forSender);
    },
  );

  ipcMain.on(UNSUBSCRIBE_CHANNEL, (_event, subscriptionId: unknown) => {
    if (typeof subscriptionId !== "string") return;
    stopOne(subscriptionId);
  });

  function stopOne(subscriptionId: string): void {
    const stop = active.get(subscriptionId);
    if (!stop) return;
    stop();
    active.delete(subscriptionId);
    for (const ids of bySender.values()) ids.delete(subscriptionId);
  }

  return {
    disposeSender(senderId: number): void {
      const ids = bySender.get(senderId);
      if (!ids) return;
      for (const id of [...ids]) stopOne(id);
      bySender.delete(senderId);
    },
  };
}

function isRequestName(value: string): value is RequestName {
  return Object.prototype.hasOwnProperty.call(requests, value);
}

function isChannelName(value: string): value is ChannelName {
  return Object.prototype.hasOwnProperty.call(channels, value);
}
