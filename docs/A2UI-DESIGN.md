# A2UI — Skema Desain (app + web, satu sumber)

Status: RANCANGAN (belum diimplementasi). Tujuan: satu spec JSON A2UI →
render ke **app (Flutter)** dan **web (React/HTML)**, dengan transport
React→Flutter iframe yang efisien (Transferable Objects, zero-copy).

---

## 1. Prinsip: satu kontrak, banyak target

```
                 A2UI JSON  (sumber kebenaran tunggal)
                /                                  \
   Renderer Flutter (A2UIView)            Renderer React/HTML (baru)
   → preview "App" akurat                 → preview "Web" instan & ringan
   → ekspor proyek Flutter (APK/web)      → ekspor situs statis
```

- Spec JSON **platform-agnostik**: tidak memuat Dart/HTML, hanya tipe + props + state + aksi.
- Dua renderer mengonsumsi spec yang **sama persis** (paritas tipe node wajib dijaga).
- Studio punya **toggle: Web / App**.

### Aturan paritas renderer
Setiap tipe node & aksi HARUS didukung kedua renderer dengan perilaku setara:
`scaffold, column, row, center, expanded, spacer, padding, sizedbox, container,
card, text, icon, image, button, textbutton, iconbutton, textfield, listview,
divider`; aksi `set/inc/dec/append/backspace/clear/eval`; state + `${field}`.
Tabel paritas dipelihara di `docs/A2UI-SCHEMA.md` (kandidat berikutnya).

---

## 2. Schema (envelope + versi)

Spec dibungkus envelope agar bisa diversi & divalidasi:

```json
{
  "a2ui": 1,                      // versi schema
  "meta": { "title": "Kalkulator", "target": "both" },
  "state": { "display": "0" },
  "root": { "type": "scaffold", ... }   // atau langsung "type" di akar (legacy)
}
```

Renderer menerima `root` (atau spec itu sendiri bila tak ada `root`). Versi
`a2ui` memungkinkan migrasi tanpa merusak spec lama.

---

## 3. Transport — dua kanal

```
React (renderer Electron) ──IPC (super cepat, aman)──▶ Node (main process)
        │                                                  └─ backend: chat, compile, ekspor, simpan file, cloud API
        └──postMessage + Transferable Objects──▶ Flutter Web (iframe)
                                                   (UI berat A2UI; tak menyentuh Node langsung)
```

Aturan: **React adalah hub.** Flutter (iframe) TIDAK bicara ke Node langsung —
data berat (mis. simpan file, build, ekspor) jalurnya **Flutter → postMessage →
React → IPC → Node**.

---

### 3.A. React ↔ Node — Electron IPC (mengganti HTTP)

**Kenapa ganti HTTP:** `fetch('http://127.0.0.1:8090/...')` melewati stack TCP/HTTP
lokal (serialisasi, port, header) dan butuh server HTTP hidup. **IPC Electron**
(`ipcRenderer` ⇄ `ipcMain`) jalur langsung antar-proses — lebih cepat, tak ada
port terbuka, dan bisa dikunci aman lewat `contextBridge`.

**Preload (jembatan aman, `contextIsolation: true`):**
```js
// preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('quantum', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),     // request/response
  stream: (channel, payload, onChunk) => {                                // streaming (chat/agent)
    const id = crypto.randomUUID();
    const h = (_e, m) => { if (m.id !== id) return; if (m.done) { ipcRenderer.off('a2ui:chunk', h); } else onChunk(m.data); };
    ipcRenderer.on('a2ui:chunk', h);
    ipcRenderer.send(channel, { id, payload });
    return () => ipcRenderer.off('a2ui:chunk', h);                        // cancel
  },
});
```
Hanya fungsi tertentu yang diekspos — renderer TIDAK dapat akses Node penuh (aman).

