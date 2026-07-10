import * as vscode from 'vscode';
import { QuantumBridgeClient, VSCodeAction } from './bridgeClient';

export class QuantumChatProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly bridge: QuantumBridgeClient,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'public'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview, 'http://127.0.0.1:8090');

    webviewView.webview.onDidReceiveMessage(async (msg: any) => {
      switch (msg.type) {
        case 'vscode-action':
          const result = await this.bridge.executeAction(msg.action as VSCodeAction);
          webviewView.webview.postMessage({ type: 'result', id: msg.action.type, result });
          break;
      }
    });
  }

  private getHtml(webview: vscode.Webview, backendUrl: string = 'http://127.0.0.1:8090'): string {
    const pubUri = vscode.Uri.joinPath(this.extensionUri, 'public');

    const toUri = (relPath: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(pubUri, relPath));

    const uris = {
      react:       toUri('vendor/react.production.min.js'),
      reactDom:    toUri('vendor/react-dom.production.min.js'),
      babel:       toUri('vendor/babel.min.js'),
      monacoLoader: toUri('vendor/monaco/vs/loader.js'),
      app:         toUri('app.jsx'),
      styles:      toUri('styles.css'),
      fonts:       toUri('vendor/fonts.css'),
      icon:        toUri('icon.png'),
    };

    const pubUrl = webview.asWebviewUri(pubUri).toString();

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quantum AI</title>
<link rel="icon" href="${uris.icon}" />
<link rel="stylesheet" href="${uris.fonts}" />
<link rel="stylesheet" href="${uris.styles}" />
<base href="${pubUrl}/">
</head>
<body>
  <div id="root"></div>
  <script>
    const vscode = acquireVsCodeApi();
    window.__VSCODE_API__ = vscode;
    window.__QUANTUM_API_URL = '${backendUrl}';

    // Forward API calls to the actual Quantum backend server
    const origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.startsWith('/')) {
        const fullUrl = window.__QUANTUM_API_URL + url;
        return origFetch(fullUrl, opts);
      }
      return origFetch(url, opts);
    };
  </script>
  <script src="${uris.react}"></script>
  <script src="${uris.reactDom}"></script>
  <script src="${uris.babel}"></script>
  <script src="${uris.monacoLoader}"></script>
  <script>
    const MB = '${pubUrl}';
    window.MonacoEnvironment = {
      getWorkerUrl: function(moduleId, label) {
        const d = MB + '/vendor/monaco/vs';
        if (label === 'json') return d + '/language/json/jsonWorker.js';
        if (label === 'css' || label === 'scss' || label === 'less') return d + '/language/css/cssWorker.js';
        if (label === 'html' || label === 'handlebars' || label === 'razor') return d + '/language/html/htmlWorker.js';
        if (label === 'typescript' || label === 'javascript') return d + '/language/typescript/tsWorker.js';
        return d + '/base/worker/workerMain.js';
      }
    };
    require.config({ paths: { vs: MB + '/vendor/monaco/vs' } });
    window.monacoReady = new Promise(function(res){
      require(['vs/editor/editor.main'], function(){ res(window.monaco); });
    });
  </script>
  <script type="text/babel" src="${uris.app}"></script>
</body>
</html>`;
  }
}
