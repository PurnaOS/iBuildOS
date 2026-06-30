// Package config loads .ibuildos.yaml (with defaults) and resolves the bundle
// layout: where the type definitions live, which files are artifacts, and how
// root-relative link paths map onto disk.
package config

import (
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ChainConfig is the SINGLE locus of coupling to the Requirement -> Task ->
// Code -> Test chain. It names the relationships/field the completeness rules
// key off, plus the one unavoidable value coupling: the status vocabularies.
// Everything else in the validator is fully data-driven from docs/types/.
type ChainConfig struct {
	ImplementsRel string `yaml:"implements_rel"`
	VerifiesRel   string `yaml:"verifies_rel"`
	VerifiedByRel string `yaml:"verified_by_rel"`
	ParentRel     string `yaml:"parent_rel"`
	CodeField     string `yaml:"code_field"`

	ActiveReqStatuses []string `yaml:"active_req_statuses"`
	ProposedStatuses  []string `yaml:"proposed_statuses"`
	DoneStatuses      []string `yaml:"done_statuses"`
	PassingStatuses   []string `yaml:"passing_statuses"`
}

// DefaultChain returns the built-in chain configuration matching docs/types/.
func DefaultChain() ChainConfig {
	return ChainConfig{
		ImplementsRel:     "implements",
		VerifiesRel:       "verifies",
		VerifiedByRel:     "verified_by",
		ParentRel:         "parent",
		CodeField:         "code",
		ActiveReqStatuses: []string{"accepted", "implemented"},
		ProposedStatuses:  []string{"proposed"},
		DoneStatuses:      []string{"done"},
		PassingStatuses:   []string{"passing"},
	}
}

// Config is the resolved bundle configuration for one run.
type Config struct {
	Root             string
	Types            string
	Artifacts        []string
	Chain            ChainConfig
	BundleDir        string // the [path] argument
	TypesDirOverride string // from --types
}

// Defaults returns the built-in configuration used when .ibuildos.yaml is absent.
func Defaults() Config {
	return Config{
		Root:      "docs",
		Types:     "types",
		Artifacts: []string{"requirements/**", "work/**", "tests/**"},
		Chain:     DefaultChain(),
	}
}

// fileConfig is a pointer-shadow of the on-disk config so that an omitted field
// keeps its default while a present field (even an empty list) overrides it.
type fileConfig struct {
	Root      *string    `yaml:"root"`
	Types     *string    `yaml:"types"`
	Artifacts *[]string  `yaml:"artifacts"`
	CodeField *string    `yaml:"code_field"`
	Chain     *fileChain `yaml:"chain"`
}

// fileChain is the pointer-shadow of ChainConfig: a present `chain:` block
// overrides ONLY the sub-fields it names, leaving every omitted sub-field at its
// default. (A plain *ChainConfig would zero out every unspecified field, silently
// disabling chain enforcement — see review finding #3/#4.)
type fileChain struct {
	ImplementsRel     *string   `yaml:"implements_rel"`
	VerifiesRel       *string   `yaml:"verifies_rel"`
	VerifiedByRel     *string   `yaml:"verified_by_rel"`
	ParentRel         *string   `yaml:"parent_rel"`
	CodeField         *string   `yaml:"code_field"`
	ActiveReqStatuses *[]string `yaml:"active_req_statuses"`
	ProposedStatuses  *[]string `yaml:"proposed_statuses"`
	DoneStatuses      *[]string `yaml:"done_statuses"`
	PassingStatuses   *[]string `yaml:"passing_statuses"`
}

// Load reads <bundleDir>/.ibuildos.yaml over the defaults. A missing file is not
// an error (defaults are returned).
func Load(bundleDir string) (Config, error) {
	cfg := Defaults()
	cfg.BundleDir = bundleDir
	raw, err := os.ReadFile(filepath.Join(bundleDir, ".ibuildos.yaml"))
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	var fc fileConfig
	if err := yaml.Unmarshal(raw, &fc); err != nil {
		return cfg, err
	}
	if fc.Root != nil {
		cfg.Root = *fc.Root
	}
	if fc.Types != nil {
		cfg.Types = *fc.Types
	}
	if fc.Artifacts != nil {
		cfg.Artifacts = *fc.Artifacts
	}
	if fc.CodeField != nil {
		cfg.Chain.CodeField = *fc.CodeField
	}
	if ch := fc.Chain; ch != nil {
		setStr(&cfg.Chain.ImplementsRel, ch.ImplementsRel)
		setStr(&cfg.Chain.VerifiesRel, ch.VerifiesRel)
		setStr(&cfg.Chain.VerifiedByRel, ch.VerifiedByRel)
		setStr(&cfg.Chain.ParentRel, ch.ParentRel)
		setStr(&cfg.Chain.CodeField, ch.CodeField)
		setList(&cfg.Chain.ActiveReqStatuses, ch.ActiveReqStatuses)
		setList(&cfg.Chain.ProposedStatuses, ch.ProposedStatuses)
		setList(&cfg.Chain.DoneStatuses, ch.DoneStatuses)
		setList(&cfg.Chain.PassingStatuses, ch.PassingStatuses)
	}
	return cfg, nil
}

func setStr(dst *string, src *string) {
	if src != nil {
		*dst = *src
	}
}

func setList(dst *[]string, src *[]string) {
	if src != nil {
		*dst = *src
	}
}

// RootDir is the absolute knowledge-bundle root (bundleDir/Root).
func (c Config) RootDir() string { return filepath.Join(c.BundleDir, c.Root) }

// TypesDir is where ArtifactType definitions live; --types overrides it.
func (c Config) TypesDir() string {
	if c.TypesDirOverride != "" {
		return c.TypesDirOverride
	}
	return filepath.Join(c.RootDir(), c.Types)
}

// ResolveLink maps a root-relative link path (e.g. /work/task-014.md) to disk.
func (c Config) ResolveLink(p string) string {
	return filepath.Join(c.RootDir(), strings.TrimPrefix(p, "/"))
}

// LinkEscapesRoot reports whether a resolved link path has climbed out of the
// knowledge-bundle root via ../ segments. A link may not reach outside the
// bundle; an out-of-root target must be treated as unresolved (review #5),
// otherwise an arbitrary on-disk file could satisfy traceability/cardinality.
func (c Config) LinkEscapesRoot(resolved string) bool {
	rel, err := filepath.Rel(c.RootDir(), resolved)
	if err != nil {
		return true
	}
	return rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// LinkKey canonicalizes a link target (as written) to the /root-relative key
// used to index documents.
func (c Config) LinkKey(p string) string {
	return "/" + filepath.ToSlash(strings.TrimPrefix(p, "/"))
}

// RootRel computes the /root-relative key for an absolute artifact path.
func (c Config) RootRel(abs string) string {
	rel, err := filepath.Rel(c.RootDir(), abs)
	if err != nil {
		return ""
	}
	return "/" + filepath.ToSlash(rel)
}

// BundleRel computes the bundle-relative, slash-separated path for findings.
func (c Config) BundleRel(abs string) string {
	rel, err := filepath.Rel(c.BundleDir, abs)
	if err != nil {
		return filepath.ToSlash(abs)
	}
	return filepath.ToSlash(rel)
}
