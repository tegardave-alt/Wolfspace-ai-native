// Sandbox Validator — semantic, intent-aware pre-execution safety layer for edit/write/bash
// Intercepts destructive operations, validates in isolation before applying to repo
// Supports LEXICAL (literal regex) + SEMANTIC (intent-based) matching
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { QROOT, Q_FORBID, qSyntaxOk } = require('./file-tools.cjs');

// ── Dangerous patterns (regex blacklist) ──
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/[sS]\b/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /:\(\)\s*\{/,                          // fork bomb
  />\s*\/dev\/sd/i,                      // overwrite disk
  /\bcurl\b[^|]*\|\s*(sh|bash)/i,        // pipe to shell
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\brmdir\s+\/s\b/i,
  /\bRemove-Item\s+-Recurse\b/i,         // PowerShell
  /\bFormat-Volume\b/i,
  /\bStop-Computer\b/i,
  /\bRestart-Computer\b/i,
];

// ── Forbidden file patterns (lexical — literal regex) ──
const FORBIDDEN_FILES = [
  /cloud-keys\.json/i,
  /\.env$/i,
  /\.pem$/i,
  /\.key$/i,
  /node_modules/i,
  /\.git[\\/]/i,
  /_agent_backups/i,
  /dist-app/i,
  /build[\\/]/i,
  /\.dart_tool/i,
];

// ═══════════════════════════════════════════════════════════════
//  SEMANTIC FILE CATEGORIES — Intent-based matching
// ═══════════════════════════════════════════════════════════════

