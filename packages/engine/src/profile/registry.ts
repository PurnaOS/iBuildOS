import {
  TypeDefinitionSchema,
  type TypeDefinition,
  type FieldDef,
  type LinkDef,
} from "@ibuildos/schemas";
import { parseOkfDocument } from "../store/okf-document.js";

// The type-profile registry (T-007, FORMATS.md §5): loads docs/profile/*.md
// TypeDefinitions, resolves `extends` chains, and answers polymorphic
// is-or-extends questions for link-target checks. The engine knows only the
// TypeDefinition meta-format natively — every concrete type is data (KB-002).

export class ProfileMetaValidationError extends Error {}

export interface ResolvedType {
  name: string;
  abstract: boolean;
  prefix?: string | undefined;
  dir?: string | undefined;
  /** The full `extends` chain, root-first, ending in `name` itself. */
  chain: string[];
  /** Fields merged across the chain — a subtype's field overrides a key its
   * ancestor also declares; new keys are additive. */
  fields: Record<string, FieldDef>;
  /** Links merged the same way as fields. */
  links: Record<string, LinkDef>;
  /** States/body are whole-key overrides, not deep-merged: FORMATS §5 says
   * "extends merges by key (child wins)" at the TypeDefinition's top level,
   * and the worked Story example defines its full state vocabulary itself
   * rather than inheriting WorkItem's — so the nearest definer in the chain
   * wins outright. */
  states?: TypeDefinition["states"] | undefined;
  body: TypeDefinition["body"];
}

function parseTypeDefinition(raw: string): TypeDefinition {
  const doc = parseOkfDocument(raw);
  return TypeDefinitionSchema.parse(doc.frontmatter);
}

export class ProfileRegistry {
  private readonly defs = new Map<string, TypeDefinition>();
  private readonly resolved = new Map<string, ResolvedType>();

  /** Load TypeDefinitions from raw OKF file contents (docs/profile/*.md). */
  static fromRawDocuments(rawDocs: string[]): ProfileRegistry {
    const registry = new ProfileRegistry();
    for (const raw of rawDocs) {
      registry.addDefinition(parseTypeDefinition(raw));
    }
    registry.resolveAll();
    return registry;
  }

  addDefinition(def: TypeDefinition): void {
    if (this.defs.has(def.defines)) {
      throw new ProfileMetaValidationError(
        `duplicate TypeDefinition: "${def.defines}" is defined more than once`,
      );
    }
    this.defs.set(def.defines, def);
  }

  /** Resolve every loaded definition's `extends` chain. Call once after all
   * definitions are added (extends may reference a type added later). */
  resolveAll(): void {
    for (const name of this.defs.keys()) {
      this.resolve(name);
    }
  }

  resolve(name: string): ResolvedType {
    const cached = this.resolved.get(name);
    if (cached) return cached;

    const def = this.defs.get(name);
    if (!def) {
      throw new ProfileMetaValidationError(
        `unknown type "${name}" — not defined by any TypeDefinition (rule profile/meta-valid)`,
      );
    }

    let chain: string[] = [name];
    let fields: Record<string, FieldDef> = { ...def.fields };
    let links: Record<string, LinkDef> = { ...def.links };
    let states = def.states;
    let body = def.body;

    if (def.extends) {
      if (!this.defs.has(def.extends)) {
        throw new ProfileMetaValidationError(
          `type "${name}" extends unknown type "${def.extends}" (rule profile/meta-valid)`,
        );
      }
      const parent = this.resolve(def.extends);
      chain = [...parent.chain, name];
      fields = { ...parent.fields, ...fields };
      links = { ...parent.links, ...links };
      states = states ?? parent.states;
      body = def.body.sections.length > 0 ? def.body : parent.body;
    }

    // profile/meta-valid: every link's target types must themselves be known.
    for (const [linkName, linkDef] of Object.entries(links)) {
      for (const target of linkDef.target) {
        if (!this.defs.has(target)) {
          throw new ProfileMetaValidationError(
            `type "${name}" link "${linkName}" targets unknown type "${target}" (rule profile/meta-valid)`,
          );
        }
      }
    }

    const result: ResolvedType = {
      name,
      abstract: def.abstract,
      prefix: def.prefix,
      dir: def.dir,
      chain,
      fields,
      links,
      states,
      body,
    };
    this.resolved.set(name, result);
    return result;
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  /** Polymorphic is-or-extends check: does an artifact typed `typeName`
   * satisfy a relationship's declared `target` of `targetName` (which may be
   * abstract)? True if `targetName` appears anywhere in `typeName`'s resolved
   * extends chain, including itself. */
  satisfies(typeName: string, targetName: string): boolean {
    if (typeName === targetName) return true;
    const resolved = this.resolve(typeName);
    return resolved.chain.includes(targetName);
  }
}
