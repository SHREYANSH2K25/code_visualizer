import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, Zap, SkipBack, SkipForward, Pause, ChevronLeft, ChevronRight,
  BookOpen, Layers, Terminal, Sparkles, AlertTriangle, Check, Copy,
  Clock, Code2, X, Brain, Folder, FileCode, FileText, Info,
  ChevronDown, ChevronRight as ChevRight, Circle, GitBranch,
  Share2, Cpu, ArrowRight, Hash, Settings, Keyboard, Database,
  Download, RotateCcw, FolderOpen, CircleDot
} from 'lucide-react';
import { traceCode, executeCode, explainStep, healthCheck } from './api';
import { examplePrograms } from './data/examples';
import './App.css';

// ── Default code ──
const DEFAULT_CODE = `#include <iostream>
using namespace std;

int main() {
    int a = 5;
    int b = 10;
    int sum = a + b;

    if (sum > 10) {
        cout << "Sum is greater than 10" << endl;
    } else {
        cout << "Sum is 10 or less" << endl;
    }

    for (int i = 0; i < 3; i++) {
        cout << "i = " << i << endl;
    }

    return 0;
}`;

// ── Map example programs to file tree entries ──
const INITIAL_FILES = [
  { id: 'default', name: 'main.cpp', code: DEFAULT_CODE, category: 'Custom' },
  ...examplePrograms.map(e => ({
    id: e.id, name: e.id.replace(/-/g, '_') + '.cpp',
    code: e.code, category: e.category, title: e.title, desc: e.description,
  })),
];

// ── Type sizes for memory panel ──
const TYPE_SIZES = {
  int: 4, double: 8, float: 4, char: 1, bool: 1, 'long long': 8, short: 2,
  string: 32, 'int*': 8, 'double*': 8,
};
function estimateSize(type) {
  if (!type) return 4;
  const t = type.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_SIZES)) { if (t.includes(k)) return v; }
  if (t.includes('vector')) return 24;
  return 4;
}

