// server/services/compilerService.js
// Detects and interfaces with the local C++ compiler

const { execSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

class CompilerService {
  constructor() {
    this.compilerPath = null;
    this.compilerVersion = null;
    this.detected = false;
  }

  /**
   * Auto-detect available C++ compiler
   * Checks: environment variable, g++, then common MinGW paths
   */
  detect() {
    if (this.detected) return this;

    // Check environment variable first
    if (process.env.CPP_COMPILER) {
      try {
        const version = execSync(`"${process.env.CPP_COMPILER}" --version`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
        this.compilerPath = process.env.CPP_COMPILER;
        this.compilerVersion = version.split('\n')[0];
        this.detected = true;
        console.log(`[Compiler] Using configured compiler: ${this.compilerPath}`);
        return this;
      } catch (e) {
        console.warn(`[Compiler] Configured compiler not found: ${process.env.CPP_COMPILER}`);
      }
    }

    // Try g++ from PATH
    const candidates = ['g++'];
    // Common Windows MinGW locations
    const windowsPaths = [
      'C:\\MinGW\\bin\\g++.exe',
      'C:\\msys64\\mingw64\\bin\\g++.exe',
      'C:\\TDM-GCC-64\\bin\\g++.exe',
      'C:\\Program Files\\mingw-w64\\bin\\g++.exe',
    ];

    if (process.platform === 'win32') {
      candidates.push(...windowsPaths);
    }

    for (const candidate of candidates) {
      try {
        const version = execSync(`"${candidate}" --version`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
        this.compilerPath = candidate;
        this.compilerVersion = version.split('\n')[0].trim();
        this.detected = true;
        console.log(`[Compiler] Detected: ${this.compilerPath} (${this.compilerVersion})`);
        return this;
      } catch (e) {
        // Try next candidate
      }
    }

    throw new Error(
      'No C++ compiler found. Install MinGW/g++ and ensure it is on your PATH, ' +
      'or set CPP_COMPILER in your .env file.'
    );
  }

  /**
   * Compile a C++ source file to an executable
   * @param {string} sourcePath - Path to .cpp file
   * @param {string} outputPath - Path for output executable
   * @returns {Promise<{success: boolean, errors: string, warnings: string}>}
   */
  compile(sourcePath, outputPath) {
    return new Promise((resolve, reject) => {
      if (!this.detected) this.detect();

      const timeout = parseInt(process.env.COMPILE_TIMEOUT) || 10000;
      const args = ['-std=c++11', '-o', outputPath, sourcePath];

      const proc = execFile(this.compilerPath, args, {
        timeout,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
      }, (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            resolve({
              success: false,
              errors: 'Compilation timed out. Your code may be too complex or contain infinite preprocessor loops.',
              warnings: '',
            });
          } else {
            // Parse compilation errors — make line numbers relative to original code
            resolve({
              success: false,
              errors: stderr || error.message,
              warnings: '',
            });
          }
        } else {
          resolve({
            success: true,
            errors: '',
            warnings: stderr || '',
          });
        }
      });
    });
  }

  getInfo() {
    if (!this.detected) this.detect();
    return {
      path: this.compilerPath,
      version: this.compilerVersion,
    };
  }
}

module.exports = new CompilerService();
