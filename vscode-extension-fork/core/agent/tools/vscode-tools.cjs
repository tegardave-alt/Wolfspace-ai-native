// core/agent/tools/vscode-tools.cjs
// VS Code-specific tools — menghasilkan "action" untuk dikirim ke extension.
// Tidak mengeksekusi langsung, tapi mengembalikan object action.

const { ACTIONS } = require('../../bridge/vscode-bridge.cjs');

const openFile = {
  name: 'vscode_openFile',
  description: 'Open a file in VS Code editor at optional line:column.',
  schema: {
    type: 'object',
    properties: {
      path:       { type: 'string', description: 'Absolute file path' },
      line:       { type: 'number', description: 'Line number (1-based)' },
      selection:  { type: 'string', description: 'Text to select after opening' },
    },
    required: ['path'],
  },
  async handler({ path, line, selection }) {
    return { action: ACTIONS.OPEN_FILE, params: { path, line, selection } };
  },
};

const applyEdit = {
  name: 'vscode_applyEdit',
  description: 'Apply text edits to a file in VS Code workspace.',
  schema: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'Absolute file path' },
      edits:   {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startLine: { type: 'number' },
            startCol:  { type: 'number' },
            endLine:   { type: 'number' },
            endCol:    { type: 'number' },
            newText:   { type: 'string' },
          },
          required: ['startLine', 'startCol', 'endLine', 'endCol', 'newText'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  async handler({ path, edits }) {
    return { action: ACTIONS.APPLY_EDIT, params: { path, edits } };
  },
};

const showDiagnostics = {
  name: 'vscode_showDiagnostics',
  description: 'Show diagnostics (errors/warnings) in VS Code Problems panel.',
  schema: {
    type: 'object',
    properties: {
      uri:     { type: 'string' },
      diagnostics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            message:  { type: 'string' },
            severity: { type: 'string', enum: ['error','warning','info'] },
            line:     { type: 'number' },
            col:      { type: 'number' },
          },
          required: ['message','severity','line','col'],
        },
      },
    },
    required: ['uri','diagnostics'],
  },
  async handler({ uri, diagnostics }) {
    return { action: ACTIONS.SHOW_DIAGNOSTICS, params: { uri, diagnostics } };
  },
};

const runCommand = {
  name: 'vscode_runCommand',
  description: 'Execute any VS Code command by ID (e.g. workbench.action.files.newUntitledFile).',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      args:    { type: 'array', items: {} },
    },
    required: ['command'],
  },
  async handler({ command, args }) {
    return { action: ACTIONS.RUN_COMMAND, params: { command, args: args || [] } };
  },
};

const createTerminal = {
  name: 'vscode_createTerminal',
  description: 'Create or reuse a VS Code integrated terminal and optionally run a command.',
  schema: {
    type: 'object',
    properties: {
      name:    { type: 'string' },
      command: { type: 'string', description: 'Shell command to execute' },
      cwd:     { type: 'string' },
    },
    required: ['name'],
  },
  async handler({ name, command, cwd }) {
    return { action: ACTIONS.CREATE_TERMINAL, params: { name, command, cwd } };
  },
};

const writeTerminal = {
  name: 'vscode_writeTerminal',
  description: 'Write text to an existing VS Code terminal.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      text: { type: 'string' },
    },
    required: ['name', 'text'],
  },
  async handler({ name, text }) {
    return { action: ACTIONS.WRITE_TERMINAL, params: { name, text } };
  },
};

module.exports = [
  openFile, applyEdit, showDiagnostics, runCommand,
  createTerminal, writeTerminal,
];
