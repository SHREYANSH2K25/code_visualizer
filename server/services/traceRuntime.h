// ============================================================
// TraceMind C++ Trace Runtime Header
// This file is prepended to instrumented C++ programs.
// It provides tracing functions that record execution steps
// to a JSON file.
// ============================================================

#ifndef TRACEMIND_RUNTIME_H
#define TRACEMIND_RUNTIME_H

#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include <vector>
#include <cstdlib>
using namespace std;

// ---- TraceMind Runtime Globals ----
static ofstream __tm_trace_file;
static int __tm_step_counter = 0;
static int __tm_call_depth = 0;
static bool __tm_is_init = false;
static string __tm_captured_output = "";
static int __tm_max_steps = 2000;

// Variable entry for trace
struct __tm_VarEntry {
    string name;
    string value;
    string type;
};
static vector<__tm_VarEntry> __tm_vars;

// Call stack entry
struct __tm_StackFrame {
    string funcName;
    string args;
};
static vector<__tm_StackFrame> __tm_call_stack;

// ---- String escape for JSON ----
static string __tm_json_escape(const string& s) {
    string r;
    for (size_t i = 0; i < s.size(); i++) {
        char c = s[i];
        if (c == '"') r += "\\\"";
        else if (c == '\\') r += "\\\\";
        else if (c == '\n') r += "\\n";
        else if (c == '\r') r += "\\r";
        else if (c == '\t') r += "\\t";
        else r += c;
    }
    return r;
}

// ---- Init trace file ----
static void __tm_init(const char* filename) {
    __tm_trace_file.open(filename);
    __tm_trace_file << "[" << endl;
    __tm_is_init = true;
    const char* maxStepsEnv = getenv("TM_MAX_STEPS");
    if (maxStepsEnv) __tm_max_steps = atoi(maxStepsEnv);
}

// ---- Close trace file ----
static void __tm_close() {
    if (__tm_is_init) {
        __tm_trace_file << endl << "]" << endl;
        __tm_trace_file.close();
    }
}

// ---- Clear variable list ----
static void __tm_clear_vars() {
    __tm_vars.clear();
}

// ---- Add variable trackers ----
static void __tm_var_int(const char* name, int val) {
    __tm_VarEntry e; e.name = name; e.value = to_string(val); e.type = "int";
    __tm_vars.push_back(e);
}
static void __tm_var_long(const char* name, long long val) {
    __tm_VarEntry e; e.name = name; e.value = to_string(val); e.type = "long long";
    __tm_vars.push_back(e);
}
static void __tm_var_float(const char* name, float val) {
    __tm_VarEntry e; e.name = name;
    ostringstream oss; oss << val; e.value = oss.str(); e.type = "float";
    __tm_vars.push_back(e);
}
static void __tm_var_double(const char* name, double val) {
    __tm_VarEntry e; e.name = name;
    ostringstream oss; oss << val; e.value = oss.str(); e.type = "double";
    __tm_vars.push_back(e);
}
static void __tm_var_char(const char* name, char val) {
    __tm_VarEntry e; e.name = name;
    e.value = string("\"") + val + "\""; e.type = "char";
    __tm_vars.push_back(e);
}
static void __tm_var_bool(const char* name, bool val) {
    __tm_VarEntry e; e.name = name; e.value = val ? "true" : "false"; e.type = "bool";
    __tm_vars.push_back(e);
}
static void __tm_var_string(const char* name, const string& val) {
    __tm_VarEntry e; e.name = name;
    e.value = "\"" + __tm_json_escape(val) + "\""; e.type = "string";
    __tm_vars.push_back(e);
}
static void __tm_var_ptr(const char* name, const void* val) {
    __tm_VarEntry e; e.name = name;
    ostringstream oss; oss << val; e.value = "\"" + oss.str() + "\""; e.type = "pointer";
    __tm_vars.push_back(e);
}
static void __tm_var_int_arr(const char* name, int* arr, int size) {
    __tm_VarEntry e; e.name = name;
    string v = "[";
    for (int i = 0; i < size && i < 50; i++) {
        if (i > 0) v += ",";
        v += to_string(arr[i]);
    }
    v += "]";
    e.value = v; e.type = "int[]";
    __tm_vars.push_back(e);
}
static void __tm_var_int_vec(const char* name, const vector<int>& vec) {
    __tm_VarEntry e; e.name = name;
    string v = "[";
    for (size_t i = 0; i < vec.size() && i < 50; i++) {
        if (i > 0) v += ",";
        v += to_string(vec[i]);
    }
    v += "]";
    e.value = v; e.type = "vector<int>";
    __tm_vars.push_back(e);
}
static void __tm_var_double_vec(const char* name, const vector<double>& vec) {
    __tm_VarEntry e; e.name = name;
    string v = "[";
    for (size_t i = 0; i < vec.size() && i < 50; i++) {
        if (i > 0) v += ",";
        ostringstream oss; oss << vec[i]; v += oss.str();
    }
    v += "]";
    e.value = v; e.type = "vector<double>";
    __tm_vars.push_back(e);
}
static void __tm_var_string_vec(const char* name, const vector<string>& vec) {
    __tm_VarEntry e; e.name = name;
    string v = "[";
    for (size_t i = 0; i < vec.size() && i < 50; i++) {
        if (i > 0) v += ",";
        v += "\"" + __tm_json_escape(vec[i]) + "\"";
    }
    v += "]";
    e.value = v; e.type = "vector<string>";
    __tm_vars.push_back(e);
}

