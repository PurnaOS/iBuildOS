---
type: TypeDefinition
defines: MeetingNote
abstract: false
prefix: NT       # shared with StandupLog/RetroAction (FORMATS §2) — the three Coordination
                  # types are siblings under one ID prefix, by spec, not a naming accident
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
MeetingNote: a Coordination-category artifact (SPEC §11) — **optional, profile-toggled**
(TM-009): "teams that don't use them see nothing about them." The engine does not yet
implement per-type toggling; this file documents the intended toggle, it doesn't enforce it.
