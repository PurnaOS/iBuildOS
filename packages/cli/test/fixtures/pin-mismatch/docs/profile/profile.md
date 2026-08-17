---
name: cli-fixture-profile
version: 1.0.0
formats: 1
---
Minimal profile manifest used only to exercise the `pin/profile` refusal
path (FORMATS §12 exit code 3) — `ibuildos.yaml` in this fixture declares a
different `profile.version`, and the pin pre-flight check must refuse before
walking/validating anything else in the bundle.
