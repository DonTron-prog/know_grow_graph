import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const DEFAULT_PORT = Number(process.env.PI_AGENT_PORT ?? 4100);

class PiAgentHttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getGraphDataDir() {
  return process.env.GRAPH_DATA_DIR ?? ".data";
}

function getPiAgentMode() {
  return (process.env.PI_AGENT_MODE ?? "mock").trim().toLowerCase();
}

function shouldUseRealPi() {
  return ["real", "pi", "cli"].includes(getPiAgentMode());
}

function getPiCliCommand() {
  return process.env.PI_CLI_COMMAND?.trim() || "pi";
}

function getPiCliTimeoutMs() {
  const value = Number(process.env.PI_CLI_TIMEOUT_MS ?? 60_000);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

function createClientAbortSignal(req, res) {
  const controller = new AbortController();
  const abortIfClientClosed = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  req.on("aborted", abortIfClientClosed);
  res.on("close", abortIfClientClosed);
  return controller.signal;
}

export function createPiAgentServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          ok: true,
          mode: shouldUseRealPi() ? "real" : "mock",
          graphDataDir: getGraphDataDir(),
          ...(shouldUseRealPi() ? { piCliCommand: getPiCliCommand() } : {})
        });
        return;
      }

      if (req.method === "POST" && req.url === "/api/pi/chat") {
        const abortSignal = createClientAbortSignal(req, res);
        const request = await readJsonBody(req);
        sendJson(res, 200, shouldUseRealPi() ? await createRealPatchResponse(request, abortSignal) : createPatchResponse(request));
        return;
      }

      if (req.method === "POST" && req.url === "/api/pi/direct-edit") {
        const abortSignal = createClientAbortSignal(req, res);
        const request = await readJsonBody(req);
        sendJson(res, 200, shouldUseRealPi() ? await applyRealDirectJsonEdit(request, abortSignal) : await applyDirectJsonEdit(request));
        return;
      }

      sendJson(res, 404, { error: { code: "not_found", message: "Route not found." } });
    } catch (error) {
      if (error instanceof PiAgentHttpError) {
        sendJson(res, error.status, {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details })
          }
        });
        return;
      }

      sendJson(res, 400, {
        error: {
          code: "invalid_request",
          message: error instanceof Error ? error.message : "Invalid Pi agent request."
        }
      });
    }
  });
}

export function createPatchResponse(request) {
  const instruction = typeof request?.instruction === "string" ? request.instruction : "";
  const graph = request?.graph && typeof request.graph === "object" ? request.graph : { nodes: [], edges: [] };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const selectedNodeIds = Array.isArray(request?.selectedNodeIds) ? request.selectedNodeIds : [];
  const anchorNodeId = selectedNodeIds.find((id) => nodes.some((node) => node?.id === id)) ?? nodes[0]?.id;
  const nodeId = uniqueId(nodes, `pi-${slugify(instruction) || "suggestion"}`);
  const operations = [
    {
      op: "add_node",
      id: nodeId,
      label: instruction.trim() ? `Pi: ${instruction.trim().slice(0, 48)}` : "Pi suggested concept",
      nodeType: "concept",
      origin: "llm",
      notes: "Mock pi-agent patch proposal.",
      ...(anchorNodeId ? { sourceNodeIds: [anchorNodeId] } : {})
    }
  ];

  if (anchorNodeId) {
    operations.push({
      op: "add_edge",
      id: uniqueId(edges, `edge-${anchorNodeId}-${nodeId}`),
      source: anchorNodeId,
      target: nodeId,
      label: "suggests",
      origin: "llm",
      notes: "Mock pi-agent relationship from selected or first node."
    });
  }

  const patch = {
    patchId: `patch-${randomUUID()}`,
    instruction,
    summary: "Mock pi-agent patch proposal",
    operations
  };

  return {
    message: "Pi agent proposed a patch. Review and apply it through the backend patch endpoint.",
    mode: "patch",
    patch,
    rawPiOutput: { source: "pi-agent-mock", graphDataDir: getGraphDataDir() }
  };
}

