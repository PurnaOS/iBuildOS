// Static portal (UI-001/002/003/004/007/009): a single self-contained, offline
// HTML page derived entirely from the repo — dashboard, requirements
// traceability matrix, findings, and an artifact browser. It is generated from
// the bundle and is never a system of record (delete it → the repo is unchanged).
import type { Config } from "../config/config.ts";
import type { Registry } from "../types/registry.ts";
import type { Graph } from "../graphx/graph.ts";
import type { Finding } from "../model/model.ts";
import { buildRtm } from "../graphx/rtm.ts";
import { buildStatus } from "../metrics/status.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSite(graph: Graph, reg: Registry, cfg: Config, findings: Finding[]): string {
  const data = {
    status: buildStatus(graph, reg, cfg, findings),
    rtm: buildRtm(graph, reg, cfg),
    findings,
    nodes: graph.nodes.map((n) => ({ key: n.key, type: n.type, status: n.status ?? "" })),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c"); // safe to embed in <script>

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>iBuildOS — knowledge portal</title>
<style>
  :root{--fg:#1c2330;--mut:#6b7480;--line:#e3e7ee;--ok:#1a7f37;--err:#cf222e;--warn:#9a6700;--accent:#3858e9}
  *{box-sizing:border-box} body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg)}
  header{padding:18px 24px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
  h1{font-size:18px;margin:0} .sub{color:var(--mut)}
  .badge{padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600}
  .b-ok{background:#e6f4ea;color:var(--ok)} .b-err{background:#ffebe9;color:var(--err)} .b-warn{background:#fff8c5;color:var(--warn)}
  nav{display:flex;gap:4px;padding:0 16px;border-bottom:1px solid var(--line)}
  nav button{border:0;background:0;padding:10px 14px;font:inherit;color:var(--mut);cursor:pointer;border-bottom:2px solid transparent}
  nav button.on{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
  main{padding:16px 24px;max-width:1100px}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .card{border:1px solid var(--line);border-radius:8px;padding:12px 16px;min-width:120px}
  .card .n{font-size:22px;font-weight:700} .card .l{color:var(--mut);font-size:12px}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--mut);font-weight:600} tr:hover td{background:#f7f9fc}
  .pill{font-size:11px;padding:1px 6px;border-radius:8px;background:#eef1f6;color:var(--mut)}
  .y{color:var(--ok);font-weight:700}.n2{color:var(--mut)} code{background:#f1f3f7;padding:1px 4px;border-radius:4px}
  .hide{display:none}
</style></head>
<body>
<header>
  <h1>iBuildOS</h1><span class="sub">knowledge portal — generated from the repo</span>
  <span id="vbadge" class="badge"></span>
</header>
<nav>
  <button data-tab="dash" class="on">Dashboard</button>
  <button data-tab="reqs">Traceability</button>
  <button data-tab="find">Findings</button>
  <button data-tab="arts">Artifacts</button>
</nav>
<main>
  <section id="dash"></section>
  <section id="reqs" class="hide"></section>
  <section id="find" class="hide"></section>
  <section id="arts" class="hide"></section>
</main>
<script id="data" type="application/json">${json}</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const E = (h)=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content;};
const vb = document.getElementById('vbadge'), v = D.status.validation;
vb.textContent = v.errors+' errors · '+v.warnings+' warnings';
vb.className = 'badge '+(v.errors? 'b-err': v.warnings? 'b-warn':'b-ok');

const r = D.status.requirements;
document.getElementById('dash').appendChild(E(\`
  <div class="cards">
    <div class="card"><div class="n">\${r.requirements}</div><div class="l">requirements</div></div>
    <div class="card"><div class="n">\${r.implemented}</div><div class="l">implemented</div></div>
    <div class="card"><div class="n">\${r.verified}</div><div class="l">verified</div></div>
    <div class="card"><div class="n">\${r.traced}</div><div class="l">fully traced</div></div>
    <div class="card"><div class="n">\${D.nodes.length}</div><div class="l">artifacts</div></div>
  </div>
  <h3>By type</h3><table><tr><th>type</th><th>count</th></tr>
  \${Object.keys(D.status.byType).sort().map(k=>\`<tr><td><code>\${k}</code></td><td>\${D.status.byType[k]}</td></tr>\`).join('')}</table>\`));

document.getElementById('reqs').appendChild(E(\`<table><tr><th>id</th><th>status</th><th>implemented</th><th>verified</th><th>traced</th></tr>
  \${D.rtm.requirements.map(q=>\`<tr><td><code>\${q.id}</code></td><td><span class="pill">\${q.status}</span></td>
   <td>\${q.implementedBy.length}</td><td>\${q.verifiedBy.length}</td><td>\${q.traced?'<span class="y">✓</span>':'<span class="n2">·</span>'}</td></tr>\`).join('')}</table>\`));

document.getElementById('find').appendChild(E(D.findings.length? \`<table><tr><th>severity</th><th>file</th><th>rule</th><th>message</th></tr>
  \${D.findings.map(f=>\`<tr><td>\${f.severity}</td><td><code>\${f.file}\${f.line?':'+f.line:''}</code></td><td><code>\${f.rule}</code></td><td>\${f.message}</td></tr>\`).join('')}</table>\` : '<p class="y">No problems found.</p>'));

document.getElementById('arts').appendChild(E(\`<table><tr><th>key</th><th>type</th><th>status</th></tr>
  \${D.nodes.map(n=>\`<tr><td><code>\${n.key}</code></td><td>\${n.type}</td><td><span class="pill">\${n.status}</span></td></tr>\`).join('')}</table>\`));

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  ['dash','reqs','find','arts'].forEach(id=>document.getElementById(id).classList.toggle('hide',id!==b.dataset.tab));
});
</script>
</body></html>
`;
}

// htmlEscape is exported for callers that want to embed snippets safely.
export { esc as htmlEscape };
