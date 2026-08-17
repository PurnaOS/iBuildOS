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
  streams: {
    list(input: RequestInput<"streams.list">): Promise<RequestOutput<"streams.list">>;
    get(input: RequestInput<"streams.get">): Promise<RequestOutput<"streams.get">>;
    getDial(input: RequestInput<"streams.getDial">): Promise<RequestOutput<"streams.getDial">>;
    setDial(input: RequestInput<"streams.setDial">): Promise<RequestOutput<"streams.setDial">>;
    answerQuestion(
      input: RequestInput<"streams.answerQuestion">,
    ): Promise<RequestOutput<"streams.answerQuestion">>;
    steer(input: RequestInput<"streams.steer">): Promise<RequestOutput<"streams.steer">>;
    remediate(
      input: RequestInput<"streams.remediate">,
    ): Promise<RequestOutput<"streams.remediate">>;
    listDialWaived(
      input?: RequestInput<"streams.listDialWaived">,
    ): Promise<RequestOutput<"streams.listDialWaived">>;
    markDialWaivedReviewed(
      input: RequestInput<"streams.markDialWaivedReviewed">,
    ): Promise<RequestOutput<"streams.markDialWaivedReviewed">>;
    /** Returns an unsubscribe function. */
    subscribe(
      params: ChannelParams<"streams.events">,
      onEvent: (event: ChannelEvent<"streams.events">) => void,
    ): () => void;
  };
}
