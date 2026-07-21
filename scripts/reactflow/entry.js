// Entry untuk bundle React Flow yang di-vendor. Mengekspos React Flow + dagre sebagai
// satu global (window.RFLib) supaya app.jsx (yang pakai window.React UMD) bisa memakainya
// tanpa bundler runtime — sama pola dengan Monaco/mermaid/xterm yang sudah di-vendor.
//
// FORK SOURCE: React Flow kini dibangun dari SOURCE TypeScript yang di-vendor di
// ./vendor/react + ./vendor/system (bukan lagi dari paket npm @xyflow/react/dist).
// Sumber: github.com/xyflow/xyflow tag @xyflow/react@12.11.2 (commit dd308ab),
// lisensi MIT (lihat ./vendor/LICENSE). Ini memungkinkan modifikasi internal React
// Flow langsung di repo. @xyflow/system di-resolve ke ./vendor/system via alias esbuild.
import * as XY from "./vendor/react/index.ts";
import dagre from "@dagrejs/dagre";
export { XY, dagre };
