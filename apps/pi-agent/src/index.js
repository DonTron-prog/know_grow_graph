import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const DEFAULT_PORT = Number(process.env.PI_AGENT_PORT ?? 4100);

function getGraphDataDir() {
  return process.env.GRAPH_DATA_DIR ?? ".data";
}

export function createPiAgentServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true, graphDataDir: getGraphDataDir() });
        return;
      }

      if (req.method === "POST" && req.url === "/api/pi/chat") {
        const request = await readJsonBody(req);
        sendJson(res, 200, createPatchResponse(request));
        return;
      }

      if (req.method === "POST" && req.url === "/api/pi/direct-edit") {
        const request = await readJsonBody(req);
        sendJson(res, 200, await applyDirectJsonEdit(request));
        return;
      }

      sendJson(res, 404, { error: { code: "not_found", message: "Route not found." } });
    } catch (error) {
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
    console.log(`pi-agent mock bridge listening on http://localhost:${DEFAULT_PORT}`);
    console.log(`graph data dir: ${getGraphDataDir()}`);
  });
}
