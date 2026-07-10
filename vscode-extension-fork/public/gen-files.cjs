const fs = require('fs');
const path = require('path');

// ── extension.ts ──
const extContent = `import * as vscode from 'vscode';
import { QuantumBridgeClient } from './bridgeClient';
import { QuantumChatProvider } from './webviewProvider';
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';

let serverProcess: ChildProcess;
let bridgeProcess: ChildProcess;
let bridgeClient: QuantumBridgeClient;

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url: string, maxAttempts = 15): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      fetch(url + '/models')
        .then((r) => { if (r.ok) resolve(); else retry(); })
        .catch(() => retry());
    };
    function retry() {
      if (attempts >= maxAttempts) reject(new Error('Server not ready'));
      else setTimeout(check, 500);
    }
    check();
  });
}

export async function activate(context: vscode.ExtensionContext) {
  const port = await getFreePort();

  serverProcess = spawn('node', ['server.cjs'], {
    cwd: context.asAbsolutePath('.'),
    env: { ...process.env, PORT: String(port), QUANTUM_MODE: 'extension' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    console.error('[Quantum]', chunk.toString());
  });
  serverProcess.stdout?.on('data', (chunk: Buffer) => {
    console.log('[Quantum]', chunk.toString().trim());
  });

  bridgeProcess = spawn('node', [context.asAbsolutePath('core/bridge/backend-entry.cjs')], {
    cwd: context.asAbsolutePath('.'),
    env: { ...process.env, QUANTUM_MODE: 'extension' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  bridgeClient = new QuantumBridgeClient(bridgeProcess);

  try {
    await waitForServer('http://localhost:' + port);
  } catch (e) {
    vscode.window.showErrorMessage('Quantum server failed to start');
  }

  const provider = new QuantumChatProvider(context.extensionUri, bridgeClient, port);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('quantum.chat', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('quantum.send', (input: string) => {
      bridgeClient.sendAction({ type: 'runCommand', params: { command: input } });
    })
  );

  vscode.window.showInformationMessage('Quantum: siap di port ' + port);
}

export function deactivate() {
  if (serverProcess) serverProcess.kill();
  if (bridgeProcess) bridgeProcess.kill();
}
`;

// ── bridgeClient.ts update: add chat support ──
const bridgeContent = fs.readFileSync(path.join(__dirname, '..', 'quantum-vscode', 'src', 'bridgeClient.ts'), 'utf8');

// Write files
const extTarget = path.join(__dirname, '..', 'quantum-vscode', 'src', 'extension.ts');
fs.writeFileSync(extTarget, extContent, 'utf8');
console.log('OK: extension.ts (' + extContent.split('\n').length + ' lines)');
