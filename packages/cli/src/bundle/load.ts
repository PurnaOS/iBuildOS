import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  GatesFileSchema,
  ProfileManifestSchema,
  type Finding,
  type GatesFile,
  type ProfileManifest,
} from "@ibuildos/schemas";
import {
  ArtifactGraph,
  ProfileRegistry,
  parseOkfDocument,
  resolveProfileSafely,
  type GraphArtifact,
} from "@ibuildos/engine";
import { walkMarkdownFiles } from "./walk.js";

/** One parsed artifact file — a superset of `GraphArtifact` carrying the body
 * and source path too, since several rules (doc/section-required, sec/*,
 * docs/todo-marker, chain/task-no-code) need those. */
export interface ParsedArtifact extends GraphArtifact {
  body: string;
  filePath: string;
}

/** Load every `*.md` artifact under `bundleRoot`, excluding the `profile`
 * directory (FORMATS §3 reserves it for the type-profile dialect, not
 * artifacts). An artifact missing `id`/`type` gets a synthetic, non-colliding
 * placeholder rather than being dropped — `doc/field-required` is what
 * actually flags the missing key; the loader's job is just to not crash or
 * silently lose the file. */
export function loadArtifacts(bundleRoot: string): ParsedArtifact[] {
  const files = walkMarkdownFiles(bundleRoot, { excludeDirName: "profile" });
  return files.map((filePath) => {
    const raw = readFileSync(filePath, "utf8");
    const doc = parseOkfDocument(raw);
    const { frontmatter } = doc;
    const id = typeof frontmatter.id === "string" ? frontmatter.id : `<no-id>:${filePath}`;
    const type = typeof frontmatter.type === "string" ? frontmatter.type : "<unknown-type>";
    return { id, type, frontmatter, body: doc.body, filePath };
  });
}

export interface LoadedProfile {
  registry: ProfileRegistry;
  /** `profile/meta-valid` findings (unknown extends, unknown link target, …)
   * — non-throwing per `resolveProfileSafely`'s contract. */
  metaFindings: Finding[];
  manifest: ProfileManifest | undefined;
  gatesFile: GatesFile | undefined;
  typeDefinitionCount: number;
}

/** Load `docs/profile/*.md` (the type-profile dialect, FORMATS §5) plus
 * `profile.md` (the manifest, excluded from the TypeDefinition set — it has
 * no `type: TypeDefinition` literal) and `gates.yaml` (FORMATS §6), if
 * present. Mirrors `packages/engine/src/profile/default-profile.test.ts`'s
 * loading convention exactly. */
export function loadProfile(profileDir: string): LoadedProfile {
  const files = walkMarkdownFiles(profileDir);
  const typeDefinitionRaws: string[] = [];
  let manifest: ProfileManifest | undefined;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    if (basename(file).toLowerCase() === "profile.md") {
      manifest = ProfileManifestSchema.parse(parseOkfDocument(raw).frontmatter);
      continue;
    }
    typeDefinitionRaws.push(raw);
  }

  const { registry, findings } = resolveProfileSafely(typeDefinitionRaws);

  let gatesFile: GatesFile | undefined;
  const gatesPath = join(profileDir, "gates.yaml");
  if (existsSync(gatesPath)) {
    gatesFile = GatesFileSchema.parse(parseYaml(readFileSync(gatesPath, "utf8")));
  }

  return { registry, metaFindings: findings, manifest, gatesFile, typeDefinitionCount: typeDefinitionRaws.length };
}

export interface LoadedBundle {
  bundleRoot: string;
  profileDir: string;
  artifacts: ParsedArtifact[];
  graph: ArtifactGraph;
  profile: LoadedProfile;
}

/** The full pipeline: walk the artifact bundle, load the type profile
 * (default `<bundleRoot>/profile`, FORMATS §3's layout), and build the graph
 * every cross-artifact rule (link/*, chain/*, state/approved, …) needs. */
export function loadBundle(bundleRoot: string, profileDir?: string): LoadedBundle {
  const resolvedProfileDir = profileDir ?? join(bundleRoot, "profile");
  const artifacts = loadArtifacts(bundleRoot);
  const profile = loadProfile(resolvedProfileDir);
  const graph = new ArtifactGraph(
    artifacts.map(({ id, type, frontmatter }) => ({ id, type, frontmatter })),
  );
  return { bundleRoot, profileDir: resolvedProfileDir, artifacts, graph, profile };
}
