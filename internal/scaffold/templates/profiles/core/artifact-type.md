---
type: ArtifactType
defines: ArtifactType
description: The meta-type. Defines the structure every type definition follows.
fields:
  defines:
    required: true
    doc: The name of the type this document defines.
  extends:
    doc: Optional parent type whose fields and relationships are inherited.
  abstract:
    type: bool
    doc: If true, no document may use this type directly; it exists only to be extended.
  description:
    doc: One-line summary of the artifact type.
  fields:
    doc: Map of field name to field spec (see body).
  relationships:
    doc: Map of relationship name to relationship spec (see body).
---

# ArtifactType

An **ArtifactType** defines one kind of artifact in the project — a Task, a
Requirement, an ADR, and so on. It is the *only* type the validator understands
natively. Every other type is just data written in this format, which is why a
project can define its own lifecycle without changing a line of the tool's code.

`ArtifactType` is itself an `ArtifactType` (this document), so the engine
validates type definitions with the same machinery it uses on everything else.

## Field spec

Each entry under `fields:` describes one frontmatter key that documents of this
type may carry.

| Key        | Meaning                                                                                   |
|------------|-------------------------------------------------------------------------------------------|
| `required` | `true` if the field must be present. Default `false`.                                     |
| `one_of`   | List of allowed values (an enum).                                                         |
| `pattern`  | A string pattern. Friendly tokens: `<number>`, `<slug>`, `<date>`. Use `regex:...` raw.   |
| `type`     | `string` (default), `number`, `date`, or `bool`.                                          |
| `doc`      | Human description of the field.                                                           |

## Relationship spec

Each entry under `relationships:` declares a typed link. In an actual document
these appear under a `links:` block, keyed by the relationship name.

| Key      | Meaning                                                          |
|----------|------------------------------------------------------------------|
| `target` | The artifact type every link under this name must point to.      |
| `min`    | Minimum number of links required. Default `0`.                   |
| `max`    | Maximum number of links allowed. Optional (unbounded if absent). |
| `doc`    | Human description of the relationship.                           |

A link satisfies `target: X` if the document it points to has type `X` **or any
type that extends `X`**. So a relationship whose `target` is an abstract base —
e.g. `Requirement` or `BacklogItem` — is satisfied by any of its concrete
subtypes.

## Escape hatch

For validation the tiny dialect can't express, a definition may include a
`json_schema:` block. It is applied to a document's frontmatter *in addition to*
the rules above, so power users get full JSON Schema without forcing everyone
else to read it.

## Example

See [Task](task.md) for a complete definition and the document it validates.
