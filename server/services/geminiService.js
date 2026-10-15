// server/services/geminiService.js
// Google Gemini AI integration for code explanation and analysis

class GeminiService {
  constructor() {
    this.model = null;
    this.available = false;
  }

  /**
   * Initialize the Gemini client
   */
  async init() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.log('[AI] Gemini API key not configured. AI features will be unavailable.');
      this.available = false;
      return;
    }

    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });
      this.available = true;
      console.log('[AI] Gemini API initialized successfully.');
    } catch (err) {
      console.error('[AI] Failed to initialize Gemini:', err.message);
      this.available = false;
    }
  }

  /**
   * Explain what is happening at a specific execution step
   */
  async explainStep(context) {
    if (!this.available) {
      return {
        success: false,
        explanation: 'AI explanation unavailable. The Gemini API key is not configured. The execution trace is still available.',
      };
    }

    const { code, step, variables, functionName, line, event, callStack, depth } = context;

    const prompt = `You are an educational C++ tutor helping a student understand program execution.

The student is stepping through a C++ program. Here is the current context:

**Full Code:**
\`\`\`cpp
${code}
\`\`\`

**Current Execution State:**
- Step: ${step.step} of the trace
- Line: ${line}
- Event Type: ${event}
- Current Function: ${functionName}
- Call Depth: ${depth}
- Variables: ${JSON.stringify(variables, null, 2)}
- Call Stack: ${JSON.stringify(callStack)}

**Task:** Explain what is happening at this step in 2-4 sentences. Be educational and specific. Reference the actual variable names and values. If this is a recursive call, explain the recursion level. Keep the language simple for a beginner student.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return {
        success: true,
        explanation: response.text(),
      };
    } catch (err) {
      console.error('[AI] Explain step error:', err.message);
      return {
        success: false,
        explanation: 'AI explanation unavailable. The execution trace is still available.',
      };
    }
  }

  /**
   * Analyze code for potential issues
   */
  async analyzeCode(code) {
    if (!this.available) {
      return {
        success: false,
        analysis: 'AI code analysis unavailable. The Gemini API key is not configured.',
        issues: [],
      };
    }

    const prompt = `You are an educational C++ code reviewer for beginner students.

Analyze the following C++ code and identify potential issues:

\`\`\`cpp
${code}
\`\`\`

Look for:
1. Logical mistakes
2. Missing recursion base cases
3. Suspicious conditions
4. Possible infinite loops
5. Unused variables
6. Common beginner errors
7. Memory issues (uninitialized variables, array bounds)
8. Missing return statements

For each issue found, provide:
- Line number (approximate)
- Severity (error, warning, info)
- Brief description
- Suggestion to fix

Format your response as JSON:
{
  "summary": "Brief overall assessment",
  "issues": [
    {
      "line": 5,
      "severity": "warning",
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ]
}

If the code looks correct, return an empty issues array with a positive summary.
Return ONLY valid JSON, no markdown formatting.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      // Clean up markdown code fences if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const analysis = JSON.parse(text);
      return {
        success: true,
        ...analysis,
      };
    } catch (err) {
      console.error('[AI] Analyze code error:', err.message);
      return {
        success: false,
        analysis: 'AI code analysis encountered an error. Please try again.',
        issues: [],
      };
    }
  }

  isAvailable() {
    return this.available;
  }
}

module.exports = new GeminiService();
