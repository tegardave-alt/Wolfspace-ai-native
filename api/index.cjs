// Vercel serverless entry — exports the Express app
const express = require('express');
const path = require('path');
const fs = require('fs');

// Create a minimal Express app for Vercel
const app = express();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'wolfspace-ai-native' });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
