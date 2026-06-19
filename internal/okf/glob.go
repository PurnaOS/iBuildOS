package okf

import (
	"io/fs"
	"os"
	"sort"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
)

// MatchFiles returns the existing files under baseDir matching any of the globs
// (forward-slash, base-relative; a leading "/" is tolerated). Directories are
// excluded; results are deduped and sorted for determinism. Patterns support **.
func MatchFiles(baseDir string, globs []string) ([]string, error) {
	fsys := os.DirFS(baseDir)
	seen := map[string]bool{}
	var out []string
	for _, g := range globs {
		g = strings.TrimPrefix(g, "/")
		matches, err := doublestar.Glob(fsys, g)
		if err != nil {
			return nil, err
		}
		for _, m := range matches {
			if info, err := fs.Stat(fsys, m); err == nil && !info.IsDir() && !seen[m] {
				seen[m] = true
				out = append(out, m)
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

// AnyMatch reports whether any glob matches at least one existing file under baseDir.
func AnyMatch(baseDir string, globs []string) (bool, error) {
	fsys := os.DirFS(baseDir)
	for _, g := range globs {
		g = strings.TrimPrefix(g, "/")
		matches, err := doublestar.Glob(fsys, g)
		if err != nil {
			return false, err
		}
		for _, m := range matches {
			if info, err := fs.Stat(fsys, m); err == nil && !info.IsDir() {
				return true, nil
			}
		}
	}
	return false, nil
}
