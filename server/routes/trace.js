// server/routes/trace.js
// Route: POST /api/trace — Instrument, compile, execute, return trace

const express = require('express');
const router = express.Router();
const traceService = require('../services/traceService');
const storageService = require('../services/storageService');
const { validateCode } = require('../middleware/validation');

/**
 * POST /api/trace
 * Generate execution trace for C++ code
 */
router.post('/', validateCode, async (req, res) => {
  try {
    const { code, title } = req.body;
    const result = await traceService.generateTrace(code);

    // Save to execution history
    try {
      storageService.saveExecution({
        code,
        title: title || 'Untitled',
        steps: result.trace ? result.trace.length : 0,
        status: result.success ? 'completed' : result.stage,
        executionTime: result.executionTime,
        output: result.output,
      });
    } catch (histErr) {
      // Don't fail the trace if history save fails
      console.error('[Trace] History save error:', histErr.message);
    }

    res.json({
      success: result.success,
      trace: result.trace,
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      stage: result.stage,
      functions: result.functions || [],
    });
  } catch (err) {
    console.error('[Trace] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error during trace generation.',
      trace: [],
    });
  }
});

module.exports = router;
