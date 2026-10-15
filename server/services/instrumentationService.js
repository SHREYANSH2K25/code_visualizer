// server/services/instrumentationService.js
// ============================================================
// TraceMind C++ Source Code Instrumentation Engine
//
// This is the core of TraceMind. It transforms supported C++
// source code into an instrumented version that records
// execution trace information (variables, call stack, etc.)
// to a JSON file at runtime.
//
// Approach: Regex-based line-by-line analysis with context
// tracking (current function, scope depth, known variables).
//
// Supported constructs:
// - int, double, float, char, bool, string, long long variables
// - Arithmetic and assignment
// - if/else if/else
// - for, while, do-while loops
// - Functions with parameters and return values
// - Recursion
// - Arrays (int[])
// - vector<int>, vector<double>, vector<string>
// - cout output
// - Basic pointers (int*)
//
// Limitations:
// - No class/struct definitions
// - No cin (user input)
// - No templates (user-defined)
// - No exception handling
// - No lambda expressions
// - No multi-file programs
// - No preprocessor macros (beyond #include)
// ============================================================

const fs = require('fs');
const path = require('path');

class InstrumentationService {
  constructor() {
    // Load the trace runtime header
    this.runtimeHeaderPath = path.join(__dirname, 'traceRuntime.h');
    this.runtimeHeader = fs.readFileSync(this.runtimeHeaderPath, 'utf-8');
  }

  /**
   * Instrument C++ source code for tracing
   * @param {string} code - Original C++ source code
   * @param {string} traceOutputPath - Path where trace JSON will be written
   * @returns {{instrumentedCode: string, lineMapping: object, functions: string[]}}
   */
  instrument(code, traceOutputPath) {
    const lines = code.split('\n');
    const context = {
      functions: [],           // Discovered functions
      currentFunction: 'global',
      variables: {},           // Map of varName -> {type, scope}
      scopeStack: [],          // Track nested scopes
      scopeDepth: 0,
      inFunction: false,
      braceDepth: 0,
      funcBraceDepth: 0,       // Brace depth when function started
      includes: [],
      usingNamespace: false,
      lineMapping: {},         // original line -> instrumented line
      inMultiLineComment: false,
      functionParams: {},      // funcName -> [{name, type}]
      functionReturnTypes: {}, // funcName -> type
    };

    // First pass: analyze the code structure
    this._analyzeCode(lines, context);

    // Second pass: generate instrumented code
    const instrumented = this._generateInstrumented(lines, context, traceOutputPath);

    return {
      instrumentedCode: instrumented,
      lineMapping: context.lineMapping,
      functions: context.functions,
    };
  }

