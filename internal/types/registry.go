// Package types is the generic engine (Layer 1). It loads the self-describing
// ArtifactType definitions from docs/types/*.md, resolves inheritance, and
// compiles the friendly dialect into checks. The ONLY literal type name in the
// whole codebase is the string "ArtifactType", confined to this package.
package types

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"

	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/okf"
	"gopkg.in/yaml.v3"
)

// metaType is the only type the engine knows natively.
const metaType = "ArtifactType"

// reserved files in a types dir that are never type definitions.
var reserved = map[string]bool{"index.md": true, "log.md": true}

// validScalarTypes are the field `type:` values the dialect understands.
var validScalarTypes = map[string]bool{
	"": true, "string": true, "number": true, "date": true, "bool": true, "list": true,
}

// FieldSpec is a compiled field check.
type FieldSpec struct {
	Required bool
	OneOf    []string
	Pattern  string
	Type     string // "", string, number, date, bool, list
	Doc      string
	Re       *regexp.Regexp
}

// RelSpec is a compiled relationship check.
type RelSpec struct {
	Target string
	Min    int
	Max    *int // nil = unbounded
	Doc    string
}

// Definition is one ArtifactType document's own (un-inherited) declaration.
type Definition struct {
	Defines     string
	Extends     string
	Abstract    bool
	Description string
	Fields      map[string]FieldSpec
	Rels        map[string]RelSpec
	JSONSchema  *yaml.Node
	Path        string // bundle-relative, for findings
	defLine     int
}

// Resolved is a Definition flattened across its extends chain (child overrides parent).
type Resolved struct {
	Name        string
	Abstract    bool
	Fields      map[string]FieldSpec
	Rels        map[string]RelSpec
	JSONSchemas []*yaml.Node // own + ancestors (applied in addition)
}

// Registry is the compiled type model.
type Registry struct {
	defs     map[string]*Definition
	resolved map[string]*Resolved
	desc     map[string]map[string]bool // type -> set of {self + transitive subtypes}
}

type rawField struct {
	Required bool     `yaml:"required"`
	OneOf    []string `yaml:"one_of"`
	Pattern  string   `yaml:"pattern"`
	Type     string   `yaml:"type"`
	Doc      string   `yaml:"doc"`
}

type rawRel struct {
	Target string `yaml:"target"`
	Min    int    `yaml:"min"`
	Max    *int   `yaml:"max"`
	Doc    string `yaml:"doc"`
}

type rawDef struct {
	Type          string              `yaml:"type"`
	Defines       string              `yaml:"defines"`
	Extends       string              `yaml:"extends"`
	Abstract      bool                `yaml:"abstract"`
	Description   string              `yaml:"description"`
	Fields        map[string]rawField `yaml:"fields"`
	Relationships map[string]rawRel   `yaml:"relationships"`
}

// Load reads every *.md under typesDir, compiles the type model, and meta-
// validates it. Definition problems are emitted as error findings (via c) so
// they fail the build and get annotated; the returned registry is still usable
// for whatever resolved correctly. An unreadable typesDir is a hard error.
func Load(typesDir, bundleDir string, c *model.Collector) (*Registry, error) {
	entries, err := os.ReadDir(typesDir)
	if err != nil {
		return nil, err
	}
	r := &Registry{
		defs:     map[string]*Definition{},
		resolved: map[string]*Resolved{},
		desc:     map[string]map[string]bool{},
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		if e := loadOne(r, typesDir, bundleDir, name, c); e != nil {
			continue
		}
	}
	r.checkReferences(c)
	r.buildDescendants()
	return r, nil
}

