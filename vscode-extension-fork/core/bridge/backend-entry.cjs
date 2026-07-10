// core/bridge/backend-entry.cjs
// Entry point for VS Code extension mode.
// Reads JSON-RPC from stdin, processes via Quantum agent, sends actions to stdout.
// Usage: node core/bridge/backend-entry.cjs

const { initState, reduceState } = require('../agent/state.cjs');
const vscodeAdapter = require('../agent/vscode-adapter.cjs');
const { askCloudTools } = require('../agent/cloud.cjs');
const { SELF_TOOLS, runSelfTool } = require('../agent/tools.cjs');

const rl = require('readline').createInterface({ input: process.stdin, terminal: false });

let state = null;
let step = 0;

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);
    await handleMessage(msg);
  } catch (err) {
    send({ jsonrpc: '2.0', error: { message: err.message }, id: null });
  }
});

async function handleMessage(msg) {
  switch (msg.method) {
    case 'init': {
      state = initState({ runId: msg.params.runId, history: msg.params.history, cloud: msg.params.cloud });
      state.messages.unshift({ role: 'system', content: msg.params.systemPrompt || '' });
      send({ jsonrpc: '2.0', result: { ok: true }, id: msg.id });
      break;
    }
    case 'input': {
      if (!state) return send({ jsonrpc: '2.0', error: { message: 'not initialized' }, id: msg.id });
      state.messages.push({ role: 'user', content: msg.params.text });

      const tools = vscodeAdapter.patchConfig({ tools: SELF_TOOLS }).tools;
      const llmMsg = await askCloudTools(state.cloud, state.messages, tools);
      state.messages.push(llmMsg);

      // Check for tool calls
      const calls = llmMsg?.tool_calls || [];
      for (const call of calls) {
        const action = await runSelfTool(call.function.name, JSON.parse(call.function.arguments || '{}'));
        if (action && action.action) {
          // Send action to extension for execution
          send({
            jsonrpc: '2.0',
            method: 'action',
            params: { ...action.action, id: call.id },
            id: msg.id,
          });
          // Wait for result (handled by next message)
          return;
        }
        state.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(action) });
      }

      // If no action, send response back
      if (!calls.length) {
        send({ jsonrpc: '2.0', method: 'response', params: { text: llmMsg.content }, id: msg.id });
      }
      break;
    }
    case 'actionResult': {
      // Tool action result from extension
      state.messages.push({
        role: 'tool',
        tool_call_id: msg.params.actionId,
        content: JSON.stringify(msg.params.result),
      });
      // Continue agent loop (ask LLM again with tool result)
      const tools = vscodeAdapter.patchConfig({ tools: SELF_TOOLS }).tools;
      const llmMsg = await askCloudTools(state.cloud, state.messages, tools);
      state.messages.push(llmMsg);
      // Check for more tool calls or done
      const calls = llmMsg?.tool_calls || [];
      for (const call of calls) {
        const action = await runSelfTool(call.function.name, JSON.parse(call.function.arguments || '{}'));
        if (action && action.action) {
          send({
            jsonrpc: '2.0',
            method: 'action',
            params: { ...action.action, id: call.id },
            id: msg.id,
          });
          return;
        }
        state.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(action) });
      }
      if (!calls.length) {
        send({ jsonrpc: '2.0', method: 'response', params: { text: llmMsg.content }, id: msg.id });
      }
      break;
    }
    default:
      send({ jsonrpc: '2.0', error: { message: 'unknown method: ' + msg.method }, id: msg.id });
  }
}
