// Build the Windows installer via electron-builder's Node API.
//
// With Node installed (normal contributors):   npm install && npm run dist
//
// Without Node (build using Electron as the JS runtime, as on the author's box):
//   set ELECTRON_RUN_AS_NODE=1  and  ELECTRON_NO_ASAR=1  in the ENVIRONMENT
//   (they must be external — ELECTRON_NO_ASAR set in-script is too late, the
//    asar fs patch is already installed), then:
//     electron ./scripts/build-app.js
//   Also requires Windows "Developer Mode" ON so winCodeSign's symlinks extract.
//
// Config is read from package.json "build".
const builder = require('electron-builder');
builder.build({ targets: builder.Platform.WINDOWS.createTarget() })
  .then((res) => { console.log('BUILT:'); res.forEach((f) => console.log('  ' + f)); process.exit(0); })
  .catch((err) => { console.error('BUILD FAILED:\n', err); process.exit(1); });
