// Claude bridge — acts as OpenAI-compatible API, relays via files
// Quantum -> POST /chat/completions -> write bridge/pending.json -> wait -> read bridge/response.txt -> SSE back
import { serve } from 'bun';
import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIR = join(ROOT, 'bridge');
const PENDING = join(DIR, 'pending.json');
const RESPONSE = join(DIR, 'response.txt');
const PORT = 8085;

mkdirSync(DIR, { recursive: true });

function sse(reply) {
  const chunk = JSON.stringify({
    id: 'chatcmpl-bridge-' + Date.now(),
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: reply }, finish_reason: null }]
  });
  const done = JSON.stringify({
    id: 'chatcmpl-bridge-end',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
  });
  return new TextEncoder().encode(`data: ${chunk}\n\ndata: ${done}\n\ndata: [DONE]\n\n`);
}

serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
      const body = await req.json().catch(() => ({}));
      const msgs = body.messages || [];
      const lastUser = [...msgs].reverse().find(m => m.role === 'user');
      const prompt = typeof lastUser?.content === 'string' ? lastUser.content
        : Array.isArray(lastUser?.content) ? lastUser.content.map(c => c.text || '').join('') : '';

      // clean up stale files
      try { if (existsSync(RESPONSE)) unlinkSync(RESPONSE); } catch {}
      writeFileSync(PENDING, JSON.stringify({ prompt, messages: msgs, ts: Date.now() }, null, 2));

      // wait up to 120s for Claude to write a response
      const deadline = Date.now() + 600000;
      while (Date.now() < deadline) {
        if (existsSync(RESPONSE)) {
          const reply = readFileSync(RESPONSE, 'utf8').trim();
          try { unlinkSync(RESPONSE); } catch {}
          try { unlinkSync(PENDING); } catch {}
          return new Response(sse(reply), {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
          });
        }
        await new Promise(r => setTimeout(r, 400));
      }
      try { unlinkSync(PENDING); } catch {}
      return new Response('data: {"error":"timeout"}\n\n', { status: 504, headers: { 'Content-Type': 'text/event-stream' } });
    }

    return new Response('Claude bridge OK', { status: 200 });
  }
});

console.log(`[bridge] Claude bridge listening on http://127.0.0.1:${PORT}`);
console.log(`[bridge] Waiting for prompts in ${PENDING}`);
