// ── WOLFSPACE Skills Plugin System ──
// Inspired by OpenClaw's modular skills ecosystem (@openclaw/skills / npm "skills")
// Each skill is a self-contained .cjs module in the skills/ directory.
// Skills are auto-discovered, can be hot-reloaded, and installed from npm/local/URL.

const fs   = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const execP = util.promisify(exec);
const { dlog } = require('./debug.cjs');

const QROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(QROOT, 'skills');

// Ensure skills directory exists
try { fs.mkdirSync(SKILLS_DIR, { recursive: true }); } catch {}

// ── Skill registry ──
// Map of name → { name, version, description, parameters, run, file, loadedAt }
let registry = new Map();

// ── Skill context passed to run() ──
// Provides safe helpers so skills don't need direct fs/exec access
function makeContext(sandboxRunner) {
  return {
    // Read a file (relative to QROOT or absolute, with guardrails)
    readFile: (filePath) => {
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(QROOT, filePath);
      if (!resolved.startsWith(QROOT) && !resolved.startsWith(require('os').homedir()))
        throw new Error('Skill read denied: ' + filePath);
      return fs.readFileSync(resolved, 'utf8');
    },
    // Write a file (only within workspace or QROOT)
    writeFile: (filePath, content) => {
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(QROOT, 'workspace', filePath);
      const ws = path.resolve(QROOT, 'workspace');
      if (!resolved.startsWith(ws) && !resolved.startsWith(QROOT + path.sep + 'skills'))
        throw new Error('Skill write denied: ' + filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');
      return resolved;
    },
    // Run a command in sandbox (if available) or directly
    exec: async (cmd, opts = {}) => {
      if (sandboxRunner) return sandboxRunner(cmd, opts);
      // Fallback: direct exec with guardrails
      const cwd = opts.cwd || QROOT;
      return execP(cmd, { cwd, timeout: opts.timeout || 30000, encoding: 'utf8', windowsHide: true });
    },
    // Log through WOLFSPACE's debug bus
    log: (msg, data) => dlog('skill', 'info', msg, data),
    // Project root
    root: QROOT,
    // Skills directory
    skillsDir: SKILLS_DIR,
  };
}

// ── Load a single skill from file ──
function loadSkill(filePath) {
  const name = path.basename(filePath, '.cjs');
  try {
    // Clear require cache for hot-reload
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    const skill = {
      name: mod.name || name,
      version: mod.version || '0.1.0',
      description: mod.description || 'No description',
      parameters: mod.parameters || { type: 'object', properties: {}, required: [] },
      run: mod.run,
      file: filePath,
      loadedAt: new Date().toISOString(),
    };
    if (typeof skill.run !== 'function') {
      dlog('skill', 'warn', 'Skill missing run()', { file: filePath });
      return null;
    }
    registry.set(skill.name, skill);
    dlog('skill', 'info', 'Skill loaded', { name: skill.name, version: skill.version });
    return skill;
  } catch (e) {
    dlog('skill', 'error', 'Failed to load skill', { file: filePath, error: e.message });
    return null;
  }
}

// ── Discover and load all skills ──
function discoverSkills() {
  registry.clear();
  const loaded = [];
  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.cjs')) {
        const skill = loadSkill(path.join(SKILLS_DIR, e.name));
        if (skill) loaded.push(skill);
      } else if (e.isDirectory()) {
        // Check for index.cjs inside subdirectory
        const idx = path.join(SKILLS_DIR, e.name, 'index.cjs');
        if (fs.existsSync(idx)) {
          const skill = loadSkill(idx);
          if (skill) loaded.push(skill);
        }
      }
    }
  } catch (e) {
    dlog('skill', 'error', 'Skills discovery failed', { error: e.message });
  }
  return loaded;
}

// ── List installed skills ──
function listSkills() {
  return Array.from(registry.values()).map(s => ({
    name: s.name,
    version: s.version,
    description: s.description,
    file: path.relative(QROOT, s.file),
    loadedAt: s.loadedAt,
  }));
}

// ── Get a skill by name ──
function getSkill(name) {
  return registry.get(name) || null;
}

// ── Run a skill ──
async function runSkill(name, args, sandboxRunner) {
  const skill = registry.get(name);
  if (!skill) return { ok: false, output: `Skill '${name}' tidak ditemukan. Gunakan skill_list untuk lihat yang tersedia.` };
  const ctx = makeContext(sandboxRunner);
  try {
    const result = await skill.run(args || {}, ctx);
    return { ok: true, output: typeof result === 'string' ? result : JSON.stringify(result, null, 2) };
  } catch (e) {
    return { ok: false, output: `Skill '${name}' error: ${e.message}` };
  }
}

// ── Install a skill from npm ──
async function installFromNpm(packageName) {
  try {
    dlog('skill', 'info', 'Installing skill from npm', { package: packageName });
    const { stdout } = await execP(`npm install ${packageName} --prefix "${SKILLS_DIR}" --no-save`, {
      timeout: 60000, encoding: 'utf8', windowsHide: true
    });
    // Try to discover the installed skill
    return { ok: true, output: `npm install ${packageName} selesai.\n${stdout.slice(-500)}` };
  } catch (e) {
    return { ok: false, output: `npm install gagal: ${e.message}` };
  }
}

// ── Install a skill from a local .cjs file ──
function installFromFile(sourcePath) {
  try {
    const name = path.basename(sourcePath, '.cjs');
    const dest = path.join(SKILLS_DIR, name + '.cjs');
    fs.copyFileSync(sourcePath, dest);
    const skill = loadSkill(dest);
    if (skill) {
      return { ok: true, output: `Skill '${skill.name}' v${skill.version} terinstall dari ${sourcePath}` };
    }
    return { ok: false, output: `File disalin ke ${dest} tapi gagal load sebagai skill.` };
  } catch (e) {
    return { ok: false, output: `Install dari file gagal: ${e.message}` };
  }
}

// ── Uninstall a skill ──
function uninstallSkill(name) {
  const skill = registry.get(name);
  if (!skill) return { ok: false, output: `Skill '${name}' tidak ditemukan.` };
  try {
    fs.unlinkSync(skill.file);
    registry.delete(name);
    dlog('skill', 'info', 'Skill uninstalled', { name });
    return { ok: true, output: `Skill '${name}' dihapus.` };
  } catch (e) {
    return { ok: false, output: `Gagal hapus skill: ${e.message}` };
  }
}

// ── Reload all skills ──
function reloadSkills() {
  return discoverSkills();
}

// ── Generate OpenAI function-calling tool definitions for all installed skills ──
function skillToolDefinitions() {
  return Array.from(registry.values()).map(s => ({
    type: 'function',
    function: {
      name: 'skill_' + s.name,
      description: `[SKILL] ${s.description}`,
      parameters: s.parameters,
    }
  }));
}

// ── Initial load on module require ──
discoverSkills();

module.exports = {
  SKILLS_DIR,
  discoverSkills,
  listSkills,
  getSkill,
  runSkill,
  installFromNpm,
  installFromFile,
  uninstallSkill,
  reloadSkills,
  skillToolDefinitions,
  registry,
};

