import type {
  RequestInput,
  RequestOutput,
  ChannelParams,
  ChannelEvent,
} from "./contract.js";

// The friendly, namespaced shape `window.ibuildos` actually has in the
// renderer (src/preload/index.ts builds this; src/renderer/src/global.d.ts
// declares it on Window). Each method's types are pinned to the shared
// contract (contract.ts) via RequestInput/RequestOutput/ChannelParams/
// ChannelEvent, so preload and renderer can never drift from what main
// actually validates and returns.
export interface IbuildosApi {
  projects: {
    list(): Promise<RequestOutput<"projects.list">>;
    get(input: RequestInput<"projects.get">): Promise<RequestOutput<"projects.get">>;
    create(input: RequestInput<"projects.create">): Promise<RequestOutput<"projects.create">>;
    open(input: RequestInput<"projects.open">): Promise<RequestOutput<"projects.open">>;
  };
  templates: {
    list(): Promise<RequestOutput<"templates.list">>;
  };
  attention: {
    list(input?: RequestInput<"attention.list">): Promise<RequestOutput<"attention.list">>;
  };
  activity: {
    /** Returns an unsubscribe function. */
    subscribe(
      params: ChannelParams<"activity.events">,
      onEvent: (event: ChannelEvent<"activity.events">) => void,
    ): () => void;
  };
  insights: {
    progress(input: RequestInput<"insights.progress">): Promise<RequestOutput<"insights.progress">>;
    quality(input: RequestInput<"insights.quality">): Promise<RequestOutput<"insights.quality">>;
    workload(input: RequestInput<"insights.workload">): Promise<RequestOutput<"insights.workload">>;
    adoption(input: RequestInput<"insights.adoption">): Promise<RequestOutput<"insights.adoption">>;
    myQueue(input: RequestInput<"insights.my-queue">): Promise<RequestOutput<"insights.my-queue">>;
    teamNotes(input: RequestInput<"insights.team-notes">): Promise<RequestOutput<"insights.team-notes">>;
  };
}