// ---- Emit a trace event ----
static void __tm_emit(int origLine, const char* event, const char* func, const char* output = "") {
    if (!__tm_is_init) return;
    if (__tm_step_counter >= __tm_max_steps) return;
    if (__tm_step_counter > 0) __tm_trace_file << "," << endl;

    __tm_trace_file << "  {";
    __tm_trace_file << "\"step\":" << __tm_step_counter;
    __tm_trace_file << ",\"line\":" << origLine;
    __tm_trace_file << ",\"event\":\"" << event << "\"";
    __tm_trace_file << ",\"function\":\"" << func << "\"";
    __tm_trace_file << ",\"depth\":" << __tm_call_depth;

    // Variables object
    __tm_trace_file << ",\"variables\":{";
    for (size_t i = 0; i < __tm_vars.size(); i++) {
        if (i > 0) __tm_trace_file << ",";
        __tm_trace_file << "\"" << __tm_vars[i].name << "\":{";
        __tm_trace_file << "\"value\":" << __tm_vars[i].value;
        __tm_trace_file << ",\"type\":\"" << __tm_vars[i].type << "\"}";
    }
    __tm_trace_file << "}";

    // Call stack
    __tm_trace_file << ",\"callStack\":[";
    for (size_t i = 0; i < __tm_call_stack.size(); i++) {
        if (i > 0) __tm_trace_file << ",";
        __tm_trace_file << "{\"name\":\"" << __tm_call_stack[i].funcName << "\"";
        __tm_trace_file << ",\"args\":\"" << __tm_json_escape(__tm_call_stack[i].args) << "\"}";
    }
    __tm_trace_file << "]";

    // Output
    __tm_trace_file << ",\"output\":\"" << __tm_json_escape(output) << "\"";
    __tm_trace_file << "}";

    __tm_step_counter++;
}

// ---- Function call tracking ----
static void __tm_push_call(const char* name, const char* args) {
    __tm_StackFrame f;
    f.funcName = name;
    f.args = args;
    __tm_call_stack.push_back(f);
    __tm_call_depth++;
}
static void __tm_pop_call() {
    if (!__tm_call_stack.empty()) __tm_call_stack.pop_back();
    if (__tm_call_depth > 0) __tm_call_depth--;
}

// ---- Output capture helper ----
// Redirects cout to capture output while also recording it
class __tm_OutputCapture {
    streambuf* oldBuf;
    ostringstream captured;
public:
    __tm_OutputCapture() {
        oldBuf = cout.rdbuf();
        // We don't redirect — instead we use a manual approach
    }
};

#endif // TRACEMIND_RUNTIME_H
