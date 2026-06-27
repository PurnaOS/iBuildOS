package contract

import (
	"strings"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
)

// TestAgentsMDReflectsChainConfig proves the document is data-driven: a CUSTOM
// ChainConfig (implements_rel renamed to "satisfies") must surface in the
// output, and the default name "implements" must NOT appear.
func TestAgentsMDReflectsChainConfig(t *testing.T) {
	cfg := config.Defaults()
	cfg.Chain.ImplementsRel = "satisfies"
	cfg.Chain.VerifiesRel = "checks"
	cfg.Chain.CodeField = "sources"

	md := AgentsMD(cfg, "v9.9.9")

	if !strings.Contains(md, "satisfies") {
		t.Errorf("AgentsMD missing custom implements rel %q", "satisfies")
	}
	if strings.Contains(md, "implements") {
		t.Errorf("AgentsMD leaked the default rel name %q despite a custom config", "implements")
	}
	if !strings.Contains(md, "checks") {
		t.Errorf("AgentsMD missing custom verifies rel %q", "checks")
	}
	if !strings.Contains(md, "sources") {
		t.Errorf("AgentsMD missing custom code field %q", "sources")
	}
	if strings.Contains(md, "`code`") {
		t.Errorf("AgentsMD leaked the default code field name despite a custom config")
	}
	if !strings.Contains(md, "v9.9.9") {
		t.Errorf("AgentsMD missing version string")
	}
}

// TestAgentsMDDefaultNames sanity-checks that the default profile documents the
// default vocabulary (so the common case is right).
func TestAgentsMDDefaultNames(t *testing.T) {
	md := AgentsMD(config.Defaults(), "dev")
	for _, want := range []string{"implements", "verifies", "verified_by", "parent", "`code`", "iBuild validate", "iBuild graph"} {
		if !strings.Contains(md, want) {
			t.Errorf("default AgentsMD missing %q", want)
		}
	}
}

// TestAgentsMDDeterministic: two calls with identical inputs are byte-identical.
func TestAgentsMDDeterministic(t *testing.T) {
	cfg := config.Defaults()
	if AgentsMD(cfg, "v1") != AgentsMD(cfg, "v1") {
		t.Error("AgentsMD is not deterministic across calls")
	}
}

// TestAgentsMDStatusVocab renders status vocabularies from the config.
func TestAgentsMDStatusVocab(t *testing.T) {
	cfg := config.Defaults()
	cfg.Chain.DoneStatuses = []string{"shipped"}
	cfg.Chain.PassingStatuses = []string{"green"}
	md := AgentsMD(cfg, "dev")
	if !strings.Contains(md, "shipped") || !strings.Contains(md, "green") {
		t.Errorf("AgentsMD missing custom status vocabularies")
	}
	// empty vocab renders as (none), never a code-span of empty string
	cfg.Chain.ProposedStatuses = nil
	md = AgentsMD(cfg, "dev")
	if !strings.Contains(md, "(none)") {
		t.Errorf("AgentsMD should render an empty vocabulary as (none)")
	}
}
