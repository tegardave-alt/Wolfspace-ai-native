// jsx-shim.js — stands in for 'react/jsx-runtime'. The React Flow dist is
// compiled with the automatic JSX runtime, so it calls jsx()/jsxs() from
// react/jsx-runtime — which the UMD React global does NOT expose. They are
// implemented here on top of React.createElement so the bundle keeps using the
// same window.React as everything else.
var R = window.React;
function jsx(type, config, maybeKey) {
  var props = {},
    children;
  for (var k in config) {
    if (k === "children") children = config[k];
    else props[k] = config[k];
  }
  if (maybeKey !== undefined) props.key = maybeKey;
  if (children === undefined) return R.createElement(type, props);
  if (Array.isArray(children))
    return R.createElement.apply(null, [type, props].concat(children));
  return R.createElement(type, props, children);
}
module.exports = { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };
