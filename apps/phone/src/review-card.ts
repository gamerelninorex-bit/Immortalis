/** Portable MCP Apps component. No secret or campaign data occurs in this static resource. */
export const REVIEW_URI = "ui://immortalis/review-v1.html";
export const REVIEW_MIME = "text/html;profile=mcp-app";
export const REVIEW_CALLBACK = "submit_review_decision";
export const REVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:16px system-ui;margin:1rem;color:CanvasText;background:Canvas}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}button{font:inherit;padding:.6rem 1rem;margin:.3rem}#status{min-height:1.5em}fieldset{border:0;padding:0}h1{font-size:1.2rem}
</style></head><body><h1 id="title">IMMORTALIS review</h1><pre id="material"></pre><fieldset id="controls" disabled><button id="accept">Accept</button><button id="revise">Revise</button><button id="decline">Decline</button></fieldset><p id="status" role="status">Waiting for the complete review.</p><script>
(() => {
  let sequence = 0, review = null, busy = false, ready = false;
  const pending = new Map();
  const title = document.getElementById('title'), material = document.getElementById('material'), controls = document.getElementById('controls'), status = document.getElementById('status');
  const send = (method, params) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, {resolve,reject}); parent.postMessage({jsonrpc:'2.0',id,method,params},'*'); });
  const render = result => {
    const next = result && result._meta && result._meta.review;
    if (!next || typeof next.capability !== 'string' || typeof next.digest !== 'string' || typeof next.material !== 'string' || !['setting','generation'].includes(next.category)) return;
    review = next; busy = false; title.textContent = next.category === 'setting' ? 'Review the setting' : 'Review your character';
    material.textContent = next.material; controls.disabled = !ready; status.textContent = 'Read the complete proposal, then accept, revise or decline.';
  };
  addEventListener('message', event => {
    if (event.source !== parent) return;
    const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
    if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); return; }
    if (m.method === 'ui/notifications/tool-result') render(m.params);
  });
  const decide = async (event, decision) => {
    if (!event.isTrusted || !ready || busy || !review) return;
    busy = true; controls.disabled = true;
    try {
      const result = await send('tools/call', {name:'submit_review_decision',arguments:{proposal_id:review.proposal_id,digest:review.digest,capability:review.capability,decision}});
      if (result.isError) {status.textContent = 'This review is no longer current. Ask to resume the same proposal.';return;}
      review = null; status.textContent = decision === 'accept' ? 'Accepted. The engine is continuing.' : decision === 'revise' ? 'Tell the conversation what you want to change.' : 'Declined. Nothing new was accepted.';
      if (decision === 'revise') await send('ui/message',{role:'user',content:[{type:'text',text:'I want to revise this proposal.'}]});
    } catch { status.textContent = 'The outcome is uncertain. Ask to reconcile the same proposal.'; }
  };
  document.getElementById('accept').addEventListener('click', e => decide(e,'accept'));
  document.getElementById('revise').addEventListener('click', e => decide(e,'revise'));
  document.getElementById('decline').addEventListener('click', e => decide(e,'decline'));
  send('ui/initialize',{appInfo:{name:'immortalis-review',version:'1'},appCapabilities:{},protocolVersion:'2026-01-26'}).then(() => {ready = true; controls.disabled = !review; parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');}).catch(() => {status.textContent='In-chat review is unavailable in this client.';});
})();
</script></body></html>`;
