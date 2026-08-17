import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSyntheticBundle } from "./synthetic-repo.js";
import { parseOkfDocument } from "../store/okf-document.js";

describe("generateSyntheticBundle", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ibuildos-synth-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("produces exactly N parseable files with the configured link density", async () => {
    const count = 25;
    const linksPerArtifact = 4;
    await generateSyntheticBundle(dir, count, { linksPerArtifact });

    const files = await readdir(dir);
    expect(files).toHaveLength(count);

    const ids = new Set<string>();
    let totalLinks = 0;

    for (const file of files) {
      const raw = await readFile(join(dir, file), "utf8");
      const doc = parseOkfDocument(raw);
      expect(doc.frontmatter.type).toBe("SyntheticArtifact");
      expect(typeof doc.frontmatter.id).toBe("string");
      ids.add(doc.frontmatter.id as string);

      const links = doc.frontmatter.links as { relates_to?: string[] } | undefined;
      if (links?.relates_to) {
        totalLinks += links.relates_to.length;
        expect(links.relates_to.length).toBeLessThanOrEqual(linksPerArtifact);
        // No self-links.
        expect(links.relates_to).not.toContain(doc.frontmatter.id);
      }
    }

    // All IDs unique.
    expect(ids.size).toBe(count);

    // Roughly honors the configured link density: every artifact should
    // have close to `linksPerArtifact` outgoing links (count - 1 >= linksPerArtifact).
    const avgLinks = totalLinks / count;
    expect(avgLinks).toBeGreaterThan(linksPerArtifact - 1);
    expect(avgLinks).toBeLessThanOrEqual(linksPerArtifact);
  });

  it("defaults to 3 links per artifact when unspecified", async () => {
    await generateSyntheticBundle(dir, 10);
    const files = await readdir(dir);
    const raw = await readFile(join(dir, files[0]!), "utf8");
    const doc = parseOkfDocument(raw);
    const links = doc.frontmatter.links as { relates_to?: string[] };
    expect(links.relates_to).toHaveLength(3);
  });

  it(
    "generates thousands of artifacts within NFR-004's 'seconds' budget",
    async () => {
      const count = 5000;
      const started = Date.now();
      await generateSyntheticBundle(dir, count, { linksPerArtifact: 5 });
      const elapsedMs = Date.now() - started;

      const files = await readdir(dir);
      expect(files).toHaveLength(count);
      expect(elapsedMs).toBeLessThan(10_000);
    },
    20_000,
  );

  it("handles small counts without crashing (fewer artifacts than links requested)", async () => {
    await generateSyntheticBundle(dir, 2, { linksPerArtifact: 5 });
    const files = await readdir(dir);
    expect(files).toHaveLength(2);
    for (const file of files) {
      const raw = await readFile(join(dir, file), "utf8");
      const doc = parseOkfDocument(raw);
      const links = doc.frontmatter.links as { relates_to?: string[] } | undefined;
      // Only one other artifact exists to link to.
      expect(links?.relates_to?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });
});
