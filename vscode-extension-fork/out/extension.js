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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const bridgeClient_1 = require("./bridgeClient");
const webviewProvider_1 = require("./webviewProvider");
const child_process_1 = require("child_process");
let bridgeProcess;
let bridgeClient;
async function activate(context) {
    // Bridge process for VS Code actions (open file, edit, terminal)
    bridgeProcess = (0, child_process_1.spawn)('node', [context.asAbsolutePath('core/bridge/backend-entry.cjs')], {
        cwd: context.asAbsolutePath('.'),
        env: { ...process.env, QUANTUM_MODE: 'extension' },
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    bridgeClient = new bridgeClient_1.QuantumBridgeClient(bridgeProcess);
    const provider = new webviewProvider_1.QuantumChatProvider(context.extensionUri, bridgeClient);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('quantum.chat', provider));
    context.subscriptions.push(vscode.commands.registerCommand('quantum.send', (input) => {
        bridgeClient.sendAction({ type: 'runCommand', params: { command: input } });
    }));
    vscode.window.showInformationMessage('Quantum: siap (backend port 8090)');
}
function deactivate() {
    if (bridgeProcess)
        bridgeProcess.kill();
}
//# sourceMappingURL=extension.js.map