  /**
   * First pass: identify functions, their params, variables, and structure
   */
  _analyzeCode(lines, context) {
    let braceDepth = 0;
    let inMultiLineComment = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Handle multi-line comments
      if (inMultiLineComment) {
        if (line.includes('*/')) {
          inMultiLineComment = false;
          line = line.substring(line.indexOf('*/') + 2).trim();
        } else {
          continue;
        }
      }
      if (line.includes('/*') && !line.includes('*/')) {
        inMultiLineComment = true;
        line = line.substring(0, line.indexOf('/*')).trim();
      }

      // Remove single-line comments
      const commentIdx = line.indexOf('//');
      if (commentIdx >= 0) line = line.substring(0, commentIdx).trim();

      if (!line) continue;

      // Detect includes
      if (line.startsWith('#include')) {
        context.includes.push(line);
        continue;
      }

      // Detect using namespace
      if (line.startsWith('using namespace')) {
        context.usingNamespace = true;
        continue;
      }

      // Detect function definitions
      const funcMatch = line.match(
        /^(int|void|double|float|char|bool|string|long\s+long|long|unsigned\s+int|unsigned)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/
      );
      if (funcMatch && !line.includes(';')) {
        const returnType = funcMatch[1];
        const funcName = funcMatch[2];
        const paramsStr = funcMatch[3];

        if (!context.functions.includes(funcName)) {
          context.functions.push(funcName);
        }

        // Parse parameters
        const params = this._parseParams(paramsStr);
        context.functionParams[funcName] = params;
        context.functionReturnTypes[funcName] = returnType;
      }

      // Count braces
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
    }
  }

  /**
   * Parse function parameter string
   */
  _parseParams(paramsStr) {
    if (!paramsStr || !paramsStr.trim()) return [];
    const params = [];
    const parts = paramsStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Handle patterns like: int n, int& ref, const string& s, int* p, int arr[], vector<int>& v
      const paramMatch = trimmed.match(
        /^(const\s+)?((?:vector\s*<\s*\w+\s*>|string|int|double|float|char|bool|long\s+long|long|unsigned\s+int|unsigned))\s*([&*]?)\s*(\w+)(\[\])?$/
      );
      if (paramMatch) {
        let type = paramMatch[2].replace(/\s+/g, ' ').trim();
        const isRef = paramMatch[3] === '&';
        const isPtr = paramMatch[3] === '*';
        const name = paramMatch[4];
        const isArr = !!paramMatch[5];

        if (isPtr) type += '*';
        if (isArr) type += '[]';

        params.push({ name, type, isRef, isPtr, isArr });
      }
    }
    return params;
  }

  /**
   * Second pass: generate the instrumented code
   */
  _generateInstrumented(lines, context, traceOutputPath) {
    const output = [];
    const escapedPath = traceOutputPath.replace(/\\/g, '\\\\');

    // Add the runtime header as an inline include
    output.push('// === TraceMind Instrumented Code ===');
    output.push(this.runtimeHeader);
    output.push('');

    // Track state during generation
    let currentFunc = null;
    let braceDepth = 0;
    let funcStartBrace = -1;
    let inMultiLineComment = false;
    let knownVars = {};        // varName -> type (in current scope)
    let scopeVarStack = [];    // Stack of variable sets per scope level
    let isMainDefined = false;
    let pendingElse = false;
    let originalLineNum = 0;

    for (let i = 0; i < lines.length; i++) {
      originalLineNum = i + 1;
      let line = lines[i];
      let trimmed = line.trim();

      // Handle multi-line comments
      if (inMultiLineComment) {
        output.push(line);
        if (trimmed.includes('*/')) {
          inMultiLineComment = false;
        }
        continue;
      }
      if (trimmed.startsWith('/*')) {
        output.push(line);
        if (!trimmed.includes('*/')) {
          inMultiLineComment = true;
        }
        continue;
      }

      // Skip empty lines and single-line comments
      if (!trimmed || trimmed.startsWith('//')) {
        output.push(line);
        continue;
      }

      // Skip includes and using (already in the header)
      if (trimmed.startsWith('#include') || trimmed.startsWith('using namespace')) {
        // Don't re-add, they're in the header
        output.push('// ' + line.trim());
        continue;
      }

      // Detect function definition
      const funcMatch = trimmed.match(
        /^(int|void|double|float|char|bool|string|long\s+long|long|unsigned\s+int|unsigned)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/
      );
      if (funcMatch && !trimmed.includes(';')) {
        const funcName = funcMatch[2];
        const paramsStr = funcMatch[3];
        currentFunc = funcName;

        if (funcName === 'main') isMainDefined = true;

        // Reset scope for new function
        knownVars = {};
        scopeVarStack = [];

        // Add function parameters as known variables
        const params = context.functionParams[funcName] || [];
        for (const p of params) {
          knownVars[p.name] = p.type;
        }

        output.push(line);

        // If opening brace is on this line
        if (trimmed.includes('{')) {
          braceDepth++;
          funcStartBrace = braceDepth;
          scopeVarStack.push(new Set());

          // Inject function entry tracing
          if (funcName === 'main') {
            output.push(`    __tm_init("${escapedPath}");`);
            output.push(`    __tm_push_call("main", "");`);
            output.push(`    __tm_clear_vars();`);
            output.push(`    __tm_emit(${originalLineNum}, "program_start", "main");`);
          } else {
            // Build args string for call stack
            const argsStr = params.map(p => `${p.name}=`).join(', ');
            output.push(`    __tm_push_call("${funcName}", ${this._buildArgsString(params)});`);
            output.push(`    ${this._emitVarCapture(params.map(p => ({name: p.name, type: p.type})))}`);
            output.push(`    __tm_emit(${originalLineNum}, "function_call", "${funcName}");`);
          }
        }
        continue;
      }

      // Opening brace (standalone)
      if (trimmed === '{') {
        braceDepth++;
        if (currentFunc && funcStartBrace === -1) {
          funcStartBrace = braceDepth;
          scopeVarStack.push(new Set());

          const params = context.functionParams[currentFunc] || [];
          for (const p of params) {
            knownVars[p.name] = p.type;
          }

          output.push(line);

          if (currentFunc === 'main') {
            isMainDefined = true;
            output.push(`    __tm_init("${escapedPath}");`);
            output.push(`    __tm_push_call("main", "");`);
            output.push(`    __tm_clear_vars();`);
            output.push(`    __tm_emit(${originalLineNum}, "program_start", "main");`);
          } else {
            const params2 = context.functionParams[currentFunc] || [];
            output.push(`    __tm_push_call("${currentFunc}", ${this._buildArgsString(params2)});`);
            output.push(`    ${this._emitVarCapture(params2.map(p => ({name: p.name, type: p.type})))}`);
            output.push(`    __tm_emit(${originalLineNum}, "function_call", "${currentFunc}");`);
          }
          continue;
        }
        scopeVarStack.push(new Set());
        output.push(line);
        continue;
      }

      // Closing brace
      if (trimmed === '}' || trimmed.startsWith('}')) {
        // Check if this closes the current function
        if (currentFunc && braceDepth === funcStartBrace) {
          // Add function end tracing
          if (currentFunc === 'main') {
            output.push(`    __tm_emit(${originalLineNum}, "program_end", "main");`);
            output.push(`    __tm_pop_call();`);
            output.push(`    __tm_close();`);
          } else {
            // Function might have implicit return (void)
          }

          // Pop scope vars
          if (scopeVarStack.length > 0) {
            const scopeVars = scopeVarStack.pop();
            for (const v of scopeVars) {
              delete knownVars[v];
            }
          }

          output.push(line);
          braceDepth--;
          currentFunc = null;
          funcStartBrace = -1;
          knownVars = {};
          continue;
        }

        // Pop scope vars for inner block
        if (scopeVarStack.length > 0) {
          const scopeVars = scopeVarStack.pop();
          for (const v of scopeVars) {
            delete knownVars[v];
          }
        }

        output.push(line);
        braceDepth--;
        continue;
      }

      // Skip if not inside a function
      if (!currentFunc) {
        output.push(line);
        continue;
      }

      const funcForTrace = currentFunc || 'main';
      const indent = line.match(/^(\s*)/)[1] || '    ';

      // ---- Variable declarations ----
      const varDeclMatch = trimmed.match(
        /^(const\s+)?(int|double|float|char|bool|string|long\s+long|long|unsigned\s+int|unsigned)\s+(\w+)\s*(?:=\s*(.+?))?\s*;$/
      );
      if (varDeclMatch) {
        const varType = varDeclMatch[2].replace(/\s+/g, ' ').trim();
        const varName = varDeclMatch[3];
        knownVars[varName] = varType;
        if (scopeVarStack.length > 0) {
          scopeVarStack[scopeVarStack.length - 1].add(varName);
        }

        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Pointer declarations ----
      const ptrMatch = trimmed.match(/^(int|double|float|char)\s*\*\s*(\w+)\s*(?:=\s*(.+?))?\s*;$/);
      if (ptrMatch) {
        const ptrType = ptrMatch[1] + '*';
        const ptrName = ptrMatch[2];
        knownVars[ptrName] = ptrType;
        if (scopeVarStack.length > 0) {
          scopeVarStack[scopeVarStack.length - 1].add(ptrName);
        }

        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Array declarations ----
      const arrMatch = trimmed.match(/^(int|double|float|char)\s+(\w+)\s*\[(\d+)\]\s*(?:=\s*\{([^}]*)\})?\s*;$/);
      if (arrMatch) {
        const arrType = arrMatch[1];
        const arrName = arrMatch[2];
        const arrSize = arrMatch[3];
        knownVars[arrName] = arrType + '[]';
        knownVars[arrName + '.__size'] = arrSize;
        if (scopeVarStack.length > 0) {
          scopeVarStack[scopeVarStack.length - 1].add(arrName);
          scopeVarStack[scopeVarStack.length - 1].add(arrName + '.__size');
        }

        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Vector declarations ----
      const vecMatch = trimmed.match(/^(?:std::)?vector\s*<\s*(\w+)\s*>\s+(\w+)\s*(?:\(([^)]*)\))?\s*(?:=\s*\{([^}]*)\})?\s*;$/);
      if (vecMatch) {
        const vecElemType = vecMatch[1];
        const vecName = vecMatch[2];
        knownVars[vecName] = `vector<${vecElemType}>`;
        if (scopeVarStack.length > 0) {
          scopeVarStack[scopeVarStack.length - 1].add(vecName);
        }

        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Return statements ----
      const retMatch = trimmed.match(/^return\s+(.*?)\s*;$/);
      if (retMatch) {
        const retExpr = retMatch[1];
        const retType = context.functionReturnTypes[currentFunc] || 'int';

        if (currentFunc === 'main') {
          output.push(`${indent}__tm_emit(${originalLineNum}, "program_end", "main");`);
          output.push(`${indent}__tm_pop_call();`);
          output.push(`${indent}__tm_close();`);
          output.push(line);
        } else {
          // Capture return value and pop call
          output.push(`${indent}{`);
          if (retType !== 'void') {
            output.push(`${indent}    ${retType} __tm_ret_val = ${retExpr};`);
            output.push(`${indent}    ${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
            output.push(`${indent}    __tm_var_${this._typeToFunc(retType)}("__return", __tm_ret_val);`);
            output.push(`${indent}    __tm_emit(${originalLineNum}, "function_return", "${funcForTrace}");`);
            output.push(`${indent}    __tm_pop_call();`);
            output.push(`${indent}    return __tm_ret_val;`);
          } else {
            output.push(`${indent}    __tm_emit(${originalLineNum}, "function_return", "${funcForTrace}");`);
            output.push(`${indent}    __tm_pop_call();`);
            output.push(`${indent}    return;`);
          }
          output.push(`${indent}}`);
        }
        continue;
      }

      // ---- return without value (void functions) ----
      if (trimmed === 'return;') {
        output.push(`${indent}__tm_emit(${originalLineNum}, "function_return", "${funcForTrace}");`);
        output.push(`${indent}__tm_pop_call();`);
        output.push(line);
        continue;
      }

      // ---- if / else if / else ----
      const ifMatch = trimmed.match(/^(if|else\s+if)\s*\((.+)\)\s*\{?\s*$/);
      if (ifMatch) {
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "condition", "${funcForTrace}");`);
        output.push(line);
        if (trimmed.includes('{')) {
          braceDepth++;
          scopeVarStack.push(new Set());
        }
        continue;
      }
      if (trimmed.match(/^else\s*\{?\s*$/)) {
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "condition", "${funcForTrace}");`);
        output.push(line);
        if (trimmed.includes('{')) {
          braceDepth++;
          scopeVarStack.push(new Set());
        }
        continue;
      }

      // ---- for loop ----
      const forMatch = trimmed.match(/^for\s*\((.+)\)\s*\{?\s*$/);
      if (forMatch) {
        // Check for loop variable declaration in init
        const forInit = forMatch[1].split(';')[0]?.trim();
        const loopVarMatch = forInit?.match(/^(int|double|float|long|long\s+long)\s+(\w+)\s*=\s*(.+)$/);
        if (loopVarMatch) {
          const loopVarType = loopVarMatch[1].replace(/\s+/g, ' ').trim();
          const loopVarName = loopVarMatch[2];
          knownVars[loopVarName] = loopVarType;
          if (scopeVarStack.length > 0) {
            scopeVarStack[scopeVarStack.length - 1].add(loopVarName);
          }
        }

        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "loop_start", "${funcForTrace}");`);
        output.push(line);

        if (trimmed.includes('{')) {
          braceDepth++;
          scopeVarStack.push(new Set());
        }
        continue;
      }

      // ---- while loop ----
      const whileMatch = trimmed.match(/^(while|do)\s*(?:\((.+)\))?\s*\{?\s*$/);
      if (whileMatch) {
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "loop_start", "${funcForTrace}");`);
        output.push(line);
        if (trimmed.includes('{')) {
          braceDepth++;
          scopeVarStack.push(new Set());
        }
        continue;
      }

      // ---- cout statements ----
      const coutMatch = trimmed.match(/^(?:std::)?cout\s*<<\s*(.+?)\s*;$/);
      if (coutMatch) {
        // We need to capture the output
        output.push(line);
        // Create a string version to capture the output
        const coutExpr = coutMatch[1];
        output.push(`${indent}{`);
        output.push(`${indent}    ostringstream __tm_oss;`);
        output.push(`${indent}    __tm_oss << ${coutExpr};`);
        output.push(`${indent}    ${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}    __tm_emit(${originalLineNum}, "output", "${funcForTrace}", __tm_oss.str().c_str());`);
        output.push(`${indent}}`);
        continue;
      }

      // ---- Assignment statements (x = expr;) ----
      const assignMatch = trimmed.match(/^(\w+)\s*(=|\+=|-=|\*=|\/=|%=|\+\+|--)\s*(.*?)\s*;?$/);
      if (assignMatch && knownVars[assignMatch[1]]) {
        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Increment/Decrement ----
      const incMatch = trimmed.match(/^(\+\+|--)\s*(\w+)\s*;$/);
      if (incMatch && knownVars[incMatch[2]]) {
        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }
      const incMatch2 = trimmed.match(/^(\w+)\s*(\+\+|--)\s*;$/);
      if (incMatch2 && knownVars[incMatch2[1]]) {
        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Variable declaration with function call: int result = func(...); ----
      const varCallMatch = trimmed.match(
        /^(int|double|float|char|bool|string|long\s+long|long)\s+(\w+)\s*=\s*(.+?)\s*;$/
      );
      if (varCallMatch) {
        const vType = varCallMatch[1].replace(/\s+/g, ' ').trim();
        const vName = varCallMatch[2];
        knownVars[vName] = vType;
        if (scopeVarStack.length > 0) {
          scopeVarStack[scopeVarStack.length - 1].add(vName);
        }

        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Vector push_back ----
      const pushMatch = trimmed.match(/^(\w+)\.push_back\s*\((.+?)\)\s*;$/);
      if (pushMatch && knownVars[pushMatch[1]]) {
        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Array element assignment: arr[i] = val; ----
      const arrAssignMatch = trimmed.match(/^(\w+)\[(.+?)\]\s*=\s*(.+?)\s*;$/);
      if (arrAssignMatch && knownVars[arrAssignMatch[1]]) {
        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Generic function calls (standalone): func(args); ----
      const genericCallMatch = trimmed.match(/^(\w+)\s*\(.*\)\s*;$/);
      if (genericCallMatch && !trimmed.startsWith('__tm_')) {
        output.push(line);
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
        continue;
      }

      // ---- Default: emit line event for any other statement ----
      output.push(line);

      // Only add tracing for non-trivial lines
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//') && trimmed !== '{' && trimmed !== '}') {
        output.push(`${indent}${this._emitVarCapture(Object.entries(knownVars).filter(([n]) => !n.includes('.__')).map(([n, t]) => ({name: n, type: t})))}`);
        output.push(`${indent}__tm_emit(${originalLineNum}, "line", "${funcForTrace}");`);
      }
    }

    return output.join('\n');
  }

  /**
   * Generate variable capture code for all known variables
   */
  _emitVarCapture(vars) {
    if (!vars || vars.length === 0) return '__tm_clear_vars();';

    const lines = ['__tm_clear_vars();'];
    for (const v of vars) {
      const { name, type } = v;
      if (name.startsWith('__tm_')) continue;

      if (type === 'int' || type === 'unsigned int' || type === 'unsigned') {
        lines.push(`__tm_var_int("${name}", ${name});`);
      } else if (type === 'long long' || type === 'long') {
        lines.push(`__tm_var_long("${name}", ${name});`);
      } else if (type === 'double') {
        lines.push(`__tm_var_double("${name}", ${name});`);
      } else if (type === 'float') {
        lines.push(`__tm_var_float("${name}", ${name});`);
      } else if (type === 'char') {
        lines.push(`__tm_var_char("${name}", ${name});`);
      } else if (type === 'bool') {
        lines.push(`__tm_var_bool("${name}", ${name});`);
      } else if (type === 'string') {
        lines.push(`__tm_var_string("${name}", ${name});`);
      } else if (type.endsWith('*')) {
        lines.push(`__tm_var_ptr("${name}", ${name});`);
      } else if (type === 'int[]') {
        // Need to know array size
        lines.push(`__tm_var_int_arr("${name}", ${name}, sizeof(${name})/sizeof(${name}[0]));`);
      } else if (type === 'vector<int>') {
        lines.push(`__tm_var_int_vec("${name}", ${name});`);
      } else if (type === 'vector<double>') {
        lines.push(`__tm_var_double_vec("${name}", ${name});`);
      } else if (type === 'vector<string>') {
        lines.push(`__tm_var_string_vec("${name}", ${name});`);
      }
    }
    return lines.join(' ');
  }

  /**
   * Build a call stack argument string for __tm_push_call
   */
  _buildArgsString(params) {
    if (!params || params.length === 0) return '""';

    // Build a C++ expression that creates the args string at runtime
    const parts = params.map(p => {
      if (p.type === 'string') {
        return `"${p.name}=" + ${p.name}`;
      } else if (p.type.startsWith('vector')) {
        return `string("${p.name}=[...]")`;
      } else {
        return `"${p.name}=" + to_string(${p.name})`;
      }
    });

    if (parts.length === 1) {
      return `(${parts[0]}).c_str()`;
    }

    // Join with ", "
    let expr = parts[0];
    for (let i = 1; i < parts.length; i++) {
      expr = `${expr} + ", " + ${parts[i]}`;
    }
    return `(${expr}).c_str()`;
  }

  /**
   * Map type to trace function suffix
   */
  _typeToFunc(type) {
    const map = {
      'int': 'int',
      'long long': 'long',
      'long': 'long',
      'double': 'double',
      'float': 'float',
      'char': 'char',
      'bool': 'bool',
      'string': 'string',
    };
    return map[type] || 'int';
  }
}

module.exports = new InstrumentationService();
