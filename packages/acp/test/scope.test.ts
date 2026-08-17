import { mkdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveScoped, ScopeError } from "../src/scope.js";
import { makeTempDir } from "./helpers.js";

// AC-007 — negative tests: path escape and symlink escape are refused.
//
// Expectations below compare against `realpathSync(root)`, not `root`
// itself: on macOS, `os.tmpdir()` returns a `/var/folders/...` path that is
// itself a symlink to `/private/var/folders/...` — `resolveScoped` correctly
// resolves through that (the same machinery that defeats a deliberate
// symlink escape also normalizes this incidental one), so asserting against
// the literal, non-canonicalized `root` would be asserting the wrong thing.

describe("resolveScoped", () => {
  it("resolves a path inside the root", () => {
    const root = makeTempDir("scope-in");
    writeFileSync(join(root, "a.txt"), "hi");
    expect(resolveScoped(root, join(root, "a.txt"))).toContain("a.txt");
  });

  it("resolves a not-yet-existing write target inside the root", () => {
    const root = makeTempDir("scope-write");
    const target = join(root, "sub", "new-file.txt");
    const resolved = resolveScoped(root, target);
    expect(resolved).toBe(join(realpathSync(root), "sub", "new-file.txt"));
  });

  it("refuses a relative path", () => {
    const root = makeTempDir("scope-rel");
    expect(() => resolveScoped(root, "relative/path.txt")).toThrow(ScopeError);
  });

  it("refuses a literal .. escape", () => {
    const root = makeTempDir("scope-dotdot");
    const outside = join(root, "..", "outside.txt");
    writeFileSync(outside, "nope");
    try {
      expect(() => resolveScoped(root, outside)).toThrow(ScopeError);
    } finally {
      // best-effort cleanup of the file created outside root
      try {
        unlinkSync(outside);
      } catch {
        /* ignore */
      }
    }
  });

  it("refuses a symlink that points outside the root", () => {
    const root = makeTempDir("scope-symlink-root");
    const outsideDir = makeTempDir("scope-symlink-outside");
    const secretFile = join(outsideDir, "secret.txt");
    writeFileSync(secretFile, "top secret");

    const linkPath = join(root, "escape-link");
    symlinkSync(outsideDir, linkPath, "dir");

    expect(() => resolveScoped(root, join(linkPath, "secret.txt"))).toThrow(ScopeError);
  });

  it("refuses a symlinked intermediate directory even for a not-yet-existing file", () => {
    const root = makeTempDir("scope-symlink-write-root");
    const outsideDir = makeTempDir("scope-symlink-write-outside");

    const linkPath = join(root, "escape-link");
    symlinkSync(outsideDir, linkPath, "dir");

    // The target file itself doesn't exist yet, but its parent (the
    // symlink) resolves outside root — must still be refused.
    expect(() => resolveScoped(root, join(linkPath, "not-yet-created.txt"))).toThrow(ScopeError);
  });

  it("allows a symlink that points inside the root", () => {
    const root = makeTempDir("scope-symlink-inside-root");
    const subDir = join(root, "real-sub");
    mkdirSync(subDir);
    writeFileSync(join(subDir, "f.txt"), "ok");
    const linkPath = join(root, "inside-link");
    symlinkSync(subDir, linkPath, "dir");

    expect(() => resolveScoped(root, join(linkPath, "f.txt"))).not.toThrow();
  });
});
