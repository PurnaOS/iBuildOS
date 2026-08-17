import { randomUUID } from "node:crypto";
import type {
  AdoptionProgress,
  CoordinationNote,
  MyQueue,
  ProgressSnapshot,
  QualitySnapshot,
  QueueItem,
  QueueItemKind,
  ReleaseReadiness,
  WorkloadEntry,
  WorkloadSnapshot,
  TeamNotes,
} from "../../shared/ipc/contract/insights.js";

// The "insights" domain (dashboards, workload, brownfield adoption burndown,
// "my queue", team coordination) — the in-memory fake standing in for
// packages/engine's derived views (out of scope for this scaffold, same as
// ./core.ts's note on packages/engine). Composed into the Backend facade by
// ./index.ts; every IPC handler for this domain (../ipc/insights.ts) is
// backed by this one class. Mirrors ./core.ts's shape (constructor seeds
// state, dispose() releases timers) without depending on CoreBackend at all
// — each domain owns its own file body per that file's header comment.
//
// Everything here is SPEC.md area IN (Insights & Reporting) plus TM-004 ("my
// queue") and TM-009 (team coordination, kept light per this round's brief).
// All fields are computed/derived per those requirements' own framing
// ("derived, never hand-fed" / "never hand-maintained") — nothing here is
// meant to be written back to by the UI.

const CURRENT_USER = "Priya Shah"; // SPEC.md §7.1's persona — the fake "current git identity" (TM-004).
const TEAM = ["Priya Shah", "Arjun Mehta", "Jordan Lee"] as const;

const KNOWN_PROJECT_NAMES: Record<string, string> = {
  "seed-equipment-inspections": "Equipment Inspections",
  "seed-field-sync-api": "Field Sync API",
  "seed-release-notes-site": "Release Notes Site",
};

interface QueueBeat {
  kind: QueueItemKind;
  title: string;
  context: string;
}

// Canned "something new landed in your queue" beats, echoing TM-004/TM-005's
// language (assignment, review requested, acceptance, answered-question
// follow-up) — rotates the same way core.ts's SCRIPTED_BEATS does.
const QUEUE_BEATS: readonly QueueBeat[] = [
  {
    kind: "review",
    title: "Offline sync retry logic",
    context: "A build is ready for your review.",
  },
  {
    kind: "acceptance",
    title: "Equipment checklist export",
    context: "This story is ready to accept.",
  },
  {
    kind: "follow-up",
    title: "Should sync conflicts favor the newest edit?",
    context: "The assistant answered your question — take a look.",
  },
  {
    kind: "assignment",
    title: "Field technician offline mode",
    context: "This requirement was assigned to you.",
  },
];

let beatCursor = 0;

export class InsightsBackend {
  // Seeded once, then lazily extended for project ids this backend hasn't
  // seen yet (e.g. a freshly created project) — see ensureSeeded(). The my-
  // queue lists are the one piece that drifts over time (this.tick()), so
  // they live in their own mutable map; everything else is stable per id.
  private readonly progress = new Map<string, ProgressSnapshot>();
  private readonly quality = new Map<string, QualitySnapshot>();
  private readonly workload = new Map<string, WorkloadSnapshot>();
  private readonly adoption = new Map<string, AdoptionProgress>();
  private readonly myQueue = new Map<string, QueueItem[]>();
  private readonly teamNotes = new Map<string, CoordinationNote[]>();

  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    for (const id of Object.keys(KNOWN_PROJECT_NAMES)) this.ensureSeeded(id);

