import { resolveSeverity, type Finding } from "@ibuildos/schemas";

// FORMATS.md §6 (EX-010) — `guidance/stale`: the exported AGENTS.md must not be
// older than the last profile/house-rules change. This module has no file-
// timestamp infra of its own; both markers are caller-supplied.

/**
 * `guidance/stale`: compare when AGENTS.md was last exported against when the
 * profile/house-rules it's derived from last changed. Fires when the export
 * is strictly older than the source change.
 */
export function checkGuidanceStale(
  artifactId: string,
  agentsMdExportedAt: string | Date,
  profileChangedAt: string | Date,
): Finding[] {
  const exportedAt = toEpochMs(agentsMdExportedAt);
  const changedAt = toEpochMs(profileChangedAt);

  if (exportedAt >= changedAt) return [];

  return [
    {
      rule: "guidance/stale",
      severity: resolveSeverity("guidance/stale"),
      artifact: artifactId,
      subject: "AGENTS.md",
      message: `exported AGENTS.md (${new Date(exportedAt).toISOString()}) is older than the profile/house-rules change (${new Date(changedAt).toISOString()}) — re-export needed (EX-010)`,
    },
  ];
}

function toEpochMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
