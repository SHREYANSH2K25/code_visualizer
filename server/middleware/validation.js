// server/middleware/validation.js
// Request validation middleware

const MAX_CODE_SIZE = parseInt(process.env.MAX_CODE_SIZE) || 65536; // 64KB

/**
 * Validate code submission requests
 */
function validateCode(req, res, next) {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'No code provided. Please submit C++ source code.',
    });
  }

  if (code.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Code cannot be empty.',
    });
  }

  if (Buffer.byteLength(code, 'utf-8') > MAX_CODE_SIZE) {
    return res.status(400).json({
      success: false,
      error: `Code exceeds maximum size of ${MAX_CODE_SIZE} bytes.`,
    });
  }

  // Basic safety checks — reject obviously dangerous patterns
  const dangerousPatterns = [
    /\bsystem\s*\(/i,
    /\bexec[lv]?p?\s*\(/i,
    /\bfork\s*\(/i,
    /\bpopen\s*\(/i,
    /\bruntime_error\s*\(/i,
    /#\s*include\s*<\s*unistd\.h\s*>/i,
    /#\s*include\s*<\s*windows\.h\s*>/i,
    /#\s*include\s*<\s*winsock/i,
    /#\s*include\s*<\s*sys\/socket/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return res.status(400).json({
        success: false,
        error: 'Code contains potentially unsafe operations that are not supported in this educational environment.',
      });
    }
  }

  next();
}

module.exports = { validateCode };
