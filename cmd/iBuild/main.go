// Command iBuild is the OKF-SDLC traceability linter.
package main

import (
	"os"

	"github.com/PurnaOS/iBuildOS/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
