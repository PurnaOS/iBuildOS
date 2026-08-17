import { z } from "zod";
import {
  ActivityEventSchema,
  CreateProjectInputSchema,
  ProjectSchema,
  TemplateSchema,
} from "../domain.js";

export {
  REQUEST_CHANNEL,
  SUBSCRIBE_CHANNEL,
  UNSUBSCRIBE_CHANNEL,
  SUBSCRIPTION_EVENT_PREFIX,
} from "./channel-names.js";

// T-008: "a hand-rolled, zod-validated IPC router ... typed queries/mutations
// plus subscription channels for live events. Schemas live in a shared package
// so engine, bridge, CLI, and UI import identical types." This file is that
// shared contract for the desktop scaffold: one map of request/response
// channels (query or mutation — the distinction doesn't change the wire shape)
// and one map of subscription channels. Everything here is data (zod schemas);
// src/shared/ipc/router.ts turns it into a runtime router, on both ends.

const NoInput = z.undefined();

export const requests = {
  "projects.list": {
    input: NoInput,
    output: z.object({ projects: z.array(ProjectSchema) }),
  },
  "projects.get": {
    input: z.object({ id: z.string() }),
    output: z.object({ project: ProjectSchema.nullable() }),
  },
  "projects.create": {
    input: CreateProjectInputSchema,
    output: z.object({ project: ProjectSchema }),
  },
  "projects.open": {
    input: z.object({ id: z.string() }),
    output: z.object({ project: ProjectSchema }),
  },
  "templates.list": {
    input: NoInput,
    output: z.object({ templates: z.array(TemplateSchema) }),
  },
  "attention.list": {
    input: z.object({ projectId: z.string() }).optional(),
    output: z.object({ items: z.array(ActivityEventSchema) }),
  },
} as const;

export type RequestName = keyof typeof requests;
export type RequestInput<K extends RequestName> = z.infer<(typeof requests)[K]["input"]>;
export type RequestOutput<K extends RequestName> = z.infer<(typeof requests)[K]["output"]>;

// Subscription channels: renderer subscribes with `params`, main pushes zero or
// more `event` payloads until the renderer unsubscribes (or its WebContents is
// destroyed — the router's job to clean that up, see router.ts).
export const channels = {
  "activity.events": {
    params: z.object({ projectId: z.string() }).optional(),
    event: ActivityEventSchema,
  },
} as const;

export type ChannelName = keyof typeof channels;
export type ChannelParams<K extends ChannelName> = z.infer<(typeof channels)[K]["params"]>;
export type ChannelEvent<K extends ChannelName> = z.infer<(typeof channels)[K]["event"]>;

// Wire envelope for request/response calls — thrown errors don't survive
// ipcMain.handle's structured-clone boundary cleanly, so handlers return this
// explicitly and the preload bridge unwraps it (throwing in the renderer,
// where normal try/catch expectations hold).
export type RouterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } };
