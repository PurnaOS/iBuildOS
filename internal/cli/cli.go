// Package cli is the command-line surface: argument parsing, orchestration, and
// the exit-code contract. main() is a thin wrapper over Run.
package cli

import (
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/report"
	"github.com/PurnaOS/iBuildOS/internal/scaffold"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// Version is overridable via -ldflags "-X .../cli.Version=...".
var Version = "dev"

const usage = `iBuild — OKF-SDLC traceability linter

Usage:
  iBuild init [path] [--example]
  iBuild validate [path] [--format text|json] [--types <dir>]
  iBuild graph [path] [--format json] [--body excerpt|full|none]
               [--node <ref> [--depth N] [--rel a,b]] [--types <dir>]
  iBuild version

  init      scaffold a new project into an OKF-SDLC bundle (never overwrites)
  validate  check the bundle; deterministic gate (the AI layer never runs here)
  graph     export the knowledge graph as JSON; --node focuses on a neighborhood

Exit codes: 0 = no errors, 1 = validation errors, 2 = usage error.`

// Run executes a command and returns the process exit code.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" || args[0] == "help" {
		fmt.Fprintln(stdout, usage)
		return 0
	}
	switch args[0] {
	case "init":
		return runInit(args[1:], stdout, stderr)
	case "validate":
		return runValidate(args[1:], stdout, stderr)
	case "graph":
		return runGraph(args[1:], stdout, stderr)
	case "version":
		fmt.Fprintln(stdout, Version)
		return 0
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s\n", args[0], usage)
		return 2
	}
}

func runValidate(args []string, stdout, stderr io.Writer) int {
	path, flags := splitArgs(args)
	fs := flag.NewFlagSet("validate", flag.ContinueOnError)
	fs.SetOutput(stderr)
	format := fs.String("format", "text", "output format: text or json")
	typesDir := fs.String("types", "", "type-definitions directory (overrides .ibuildos.yaml)")
	if err := fs.Parse(flags); err != nil {
		return 2
	}
	if path == "" {
		path = "."
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(stderr, "invalid --format %q (want text or json)\n", *format)
		return 2
	}

	cfg, err := config.Load(path)
	if err != nil {
		fmt.Fprintf(stderr, "cannot load .ibuildos.yaml: %v\n", err)
		return 1
	}
	if *typesDir != "" {
		cfg.TypesDirOverride = *typesDir
	}

	findings := validate.Validate(path, cfg)
	if *format == "json" {
		if err := report.JSON(stdout, findings); err != nil {
			fmt.Fprintf(stderr, "cannot write report: %v\n", err)
			return 2
		}
	} else {
		report.Text(stdout, findings)
	}
	for _, f := range findings {
		if f.Severity == model.Error {
			return 1
		}
	}
	return 0
}

func runGraph(args []string, stdout, stderr io.Writer) int {
	path, flags := splitArgs(args)
	fs := flag.NewFlagSet("graph", flag.ContinueOnError)
	fs.SetOutput(stderr)
	format := fs.String("format", "json", "output format: json")
	typesDir := fs.String("types", "", "type-definitions directory (overrides .ibuildos.yaml)")
	body := fs.String("body", "excerpt", "node body content: excerpt, full, or none")
	node := fs.String("node", "", "focus on this node (root-relative ref) and its neighbors")
	depth := fs.Int("depth", 1, "neighborhood radius when --node is set")
	rel := fs.String("rel", "", "comma-separated relationship filter for --node")
	if err := fs.Parse(flags); err != nil {
		return 2
	}
	if path == "" {
		path = "."
	}
	if *format != "json" {
		fmt.Fprintf(stderr, "invalid --format %q (graph supports json only)\n", *format)
		return 2
	}
	if *body != "excerpt" && *body != "full" && *body != "none" {
		fmt.Fprintf(stderr, "invalid --body %q (want excerpt, full, or none)\n", *body)
		return 2
	}

	cfg, err := config.Load(path)
	if err != nil {
		fmt.Fprintf(stderr, "cannot load .ibuildos.yaml: %v\n", err)
		return 1
	}
	if *typesDir != "" {
		cfg.TypesDirOverride = *typesDir
	}

	g, err := validate.Graph(path, cfg, graphx.Options{
		Body: *body, Node: *node, Depth: *depth, Rels: splitComma(*rel),
	})
	if err != nil {
		fmt.Fprintf(stderr, "cannot build graph: %v\n", err)
		return 1
	}
	if err := graphx.JSON(stdout, g); err != nil {
		fmt.Fprintf(stderr, "cannot write graph: %v\n", err)
		return 2
	}
	return 0
}

func runInit(args []string, stdout, stderr io.Writer) int {
	path, flags := splitArgs(args)
	fs := flag.NewFlagSet("init", flag.ContinueOnError)
	fs.SetOutput(stderr)
	example := fs.Bool("example", false, "also scaffold a tiny example requirement")
	if err := fs.Parse(flags); err != nil {
		return 2
	}
	if path == "" {
		path = "."
	}
	res, err := scaffold.Init(path, scaffold.Options{Example: *example})
	if err != nil {
		fmt.Fprintf(stderr, "init failed: %v\n", err)
		return 1
	}
	if res.AlreadyInit {
		fmt.Fprintf(stdout, "%s is already an iBuildOS bundle; only missing files were added.\n", path)
	}
	fmt.Fprintf(stdout, "created %d file(s), skipped %d existing.\n", len(res.Created), len(res.Skipped))
	for _, p := range res.Created {
		fmt.Fprintf(stdout, "  + %s\n", p)
	}
	if len(res.Created) > 0 {
		fmt.Fprintf(stdout, "\nNext: run `iBuild validate %s` (exits 0), then use /ibuild-discover to start.\n", path)
	}
	return 0
}

func splitComma(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// splitArgs pulls the first positional (the bundle path) out so flags may appear
// before or after it. Value-taking flags consume their following token.
func splitArgs(args []string) (path string, flags []string) {
	valueFlag := map[string]bool{
		"--format": true, "-format": true, "--types": true, "-types": true,
		"--body": true, "-body": true, "--node": true, "-node": true,
		"--depth": true, "-depth": true, "--rel": true, "-rel": true,
	}
	for i := 0; i < len(args); i++ {
		a := args[i]
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			if !strings.Contains(a, "=") && valueFlag[a] && i+1 < len(args) {
				flags = append(flags, args[i+1])
				i++
			}
			continue
		}
		if path == "" {
			path = a
		} else {
			flags = append(flags, a) // extra positional -> flag.Parse will reject
		}
	}
	return path, flags
}
