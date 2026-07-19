// Entry untuk bundle React Flow yang di-vendor. Mengekspos React Flow + dagre sebagai
// satu global (window.RFLib) supaya app.jsx (yang pakai window.React UMD) bisa memakainya
// tanpa bundler runtime — sama pola dengan Monaco/mermaid/xterm yang sudah di-vendor.
import * as XY from "@xyflow/react";
import dagre from "@dagrejs/dagre";
export { XY, dagre };
