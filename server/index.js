// server/index.js
// TraceMind Backend Server
// Express API server for C++ code execution visualization

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const compilerService = require('./services/compilerService');
const geminiService = require('./services/geminiService');

// Import routes
const executeRoutes = require('./routes/execute');
const traceRoutes = require('./routes/trace');
const aiRoutes = require('./routes/ai');
const programRoutes = require('./routes/programs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/api/execute', executeRoutes);
app.use('/api/trace', traceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/programs', programRoutes);

// Health check & system info
app.get('/api/health', (req, res) => {
  let compilerInfo = { path: 'not detected', version: 'unknown' };
  try {
    compilerInfo = compilerService.getInfo();
  } catch (e) {
    // Compiler not found
  }

  res.json({
    status: 'ok',
    name: 'TraceMind API',
    version: '1.0.0',
    compiler: compilerInfo,
    ai: { available: geminiService.isAvailable() },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error.',
  });
});

// Start server
async function start() {
  try {
    // Detect C++ compiler
    compilerService.detect();
    console.log(`[Server] Compiler: ${compilerService.getInfo().version}`);
  } catch (err) {
    console.error('[Server] WARNING:', err.message);
    console.error('[Server] C++ execution features will not work.');
  }

  // Initialize Gemini
  await geminiService.init();

  app.listen(PORT, () => {
    console.log('');
    console.log('  ████████╗██████╗  █████╗  ██████╗███████╗███╗   ███╗██╗███╗   ██╗██████╗ ');
    console.log('  ╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝████╗ ████║██║████╗  ██║██╔══██╗');
    console.log('     ██║   ██████╔╝███████║██║     █████╗  ██╔████╔██║██║██╔██╗ ██║██║  ██║');
    console.log('     ██║   ██╔══██╗██╔══██║██║     ██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║  ██║');
    console.log('     ██║   ██║  ██║██║  ██║╚██████╗███████╗██║ ╚═╝ ██║██║██║ ╚████║██████╔╝');
    console.log('     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ ');
    console.log('');
    console.log(`  AI-Powered C++ Code Execution Visualizer`);
    console.log(`  Server running on http://localhost:${PORT}`);
    console.log(`  Health check: http://localhost:${PORT}/api/health`);
    console.log('');
  });
}

start();
