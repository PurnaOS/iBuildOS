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

// validateDoc applies Layer 2a per-document checks against the resolved type.
func validateDoc(a *artifact, reg *types.Registry, c *model.Collector) {
	if a.doc == nil || !a.doc.HasFrontmatter {
		c.Errf(a.path, 0, "doc.noType", "artifact has no YAML frontmatter; add a --- block with at least a `type`")
		return
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
		if _, err := strconv.ParseFloat(text, 64); err != nil {
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
func validateJSONSchemas(a *artifact, schemas []*yaml.Node, c *model.Collector) {
	var inst any
	if err := a.doc.Map.Decode(&inst); err != nil {
		return
	}
	inst = jsonNormalize(inst)
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

// jsonNormalize round-trips a YAML-decoded value through JSON so the json_schema
// validator sees JSON-native types (float64, []any, map[string]any).
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
