package graphx

import (
	"encoding/json"
	"fmt"
	"io"
)

// JSON writes the graph as stable, indented JSON with a trailing newline,
// mirroring report.JSON. The graph should already be Finalized.
func JSON(w io.Writer, g Graph) error {
	if g.Nodes == nil {
		g.Nodes = []Node{}
	}
	if g.Edges == nil {
		g.Edges = []Edge{}
	}
	if g.Types == nil {
		g.Types = []TypeSummary{}
	}
	b, err := json.MarshalIndent(g, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(w, string(b))
	return err
}
