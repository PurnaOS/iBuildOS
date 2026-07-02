// GraphML export (IO-005): the typed link graph as GraphML XML for external
// graph tools (Gephi, yEd, Cytoscape). Deterministic — nodes/edges are already
// sorted by finalize; dangling link targets get placeholder nodes so the XML is
// valid. Net-new in the TS build.
import type { Graph } from "./graph.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function toGraphML(g: Graph): string {
  const nodeKeys = new Set(g.nodes.map((n) => n.key));
  // Endpoints referenced by edges but not present as nodes (dangling targets).
  const dangling = new Set<string>();
  for (const e of g.edges) {
    if (!nodeKeys.has(e.from)) dangling.add(e.from);
    if (!nodeKeys.has(e.to)) dangling.add(e.to);
  }

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`,
    `  <key id="type" for="node" attr.name="type" attr.type="string"/>`,
    `  <key id="status" for="node" attr.name="status" attr.type="string"/>`,
    `  <key id="resolved" for="node" attr.name="resolved" attr.type="boolean"/>`,
    `  <key id="rel" for="edge" attr.name="relationship" attr.type="string"/>`,
    `  <key id="targetType" for="edge" attr.name="targetType" attr.type="string"/>`,
    `  <key id="edgeResolved" for="edge" attr.name="resolved" attr.type="boolean"/>`,
    `  <graph edgedefault="directed">`,
  ];
  for (const n of g.nodes) {
    lines.push(`    <node id="${esc(n.key)}">`);
    lines.push(`      <data key="type">${esc(n.type)}</data>`);
    if (n.status) lines.push(`      <data key="status">${esc(n.status)}</data>`);
    lines.push(`      <data key="resolved">true</data>`);
    lines.push(`    </node>`);
  }
  for (const key of [...dangling].sort()) {
    lines.push(`    <node id="${esc(key)}">`);
    lines.push(`      <data key="resolved">false</data>`);
    lines.push(`    </node>`);
  }
  let i = 0;
  for (const e of g.edges) {
    lines.push(`    <edge id="e${i++}" source="${esc(e.from)}" target="${esc(e.to)}">`);
    lines.push(`      <data key="rel">${esc(e.relationship)}</data>`);
    if (e.targetType) lines.push(`      <data key="targetType">${esc(e.targetType)}</data>`);
    lines.push(`      <data key="edgeResolved">${e.resolved}</data>`);
    lines.push(`    </edge>`);
  }
  lines.push(`  </graph>`, `</graphml>`, "");
  return lines.join("\n");
}
