// server/routes/ai.js
// Routes: POST /api/explain, POST /api/analyze — AI-powered features

const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');

/**
 * POST /api/explain
 * AI explanation of a specific execution step
 */
router.post('/explain', async (req, res) => {
  try {
    const { code, step, variables, functionName, line, event, callStack, depth } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        explanation: 'No code provided for explanation.',
      });
    }

    const result = await geminiService.explainStep({
      code, step, variables, functionName, line, event, callStack, depth,
    });

    res.json(result);
  } catch (err) {
    console.error('[AI] Explain error:', err);
    res.json({
      success: false,
      explanation: 'AI explanation unavailable. The execution trace is still available.',
    });
  }
});

/**
 * POST /api/analyze
 * AI code analysis for potential issues
 */
router.post('/analyze', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        analysis: 'No code provided for analysis.',
        issues: [],
      });
    }

    const result = await geminiService.analyzeCode(code);
    res.json(result);
  } catch (err) {
    console.error('[AI] Analyze error:', err);
    res.json({
      success: false,
      analysis: 'AI code analysis encountered an error.',
      issues: [],
    });
  }
});

/**
 * GET /api/ai/status
 * Check AI availability
 */
router.get('/status', (req, res) => {
  res.json({
    available: geminiService.isAvailable(),
  });
});

module.exports = router;
