// server/services/traceService.js
// Orchestrates: instrument → compile → execute → parse trace JSON
// This is the main pipeline for generating execution traces.

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const compilerService = require('./compilerService');
const executionService = require('./executionService');
const instrumentationService = require('./instrumentationService');

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

class TraceService {
  /**
   * Generate execution trace for C++ code
   * Pipeline: instrument → compile → execute → parse trace
   * 
   * @param {string} code - Original C++ source code
   * @returns {Promise<{success: boolean, trace: Array, output: string, error: string, executionTime: number}>}
   */
  async generateTrace(code) {
    const sessionId = uuidv4();
    const sourceFile = path.join(TEMP_DIR, `${sessionId}.cpp`);
    const execFile = path.join(TEMP_DIR, `${sessionId}.exe`);
    const traceFile = path.join(TEMP_DIR, `${sessionId}_trace.json`);

    try {
      // Step 1: Instrument the source code
      const { instrumentedCode, functions } = instrumentationService.instrument(code, traceFile);

      // Write instrumented source
      fs.writeFileSync(sourceFile, instrumentedCode, 'utf-8');

      // Step 2: Compile the instrumented code
      const compileResult = await compilerService.compile(sourceFile, execFile);

      if (!compileResult.success) {
        // Try to map error line numbers back to original source
        const mappedErrors = this._mapCompileErrors(compileResult.errors, sourceFile);
        return {
          success: false,
          trace: [],
          output: '',
          error: mappedErrors,
          executionTime: 0,
          stage: 'compilation',
        };
      }

      // Step 3: Execute the instrumented program
      const execResult = await executionService.execute(execFile);

      if (execResult.timedOut) {
        return {
          success: false,
          trace: [],
          output: execResult.stdout,
          error: 'Program execution timed out. This may indicate an infinite loop.',
          executionTime: execResult.executionTime,
          stage: 'execution',
        };
      }

      // Step 4: Read and parse the trace file
      let trace = [];
      if (fs.existsSync(traceFile)) {
        try {
          const traceContent = fs.readFileSync(traceFile, 'utf-8');
          trace = JSON.parse(traceContent);
        } catch (parseErr) {
          // Try to fix incomplete JSON (program may have crashed mid-trace)
          try {
            let content = fs.readFileSync(traceFile, 'utf-8').trim();
            if (!content.endsWith(']')) {
              // Remove trailing comma if any
              if (content.endsWith(',')) content = content.slice(0, -1);
              content += '\n]';
            }
            trace = JSON.parse(content);
          } catch (e) {
            console.error('[TraceService] Failed to parse trace file:', e.message);
          }
        }
      }

      // Build cumulative output for each step
      let cumulativeOutput = '';
      for (const step of trace) {
        if (step.output) {
          cumulativeOutput += step.output;
        }
        step.cumulativeOutput = cumulativeOutput;
      }

      return {
        success: true,
        trace,
        output: execResult.stdout,
        error: execResult.stderr || '',
        executionTime: execResult.executionTime,
        exitCode: execResult.exitCode,
        stage: 'complete',
        functions,
      };

    } finally {
      // Cleanup temp files
      this._cleanup(sessionId);
    }
  }

  /**
   * Compile and execute C++ code (without tracing)
   * Used for the simple "Run" button
   */
  async execute(code) {
    const sessionId = uuidv4();
    const sourceFile = path.join(TEMP_DIR, `${sessionId}.cpp`);
    const execFile = path.join(TEMP_DIR, `${sessionId}.exe`);

    try {
      // Write source file
      fs.writeFileSync(sourceFile, code, 'utf-8');

      // Compile
      const compileResult = await compilerService.compile(sourceFile, execFile);
      if (!compileResult.success) {
        return {
          success: false,
          output: '',
          error: compileResult.errors,
          executionTime: 0,
          stage: 'compilation',
        };
      }

      // Execute
      const execResult = await executionService.execute(execFile);

      return {
        success: !execResult.timedOut && execResult.exitCode === 0,
        output: execResult.stdout,
        error: execResult.stderr || '',
        executionTime: execResult.executionTime,
        timedOut: execResult.timedOut,
        exitCode: execResult.exitCode,
        stage: execResult.timedOut ? 'timeout' : 'complete',
      };

    } finally {
      this._cleanup(sessionId);
    }
  }

  /**
   * Map compilation error line numbers from instrumented source
   * back to approximate original line numbers
   */
  _mapCompileErrors(errors, sourceFile) {
    // The instrumentation adds the runtime header at the top
    // We don't have exact mapping, so just return cleaned errors
    return errors
      .replace(new RegExp(sourceFile.replace(/\\/g, '\\\\'), 'g'), 'your_code.cpp')
      .replace(/your_code\.cpp:(\d+)/g, (match, lineNum) => {
        // Very rough estimate — runtime header is ~200 lines
        return `your_code.cpp:${lineNum}`;
      });
  }

  /**
   * Clean up temporary files for a session
   */
  _cleanup(sessionId) {
    const extensions = ['.cpp', '.exe', '_trace.json'];
    for (const ext of extensions) {
      const filePath = path.join(TEMP_DIR, `${sessionId}${ext}`);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

module.exports = new TraceService();
