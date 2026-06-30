// ── Hello World Sample Skill ──
// Demonstrates the Quantum Skills plugin interface.
// Each skill exports: name, version, description, parameters, run(args, ctx)

const name = 'hello-world';
const version = '1.0.0';
const description = 'A sample skill that demonstrates the plugin system. Can greet, echo, or list files in a directory.';

const parameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['greet', 'echo', 'list', 'info'],
      description: 'action to perform: greet (say hello), echo (repeat input), list (list files), info (show system info)'
    },
    input: {
      type: 'string',
      description: 'input text (for greet/echo) or directory path (for list)'
    }
  },
  required: ['action']
};

async function run(args, ctx) {
  const { action, input } = args;

  switch (action) {
    case 'greet': {
      const target = input || 'World';
      return `Hello, ${target}! 👋 Skill v${version} at your service.`;
    }

    case 'echo': {
      if (!input) return 'Echo: (no input provided)';
      return `Echo: ${input}`;
    }

    case 'list': {
      const dir = input || ctx.root;
      const fs = require('fs');
      const path = require('path');
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const lines = entries.slice(0, 50).map(e => {
          const icon = e.isDirectory() ? '📁' : '📄';
          return `${icon} ${e.name}`;
        });
        return `Contents of ${dir}:\n${lines.join('\n')}`;
      } catch (e) {
        return `Error listing ${dir}: ${e.message}`;
      }
    }

    case 'info': {
      const os = require('os');
      return [
        `🔧 Quantum Skills System Info`,
        `  Skill: ${name} v${version}`,
        `  Node: ${process.version}`,
        `  Platform: ${os.platform()} ${os.arch()}`,
        `  Hostname: ${os.hostname()}`,
        `  CWD: ${process.cwd()}`,
        `  Skills Dir: ${ctx.skillsDir}`,
      ].join('\n');
    }

    default:
      return `Unknown action: ${action}. Use: greet, echo, list, or info.`;
  }
}

module.exports = { name, version, description, parameters, run };
