---
type: TypeDefinition
defines: StandupLog
abstract: false
prefix: NT       # shared with MeetingNote/RetroAction (FORMATS §2)
dir: coordination
fields: {}
states:
  vocabulary: [recorded, retired]
  initial: recorded
  transitions:
    - { from: "*", to: retired }
  derived: false
links: {}
body:
  sections: []
json_schema: null
---
StandupLog: a Coordination-category artifact (SPEC §11) — **optional, profile-toggled**
(TM-009), same as `meeting-note.md`. The engine does not yet implement per-type toggling;
this file documents the intended toggle, it doesn't enforce it.
