import type { RequestHandlers, ChannelSources } from "../../shared/ipc/router.js";
import type { StreamsBackend } from "../backend/streams.js";

// The "streams" domain's slice of the IPC surface (build list/detail, the
// autonomy dial, agent questions, steering, remediation, dial-waived
// tracking, and the streams.events subscription) — wired to
// ../backend/streams.ts's StreamsBackend. Composed into the full
// RequestHandlers/ChannelSources maps by ../ipc.ts, the same spread pattern
// as ./core.ts.

export function streamsHandlers(
  streams: StreamsBackend,
): Pick<
  RequestHandlers,
  | "streams.list"
  | "streams.get"
  | "streams.getDial"
  | "streams.setDial"
  | "streams.answerQuestion"
  | "streams.steer"
  | "streams.remediate"
  | "streams.listDialWaived"
  | "streams.markDialWaivedReviewed"
> {
  return {
    "streams.list": ({ projectId }) => ({ streams: streams.listStreams(projectId) }),
    "streams.get": ({ id }) => ({ stream: streams.getStream(id) }),
    "streams.getDial": ({ projectId }) => ({ dial: streams.getDial(projectId) }),
    "streams.setDial": ({ projectId, dial }) => ({ dial: streams.setDial(projectId, dial) }),
    "streams.answerQuestion": ({ streamId, questionId, answer }) => ({
      stream: streams.answerQuestion(streamId, questionId, answer),
    }),
    "streams.steer": ({ streamId, instruction }) => ({
      stream: streams.steer(streamId, instruction),
    }),
    "streams.remediate": ({ streamId, action, instruction }) => ({
      stream: streams.remediate(streamId, action, instruction),
    }),
    "streams.listDialWaived": (input) => ({ items: streams.listDialWaived(input?.projectId) }),
    "streams.markDialWaivedReviewed": ({ id }) => ({
      item: streams.markDialWaivedReviewed(id),
    }),
  };
}

export function streamsSources(streams: StreamsBackend): Pick<ChannelSources, "streams.events"> {
  return {
    "streams.events": (params, emit) => streams.subscribeStreams(params?.projectId, emit),
  };
}
