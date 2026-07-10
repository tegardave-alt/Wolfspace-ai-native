// build.mjs — compile TS + bundle public/ and core/ into extension
import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname);
const quantumRoot = resolve(root, '..');

function log(msg) { console.log('[build]', msg); }

function copyDir(src, dest) {
  if (!existsSync(src)) { log(`SKIP ${src} (not found)`); return; }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  log(`Copied ${src} → ${dest}`);
}

async function build() {
  log('Starting build...');

  // Step 1: Compile TypeScript
  try {
    log('Compiling TypeScript...');
    execSync('npx tsc --project tsconfig.json', { cwd: root, stdio: 'inherit' });
    log('TypeScript compiled successfully.');
  } catch (err) {
    log('TypeScript compilation failed.');
    process.exit(1);
  }

  // Step 2: Bundle assets
  log('Bundling assets...');
  copyDir(join(quantumRoot, 'public'), join(root, 'public'));
  copyDir(join(quantumRoot, 'core'),  join(root, 'core'));
  const srv = join(quantumRoot, 'server.cjs');
  if (existsSync(srv)) { cpSync(srv, join(root, 'server.cjs')); log('Copied server.cjs'); }
  const cfg = join(quantumRoot, 'config.json');
  if (existsSync(cfg)) { cpSync(cfg, join(root, 'config.json')); log('Copied config.json'); }

  log('Build complete.');
}

build();
