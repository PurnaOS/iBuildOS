import type {
  AutonomyDial,
  DialWaivedKind,
  RemediationAction,
  StreamStage,
  StreamStatus,
  StreamTestsStatus,
} from "../../../shared/domain.js";

// DESIGN-CHARTER §4's vocabulary glossary, applied to the streams domain:
// never render a raw StreamStatus/StreamStage/DialWaivedKind/RemediationAction
// value in Product mode — always go through one of these label maps. "stream"
// itself is glossary-banned in Product-mode text (the nav section and every
// component in ./components/builds/ calls it a "build" instead — the
// directory itself is named "builds" only to dodge the repo's build/
// .gitignore pattern; nothing product-facing turns on that spelling).

export const STREAM_STATUS_LABEL: Record<StreamStatus, string> = {
  queued: "Waiting to start",
  starting: "Getting started",
  running: "Building",
  paused: "Paused",
  waiting_question: "Waiting on your answer",
  waiting_permission: "Waiting on a permission",
  review: "Ready for you to accept",
  superseded: "Picked up elsewhere",
  aborted: "Stopped",
  failed: "Needs attention",
  done: "Done",
};

export const STREAM_STAGE_LABEL: Record<StreamStage, string> = {
  implement: "Building",
  "self-verify": "Checking its work",
  done: "Done",
};

export const AUTONOMY_DIAL_LABEL: Record<AutonomyDial, string> = {
  step: "Step",
  cruise: "Cruise",
  auto: "Auto",
};

// BD-004's three levels, in Priya-facing language (SPEC.md §7.1).
export const AUTONOMY_DIAL_DESCRIPTION: Record<AutonomyDial, string> = {
  step: "Every step waits for you.",
  cruise: "Moves on its own; checks with you before accepting a finished story.",
  auto: "Moves on its own, including accepting finished stories — reviewed after the fact.",
};

// D-115: "merge" is glossary-banned — the substitute is "finish & combine" /
// "added to the live product."
export const DIAL_WAIVED_KIND_LABEL: Record<DialWaivedKind, string> = {
  acceptance: "accepted automatically",
  merge: "added to the live product automatically",
};

export const REMEDIATION_ACTION_LABEL: Record<RemediationAction, string> = {
  retry: "Try again",
  steer: "Send instruction",
  abort: "Stop this build",
};

export const TESTS_STATUS_LABEL: Record<StreamTestsStatus, string> = {
  passing: "Checks passing",
  failing: "Checks failing",
  pending: "Checks running",
};

// DESIGN-CHARTER §1's state buckets (done/green, active/amber, blocked/red,
// ready/blue, draft/gray) mapped onto tailwind's state-* tokens — paired with
// STREAM_STATUS_LABEL + an icon in components/builds so state is never
// color-alone.
export type StatusTone = "done" | "active" | "blocked" | "ready" | "draft";

export const STREAM_STATUS_TONE: Record<StreamStatus, StatusTone> = {
  queued: "draft",
  starting: "draft",
  running: "active",
  paused: "draft",
  waiting_question: "blocked",
  waiting_permission: "blocked",
  review: "ready",
  superseded: "draft",
  aborted: "draft",
  failed: "blocked",
  done: "done",
};
