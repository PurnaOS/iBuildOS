---
type: TypeDefinition
defines: Task
extends: WorkItem
abstract: false
prefix: TA
dir: tasks
fields:
  code: { kind: "list<string>", required: false }
links: {}
body:
  sections: []
json_schema: null
---
Task: adds the `code` field fixtures/profile/task.md's stub lacks — needed by
chain/task-no-code.
