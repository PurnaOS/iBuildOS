import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { resolveScoped } from "./scope.js";
import type { WorktreePathResolver } from "./types.js";

// AC-007 — `fs/read_text_file` / `fs/write_text_file`, scoped to the
// session's worktree (BD-003: the trunk checkout is never an agent
// workspace). The worktree path itself is resolved lazily via the injected
// `WorktreePathResolver` on every call, not cached at construction — a
// long-lived session must not keep serving a stale root if the resolver's
// answer legitimately changes between calls in a caller's test.

export interface FsService {
  readTextFile(params: ReadTextFileRequest): ReadTextFileResponse;
  writeTextFile(params: WriteTextFileRequest): WriteTextFileResponse;
}

export function createFsService(resolveWorktree: WorktreePathResolver): FsService {
  return {
    readTextFile(params: ReadTextFileRequest): ReadTextFileResponse {
      const target = resolveScoped(resolveWorktree(), params.path);
      let content = readFileSync(target, "utf8");
      if (params.line != null || params.limit != null) {
        const lines = content.split("\n");
        const start = Math.max((params.line ?? 1) - 1, 0);
        const end = params.limit != null ? start + params.limit : lines.length;
        content = lines.slice(start, end).join("\n");
      }
      return { content };
    },

    writeTextFile(params: WriteTextFileRequest): WriteTextFileResponse {
      const target = resolveScoped(resolveWorktree(), params.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, params.content, "utf8");
      return {};
    },
  };
}
