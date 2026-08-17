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
  // The "verification" domain (previews/tests/acceptance/merge) — see
  // ./contract/verification.ts for the schemas and ../../main/backend/
  // verification.ts for the backend they're validated against.
  verification: {
    preview: {
      get(input: RequestInput<"verification.preview.get">): Promise<RequestOutput<"verification.preview.get">>;
      refresh(
        input: RequestInput<"verification.preview.refresh">,
      ): Promise<RequestOutput<"verification.preview.refresh">>;
    };
    tests: {
      get(input: RequestInput<"verification.tests.get">): Promise<RequestOutput<"verification.tests.get">>;
      start(input: RequestInput<"verification.tests.start">): Promise<RequestOutput<"verification.tests.start">>;
      rerunCase(
        input: RequestInput<"verification.tests.rerunCase">,
      ): Promise<RequestOutput<"verification.tests.rerunCase">>;
    };
    acceptance: {
      get(
        input: RequestInput<"verification.acceptance.get">,
      ): Promise<RequestOutput<"verification.acceptance.get">>;
      decide(
        input: RequestInput<"verification.acceptance.decide">,
      ): Promise<RequestOutput<"verification.acceptance.decide">>;
      waive(
        input: RequestInput<"verification.acceptance.waive">,
      ): Promise<RequestOutput<"verification.acceptance.waive">>;
    };
    merge: {
      get(input: RequestInput<"verification.merge.get">): Promise<RequestOutput<"verification.merge.get">>;
      finish(input: RequestInput<"verification.merge.finish">): Promise<RequestOutput<"verification.merge.finish">>;
    };
    updates: {
      /** Returns an unsubscribe function. */
      subscribe(
        params: ChannelParams<"verification.updates">,
        onEvent: (event: ChannelEvent<"verification.updates">) => void,
      ): () => void;
    };
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
