import type { ResolvedType } from "@ibuildos/engine";

/** Build the authoring template `instructions <Type>` prints: the common
 * FORMATS §4 frontmatter keys, the type's own declared fields/links (with
 * their kind/cardinality as inline hints), and its required body sections
 * (FORMATS §5's `body.sections`) — enough for a human or an agent to draft a
 * conformant artifact of this type without re-reading the TypeDefinition. */
export function buildInstructionsTemplate(type: ResolvedType): string {
  const lines: string[] = ["---", `type: ${type.name}`, `id: ${type.prefix ?? "??"}-NNNN`, "title:"];

  if (type.states) {
    lines.push(`state: <${type.states.vocabulary.join(" | ")}>  # initial: ${type.states.initial}`);
  }
  lines.push("owner: <US-.... | TM-....>");
  lines.push("provenance: <human | agent | imported | backfilled>");
  lines.push("created: <YYYY-MM-DD>");

  for (const [key, def] of Object.entries(type.fields)) {
    const hint = def.kind === "enum" ? `<${(def.values ?? []).join(" | ")}>` : `<${def.kind}>`;
    lines.push(`${key}: ${hint}${def.required ? "" : "  # optional"}`);
  }

  const linkEntries = Object.entries(type.links);
  if (linkEntries.length > 0) {
    lines.push("links:");
    for (const [relationship, def] of linkEntries) {
      const cardinality = [
        def.min !== undefined ? `min ${def.min}` : undefined,
        def.max !== undefined ? `max ${def.max}` : undefined,
        def.cycles ? `cycles: ${def.cycles}` : undefined,
      ]
        .filter((s): s is string => s !== undefined)
        .join(", ");
      lines.push(`  ${relationship}: [<${def.target.join(" | ")}>]${cardinality ? `  # ${cardinality}` : ""}`);
    }
  }

  lines.push("---", "");

  for (const section of type.body.sections) {
    lines.push(`## ${section.name}${section.required ? "" : " (optional)"}`);
    if (section.items) lines.push(`- [${section.items}-1] ...`);
    lines.push("");
  }

  return lines.join("\n");
}
