'use strict'; 
  
/**  
 * Route Index - Pluggable routing with auto-discovery  
 * All route modules export handle(req, res, deps) => boolean  
 */  
const { handleChat } = require('./chat.cjs');  
const { handleRun } = require('./run.cjs');  
const { handleGetModels: handleModels } = require('./models.cjs');  
const { handle: handleDebug } = require('./debug.cjs');  
const { handle: handleHealth } = require('./health.cjs');  
const { handle: handleHunks } = require('./hunks.cjs');  
const { handle: handleBash } = require('./bash.cjs');  
const { handle: handleCloud } = require('./cloud.cjs');  
const { handle: handleUpload } = require('./upload.cjs'); 
  
/**  
 * Dispatch request to appropriate route handler  
 * Tries each route module in order; first match wins  
 * @param {Object} req - HTTP request  
 * @param {Object} res - HTTP response  
 * @param {Object} deps - Dependencies for route handlers  
 * @returns {boolean} true if route handled, false otherwise  
 */  
function dispatch(req, res, deps) {  
  // Core routes  
  if (handleChat(req, res, deps)) return true;  
  if (handleRun(req, res, deps)) return true;  
  if (handleModels(req, res, deps)) return true; 
  
  // Debug & monitoring  
  if (handleDebug(req, res, deps)) return true;  
  if (handleHealth(req, res, deps)) return true;  
  
  // API routes  
  if (handleHunks(req, res, deps)) return true;  
  if (handleBash(req, res, deps)) return true;  
  if (handleCloud(req, res, deps)) return true;  
  if (handleUpload(req, res, deps)) return true;  
  
  // No route matched  
  return false;  
}  
  
module.exports = { dispatch }; 
