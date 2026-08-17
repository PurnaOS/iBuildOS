import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Synthetic-repo generator, used by both the watcher's own perf smoke test
// and NFR-004's "thousands of artifacts... in seconds" check. Produces
// structurally-parseable OKF files (real `---`-delimited frontmatter with
// `type`/`id`/`links`) with configurable link density — not spec-valid
// against any real type profile, just enough for parseOkfDocument and a
// dirty-set resolver to have something realistic to chew on.

export interface GenerateSyntheticBundleOptions {
  /** How many other generated artifacts each artifact links to (via a
   * `relates_to` link block), forming plausible chains. Defaults to 3. */
  linksPerArtifact?: number;
  /** ID prefix for generated artifacts, e.g. "SYN" -> "SYN-00001". */
  idPrefix?: string;
}

function syntheticId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

// Writes are batched rather than fired as one unbounded `Promise.all` over
// every artifact: at "thousands of artifacts" (NFR-004) that would open
// thousands of file descriptors at once, and default open-file limits on
// some platforms/CI runners are far lower than this dev machine's.
const WRITE_BATCH_SIZE = 200;

async function writeInBatches(tasks: Array<() => Promise<void>>): Promise<void> {
  for (let i = 0; i < tasks.length; i += WRITE_BATCH_SIZE) {
    await Promise.all(tasks.slice(i, i + WRITE_BATCH_SIZE).map((task) => task()));
  }
}

/**
 * Generates `count` synthetic OKF artifact files on disk under `dir`, each
 * linking to `opts.linksPerArtifact` other generated artifacts. Files are
 * named `<id>.md` (lowercased) and are parseable by `parseOkfDocument`.
 */
export async function generateSyntheticBundle(
  dir: string,
  count: number,
  opts: GenerateSyntheticBundleOptions = {},
): Promise<void> {
  const linksPerArtifact = opts.linksPerArtifact ?? 3;
  const idPrefix = opts.idPrefix ?? "SYN";

  await mkdir(dir, { recursive: true });

  const ids = Array.from({ length: count }, (_, i) => syntheticId(idPrefix, i + 1));

  await writeInBatches(
    ids.map((id, i) => async () => {
      const links: string[] = [];
      for (let k = 1; k <= linksPerArtifact && k < count; k++) {
        const target = ids[(i + k) % count]!;
        if (target !== id) links.push(target);
      }
      const linksBlock = links.length > 0 ? `links:\n  relates_to: [${links.join(", ")}]\n` : "";
      const content =
        `---\n` +
        `type: SyntheticArtifact\n` +
        `id: ${id}\n` +
        `title: "Synthetic artifact ${i + 1}"\n` +
        linksBlock +
        `---\n` +
        `\n` +
        `Synthetic body for ${id}, used for watch/validation throughput measurement.\n`;

      await writeFile(join(dir, `${id.toLowerCase()}.md`), content, "utf8");
    }),
  );
}
