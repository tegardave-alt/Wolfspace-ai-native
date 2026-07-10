// Generator script — writes webviewProvider.ts
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, '..', 'quantum-vscode', 'src', 'webviewProvider.ts');

const content = `import * as vscode from 'vscode';
import { QuantumBridgeClient, VSCodeAction } from './bridgeClient';

export class QuantumChatProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private backendPort: number;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly bridge: QuantumBridgeClient,
    backendPort: number
  ) {
    this.backendPort = backendPort;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch ((msg as any).type) {
        case 'vscode-action':
          const result = await this.bridge.executeAction((msg as any).action as VSCodeAction);
          webviewView.webview.postMessage({ type: 'result', id: (msg as any).action.type, result });
          break;
      }
    });
  }

  private getHtml(): string {
    const port = this.backendPort;
    return \`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quantum</title>
<style>
  :root { --bg:#0d1117; --panel:#161b22; --border:#30363d; --txt:#e6edf3; --dim:#8b949e; --accent:#2f81f7; --user:#1f6feb22; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); height:100vh; display:flex; flex-direction:column; font-size:13px; }
  header { display:flex; gap:8px; align-items:center; padding:8px 12px; background:var(--panel); border-bottom:1px solid var(--border); flex-shrink:0; }
  header h1 { font-size:14px; margin:0; font-weight:600; }
  #status { font-size:11px; color:var(--dim); margin-left:auto; }
  button { background:#21262d; color:var(--txt); border:1px solid var(--border); border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  #chat { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
  .msg { max-width:1100px; width:fit-content; padding:8px 12px; border-radius:8px; white-space:pre-wrap; word-break:break-word; line-height:1.4; font-size:13px; }
  .user { background:var(--user); border:1px solid #1f6feb55; align-self:flex-end; max-width:85%; }
  .bot  { background:var(--panel); border:1px solid var(--border); align-self:stretch; width:100%; }
  .bot pre, .user pre { background:#0d1117; border:1px solid var(--border); border-radius:4px; padding:8px; overflow-x:auto; margin:6px 0; font-size:12px; }
  .role { font-size:10px; color:var(--dim); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em; }
  footer { display:flex; gap:6px; padding:8px 12px; background:var(--panel); border-top:1px solid var(--border); flex-shrink:0; }
  #input { flex:1; resize:none; background:#0d1117; color:var(--txt); border:1px solid var(--border); border-radius:6px; padding:8px 10px; font-size:13px; font-family:inherit; height:60px; min-height:40px; max-height:160px; line-height:1.4; }
  #input:focus { outline:none; border-color:var(--accent); }
  #send { padding:0 16px; background:var(--accent); border:none; font-weight:600; min-width:72px; font-size:13px; cursor:pointer; border-radius:6px; }
  #send:hover { background:#388bfd; }
  #send:disabled { opacity:.5; cursor:wait; }
  .caret { display:inline-block; width:6px; height:13px; background:var(--accent); margin-left:2px; vertical-align:text-bottom; animation:blink 1s step-end infinite; }
  @keyframes blink { 50%{ opacity:0; } }
  .typing { display:inline-flex; gap:4px; align-items:center; padding:3px 0; }
  .typing span { width:6px; height:6px; border-radius:50%; background:var(--dim); animation:tdot 1.2s infinite ease-in-out; }
  .typing span:nth-child(2){ animation-delay:.18s; }
  .typing span:nth-child(3){ animation-delay:.36s; }
  @keyframes tdot { 0%,80%,100%{ opacity:.25; transform:translateY(0);} 40%{ opacity:1; transform:translateY(-4px);} }
  .cb { margin:6px 0; }
  .cb pre { margin:0; border-bottom-left-radius:0; border-bottom-right-radius:0; }
  .cbbar { display:flex; align-items:center; gap:6px; background:#0d1117; border:1px solid var(--border); border-top:none; border-radius:0 0 4px 4px; padding:4px 6px; }
  .runbtn { background:#238636; border:none; color:#fff; font-weight:600; font-size:11px; padding:2px 10px; border-radius:4px; cursor:pointer; }
  .runbtn:hover { background:#2ea043; }
  .runbtn:disabled { opacity:.6; cursor:wait; }
  .copybtn { background:#21262d; border:1px solid var(--border); color:var(--dim); font-size:11px; padding:2px 8px; border-radius:4px; cursor:pointer; }
  .copybtn:hover { color:var(--txt); border-color:var(--accent); }
  .runout { margin-top:4px; border-radius:4px; overflow:hidden; border:1px solid var(--border); }
  .runhdr { font-size:11px; font-weight:600; padding:4px 8px; }
  .okrun { background:#1a3a1a; color:#3fb950; }
  .errrun { background:#3a1a1a; color:#f85149; }
  .runout pre.ro { margin:0; border:none; border-radius:0; background:#0d1117; font-size:12px; padding:6px 8px; }
  .rodim { padding:4px 8px; font-size:11px; color:var(--dim); background:#0d1117; }
  .md-h { margin:8px 0 3px; font-weight:600; }
  .md-p { margin:0; }
  code { background:#0d1117; border:1px solid var(--border); border-radius:3px; padding:1px 4px; font-size:12px; }
  a { color:var(--accent); }
</style>
</head>
<body>
<header>
  <h1>⚛️ Quantum</h1>
  <span id="status">ready</span>
</header>
<div id="chat"></div>
<footer>
  <textarea id="input" rows="2" placeholder="Tanya atau minta bantuan kode\u2026"></textarea>
  <button id="send">Kirim</button>
</footer>

<script>
const API = 'http://localhost:' + port;
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');
const vscode = acquireVsCodeApi();
let history = [];
let busy = false;
let stick = true;

chat.addEventListener('scroll', function(){ stick = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40; });
function scrollIfStick(){ if(stick) chat.scrollTop = chat.scrollHeight; }

function esc(s){ return s.replace(/[&<>]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); }
function b64enc(s){ return btoa(unescape(encodeURIComponent(s))); }
function b64dec(s){ return decodeURIComponent(escape(atob(s))); }

function render(text){
  var out = ''; var last = 0; var re = /\x60\x60\x60(\\w*)\\n?([\\s\\S]*?)\x60\x60\x60/g; var m;
  while((m = re.exec(text))){
    out += '<div>' + esc(text.slice(last, m.index)) + '</div>';
    var lang = (m[1]||'').toLowerCase();
    var code = m[2].replace(/\\n$/,'');
    out += '<div class="cb" data-lang="'+lang+'" data-code="'+b64enc(code)+'">'+
           '<pre>'+esc(code)+'</pre>'+
           '<div class="cbbar"><button class="runbtn">\u25b6 Run</button>'+
           '<button class="copybtn" data-copy="'+b64enc(code)+'">\u29c9 Copy</button></div>'+
           '<div class="runout" style="display:none"></div></div>';
    last = re.lastIndex;
  }
  out += '<div>' + esc(text.slice(last)) + '</div>';
  return out;
}

function addMsg(role, text){
  var div = document.createElement('div');
  div.className = 'msg ' + (role==='user'?'user':'bot');
  div.innerHTML = '<div class="role">'+(role==='user'?'Anda':'Quantum')+'</div><div class="body">'+render(text)+'</div>';
  chat.appendChild(div);
  scrollIfStick();
  return div.querySelector('.body');
}

async function send(){
  var text = input.value.trim();
  if(!text || busy) return;
  input.value = '';
  busy = true; sendBtn.disabled = true; statusEl.textContent = 'memproses\u2026';
  addMsg('user', text);
  history.push({ role: 'user', content: text });
  var bodyEl = addMsg('assistant', '');
  try{
    var r = await fetch(API + '/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ history: history }) });
    if(!r.ok) throw new Error('HTTP '+r.status);
    var j = await r.json();
    var acc = j.reply || j.text || JSON.stringify(j);
    bodyEl.innerHTML = render(acc);
    history.push({ role: 'assistant', content: acc });
    statusEl.textContent = 'ready';
  } catch(e) {
    bodyEl.innerHTML = '<div style="color:#f85149">Error: '+esc(e.message)+'</div>';
    statusEl.textContent = 'error';
  }
  busy = false; sendBtn.disabled = false; input.focus();
  scrollIfStick();
  chat.querySelectorAll('.copybtn').forEach(function(btn) {
    btn.onclick = async function() {
      try{ await navigator.clipboard.writeText(b64dec(btn.dataset.copy));
        var o=btn.textContent; btn.textContent='\u2713'; setTimeout(function(){btn.textContent=o;},1000); }catch(e){}
    };
  });
  chat.querySelectorAll('.runbtn').forEach(function(btn) {
    btn.onclick = async function() {
      var cb = btn.closest('.cb');
      var code = b64dec(cb.dataset.code);
      var out = cb.querySelector('.runout'); out.style.display='block';
      out.innerHTML = '<div class="rodim">\u23f3 running\u2026</div>';
      btn.disabled = true;
      try{
        var r = await fetch(API + '/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ language: cb.dataset.lang, code: code }) });
        var j = await r.json();
        var ok = j.ok;
        var html = '<div class="runhdr '+(ok?'okrun':'errrun')+'">'+(ok?'\u2713 ran':'✗ error')+'</div>';
        if(j.output) html += '<pre class="ro">'+esc(j.output)+'</pre>';
        if(j.error) html += '<pre class="ro err">'+esc(j.error)+'</pre>';
        out.innerHTML = html;
      } catch(e) {
        out.innerHTML = '<div class="runhdr errrun">Error: '+esc(e.message)+'</div>';
      }
      btn.disabled = false;
    };
  });
}

sendBtn.onclick = send;
input.addEventListener('keydown', function(e) { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } });
input.focus();
<\/script>
</body>
</html>\`;
  }
}
`;

fs.writeFileSync(target, content, 'utf8');
console.log('OK: ' + target);
