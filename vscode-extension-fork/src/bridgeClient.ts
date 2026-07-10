import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';

export interface VSCodeAction {
  type: 'openFile' | 'applyEdit' | 'runCommand' | 'showMessage' | 'createFile' | 'deleteFile';
  params: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class QuantumBridgeClient {
  private childProcess: ChildProcess;
  private pending = new Map<string, PendingRequest>();
  private buffer = '';
  private reqId = 0;

  constructor(childProcess: ChildProcess) {
    this.childProcess = childProcess;
    childProcess.stdout?.on('data', (chunk: Buffer | string) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });
    childProcess.stderr?.on('data', (chunk: Buffer | string) => {
      console.error('[Quantum Backend]', chunk.toString());
    });
    childProcess.on('exit', (code: number | null) => {
      console.log('Quantum backend exited with code ' + code);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    while (lines.length > 1) {
      const line = lines.shift()!.trim();
      if (!line) continue;
      try { this.handleMessage(JSON.parse(line)); }
      catch { /* partial */ }
    }
    this.buffer = lines[0];
  }

  private handleMessage(msg: { id?: string; result?: unknown; error?: string }): void {
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    }
  }

  async sendAction(action: VSCodeAction): Promise<unknown> {
    const id = String(++this.reqId);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.childProcess.stdin?.write(JSON.stringify({ id, ...action }) + '\n');
    });
  }

  async executeAction(action: VSCodeAction): Promise<unknown> {
    switch (action.type) {
      case 'openFile':
        return this.openFile(action.params as { path: string; line?: number });
      case 'applyEdit':
        return this.applyEdit(action.params as { filePath: string; edits: { line: number; startCol?: number; endCol?: number; newText: string }[] });
      case 'runCommand':
        return vscode.commands.executeCommand(action.params.command as string, ...((action.params.args as unknown[]) || []));
      case 'showMessage':
        return vscode.window.showInformationMessage(action.params.text as string);
      case 'createFile':
        return this.createFile(action.params as { path: string; content: string });
      case 'deleteFile':
        return this.deleteFile(action.params as { path: string });
      default:
        throw new Error('Unknown action type: ' + (action as { type: string }).type);
    }
  }

  private async openFile(params: { path: string; line?: number }): Promise<boolean> {
    try {
      const doc = await vscode.workspace.openTextDocument(params.path);
      const editor = await vscode.window.showTextDocument(doc);
      if (params.line !== undefined) {
        const pos = new vscode.Position(params.line - 1, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
      }
      return true;
    } catch { return false; }
  }

  private async applyEdit(params: { filePath: string; edits: { line: number; startCol?: number; endCol?: number; newText: string }[] }): Promise<boolean> {
    try {
      const doc = await vscode.workspace.openTextDocument(params.filePath);
      const edit = new vscode.WorkspaceEdit();
      for (const e of params.edits) {
        edit.replace(doc.uri, new vscode.Range(e.line - 1, e.startCol || 0, e.line - 1, e.endCol || 0), e.newText);
      }
      return vscode.workspace.applyEdit(edit);
    } catch { return false; }
  }

  private async createFile(params: { path: string; content: string }): Promise<boolean> {
    try {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(params.path), new TextEncoder().encode(params.content));
      return true;
    } catch { return false; }
  }

  private async deleteFile(params: { path: string }): Promise<boolean> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(params.path));
      return true;
    } catch { return false; }
  }
}
