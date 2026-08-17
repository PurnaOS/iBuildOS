import { z } from "zod";
import { TemplateSchema } from "../../domain.js";
import { NoInput } from "./shared.js";

// The "core" domain's templates requests. Spread into the root `requests`
// map in ../contract.ts.
export const templatesRequests = {
  "templates.list": {
    input: NoInput,
    output: z.object({ templates: z.array(TemplateSchema) }),
  },
} as const;