**Renderer (React) — ganti fetch:**
```js
// sebelum:  await fetch('/compile', {method:'POST', body:...})
// sesudah:  await window.quantum.invoke('compile', { spec });
// streaming chat:
const cancel = window.quantum.stream('chat', { history, cloud }, (chunk) => append(chunk));
```

**Main (Node) — handler:**
```js
// main.js
const core = require('./core');           // logika eks-server.cjs jadi modul murni
ipcMain.handle('compile', (e, p) => core.compile(p));
ipcMain.handle('export.web', (e, p) => core.exportWeb(p));
ipcMain.handle('save.file', (e, p) => core.saveFile(p));     // data berat → di sini
ipcMain.on('chat', (e, { id, payload }) => {
  core.chatStream(payload, (chunk) => e.sender.send('a2ui:chunk', { id, data: chunk }),
                          () => e.sender.send('a2ui:chunk', { id, done: true }));
});
```

**Migrasi:** isi `server.cjs` (handler HTTP) dipecah jadi **modul inti murni**
(`core.js`: `chatStream`, `compile`, `export*`, `saveFile`, panggil cloud API).
IPC dan (sementara) HTTP sama-sama memanggil core → bisa pindah bertahap.

**Memuat UI tanpa HTTP:**
- React app: `win.loadFile('public/index.html')` atau **custom protocol** `app://`.
- Studio (Flutter) + asetnya: daftarkan **`protocol.handle('app', ...)`** di main →
  iframe `src="app://studio/index.html"`. Tak ada port `8090` lagi.
- Panggilan cloud (qwen/openai/dst) tetap HTTPS keluar, dilakukan **Node main**.

**Catatan keamanan:** `contextIsolation:true`, `nodeIntegration:false`,
`sandbox:true`; whitelist channel; validasi payload di main. Renderer tak pernah
pegang `require`/fs.

---

### 3.B. React ↔ Flutter (iframe) — Transferable Objects (zero-copy)

**Masalah:** `postMessage(obj)` biasa melakukan *structured clone* — menyalin
seluruh payload (beban CPU untuk spec besar). 

**Solusi:** encode JSON ke `ArrayBuffer` lalu **transfer kepemilikan memori**
(argumen ke-2 `postMessage`), sehingga **tidak ada penyalinan**.

### Sisi React (pengirim)
```js
function sendSpecToStudio(iframe, spec) {
  // 1. JSON → bytes (UTF-8) → ArrayBuffer
  const bytes = new TextEncoder().encode(JSON.stringify(spec));   // Uint8Array
  const buf = bytes.buffer;                                       // ArrayBuffer
  // 2. transfer kepemilikan buf (zero-copy). buf jadi "detached" setelah ini.
  iframe.contentWindow.postMessage({ a2uiVer: 1, a2uiBuf: buf }, '*', [buf]);
  // catatan: buf TIDAK bisa dipakai lagi setelah transfer → selalu encode baru tiap kirim.
}
```

### Sisi Flutter Web / Dart (penerima)
```dart
void _onMessage(html.MessageEvent e) {
  final d = e.data;
  final buf = _prop(d, 'a2uiBuf');           // JS ArrayBuffer (ByteBuffer di Dart)
  if (buf != null) {
    // ByteBuffer → Uint8List → string → jsonDecode
    final bytes = (buf as ByteBuffer).asUint8List();
    final spec  = jsonDecode(utf8.decode(bytes));
    _applyUi(Map<String, dynamic>.from(spec is Map && spec['root'] != null ? spec['root'] : spec),
             utf8.decode(bytes));
    return;
  }
  // ... fallback string lama (quantumSource) tetap didukung
}
```

### Detail penting
- **Detached buffer:** setelah transfer, `buf` di sisi React tak bisa dipakai
  ulang (sengaja — itu inti zero-copy). Selalu `TextEncoder().encode(...)` baru.
- **Fallback:** jika `a2uiBuf` tak ada, tetap dukung `quantumSource` (string) —
  kompatibel mundur & jalur darurat.
