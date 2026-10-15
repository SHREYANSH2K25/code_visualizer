// server/services/storageService.js
// File-based JSON storage for saved programs and execution history
// Uses simple JSON files instead of MongoDB

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROGRAMS_FILE = path.join(DATA_DIR, 'programs.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

class StorageService {
  constructor() {
    this._ensureDataDir();
  }

  _ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROGRAMS_FILE)) {
      fs.writeFileSync(PROGRAMS_FILE, '[]', 'utf-8');
    }
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, '[]', 'utf-8');
    }
  }

  _readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return [];
    }
  }

  _writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ---- Programs ----

  saveProgram(data) {
    const programs = this._readJson(PROGRAMS_FILE);
    const program = {
      _id: uuidv4(),
      title: data.title || 'Untitled Program',
      code: data.code,
      language: 'cpp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    programs.unshift(program);
    // Keep max 100 programs
    if (programs.length > 100) programs.length = 100;
    this._writeJson(PROGRAMS_FILE, programs);
    return program;
  }

  getPrograms() {
    return this._readJson(PROGRAMS_FILE);
  }

  getProgram(id) {
    const programs = this._readJson(PROGRAMS_FILE);
    return programs.find(p => p._id === id) || null;
  }

  updateProgram(id, data) {
    const programs = this._readJson(PROGRAMS_FILE);
    const idx = programs.findIndex(p => p._id === id);
    if (idx === -1) return null;
    programs[idx] = {
      ...programs[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this._writeJson(PROGRAMS_FILE, programs);
    return programs[idx];
  }

  deleteProgram(id) {
    let programs = this._readJson(PROGRAMS_FILE);
    const initial = programs.length;
    programs = programs.filter(p => p._id !== id);
    this._writeJson(PROGRAMS_FILE, programs);
    return programs.length < initial;
  }

  // ---- Execution History ----

  saveExecution(data) {
    const history = this._readJson(HISTORY_FILE);
    const execution = {
      _id: uuidv4(),
      programId: data.programId || null,
      code: data.code,
      title: data.title || 'Untitled',
      steps: data.steps || 0,
      status: data.status || 'completed',
      executionTime: data.executionTime || 0,
      output: data.output || '',
      createdAt: new Date().toISOString(),
    };
    history.unshift(execution);
    // Keep max 50 history entries
    if (history.length > 50) history.length = 50;
    this._writeJson(HISTORY_FILE, history);
    return execution;
  }

  getHistory() {
    return this._readJson(HISTORY_FILE);
  }

  clearHistory() {
    this._writeJson(HISTORY_FILE, []);
  }
}

module.exports = new StorageService();
