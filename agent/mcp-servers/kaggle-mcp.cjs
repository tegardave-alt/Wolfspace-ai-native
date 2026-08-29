#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

const KAGGLE_API_BASE = "https://www.kaggle.com/api/v1";
const TOKEN = process.env.KAGGLE_API_TOKEN || "";

function kaggleRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, KAGGLE_API_BASE);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Implementasi MCP stdio protocol
const tools = [
  {
    name: "search_kaggle_datasets",
    description: "Search Kaggle datasets by keyword",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "download_kaggle_dataset",
    description: "Download a Kaggle dataset",
    inputSchema: {
      type: "object",
      properties: {
        dataset_ref: {
          type: "string",
          description: "Dataset reference in owner/dataset-slug format",
        },
        download_path: { type: "string", description: "Optional output path" },
      },
      required: ["dataset_ref"],
    },
  },
  {
    name: "competitions_list",
    description: "Search and list Kaggle competitions",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search term" },
        category: { type: "string", description: "Competition category" },
        sort_by: {
          type: "string",
          enum: ["latestDeadline", "numberOfTeams", "recentlyCreated"],
        },
        page: { type: "number", description: "Page number" },
      },
    },
  },
  {
    name: "datasets_list",
    description: "Search and list Kaggle datasets",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search term" },
        sort_by: {
          type: "string",
          enum: ["hottest", "votes", "updated", "active"],
        },
        file_type: { type: "string" },
        page: { type: "number" },
      },
    },
  },
  {
    name: "competition_files",
    description: "List data files for a competition",
    inputSchema: {
      type: "object",
      properties: {
        competition: {
          type: "string",
          description: "Competition URL suffix (e.g. titanic)",
        },
      },
      required: ["competition"],
    },
  },
];

function sendMessage(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

let buffer = "";
process.stdin.on("data", (data) => {
  buffer += data.toString();
  let nlIdx;
  while ((nlIdx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nlIdx).trim();
    buffer = buffer.slice(nlIdx + 1);
    if (line) handleMessage(JSON.parse(line));
  }
});

function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "kaggle-mcp", version: "1.0.0" },
        capabilities: { tools: {} },
      },
    });
  } else if (method === "notifications/initialized") {
    // ignore
  } else if (method === "tools/list") {
    sendMessage({ jsonrpc: "2.0", id, result: { tools } });
  } else if (method === "tools/call") {
    // handleToolCall answers with a JSON-RPC error result of its own, so a
    // failing tool is already reported. This guards the narrower case: a throw
    // inside that catch would end the server process, and the client would see
    // a dead pipe instead of an error it can read.
    handleToolCall(id, params.name, params.arguments || {}).catch((err) => {
      try {
        sendMessage({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: "handler gagal: " + ((err && err.message) || err),
              },
            ],
            isError: true,
          },
        });
      } catch (_) {}
    });
  } else if (method === "ping") {
    sendMessage({ jsonrpc: "2.0", id, result: {} });
  }
}

async function handleToolCall(id, toolName, args) {
  try {
    let result;
    switch (toolName) {
      case "search_kaggle_datasets": {
        const data = await kaggleRequest(
          "GET",
          `/datasets/list?search=${encodeURIComponent(args.query)}&page=${args.page || 1}`,
        );
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
        break;
      }
      case "competitions_list": {
        const q = new URLSearchParams({ page: String(args.page || 1) });
        if (args.search) q.set("search", args.search);
        if (args.category) q.set("category", args.category);
        if (args.sort_by) q.set("sort_by", args.sort_by);
        const data = await kaggleRequest(
          "GET",
          `/competitions/list?${q.toString()}`,
        );
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
        break;
      }
      case "datasets_list": {
        const q = new URLSearchParams({ page: String(args.page || 1) });
        if (args.search) q.set("search", args.search);
        if (args.sort_by) q.set("sort_by", args.sort_by);
        const data = await kaggleRequest(
          "GET",
          `/datasets/list?${q.toString()}`,
        );
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
        break;
      }
      case "competition_files": {
        const data = await kaggleRequest(
          "GET",
          `/competitions/data/list/${args.competition}`,
        );
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
        break;
      }
      case "download_kaggle_dataset": {
        const data = await kaggleRequest(
          "GET",
          `/datasets/download/${args.dataset_ref}`,
        );
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
        break;
      }
      default:
        result = {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
    sendMessage({ jsonrpc: "2.0", id, result });
  } catch (err) {
    sendMessage({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      },
    });
  }
}
