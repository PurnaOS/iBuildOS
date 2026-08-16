#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StubAgent } from "./agent.js";
import { loadScenario } from "./scenario.js";

const here = dirname(fileURLToPath(import.meta.url));
const scenarioName = process.argv[2] ?? "hello-world";
const scenarioPath = join(here, "..", "scenarios", `${scenarioName}.json`);

const scenario = loadScenario(JSON.parse(readFileSync(scenarioPath, "utf8")));

new StubAgent({ scenario, input: process.stdin, output: process.stdout });
