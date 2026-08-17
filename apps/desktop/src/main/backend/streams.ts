import type {
  AutonomyDial,
  DialWaivedKind,
  DialWaivedRecord,
  RemediationAction,
  Stream,
  StreamQuestion,
  StreamStage,
  StreamStatus,
} from "../../shared/domain.js";

// The "streams" domain backend — build streams (SPEC.md §9.F "BD"), the
// autonomy dial (BD-004), steering (BD-008), agent questions (BD-012), and
// failure remediation (BD-013). Same shape as ./core.ts's CoreBackend
// (constructor seeds state + starts an interval; dispose() tears it down) and
// the same in-memory-fake posture — no real ACP session, no real git
// worktree, no real scheduler. Composed into the Backend facade in
// ./index.ts.
//
// Every user-facing string here (summary/statusReason/notes) is rendered
// verbatim by Product-mode UI (DESIGN-CHARTER §4) — keep this file's copy
// glossary-clean the same way ./core.ts's SCRIPTED_BEATS is.

type StreamListener = { projectId: string | undefined; emit: (stream: Stream) => void };

// Rotates through a running stream's summary line on each scripted tick —
// deliberately generic (not per-story) so seeding new stories never needs
// matching new copy. None of these words appear in DESIGN-CHARTER §4's
// banned table.
const PROGRESS_NOTES: readonly string[] = [
  "Writing tests",
  "Wiring up the new screen",
  "Connecting the data layer",
  "Polishing the details",
  "Running the checks",
];

interface StreamSeed {
  id: string;
  projectId: string;
  storyName: string;
  status: StreamStatus;
  stage?: StreamStage;
  tasksDone: number;
  tasksTotal: number;
  testsStatus: Stream["testsStatus"];
  summary: string;
  question?: StreamQuestion;
  statusReason?: string;
}

let progressCursor = 0;
let dialWaivedCursor = 0;

export class StreamsBackend {
  private readonly streams = new Map<string, Stream>();
  private readonly dials = new Map<string, AutonomyDial>();
  private readonly dialWaived: DialWaivedRecord[] = [];
  private readonly listeners = new Set<StreamListener>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickCursor = 0;

  constructor() {
    for (const seed of seedStreams()) this.streams.set(seed.id, toStream(seed));
    // Mirrors ./core.ts's scripted-beat interval: every few seconds, advance
    // exactly one eligible build by one step (queued -> starting -> running
    // -> [review | done, per the dial] | failed).
    this.tickInterval = setInterval(() => this.tick(), 3_000);
  }

  dispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  listStreams(projectId: string): Stream[] {
    return [...this.streams.values()]
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getStream(id: string): Stream | null {
    return this.streams.get(id) ?? null;
  }

  getDial(projectId: string): AutonomyDial {
    return this.dials.get(projectId) ?? "cruise"; // DEFAULTS.md #1
  }

  setDial(projectId: string, dial: AutonomyDial): AutonomyDial {
    this.dials.set(projectId, dial);
    return dial;
  }

  listDialWaived(projectId: string | undefined): DialWaivedRecord[] {
    return this.dialWaived
      .filter((r) => !projectId || r.projectId === projectId)
      .sort((a, b) => b.waivedAt.localeCompare(a.waivedAt));
  }

  markDialWaivedReviewed(id: string): DialWaivedRecord {
    const record = this.dialWaived.find((r) => r.id === id);
    if (!record) throw new Error(`No dial-waived record with id "${id}"`);
    const reviewed: DialWaivedRecord = { ...record, reviewed: true };
    const index = this.dialWaived.indexOf(record);
    this.dialWaived[index] = reviewed;
    return reviewed;
  }

  /** BD-012: answer a waiting build's question and resume it. */
  answerQuestion(streamId: string, questionId: string, answer: string): Stream {
    const stream = this.require(streamId);
    if (stream.status !== "waiting_question" || stream.question?.id !== questionId) {
      throw new Error(`Build "${streamId}" has no pending question "${questionId}"`);
    }
    return this.update(streamId, (current) => ({
      ...current,
      status: "running",
      question: undefined,
      summary: `Continuing after your answer: "${answer}"`,
      notes: pushNote(current.notes, `You answered: ${answer}`),
    }));
  }

  /** BD-008: send an instruction into any active build's session. */
  steer(streamId: string, instruction: string): Stream {
    const stream = this.require(streamId);
    if (!STEERABLE_STATUSES.has(stream.status)) {
      throw new Error(`Build "${streamId}" isn't running, so there's nothing to steer`);
    }
    return this.update(streamId, (current) => applySteer(current, instruction));
  }

  /** BD-013: one-click remediation for a stopped build. */
  remediate(streamId: string, action: RemediationAction, instruction?: string): Stream {
    const stream = this.require(streamId);
    if (!REMEDIABLE_STATUSES.has(stream.status)) {
      throw new Error(`Build "${streamId}" isn't stopped, so there's nothing to remediate`);
    }

    if (action === "abort") {
      return this.update(streamId, (current) => ({
        ...current,
        status: "aborted",
        question: undefined,
        statusReason: "Stopped — kept as-is for you to look at.",
      }));
    }

    // Validate before mutating anything — a rejected call must never leave
    // the build half-restarted.
    if (action === "steer" && !instruction) {
      throw new Error('remediate("steer") requires an instruction');
    }

    const restarted = this.update(streamId, (current) => ({
      ...current,
      status: "running",
      testsStatus: "pending",
      statusReason: undefined,
      summary: "Picking up where it left off",
    }));

    if (action === "steer") {
      return this.update(streamId, (current) => applySteer(current, instruction!));
    }

    return restarted;
  }

  subscribeStreams(projectId: string | undefined, emit: (stream: Stream) => void): () => void {
    const listener: StreamListener = { projectId, emit };
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private require(id: string): Stream {
    const stream = this.streams.get(id);
    if (!stream) throw new Error(`No build with id "${id}"`);
    return stream;
  }

  private update(id: string, fn: (current: Stream) => Stream): Stream {
    const current = this.require(id);
    const next: Stream = { ...fn(current), updatedAt: new Date().toISOString() };
    this.streams.set(id, next);
    for (const listener of this.listeners) {
      if (!listener.projectId || listener.projectId === next.projectId) listener.emit(next);
    }
    return next;
  }

  private tick(): void {
    const eligible = [...this.streams.values()]
      .filter((s) => ADVANCING_STATUSES.has(s.status))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (eligible.length === 0) return;

    const target = eligible[this.tickCursor % eligible.length]!;
    this.tickCursor += 1;
    this.advance(target.id);
  }

  private advance(id: string): void {
    this.update(id, (current) => {
      if (current.status === "queued") {
        return { ...current, status: "starting", summary: "Getting the build started" };
      }
      if (current.status === "starting") {
        return { ...current, status: "running", stage: "implement", testsStatus: "pending" };
      }

      // status === "running"
      const note = PROGRESS_NOTES[progressCursor % PROGRESS_NOTES.length]!;
      progressCursor += 1;
      const tasksDone = Math.min(current.progress.tasksDone + 1, current.progress.tasksTotal);
      const progress = { ...current.progress, tasksDone };
      const stage: StreamStage = tasksDone / progress.tasksTotal >= 0.6 ? "self-verify" : "implement";
      const summary = `${note} — ${tasksDone} of ${progress.tasksTotal} tasks done`;

      if (tasksDone < progress.tasksTotal) {
        return { ...current, progress, stage, testsStatus: "passing", summary };
      }

      // Every task is done: the stream-done gate (BD-005) passes. What
      // happens next is governed entirely by the autonomy dial (BD-004).
      const dial = this.getDial(current.projectId);
      if (dial === "auto") {
        this.recordDialWaived(current, "acceptance");
        return {
          ...current,
          progress,
          stage: "done",
          testsStatus: "passing",
          status: "done",
          summary: "Finished and added to the live product automatically",
        };
      }
      return {
        ...current,
        progress,
        stage: "self-verify",
        testsStatus: "passing",
        status: "review",
        summary: "Ready for you to accept",
      };
    });
  }

  private recordDialWaived(stream: Stream, kind: DialWaivedKind): void {
    dialWaivedCursor += 1;
    this.dialWaived.push({
      id: `waived-${dialWaivedCursor}`,
      streamId: stream.id,
      projectId: stream.projectId,
      storyName: stream.storyName,
      kind,
      mode: "dial-waived",
      waivedAt: new Date().toISOString(),
      reviewed: false,
    });
  }
}

const ADVANCING_STATUSES = new Set<StreamStatus>(["queued", "starting", "running"]);
const STEERABLE_STATUSES = new Set<StreamStatus>([
  "queued",
  "starting",
  "running",
  "paused",
  "waiting_question",
  "waiting_permission",
]);
const REMEDIABLE_STATUSES = new Set<StreamStatus>(["failed"]);

function applySteer(stream: Stream, instruction: string): Stream {
  return {
    ...stream,
    notes: pushNote(stream.notes, `You said: ${instruction}`),
    summary: `Noted — ${instruction}`,
  };
}

function pushNote(notes: readonly string[], note: string): string[] {
  return [note, ...notes].slice(0, 10);
}

function toStream(seed: StreamSeed): Stream {
  const now = new Date(Date.now() - 5 * 60_000).toISOString();
  return {
    id: seed.id,
    projectId: seed.projectId,
    storyName: seed.storyName,
    status: seed.status,
    stage: seed.stage,
    progress: { tasksDone: seed.tasksDone, tasksTotal: seed.tasksTotal },
    testsStatus: seed.testsStatus,
    summary: seed.summary,
    question: seed.question,
    statusReason: seed.statusReason,
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

// Seeded against ./core.ts's seedProjects() ids so the two domains tell one
// consistent story: "seed-equipment-inspections" has activeBuilds: 2 and
// pendingApprovals: 1 (one build running, one waiting on a question that
// still counts as active, one ready to accept); "seed-field-sync-api" is
// "needs-attention" (one stopped build); "seed-release-notes-site" is
// "ready" with nothing in flight but its one finished build.
function seedStreams(): StreamSeed[] {
  return [
    {
      id: "seed-stream-offline-capture",
      projectId: "seed-equipment-inspections",
      storyName: "Offline inspection capture",
      status: "running",
      stage: "implement",
      tasksDone: 2,
      tasksTotal: 5,
      testsStatus: "passing",
      summary: "Writing tests for offline sync — 2 of 5 tasks done",
    },
    {
      id: "seed-stream-report-export",
      projectId: "seed-equipment-inspections",
      storyName: "Equipment report PDF export",
      status: "waiting_question",
      stage: "implement",
      tasksDone: 3,
      tasksTotal: 6,
      testsStatus: "pending",
      summary: "Waiting on your answer before continuing",
      question: {
        id: "q-sync-conflict",
        prompt: "Should sync conflicts favor the newest edit, or ask the user?",
        options: ["Newest edit wins", "Ask the user"],
      },
    },
    {
      id: "seed-stream-photo-attachments",
      projectId: "seed-equipment-inspections",
      storyName: "Inspection photo attachments",
      status: "review",
      stage: "self-verify",
      tasksDone: 4,
      tasksTotal: 4,
      testsStatus: "passing",
      summary: "Ready for you to accept",
    },
    {
      id: "seed-stream-sync-conflict-resolution",
      projectId: "seed-field-sync-api",
      storyName: "Sync conflict resolution",
      status: "failed",
      stage: "self-verify",
      tasksDone: 3,
      tasksTotal: 5,
      testsStatus: "failing",
      summary: "Stopped — 2 checks are failing",
      statusReason: "Two checks failed after the last change. Nothing was discarded.",
    },
    {
      id: "seed-stream-release-changelog",
      projectId: "seed-release-notes-site",
      storyName: "Release changelog page",
      status: "done",
      stage: "done",
      tasksDone: 3,
      tasksTotal: 3,
      testsStatus: "passing",
      summary: "Finished and added to the live product",
    },
  ];
}
