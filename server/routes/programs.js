// server/routes/programs.js
// Routes: CRUD for saved programs and execution history

const express = require('express');
const router = express.Router();
const storageService = require('../services/storageService');

// GET /api/programs — List all saved programs
router.get('/', (req, res) => {
  try {
    const programs = storageService.getPrograms();
    res.json({ success: true, programs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/programs/:id — Get a specific program
router.get('/:id', (req, res) => {
  try {
    const program = storageService.getProgram(req.params.id);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Program not found.' });
    }
    res.json({ success: true, program });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/programs — Save a new program
router.post('/', (req, res) => {
  try {
    const { title, code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'No code provided.' });
    }
    const program = storageService.saveProgram({ title, code });
    res.json({ success: true, program });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/programs/:id — Update a program
router.put('/:id', (req, res) => {
  try {
    const program = storageService.updateProgram(req.params.id, req.body);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Program not found.' });
    }
    res.json({ success: true, program });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/programs/:id — Delete a program
router.delete('/:id', (req, res) => {
  try {
    const deleted = storageService.deleteProgram(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/history — Get execution history
router.get('/history/list', (req, res) => {
  try {
    const history = storageService.getHistory();
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/history — Clear history
router.delete('/history/clear', (req, res) => {
  try {
    storageService.clearHistory();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
