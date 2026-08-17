import { TEMPLATES } from "../../shared/domain.js";
import type { RequestHandlers, ChannelSources } from "../../shared/ipc/router.js";
import type { CoreBackend } from "../backend/core.js";

// The "core" domain's slice of the IPC surface (projects/templates/attention/
// activity.events) — wired to ../backend/core.ts's CoreBackend. Composed into
// the full RequestHandlers/ChannelSources maps by ../ipc.ts, alongside future
// streams/insights slices (see ../backend/streams.ts, ../backend/insights.ts
// on the backend side), the same spread pattern as
// src/shared/ipc/contract.ts.

export function coreHandlers(
  core: CoreBackend,
): Pick<
  RequestHandlers,
  "projects.list" | "projects.get" | "projects.create" | "projects.open" | "templates.list" | "attention.list"
> {
  return {
    "projects.list": () => ({ projects: core.listProjects() }),
    "projects.get": ({ id }) => ({ project: core.getProject(id) }),
    "projects.create": (input) => ({ project: core.createProject(input) }),
    "projects.open": ({ id }) => ({ project: core.openProject(id) }),
    "templates.list": () => ({ templates: [...TEMPLATES] }),
    "attention.list": (input) => ({ items: core.listAttention(input?.projectId) }),
  };
}

export function coreSources(core: CoreBackend): Pick<ChannelSources, "activity.events"> {
  return {
    "activity.events": (params, emit) => core.subscribeActivity(params?.projectId, emit),
  };
}
