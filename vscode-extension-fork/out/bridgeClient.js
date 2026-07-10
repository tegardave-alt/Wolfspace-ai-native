"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuantumBridgeClient = void 0;
const vscode = __importStar(require("vscode"));
class QuantumBridgeClient {
    childProcess;
    pending = new Map();
    buffer = '';
    reqId = 0;
    constructor(childProcess) {
        this.childProcess = childProcess;
        childProcess.stdout?.on('data', (chunk) => {
            this.buffer += chunk.toString();
            this.processBuffer();
        });
        childProcess.stderr?.on('data', (chunk) => {
            console.error('[Quantum Backend]', chunk.toString());
        });
        childProcess.on('exit', (code) => {
            console.log('Quantum backend exited with code ' + code);
        });
    }
    processBuffer() {
        const lines = this.buffer.split('\n');
        while (lines.length > 1) {
            const line = lines.shift().trim();
            if (!line)
                continue;
            try {
                this.handleMessage(JSON.parse(line));
            }
            catch { /* partial */ }
        }
        this.buffer = lines[0];
    }
    handleMessage(msg) {
        if (msg.id && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error)
                p.reject(new Error(msg.error));
            else
                p.resolve(msg.result);
        }
    }
    async sendAction(action) {
        const id = String(++this.reqId);
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.childProcess.stdin?.write(JSON.stringify({ id, ...action }) + '\n');
        });
    }
    async executeAction(action) {
        switch (action.type) {
            case 'openFile':
                return this.openFile(action.params);
            case 'applyEdit':
                return this.applyEdit(action.params);
            case 'runCommand':
                return vscode.commands.executeCommand(action.params.command, ...(action.params.args || []));
            case 'showMessage':
                return vscode.window.showInformationMessage(action.params.text);
            case 'createFile':
                return this.createFile(action.params);
            case 'deleteFile':
                return this.deleteFile(action.params);
            default:
                throw new Error('Unknown action type: ' + action.type);
        }
    }
    async openFile(params) {
        try {
            const doc = await vscode.workspace.openTextDocument(params.path);
            const editor = await vscode.window.showTextDocument(doc);
            if (params.line !== undefined) {
                const pos = new vscode.Position(params.line - 1, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
            }
            return true;
        }
        catch {
            return false;
        }
    }
    async applyEdit(params) {
        try {
            const doc = await vscode.workspace.openTextDocument(params.filePath);
            const edit = new vscode.WorkspaceEdit();
            for (const e of params.edits) {
                edit.replace(doc.uri, new vscode.Range(e.line - 1, e.startCol || 0, e.line - 1, e.endCol || 0), e.newText);
            }
            return vscode.workspace.applyEdit(edit);
        }
        catch {
            return false;
        }
    }
    async createFile(params) {
        try {
            await vscode.workspace.fs.writeFile(vscode.Uri.file(params.path), new TextEncoder().encode(params.content));
            return true;
        }
        catch {
            return false;
        }
    }
    async deleteFile(params) {
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(params.path));
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.QuantumBridgeClient = QuantumBridgeClient;
//# sourceMappingURL=bridgeClient.js.map