// server/services/executionService.js
// Executes compiled C++ programs in a controlled child process

const { execFile } = require('child_process');
const path = require('path');

class ExecutionService {
  /**
   * Execute a compiled program with safety constraints
   * @param {string} executablePath - Path to compiled executable
   * @param {object} options - Execution options
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number, timedOut: boolean, executionTime: number}>}
   */
  execute(executablePath, options = {}) {
    return new Promise((resolve) => {
      const timeout = options.timeout || parseInt(process.env.EXEC_TIMEOUT) || 5000;
      const maxOutput = options.maxOutput || parseInt(process.env.MAX_OUTPUT_SIZE) || 1048576;

      const startTime = Date.now();

      const proc = execFile(executablePath, [], {
        timeout,
        maxBuffer: maxOutput,
        encoding: 'utf-8',
        cwd: path.dirname(executablePath),
      }, (error, stdout, stderr) => {
        const executionTime = Date.now() - startTime;

        if (error) {
          if (error.killed) {
            resolve({
              stdout: stdout || '',
              stderr: 'Program execution timed out. This may indicate an infinite loop.',
              exitCode: -1,
              timedOut: true,
              executionTime,
            });
          } else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            resolve({
              stdout: (stdout || '').substring(0, maxOutput),
              stderr: 'Output exceeded maximum size limit.',
              exitCode: -1,
              timedOut: false,
              executionTime,
            });
          } else {
            resolve({
              stdout: stdout || '',
              stderr: stderr || error.message || 'Runtime error occurred.',
              exitCode: error.code || 1,
              timedOut: false,
              executionTime,
            });
          }
        } else {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: 0,
            timedOut: false,
            executionTime,
          });
        }
      });
    });
  }
}

module.exports = new ExecutionService();
