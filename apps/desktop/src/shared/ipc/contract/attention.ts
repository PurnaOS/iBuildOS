import { z } from "zod";
import { ActivityEventSchema } from "../../domain.js";

// The "core" domain's attention request and its backing activity.events
// subscription channel — one event shape feeds both (see ../../domain.ts).
// Spread into the root `requests`/`channels` maps in ../contract.ts.
export const attentionRequests = {
  "attention.list": {
    input: z.object({ projectId: z.string() }).optional(),
    output: z.object({ items: z.array(ActivityEventSchema) }),
  },
} as const;

// Subscription channel: renderer subscribes with `params`, main pushes zero
// or more `event` payloads until the renderer unsubscribes (or its
// WebContents is destroyed — the router's job to clean that up, see
// ../router.ts).
export const attentionChannels = {
  "activity.events": {
    params: z.object({ projectId: z.string() }).optional(),
    event: ActivityEventSchema,
  },
} as const;
