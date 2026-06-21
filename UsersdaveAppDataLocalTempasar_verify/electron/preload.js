// Quantum preload — exposes a tiny, safe bridge so the React renderer can call
// the Node backend DIRECTLY via Electron IPC (no HTTP). See docs/A2UI-DESIGN.md.
// contextIsolation keeps the renderer sandboxed: only window.quantum is exposed.
const { contextBridge, ipcRenderer } = require('electron');

let seq = 0;
contextBridge.exposeInMainWorld('quantum', {
  // True only when running inside Electron with this preload (lets app.jsx fall
  // back to HTTP fetch in a plain browser / during migration).
  ipc: true,

  // Request/response (e.g. ping, compile, export, saveFile).
  invoke: (channel, payload) => ipcRenderer.invoke('quantum:invoke', { channel, payload }),

  // Streaming (chat / self-agent). onChunk(event) is called per SSE-style event;
  // returns a cancel() function.
  stream: (channel, payload, onChunk, onDone) => {
    const id = 'qs_' + (++seq) + '_' + Date.now();
    const handler = (_e, m) => {
      if (m.id !== id) return;
      if (m.data?.done) { ipcRenderer.removeListener('quantum:chunk', handler); if (onDone) onDone(); }
      else onChunk(m.data);
    };
    ipcRenderer.on('quantum:chunk', handler);
    ipcRenderer.send('quantum:stream', { id, channel, payload });
    return () => { try { ipcRenderer.send('quantum:cancel', { id }); } catch (_) {} ipcRenderer.removeListener('quantum:chunk', handler); };
  },
});
