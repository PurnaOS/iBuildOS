import { z } from "zod";
import {
  AutonomyDialSchema,
  DialWaivedRecordSchema,
  RemediationActionSchema,
  StreamSchema,
} from "../../domain.js";

// The "streams" domain's requests (build list/detail, the autonomy dial,
// answering a question card, steering, and failure remediation) and its
// live-update subscription channel — mirroring ../../../main/backend/
// streams.ts's StreamsBackend one for one. Spread into the root
// `requests`/`channels` maps in ../contract.ts, the same pattern as
// ./attention.ts's attentionRequests/attentionChannels.
export const streamsRequests = {
  "streams.list": {
    input: z.object({ projectId: z.string() }),
    output: z.object({ streams: z.array(StreamSchema) }),
  },
  "streams.get": {
    input: z.object({ id: z.string() }),
    output: z.object({ stream: StreamSchema.nullable() }),
  },
  "streams.getDial": {
    input: z.object({ projectId: z.string() }),
    output: z.object({ dial: AutonomyDialSchema }),
  },
  "streams.setDial": {
    input: z.object({ projectId: z.string(), dial: AutonomyDialSchema }),
    output: z.object({ dial: AutonomyDialSchema }),
  },
  "streams.answerQuestion": {
    input: z.object({
      streamId: z.string(),
      questionId: z.string(),
      answer: z.string().trim().min(1),
    }),
    output: z.object({ stream: StreamSchema }),
  },
  "streams.steer": {
    input: z.object({ streamId: z.string(), instruction: z.string().trim().min(1) }),
    output: z.object({ stream: StreamSchema }),
  },
  "streams.remediate": {
    input: z.object({
      streamId: z.string(),
      action: RemediationActionSchema,
      instruction: z.string().trim().min(1).optional(),
    }),
    output: z.object({ stream: StreamSchema }),
  },
  "streams.listDialWaived": {
    input: z.object({ projectId: z.string() }).optional(),
    output: z.object({ items: z.array(DialWaivedRecordSchema) }),
  },
  "streams.markDialWaivedReviewed": {
    input: z.object({ id: z.string() }),
    output: z.object({ item: DialWaivedRecordSchema }),
  },
} as const;

export const streamsChannels = {
  "streams.events": {
    params: z.object({ projectId: z.string() }).optional(),
    event: StreamSchema,
  },
} as const;
