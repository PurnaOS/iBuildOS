// Package cli is the command-line surface: argument parsing, orchestration, and
// the exit-code contract. main() is a thin wrapper over Run.
package cli

import (
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/report"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// Version is overridable via -ldflags "-X .../cli.Version=...".
var Version = "dev"

const usage = `iBuild — OKF-SDLC traceability linter

Usage:
  iBuild validate [path] [--format text|json] [--types <dir>]
  iBuild version

Exit codes: 0 = no errors, 1 = validation errors, 2 = usage error.`

// Run executes a command and returns the process exit code.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" || args[0] == "help" {
		fmt.Fprintln(stdout, usage)
		return 0
	}
	switch args[0] {
	case "validate":
		return runValidate(args[1:], stdout, stderr)
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

// splitArgs pulls the first positional (the bundle path) out so flags may appear
// before or after it. The two value-taking flags consume their following token.
func splitArgs(args []string) (path string, flags []string) {
	valueFlag := map[string]bool{"--format": true, "-format": true, "--types": true, "-types": true}
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
