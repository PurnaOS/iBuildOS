package okf

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
)

// PathCaseMatches reports whether the slash-separated relative path rel exists
// under baseDir with the EXACT case of every segment. os.Stat / os.DirFS are
// case-insensitive on macOS and Windows, so a link to /work/Task.md or a glob
// segment Work/** would resolve there but NOT on a case-sensitive Linux CI box —
// making the linter's output (and exit code) OS-dependent. Checking each segment
// against the real directory entries restores byte-identical results everywhere
// (review #2). It also rejects ".." segments, since ".." is never an entry name.
//
// ponytail: O(depth × dir-size) per check via os.ReadDir; fine for bundles. If
// this ever shows up in a profile, memoize per-directory listings for one run.
func PathCaseMatches(baseDir, rel string) bool {
	cur := baseDir
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" || seg == "." {
			continue
		}
		entries, err := os.ReadDir(cur)
		if err != nil {
			return false
		}
		found := false
		for _, e := range entries {
			if e.Name() == seg {
				found = true
				break
			}
		}
		if !found {
			return false
		}
		cur = filepath.Join(cur, seg)
	}
	return true
}

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
			if info, err := fs.Stat(fsys, m); err == nil && !info.IsDir() && !seen[m] && PathCaseMatches(baseDir, m) {
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
			if info, err := fs.Stat(fsys, m); err == nil && !info.IsDir() && PathCaseMatches(baseDir, m) {
				return true, nil
			}
		}
	}
	return false, nil
}
