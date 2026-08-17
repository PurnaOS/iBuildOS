import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFsService } from "../src/fs-service.js";
import { ScopeError } from "../src/scope.js";
import { createTerminalService } from "../src/terminal-service.js";
import { makeTempDir } from "./helpers.js";

describe("FsService (AC-007)", () => {
  it("writes then reads a text file inside the worktree", () => {
    const root = makeTempDir("fs-rw");
    const fs = createFsService(() => root);
    const path = join(root, "notes.md");

    fs.writeTextFile({ sessionId: "s1", path, content: "hello worktree" });
    expect(readFileSync(path, "utf8")).toBe("hello worktree");

    const read = fs.readTextFile({ sessionId: "s1", path });
    expect(read.content).toBe("hello worktree");
  });

  it("supports line/limit slicing on read", () => {
    const root = makeTempDir("fs-slice");
    const fs = createFsService(() => root);
    const path = join(root, "lines.txt");
    fs.writeTextFile({ sessionId: "s1", path, content: "a\nb\nc\nd" });

    const read = fs.readTextFile({ sessionId: "s1", path, line: 2, limit: 2 });
    expect(read.content).toBe("b\nc");
  });

  it("refuses a write outside the worktree", () => {
    const root = makeTempDir("fs-scope-root");
    const outside = makeTempDir("fs-scope-outside");
    const fs = createFsService(() => root);

    expect(() =>
      fs.writeTextFile({ sessionId: "s1", path: join(outside, "x.txt"), content: "nope" }),
    ).toThrow(ScopeError);
  });

  it("refuses a read outside the worktree", () => {
    const root = makeTempDir("fs-scope-root2");
    const outside = makeTempDir("fs-scope-outside2");
    const outsideFile = join(outside, "secret.txt");
    createFsService(() => outside).writeTextFile({ sessionId: "s1", path: outsideFile, content: "top secret" });

    const fs = createFsService(() => root);
    expect(() => fs.readTextFile({ sessionId: "s1", path: outsideFile })).toThrow(ScopeError);
  });
});

describe("TerminalService (AC-007)", () => {
  it("runs a command scoped to the worktree and captures output", async () => {
    const root = makeTempDir("terminal-run");
    const terminal = createTerminalService(() => root);

    const { terminalId } = terminal.create({
      sessionId: "s1",
      command: process.execPath,
      args: ["-e", "console.log('from terminal')"],
    });

    const exit = await terminal.waitForExit({ sessionId: "s1", terminalId });
    expect(exit.exitCode).toBe(0);

    const output = terminal.output({ sessionId: "s1", terminalId });
    expect(output.output).toContain("from terminal");

    terminal.release({ sessionId: "s1", terminalId });
  });

  it("refuses a cwd outside the worktree", () => {
    const root = makeTempDir("terminal-scope-root");
    const outside = makeTempDir("terminal-scope-outside");
    const terminal = createTerminalService(() => root);

    expect(() =>
      terminal.create({ sessionId: "s1", command: process.execPath, args: ["-v"], cwd: outside }),
    ).toThrow(ScopeError);
  });

  it("truncates output at the requested byte limit", async () => {
    const root = makeTempDir("terminal-truncate");
    const terminal = createTerminalService(() => root);
    const bigText = "x".repeat(200);

    const { terminalId } = terminal.create({
      sessionId: "s1",
      command: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(bigText)})`],
      outputByteLimit: 50,
    });
    await terminal.waitForExit({ sessionId: "s1", terminalId });

    const output = terminal.output({ sessionId: "s1", terminalId });
    expect(output.truncated).toBe(true);
    expect(Buffer.byteLength(output.output, "utf8")).toBeLessThanOrEqual(50);
  });
});
