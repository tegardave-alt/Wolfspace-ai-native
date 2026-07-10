import * as vscode from 'vscode';
import { QuantumBridgeClient } from './bridgeClient';
import { QuantumChatProvider } from './webviewProvider';
import { spawn, ChildProcess } from 'child_process';

let bridgeProcess: ChildProcess;
let bridgeClient: QuantumBridgeClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Bridge process for VS Code actions (open file, edit, terminal)
  bridgeProcess = spawn('node', [context.asAbsolutePath('core/bridge/backend-entry.cjs')], {
    cwd: context.asAbsolutePath('.'),
    env: { ...process.env, QUANTUM_MODE: 'extension' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  bridgeClient = new QuantumBridgeClient(bridgeProcess);

  const provider = new QuantumChatProvider(context.extensionUri, bridgeClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('quantum.chat', provider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('quantum.send', (input) => {
      bridgeClient.sendAction({ type: 'runCommand', params: { command: input } });
    })
  );
  vscode.window.showInformationMessage('Quantum: siap (backend port 8090)');
}

export function deactivate(): void {
  if (bridgeProcess) bridgeProcess.kill();
}
