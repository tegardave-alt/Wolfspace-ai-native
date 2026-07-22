// Entry untuk bundle React Flow yang di-vendor. Mengekspos React Flow + dagre sebagai
// satu global (window.RFLib) supaya app.jsx (yang pakai window.React UMD) bisa memakainya
// tanpa bundler runtime — sama pola dengan Monaco/mermaid/xterm yang sudah di-vendor.
//
// Dibangun dari paket npm @xyflow/react (MIT). React di-alias ke window.React lewat
// shim esbuild (lihat build.cjs). Dulu sempat dibangun dari fork source TS yang
// di-vendor; fork dilepas karena satu-satunya modifikasi (pola background diagonal)
// kini diimplementasikan sebagai komponen kustom di app.jsx tanpa menyentuh internal.
import * as XY from "@xyflow/react";
import dagre from "@dagrejs/dagre";
export { XY, dagre };
