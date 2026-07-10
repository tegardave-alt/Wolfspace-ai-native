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
exports.QuantumChatProvider = void 0;
const vscode = __importStar(require("vscode"));
class QuantumChatProvider {
    extensionUri;
    bridge;
    _view;
    constructor(extensionUri, bridge) {
        this.extensionUri = extensionUri;
        this.bridge = bridge;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'public'),
            ],
        };
        webviewView.webview.html = this.getHtml(webviewView.webview, 'http://127.0.0.1:8090');
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'vscode-action':
                    const result = await this.bridge.executeAction(msg.action);
                    webviewView.webview.postMessage({ type: 'result', id: msg.action.type, result });
                    break;
            }
        });
    }
    getHtml(webview, backendUrl = 'http://127.0.0.1:8090') {
        const pubUri = vscode.Uri.joinPath(this.extensionUri, 'public');
        const toUri = (relPath) => webview.asWebviewUri(vscode.Uri.joinPath(pubUri, relPath));
        const uris = {
            react: toUri('vendor/react.production.min.js'),
            reactDom: toUri('vendor/react-dom.production.min.js'),
            babel: toUri('vendor/babel.min.js'),
            monacoLoader: toUri('vendor/monaco/vs/loader.js'),
            app: toUri('app.jsx'),
            styles: toUri('styles.css'),
            fonts: toUri('vendor/fonts.css'),
            icon: toUri('icon.png'),
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
exports.QuantumChatProvider = QuantumChatProvider;
//# sourceMappingURL=webviewProvider.js.map