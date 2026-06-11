// Build the Windows installer via electron-builder's Node API.
// Run with Electron-as-Node:  ELECTRON_RUN_AS_NODE=1 electron scripts/build-app.js
// (Config is read from package.json "build".)
// ELECTRON_NO_ASAR disables Electron's built-in asar fs patch, which otherwise
// breaks electron-builder's ability to CREATE app.asar when run under Electron.
process.env.ELECTRON_NO_ASAR = '1';
const builder = require('electron-builder');
builder.build({ targets: builder.Platform.WINDOWS.createTarget() })
  .then((res) => { console.log('BUILT:'); res.forEach((f) => console.log('  ' + f)); process.exit(0); })
  .catch((err) => { console.error('BUILD FAILED:\n', err); process.exit(1); });