const SEMANTIC_CATEGORIES = {
  credential: {
    intent: 'credential',
    action: 'block',
    confidence: 0.92,
    description: 'Kredensial/credential — file berisi informasi autentikasi, token, API key, password',
    // Name-based heuristics — kata kunci dalam nama file
    namePatterns: [
      /(?:credential|secret|token|api[_-]?key|auth|password|pwd|private)/i,
      /\.(?:pem|key|p12|pfx|crt|cert|env)$/i,
      /(?:^|[_-])(?:secret|token|key|cred|auth)(?:[_-]|$)/i,
      /(?:cloud-keys|service-account|google-key|aws-key|ssh-key)/i,
    ],
    // Path-based heuristics — direktori tempat file kredensial biasanya disimpan
    pathPatterns: [
      /(?:^|[\/\\])\.(?:env|aws|gcp|azure|npmrc|docker|kube|vault|terraform)/i,
      /(?:^|[\/\\])secrets?[\/\\]/i,
      /(?:^|[\/\\])credentials?[\/\\]/i,
      /(?:^|[\/\\])keys?[\/\\]/i,
      /(?:^|[\/\\])tokens?[\/\\]/i,
    ],
    // Content-based heuristics — isyarat dalam konten file (untuk write/read validation)
    contentHints: [
      /(?:api[_-]?key|api[_-]?secret|access[_-]?key|secret[_-]?access)/i,
      /(?:password|passwd|pwd|credentials)/i,
      /(?:-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/i,
      /(?:ghp_|gho_|ghu_|ghs_|ghr_)/i,  // GitHub tokens
      /(?:sk[-_][a-zA-Z0-9]{10,})/i,     // OpenAI/Sk style keys
    ],
  },

  temporary: {
    intent: 'temporary',
    action: 'warn',    // warn but allow if explicitly requested
    confidence: 0.78,
    description: 'File sementara/temporary — cache, log, debug output, backup',
    namePatterns: [
      /(?:temp|tmp|cache|log|debug|backup|bak|old|swp|swo|~$)/i,
      /\.(?:log|tmp|swp|swo|bak|old|cache|dump)$/i,
      /(?:^|[.])temp[-_]/i,
    ],
    pathPatterns: [
      /(?:^|[\/\\])(?:temp|tmp|cache|logs?|debug|backup)s?[\/\\]/i,
      /(?:^|[\/\\])__pycache__[\/\\]/i,
      /(?:^|[\/\\])\.(?:cache|tmp)[\/\\]/i,
    ],
    contentHints: [
      /(?:DEBUG|TRACE|\[WARN\]|\[ERROR\])/i,
      /(?:timestamp|log[_-]?level|log[_-]?file)/i,
    ],
  },

  build_output: {
    intent: 'build_output',
    action: 'warn',
    confidence: 0.82,
    description: 'Hasil build/kompilasi — tidak perlu diedit langsung karena auto-generated',
    namePatterns: [
      /\.(?:o|obj|pyc|class|dll|exe|wasm|hex)$/i,
      /(?:bundle|chunk|vendor)\.[a-f0-9]{8,}\./i,
    ],
    pathPatterns: [
      /(?:^|[\/\\])(?:dist|build|out|target|release|debug|bin)[\/\\]/i,
      /(?:^|[\/\\])node_modules[\/\\]/i,
      /(?:^|[\/\\])\.(?:next|nuxt|parcel-cache|svelte-kit)[\/\\]/i,
    ],
    contentHints: [],
  },

  backup: {
    intent: 'backup',
    action: 'warn',
    confidence: 0.75,
    description: 'File backup — salinan otomatis, bukan source utama',
    namePatterns: [
      /(?:backup|bak|~|\.[0-9]{1,3}$)/i,
      /\.(?:bak|old|orig|backup)$/i,
      /(?:^|[._-])bak[-_]/i,
    ],
    pathPatterns: [
      /(?:^|[\/\\])_agent_backups[\/\\]/i,
      /(?:^|[\/\\])backups?[\/\\]/i,
    ],
    contentHints: [],
  },

  config_sensitive: {
    intent: 'config_sensitive',
    action: 'block',
    confidence: 0.85,
    description: 'Konfigurasi sensitif — file konfigurasi yang berisi credential atau rahasia',
    namePatterns: [
      /(?:^|[\/\\])\.(?:env|env\.\w+|envrc)$/i,
      /(?:cloud-keys|service-account|google-key)/i,
      /(?:config|cfg|conf|setting)\.(?:json|yaml|yml|toml|ini)$/i,
    ],
    pathPatterns: [
      /(?:^|[\/\\])secrets?[\/\\]/i,
      /(?:^|[\/\\])config[\/\\].*(?:secret|key|auth|token|cred)/i,
    ],
    contentHints: [
      /(?:api[_-]?key|api[_-]?secret|access[_-]?key|secret[_-]?access)/i,
      /(?:password|passwd|pwd|credentials)/i,
      /"key"\s*:/i,
    ],
  },
};

// ── Path context analyzer ──
// Determines if a path is in a "safe" (production, committed) or "unsafe" (temporary, cache) context
function getPathContext(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  // Context categories
  const contexts = {
    isProduction: false,
    isTemporary: false,
    isBuildOutput: false,
    isBackup: false,
    isConfig: false,
    isSource: false,
  };

  for (const seg of segments) {
    if (/^(src|lib|app|components|pages|api|routes|controllers|models|services)$/i.test(seg)) {
      contexts.isSource = true;
    }
    if (/^(dist|build|out|target|release|debug|bin)$/i.test(seg)) {
      contexts.isBuildOutput = true;
    }
    if (/^(temp|tmp|cache|logs?|debug)$/i.test(seg)) {
      contexts.isTemporary = true;
    }
    if (/^(backups?|_agent_backups)$/i.test(seg)) {
      contexts.isBackup = true;
    }
    if (/^(config|settings?|env)$/i.test(seg)) {
      contexts.isConfig = true;
    }
  }

  return contexts;
}

// ── Intent detector — combines name + path + content analysis ──
// Returns array of detected intents with confidence scores
function detectFileIntent(filePath, contentPreview) {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || normalized;
  const results = [];

  for (const [catId, category] of Object.entries(SEMANTIC_CATEGORIES)) {
    let matchScore = 0;
    let reasons = [];

    // 1. Name-based detection
    for (const pattern of (category.namePatterns || [])) {
      if (pattern.test(fileName)) {
        matchScore += 0.5;
        reasons.push(`nama file cocok: ${pattern.source}`);
        break;
      }
    }

    // 2. Path-based detection
    for (const pattern of (category.pathPatterns || [])) {
      if (pattern.test(normalized)) {
        matchScore += 0.3;
        reasons.push(`path cocok: ${pattern.source}`);
        break;
      }
    }

    // 3. Content-based detection (if content preview available)
    if (contentPreview && category.contentHints && category.contentHints.length > 0) {
      for (const pattern of category.contentHints) {
        if (pattern.test(contentPreview)) {
          matchScore += 0.2;
          reasons.push(`konten cocok: ${pattern.source}`);
          break;
        }
      }
    }

    // 4. Context-based adjustment
    const context = getPathContext(normalized);
    if (category.intent === 'temporary' && context.isTemporary) {
      matchScore += 0.2;
      reasons.push('berada di direktori temporary');
    }
    if (category.intent === 'credential' && context.isConfig) {
      matchScore += 0.1;
      reasons.push('berada di direktori config');
    }
    if (category.intent === 'build_output' && context.isBuildOutput) {
      matchScore += 0.2;
      reasons.push('berada di direktori build');
    }

    if (matchScore > 0) {
      // Clamp confidence: base category confidence adjusted by match score
      const confidence = Math.min(1.0, category.confidence * (0.5 + matchScore));
      results.push({
        intent: category.intent,
        action: category.action,
        confidence: Math.round(confidence * 100) / 100,
        description: category.description,
        reasons,
        block: category.action === 'block' && confidence >= 0.6,
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Semantic Pattern Search — map a user query or intent to expanded semantic patterns
 * Searches SEMANTIC_CATEGORIES to find intent in query text and returns all related patterns
 * @param {string} query - the user's query/pattern (e.g. "password", "API key", "log file")
 * @param {Object} [options] - search options
 * @param {string} [options.intent] - explicit intent name (skips auto-detection)
 * @param {boolean} [options.filePatterns] - return file-name patterns instead of content patterns
 * @returns {{ intent: string|null, variants: string[], patterns: RegExp[], confidence: number, description: string }}
 */
function qSemanticSearch(query, options = {}) {
  const queryLower = (query || '').toLowerCase().trim();
  if (!queryLower && !options.intent) {
    return { intent: null, variants: [], patterns: [], confidence: 0, description: '' };
  }

  // ── Keyword → intent mapping ──
  const KEYWORD_INTENT_MAP = {
    'credential': 'credential', 'credentials': 'credential',
    'password': 'credential', 'passwd': 'credential', 'pwd': 'credential',
    'secret': 'credential', 'secrets': 'credential',
    'token': 'credential', 'tokens': 'credential',
    'api key': 'credential', 'apikey': 'credential', 'api_key': 'credential',
    'auth': 'credential', 'authentication': 'credential',
    'key': 'credential', 'keys': 'credential',
    'private key': 'credential',
    'ssh': 'credential', 'ssh key': 'credential',
    'temporary': 'temporary', 'temp': 'temporary', 'tmp': 'temporary',
    'cache': 'temporary', 'cached': 'temporary',
    'log': 'temporary', 'logs': 'temporary', 'logging': 'temporary',
    'debug': 'temporary', 'debugging': 'temporary',
    'backup': 'backup', 'backups': 'backup', 'bak': 'backup',
    'build': 'build_output', 'build output': 'build_output',
    'dist': 'build_output', 'distribution': 'build_output',
    'compiled': 'build_output', 'compilation': 'build_output',
    'config': 'config_sensitive', 'configuration': 'config_sensitive',
    'setting': 'config_sensitive', 'settings': 'config_sensitive',
    'env': 'config_sensitive', 'environment': 'config_sensitive',
  };

  let matchedIntent = options.intent || null;

  // Auto-detect intent from query text
  if (!matchedIntent) {
    for (const [kw, intent] of Object.entries(KEYWORD_INTENT_MAP)) {
      if (queryLower === kw ||
          queryLower.startsWith(kw + ' ') ||
          queryLower.includes(' ' + kw + ' ') ||
          queryLower.endsWith(' ' + kw)) {
        matchedIntent = intent;
        break;
      }
    }
    // Fallback: try direct category name match
    if (!matchedIntent) {
      for (const catId of Object.keys(SEMANTIC_CATEGORIES)) {
        if (queryLower.includes(catId.replace(/_/g, ' '))) {
          matchedIntent = catId;
          break;
        }
      }
    }
  }

  if (!matchedIntent || !SEMANTIC_CATEGORIES[matchedIntent]) {
    return { intent: null, variants: [], patterns: [], confidence: 0, description: '' };
  }

  const category = SEMANTIC_CATEGORIES[matchedIntent];
  // Choose patterns based on search type
  const useFilePatterns = options.filePatterns === true;
  const allPatterns = useFilePatterns
    ? [...(category.namePatterns || []), ...(category.pathPatterns || [])]
    : [...(category.contentHints || []), ...(category.namePatterns || [])];

  // Deduplicate by pattern source string
  const seen = new Set();
  const uniquePatterns = allPatterns.filter(p => {
    const src = p.source;
    if (seen.has(src)) return false;
    seen.add(src);
    return true;
  });

  return {
    intent: matchedIntent,
    variants: uniquePatterns.map(p => p.source),
    patterns: uniquePatterns,
    confidence: category.confidence,
    description: category.description,
  };
}

/**
 * Validate a bash command for dangerous patterns
 * @param {string} cmd - the command to validate
 * @returns {{ safe: boolean, reason?: string }}
 */
function validateBashCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return { safe: false, reason: 'perintah kosong' };

  // Lexical check (fast fail)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      return { safe: false, reason: `perintah berbahaya terdeteksi: ${pattern.source}` };
    }
  }

  // Semantic check — detect intent behind the command
  const cmdLower = cmd.toLowerCase();

  // Detect destructive intent with context
  const destructiveWords = /\b(del|delete|remove|rm|rd|format|wipe|clear|purge)\b/i;
  const recursiveFlags = /\b[/-][rRsf]+\b|\/s\b/i;
  const systemPaths = /(?:system32|windows|program files|appdata|etc|usr|opt|boot)/i;

  if (destructiveWords.test(cmdLower) && recursiveFlags.test(cmd) && systemPaths.test(cmd)) {
    return {
      safe: false,
      reason: `SEMANTIK: perintah destruktif "${destructiveWords.exec(cmdLower)[0]}" dengan recursive flag menuju system path — ditolak`
    };
  }

  return { safe: true };
}

/**
 * Validate that a file path is not forbidden — Lexical + Semantic check
 * @param {string} filePath - relative or absolute path
 * @param {string} [contentPreview] - optional content preview for deeper semantic check
 * @returns {{ safe: boolean, reason?: string, semantic?: Array }}
 */
function validateFilePath(filePath, contentPreview) {
  if (!filePath || typeof filePath !== 'string') return { safe: false, reason: 'path kosong' };

  const normalized = filePath.replace(/\\/g, '/');

  // ── LEXICAL CHECK (fast fail) ──
  for (const pattern of FORBIDDEN_FILES) {
    if (pattern.test(normalized)) {
      return { safe: false, reason: `LEXICAL: file terlarang (${pattern.source}): ${normalized}` };
    }
  }

  // Check if path is outside QROOT
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(QROOT, filePath);
  if (!absPath.startsWith(QROOT)) {
    return { safe: false, reason: `path di luar root Quantum: ${normalized}` };
  }

  // ── SEMANTIC CHECK (intent-based) ──
  const intents = detectFileIntent(normalized, contentPreview);
  const blockingIntents = intents.filter(i => i.block && i.confidence >= 0.6);

  if (blockingIntents.length > 0) {
    const top = blockingIntents[0];
    return {
      safe: false,
      reason: `SEMANTIK: "${top.intent}" — ${top.description} (confidence ${Math.round(top.confidence * 100)}%). Alasan: ${top.reasons.join(', ')}`,
      semantic: intents,
    };
  }

  // Return non-blocking warnings for informational purposes
  if (intents.length > 0) {
    return { safe: true, semantic: intents };
  }

  return { safe: true };
}

/**
 * Validate an edit operation (dry-run: apply patch in memory, check syntax)
 * @param {string} filePath - target file path
 * @param {string} oldString - string to find
 * @param {string} newString - replacement string
 * @returns {Promise<{ safe: boolean, reason?: string, diff?: string }>}
 */
async function validateEdit(filePath, oldString, newString) {
  // 1. Read current file first (for content preview in semantic check)
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(QROOT, filePath);
  let currentContent;
  try {
    currentContent = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    return { safe: false, reason: `file tidak bisa dibaca: ${e.message}` };
  }

  // 2. Check file path with semantic content preview
  const pathCheck = validateFilePath(filePath, currentContent.slice(0, 2000));
  if (!pathCheck.safe) return pathCheck;

  // 3. Check old_string exists
  if (!currentContent.includes(oldString)) {
    return { safe: false, reason: 'old_string tidak ditemukan di file' };
  }

  // 4. Check NOOP
  if (oldString === newString) {
    return { safe: false, reason: 'NOOP: old_string sama dengan new_string' };
  }

  // 5. Apply patch in memory
  const patched = currentContent.replace(oldString, newString);
  if (patched === currentContent) {
    return { safe: false, reason: 'NOOP: replace tidak mengubah konten' };
  }

  // 6. Write to temp file and syntax check
  const tempPath = absPath + '.sandbox-validate';
  try {
    fs.writeFileSync(tempPath, patched, 'utf8');
    const syntaxCheck = await qSyntaxOk(tempPath);
    fs.unlinkSync(tempPath);

    if (!syntaxCheck.ok) {
      return { safe: false, reason: `sintaks rusak setelah edit:\n${syntaxCheck.error}` };
    }
  } catch (e) {
    try { fs.unlinkSync(tempPath); } catch (_) {}
    return { safe: false, reason: `gagal validasi sintaks: ${e.message}` };
  }

  // 7. Generate diff summary
  const oldLines = currentContent.split('\n').length;
  const newLines = patched.split('\n').length;
  const diff = `${oldLines} → ${newLines} baris (${newLines - oldLines >= 0 ? '+' : ''}${newLines - oldLines})`;

  return { safe: true, diff };
}

/**
 * Validate a write operation (dry-run: write to temp, check syntax)
 * @param {string} filePath - target file path
 * @param {string} content - content to write
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
async function validateWrite(filePath, content) {
  // 1. Check file path with semantic content preview
  const pathCheck = validateFilePath(filePath, (content || '').slice(0, 2000));
  if (!pathCheck.safe) return pathCheck;

  // 2. Check content is not empty (unless intentional)
  if (!content || content.trim() === '') {
    return { safe: false, reason: 'konten kosong — gunakan edit untuk perubahan kecil' };
  }

  // 3. Write to temp file and syntax check
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(QROOT, filePath);
  const tempPath = absPath + '.sandbox-validate';
  try {
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, content, 'utf8');
    const syntaxCheck = await qSyntaxOk(tempPath);
    fs.unlinkSync(tempPath);

    if (!syntaxCheck.ok) {
      return { safe: false, reason: `sintaks rusak:\n${syntaxCheck.error}` };
    }
  } catch (e) {
    try { fs.unlinkSync(tempPath); } catch (_) {}
    return { safe: false, reason: `gagal validasi: ${e.message}` };
  }

  return { safe: true };
}

/**
 * Master validator — routes to specific validator based on tool name
 * @param {string} toolName - 'edit' | 'write' | 'bash'
 * @param {Object} args - tool arguments
 * @returns {Promise<{ safe: boolean, reason?: string, diff?: string }>}
 */
async function validateOperation(toolName, args) {
  switch (toolName) {
    case 'edit':
      return validateEdit(args.path, args.old_string, args.new_string);
    case 'write':
      return validateWrite(args.path, args.content);
    case 'bash':
      return validateBashCommand(args.command);
    default:
      return { safe: true }; // non-destructive tools pass through
  }
}

module.exports = {
  validateOperation,
  validateEdit,
  validateWrite,
  validateBashCommand,
  validateFilePath,
  detectFileIntent,
  qSemanticSearch,
  getPathContext,
  DANGEROUS_PATTERNS,
  FORBIDDEN_FILES,
  SEMANTIC_CATEGORIES,
};
