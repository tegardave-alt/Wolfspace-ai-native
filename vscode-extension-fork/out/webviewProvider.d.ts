import * as vscode from 'vscode';
import { QuantumBridgeClient } from './bridgeClient';
export declare class QuantumChatProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    private readonly bridge;
    private _view?;
    constructor(extensionUri: vscode.Uri, bridge: QuantumBridgeClient);
    resolveWebviewView(webviewView: vscode.WebviewView): void;
    private getHtml;
}
