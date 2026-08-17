import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchBundle } from "./watcher.js";
import type { BundleWatch } from "./watcher.js";

const DEBOUNCE_MS = 60;
// Generous margin over the debounce window to absorb native FS-event
// latency (fsevents/inotify aren't instantaneous) without flaking.
const SETTLE_MS = DEBOUNCE_MS + 400;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("watchBundle", () => {
  let dir: string;
  let watch: BundleWatch | undefined;

  beforeEach(async () => {
    // Resolve through symlinks (macOS: /var -> /private/var) so paths the
    // test writes match the (realpath-resolved) paths the native watcher
    // reports.
    dir = await realpath(await mkdtemp(join(tmpdir(), "ibuildos-watch-")));
  });

  afterEach(async () => {
    await watch?.close();
    watch = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it(
    "reports a single file save as the raw path, with no resolver",
    async () => {
      const calls: string[][] = [];
      watch = await watchBundle(dir, (dirty) => calls.push(dirty), { debounceMs: DEBOUNCE_MS });

      const filePath = join(dir, "a.md");
      await writeFile(filePath, "---\ntype: X\nid: A\n---\nbody\n", "utf8");

      await wait(SETTLE_MS);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([filePath]);
    },
    10_000,
  );

  it(
    "augments the dirty set with resolver-supplied neighbor paths",
    async () => {
      const calls: string[][] = [];
      const neighborPath = join(dir, "neighbor.md");

      watch = await watchBundle(dir, (dirty) => calls.push(dirty), {
        debounceMs: DEBOUNCE_MS,
        resolveDirtyNeighbors: (changed) => {
          expect(changed).toEqual([join(dir, "b.md")]);
          return [neighborPath];
        },
      });

      await writeFile(join(dir, "b.md"), "---\ntype: X\nid: B\n---\nbody\n", "utf8");

      await wait(SETTLE_MS);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([join(dir, "b.md"), neighborPath].sort());
    },
    10_000,
  );

  it(
    "collapses rapid repeated saves within the debounce window into one callback",
    async () => {
      const calls: string[][] = [];
      watch = await watchBundle(dir, (dirty) => calls.push(dirty), { debounceMs: DEBOUNCE_MS });

      const filePath = join(dir, "c.md");
      // Fire several writes in quick succession, well inside the debounce
      // window, before ever waiting for a flush.
      for (let i = 0; i < 5; i++) {
        await writeFile(filePath, `---\ntype: X\nid: C\nrev: ${i}\n---\nbody\n`, "utf8");
        await wait(5);
      }

      await wait(SETTLE_MS);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([filePath]);
    },
    10_000,
  );

  it(
    "reports only the artifact file, not intermediate directories, for a nested save",
    async () => {
      const calls: string[][] = [];
      watch = await watchBundle(dir, (dirty) => calls.push(dirty), { debounceMs: DEBOUNCE_MS });

      const nestedDir = join(dir, "sub", "area");
      await mkdir(nestedDir, { recursive: true });
      const filePath = join(nestedDir, "e.md");
      await writeFile(filePath, "---\ntype: X\nid: E\n---\nbody\n", "utf8");

      await wait(SETTLE_MS);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([filePath]);
    },
    10_000,
  );

  it(
    "does not crash and still reports raw paths when the resolver throws",
    async () => {
      const calls: string[][] = [];
      const errors: unknown[][] = [];
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => errors.push(args);

      try {
        watch = await watchBundle(dir, (dirty) => calls.push(dirty), {
          debounceMs: DEBOUNCE_MS,
          resolveDirtyNeighbors: () => {
            throw new Error("boom");
          },
        });

        const filePath = join(dir, "f.md");
        await writeFile(filePath, "---\ntype: X\nid: F\n---\nbody\n", "utf8");

        await wait(SETTLE_MS);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([filePath]);
        expect(errors.length).toBeGreaterThan(0);
      } finally {
        console.error = originalConsoleError;
      }
    },
    10_000,
  );

  it(
    "stops producing callbacks once closed",
    async () => {
      const calls: string[][] = [];
      watch = await watchBundle(dir, (dirty) => calls.push(dirty), { debounceMs: DEBOUNCE_MS });

      await watch.close();

      await writeFile(join(dir, "d.md"), "---\ntype: X\nid: D\n---\nbody\n", "utf8");
      await wait(SETTLE_MS);

      expect(calls).toHaveLength(0);
    },
    10_000,
  );
});
