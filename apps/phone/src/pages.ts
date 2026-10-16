/**
 * The three pages of the phone bridge, as plain responsive HTML with one inline script each (allowed only by the response's own
 * nonce). Server text is only ever inserted with `textContent`, never as markup. Nothing is pre-filled, auto-sent or auto-confirmed:
 * the example setting documents are format guides that go nowhere until the person edits and sends them.
 */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const STYLE = `
:root{color-scheme:light dark;--bg:#fbfaf7;--fg:#1f1d1a;--mut:#6b655c;--card:#fff;--line:#d9d3c7;--acc:#7a3b1e;--ask:#fff4d6;--you:#e4efe4}
@media (prefers-color-scheme:dark){:root{--bg:#161411;--fg:#eee8dc;--mut:#a39a8a;--card:#1f1c18;--line:#3a352d;--acc:#e0a070;--ask:#3a3217;--you:#1f3322}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif}
main{max-width:46rem;margin:0 auto;padding:12px 16px 96px}
h1{font-size:1.05rem;margin:8px 0}small,.mut{color:var(--mut)}
button,select,input,textarea{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
button{background:var(--acc);color:#fff;border-color:var(--acc);min-height:44px}button.sec{background:var(--card);color:var(--fg);border-color:var(--line)}
button:disabled{opacity:.5}textarea{width:100%;min-height:7rem;font-family:ui-monospace,monospace;font-size:.9rem}input,select{width:100%}
#log{display:flex;flex-direction:column;gap:6px;margin:10px 0}.b{white-space:pre-wrap;word-break:break-word;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--card)}
.b.ask{background:var(--ask)}.b.reply{background:var(--you);align-self:flex-end;max-width:90%}.b.system{font-style:italic;color:var(--mut)}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--line);padding:10px 16px}.bar .in{max-width:46rem;margin:0 auto;display:flex;gap:8px}
.bar textarea{min-height:44px;height:44px;flex:1}details{border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:8px 0;background:var(--card)}label{display:block;margin:8px 0 2px;font-size:.9rem}
.row{display:flex;gap:8px;flex-wrap:wrap}.row>*{flex:1}.warn{border-left:4px solid var(--acc);padding:6px 10px;background:var(--card);margin:8px 0}
`;

const SHELL = (title: string, nonce: string, body: string, script: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}` +
  `<script nonce="${nonce}">${script}</script></body></html>`;

const COMMON_JS = `
const $=(i)=>document.getElementById(i);
const csrf=document.querySelector('meta[name=csrf]')?.content||'';
async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-immortalis-csrf':csrf},body:JSON.stringify(body),credentials:'same-origin'});let j={};try{j=await r.json()}catch{}return{status:r.status,body:j}}
function addLine(l){const d=document.createElement('div');d.className='b '+l.kind;d.textContent=l.text;$('log').appendChild(d);d.scrollIntoView({block:'end'})}
let after=0,pending=null,runningLabel='';
async function loop(base){for(;;){try{const r=await fetch(base+'/poll?after='+after,{credentials:'same-origin'});if(r.status===401||r.status===403){location.href='/';return}
const s=await r.json();for(const l of s.lines||[]){addLine(l);after=Math.max(after,l.seq)}after=Math.max(after,s.seq||0);pending=s.pending||null;
$('state').textContent=s.running?('running: '+(s.label||'')):'idle';$('send').disabled=!pending;$('reply').disabled=!pending;
$('prompt').textContent=pending?pending.prompt:'';$('prompt').hidden=!pending;if(pending)$('reply').focus();
if(typeof onState==='function')onState(s)}catch{await new Promise(r=>setTimeout(r,3000))}}}
async function sendReply(base){if(!pending)return;const t=$('reply').value;const r=await post(base+'/reply',{prompt_id:pending.id,text:t});if(r.status===200)$('reply').value='';else addLine({kind:'system',text:r.body.error||'not accepted'})}
async function stopRun(base){await post(base+'/stop',{})}
async function logout(){await post('/api/logout',{});location.href='/'}
`;

export function landingPage(nonce: string): string {
  const body = `<main><h1>IMMORTALIS — out-of-character test front end</h1>
<p class="warn">This is a development instrument, not the game's finished interface. Sign in to <b>one</b> lane. The player lane and the referee lane use different secrets and cannot see each other.</p>
<label for="role">Lane</label><select id="role"><option value="player">Player (your choices and typed confirmations)</option><option value="referee">Referee / game master (private readings)</option></select>
<label for="token">Secret for this lane</label><input id="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
<p><button id="go">Sign in</button></p><p id="msg" class="mut"></p></main>`;
  const script = `const $=(i)=>document.getElementById(i);$('go').onclick=async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({role:$('role').value,token:$('token').value})});const j=await r.json().catch(()=>({}));$('token').value='';if(r.status===200)location.href=j.next;else $('msg').textContent=j.error||'not signed in'}`;
  return SHELL("IMMORTALIS", nonce, body, script);
}

export interface PageData {
  readonly commands: Readonly<
    Record<
      string,
      {
        readonly options: Readonly<Record<string, string>>;
        readonly optional?: readonly string[];
        readonly setup?: true;
      }
    >
  >;
  readonly hosts: readonly string[];
}

const EXAMPLES: Record<string, string> = {
  "initialize-time": JSON.stringify(
    {
      format: "immortalis-starting-chronology",
      format_version: 1,
      time: { unit: "REPLACE-UNIT", value: 1 },
      statement: "REPLACE with your own words",
    },
    null,
    2,
  ),
  "declare-closed-setting": JSON.stringify(
    {
      format: "immortalis-closed-setting-declaration",
      format_version: 1,
      world_id: "REPLACE",
      locus_id: "REPLACE",
      domain: { designation: "REPLACE", topology: "REPLACE" },
      closure: { statement: "REPLACE" },
      source_rights: [{ source_key: "REPLACE", ground: "REPLACE" }],
      workforce_scope: { statement: "REPLACE" },
    },
    null,
    2,
  ),
  "establish-locality": JSON.stringify(
    {
      format: "immortalis-original-locality-setup",
      format_version: 1,
      world: {
        world_id: "REPLACE",
        premise: "REPLACE with your own invented place",
        reference_causal_basis: { mode: "ORIGINAL", established_canon: "REPLACE" },
        material_world_law_departures: [],
        insertion_supporting_constraints: [],
      },
      locus: { world_id: "REPLACE", locus_id: "REPLACE", designation: "REPLACE", constraints: [] },
      source: {
        source_key: "REPLACE",
        world_id: "REPLACE",
        locus_id: "REPLACE",
        dimension: "REPLACE",
        material_class: "REPLACE",
        quantity: { amount: 1, unit: "REPLACE" },
        access_facts: [{ aspect: "REPLACE", statement: "REPLACE" }],
        statement: "REPLACE",
      },
    },
    null,
    2,
  ),
};

export function playerPage(nonce: string, csrf: string, data: PageData): string {
  const body = `<meta name="csrf" content="${esc(csrf)}"><main>
