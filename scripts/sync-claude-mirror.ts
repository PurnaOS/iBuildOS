#!/usr/bin/env bun
// Resyncs templates/.claude from plugin/ (its single source of truth). plugin/ is
// canonical: edit it, then run `bun run sync:claude`. TestClaudeMirror is the
// drift gate. Replaces the Go `go:generate` step.
import { rmSync, mkdirSync, cpSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const plugin = join(root, "plugin");
const mirror = join(root, "templates", ".claude");

rmSync(mirror, { recursive: true, force: true });
mkdirSync(mirror, { recursive: true });
cpSync(join(plugin, "skills"), join(mirror, "skills"), { recursive: true });
cpSync(join(plugin, "agents"), join(mirror, "agents"), { recursive: true });
copyFileSync(join(plugin, "hooks", "hooks.json"), join(mirror, "settings.json"));

console.log("sync:claude: templates/.claude rebuilt from plugin/");
