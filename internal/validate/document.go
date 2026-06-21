package validate

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/types"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"gopkg.in/yaml.v3"
)

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// numberRe is the set of scalar forms that are valid YAML numbers. Go's
// strconv.ParseFloat is more permissive than YAML (it accepts Inf/NaN,
// hex-floats, and underscore separators), so a number field is only accepted
// when it both parses AND matches this YAML-shaped form.
var numberRe = regexp.MustCompile(`^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$`)

// validateDoc applies Layer 2a per-document checks against the resolved type.
func validateDoc(a *artifact, reg *types.Registry, c *model.Collector) {
	if a.doc == nil || !a.doc.HasFrontmatter {
		c.Errf(a.path, 0, "doc.noType", "artifact has no YAML frontmatter; add a --- block with at least a `type`")
		return
	}
	// Duplicate frontmatter keys / relationship keys are tolerated (first/last
	// wins) but surfaced as warnings so the silent-data-loss is visible.
	for _, k := range a.doc.DuplicateTopLevelKeys() {
		c.Warnf(a.path, a.doc.FrontStartLine(), "doc.duplicateKey",
			"frontmatter key %q appears more than once; only one value is used", k)
	}
	for _, r := range a.doc.DuplicateLinkRels() {
		c.Warnf(a.path, a.doc.FrontStartLine(), "doc.duplicateRelationship",
			"relationship %q appears more than once under links:; only one is used", r)
	}
	if a.typ == "" {
		c.Errf(a.path, a.doc.FrontStartLine(), "doc.noType", "artifact frontmatter has no `type`")
		return
	}
	res, ok := reg.Resolve(a.typ)
	if !ok {
		_, tv, _ := a.doc.Get("type")
		c.Warnf(a.path, a.doc.Line(tv), "doc.unknownType",
			"type %q is not defined in the type model; tolerated, not validated", a.typ)
		return
	}
	if res.Abstract {
		_, tv, _ := a.doc.Get("type")
		c.Errf(a.path, a.doc.Line(tv), "doc.abstractType",
			"type %q is abstract and may not be used directly; use a concrete subtype: %s",
			a.typ, strings.Join(reg.ConcreteSubtypes(a.typ), ", "))
		return
	}
	for _, name := range sortedKeys(res.Fields) {
		checkField(a, name, res.Fields[name], c)
	}
	if len(res.JSONSchemas) > 0 {
		validateJSONSchemas(a, res.JSONSchemas, c)
	}
}

func checkField(a *artifact, name string, fs types.FieldSpec, c *model.Collector) {
	kn, vn, present := a.doc.Get(name)
	if !present {
		if fs.Required {
			c.Errf(a.path, a.doc.FrontStartLine(), "field.required", "required field %q is missing", name)
		}
		return
	}
	line := a.doc.Line(kn)

	// A present-but-empty scalar (blank value or explicit null) does not
	// satisfy required — treat it like a missing field.
	if fs.Required && isEmptyScalar(vn) {
		c.Errf(a.path, line, "field.required", "required field %q is present but empty", name)
		return
	}

	if fs.Type == "list" {
		if vn.Kind != yaml.SequenceNode {
			c.Errf(a.path, line, "field.type", "field %q must be a list", name)
			return
		}
		for _, item := range vn.Content {
			if item.Kind != yaml.ScalarNode {
				c.Errf(a.path, line, "field.type", "field %q must be a list of simple values", name)
				return
			}
		}
		return // enum/pattern do not apply to lists in this dialect
	}

	if vn.Kind != yaml.ScalarNode {
		c.Errf(a.path, line, "field.type", "field %q must be a single value", name)
		return
	}
	text := vn.Value // raw source text — never the decoded value
	switch fs.Type {
	case "number":
		if !isNumber(text) {
			c.Errf(a.path, line, "field.type", "field %q must be a number, got %q", name, text)
		}
	case "bool":
		if !isBool(text) {
			c.Errf(a.path, line, "field.type", "field %q must be true or false, got %q", name, text)
		}
	case "date":
		if !isDate(text) {
			c.Errf(a.path, line, "field.type", "field %q must be a date (YYYY-MM-DD), got %q", name, text)
		}
	}
	if len(fs.OneOf) > 0 && !contains(fs.OneOf, text) {
		c.Errf(a.path, line, "field.enum", "field %q value %q is not one of: %s", name, text, strings.Join(fs.OneOf, ", "))
	}
	if fs.Re != nil && !fs.Re.MatchString(text) {
		c.Errf(a.path, line, "field.pattern", "field %q value %q does not match required form %q", name, text, fs.Pattern)
	}
}

// isEmptyScalar reports whether a value node is a present-but-empty scalar: an
// empty string or an explicit YAML null. Such a node does not satisfy a
// required field.
func isEmptyScalar(vn *yaml.Node) bool {
	return vn != nil && vn.Kind == yaml.ScalarNode && (vn.Value == "" || vn.Tag == "!!null")
}

