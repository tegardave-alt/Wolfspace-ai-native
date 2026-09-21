// react-shim.js — resolves 'react' to the UMD global (window.React) WOLFSPACE has
// already loaded. React is therefore NOT bundled, and the instance is the SAME one
// the renderer uses — two copies of React would break hooks.
module.exports = window.React;
