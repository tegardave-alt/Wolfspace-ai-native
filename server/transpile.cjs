'use strict';
const babel = require('@babel/core');

const cache = new Map();

const JSX_FILES = new Set([
  '/services/api.js',
  '/utils/helpers.js',
  '/components/Icons.jsx',
  '/components/ModelInterface.jsx',
  '/components/TopBar.jsx',
  '/components/HFModels.jsx',
  '/components/SettingsView.jsx',
  '/components/UI.jsx',
  '/app.jsx',
]);

function isModularFile(urlPath) {
  return JSX_FILES.has(urlPath);
}

function transpile(filePath, source) {
  const cached = cache.get(filePath);
  if (cached && cached.source === source) {
    return cached.code;
  }
  const result = babel.transformSync(source, {
    filename: filePath,
    plugins: ['@babel/plugin-transform-react-jsx'],
    retainLines: true,
    sourceMaps: false,
  });
  const code = result.code;
  cache.set(filePath, { source, code });
  return code;
}

function invalidate(filePath) {
  cache.delete(filePath);
}

module.exports = { isModularFile, transpile, invalidate };