- **Kapan untung:** transfer unggul untuk payload **besar** (dashboard, banyak
  node). Untuk spec kecil (kalkulator ~3 KB) beda kecil tapi tetap aman & konsisten.
- **Handshake tetap:** studio kirim `quantumStudioReady`; React (re)kirim setelahnya.
  Karena transfer membuat buffer detached, retry HARUS meng-encode buffer baru
  tiap percobaan (bukan mengirim ulang buffer yang sama).
- **Arah balik (Flutter → React)** untuk spec hasil edit visual: simetris —
  Dart `utf8.encode` → `Uint8List.buffer` → `postMessage(..., [buffer])` via js_util.
- **Renderer React in-window** tidak lewat postMessage sama sekali (objek langsung) —
  transport ini khusus kanal lintas-iframe ke Flutter.

---

## 4. Ekspor (JSON → target)

### 4a. Web (statis)
```
spec.json + runtime React A2UI (mini, ~beberapa KB) + index.html
→ folder statis siap deploy (Vercel/Netlify/file://)
```
Renderer web di-bundle sekali; tiap "app" hanya beda `spec.json`.

### 4b. App Flutter
```
template proyek Flutter + lib/a2ui_view.dart (runtime A2UIView) + assets/spec.json
→ `flutter build apk` / `flutter build web`
```
Dua opsi internal:
- **Runtime-embed (disarankan):** spec dibaca saat runtime oleh `A2UIView` —
  tanpa codegen, identik dengan preview.
- **Codegen Dart (opsional):** spec → widget tree Dart statis (untuk yang ingin
  kode Dart "asli"). Lebih kompleks; tahap lanjut.

### Channel IPC (rancangan, bukan HTTP)
- `invoke('export.web', { spec })` → path folder/zip web statis
- `invoke('export.app', { spec })` → path proyek/zip Flutter
- `invoke('save.file', { path, data })` → simpan (data berat lewat sini, React→IPC→Node)
(Reuse pipeline `flutter build` yang sudah ada, dipanggil dari `core.js`.)

---

## 5. Studio: toggle Web / App

```
[ Web ]  [ App ]      ← di header studio
   │         └─ iframe Flutter (CanvasKit) — akurat, berat
   └─ renderer React in-window — instan, ringan (default harian)
```
- Default **Web** (cepat) untuk iterasi; **App** saat ingin verifikasi tampilan Flutter.
- Edit Visual bekerja di kedua mode (memutasi spec JSON yang sama).
- CanvasKit (37 MB) hanya dimuat saat mode **App** dibuka → studio terasa ringan
  selama kerja sehari-hari.

---

## 6. Urutan implementasi (jika disetujui)
1. **Core module** — pecah logika `server.cjs` jadi `core.js` murni (tanpa HTTP).
2. **IPC layer** — preload (`contextBridge`) + `ipcMain.handle/on` memanggil core;
   React ganti `fetch` → `window.quantum.invoke/stream`. (HTTP boleh hidup paralel saat transisi.)
3. **Custom protocol** `app://` untuk memuat React + studio tanpa port 8090.
4. **Schema + envelope** (`a2ui:1`, `root`) — validasi ringan.
5. **Renderer React/HTML** (cermin `A2UIView`, paritas tipe + aksi `eval`).
6. **Toggle Web/App** + lazy-load CanvasKit di mode App.
7. **Transferable Objects** (React→Flutter iframe) + fallback string.
8. **Edit Visual** untuk renderer React (panel properti yang sama).
9. **Ekspor** web statis → lalu proyek Flutter.

Risiko utama:
- **Paritas** dua renderer → mitigasi: satu tabel schema + set "spec contoh" diuji di keduanya.
- **Migrasi HTTP→IPC** menyentuh banyak titik → mitigasi: core dipanggil dua jalur
  (HTTP+IPC) selama transisi, pindah endpoint satu per satu, hapus HTTP terakhir.
