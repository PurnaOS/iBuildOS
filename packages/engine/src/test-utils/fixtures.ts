import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "..", "fixtures");

export function readFixture(relativePath: string): string {
  return readFileSync(join(fixturesRoot, relativePath), "utf8");
}
