'use strict';

/**
 * Global error handler middleware
 * Catches unhandled errors and returns appropriate HTTP responses
 */
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.stack || err.message || err);
  
  // Don't send error response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Determine status code
  const status = err.status || err.statusCode || 500;
  
  // Determine error message
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : (err.message || 'Unknown error');
  
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  }));
}

/**
 * Async route wrapper to catch promise rejections
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unmatched routes
 */
function notFoundHandler(req, res) {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }));
}

module.exports = { errorHandler, asyncHandler, notFoundHandler };
