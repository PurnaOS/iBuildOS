// Package scaffold implements `iBuild init`: it materializes a new OKF-SDLC
// bundle from embedded templates. The base type profile is copied verbatim as
// DATA — the taxonomy is never encoded in Go. Init never overwrites an existing
// file, so it is safe to re-run and safe in a partially set-up repo.
package scaffold

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Options tune a scaffold run.
type Options struct {
	// Example also writes a tiny, validate-clean example requirement.
	Example bool
}

// Result reports what a scaffold run did. Paths are bundle-relative, slash-separated.
type Result struct {
	Created     []string
	Skipped     []string
	AlreadyInit bool // .ibuildos.yaml already existed at the target
}

const embedRoot = "templates"

// exampleFR is a minimal, internally-consistent requirement: a `proposed` FR with
// only the inherited required fields. It yields zero errors (a proposed,
// unimplemented requirement is a warning, never an error), so the init→validate
// round trip stays green with or without --example.
const exampleFRPath = "docs/requirements/fr-0001.md"
const exampleFR = `---
type: FunctionalRequirement
id: FR-0001
title: Example requirement — replace or delete me
owner: you
status: proposed
---

Scaffolded by ` + "`iBuild init --example`" + `. Use /ibuild-discover and
/ibuild-plan to build out the real chain, then delete this file.
`

// Init scaffolds target into an iBuildOS bundle and returns what it created vs.
// skipped. It never overwrites existing files.
func Init(target string, opts Options) (Result, error) {
	var res Result
	if _, err := os.Stat(filepath.Join(target, ".ibuildos.yaml")); err == nil {
		res.AlreadyInit = true
	}

	err := fs.WalkDir(templatesFS, embedRoot, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		rel := strings.TrimPrefix(p, embedRoot+"/")
		if err := writeFile(target, destPath(rel), mustRead(p), &res); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return res, err
	}

	if opts.Example {
		if err := writeFile(target, exampleFRPath, []byte(exampleFR), &res); err != nil {
			return res, err
		}
	}

	sort.Strings(res.Created)
	sort.Strings(res.Skipped)
	return res, nil
}

// destPath maps an embedded template path to its on-disk destination. The only
// special case is the dot-stripped config name (go:embed can store but some
// tooling dislikes a dot-prefixed source file, so it is stored as ibuildos.yaml).
func destPath(rel string) string {
	if rel == "ibuildos.yaml" {
		return ".ibuildos.yaml"
	}
	return rel
}

// writeFile writes data to <target>/<dest>, creating parents, unless dest already
// exists (in which case it is recorded as skipped). dest is slash-separated.
func writeFile(target, dest string, data []byte, res *Result) error {
	full := filepath.Join(target, filepath.FromSlash(dest))
	if _, err := os.Stat(full); err == nil {
		res.Skipped = append(res.Skipped, dest)
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(full, data, 0o644); err != nil {
		return err
	}
	res.Created = append(res.Created, dest)
	return nil
}

func mustRead(p string) []byte {
	b, err := templatesFS.ReadFile(p)
	if err != nil {
		// Unreachable: p comes from WalkDir over the same FS.
		panic(err)
	}
	return b
}