export async function applyDirectJsonEdit(request) {
  const instruction = typeof request?.instruction === "string" ? request.instruction : "";
  const graphDataDir = getGraphDataDir();
  const workingGraphPath = resolve(graphDataDir, "working_graph.json");
  const graph = JSON.parse(await readFile(workingGraphPath, "utf8"));
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const selectedNodeIds = Array.isArray(request?.selectedNodeIds) ? request.selectedNodeIds : [];
  const anchorNodeId = selectedNodeIds.find((id) => nodes.some((node) => node?.id === id)) ?? nodes[0]?.id;
  const nodeId = uniqueId(nodes, `pi-${slugify(instruction) || "direct-suggestion"}`);
  const nextGraph = {
    ...graph,
    nodes: [
      ...nodes,
      {
        id: nodeId,
        label: instruction.trim() ? `Pi: ${instruction.trim().slice(0, 48)}` : "Pi direct JSON concept",
        type: "concept",
        origin: "llm",
        notes: "Mock pi-agent direct JSON edit.",
        ...(anchorNodeId ? { sourceNodeIds: [anchorNodeId] } : {})
      }
    ],
    edges,
    updatedAt: new Date().toISOString()
  };

  if (anchorNodeId) {
    nextGraph.edges = [
      ...edges,
      {
        id: uniqueId(edges, `edge-${anchorNodeId}-${nodeId}`),
        source: anchorNodeId,
        target: nodeId,
        label: "suggests",
        origin: "llm",
        notes: "Mock pi-agent direct JSON relationship."
      }
    ];
  }

  await writeFile(workingGraphPath, `${JSON.stringify(nextGraph, null, 2)}\n`, "utf8");
  return {
    message: "Pi agent edited working_graph.json directly.",
    mode: "direct_json",
    rawPiOutput: { source: "pi-agent-mock-direct-json", graphDataDir, workingGraphPath, addedNodeId: nodeId }
  };
}

export async function createRealPatchResponse(request, abortSignal) {
  const piResult = await runPiCli(createPatchPrompt(request), {
    cwd: getGraphDataDir(),
    tools: [],
    timeoutMs: getPiCliTimeoutMs(),
    abortSignal
  });
  const parsed = parsePiJsonOutput(piResult.finalText, { allowPlainText: true });
  return normalizePatchResponse(parsed, piResult);
}

export async function applyRealDirectJsonEdit(request, abortSignal) {
  const piResult = await runPiCli(createDirectJsonPrompt(request), {
    cwd: getGraphDataDir(),
    tools: ["read", "write", "edit", "bash"],
    timeoutMs: getPiCliTimeoutMs(),
    abortSignal
  });
  const parsed = parsePiJsonOutput(piResult.finalText, { allowEmpty: true });
  return normalizeDirectEditResponse(parsed, piResult);
}

function createPatchPrompt(request) {
  return `You are Pi Coder running as the Know Grow Graph pi-agent bridge.

Goal: propose a typed graph patch only. Do not edit files. Return exactly one JSON object and no Markdown fences or explanatory text.

Return shape:
{
  "message": string,
  "mode": "patch",
  "patch": {
    "patchId": string,
    "instruction": string,
    "summary": string,
    "operations": GraphPatchOperation[]
  },
  "rawPiOutput"?: object
}

Allowed operations:
- {"op":"add_node","id":string,"label":string,"nodeType":string,"origin":"llm"|"human","notes"?:string,"sourceNodeIds"?:string[]}
- {"op":"update_node","id":string,"changes":{"label"?:string,"type"?:string,"notes"?:string,"properties"?:object}}
- {"op":"delete_node","id":string,"deleteIncidentEdges"?:boolean}
- {"op":"add_edge","id":string,"source":string,"target":string,"label":string,"origin":"llm"|"human","notes"?:string,"sourceEdgeIds"?:string[]}
- {"op":"update_edge","id":string,"changes":{"label"?:string,"notes"?:string,"properties"?:object}}
- {"op":"delete_edge","id":string}
- {"op":"merge_nodes","inputNodeIds":string[],"outputNode":GraphNode,"replacementEdges"?:GraphEdge[],"deleteInputNodes":boolean}
- {"op":"split_node","inputNodeId":string,"outputNodes":GraphNode[],"replacementEdges"?:GraphEdge[],"deleteInputNode":boolean}

Rules:
- Patch mode must not mutate working_graph.json or source_graph.json.
- Use stable, unique ids based on the instruction.
- Prefer small, reviewable changes grounded in the selected nodes/edges.
- Include notes/rationale on operations when possible.
- Do not attempt to mutate source graph directly; source-origin working-copy elements may be updated/deleted only through patch operations.

Request JSON:
${JSON.stringify(request, null, 2)}
`;
}

