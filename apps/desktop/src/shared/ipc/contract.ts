import { z } from "zod";
import { projectsRequests } from "./contract/projects.js";
import { templatesRequests } from "./contract/templates.js";
import { attentionRequests, attentionChannels } from "./contract/attention.js";
import { insightsRequests } from "./contract/insights.js";
import { verificationRequests, verificationChannels } from "./contract/verification.js";

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
//
// Each domain owns its own slice file under ./contract/ (projects.ts,
// templates.ts, attention.ts today — all the "core" domain; future streams.ts
// and insights.ts slices spread in the same way) so a work package adding a
// domain never edits another domain's slice body, only adds a file and a
// spread line here.

export const requests = {
  ...projectsRequests,
  ...templatesRequests,
  ...attentionRequests,
  ...insightsRequests,
  ...verificationRequests,
} as const;

export type RequestName = keyof typeof requests;
export type RequestInput<K extends RequestName> = z.infer<(typeof requests)[K]["input"]>;
export type RequestOutput<K extends RequestName> = z.infer<(typeof requests)[K]["output"]>;

export const channels = {
  ...attentionChannels,
  ...verificationChannels,
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