func loadOne(r *Registry, typesDir, bundleDir, name string, c *model.Collector) error {
	if reserved[name] || filepath.Ext(name) != ".md" {
		return errSkip
	}
	abs := filepath.Join(typesDir, name)
	rel := bundleRel(bundleDir, abs)
	raw, err := os.ReadFile(abs)
	if err != nil {
		return errSkip
	}
	d, err := okf.Parse(abs, raw)
	if err != nil || !d.HasFrontmatter {
		return errSkip // tolerate prose / malformed files in the types dir
	}
	if _, tv, ok := d.Get("type"); !ok || tv.Value != metaType {
		return errSkip // skip non-ArtifactType files (e.g. overview.md type: Reference)
	}

	var rd rawDef
	if err := d.Map.Decode(&rd); err != nil {
		c.Errf(rel, d.FrontStartLine(), "types.badMeta", "cannot read type definition: %v", err)
		return errSkip
	}
	if rd.Defines == "" {
		c.Errf(rel, d.FrontStartLine(), "types.badMeta", "ArtifactType definition is missing a `defines` name")
		return errSkip
	}
	if existing, dup := r.defs[rd.Defines]; dup {
		c.Errf(rel, d.FrontStartLine(), "types.duplicate",
			"type %q is already defined in %s", rd.Defines, existing.Path)
		return errSkip
	}

	def := &Definition{
		Defines:     rd.Defines,
		Extends:     rd.Extends,
		Abstract:    rd.Abstract,
		Description: rd.Description,
		Fields:      map[string]FieldSpec{},
		Rels:        map[string]RelSpec{},
		Path:        rel,
		defLine:     d.FrontStartLine(),
	}
	// Capture the json_schema block straight from the document mapping (more
	// reliable than struct-decoding a *yaml.Node).
	if _, js, ok := d.Get("json_schema"); ok {
		def.JSONSchema = js
	}
	for fname, rf := range rd.Fields {
		fs := FieldSpec{Required: rf.Required, OneOf: rf.OneOf, Pattern: rf.Pattern, Type: rf.Type, Doc: rf.Doc}
		if !validScalarTypes[rf.Type] {
			c.Errf(rel, d.FrontStartLine(), "types.badMeta",
				"field %q in type %q has unknown type %q (want string|number|date|bool|list)", fname, rd.Defines, rf.Type)
		}
		if rf.Pattern != "" {
			re, perr := compilePattern(rf.Pattern)
			if perr != nil {
				c.Errf(rel, d.FrontStartLine(), "types.badPattern",
					"field %q in type %q has an invalid pattern %q: %v", fname, rd.Defines, rf.Pattern, perr)
			} else {
				fs.Re = re
			}
		}
		def.Fields[fname] = fs
	}
	for rname, rr := range rd.Relationships {
		if rr.Target == "" {
			c.Errf(rel, d.FrontStartLine(), "types.badMeta",
				"relationship %q in type %q is missing a `target`", rname, rd.Defines)
		}
		def.Rels[rname] = RelSpec{Target: rr.Target, Min: rr.Min, Max: rr.Max, Doc: rr.Doc}
	}
	r.defs[rd.Defines] = def
	return nil
}

// checkReferences validates that every extends / relationship target names a
// defined type, and that the extends graph is acyclic.
func (r *Registry) checkReferences(c *model.Collector) {
	for _, name := range r.sortedDefNames() {
		def := r.defs[name]
		if def.Extends != "" {
			if _, ok := r.defs[def.Extends]; !ok {
				c.Errf(def.Path, def.defLine, "types.unknownExtends",
					"type %q extends unknown type %q", name, def.Extends)
			}
		}
		for _, rname := range sortedRelNames(def.Rels) {
			tgt := def.Rels[rname].Target
			if tgt != "" {
				if _, ok := r.defs[tgt]; !ok {
					c.Errf(def.Path, def.defLine, "types.unknownTarget",
						"relationship %q in type %q targets unknown type %q", rname, name, tgt)
				}
			}
		}
	}
	// cycle detection over extends
	const white, gray, black = 0, 1, 2
	color := map[string]int{}
	var visit func(n string) bool
	visit = func(n string) bool {
		color[n] = gray
		if def, ok := r.defs[n]; ok && def.Extends != "" {
			switch color[def.Extends] {
			case gray:
				c.Errf(def.Path, def.defLine, "types.cycle", "type %q is part of an extends cycle", n)
				return true
			case white:
				if visit(def.Extends) {
					return true
				}
			}
		}
		color[n] = black
		return false
	}
	for _, name := range r.sortedDefNames() {
		if color[name] == white {
			if visit(name) {
				break
			}
		}
	}
}

