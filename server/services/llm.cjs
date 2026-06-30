'use strict';
const http = require('http');
const https = require('https');

/**
 * LLM Service - Handles communication with language models
 */

/**
 * Stream chat completion from LLM
 * @param {string} endpoint - LLM API endpoint
 * @param {object} payload - Request payload
 * @param {function} onToken - Callback for each token
 * @param {object} options - Additional options
 */
async function streamChat(endpoint, payload, onToken, options = {}) {
  const { isCancelled, setCurReq } = options;
  
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(payload.headers || {})
      }
    };
    
    const req = lib.request(reqOpts, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => {
          reject(new Error(`LLM API error ${res.statusCode}: ${errorBody}`));
        });
        return;
      }
      
      let buffer = '';
      res.on('data', (chunk) => {
        if (isCancelled && isCancelled()) {
          req.destroy();
          return;
        }
        
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              resolve();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content || '';
              if (token) onToken(token);
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });
      
      res.on('end', () => {
        if (!res.complete) {
          reject(new Error('Stream incomplete'));
        } else {
          resolve();
        }
      });
    });
    
    req.on('error', (err) => {
      if (err.code === 'ECONNRESET' && isCancelled && isCancelled()) {
        resolve(); // Cancelled by user
      } else {
        reject(err);
      }
    });
    
    if (setCurReq) setCurReq(req);
    
    req.write(JSON.stringify(payload.body || payload));
    req.end();
  });
}

/**
 * Non-streaming chat completion
 * @param {string} endpoint - LLM API endpoint
 * @param {object} payload - Request payload
 */
async function chat(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(payload.headers || {})
      }
    };
    
    const req = lib.request(reqOpts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`LLM API error ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(payload.body || payload));
    req.end();
  });
}

module.exports = { streamChat, chat };
