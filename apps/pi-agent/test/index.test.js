import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { applyDirectJsonEdit, createPiAgentServer, createPatchResponse } from "../src/index.js";

async function withPiCliEnv(script, callback, options = {}) {
  const previous = {
    PI_AGENT_MODE: process.env.PI_AGENT_MODE,
    PI_CLI_COMMAND: process.env.PI_CLI_COMMAND,
    PI_CLI_ARGS: process.env.PI_CLI_ARGS,
    PI_CLI_TIMEOUT_MS: process.env.PI_CLI_TIMEOUT_MS
  };
  process.env.PI_AGENT_MODE = "real";
  process.env.PI_CLI_COMMAND = process.execPath;
  process.env.PI_CLI_ARGS = JSON.stringify([script]);
  if (options.timeoutMs !== undefined) {
    process.env.PI_CLI_TIMEOUT_MS = String(options.timeoutMs);
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withGraphDataDir(dataDir, callback) {
  const previousGraphDataDir = process.env.GRAPH_DATA_DIR;
  process.env.GRAPH_DATA_DIR = dataDir;
  try {
    return await callback();
  } finally {
    if (previousGraphDataDir === undefined) {
      delete process.env.GRAPH_DATA_DIR;
    } else {
      process.env.GRAPH_DATA_DIR = previousGraphDataDir;
    }
  }
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("createPatchResponse returns a patch-mode proposal without mutating input", () => {
  const response = createPatchResponse({
    instruction: "Add review",
    selectedNodeIds: ["n1"],
    selectedEdgeIds: [],
    graph: { nodes: [{ id: "n1", label: "One" }], edges: [] },
    mode: "patch"
  });

  assert.equal(response.mode, "patch");
  assert.match(response.patch.patchId, /^patch-/);
  assert.deepEqual(response.patch.operations.map((operation) => operation.op), ["add_node", "add_edge"]);
  assert.equal(response.patch.operations[1].source, "n1");
});

test("applyDirectJsonEdit mutates the shared working graph file", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-pi-agent-"));
  const previousGraphDataDir = process.env.GRAPH_DATA_DIR;
  process.env.GRAPH_DATA_DIR = dataDir;
  const graph = {
    graphId: "working-test",
    name: "Working Test",
    stateType: "working",
    nodes: [{ id: "n1", label: "One", type: "concept", origin: "source" }],
    edges: []
  };
  await writeFile(resolve(dataDir, "working_graph.json"), JSON.stringify(graph), "utf8");
  try {
    const response = await applyDirectJsonEdit({ instruction: "Add direct", selectedNodeIds: ["n1"], selectedEdgeIds: [] });
    const persisted = JSON.parse(await readFile(resolve(dataDir, "working_graph.json"), "utf8"));

    assert.equal(response.mode, "direct_json");
    assert.equal(persisted.nodes.length, 2);
    assert.equal(persisted.edges[0].source, "n1");
  } finally {
    if (previousGraphDataDir === undefined) {
      delete process.env.GRAPH_DATA_DIR;
    } else {
      process.env.GRAPH_DATA_DIR = previousGraphDataDir;
    }
  }
});

test("pi-agent HTTP bridge exposes health and patch chat", async () => {
  const server = createPiAgentServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ok, true);
    assert.equal(health.mode, "mock");

    const chatResponse = await fetch(`http://127.0.0.1:${port}/api/pi/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Add review", selectedNodeIds: [], selectedEdgeIds: [], graph: { nodes: [], edges: [] }, mode: "patch" })
    });
    const chat = await chatResponse.json();
    assert.equal(chatResponse.status, 200);
    assert.equal(chat.mode, "patch");
    assert.equal(chat.rawPiOutput.source, "pi-agent-mock");
    assert.equal(chat.patch.operations[0].op, "add_node");
  } finally {
    await closeServer(server);
  }
});

test("pi-agent real mode adapts Pi CLI JSONL patch output", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-pi-agent-real-"));
  const script = resolve(dataDir, "fake-pi-patch.mjs");
  await writeFile(
    script,
    `import { writeFileSync } from "node:fs";
writeFileSync("patch-argv.json", JSON.stringify(process.argv.slice(2)));
const patch = {
  patchId: "patch-from-fake-pi",
  instruction: "Add real bridge node",
  summary: "Fake Pi CLI patch",
  operations: [{ op: "add_node", id: "real-bridge-node", label: "Real Bridge", nodeType: "concept", origin: "llm", notes: "Produced by fake Pi CLI." }]
};
const response = { message: "Fake Pi CLI proposed a patch.", mode: "patch", patch, rawPiOutput: { fixture: "patch" } };
console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: [{ text: JSON.stringify(response) }] }, toolResults: [] }));
`,
    "utf8"
  );

  await withGraphDataDir(dataDir, async () => withPiCliEnv(script, async () => {
    const server = createPiAgentServer().listen(0);
    await once(server, "listening");
    const { port } = server.address();
    try {
      const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
      const health = await healthResponse.json();
      assert.equal(health.mode, "real");

      const chatResponse = await fetch(`http://127.0.0.1:${port}/api/pi/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Add real bridge node", selectedNodeIds: [], selectedEdgeIds: [], graph: { nodes: [], edges: [] }, mode: "patch" })
      });
      const chat = await chatResponse.json();

      assert.equal(chatResponse.status, 200);
      assert.equal(chat.mode, "patch");
      assert.equal(chat.message, "Fake Pi CLI proposed a patch.");
      assert.equal(chat.patch.patchId, "patch-from-fake-pi");
      assert.equal(chat.patch.operations[0].id, "real-bridge-node");
      assert.equal(chat.rawPiOutput.source, "pi-cli");
      const argv = JSON.parse(await readFile(resolve(dataDir, "patch-argv.json"), "utf8"));
      assert.deepEqual(argv.slice(0, 9), ["--mode", "json", "--no-session", "--no-context-files", "--no-prompt-templates", "--no-skills", "--no-extensions", "--no-tools", argv[8]]);
      assert.match(argv[8], /propose a typed graph patch only/);
    } finally {
      await closeServer(server);
    }
  }));
});

