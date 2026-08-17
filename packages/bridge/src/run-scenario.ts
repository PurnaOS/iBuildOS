#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { StubAgent, loadScenario } from "@ibuildos/stub-agent";

// The bridge's own tiny replay driver, spawned as a real child process (via
// tsx — see spawn.ts) for scenario fixtures that live in this package
// (fixtures/), which the shipped `ibuildos-stub-agent` CLI can't reach (it
// only resolves scenario names against its own `scenarios/` directory).
// Imports `@ibuildos/stub-agent`'s public exports directly — that package is
// read-only reference/test-double, not a coupling to a sibling work
// package's in-progress code (that prohibition is scoped to `packages/acp`).
//
// Usage: run-scenario.ts <absolute-path-to-scenario.json>

const scenarioPath = process.argv[2];
if (!scenarioPath) {
  throw new Error("run-scenario: missing scenario file path argument");
}

const scenario = loadScenario(JSON.parse(readFileSync(scenarioPath, "utf8")));
new StubAgent({ scenario, input: process.stdin, output: process.stdout });