    // A light "something new landed in your queue" drift, same spirit as
    // ./core.ts's scripted-beat interval — the dashboards otherwise being
    // static is a deliberate scope call: query-response data, not a
    // subscription surface (unlike core's activity.events).
    this.tickInterval = setInterval(() => this.tick(), 6_000);
  }

  dispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  // ---------- IN-001 ----------
  getProgress(projectId: string): ProgressSnapshot {
    this.ensureSeeded(projectId);
    return this.progress.get(projectId)!;
  }

  // ---------- IN-002 ----------
  getQuality(projectId: string): QualitySnapshot {
    this.ensureSeeded(projectId);
    return this.quality.get(projectId)!;
  }

  // ---------- IN-008 ----------
  getWorkload(projectId: string): WorkloadSnapshot {
    this.ensureSeeded(projectId);
    return this.workload.get(projectId)!;
  }

  // ---------- IN-006 / BF-006 ----------
  getAdoptionProgress(projectId: string): AdoptionProgress {
    this.ensureSeeded(projectId);
    return this.adoption.get(projectId)!;
  }

  // ---------- TM-004 ----------
  getMyQueue(projectId: string): MyQueue {
    this.ensureSeeded(projectId);
    return {
      projectId,
      personName: CURRENT_USER,
      items: [...this.myQueue.get(projectId)!],
    };
  }

  // ---------- TM-009 (light) ----------
  getTeamNotes(projectId: string): TeamNotes {
    this.ensureSeeded(projectId);
    return { projectId, notes: [...this.teamNotes.get(projectId)!] };
  }

  private tick(): void {
    for (const [projectId, items] of this.myQueue) {
      if (items.length >= 6) {
        items.pop(); // make room, oldest first out — bounded like core.ts's log cap
      }
      const beat = QUEUE_BEATS[beatCursor % QUEUE_BEATS.length]!;
      beatCursor += 1;
      items.unshift({
        id: randomUUID(),
        projectId,
        projectName: projectNameFor(projectId),
        kind: beat.kind,
        title: beat.title,
        context: beat.context,
        waitingSince: new Date().toISOString(),
      });
    }
  }

  private ensureSeeded(projectId: string): void {
    if (this.progress.has(projectId)) return;

    const seed = SEEDS[projectId] ?? genericSeed(projectId);

    this.progress.set(projectId, {
      projectId,
      requirements: seed.requirements,
      stories: seed.stories,
      activeBuilds: seed.activeBuilds,
      releases: seed.releases,
    });

    this.quality.set(projectId, {
      projectId,
      coveragePercent: seed.coveragePercent,
      checksPassing: seed.checksPassing,
      checksTotal: seed.checksTotal,
      findingsBySeverity: seed.findingsBySeverity,
      suitesPassing: seed.suitesPassing,
      suitesTotal: seed.suitesTotal,
      flaggedUnreliable: seed.flaggedUnreliable,
    });

    this.workload.set(projectId, {
      projectId,
      people: seed.workload,
    });

    this.adoption.set(projectId, {
      projectId,
      isAdopted: seed.adoption.isAdopted,
      baselineTotal: seed.adoption.baselineTotal,
      remaining: seed.adoption.remaining,
      adoptedScopePercent: seed.adoption.adoptedScopePercent,
      backfillCompletePercent: seed.adoption.backfillCompletePercent,
      burndown: seed.adoption.burndown,
    });

    this.myQueue.set(
      projectId,
      seed.myQueue.map((item) => ({
        id: randomUUID(),
        projectId,
        projectName: projectNameFor(projectId),
        kind: item.kind,
        title: item.title,
        context: item.context,
        waitingSince: item.waitingSince,
      })),
    );

    this.teamNotes.set(
      projectId,
      seed.teamNotes.map((note) => ({
        id: randomUUID(),
        projectId,
        kind: note.kind,
        title: note.title,
        summary: note.summary,
        occurredAt: note.occurredAt,
      })),
    );
  }
}

function projectNameFor(id: string): string {
  return KNOWN_PROJECT_NAMES[id] ?? humanize(id);
}

