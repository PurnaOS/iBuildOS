---
name: ibuildos-default
version: 1.0.0
formats: 1
---
The shipped default type profile (SPEC.md §11) — a starting point every project may extend,
override, or replace (KB-003/KB-004). This manifest is what VG-012 pins: the app/CLI warn or
refuse when evaluating gates against a profile version other than the one recorded in a
project's `ibuildos.yaml` (`profile: { name, version, path }`, FORMATS §7).

Covers SPEC.md §11's full type taxonomy: `Knowledge` (ProductBrief, Requirement, Decision,
Persona, DesignDirection, Architecture, Runbook), `Work` (Epic, Story, Task, Bug, Spike, plus
the abstract `WorkItem` base), `Verification` (TestCase, TestSuite, TestResult), `Flow`
(Change, Run, Review, Comment, Deploy, Release, Milestone), the optional `Coordination` trio
(MeetingNote, StandupLog, RetroAction), and `Identity` (User, Team) — 27 concrete types plus
one abstract base. `Sprint` (SPEC §11 marks it `Sprint?`, PL-003 "optional") is out of scope
for this batch; a project profile may add it. Gate compositions live in `gates.yaml`
alongside this manifest (FORMATS §6).