function createDirectJsonPrompt(request) {
  const graphDataDir = getGraphDataDir();
  return `You are Pi Coder running as the Know Grow Graph pi-agent direct JSON bridge.

Goal: apply the user's requested graph edit by modifying mutable files in this directory: ${graphDataDir}

Files and rules:
- You may read and write working_graph.json.
- You may read and write snapshots.json and snapshots/*.json only if the instruction requires snapshot metadata or snapshot graph edits.
- You may read source_graph.json, but you must not modify, remove, or reformat source_graph.json.
- Preserve valid Know Grow Graph JSON shapes. Nodes need id, label, type, origin. Edges need id, source, target, label, origin.
- Keep working_graph.json stateType as "working".
- Prefer small, reviewable edits grounded in the selected nodes/edges.

After editing, return exactly one JSON object and no Markdown fences:
{
  "message": string,
  "mode": "direct_json",
  "rawPiOutput"?: object
}

Request JSON:
${JSON.stringify(request, null, 2)}
`;
}

function normalizePatchResponse(parsed, piResult) {
  const patch = parsed?.patch ?? (isGraphPatchLike(parsed) ? parsed : undefined);
  const rawPiOutput = {
    source: "pi-cli",
    ...(parsed?.rawPiOutput && typeof parsed.rawPiOutput === "object" ? parsed.rawPiOutput : {}),
    events: piResult.events,
    stderr: piResult.stderr,
    ...(piResult.finalText ? { finalText: piResult.finalText } : {})
  };

  if (!patch) {
    return {
      message: typeof parsed?.message === "string" ? parsed.message : (typeof parsed?.plainText === "string" ? parsed.plainText : "Pi CLI returned no patch."),
      mode: "patch",
      rawPiOutput
    };
  }

  return {
    message: typeof parsed?.message === "string" ? parsed.message : "Pi CLI proposed a patch.",
    mode: "patch",
    patch,
    rawPiOutput
  };
}

function normalizeDirectEditResponse(parsed, piResult) {
  return {
    message: typeof parsed?.message === "string" ? parsed.message : "Pi CLI completed direct JSON editing.",
    mode: "direct_json",
    rawPiOutput: {
      source: "pi-cli-direct-json",
      ...(parsed?.rawPiOutput && typeof parsed.rawPiOutput === "object" ? parsed.rawPiOutput : {}),
      events: piResult.events,
      stderr: piResult.stderr,
      ...(piResult.finalText ? { finalText: piResult.finalText } : {})
    }
  };
}

function isGraphPatchLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.patchId === "string" && Array.isArray(value.operations));
}

async function runPiCli(prompt, options) {
  const command = getPiCliCommand();
  const args = [
    ...parseExtraArgs(process.env.PI_CLI_ARGS),
    "--mode",
    "json",
    "--no-session",
    "--no-context-files",
    "--no-prompt-templates",
    "--no-skills",
    "--no-extensions"
  ];
  if (options.tools.length > 0) {
    args.push("--tools", options.tools.join(","));
  } else {
    args.push("--no-tools");
  }
  args.push(prompt);

  const { stdout, stderr, exitCode, signal } = await spawnAndCollect(command, args, options);
  const events = parseJsonLines(stdout);
  const finalText = extractFinalAssistantText(events) || stdout.trim();

  if (exitCode !== 0) {
    throw new PiAgentHttpError(502, "pi_cli_failed", `Pi CLI exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}.`, {
      command,
      args: redactPromptArg(args),
      stderr,
      stdout,
      finalText
    });
  }

  return { stdout, stderr, events, finalText };
}

