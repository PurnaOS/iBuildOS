package scaffold

import "embed"

// templatesFS holds the files `iBuild init` writes into a new project: the
// .ibuildos.yaml config, the base OKF-SDLC type profile (docs/types/*.md), the
// bundle directory skeleton, a starter CLAUDE.md, and the lifecycle guide. The
// `all:` prefix is REQUIRED — without it go:embed silently drops dotfiles
// (.gitkeep, and any dot-named entry), which would leave the empty artifact
// directories un-scaffolded.
//
//go:embed all:templates
var templatesFS embed.FS

// The .claude/ tree under templates/ is a generated MIRROR of plugin/ — the
// single source of truth for the AI layer. init vendors it into every new
// project so a clone is self-contained (no marketplace install). Edit plugin/,
// then `go generate ./internal/scaffold` to resync; TestClaudeMirror is the
// drift gate. ponytail: needs `sh`+`cp` (dev-machine sync), not the build.
//
//go:generate sh -c "rm -rf templates/.claude && mkdir -p templates/.claude && cp -R ../../plugin/skills templates/.claude/skills && cp -R ../../plugin/agents templates/.claude/agents && cp ../../plugin/hooks/hooks.json templates/.claude/settings.json"