// isNumber reports whether the raw scalar text is a valid YAML number. It is
// stricter than strconv.ParseFloat: it rejects the Go-only forms ParseFloat
// accepts but YAML does not — Inf, NaN, hex-floats, and underscore separators.
func isNumber(s string) bool {
	if !numberRe.MatchString(s) {
		return false
	}
	// numberRe already excludes the Go-only forms; ParseFloat is a belt-and-
	// suspenders check that the run is a parseable finite number.
	_, err := strconv.ParseFloat(s, 64)
	return err == nil
}

func isBool(s string) bool {
	switch strings.ToLower(s) {
	case "true", "false":
		return true
	}
	return false
}

func isDate(s string) bool {
	if !dateRe.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// validateJSONSchemas applies any json_schema: escape-hatch blocks (own +
// ancestors) to the document's frontmatter, in addition to the dialect checks.
//
// The instance is built from a raw-scalar view of the frontmatter (see
// rawScalarValue): YAML !!timestamp and !!str scalars contribute their SOURCE
// TEXT, so a date like `2020-01-01` is validated as the string the author
// wrote rather than the RFC3339 string a full decode would produce. Genuine
// numbers, booleans, and nulls resolve to their JSON-native types so numeric
// schema constraints (e.g. type: integer, minimum) still work.
func validateJSONSchemas(a *artifact, schemas []*yaml.Node, c *model.Collector) {
	if a.doc == nil || a.doc.Map == nil {
		return
	}
	inst := rawScalarMapping(a.doc.Map)
	for _, sn := range schemas {
		var sdoc any
		if err := sn.Decode(&sdoc); err != nil {
			continue
		}
		sdoc = jsonNormalize(sdoc)
		comp := jsonschema.NewCompiler()
		if err := comp.AddResource("mem://schema.json", sdoc); err != nil {
			c.Errf(a.path, a.doc.FrontStartLine(), "doc.jsonSchema", "invalid json_schema: %s", stableSchemaError(err))
			continue
		}
		sch, err := comp.Compile("mem://schema.json")
		if err != nil {
			c.Errf(a.path, a.doc.FrontStartLine(), "doc.jsonSchema", "invalid json_schema: %s", stableSchemaError(err))
			continue
		}
		if err := sch.Validate(inst); err != nil {
			c.Errf(a.path, a.doc.FrontStartLine(), "doc.jsonSchema", "frontmatter fails json_schema: %s", stableSchemaError(err))
		}
	}
}

// rawScalarMapping converts a YAML mapping node into a map[string]any in which
// scalar values keep the same raw-text-vs-native treatment the dialect uses.
func rawScalarMapping(m *yaml.Node) map[string]any {
	out := map[string]any{}
	if m == nil {
		return out
	}
	for i := 0; i+1 < len(m.Content); i += 2 {
		out[m.Content[i].Value] = rawScalarValue(m.Content[i+1])
	}
	return out
}

// rawScalarValue projects a YAML node into a json_schema-validatable value.
// Scalars tagged !!str or !!timestamp keep their source text (so quoted values
// and dates are validated as the author wrote them); other scalars resolve to
// their JSON-native type (number/bool/null). Sequences and mappings recurse.
func rawScalarValue(n *yaml.Node) any {
	if n == nil {
		return nil
	}
	switch n.Kind {
	case yaml.SequenceNode:
		out := make([]any, 0, len(n.Content))
		for _, item := range n.Content {
			out = append(out, rawScalarValue(item))
		}
		return out
	case yaml.MappingNode:
		return rawScalarMapping(n)
	case yaml.ScalarNode:
		switch n.Tag {
		case "!!str", "!!timestamp":
			return n.Value
		}
		var v any
		if err := n.Decode(&v); err != nil {
			return n.Value
		}
		return jsonNormalize(v)
	default:
		var v any
		if err := n.Decode(&v); err != nil {
			return nil
		}
		return jsonNormalize(v)
	}
}

// jsonNormalize round-trips a value through JSON so the json_schema validator
// sees JSON-native types (float64, []any, map[string]any).
func jsonNormalize(v any) any {
	b, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return v
	}
	return out
}

// stableSchemaError renders a jsonschema error as a single, deterministic line.
// The library's Error() is multi-line and its causes can be emitted in
// map-iteration order, which would break iBuild's byte-identical output guarantee
// and the one-finding-per-line text format (review #6). Collapsing to a sorted,
// deduped, whitespace-normalized set of lines makes the message order-independent.
func stableSchemaError(err error) string {
	seen := map[string]bool{}
	var parts []string
	for _, ln := range strings.Split(err.Error(), "\n") {
		ln = strings.Join(strings.Fields(ln), " ")
		if ln == "" || seen[ln] {
			continue
		}
		seen[ln] = true
		parts = append(parts, ln)
	}
	sort.Strings(parts)
	return strings.Join(parts, "; ")
}
