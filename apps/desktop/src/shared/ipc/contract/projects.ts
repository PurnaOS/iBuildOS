import { z } from "zod";
import { CreateProjectInputSchema, ProjectSchema } from "../../domain.js";
import { NoInput } from "./shared.js";

// The "core" domain's projects requests — see ../../../domain.ts for the
// schemas and ../../../../main/backend/core.ts for the backend they're
// validated against. Spread into the root `requests` map in ../contract.ts.
export const projectsRequests = {
  "projects.list": {
    input: NoInput,
    output: z.object({ projects: z.array(ProjectSchema) }),
  },
  "projects.get": {
    input: z.object({ id: z.string() }),
    output: z.object({ project: ProjectSchema.nullable() }),
  },
  "projects.create": {
    input: CreateProjectInputSchema,
    output: z.object({ project: ProjectSchema }),
  },
  "projects.open": {
    input: z.object({ id: z.string() }),
    output: z.object({ project: ProjectSchema }),
  },
} as const;