// ── Helper to format timestamps ──
function fmtTime(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

// ── Event labels ──
const EVT = {
  program_start: 'Program Start', program_end: 'Program End',
  line: 'Statement', condition: 'Condition',
  loop_start: 'Loop Iter', function_call: 'Fn Call',
  function_return: 'Fn Return', output: 'Output',
};

// ── Var type helpers ──
function varIcon(type) {
  if (!type) return 'type-other';
  const t = type.toLowerCase();
  if (t.includes('vector') || t.includes('[]')) return 'type-vec';
  if (t.includes('*')) return 'type-ptr';
  if (t.includes('int') || t.includes('long') || t.includes('short')) return 'type-int';
  if (t.includes('double') || t.includes('float')) return 'type-double';
  if (t.includes('string')) return 'type-string';
  if (t.includes('bool')) return 'type-bool';
  if (t.includes('char')) return 'type-char';
  return 'type-other';
}
function varShort(type) {
  if (!type) return '?';
  const t = type.toLowerCase();
  if (t.includes('vector')) return '[]'; if (t.includes('*')) return '*';
  if (t.includes('int')) return 'i'; if (t.includes('double')) return 'd';
  if (t.includes('float')) return 'f'; if (t.includes('string')) return 's';
  if (t.includes('bool')) return 'b'; if (t.includes('char')) return 'c';
  return '?';
}

// ══════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════
export default function App() {
  // ── Files & Tabs ──
  const [files] = useState(INITIAL_FILES);
  const [openTabs, setOpenTabs] = useState([{ id: 'default', name: 'main.cpp' }]);
  const [activeFileId, setActiveFileId] = useState('default');
  const [fileContents, setFileContents] = useState({ default: DEFAULT_CODE });
  const [modifiedFiles, setModifiedFiles] = useState(new Set());

  // Current code is driven by active file
  const code = fileContents[activeFileId] || '';
  const setCode = (val) => {
    setFileContents(prev => ({ ...prev, [activeFileId]: val }));
    setModifiedFiles(prev => new Set(prev).add(activeFileId));
  };

  // ── Trace state ──
  const [trace, setTrace] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isTracing, setIsTracing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [execTime, setExecTime] = useState(null);
  const [traceReady, setTraceReady] = useState(false);

  // ── Playback ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(500);
  const playRef = useRef(null);

  // ── AI ──
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [autoExplain, setAutoExplain] = useState(false);

  // ── UI ──
  const [showExamples, setShowExamples] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [bottomTab, setBottomTab] = useState('variables');
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [breakpoints, setBreakpoints] = useState(new Set());

  // ── Editor ref ──
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // ── Health check ──
  useEffect(() => {
    healthCheck().then(d => {
      if (d.status === 'ok') { setServerOnline(true); addLog('Server connected', 'info'); }
    }).catch(() => { setServerOnline(false); addLog('Server offline', 'error'); });
  }, []);

  // ── Toast system ──
  const toast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Console logging ──
  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [...prev, { ts: new Date(), msg, type }]);
  }, []);

  // ──────────────────────────────
  // FILE OPERATIONS
  // ──────────────────────────────
  const openFile = (fileId) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    // Load code if not already loaded
    if (!fileContents[fileId]) {
      setFileContents(prev => ({ ...prev, [fileId]: file.code }));
    }
    // Add to tabs if not open
    if (!openTabs.find(t => t.id === fileId)) {
      setOpenTabs(prev => [...prev, { id: fileId, name: file.name }]);
    }
    setActiveFileId(fileId);
    // Clear trace when switching files
    setTrace([]); setTraceReady(false); setOutput(''); setError(''); setAiText('');
    stopPlayback();
    addLog(`Opened ${file.name}`, 'info');
  };

  const closeTab = (fileId, e) => {
    e?.stopPropagation();
    if (openTabs.length <= 1) return; // Keep at least one tab
    setOpenTabs(prev => prev.filter(t => t.id !== fileId));
    if (activeFileId === fileId) {
      const remaining = openTabs.filter(t => t.id !== fileId);
      setActiveFileId(remaining[remaining.length - 1]?.id || 'default');
    }
  };

  // ──────────────────────────────
  // BREAKPOINTS
  // ──────────────────────────────
  const toggleBreakpoint = (line) => {
    setBreakpoints(prev => {
      const next = new Set(prev);
      if (next.has(line)) { next.delete(line); toast(`Breakpoint removed: line ${line}`, 'info'); }
      else { next.add(line); toast(`Breakpoint set: line ${line}`, 'success'); }
      return next;
    });
  };

  const removeBreakpoint = (line) => {
    setBreakpoints(prev => { const n = new Set(prev); n.delete(line); return n; });
  };

  const nextBreakpoint = () => {
    if (!traceReady || breakpoints.size === 0) return;
    for (let i = currentStep + 1; i < trace.length; i++) {
      if (breakpoints.has(trace[i].line)) { stopPlayback(); setCurrentStep(i); return; }
    }
    toast('No more breakpoints ahead', 'info');
  };

  // ──────────────────────────────
  // TRACE
  // ──────────────────────────────
  const handleTrace = async () => {
    setIsTracing(true); setError(''); setOutput(''); setTrace([]); setCurrentStep(0);
    setTraceReady(false); setAiText(''); stopPlayback();
    addLog('Starting trace...', 'info');
    const t0 = Date.now();
    try {
      const result = await traceCode(code);
      const elapsed = Date.now() - t0;
      if (result.success && result.trace?.length > 0) {
        setTrace(result.trace); setCurrentStep(0);
        setOutput(result.output || ''); setExecTime(result.executionTime || elapsed);
        setTraceReady(true);
        addLog(`Compiled successfully (${elapsed}ms)`, 'info');
        addLog(`Trace: ${result.trace.length} steps`, 'info');
        if (result.output) addLog(`Output: ${result.output.trim().substring(0, 80)}`, 'info');
        toast(`Trace complete — ${result.trace.length} steps`, 'success');
      } else {
        setError(result.error || 'Trace failed.');
        addLog(result.error || 'Trace failed', 'error');
        toast('Trace failed', 'error');
      }
    } catch { setError('Connection failed.'); addLog('Connection failed', 'error'); toast('Server unreachable', 'error'); }
    setIsTracing(false);
  };

  // ──────────────────────────────
  // RUN (no trace)
  // ──────────────────────────────
  const handleRun = async () => {
    setIsRunning(true); setError(''); setOutput(''); setTrace([]); setTraceReady(false); setAiText('');
    stopPlayback(); addLog('Running code...', 'info');
    try {
      const result = await executeCode(code);
      setOutput(result.output || ''); setExecTime(result.executionTime);
      if (!result.success) { setError(result.error || 'Failed.'); addLog(result.error || 'Error', 'error'); }
      else { addLog(`Ran in ${result.executionTime}ms`, 'info'); toast('Execution complete', 'success'); }
    } catch { setError('Connection failed.'); addLog('Connection failed', 'error'); }
    setIsRunning(false);
  };

  // ──────────────────────────────
  // PLAYBACK
  // ──────────────────────────────
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playRef.current) { clearInterval(playRef.current); playRef.current = null; }
  }, []);

  const startPlayback = useCallback(() => {
    setIsPlaying(true);
    playRef.current = setInterval(() => {
      setCurrentStep(p => {
        if (p >= trace.length - 1) { stopPlayback(); return p; }
        return p + 1;
      });
    }, playSpeed);
  }, [trace.length, playSpeed, stopPlayback]);

  const togglePlay = useCallback(() => {
    isPlaying ? stopPlayback() : startPlayback();
  }, [isPlaying, stopPlayback, startPlayback]);

  useEffect(() => () => { if (playRef.current) clearInterval(playRef.current); }, []);
  useEffect(() => { if (isPlaying) { stopPlayback(); startPlayback(); } }, [playSpeed]);

  const stepFwd = () => { stopPlayback(); setCurrentStep(p => Math.min(p + 1, trace.length - 1)); };
  const stepBack = () => { stopPlayback(); setCurrentStep(p => Math.max(p - 1, 0)); };
  const goStart = () => { stopPlayback(); setCurrentStep(0); };
  const goEnd = () => { stopPlayback(); setCurrentStep(trace.length - 1); };

  // ──────────────────────────────
  // AI EXPLANATION
  // ──────────────────────────────
  const handleExplain = async () => {
    if (!traceReady || !trace[currentStep]) return;
    setAiLoading(true);
    try {
      const s = trace[currentStep];
      const result = await explainStep({
        code, step: s, variables: s.variables, functionName: s.function,
        line: s.line, event: s.event, callStack: s.callStack, depth: s.depth,
      });
      setAiText(result.explanation || 'No explanation available.');
    } catch { setAiText('AI unavailable. Configure Gemini API key in server/.env'); }
    setAiLoading(false);
  };

  // ── DERIVED STATE (must be before effects that use these) ──
  const cur = traceReady && trace[currentStep] ? trace[currentStep] : null;
  const curVars = cur?.variables || {};
  const curStack = cur?.callStack || [];
  const curLine = cur?.line || -1;
  const curEvent = cur?.event || '';
  const curFunc = cur?.function || '';
  const prevVars = currentStep > 0 && trace[currentStep - 1] ? trace[currentStep - 1].variables : {};

  // Auto-explain on step change
  useEffect(() => {
    if (autoExplain && traceReady && trace[currentStep]) handleExplain();
  }, [currentStep, autoExplain, traceReady]);

  // ──────────────────────────────
  // EDITOR DECORATIONS (highlight active trace line)
  // ──────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Active trace line
    const decorations = [];
    if (traceReady && cur) {
      decorations.push({
        range: new monaco.Range(curLine, 1, curLine, 1),
        options: {
          isWholeLine: true,
          className: 'trace-active-line',
          glyphMarginClassName: 'trace-glyph-active',
          overviewRuler: { color: '#00d4aa', position: monaco.editor.OverviewRulerLane.Left },
        },
      });

      // Inline variable hint
      const varEntries = Object.entries(curVars);
      if (varEntries.length > 0) {
        const hint = varEntries.map(([k, v]) => {
          const val = typeof v === 'object' ? v.value : v;
          return `${k}=${val}`;
        }).join(', ');
        decorations.push({
          range: new monaco.Range(curLine, 1, curLine, 1),
          options: {
            after: {
              content: `  // ${hint}`,
              inlineClassName: 'trace-inline-hint',
            },
          },
        });
      }
    }

    // Breakpoint glyphs
    breakpoints.forEach(line => {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'breakpoint-glyph' },
      });
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  }, [currentStep, traceReady, breakpoints, curLine]);

  // ──────────────────────────────
  // KEYBOARD SHORTCUTS
  // ──────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); handleTrace(); }
      if (e.key === 'F10') { e.preventDefault(); stepFwd(); }
      if (e.key === 'F9') { e.preventDefault(); if (curLine > 0) toggleBreakpoint(curLine); }
      if (e.key === ' ' && traceReady) { e.preventDefault(); togglePlay(); }
      if (e.key === 'Escape') { stopPlayback(); setShowExamples(false); setShowShortcuts(false); setShowSettings(false); }
      if (e.ctrlKey && e.key === 'r') { e.preventDefault(); handleRun(); }
      if (e.key === '?') setShowShortcuts(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [traceReady, curLine, trace.length]);

  // ──────────────────────────────
  // SHARE (copy code to clipboard)
  // ──────────────────────────────
  const handleShare = async () => {
    try { await navigator.clipboard.writeText(code); toast('Code copied to clipboard!', 'success'); }
    catch { toast('Failed to copy', 'error'); }
  };

  // Export trace as JSON
  const handleExportTrace = () => {
    if (!traceReady) return;
    const blob = new Blob([JSON.stringify({ code, trace, output }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tracemind-trace.json'; a.click();
    URL.revokeObjectURL(url);
    toast('Trace exported!', 'success');
  };

  // ──────────────────────────────
  // EXAMPLES
  // ──────────────────────────────
  const loadExample = (ex) => {
    const file = files.find(f => f.id === ex.id);
    if (file) { openFile(file.id); }
    setShowExamples(false);
    setTrace([]); setTraceReady(false); setOutput(''); setError(''); setAiText('');
    stopPlayback();
    setLogs([{ ts: new Date(), msg: `Loaded: ${ex.title}`, type: 'info' }]);
    toast(`Loaded: ${ex.title}`, 'success');
  };

  // ──────────────────────────────
  // SIDEBAR TOGGLE
  // ──────────────────────────────
  const toggleSection = (id) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // (derived state declared earlier, before effects)

  const getDesc = () => {
    if (!cur) return '';
    const v = Object.entries(curVars).map(([k, info]) => {
      const val = typeof info === 'object' ? info.value : info;
      return `${k} = ${val}`;
    }).join(', ');
    return `Line ${curLine} in ${curFunc}()${v ? ` — ${v}` : ''}`;
  };

  // Memory calculations
  const memVars = Object.entries(curVars).map(([name, info]) => {
    const type = typeof info === 'object' ? info.type : '';
    const val = typeof info === 'object' ? info.value : info;
    return { name, type, value: val, size: estimateSize(type) };
  });
  const totalMem = memVars.reduce((s, v) => s + v.size, 0);

  // Active file
  const activeFile = files.find(f => f.id === activeFileId);

  // ══════════════════════════════
  // RENDER
  // ══════════════════════════════
  return (
    <>
      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo">TM</div>
          <div>
            <div className="nav-title">TraceMind</div>
            <div className="nav-subtitle">Code Visualizer</div>
          </div>
        </div>

        <div className="nav-tabs">
          {openTabs.map(tab => (
            <div key={tab.id} className={`nav-tab ${tab.id === activeFileId ? 'active' : ''}`}
              onClick={() => openFile(tab.id)}>
              <span className="tab-dot" />
              {tab.name}
              {modifiedFiles.has(tab.id) && <span style={{ color: 'var(--accent-yellow)', marginLeft: 2 }}>●</span>}
              {openTabs.length > 1 && (
                <span className="tab-close" onClick={e => closeTab(tab.id, e)}>×</span>
              )}
            </div>
          ))}
        </div>

        <div className="nav-breadcrumb">
          <span>C++</span> / <span>{activeFile?.category || 'Custom'}</span> / <span>{activeFile?.name || 'main.cpp'}</span>
        </div>

        <div className="nav-spacer" />

        <div className="nav-actions">
          <button className="nav-btn" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)">
            <Keyboard size={13} />
          </button>
          <button className="nav-btn" onClick={() => setShowExamples(true)}>
            <BookOpen size={13} /> Examples
          </button>
          <button className="nav-btn" onClick={handleShare} title="Copy code to clipboard">
            <Share2 size={13} /> Share
          </button>
          {traceReady && (
            <button className="nav-btn" onClick={handleExportTrace} title="Export trace as JSON">
              <Download size={13} /> Export
            </button>
          )}
          <div className={`nav-status-pill ${serverOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {serverOnline ? 'AI online' : 'Offline'}
          </div>
          <button className="nav-btn" onClick={() => setShowSettings(s => !s)} title="Settings">
            <Settings size={13} />
          </button>
        </div>
      </nav>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="settings-dropdown">
          <div className="settings-item" onClick={() => setAutoExplain(v => !v)}>
            Auto AI Explain
            <span className={`settings-toggle ${autoExplain ? 'on' : ''}`} />
          </div>
          <div className="settings-item" onClick={handleExportTrace}>
            <Download size={13} /> Export Trace JSON
          </div>
          <div className="settings-item" onClick={() => { setLogs([]); toast('Console cleared', 'info'); }}>
            <RotateCcw size={13} /> Clear Console
          </div>
          <div className="settings-item" onClick={() => { setBreakpoints(new Set()); toast('All breakpoints cleared', 'info'); }}>
            <X size={13} /> Clear Breakpoints
          </div>
        </div>
      )}

      {/* ── MAIN LAYOUT ── */}
      <div className="app-main">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="sidebar">
          {/* File Explorer */}
          <div className="sidebar-section">
            <div className={`sidebar-header ${collapsedSections.files ? 'collapsed' : ''}`}
              onClick={() => toggleSection('files')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronDown size={12} className="toggle-chevron" /> File Explorer
              </span>
            </div>
            <div className={`sidebar-section-body ${collapsedSections.files ? 'collapsed' : ''}`}
              style={{ maxHeight: collapsedSections.files ? 0 : 300 }}>
              <div className="file-tree">
                {files.map(f => (
                  <div key={f.id}
                    className={`file-item ${f.id === activeFileId ? 'active' : ''} ${modifiedFiles.has(f.id) ? 'modified' : ''}`}
                    onClick={() => openFile(f.id)}>
                    <FileCode size={14} />
                    {f.name}
                    {modifiedFiles.has(f.id) && <span className="file-dot" />}
                    {f.id === activeFileId && <span className="file-badge">active</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Execution */}
          <div className="sidebar-section">
            <div className={`sidebar-header ${collapsedSections.exec ? 'collapsed' : ''}`}
              onClick={() => toggleSection('exec')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronDown size={12} className="toggle-chevron" /> Execution
              </span>
            </div>
            <div className={`sidebar-section-body ${collapsedSections.exec ? 'collapsed' : ''}`}
              style={{ maxHeight: collapsedSections.exec ? 0 : 500 }}>
              <div className="run-section">
                <button className="run-btn" onClick={handleTrace} disabled={isTracing || isRunning}>
                  {isTracing ? <><span className="spinner" /> Tracing...</>
                    : <><Zap size={16} /> Run visualization ⚡</>}
                </button>
              </div>

              <div className="playback-section">
                <div className="playback-row">
                  <button className="pb-btn" onClick={goStart} title="Go to start (Home)"><SkipBack size={14} /></button>
                  <button className="pb-btn" onClick={stepBack} title="Step back"><ChevronLeft size={16} /></button>
                  <button className="pb-btn play-main" onClick={togglePlay} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button className="pb-btn" onClick={stepFwd} title="Step forward (F10)"><ChevronRight size={16} /></button>
                  <button className="pb-btn" onClick={goEnd} title="Go to end (End)"><SkipForward size={14} /></button>
                  <div className="speed-select">
                    <select value={playSpeed} onChange={e => setPlaySpeed(+e.target.value)}>
                      <option value={2000}>0.25x</option>
                      <option value={1000}>0.5x</option>
                      <option value={500}>1.0x</option>
                      <option value={250}>2.0x</option>
                      <option value={100}>5.0x</option>
                      <option value={50}>10x</option>
                    </select>
                  </div>
                </div>

                <div className="step-info"><span className="step-label">Current Step</span></div>
                <div className="step-counter">
                  {traceReady ? currentStep + 1 : '—'}
                  <span> / {traceReady ? trace.length : '—'}</span>
                </div>
                <input type="range" className="step-slider"
                  min={0} max={Math.max(trace.length - 1, 0)} value={currentStep}
                  onChange={e => { stopPlayback(); setCurrentStep(+e.target.value); }}
                  disabled={!traceReady} />
                <div className="step-meta">
                  <span>{execTime ? `${execTime} ms` : '— ms'}</span>
                  <span>{traceReady ? `${trace.length} steps` : '— steps'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakpoints */}
          <div className="sidebar-section">
            <div className={`sidebar-header ${collapsedSections.bp ? 'collapsed' : ''}`}
              onClick={() => toggleSection('bp')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronDown size={12} className="toggle-chevron" /> Breakpoints
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{breakpoints.size}</span>
            </div>
            <div className={`sidebar-section-body ${collapsedSections.bp ? 'collapsed' : ''}`}
              style={{ maxHeight: collapsedSections.bp ? 0 : 200 }}>
              <div className="breakpoints-section">
                {breakpoints.size === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>
                    Click gutter in editor or press F9
                  </div>
                ) : (
                  [...breakpoints].sort((a, b) => a - b).map(line => (
                    <div key={line} className="bp-item">
                      <span className="bp-dot" />
                      {activeFile?.name || 'main.cpp'}:{line}
                      <span className="bp-status" onClick={() => removeBreakpoint(line)}
                        style={{ cursor: 'pointer' }} title="Remove">ON</span>
                    </div>
                  ))
                )}
                {traceReady && breakpoints.size > 0 && (
                  <button className="pb-btn" onClick={nextBreakpoint} title="Run to next breakpoint"
                    style={{ fontSize: 10, width: 'auto', padding: '3px 8px', color: 'var(--accent)', marginTop: 4 }}>
                    ▶ Next BP
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sidebar-footer">
            <span className="engine-dot" />
            <span className="engine-label">Visualizer engine</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
              {execTime ? `${execTime}ms` : '—'}
            </span>
          </div>
        </aside>

        {/* ── CENTER: Editor + Viz + Bottom ── */}
        <div className="center-content">
          <div className="editor-and-viz">
            {/* Editor column */}
            <div className="editor-col">
              <div className="editor-top-bar">
                <span className="editor-lang-badge">C++ <ChevronDown size={10} /></span>
                <span className="editor-func-badge">
                  ƒ <span className="fn-name">{curFunc || 'main'}</span>()
                </span>
                {traceReady && <span className="live-dot">LIVE TRACE</span>}
              </div>

              <div className="editor-wrap">
                <Editor
                  height="100%"
                  defaultLanguage="cpp"
                  value={code}
                  onChange={v => setCode(v || '')}
                  theme="vs-dark"
                  options={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 13, lineHeight: 22,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 8, bottom: 8 },
                    renderLineHighlight: 'line',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    bracketPairColorization: { enabled: true },
                    glyphMargin: true, folding: true,
                    lineDecorationsWidth: 14,
                    lineNumbersMinChars: 3,
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    monacoRef.current = monaco;

                    // Custom theme
                    monaco.editor.defineTheme('tracemind', {
                      base: 'vs-dark', inherit: true,
                      rules: [
                        { token: 'comment', foreground: '484f58', fontStyle: 'italic' },
                        { token: 'keyword', foreground: 'ff7b72' },
                        { token: 'string', foreground: 'a5d6ff' },
                        { token: 'number', foreground: '79c0ff' },
                        { token: 'type', foreground: 'ffa657' },
                        { token: 'function', foreground: 'd2a8ff' },
                      ],
                      colors: {
                        'editor.background': '#0d1117',
                        'editor.foreground': '#e6edf3',
                        'editor.lineHighlightBackground': '#161b2280',
                        'editor.selectionBackground': '#264f7840',
                        'editorLineNumber.foreground': '#30363d',
                        'editorLineNumber.activeForeground': '#8b949e',
                        'editorGutter.background': '#0d1117',
                        'editorIndentGuide.background': '#21262d',
                        'editorCursor.foreground': '#00d4aa',
                        'editor.lineHighlightBorder': '#00000000',
                      },
                    });
                    monaco.editor.setTheme('tracemind');

                    // Glyph margin click → toggle breakpoint
                    editor.onMouseDown(e => {
                      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                        toggleBreakpoint(e.target.position.lineNumber);
                      }
                    });
                  }}
                />
              </div>

              <div className="editor-footer">
                <Hash size={12} />
                {curEvent && traceReady
                  ? `${EVT[curEvent] || curEvent} at line ${curLine} in ${curFunc}()`
                  : 'Write C++ code and press F5 or click "Run visualization" to trace'
                }
              </div>
            </div>

            {/* Right Visualization column */}
            <div className="viz-col">
              <div className="viz-header">
                <span className="viz-title">Live Visualization</span>
                {traceReady && <span className="viz-frame-info">STEP {currentStep + 1} / {trace.length}</span>}
              </div>
              <div className="viz-body">
                {traceReady && cur ? (
                  <>
                    <div className="step-explain-card" key={currentStep}>
                      <h3><Zap size={16} color="var(--accent)" />{EVT[curEvent] || curEvent}</h3>
                      <div className="step-desc">{getDesc()}</div>
                    </div>

                    {Object.keys(curVars).length > 0 && (
                      <div>
                        <div className="viz-var-label">Variables · {curFunc}()</div>
                        <div className="viz-var-display">
                          {Object.entries(curVars).map(([name, info]) => {
                            const val = typeof info === 'object' ? info.value : info;
                            const pv = prevVars?.[name]; const prev = pv ? (typeof pv === 'object' ? pv.value : pv) : undefined;
                            const changed = prev !== undefined && String(prev) !== String(val);
                            return (
                              <div key={name} className={`viz-array-box ${changed ? 'highlighted' : ''}`}
                                title={`${name}: ${typeof info === 'object' ? info.type : ''} = ${val}`}>
                                {String(val).length <= 4 ? val : '…'}
                                <span className="arr-idx">{name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="viz-info-pill">
                      <ArrowRight size={14} color="var(--accent)" />
                      {curEvent === 'function_call' && `Entering ${curFunc}()`}
                      {curEvent === 'function_return' && `Returning from ${curFunc}()`}
                      {curEvent === 'condition' && `Evaluating condition at line ${curLine}`}
                      {curEvent === 'loop_start' && `Loop iteration at line ${curLine}`}
                      {curEvent === 'output' && `Output: ${cur.output || ''}`}
                      {curEvent === 'line' && `Executing line ${curLine}`}
                      {curEvent === 'program_start' && 'Program execution started'}
                      {curEvent === 'program_end' && 'Program execution completed'}
                    </div>

                    <div className="ai-insight-card">
                      <div className="ai-insight-header">
                        <span className="ai-insight-badge"><Sparkles size={14} /> AI Insight</span>
                        <span className="ai-insight-type">Contextual</span>
                        {aiText && <span className="ai-confidence">Gemini</span>}
                      </div>
                      {aiLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                          <div className="ai-loading-dots"><span /><span /><span /></div> Analyzing...
                        </div>
                      ) : aiText ? (
                        <div className="ai-insight-text">{aiText}</div>
                      ) : (
                        <div className="ai-insight-text" style={{ color: 'var(--text-muted)' }}>
                          Click below for an AI-powered explanation of this step.
                        </div>
                      )}
                      <div className="ai-question" onClick={handleExplain}>
                        <Brain size={14} />
                        {aiText ? 'Explain this step again' : 'What happens at this step?'}
                        <ArrowRight size={12} style={{ marginLeft: 'auto' }} />
                      </div>
                    </div>
                  </>
                ) : error ? (
                  <div className="error-box"><AlertTriangle size={16} /><pre>{error}</pre></div>
                ) : output ? (
                  <>
                    <div className="step-explain-card">
                      <h3><Terminal size={16} color="var(--accent-green)" /> Program Output</h3>
                      <pre className="output-pre">{output}</pre>
                    </div>
                    {execTime && <div className="viz-info-pill"><Clock size={14} color="var(--accent)" />Completed in {execTime}ms</div>}
                  </>
                ) : (
                  <WelcomeViz onExamples={() => setShowExamples(true)} />
                )}
              </div>
            </div>
          </div>

          {/* ── BOTTOM PANELS ── */}
          <div className="bottom-panels">
            <div className="bottom-tabs">
              <BTab id="variables" label="Variables / Scope" icon={<Code2 size={13} />}
                count={Object.keys(curVars).length} active={bottomTab} set={setBottomTab} />
              <BTab id="callstack" label="Call Stack" icon={<Layers size={13} />}
                count={curStack.length} suffix="frames" active={bottomTab} set={setBottomTab} />
              <BTab id="memory" label="Memory" icon={<Database size={13} />}
                count={totalMem ? `${totalMem} B` : ''} active={bottomTab} set={setBottomTab} />
              <BTab id="console" label="Console" icon={<Terminal size={13} />}
                count={logs.length} active={bottomTab} set={setBottomTab} />
              <BTab id="trace-output" label="Trace Output" icon={<CircleDot size={13} />}
                count={trace.length ? trace.length : ''} active={bottomTab} set={setBottomTab} />
            </div>
            <div className="bottom-content">
              {bottomTab === 'variables' && <VarsPanel vars={curVars} prev={prevVars} func={curFunc} />}
              {bottomTab === 'callstack' && <CallStackPanel stack={curStack} />}
              {bottomTab === 'memory' && <MemoryPanel vars={memVars} total={totalMem} />}
              {bottomTab === 'console' && <ConsolePanel logs={logs} output={output} error={error} execTime={execTime} />}
              {bottomTab === 'trace-output' && <TraceOutputPanel trace={trace} currentStep={currentStep} setStep={s => { stopPlayback(); setCurrentStep(s); }} />}
            </div>
          </div>
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <StatusBar
        traceReady={traceReady} isPlaying={isPlaying} curLine={curLine}
        currentStep={currentStep} trace={trace} execTime={execTime}
        breakpoints={breakpoints} stepFwd={stepFwd} stepBack={stepBack}
        handleRun={handleRun} handleExplain={handleExplain}
        isRunning={isRunning}
      />

      {/* ── TOASTS ── */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.type}`}>
              {t.type === 'success' ? <Check size={14} /> : t.type === 'error' ? <AlertTriangle size={14} /> : <Info size={14} />}
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── MODALS ── */}
      {showExamples && <ExamplesModal examples={examplePrograms} onLoad={loadExample} onClose={() => setShowExamples(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

// ══════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════

function BTab({ id, label, icon, count, suffix, active, set }) {
  return (
    <button className={`bottom-tab ${active === id ? 'active' : ''}`} onClick={() => set(id)}>
      {icon} {label}
      {count !== undefined && count !== '' && (
        <span className="tab-count">{count}{suffix ? ` ${suffix}` : ''}</span>
      )}
    </button>
  );
}

function VarsPanel({ vars, prev, func }) {
  const entries = Object.entries(vars || {});
  if (!entries.length) return <div className="empty-state"><Code2 size={20} /><div>No variables in scope</div></div>;
  return (
    <div className="vars-panel">
      <div className="vars-scope-header">
        <ArrowRight size={12} /> {func || 'global'}()
        <span className="vars-scope-tag">LOCAL</span>
      </div>
      {entries.map(([name, info]) => {
        const val = typeof info === 'object' ? info.value : info;
        const type = typeof info === 'object' ? info.type : '';
        const pv = prev?.[name]; const prevVal = pv ? (typeof pv === 'object' ? pv.value : pv) : undefined;
        const changed = prevVal !== undefined && String(prevVal) !== String(val);
        const disp = String(val).length > 30 ? String(val).substring(0, 30) + '…' : String(val);
        const cls = type?.includes('string') ? 'str' : (typeof val === 'number' || !isNaN(val) ? 'num' : '');
        return (
          <div key={name} className={`var-row ${changed ? 'changed' : ''}`}>
            <span className={`var-icon ${varIcon(type)}`}>{varShort(type)}</span>
            <span className="var-name">{name}</span>
            <span className="var-type-label">{type}</span>
            <span className={`var-value ${cls}`}>{disp}</span>
          </div>
        );
      })}
    </div>
  );
}

function CallStackPanel({ stack }) {
  if (!stack?.length) return <div className="empty-state"><Layers size={20} /><div>Call stack empty</div></div>;
  return (
    <div className="callstack-panel">
      {[...stack].reverse().map((frame, i) => (
        <div key={i} className="cs-frame">
          <div className="cs-frame-icon">#{stack.length - i}</div>
          <div className="cs-frame-info">
            <div className="cs-frame-name">{(frame.name || frame)}()</div>
            <div className="cs-frame-detail">{frame.args ? `args: ${frame.args}` : 'main entry'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryPanel({ vars, total }) {
  if (!vars.length) return <div className="empty-state"><Database size={20} /><div>No variables allocated</div></div>;
  const maxSize = Math.max(...vars.map(v => v.size), 1);
  let addrOffset = 0;
  return (
    <div className="memory-panel">
      <div className="mem-header">
        <span>Memory Layout</span>
        <span className="mem-total">{total} B allocated</span>
      </div>
      {vars.map((v, i) => {
        const addr = `0x${(0x7FFE0000 + addrOffset).toString(16).toUpperCase()}`;
        addrOffset += v.size;
        return (
          <div key={i} className="mem-row">
            <span className="mem-addr">{addr}</span>
            <span className="mem-name">{v.name}</span>
            <span className="mem-type">{v.type}</span>
            <div className="mem-bar">
              <div className="mem-bar-fill" style={{ width: `${(v.size / maxSize) * 100}%` }} />
            </div>
            <span className="mem-size">{v.size}B</span>
          </div>
        );
      })}
    </div>
  );
}

function ConsolePanel({ logs, output, error, execTime }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [logs]);
  return (
    <div className="console-panel" ref={ref}>
      {logs.map((l, i) => (
        <div key={i} className="console-line">
          <span className="console-ts">[{fmtTime(l.ts)}]</span>
          <span className={`console-msg ${l.type}`}>{l.msg}</span>
        </div>
      ))}
      {output && (
        <div className="console-result">
          <span className="result-icon"><Circle size={12} /></span>
          <span className="result-text">{output.trim().split('\n')[0]}{output.split('\n').length > 1 ? ` (+${output.split('\n').length - 1} lines)` : ''}</span>
          {execTime && <span className="result-time">{execTime} ms</span>}
        </div>
      )}
      {error && <div className="console-line"><span className="console-ts">[{fmtTime(new Date())}]</span><span className="console-msg error">{error.substring(0, 150)}</span></div>}
      {!logs.length && !output && !error && <div className="empty-state"><Terminal size={20} /><div>Console output appears here</div></div>}
    </div>
  );
}

function TraceOutputPanel({ trace, currentStep, setStep }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.trace-line.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [currentStep]);
  if (!trace.length) return <div className="empty-state"><CircleDot size={20} /><div>Run a trace to see step-by-step output</div></div>;
  return (
    <div className="trace-output-panel" ref={ref}>
      {trace.map((s, i) => (
        <div key={i} className={`trace-line ${i === currentStep ? 'active' : ''}`}
          onClick={() => setStep(i)} style={{ cursor: 'pointer' }}>
          <span className="tl-step">{i + 1}</span>
          <span className="tl-event">{EVT[s.event] || s.event}</span>
          <span className="tl-func">{s.function}()</span>
          <span className="tl-line">L{s.line}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBar({ traceReady, isPlaying, curLine, currentStep, trace, execTime, breakpoints, stepFwd, stepBack, handleRun, handleExplain, isRunning }) {
  return (
    <div className="statusbar">
      <div className="sb-item"><GitBranch size={12} /> main</div>
      <div className="sb-divider" />
      <div className="sb-item">
        <span className="sb-dot" style={{ background: breakpoints.size > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }} />
        {breakpoints.size} breakpoint{breakpoints.size !== 1 ? 's' : ''}
      </div>
      <div className="sb-divider" />
      <div className="sb-item">C++17</div>
      <div className="sb-divider" />
      <div className="sb-item">g++ 6.3.0</div>
      <div className="sb-divider" />
      <div className="sb-item">
        <span className={`sb-dot ${traceReady ? (isPlaying ? 'running' : 'paused') : 'idle'}`} />
        <span className={traceReady ? (isPlaying ? 'sb-accent' : 'sb-warning') : ''}>
          {traceReady ? (isPlaying ? 'RUNNING' : 'PAUSED') : 'IDLE'}
        </span>
      </div>
      <div className="sb-divider" />
      <div className="sb-item">{execTime ? `${execTime} ms` : '— ms'}</div>
      {traceReady && <>
        <div className="sb-divider" />
        <div className="sb-item sb-accent">Step {currentStep + 1}/{trace.length}</div>
      </>}
      <div className="sb-spacer" />
      <div className="sb-btn" onClick={stepBack} title="Step Back">Step ←</div>
      <div className="sb-btn" onClick={stepFwd} title="Step Forward (F10)">F10 →</div>
      <div className="sb-btn" onClick={handleRun}>{isRunning ? '⏳ Running...' : '▶ Run'}</div>
      <div className="sb-divider" />
      <div className="sb-btn primary" onClick={handleExplain}><Sparkles size={11} /> AI explain</div>
      <div className="sb-divider" />
      <div className="sb-engine"><Cpu size={10} /> TraceMind Engine 1.0</div>
    </div>
  );
}

function WelcomeViz({ onExamples }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo"><Zap size={36} /></div>
      <h2>Welcome to TraceMind</h2>
      <p>Write C++ code in the editor, then click <strong>Run visualization</strong> or press <kbd style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: 11, border: '1px solid var(--border)' }}>F5</kbd> to trace step-by-step execution.</p>
      <div className="welcome-steps">
        <div className="w-step"><div className="w-step-num">1</div><div className="w-step-text">Write C++ code or load an example</div></div>
        <div className="w-step"><div className="w-step-num">2</div><div className="w-step-text">Click Run visualization (F5)</div></div>
        <div className="w-step"><div className="w-step-num">3</div><div className="w-step-text">Step through with F10 or Space</div></div>
      </div>
      <button className="welcome-btn" onClick={onExamples}><BookOpen size={14} /> Load an Example</button>
    </div>
  );
}

function ExamplesModal({ examples, onLoad, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📚 Example Programs</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-list">
          {examples.map(ex => (
            <div key={ex.id} className="modal-item" onClick={() => onLoad(ex)}>
              <div className="modal-item-cat">{ex.category}</div>
              <div className="modal-item-title">{ex.title}</div>
              <div className="modal-item-desc">{ex.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutsModal({ onClose }) {
  const shortcuts = [
    ['Run Trace', 'F5'],
    ['Step Forward', 'F10'],
    ['Toggle Breakpoint', 'F9'],
    ['Play / Pause', 'Space'],
    ['Run (no trace)', 'Ctrl+R'],
    ['Close Modal', 'Esc'],
    ['Show Shortcuts', '?'],
    ['Stop Playback', 'Esc'],
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="shortcuts-grid" style={{ padding: '12px 20px' }}>
          {shortcuts.map(([label, key]) => (
            <div key={label} className="shortcut-row">
              <span className="shortcut-label">{label}</span>
              <div className="shortcut-keys">
                {key.split('+').map(k => <span key={k} className="kbd">{k}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
