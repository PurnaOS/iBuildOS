package config

import (
	"os"
	"path/filepath"
	"testing"
)

func loadYAML(t *testing.T, yaml string) Config {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".ibuildos.yaml"), []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

// Guards review #3: a partial `chain:` block must override only the sub-field it
// names and keep every other chain default — NOT zero them, which would silently
// disable all chain enforcement while validate still reports OK.
func TestPartialChainBlockKeepsDefaults(t *testing.T) {
	cfg := loadYAML(t, "chain:\n  implements_rel: satisfies\n")
	def := DefaultChain()
	if cfg.Chain.ImplementsRel != "satisfies" {
		t.Errorf("implements_rel override lost: %q", cfg.Chain.ImplementsRel)
	}
	if cfg.Chain.VerifiedByRel != def.VerifiedByRel || cfg.Chain.ParentRel != def.ParentRel {
		t.Errorf("rel names zeroed by partial chain block: %+v", cfg.Chain)
	}
	if len(cfg.Chain.DoneStatuses) == 0 || len(cfg.Chain.PassingStatuses) == 0 ||
		len(cfg.Chain.ActiveReqStatuses) == 0 {
		t.Errorf("status vocabularies zeroed by partial chain block: %+v", cfg.Chain)
	}
}

// Guards review #4: a top-level code_field must survive the presence of a `chain:`
// block that does not itself set code_field.
func TestTopLevelCodeFieldSurvivesChainBlock(t *testing.T) {
	cfg := loadYAML(t, "code_field: sources\nchain:\n  parent_rel: child_of\n")
	if cfg.Chain.CodeField != "sources" {
		t.Errorf("top-level code_field lost when a chain block is present: %q", cfg.Chain.CodeField)
	}
	if cfg.Chain.ParentRel != "child_of" {
		t.Errorf("chain parent_rel override lost: %q", cfg.Chain.ParentRel)
	}
}

// An explicit chain.code_field still wins over a top-level code_field.
func TestChainCodeFieldOverridesTopLevel(t *testing.T) {
	cfg := loadYAML(t, "code_field: top\nchain:\n  code_field: nested\n")
	if cfg.Chain.CodeField != "nested" {
		t.Errorf("explicit chain.code_field should win: %q", cfg.Chain.CodeField)
	}
}
