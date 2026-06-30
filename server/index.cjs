'use strict';
const http = require('http');
const { corsHandler } = require('./middleware/cors.cjs');
const { errorHandler, notFoundHandler } = require('./middleware/error.cjs');
const { handleChat } = require('./routes/chat.cjs');
const { handleRun } = require('./routes/run.cjs');
const { handleGetModels } = require('./routes/models.cjs');

/**
 * Modular HTTP Server
 * Integrates all routes and middleware
 */
function createServer(CONFIG, deps) {
  const server = http.createServer((req, res) => {
    // Apply CORS middleware
    if (corsHandler(req, res)) return;
    
    // Try each route handler
    try {
      if (handleChat(req, res, deps)) return;
      if (handleRun(req, res, deps)) return;
      if (handleGetModels(req, res, CONFIG)) return;
      
      // No route matched
      notFoundHandler(req, res);
    } catch (err) {
      errorHandler(err, req, res, () => notFoundHandler(req, res));
    }
  });
  
  return server;
}

module.exports = { createServer };