<h1>Player <small id="state" class="mut">idle</small></h1>
<p class="mut">Out of character. Every confirmation is a line <b>you</b> type in reply to a prompt; nothing here answers for you.</p>
<details id="cmd"><summary>Choose a command</summary>
<label for="command">Command</label><select id="command"></select><div id="fields"></div>
<div id="setupbox" hidden><label for="setup">Your setting document (JSON). The example is only a format guide.</label><textarea id="setup" spellcheck="false"></textarea><p><button class="sec" id="example" type="button">Show format example</button></p></div>
<div class="row"><button id="run">Run</button><button class="sec" id="stop">Stop</button></div></details>
<div id="log"></div><div id="prompt" class="b ask" hidden></div>
<p><button class="sec" id="out">Sign out</button></p></main>
<div class="bar"><div class="in"><textarea id="reply" placeholder="Type your reply to the prompt" disabled></textarea><button id="send" disabled>Send</button></div></div>`;
  const script =
    COMMON_JS +
    `const CMDS=${JSON.stringify(data.commands).replace(/</g, "\\u003c")};const EX=${JSON.stringify(EXAMPLES).replace(/</g, "\\u003c")};
const sel=$('command');for(const c of Object.keys(CMDS)){const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o)}
function draw(){const c=CMDS[sel.value];const f=$('fields');f.textContent='';for(const [k,kind] of Object.entries(c.options)){const l=document.createElement('label');l.textContent=k+((c.optional||[]).includes(k)?' (optional)':'');const i=document.createElement('input');i.id='o_'+k;i.autocomplete='off';i.autocapitalize='off';if(kind==='int')i.inputMode='numeric';f.appendChild(l);f.appendChild(i)}$('setupbox').hidden=!c.setup}
sel.onchange=draw;draw();
$('example').onclick=()=>{$('setup').value=EX[sel.value]||''};
$('run').onclick=async()=>{const c=CMDS[sel.value];const options={};for(const k of Object.keys(c.options)){const v=$('o_'+k).value.trim();if(v!=='')options[k]=v}const r=await post('/api/play/command',{command:sel.value,options,setup:c.setup?$('setup').value:undefined});if(r.status!==200)addLine({kind:'system',text:r.body.error||'not started'});else $('cmd').open=false};
$('send').onclick=()=>sendReply('/api/play');$('stop').onclick=()=>stopRun('/api/play');$('out').onclick=logout;
$('run').disabled=false;function onState(s){$('run').disabled=!!s.running}
loop('/api/play');`;
  return SHELL("IMMORTALIS — player", nonce, body, script);
}

export function refereePage(nonce: string, csrf: string, data: PageData): string {
  const body = `<meta name="csrf" content="${esc(csrf)}"><main>
<h1>Referee / game master <small id="state" class="mut">idle</small></h1>
<p class="warn">Private GM context. You read each bound question and give <b>your own</b> reading as one JSON object. No answer is supplied for you, and a ruling relayed from anywhere else reaches the engine only if you type it here.</p>
<label for="host">Bound referee host</label><select id="host"></select>
<div class="row"><button id="start">Open console</button><button class="sec" id="stop">Close</button></div>
<div id="log"></div><div id="prompt" class="b ask" hidden></div>
<p><button class="sec" id="out">Sign out</button></p></main>
<div class="bar"><div class="in"><textarea id="reply" placeholder="Type a task_id, list, quit — or your answer as one JSON object, or skip" disabled></textarea><button id="send" disabled>Send</button></div></div>`;
  const script =
    COMMON_JS +
    `const HOSTS=${JSON.stringify(data.hosts).replace(/</g, "\\u003c")};const hs=$('host');for(const h of HOSTS){const o=document.createElement('option');o.value=h;o.textContent=h;hs.appendChild(o)}
$('start').onclick=async()=>{const r=await post('/api/ref/start',{host_id:hs.value});if(r.status!==200)addLine({kind:'system',text:r.body.error||'not started'})};
$('send').onclick=()=>sendReply('/api/ref');$('stop').onclick=()=>stopRun('/api/ref');$('out').onclick=logout;
function onState(s){$('start').disabled=!!s.running}
loop('/api/ref');`;
  return SHELL("IMMORTALIS — referee", nonce, body, script);
}
