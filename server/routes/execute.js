// server/routes/execute.js
// Route: POST /api/execute — Compile and run C++ code

const express = require('express');
const router = express.Router();
const traceService = require('../services/traceService');
const { validateCode } = require('../middleware/validation');

/**
 * POST /api/execute
 * Compile and execute C++ code, return output
 */
router.post('/', validateCode, async (req, res) => {
  try {
    const { code } = req.body;
    const result = await traceService.execute(code);

    res.json({
      success: result.success,
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      timedOut: result.timedOut || false,
      exitCode: result.exitCode,
      stage: result.stage,
    });
  } catch (err) {
    console.error('[Execute] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error during execution.',
    });
  }
});

module.exports = router;
