import { createHash } from "node:crypto";
import type { Finding } from "@ibuildos/schemas";

// FORMATS.md §8 (VG-008), exact: fp = hex(sha256(rule + "\0" + artifact + "\0" + subject))[:16].
// `subject` is the finding's stable subject (field key / link relationship / criterion id /
// glob string) — never line numbers, messages, or file paths — so the fingerprint survives
// unrelated edits to the same file.
export function fingerprint(finding: Pick<Finding, "rule" | "artifact" | "subject">): string {
  const { rule, artifact, subject } = finding;
  return createHash("sha256")
    .update(`${rule}\0${artifact}\0${subject}`)
    .digest("hex")
    .slice(0, 16);
}