function spawnAndCollect(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceKillTimeout;

    const cleanup = () => {
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
      options.abortSignal?.removeEventListener("abort", abortChild);
    };
    const requestStop = () => {
      child.kill("SIGTERM");
      forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 2_000);
      forceKillTimeout.unref();
    };
    const abortChild = () => {
      aborted = true;
      requestStop();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestStop();
    }, options.timeoutMs);
    options.abortSignal?.addEventListener("abort", abortChild, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new PiAgentHttpError(502, "pi_cli_unavailable", `Could not start Pi CLI '${command}': ${error.message}`));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (timedOut) {
        reject(new PiAgentHttpError(504, "pi_cli_timeout", `Pi CLI did not finish within ${options.timeoutMs}ms.`, { stdout, stderr }));
        return;
      }
      if (aborted || signal === "SIGTERM" || signal === "SIGKILL") {
        reject(new PiAgentHttpError(499, "pi_cli_aborted", "Pi CLI was stopped because the client request closed before completion.", { stdout, stderr }));
        return;
      }
      resolvePromise({ stdout, stderr, exitCode, signal });
    });
  });
}

function parseExtraArgs(value) {
  if (!value?.trim()) {
    return [];
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new PiAgentHttpError(400, "invalid_pi_cli_args", "PI_CLI_ARGS JSON must be an array of strings.");
    }
    return parsed;
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

function redactPromptArg(args) {
  if (args.length === 0) {
    return [];
  }
  return [...args.slice(0, -1), "<prompt redacted>"];
}

function parseJsonLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter((event) => event !== undefined);
}

function extractFinalAssistantText(events) {
  for (const event of [...events].reverse()) {
    if ((event?.type === "turn_end" || event?.type === "message_end") && event.message) {
      const text = messageContentToText(event.message.content);
      if (text.trim()) {
        return text.trim();
      }
    }
    if (event?.type === "agent_end" && Array.isArray(event.messages)) {
      for (const message of [...event.messages].reverse()) {
        if (message?.role === "assistant") {
          const text = messageContentToText(message.content);
          if (text.trim()) {
            return text.trim();
          }
        }
      }
    }
  }
  return "";
}

function messageContentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (typeof part?.text === "string") {
        return part.text;
      }
      if (typeof part?.content === "string") {
        return part.content;
      }
      return "";
    })
    .join("");
}

function parsePiJsonOutput(text, options = {}) {
  const trimmed = stripMarkdownFence(text.trim());
  if (!trimmed && options.allowEmpty) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Fall through to plain-text or structured error handling.
      }
    }
    if (options.allowPlainText) {
      return { message: trimmed || "Pi CLI returned no text.", mode: "patch", plainText: trimmed };
    }
    if (options.allowEmpty) {
      return {};
    }
    throw new PiAgentHttpError(502, "invalid_pi_output", "Pi CLI did not return parseable JSON.", { finalText: text });
  }
}

function stripMarkdownFence(value) {
  const fenceMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : value;
}

function uniqueId(elements, preferred) {
  const existing = new Set(elements.map((element) => element?.id).filter((id) => typeof id === "string"));
  const safePreferred = preferred.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "pi-suggestion";
  if (!existing.has(safePreferred)) {
    return safePreferred;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${safePreferred}-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
}

function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(body)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createPiAgentServer().listen(DEFAULT_PORT, () => {
    console.log(`pi-agent bridge listening on http://localhost:${DEFAULT_PORT}`);
    console.log(`mode: ${shouldUseRealPi() ? "real" : "mock"}`);
    console.log(`graph data dir: ${getGraphDataDir()}`);
  });
}