test("pi-agent real mode returns message-only patch responses for plain Pi CLI text", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-pi-agent-real-text-"));
  const script = resolve(dataDir, "fake-pi-text.mjs");
  await writeFile(
    script,
    `console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: [{ text: "I need more graph context before proposing a safe patch." }] }, toolResults: [] }));
`,
    "utf8"
  );

  await withGraphDataDir(dataDir, async () => withPiCliEnv(script, async () => {
    const server = createPiAgentServer().listen(0);
    await once(server, "listening");
    const { port } = server.address();
    try {
      const chatResponse = await fetch(`http://127.0.0.1:${port}/api/pi/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Explain only", selectedNodeIds: [], selectedEdgeIds: [], graph: { nodes: [], edges: [] }, mode: "patch" })
      });
      const chat = await chatResponse.json();

      assert.equal(chatResponse.status, 200);
      assert.equal(chat.mode, "patch");
      assert.equal(chat.patch, undefined);
      assert.match(chat.message, /more graph context/);
      assert.equal(chat.rawPiOutput.source, "pi-cli");
    } finally {
      await closeServer(server);
    }
  }));
});

test("pi-agent real mode reports timeout even if Pi CLI handles SIGTERM cleanly", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-pi-agent-timeout-"));
  const script = resolve(dataDir, "fake-pi-timeout.mjs");
  await writeFile(
    script,
    `process.on("SIGTERM", () => {
  console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: [{ text: JSON.stringify({ message: "Late success", mode: "patch" }) }] }, toolResults: [] }));
  process.exit(0);
});
setInterval(() => {}, 1000);
`,
    "utf8"
  );

  await withGraphDataDir(dataDir, async () => withPiCliEnv(script, async () => {
    const server = createPiAgentServer().listen(0);
    await once(server, "listening");
    const { port } = server.address();
    try {
      const chatResponse = await fetch(`http://127.0.0.1:${port}/api/pi/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Timeout", selectedNodeIds: [], selectedEdgeIds: [], graph: { nodes: [], edges: [] }, mode: "patch" })
      });
      const chat = await chatResponse.json();

      assert.equal(chatResponse.status, 504);
      assert.equal(chat.error.code, "pi_cli_timeout");
    } finally {
      await closeServer(server);
    }
  }, { timeoutMs: 50 }));
});

test("pi-agent real mode lets Pi CLI mutate working_graph.json in direct JSON mode", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-pi-agent-real-direct-"));
  const script = resolve(dataDir, "fake-pi-direct.mjs");
  const graph = {
    graphId: "working-test",
    name: "Working Test",
    stateType: "working",
    nodes: [{ id: "n1", label: "One", type: "concept", origin: "source" }],
    edges: []
  };
  await writeFile(resolve(dataDir, "working_graph.json"), JSON.stringify(graph), "utf8");
  await writeFile(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
writeFileSync("direct-argv.json", JSON.stringify(process.argv.slice(2)));
const graph = JSON.parse(readFileSync("working_graph.json", "utf8"));
graph.nodes.push({ id: "direct-real-node", label: "Direct Real", type: "concept", origin: "llm", notes: "Produced by fake Pi CLI direct edit." });
graph.updatedAt = new Date("2026-05-26T00:00:00.000Z").toISOString();
writeFileSync("working_graph.json", JSON.stringify(graph, null, 2));
console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: [{ text: JSON.stringify({ message: "Fake Pi CLI edited JSON.", mode: "direct_json", rawPiOutput: { fixture: "direct" } }) }] }, toolResults: [] }));
`,
    "utf8"
  );

  await withGraphDataDir(dataDir, async () => withPiCliEnv(script, async () => {
    const server = createPiAgentServer().listen(0);
    await once(server, "listening");
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/pi/direct-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Edit JSON", selectedNodeIds: [], selectedEdgeIds: [], graph: { nodes: graph.nodes, edges: graph.edges }, mode: "direct_json" })
      });
      const body = await response.json();
      const persisted = JSON.parse(await readFile(resolve(dataDir, "working_graph.json"), "utf8"));

      assert.equal(response.status, 200);
      assert.equal(body.mode, "direct_json");
      assert.equal(body.message, "Fake Pi CLI edited JSON.");
      assert.ok(persisted.nodes.some((node) => node.id === "direct-real-node"));
      assert.equal(body.rawPiOutput.source, "pi-cli-direct-json");
      const argv = JSON.parse(await readFile(resolve(dataDir, "direct-argv.json"), "utf8"));
      assert.deepEqual(argv.slice(0, 10), ["--mode", "json", "--no-session", "--no-context-files", "--no-prompt-templates", "--no-skills", "--no-extensions", "--tools", "read,write,edit,bash", argv[9]]);
      assert.match(argv[9], /direct JSON bridge/);
    } finally {
      await closeServer(server);
    }
  }));
});
