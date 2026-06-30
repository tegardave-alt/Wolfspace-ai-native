const https = require('https');
const fs = require('fs');
const path = require('path');

const name = 'eraser-io';
const version = '1.0.0';
const description = 'Generate technical diagrams (architecture, sequence, ERD, flowchart, BPMN) via Eraser.io API. Supports AI prompt-to-diagram and direct DSL rendering.';

const parameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['generate-from-prompt', 'generate-from-dsl', 'edit-diagram'],
      description: 'generate-from-prompt (AI: natural language -> diagram), generate-from-dsl (direct Eraser DSL -> diagram), edit-diagram (edit existing via prior request ID)'
    },
    text: {
      type: 'string',
      description: '[prompt/edit] Natural language description of the diagram to generate, or edit instruction'
    },
    diagramType: {
      type: 'string',
      enum: ['sequence-diagram', 'entity-relationship-diagram', 'cloud-architecture-diagram', 'flowchart-diagram', 'bpmn-diagram', 'freeform-diagram'],
      description: '[prompt/dsl] Type of diagram (default: auto-detect for prompt; required for DSL)'
    },
    code: {
      type: 'string',
      description: '[dsl] Eraser DSL code for the diagram (see https://docs.eraser.io/docs/diagram-as-code)'
    },
    priorRequestId: {
      type: 'string',
      description: '[edit] ID of a previous Eraser request to edit'
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark'],
      description: 'Diagram theme (default: dark)'
    },
    background: {
      type: 'boolean',
      description: 'Solid background (default: false = transparent)'
    },
    imageQuality: {
      type: 'integer',
      enum: [1, 2, 3],
      description: 'Image quality 1-3 (default: 2)'
    },
    createFile: {
      type: 'boolean',
      description: 'Create an editable Eraser file and return its URL (default: false)'
    }
  },
  required: ['action']
};

function getApiKey(ctx) {
  if (process.env.ERASER_API_KEY) return process.env.ERASER_API_KEY;
  try {
    const cfgPath = path.join(ctx.root, 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg.eraser && cfg.eraser.apiKey) return cfg.eraser.apiKey;
  } catch {}
  return null;
}

function eraserRequest(endpoint, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'app.eraser.io',
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run(args, ctx) {
  const apiKey = getApiKey(ctx);
  if (!apiKey) {
    return 'Eraser API key not found. Set ERASER_API_KEY env var or add "eraser": { "apiKey": "..." } to config.json. Get a key at https://app.eraser.io/dashboard/all?settings=api-tokens (paid plan required).';
  }

  const theme = args.theme || 'dark';
  const background = args.background === true;

  try {
    let result;

    if (args.action === 'generate-from-prompt') {
      if (!args.text) return 'Parameter "text" wajib untuk generate-from-prompt.';

      const body = {
        text: args.text,
        theme,
        background,
        imageQuality: args.imageQuality || 2,
      };
      if (args.diagramType) body.diagramType = args.diagramType;
      if (args.createFile) {
        body.fileOptions = { create: true, linkAccess: 'anyone-with-link-can-edit' };
      }

      result = await eraserRequest('/api/render/prompt', body, apiKey);

    } else if (args.action === 'edit-diagram') {
      if (!args.priorRequestId) return 'Parameter "priorRequestId" wajib untuk edit-diagram.';
      if (!args.text) return 'Parameter "text" (edit instruction) wajib untuk edit-diagram.';

      const body = {
        text: args.text,
        priorRequestId: args.priorRequestId,
        theme,
        background,
        imageQuality: args.imageQuality || 2,
      };
      if (args.createFile) {
        body.fileOptions = { create: true, linkAccess: 'anyone-with-link-can-edit' };
      }

      result = await eraserRequest('/api/render/prompt', body, apiKey);

    } else if (args.action === 'generate-from-dsl') {
      if (!args.code) return 'Parameter "code" (Eraser DSL) wajib untuk generate-from-dsl.';
      if (!args.diagramType) return 'Parameter "diagramType" wajib untuk generate-from-dsl.';

      const body = {
        theme,
        background,
        imageQuality: args.imageQuality || 2,
        elements: [{
          type: 'diagram',
          diagramType: args.diagramType,
          code: args.code,
        }],
      };
      if (args.createFile) {
        body.fileOptions = { create: true, linkAccess: 'anyone-with-link-can-edit' };
      }

      result = await eraserRequest('/api/render/elements', body, apiKey);

    } else {
      return 'Unknown action. Gunakan: generate-from-prompt, generate-from-dsl, atau edit-diagram.';
    }

    if (result.status !== 200) {
      const msg = result.data?.error || result.data?.message || JSON.stringify(result.data);
      return `Eraser API error (${result.status}): ${msg}`;
    }

    const d = result.data;
    let output = '';

    if (d.imageUrl) {
      output += `![Diagram](${d.imageUrl})\n\n`;
      output += `Image URL: ${d.imageUrl}\n`;
    }
    if (d.fileUrl) {
      output += `Eraser File: ${d.fileUrl}\n`;
    } else if (d.createEraserFileUrl) {
      output += `Create Eraser File: ${d.createEraserFileUrl}\n`;
    }
    if (d.requestId) {
      output += `Request ID: ${d.requestId}\n`;
    }
    if (d.diagrams && d.diagrams.length > 0) {
      for (const diag of d.diagrams) {
        output += `\nDiagram type: ${diag.diagramType}\n`;
        if (diag.code) {
          output += `\nEraser DSL code:\n\`\`\`\n${diag.code}\n\`\`\`\n`;
        }
      }
    }

    return output || JSON.stringify(d, null, 2);
  } catch (e) {
    return `Eraser IO error: ${e.message}`;
  }
}

module.exports = { name, version, description, parameters, run };
