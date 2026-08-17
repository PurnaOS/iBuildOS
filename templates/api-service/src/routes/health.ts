import type { Hono } from "hono";

// PV-008's non-web preview surface for this template: an interaction surface
// derived from this route, hit directly for the "preview" definition in
// template.yaml / ibuildos.yaml (there's no browsable UI to preview).
export function registerHealthRoutes(app: Hono): void {
  app.get("/health", (c) => c.json({ status: "ok" }));
}