// ancestors returns the extends chain of name (self first, then parents),
// guarding against cycles.
func (r *Registry) ancestors(name string) []string {
	var chain []string
	seen := map[string]bool{}
	for cur := name; cur != ""; {
		if seen[cur] {
			break
		}
		seen[cur] = true
		chain = append(chain, cur)
		def, ok := r.defs[cur]
		if !ok {
			break
		}
		cur = def.Extends
	}
	return chain
}

func (r *Registry) buildDescendants() {
	for name := range r.defs {
		for _, anc := range r.ancestors(name) {
			if r.desc[anc] == nil {
				r.desc[anc] = map[string]bool{}
			}
			r.desc[anc][name] = true
		}
	}
}

// Resolve flattens a type across its extends chain (child overrides parent).
// Returns false for an unknown type.
func (r *Registry) Resolve(name string) (*Resolved, bool) {
	if res, ok := r.resolved[name]; ok {
		return res, true
	}
	def, ok := r.defs[name]
	if !ok {
		return nil, false
	}
	res := &Resolved{Name: name, Abstract: def.Abstract, Fields: map[string]FieldSpec{}, Rels: map[string]RelSpec{}}
	chain := r.ancestors(name)
	// apply parents first so children override
	for i := len(chain) - 1; i >= 0; i-- {
		d, ok := r.defs[chain[i]]
		if !ok {
			continue
		}
		for k, v := range d.Fields {
			res.Fields[k] = v
		}
		for k, v := range d.Rels {
			res.Rels[k] = v
		}
		if d.JSONSchema != nil {
			res.JSONSchemas = append(res.JSONSchemas, d.JSONSchema)
		}
	}
	r.resolved[name] = res
	return res, true
}

// Satisfies reports whether a document of type docType satisfies a relationship
// whose target is target — true iff docType is target or transitively extends it.
func (r *Registry) Satisfies(docType, target string) bool {
	return r.desc[target] != nil && r.desc[target][docType]
}

// Has reports whether a type is defined.
func (r *Registry) Has(name string) bool {
	_, ok := r.defs[name]
	return ok
}

// ConcreteSubtypes returns the non-abstract types that are target or extend it,
// sorted — used to suggest replacements when an abstract type is used directly.
func (r *Registry) ConcreteSubtypes(name string) []string {
	var out []string
	for sub := range r.desc[name] {
		if d, ok := r.defs[sub]; ok && !d.Abstract {
			out = append(out, sub)
		}
	}
	sort.Strings(out)
	return out
}

// RelTarget returns the target type of the first defined relationship with the
// given name (relationship names are shared across types, e.g. implements ->
// Requirement). Returns "" if no type declares it.
func (r *Registry) RelTarget(relName string) string {
	for _, name := range r.sortedDefNames() {
		if rel, ok := r.defs[name].Rels[relName]; ok {
			return rel.Target
		}
	}
	return ""
}

// DefNames returns every defined type name (concrete and abstract), sorted. The
// graph export uses it to project the registry as data.
func (r *Registry) DefNames() []string { return r.sortedDefNames() }

// Ancestors returns name's extends chain, self first then parents (cycle-safe).
func (r *Registry) Ancestors(name string) []string { return r.ancestors(name) }

// IsAbstract reports whether a defined type is abstract.
func (r *Registry) IsAbstract(name string) bool {
	d, ok := r.defs[name]
	return ok && d.Abstract
}

// Description returns the one-line description of a defined type, or "".
func (r *Registry) Description(name string) string {
	if d, ok := r.defs[name]; ok {
		return d.Description
	}
	return ""
}

// Extends returns the immediate parent type of name, or "".
func (r *Registry) Extends(name string) string {
	if d, ok := r.defs[name]; ok {
		return d.Extends
	}
	return ""
}

func (r *Registry) sortedDefNames() []string {
	out := make([]string, 0, len(r.defs))
	for n := range r.defs {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

func sortedRelNames(m map[string]RelSpec) []string {
	out := make([]string, 0, len(m))
	for n := range m {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

var errSkip = skipErr{}

type skipErr struct{}

func (skipErr) Error() string { return "skip" }

func bundleRel(bundleDir, abs string) string {
	rel, err := filepath.Rel(bundleDir, abs)
	if err != nil {
		return filepath.ToSlash(abs)
	}
	return filepath.ToSlash(rel)
}
