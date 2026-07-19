// Shim untuk 'react/jsx-runtime'. React Flow dist di-compile dengan automatic JSX
// runtime (memakai jsx()/jsxs() dari react/jsx-runtime), tapi React UMD global TIDAK
// mengekspos fungsi itu. Kita implementasikan lewat React.createElement supaya bundle
// tetap pakai window.React yang sama.
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
