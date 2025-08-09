#!/usr/bin/env node

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5174;

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React Router - send all requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Frontend server running on http://localhost:${PORT}`);
});
