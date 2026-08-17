import { createHash } from "node:crypto";
import {
  IBuildOSConfigSchema,
  resolveSeverity,
  type Finding,
  type IBuildOSConfig,
} from "@ibuildos/schemas";

// FORMATS.md §6/§7 — `contract/valid` (ibuildos.yaml parses, referenced commands
// exist) and `contract/trusted` (TP-008 contract-hash trust). Pure: the caller
// supplies the parsed-or-raw config and the trusted hash; no filesystem I/O here.

/**
 * `contract/valid`: `rawConfig` must parse against `IBuildOSConfigSchema`, and
 * every command name referenced elsewhere in the contract (an `ordered`
 * resource's `command`, a `safe` entry, a `deploy` target's `component`) must
 * resolve to something actually declared.
 */
export function checkContractValid(artifactId: string, rawConfig: unknown): Finding[] {
  const parsed = IBuildOSConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return [
      {
        rule: "contract/valid",
        severity: resolveSeverity("contract/valid"),
        artifact: artifactId,
        subject: "ibuildos.yaml",
        message: `ibuildos.yaml does not conform to schema: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; ")}`,
      },
    ];
  }

  return checkContractReferences(artifactId, parsed.data);
}

function checkContractReferences(artifactId: string, config: IBuildOSConfig): Finding[] {
  const findings: Finding[] = [];
  const components = config.contract?.components ?? {};

  for (const [componentName, component] of Object.entries(components)) {
    const declaredCommands = new Set(Object.keys(component.commands));

    for (const orderedResource of component.ordered ?? []) {
      if (!declaredCommands.has(orderedResource.command)) {
        findings.push({
          rule: "contract/valid",
          severity: resolveSeverity("contract/valid"),
          artifact: artifactId,
          subject: `contract.components.${componentName}.ordered.${orderedResource.name}.command`,
          message: `ordered resource "${orderedResource.name}" references command "${orderedResource.command}" which component "${componentName}" does not declare`,
        });
      }
    }

    for (const safeName of component.safe ?? []) {
      if (!declaredCommands.has(safeName)) {
        findings.push({
          rule: "contract/valid",
          severity: resolveSeverity("contract/valid"),
          artifact: artifactId,
          subject: `contract.components.${componentName}.safe`,
          message: `"safe" lists command "${safeName}" which component "${componentName}" does not declare`,
        });
      }
    }
  }

  for (const [deployName, target] of Object.entries(config.contract?.deploy ?? {})) {
    if (target.component !== undefined && components[target.component] === undefined) {
      findings.push({
        rule: "contract/valid",
        severity: resolveSeverity("contract/valid"),
        artifact: artifactId,
        subject: `contract.deploy.${deployName}.component`,
        message: `deploy target "${deployName}" references unknown component "${target.component}"`,
      });
    }
  }

  return findings;
}

/**
 * Canonical JSON per TP-008: sorted object keys, no insignificant whitespace.
 * Arrays keep their original order (order is significant data, not a key set).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of the canonical JSON of a `contract` section (TP-008). */
export function computeContractHash(contract: unknown): string {
  return createHash("sha256").update(canonicalJson(contract ?? {})).digest("hex");
}

/**
 * `contract/trusted`: the freshly-computed hash of `contract` must match the
 * caller-supplied `trustedHash` (the machine-local, per-project stored value —
 * TP-008). Any drift means the contract changed since it was last confirmed.
 */
export function checkContractTrusted(
  artifactId: string,
  contract: unknown,
  trustedHash: string,
): Finding[] {
  const actualHash = computeContractHash(contract);
  if (actualHash === trustedHash) return [];

  return [
    {
      rule: "contract/trusted",
      severity: resolveSeverity("contract/trusted"),
      artifact: artifactId,
      subject: "contract",
      message: `contract hash "${actualHash}" does not match trusted hash "${trustedHash}" (TP-008) — re-confirmation required before any command runs`,
    },
  ];
}
