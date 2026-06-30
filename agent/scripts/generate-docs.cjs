#!/usr/bin/env node
// Auto-generate docs/prompts.md from config/prompts.json
// Usage: node scripts/generate-docs.cjs

const fs = require('fs');
const path = require('path');

const PROMPTS_CFG_PATH = path.join(__dirname, '..', 'config', 'prompts.json');
const DOCS_PATH = path.join(__dirname, '..', 'docs', 'prompts.md');

function generateDocs() {
  try {
    const cfg = JSON.parse(fs.readFileSync(PROMPTS_CFG_PATH, 'utf8'));
    
    let md = '# Quantum Prompts Documentation\n\n';
    md += '> **Auto-generated** from `config/prompts.json` — DO NOT EDIT MANUALLY\n\n';
    md += `**Version:** ${cfg.version}  \n`;
    md += `**Last Updated:** ${new Date(cfg.updatedAt).toISOString()}\n\n`;
    md += '---\n\n';
    
    // Table of all prompts
    md += '## 📋 All Prompts\n\n';
    md += '| Name | Active | Description | Tags |\n';
    md += '|------|--------|-------------|------|\n';
    
    for (const [name, prompt] of Object.entries(cfg.prompts)) {
      const active = prompt.active ? '✅' : '❌';
      const desc = prompt.metadata?.description || '-';
      const tags = prompt.metadata?.tags?.join(', ') || '-';
      md += `| \`${name}\` | ${active} | ${desc} | ${tags} |\n`;
    }
    
    md += '\n---\n\n';
    
    // Full text for each prompt
    md += '## 📝 Prompt Details\n\n';
    
    for (const [name, prompt] of Object.entries(cfg.prompts)) {
      md += `### ${name}\n\n`;
      md += `**Active:** ${prompt.active ? 'Yes' : 'No'}  \n`;
      if (prompt.appendTo) {
        md += `**Append To:** \`${prompt.appendTo}\`  \n`;
      }
      md += `**Description:** ${prompt.metadata?.description || '-'}  \n`;
      md += `**Tags:** ${prompt.metadata?.tags?.join(', ') || '-'}  \n\n`;
      
      md += '**Text:**\n';
      md += '```\n';
      md += prompt.text;
      md += '\n```\n\n';
      
      // Show optimized version if available
      if (prompt.metadata?.optimized) {
        const opt = prompt.metadata.optimized;
        md += '**Optimized Version:**\n';
        md += `- Original: ${opt.originalLength} chars\n`;
        md += `- Optimized: ${opt.text.length} chars\n`;
        md += `- Reduction: ${Math.round((1 - opt.text.length / opt.originalLength) * 100)}%\n`;
        md += `- Timestamp: ${new Date(opt.timestamp).toISOString()}\n\n`;
        md += '<details>\n';
        md += '<summary>View optimized text</summary>\n\n';
        md += '```\n';
        md += opt.text;
        md += '\n```\n\n';
        md += '</details>\n\n';
      }
      
      md += '---\n\n';
    }
    
    // Routing explanation
    md += '## 🛣️ Routing Rules\n\n';
    md += 'How prompts are selected based on context:\n\n';
    
    for (const [route, config] of Object.entries(cfg.routing)) {
      md += `### ${route}\n\n`;
      md += '```json\n';
      md += JSON.stringify(config, null, 2);
      md += '\n```\n\n';
    }
    
    md += '---\n\n';
    md += '## 🔄 How to Update\n\n';
    md += '1. Edit `config/prompts.json` directly\n';
    md += '2. Run `node scripts/generate-docs.cjs` to regenerate this file\n';
    md += '3. Commit both files\n\n';
    md += '**Never edit this file manually** — it will be overwritten.\n';
    
    // Ensure docs directory exists
    fs.mkdirSync(path.dirname(DOCS_PATH), { recursive: true });
    
    // Write the file
    fs.writeFileSync(DOCS_PATH, md, 'utf8');
    console.log('✅ Generated docs/prompts.md (' + md.length + ' bytes)');
    
  } catch (e) {
    console.error('❌ Error generating docs:', e.message);
    process.exit(1);
  }
}

generateDocs();
