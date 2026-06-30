// ── File Organizer Skill ──
// Sorts files in a directory into subfolders by extension.
// Demonstrates a practical skill with sandbox integration.

const name = 'file-organizer';
const version = '1.0.0';
const description = 'Organize files in a directory by sorting them into subfolders based on file extension. Uses sandbox for safe execution.';

const parameters = {
  type: 'object',
  properties: {
    directory: {
      type: 'string',
      description: 'absolute path to the directory to organize'
    },
    dryRun: {
      type: 'boolean',
      description: 'if true, only show what would be moved without actually moving (default: true)'
    }
  },
  required: ['directory']
};

async function run(args, ctx) {
  const fs = require('fs');
  const path = require('path');
  const dir = args.directory;
  const dryRun = args.dryRun !== false;

  if (!dir || !fs.existsSync(dir)) {
    return `Error: directory '${dir}' not found.`;
  }

  const st = fs.statSync(dir);
  if (!st.isDirectory()) {
    return `Error: '${dir}' is not a directory.`;
  }

  const files = fs.readdirSync(dir, { withFileTypes: true });
  const plan = [];

  for (const entry of files) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase().slice(1) || 'no-ext';
    const targetDir = path.join(dir, ext);

    plan.push({
      from: entry.name,
      to: path.join(ext, entry.name),
      targetDir,
    });
  }

  if (plan.length === 0) {
    return `No files to organize in ${dir}.`;
  }

  // Group by extension
  const groups = {};
  for (const item of plan) {
    const ext = path.basename(item.targetDir);
    if (!groups[ext]) groups[ext] = [];
    groups[ext].push(item.from);
  }

  let output = `${dryRun ? '🔍 DRY RUN' : '📁 ORGANIZING'} ${dir}\n`;
  output += `Found ${plan.length} files across ${Object.keys(groups).length} extensions:\n\n`;

  for (const [ext, files] of Object.entries(groups)) {
    output += `📂 ${ext}/ (${files.length} files)\n`;
    for (const f of files.slice(0, 10)) {
      output += `   ${f} → ${ext}/${f}\n`;
    }
    if (files.length > 10) output += `   ... and ${files.length - 10} more\n`;
  }

  if (!dryRun) {
    let moved = 0, errors = 0;
    for (const item of plan) {
      try {
        fs.mkdirSync(item.targetDir, { recursive: true });
        fs.renameSync(path.join(dir, item.from), path.join(dir, item.to));
        moved++;
      } catch (e) {
        errors++;
        output += `\n❌ Error moving ${item.from}: ${e.message}`;
      }
    }
    output += `\n\n✅ Moved: ${moved}, ❌ Errors: ${errors}`;
  } else {
    output += `\n💡 Run with dryRun: false to actually organize.`;
  }

  ctx.log('file-organizer', { dir, dryRun, files: plan.length });
  return output;
}

module.exports = { name, version, description, parameters, run };
