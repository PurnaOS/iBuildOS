// The Studio single-page app: a self-contained, fetch-driven vanilla SPA (no
// framework, no build step) served at GET /. It calls the /api/* oracles live and
// is extended tab-by-tab across the 12b sub-phases. Read tabs ship in 12b.1;
// Author/Review/Operate/Agent/Plan/Team/Workspaces tabs are wired by later phases.
import type { StudioContext } from "./api.ts";

export function renderApp(ctx: StudioContext): string {
  const p = ctx.cfg.profile;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>iBuild Studio</title>
<style>
  :root{--fg:#1c2330;--mut:#6b7480;--line:#e3e7ee;--ok:#1a7f37;--err:#cf222e;--warn:#9a6700;--accent:#3858e9;--bg:#fff}
  *{box-sizing:border-box} body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
  header{padding:14px 22px;border-bottom:1px solid var(--line);display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
  h1{font-size:17px;margin:0} .sub{color:var(--mut);font-size:12px}
  .badge{padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;margin-left:auto}
  .b-ok{background:#e6f4ea;color:var(--ok)} .b-err{background:#ffebe9;color:var(--err)} .b-warn{background:#fff8c5;color:var(--warn)} .b-na{background:#eef1f6;color:var(--mut)}
  nav{display:flex;gap:2px;padding:0 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  nav button{border:0;background:0;padding:9px 12px;font:inherit;color:var(--mut);cursor:pointer;border-bottom:2px solid transparent}
  nav button.on{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
  main{padding:16px 22px;max-width:1150px}
  .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .card{border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:110px}
  .card .n{font-size:21px;font-weight:700} .card .l{color:var(--mut);font-size:12px}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{text-align:left;padding:5px 9px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--mut);font-weight:600} tr:hover td{background:#f7f9fc}
  .pill{font-size:11px;padding:1px 6px;border-radius:8px;background:#eef1f6;color:var(--mut)} code{background:#f1f3f7;padding:1px 4px;border-radius:4px}
  .y{color:var(--ok);font-weight:700}.muted{color:var(--mut)} input,select,textarea,button.act{font:inherit;padding:6px 9px;border:1px solid var(--line);border-radius:6px}
  button.act{background:var(--accent);color:#fff;border-color:var(--accent);cursor:pointer} button.act.sec{background:#fff;color:var(--fg)}
  pre{background:#f7f9fc;border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;font-size:12px;white-space:pre-wrap}
  .hide{display:none} .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .kanban{display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;align-items:flex-start}
  .kcol{min-width:225px;max-width:265px;flex:0 0 auto;background:#f7f9fc;border:1px solid var(--line);border-radius:8px;padding:8px}
  .kcol h4{margin:2px 4px 8px;font-size:12px;color:var(--mut);display:flex;justify-content:space-between;text-transform:capitalize}
  .kcard{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:8px}
  .kcard:hover{border-color:var(--accent)} .kcard .kt{font-weight:600;font-size:13px;line-height:1.3} .kcard .km{color:var(--mut);font-size:11px;margin-top:5px}
  details{border:1px solid var(--line);border-radius:8px;margin-bottom:8px;padding:0 12px}
  summary{cursor:pointer;padding:10px 0;font-size:13px;color:var(--fg)} summary:hover{color:var(--accent)}
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
</style></head>
<body>
<header>
  <h1>iBuild Studio</h1>
  <span class="sub">${escapeHtml(p.name)} v${escapeHtml(p.version)} · iBuild ${escapeHtml(ctx.version)}</span>
  <span id="vbadge" class="badge b-na">…</span>
</header>
<nav id="tabs"></nav>
<main id="view"></main>
<script>
const TABS = [
  ["dash","Dashboard"],["reqs","Requirements"],["plan","Plan"],["arts","Artifacts"],
  ["author","Author"],["review","Review"],["operate","Operate"],
  ["agent","Agent"],["work","Workspaces"],["mine","My Work"],["team","People"]
];
const view = document.getElementById('view'), nav = document.getElementById('tabs');
let currentTab='dash';
const j = async (u)=>{const r=await fetch(u); if(!r.ok) throw new Error(await r.text()); return r.json();};
const esc = (s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const tbl = (head,rows)=>'<table><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>';
// keyLink: a clickable artifact key that opens the detail view (label defaults to the key).
const keyLink = (k,label)=>'<a href="#" onclick="return openDetail(\\''+String(k).replace(/'/g,"\\\\'")+'\\')">'+esc(label||k)+'</a>';

// openDetail fetches one artifact's full detail and renders a clean read view.
async function openDetail(key){
  view.innerHTML='<p class="muted">loading…</p>';
  try{
    const d=await j('/api/node?key='+encodeURIComponent(key));
    if(!d.node){view.innerHTML='<button class="act sec" onclick="show(currentTab)">← back</button><p class="muted">not found</p>';return false;}
    const n=d.node, f=n.fields||{};
    let h='<button class="act sec" onclick="show(currentTab)">← back</button>';
    h+='<h2 style="margin:10px 0 2px">'+esc(f.title||n.key)+'</h2>';
    h+='<p><span class="pill">'+esc(n.type)+'</span> '+(n.status?'<span class="pill">'+esc(n.status)+'</span> ':'')+'<code>'+esc(n.key)+'</code>'+(n.knownType?'':' <span style="color:var(--warn)">(unknown type)</span>')+'</p>';
    const fkeys=Object.keys(f).filter(k=>k!=='title').sort();
    if(fkeys.length) h+='<h3>Fields</h3>'+tbl(['field','value'],fkeys.map(k=>['<code>'+esc(k)+'</code>',Array.isArray(f[k])?f[k].map(esc).join(', '):esc(f[k])]));
    if(d.outgoing.length) h+='<h3>Links</h3>'+tbl(['relationship','target','type','resolved'],d.outgoing.map(e=>[
      esc(e.relationship),keyLink(e.key,e.title||e.key),esc(e.type||e.targetType),e.resolved?'<span class="y">✓</span>':'<span style="color:var(--err)">✗ unresolved</span>']));
    if(d.incoming.length) h+='<h3>Referenced by</h3>'+tbl(['from','type','relationship'],d.incoming.map(e=>[
      keyLink(e.key,e.title||e.key),esc(e.type),esc(e.relationship)]));
    h+='<h3>Body</h3><pre>'+esc(n.excerpt||'(no body)')+'</pre>';
    view.innerHTML=h;
  }catch(e){view.innerHTML='<button class="act sec" onclick="show(currentTab)">← back</button><pre>'+esc(e.message)+'</pre>';}
  return false;
}

async function refreshBadge(){
  try{const s=await j('/api/status');const v=s.validation;const b=document.getElementById('vbadge');
    b.textContent=v.errors+' errors · '+v.warnings+' warnings';
    b.className='badge '+(v.errors?'b-err':v.warnings?'b-warn':'b-ok');}catch(e){}
}

const renderers = {
  async dash(){
    const s=await j('/api/status');const r=s.requirements;
    view.innerHTML='<div class="cards">'+
      [['requirements',r.requirements],['implemented',r.implemented],['verified',r.verified],['traced',r.traced]]
      .map(([l,n])=>'<div class="card"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('')+'</div>'+
      '<h3>By type</h3>'+tbl(['type','count'],Object.keys(s.byType).sort().map(k=>['<code>'+esc(k)+'</code>',s.byType[k]]))+
      '<h3>By status</h3>'+tbl(['status','count'],Object.keys(s.byStatus).sort().map(k=>['<span class="pill">'+esc(k)+'</span>',s.byStatus[k]]));
  },
  async reqs(){
    const r=await j('/api/requirements');
    const tick=(b)=>b?'<span class="y">✓</span>':'<span class="muted">·</span>';
    let h='<p class="muted">'+r.summary.traced+' of '+r.summary.requirements+' requirements fully traced · grouped by area — click an area to expand, an id to read.</p>';
    h+=r.areas.map(g=>'<details><summary><b>'+esc(g.area)+'</b> — '+g.total+' requirement(s), '+g.traced+' traced</summary>'+
      tbl(['id','title','status','impl','verif','traced'], g.items.map(it=>[
        keyLink(it.key,it.id),esc(it.title),'<span class="pill">'+esc(it.status)+'</span>',
        tick(it.implemented),tick(it.verified),tick(it.traced)]))+'</details>').join('');
    view.innerHTML=h;
  },
  async arts(){
    const g=await j('/api/graph?body=none');
    view.innerHTML='<p class="muted">'+g.nodes.length+' artifacts. Click a key to read it.</p>'+
      tbl(['key','type','status'], g.nodes.map(n=>[keyLink(n.key),esc(n.type),'<span class="pill">'+esc(n.status||'')+'</span>']));
  },
  async mine(){
    const id=(new URLSearchParams(location.search)).get('as')||'you';
    const m=await j('/api/mine?as='+encodeURIComponent(id));
    view.innerHTML='<div class="row"><label>identity <input id="who" value="'+esc(m.identity)+'"></label>'+
      '<button class="act sec" onclick="location.search=\\'?as=\\'+encodeURIComponent(document.getElementById(\\'who\\').value)">view</button></div>'+
      '<h3>Owned ('+m.owned.length+')</h3>'+tbl(['key'],m.owned.map(k=>[keyLink(k)]))+
      '<h3>Assigned ('+m.assigned.length+')</h3>'+tbl(['key'],m.assigned.map(k=>[keyLink(k)]));
  },
  async author(){
    const types=(await j('/api/types')).filter(t=>!t.abstract).map(t=>t.name);
    view.innerHTML='<div class="row"><label>type <select id="atype">'+types.map(t=>'<option>'+esc(t)+'</option>').join('')+
      '</select></label><label>path <input id="apath" placeholder="/requirements/fr-0009.md" size="34"></label></div>'+
      '<div id="aform"></div><div class="row"><button class="act" id="asave">Create / Update</button></div><div id="aout"></div>';
    const renderForm=async()=>{
      const t=document.getElementById('atype').value;
      const tmpl=await j('/api/instructions/'+encodeURIComponent(t));
      let h='<h3>Fields</h3>';
      for(const f of (tmpl.fields||[])){
        if(f.name==='type') continue;
        const lbl=esc(f.name)+(f.required?' *':'');
        if(f.one_of) h+='<div class="row"><label>'+lbl+' <select data-f="'+esc(f.name)+'"><option value=""></option>'+f.one_of.map(o=>'<option>'+esc(o)+'</option>').join('')+'</select></label></div>';
        else h+='<div class="row"><label>'+lbl+' <input data-f="'+esc(f.name)+'" placeholder="'+esc(f.pattern||f.type||'')+'"></label></div>';
      }
      if((tmpl.links||[]).length){h+='<h3>Links (comma-separated targets)</h3>';
        for(const r of tmpl.links) h+='<div class="row"><label>'+esc(r.name)+' → '+esc(r.target)+' <input data-l="'+esc(r.name)+'" placeholder="/path/a.md, /path/b.md"></label></div>';}
      h+='<h3>Body</h3><textarea id="abody" rows="4" style="width:100%"></textarea>';
      document.getElementById('aform').innerHTML=h;
    };
    document.getElementById('atype').onchange=()=>renderForm().catch(e=>{document.getElementById('aform').innerHTML='<pre>'+esc(e.message)+'</pre>';});
    await renderForm();
    document.getElementById('asave').onclick=async()=>{
      const fields={},links={};
      document.querySelectorAll('[data-f]').forEach(el=>{if(el.value)fields[el.dataset.f]=el.value;});
      document.querySelectorAll('[data-l]').forEach(el=>{if(el.value.trim())links[el.dataset.l]=el.value.split(',').map(s=>s.trim()).filter(Boolean);});
      const req={path:document.getElementById('apath').value.trim(),type:document.getElementById('atype').value,fields,links,body:document.getElementById('abody').value};
      try{const r=await fetch('/api/author',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});const d=await r.json();
        document.getElementById('aout').innerHTML=r.ok?('<p class="y">'+esc(d.action)+' '+esc(d.path)+'</p><h3>Findings for this file</h3>'+
          (d.findings.length?tbl(['sev','rule','message'],d.findings.map(f=>[esc(f.severity),'<code>'+esc(f.rule)+'</code>',esc(f.message)])):'<p class="y">clean</p>')+
          '<h3>Diff</h3><pre>'+esc(d.diff||'(no diff / not a git repo)')+'</pre>'):'<pre>'+esc(d.error||'error')+'</pre>';
        refreshBadge();}catch(e){document.getElementById('aout').innerHTML='<pre>'+esc(e.message)+'</pre>';}
    };
  },
  async review(){
    const d=await (await fetch('/api/diff')).text();
    view.innerHTML='<h3>Working-tree diff (suggest-only — review then commit yourself)</h3><pre>'+(esc(d)||'(no changes)')+'</pre>'+
      '<div class="row"><input id="dpaths" placeholder="bundle-relative paths to discard, comma-separated" size="50">'+
      '<button class="act sec" id="ddo">Discard</button></div>'+
      '<h3>Simulate (predict validation impact of frontmatter ops, on HEAD)</h3>'+
      '<textarea id="sops" rows="3" style="width:100%" placeholder=\\'[{"op":"set-status","key":"/requirements/fr-0001.md","to":"deprecated"}]\\'></textarea>'+
      '<div class="row"><button class="act" id="sdo">Simulate</button></div><div id="sout"></div>';
    document.getElementById('ddo').onclick=async()=>{
      const paths=document.getElementById('dpaths').value.split(',').map(s=>s.trim()).filter(Boolean);
      const r=await fetch('/api/discard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paths})});
      await r.json();refreshBadge();show('review');
    };
    document.getElementById('sdo').onclick=async()=>{
      try{const ops=JSON.parse(document.getElementById('sops').value);
        const r=await fetch('/api/simulate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ops})});const s=await r.json();
        document.getElementById('sout').innerHTML=r.ok?('<p>error delta: <b>'+s.errorDelta+'</b> · exit '+s.exitBefore+'→'+s.exitAfter+' · traced '+s.tracedBefore+'→'+s.tracedAfter+'</p>'+
          '<h3>New findings</h3>'+(s.newFindings.length?tbl(['rule','message'],s.newFindings.map(f=>['<code>'+esc(f.rule)+'</code>',esc(f.message)])):'<p class="muted">none</p>')+
          '<h3>Resolved</h3>'+(s.resolvedFindings.length?tbl(['rule','message'],s.resolvedFindings.map(f=>['<code>'+esc(f.rule)+'</code>',esc(f.message)])):'<p class="muted">none</p>')):'<pre>'+esc(s.error)+'</pre>';
      }catch(e){document.getElementById('sout').innerHTML='<pre>'+esc(e.message)+'</pre>';}
    };
  },
  async operate(){
    view.innerHTML='<div class="row">'+['validate','test','check'].map(o=>'<button class="act" data-op="'+o+'">'+o+'</button>').join('')+'</div><pre id="oout">pick an operation…</pre>';
    document.querySelectorAll('[data-op]').forEach(b=>b.onclick=async()=>{
      document.getElementById('oout').textContent='running '+b.dataset.op+'…';
      const r=await fetch('/api/operate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:b.dataset.op})});
      const d=await r.json();document.getElementById('oout').textContent='exit '+(d.exit??'?')+'\\n\\n'+(d.output||d.error||'');refreshBadge();
    });
  },
  async agent(){
    const pf=await j('/api/agent/preflight');
    let h='<p class="muted">harness: <code>'+esc(pf.message)+'</code></p>';
    h+='<div class="row"><label>skill <input id="askill" placeholder="ibuild-author (optional)"></label></div>'+
       '<textarea id="aintent" rows="3" style="width:100%" placeholder="describe the change you want the agent to make"></textarea>'+
       '<div class="row"><button class="act" id="arun"'+(pf.available?'':' disabled')+'>Run agent (suggest-only)</button></div>'+
       '<h3>Result</h3><pre id="ares">—</pre><h3>Live log</h3><pre id="alog"></pre>';
    view.innerHTML=h;
    const run=document.getElementById('arun'); if(run) run.onclick=async()=>{
      document.getElementById('alog').textContent='';document.getElementById('ares').textContent='running…';
      const req={intent:document.getElementById('aintent').value,skill:document.getElementById('askill').value.trim()||undefined};
      const r=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)});
      const d=await r.json();document.getElementById('ares').textContent=r.ok?('ok='+d.ok+' exit='+d.exit+' errors '+d.errorsBefore+'→'+d.errorsAfter+'\\nchanged: '+(d.changedFiles||[]).join(', ')):(d.error||'error');refreshBadge();
    };
  },
  async work(){
    const ws=await j('/api/workspaces');
    view.innerHTML='<p class="muted">'+ws.length+' git worktree(s).</p>'+
      tbl(['path','branch','head','validation'],ws.map(w=>['<code>'+esc(w.path)+'</code>',esc(w.branch),'<code>'+esc(w.head)+'</code>',
        w.errors==null?'<span class="muted">n/a</span>':(w.errors?'<span style="color:var(--err)">'+w.errors+' err</span>':'<span class="y">clean</span>')]));
  },
  async plan(){
    const b=await j('/api/board');
    const ORDER=['proposed','todo','backlog','open','triaged','in_progress','active','blocked','in_review','review','fixed','done','resolved','verified','closed','archived','cancelled','wont_fix'];
    const cols={};b.items.forEach(it=>{(cols[it.status]=cols[it.status]||[]).push(it);});
    const sts=Object.keys(cols).sort((a,c)=>{const ia=ORDER.indexOf(a),ic=ORDER.indexOf(c);return (ia<0?999:ia)-(ic<0?999:ic)||(a<c?-1:1);});
    view.innerHTML='<p class="muted">'+b.total+' work items · click a card to open it.</p><div class="kanban">'+
      sts.map(st=>'<div class="kcol"><h4><span>'+esc(st)+'</span><span class="pill">'+cols[st].length+'</span></h4>'+
        cols[st].map(it=>'<div class="kcard"><div class="kt">'+keyLink(it.key,it.title||it.key)+'</div>'+
          '<div class="km"><span class="pill">'+esc(it.type)+'</span> '+esc(it.owner||'')+'</div></div>').join('')+
        '</div>').join('')+'</div>';
  },
  async team(){
    const t=await j('/api/team');
    view.innerHTML='<h3>Owners</h3>'+tbl(['owner','total','done','open'],t.owners.map(o=>[esc(o.owner),o.total,o.done,o.open]))+
      '<h3>Assigned</h3>'+(t.assigned.length?tbl(['actor','count'],t.assigned.map(a=>['<code>'+esc(a.actor)+'</code>',a.count])):'<p class="muted">no assignee links yet</p>');
  },
};

function show(id){
  currentTab=id;
  [...nav.children].forEach(b=>b.classList.toggle('on',b.dataset.t===id));
  view.innerHTML='<p class="muted">loading…</p>';
  (renderers[id]||(async()=>{view.innerHTML='<p class="muted">tab not yet wired.</p>';}))().catch(e=>{view.innerHTML='<pre>'+esc(e.message)+'</pre>';});
}
TABS.forEach(([id,label])=>{const b=document.createElement('button');b.textContent=label;b.dataset.t=id;b.onclick=()=>show(id);nav.appendChild(b);});

// live validation badge + agent log via SSE
try{const ev=new EventSource('/api/events');
  ['graph','validate','author.done','agent.done'].forEach(n=>ev.addEventListener(n,refreshBadge));
  ev.addEventListener('agent.log',e=>{const el=document.getElementById('alog'); if(el) el.textContent+=(e.data||'').replace(/\\\\n/g,'\\n')+'\\n';});
}catch(e){}

refreshBadge(); show('dash');
</script>
</body></html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
