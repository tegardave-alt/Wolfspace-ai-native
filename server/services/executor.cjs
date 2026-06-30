'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Code Executor Service - Runs code in various languages
 */

/**
 * Detect language from code content
 * @param {string} hint - Language hint
 * @param {string} code - Code content
 */
function detectLang(hint, code) {
  if (hint && hint !== 'auto') return hint.toLowerCase();
  
  // Auto-detect from code patterns
  if (code.includes('def ') && code.includes(':')) return 'python';
  if (code.includes('function ') || code.includes('=>')) return 'javascript';
  if (code.includes('console.log')) return 'javascript';
  if (code.includes('print(')) return 'python';
  if (code.includes('#include')) return 'cpp';
  if (code.includes('public class')) return 'java';
  
  return 'javascript'; // default
}

/**
 * Reconcile language detection with code content
 */
function reconcileLang(lang, code) {
  // Override if code clearly indicates different language
  if (lang === 'javascript' && code.includes('print(') && !code.includes('console.log')) {
    return 'python';
  }
  return lang;
}

/**
 * Check if code launches external shell
 */
function launchesShell(code) {
  const shellPatterns = [
    /subprocess\.(run|call|Popen)/,
    /os\.system\(/,
    /exec\(/,
    /spawn\(/,
    /child_process/,
    /shell=True/
  ];
  return shellPatterns.some(p => p.test(code));
}

/**
 * Check if code opens GUI window
 */
function opensGuiWindow(lang, code) {
  if (lang === 'python') {
    return /tkinter|matplotlib\.pyplot|pygame|PyQt|wx/.test(code);
  }
  if (lang === 'java') {
    return /Swing|JavaFX|AWT/.test(code);
  }
  return false;
}

/**
 * Run code by language
 * @param {string} lang - Language identifier
 * @param {string} code - Code to execute
 */
async function runByLang(lang, code) {
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  
  const configs = {
    javascript: {
      ext: '.js',
      cmd: 'node',
      args: []
    },
    python: {
      ext: '.py',
      cmd: 'python',
      args: []
    },
    cpp: {
      ext: '.cpp',
      cmd: 'g++',
      args: ['-o'],
      compile: true
    },
    java: {
      ext: '.java',
      cmd: 'javac',
      args: [],
      compile: true
    }
  };
  
  const config = configs[lang];
  if (!config) {
    return { ok: false, error: `Unsupported language: ${lang}` };
  }
  
  const filename = `quantum_${timestamp}${config.ext}`;
  const filepath = path.join(tmpDir, filename);
  
  try {
    fs.writeFileSync(filepath, code);
    
    if (config.compile) {
      // Compile first
      const compileResult = await runProcess(config.cmd, [filepath, ...config.args], tmpDir);
      if (!compileResult.ok) return compileResult;
      
      // Then run compiled binary
      const execName = lang === 'java' ? filename.replace('.java', '') : filename.replace(config.ext, '');
      const runCmd = lang === 'java' ? 'java' : path.join(tmpDir, execName);
      const runArgs = lang === 'java' ? [execName] : [];
      
      return await runProcess(runCmd, runArgs, tmpDir, 30000);
    } else {
      return await runProcess(config.cmd, [filepath, ...config.args], tmpDir, 30000);
    }
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    // Cleanup
    try { fs.unlinkSync(filepath); } catch (_) {}
  }
}

/**
 * Run a process with timeout
 */
function runProcess(cmd, args, cwd, timeout = 30000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      clearTimeout(timer);
      
      if (killed) {
        resolve({ ok: false, error: 'Execution timeout (30s)' });
      } else if (code === 0) {
        resolve({ ok: true, output: stdout, error: stderr || null });
      } else {
        resolve({ ok: false, output: stdout, error: stderr || `Exit code ${code}` });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}

/**
 * Analyze code quality
 */
function analyzeCode(lang, code) {
  const issues = [];
  
  // Basic quality checks
  if (code.length < 10) issues.push('Code too short');
  if (!code.trim()) issues.push('Empty code');
  
  if (lang === 'javascript') {
    if (code.includes('var ')) issues.push('Use let/const instead of var');
    if (code.includes('==') && !code.includes('===')) issues.push('Use === instead of ==');
  }
  
  if (lang === 'python') {
    if (code.includes('\t')) issues.push('Use spaces instead of tabs');
  }
  
  return {
    score: Math.max(0, 100 - issues.length * 10),
    issues
  };
}

module.exports = {
  detectLang,
  reconcileLang,
  launchesShell,
  opensGuiWindow,
  runByLang,
  analyzeCode
};
