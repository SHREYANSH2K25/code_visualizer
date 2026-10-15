// src/api.js
// TraceMind API client — communicates with the Express backend

const API_BASE = '/api';

/**
 * POST /api/trace — Instrument, compile, execute, return trace
 */
export async function traceCode(code, title = 'Untitled') {
  const res = await fetch(`${API_BASE}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, title }),
  });
  return res.json();
}

/**
 * POST /api/execute — Compile and run (no tracing)
 */
export async function executeCode(code) {
  const res = await fetch(`${API_BASE}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

/**
 * POST /api/ai/explain — AI explanation of a trace step
 */
export async function explainStep(payload) {
  const res = await fetch(`${API_BASE}/ai/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/**
 * POST /api/ai/analyze — AI code analysis
 */
export async function analyzeCode(code) {
  const res = await fetch(`${API_BASE}/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

/**
 * GET /api/health — Health check
 */
export async function healthCheck() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

/**
 * GET /api/programs — List saved programs
 */
export async function getPrograms() {
  const res = await fetch(`${API_BASE}/programs`);
  return res.json();
}

/**
 * POST /api/programs — Save program
 */
export async function saveProgram(title, code) {
  const res = await fetch(`${API_BASE}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, code }),
  });
  return res.json();
}

/**
 * DELETE /api/programs/:id — Delete program
 */
export async function deleteProgram(id) {
  const res = await fetch(`${API_BASE}/programs/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

/**
 * GET /api/programs/history/list — Get execution history
 */
export async function getHistory() {
  const res = await fetch(`${API_BASE}/programs/history/list`);
  return res.json();
}
