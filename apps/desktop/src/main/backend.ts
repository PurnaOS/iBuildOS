import { randomUUID } from "node:crypto";
import {
  TEMPLATES,
  type ActivityEvent,
  type ActivityKind,
  type ChecksStatus,
  type CreateProjectInput,
  type Project,
} from "../shared/domain.js";

// The in-memory fake standing in for packages/engine + real git (out of scope
// for this scaffold — see apps/desktop/README.md). Every IPC handler in
// src/main/ipc.ts is backed by this one object; nothing here touches the
// filesystem or a child process.

type ActivityListener = { projectId: string | undefined; emit: (event: ActivityEvent) => void };

interface ScriptedBeat {
  kind: ActivityKind;
  message: string;
  needsAttention: boolean;
}

// Canned beats echoing SPEC.md §7.1's narrative language, so the live-activity
// feed reads like the product it's simulating rather than lorem ipsum.
const SCRIPTED_BEATS: readonly ScriptedBeat[] = [
  { kind: "note", message: "Writing tests for offline sync — 2 of 5 tasks done", needsAttention: false },
  {
    kind: "question",
    message: "Should sync conflicts favor the newest edit, or ask the user?",
    needsAttention: true,
  },
  { kind: "check", message: "3 checks failing on the equipment-report build", needsAttention: true },
  { kind: "approval", message: "A story is ready for you to accept", needsAttention: true },
  { kind: "note", message: "The live product was updated with the latest changes", needsAttention: false },
];

let beatCursor = 0;

export class InMemoryBackend {
  private readonly projects = new Map<string, Project>();
  private readonly log: ActivityEvent[] = [];
  private readonly listeners = new Set<ActivityListener>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private simInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    for (const seed of seedProjects()) this.projects.set(seed.id, seed);
    // Simulated PS-008 live activity: a scripted beat every few seconds,
    // rotating across seeded projects, feeding both the activity feed and the
    // attention queue (PS-009) for anything with needsAttention: true.
    this.simInterval = setInterval(() => this.emitScriptedBeat(), 4_000);
  }

  dispose(): void {
    if (this.simInterval) clearInterval(this.simInterval);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  listProjects(): Project[] {
    return [...this.projects.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getProject(id: string): Project | null {
    return this.projects.get(id) ?? null;
  }

  createProject(input: CreateProjectInput): Project {
    const now = new Date();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      template: input.template,
      createdAt: now.toISOString(),
      activeBuilds: 0,
      pendingApprovals: 0,
      checksStatus: "in-progress",
    };
    this.projects.set(project.id, project);

    this.record({
      id: randomUUID(),
      projectId: project.id,
      projectName: project.name,
      kind: "note",
      message: `${project.name} is being scaffolded from the ${templateName(input.template)} template`,
      occurredAt: now.toISOString(),
      needsAttention: false,
    });

    // Simulate the scaffold finishing shortly after creation (PS-004: name ->
    // template -> scaffold, landing on the project's Home ready to work).
    const timer = setTimeout(() => {
      const current = this.projects.get(project.id);
      if (!current) return;
      const ready: Project = { ...current, checksStatus: "ready" };
      this.projects.set(project.id, ready);
      this.record({
        id: randomUUID(),
        projectId: project.id,
        projectName: project.name,
        kind: "note",
        message: `${project.name}'s scaffold is ready`,
        occurredAt: new Date().toISOString(),
        needsAttention: false,
      });
      this.timers.delete(timer);
    }, 1_200);
    this.timers.add(timer);

    return project;
  }

  openProject(id: string): Project {
    const project = this.projects.get(id);
    if (!project) throw new Error(`No project with id "${id}"`);
    return project;
  }

  listAttention(projectId: string | undefined): ActivityEvent[] {
    return this.log.filter((e) => e.needsAttention && (!projectId || e.projectId === projectId));
  }

  subscribeActivity(
    projectId: string | undefined,
    emit: (event: ActivityEvent) => void,
  ): () => void {
    const listener: ActivityListener = { projectId, emit };
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private record(event: ActivityEvent): void {
    this.log.push(event);
    if (this.log.length > 200) this.log.shift();
    for (const listener of this.listeners) {
      if (!listener.projectId || listener.projectId === event.projectId) listener.emit(event);
    }
  }

  private emitScriptedBeat(): void {
    const projects = this.listProjects();
    if (projects.length === 0) return;
    const beat = SCRIPTED_BEATS[beatCursor % SCRIPTED_BEATS.length]!;
    beatCursor += 1;
    const project = projects[beatCursor % projects.length]!;
    this.record({
      id: randomUUID(),
      projectId: project.id,
      projectName: project.name,
      kind: beat.kind,
      message: beat.message,
      occurredAt: new Date().toISOString(),
      needsAttention: beat.needsAttention,
    });
  }
}

function templateName(id: CreateProjectInput["template"]): string {
  return TEMPLATES.find((t) => t.id === id)?.name ?? id;
}

function seedProjects(): Project[] {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const checksStatuses: ChecksStatus[] = ["ready", "needs-attention", "in-progress"];
  return [
    {
      id: "seed-equipment-inspections",
      name: "Equipment Inspections",
      template: "web-app",
      createdAt: daysAgo(6),
      activeBuilds: 2,
      pendingApprovals: 1,
      checksStatus: checksStatuses[0]!,
    },
    {
      id: "seed-field-sync-api",
      name: "Field Sync API",
      template: "api-service",
      createdAt: daysAgo(3),
      activeBuilds: 1,
      pendingApprovals: 0,
      checksStatus: checksStatuses[1]!,
    },
    {
      id: "seed-release-notes-site",
      name: "Release Notes Site",
      template: "static-site",
      createdAt: daysAgo(1),
      activeBuilds: 0,
      pendingApprovals: 0,
      checksStatus: checksStatuses[2]!,
    },
  ];
}