function humanize(id: string): string {
  const words = id
    .replace(/^seed-/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : "This project";
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

interface Seed {
  requirements: ProgressSnapshot["requirements"];
  stories: ProgressSnapshot["stories"];
  activeBuilds: number;
  releases: ReleaseReadiness[];
  coveragePercent: number;
  checksPassing: number;
  checksTotal: number;
  findingsBySeverity: QualitySnapshot["findingsBySeverity"];
  suitesPassing: number;
  suitesTotal: number;
  flaggedUnreliable: number;
  workload: WorkloadEntry[];
  adoption: Omit<AdoptionProgress, "projectId">;
  myQueue: Array<Omit<QueueItem, "id" | "projectId" | "projectName">>;
  teamNotes: Array<Omit<CoordinationNote, "id" | "projectId">>;
}

function workloadFor(assigned: readonly number[], review: readonly number[], accept: readonly number[]): WorkloadEntry[] {
  return TEAM.map((name, i) => ({
    personId: name.toLowerCase().replace(/\s+/g, "-"),
    personName: name,
    assigned: assigned[i] ?? 0,
    pendingReview: review[i] ?? 0,
    pendingAcceptance: accept[i] ?? 0,
  }));
}

function flatBurndown(): AdoptionProgress["burndown"] {
  return [];
}

// A steadily-shrinking baseline burndown (BF-006/IN-006) — weekly points,
// most recent last, matching a burn-DOWN (not burn-up) shape.
function burndownFrom(start: number, weeks: number, remaining: number): AdoptionProgress["burndown"] {
  const points: AdoptionProgress["burndown"] = [];
  for (let i = 0; i < weeks; i++) {
    const t = i / (weeks - 1);
    const value = Math.round(start - (start - remaining) * t);
    points.push({ date: daysAgo((weeks - 1 - i) * 7), remaining: value });
  }
  return points;
}

// Known seed projects mirror ./core.ts's seedProjects() ids/names so the
// dashboards read as the same three projects, not a coincidence.
const SEEDS: Record<string, Seed> = {
  "seed-equipment-inspections": {
    // Greenfield web app, further along (core.ts: checksStatus "ready", activeBuilds 2).
    requirements: { total: 24, built: 18, verified: 15, pending: 6 },
    stories: { draft: 3, ready: 5, active: 4, done: 12 },
    activeBuilds: 2,
    releases: [
      { id: "rel-1-0", name: "1.0", status: "ready" },
      { id: "rel-1-1", name: "1.1", status: "in-progress" },
    ],
    coveragePercent: 82,
    checksPassing: 41,
    checksTotal: 45,
    findingsBySeverity: { critical: 0, high: 1, medium: 3, low: 5 },
    suitesPassing: 11,
    suitesTotal: 12,
    flaggedUnreliable: 1,
    workload: workloadFor([5, 3, 2], [2, 1, 1], [1, 0, 0]),
    adoption: {
      isAdopted: false,
      baselineTotal: 0,
      remaining: 0,
      adoptedScopePercent: 100,
      backfillCompletePercent: 100,
      burndown: flatBurndown(),
    },
    myQueue: [
      {
        kind: "acceptance",
        title: "Equipment checklist export",
        context: "This story is ready to accept.",
        waitingSince: daysAgo(1),
      },
      {
        kind: "review",
        title: "Offline photo capture",
        context: "A build is ready for your review.",
        waitingSince: daysAgo(2),
      },
    ],
    teamNotes: [
      {
        kind: "standup",
        title: "Tuesday standup",
        summary: "Offline sync is on track; photo capture needs one more review pass.",
        occurredAt: daysAgo(1),
      },
    ],
  },
  "seed-field-sync-api": {
    // Brownfield adoption in progress (core.ts: checksStatus "needs-attention", activeBuilds 1).
    requirements: { total: 16, built: 9, verified: 6, pending: 7 },
    stories: { draft: 4, ready: 3, active: 3, done: 5 },
    activeBuilds: 1,
    releases: [{ id: "rel-0-9", name: "0.9", status: "needs-attention" }],
    coveragePercent: 58,
    checksPassing: 27,
    checksTotal: 34,
    findingsBySeverity: { critical: 1, high: 4, medium: 6, low: 9 },
    suitesPassing: 7,
    suitesTotal: 9,
    flaggedUnreliable: 2,
    workload: workloadFor([2, 6, 1], [0, 2, 1], [0, 1, 0]),
    adoption: {
      isAdopted: true,
      baselineTotal: 42,
      remaining: 9,
      adoptedScopePercent: 76,
      backfillCompletePercent: 64,
      burndown: burndownFrom(42, 7, 9),
    },
    myQueue: [
      {
        kind: "review",
        title: "Adopted-scope contract for /sync endpoints",
        context: "A build is ready for your review.",
        waitingSince: daysAgo(1),
      },
      {
        kind: "follow-up",
        title: "Should the legacy auth header stay supported?",
        context: "The assistant answered your question — take a look.",
        waitingSince: daysAgo(3),
      },
      {
        kind: "assignment",
        title: "Backfill: device-pairing requirement",
        context: "This requirement was assigned to you.",
        waitingSince: daysAgo(4),
      },
    ],
    teamNotes: [
      {
        kind: "meeting",
        title: "Adoption kickoff",
        summary: "Scoped adoption to /sync and /auth first; baseline set, burndown started.",
        occurredAt: daysAgo(6),
      },
      {
        kind: "standup",
        title: "Thursday standup",
        summary: "Backfill batch 3 approved; two findings still open on the auth path.",
        occurredAt: daysAgo(2),
      },
    ],
  },
  "seed-release-notes-site": {
    // New static site (core.ts: checksStatus "in-progress", activeBuilds 0) — light on everything.
    requirements: { total: 6, built: 1, verified: 0, pending: 5 },
    stories: { draft: 4, ready: 1, active: 1, done: 0 },
    activeBuilds: 0,
    releases: [],
    coveragePercent: 40,
    checksPassing: 5,
    checksTotal: 6,
    findingsBySeverity: { critical: 0, high: 0, medium: 1, low: 2 },
    suitesPassing: 1,
    suitesTotal: 1,
    flaggedUnreliable: 0,
    workload: workloadFor([1, 0, 2], [0, 0, 0], [0, 0, 0]),
    adoption: {
      isAdopted: false,
      baselineTotal: 0,
      remaining: 0,
      adoptedScopePercent: 100,
      backfillCompletePercent: 100,
      burndown: flatBurndown(),
    },
    myQueue: [],
    teamNotes: [],
  },
};

// Deterministic fallback for any project id this backend hasn't seen before
// (e.g. one just created via CoreBackend.createProject) — small, quiet
// numbers rather than an empty/broken dashboard, varied a little per id so
// two fresh projects don't render as pixel-identical.
function genericSeed(projectId: string): Seed {
  const n = hashString(projectId);
  const total = 4 + (n % 5);
  const built = n % 3;
  return {
    requirements: { total, built, verified: 0, pending: total - built },
    stories: { draft: total - built, ready: built > 0 ? 1 : 0, active: 0, done: Math.max(built - 1, 0) },
    activeBuilds: n % 2,
    releases: [],
    coveragePercent: 0,
    checksPassing: 0,
    checksTotal: 0,
    findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    suitesPassing: 0,
    suitesTotal: 0,
    flaggedUnreliable: 0,
    workload: workloadFor([n % 3, (n >> 2) % 3, (n >> 4) % 2], [0, 0, 0], [0, 0, 0]),
    adoption: {
      isAdopted: false,
      baselineTotal: 0,
      remaining: 0,
      adoptedScopePercent: 100,
      backfillCompletePercent: 100,
      burndown: flatBurndown(),
    },
    myQueue: [],
    teamNotes: [],
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
