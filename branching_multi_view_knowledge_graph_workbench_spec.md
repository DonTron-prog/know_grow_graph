# Branching Multi-View Knowledge Graph Workbench Specification

## 1. Purpose

The system explores knowledge graphs as dynamic reasoning substrates rather than fixed domain representations.

The first verification target is not a complete workbench. It is whether an LLM, guided by a user, can transform an Obsidian-like graph into a new ontology using split and merge operations in a way that produces useful insight and can be quickly visually assessed.

The starting reference graph is the Applied Agentic AI vault:

- 439 markdown files
- 2,846 wikilinks
- Approximately 6.48 wikilinks per file
- 56 concept nodes in the concept layer

The first prototype should target the 56 concept nodes before expanding to the full 439-file graph. This keeps the semantic transformation problem visible before slide-level noise dominates.

## 2. Design Position

The system should not optimize for one beautiful graph visualization. It should optimize for a visual diff workbench.

Obsidian-style force graphs are useful for attention and spatial intuition, but they are weak for explaining semantic surgery. Split and merge operations require a separate lineage representation.

Core distinction:

- Force graph: the map
- Lineage graph: the audit trail

These must remain separate views, but they should be synchronized.

## 3. Architectural Rule

Visual state is never canonical.

The database owns truth. The UI displays graph state, proposes changes, and stores layout preferences, but it does not directly define semantic graph state.

Canonical graph state is derived from:

```text
SourceGraph + AcceptedTransformOps + BranchPointer
```

Rendered view state is derived from:

```text
Render(CanonicalState, LayoutPreferences)
```

This is an event-sourcing model. Accepted transform operations are immutable semantic events. The current branch graph is deterministically materialized from the source graph and accepted operations.

### Canonical State

Canonical data includes:

- Source nodes
- Source edges
- Accepted transform operations
- Branch ids
- Branch mode
- Branch purpose
- Evidence references
- Provenance links
- Acceptance/rejection status
- Validation results
- Loss receipts

### Non-Canonical State

Non-canonical data includes:

- Node x/y positions
- Zoom level
- Pan position
- Collapsed groups
- Selected node
- Manual visual clustering
- Color overrides
- Temporary LLM proposals
- Draft transform operations

Dragging two nodes together does not merge them. It only changes layout metadata. A merge exists only when an accepted transform operation is written.

## 4. Core Data Model

### Nodes

```json
{
  "node_id": "Prompt",
  "label": "Prompt",
  "type": "concept",
  "properties": {},
  "source_refs": ["01-Sessions/02-Effective-Prompts/Slide-210.md"]
}
```

### Edges

```json
{
  "edge_id": "edge-001",
  "src": "Prompt",
  "rel": "used_in",
  "dst": "Slide-210",
  "weight": 1.0,
  "evidence_refs": ["01-Sessions/02-Effective-Prompts/Slide-210.md"]
}
```

### Branches

```json
{
  "branch_id": "exploratory-pedagogy-v1",
  "parent_branch_id": "source",
  "mode": "exploratory",
  "fallback_mode": "pedagogical_if_obvious",
  "purpose": "Find a clearer teaching ontology for agentic AI concepts.",
  "loss_policy": {
    "blocking": false,
    "allowed_loss": "high",
    "surface": "summary_badges"
  },
  "primary_metric": "insight_gain",
  "secondary_metrics": [
    "compression_gain",
    "new_bridge_concepts",
    "human_interestingness"
  ]
}
```

### Transform Operations

Transform operations are the primitive unit of semantic change.

```json
{
  "op_id": "op-0042",
  "branch_id": "exploratory-pedagogy-v1",
  "type": "merge",
  "inputs": ["Prompt", "Persona", "Few-Shot"],
  "outputs": ["Prompt-Control-Surface"],
  "merge_theory": "pedagogical_abstraction",
  "rationale": "These concepts function together as user-controllable prompt design levers in the teaching sequence.",
  "evidence_refs": [
    "01-Sessions/02-Effective-Prompts/Slide-210.md",
    "01-Sessions/02-Effective-Prompts/Slide-221.md",
    "01-Sessions/02-Effective-Prompts/Slide-236.md"
  ],
  "status": "accepted"
}
```

## 5. Split and Merge Operation Types

The system should treat merges as different claims about sameness or usefulness, not as one generic operation.

Supported merge theories should include:

1. Synonym merge
   - Example: `LLM` + `Large Language Model`
   - Low-risk cleanup.

2. Alias/tool merge
   - Example: `ChatGPT`, `GPT`, `OpenAI model` when used interchangeably.
   - Risk: vendor/tool confusion with concept.

3. Role merge
   - Example: `planner`, `orchestrator`, `controller`.
   - Useful for agent architecture abstractions.

4. Evidence-neighbourhood merge
   - Nodes share many graph neighbours or edge patterns.
   - Similar to graph clustering methods such as Louvain or Leiden.

5. Causal merge
   - Different labels describe the same causal mechanism.
   - Example: `retrieval failure`, `bad chunking`, `source mismatch` → `context assembly failure`.

6. Abstraction merge
   - Concrete examples become a higher-level concept.
   - Example: `temperature`, `few-shot`, `persona` → `prompt control surface`.

7. Temporal merge
   - Same entity or idea across time/version boundaries.
   - Example: `Week 9 agent safety` + `Week 10 reliability` → `agent operations lifecycle`.

8. Pedagogical merge
   - Concepts should be taught together even if ontologically distinct.

9. Controversy merge
   - Competing framings are grouped into one unresolved question.

10. Anti-merge candidate
   - LLM proposes a merge and the system highlights why it may be invalid or misleading.

Split operations should use analogous theories:

- Split by causal mechanism
- Split by pedagogical unit
- Split by role in workflow
- Split by evidence source
- Split by abstraction level
- Split by temporal phase
- Split by controversy or competing frame

Every split or merge must declare its theory.

## 6. Branch Modes

Branch mode controls how transformations are judged. The same operation can be excellent in one mode and invalid in another.

### 6.1 Exploratory

Default mode.

Goal: generate surprising alternate structure.

Losses: allowed.

UI behavior: summarize semantic cost, do not block.

LLM behavior: bold split/merge proposals encouraged.

Primary metric: insight gain.

### 6.2 Pedagogical

Auto-suggest when obvious.

Goal: improve teachability, compression, and learning sequence.

Losses: allowed if clarity improves.

UI behavior: emphasize lesson sequence, prerequisite chains, and concept grouping.

LLM behavior: merge concepts that belong in the same teaching unit.

Trigger rule:

```text
The model may classify a branch as pedagogical_if_obvious only if it states why the concepts form a teachable unit.
```

### 6.3 Conservative

Goal: preserve most source structure while improving labels and groupings.

Losses: reviewed.

UI behavior: warn for high-evidence loss.

LLM behavior: prefer retyping and light grouping over destructive changes.

### 6.4 Forensic

Goal: evidence-faithful reconstruction.

Losses: blocking for evidence-bearing edges.

UI behavior: audit-first.

LLM behavior: no radical ontology surgery.

## 7. Loss Policy

Loss is not inherently failure.

For this project, exploratory and pedagogical insight are valued higher than preserving every lost edge or node. Therefore the audit log should function as a receipt, not a brake, unless the branch mode requires preservation.

Example loss receipt:

```json
{
  "loss_id": "loss-018",
  "op_id": "merge-042",
  "branch_id": "exploratory-pedagogy-v1",
  "loss_type": "edge_removed",
  "old_edge": ["Guardrails", "constrains", "Agent"],
  "dropped_because": "New ontology reframes safety as lifecycle governance, not local runtime constraint.",
  "impact": "Removes one direct control relation but may reveal broader governance cluster.",
  "blocking": false,
  "surface_in_ui": "badge_only",
  "human_status": "unreviewed"
}
```

Example lost node receipt:

```json
{
  "loss_id": "loss-019",
  "op_id": "split-012",
  "branch_id": "exploratory-causal-v1",
  "loss_type": "node_orphaned",
  "old_node": "Guardrails",
  "dropped_because": "The branch decomposes safety into lifecycle governance, runtime constraints, and review policy. The original umbrella node is not retained.",
  "impact": "Six evidence edges become unreachable from the old node label, but their source references remain attached to successor concepts where applicable.",
  "blocking": false,
  "surface_in_ui": "badge_only",
  "human_status": "unreviewed"
}
```

## 8. Views

The workbench should have separate but synchronized visual views.

### 8.1 Main Force Graph

Purpose: spatial intuition.

Question answered:

```text
What clusters, bridges, and neighbourhoods changed?
```

Best for:

- Spotting emergent communities
- Seeing bridges between clusters
- Noticing unexpected grouping
- Navigating the semantic space

Weakness:

- Poor at explaining why a split or merge happened
- Hairballs hide semantic failure

Recommended dependency: Cytoscape.js.

Possible large-graph alternative: Sigma.js with Graphology.

### 8.2 Lineage Graph

Purpose: epistemic accountability.

Question answered:

```text
What old concepts became what new concepts, through which operation?
```

Canonical shape:

```text
old nodes -> transform operation -> new nodes
```

Examples:

```text
Prompt + Persona + Few-Shot -> merge:pedagogical_abstraction -> Prompt-Control-Surface
```

```text
Guardrails -> split:causal_mechanism -> Runtime Constraint + Governance Policy + Human Review Boundary
```

Best for:

- Reviewing split/merge operations
- Seeing source ancestry
- Seeing invented hypotheses
- Seeing orphaned/lost concepts
- Validating transformation meaning

Recommended dependency: React Flow with Dagre layout.

Escalation dependency: ELK/elkjs if compound lineage, cross-hierarchy edges, or nested grouping become necessary.

### 8.3 Inspector Panel

Clicking a transformed node or operation should show:

- Old node ids
- New node ids
- Transform operation id
- Transform type
- Merge/split theory
- Branch mode
- Branch purpose
- LLM rationale
- Evidence refs
- Preserved edges
- Lost edges
- Hypothesis markers
- Human status

### 8.4 Synchronization Behavior

- Clicking a merged node in the force graph highlights its source nodes in the lineage graph.
- Clicking a split operation in the lineage graph highlights where the fragments landed in the force graph.
- Selecting a loss badge opens the corresponding loss receipt.
- Layout changes do not affect canonical state.

## 9. Materialization Semantics

Materialization is the deterministic process that turns accepted operations into the semantic branch graph. Operation nodes themselves are not part of the materialized semantic graph; they appear only in lineage and audit views.

### 9.1 Node Materialization

- Merge inputs disappear from the materialized branch graph and remain visible in lineage.
- Split inputs disappear from the materialized branch graph and remain visible in lineage.
- Every source node removed from the materialized branch graph creates a node loss receipt.
- Output node ids are deterministic slugs derived from output labels.
- Each operation must create distinct output nodes. Two operations may not output the same node id.
- Later operations may use nodes created by earlier operations, but lineage must remain traceable back to source nodes.
- Materialized nodes preserve source references only when explicitly mapped.
- Node relabeling or retyping requires an explicit `relabel_node` or `retype_node` operation.

### 9.2 Edge Materialization

- Merge operations transfer only edges explicitly mapped by the operation.
- A merge operation with no edge mappings is valid; it creates output nodes without transferred branch edges.
- Unmapped merge edges are retained as lineage-only evidence and are not materialized as branch edges.
- Split edges are distributed to split outputs by LLM semantic assignment during acceptance/materialization preparation.
- LLM split edge assignments are run once at acceptance and stored as canonical data for replay.
- Duplicate materialized edges are collapsed into one edge with combined evidence and provenance.
- Conflicting edge labels between the same nodes are resolved by the LLM into one chosen label.
- LLM conflict resolution is stored canonically only when approved by the user.
- If a conflict resolution is not user-approved, the lower-confidence edge is dropped from the materialized graph and retained as lineage-only evidence.
- Dropped edges do not create loss receipts; only dropped nodes do.
- Materialized edges preserve source evidence references only when explicitly mapped.
- Edge relabeling or retyping requires an explicit `relabel_edge` or `retype_edge` operation.
- A relabeled edge is represented during materialization as a mutation of the old edge label, backed by the explicit relabel/retype operation.

### 9.3 Operation Ordering and Dependency Handling

- Accepted operations replay in dependency order, with sequence number as the tie-breaker.
- Invalid dependencies trigger an LLM repair attempt.
- If LLM repair fails, acceptance of the dependent operation is blocked.
- Rejected operations are ignored during replay but retained in audit/history.
- Correcting an accepted operation creates a new branch from before the bad operation rather than mutating accepted history.

### 9.4 Replay, Comparison, and Hypotheses

- Deterministic replay requires an identical semantic graph. Layout, lineage rendering, and receipts are excluded from the strict replay equality check.
- Branch comparison treats nodes as matching when their lineage overlaps, even if ids differ.
- Hypothesis nodes and edges are included in branch comparison like normal graph elements, but visibly marked.
- Hypotheses may be used as inputs to later operations and are treated like normal nodes for operation purposes.
- If any input is hypothetical, the output is marked `partially_hypothetical`.

### 9.5 Operation Metadata Requirements

- LLM-proposed operations require rationale.
- Human-authored operations may omit rationale.
- LLM-proposed operations require evidence references when available.
- Accepted operations store LLM confidence only.
- Anti-merge candidates are outside MVP scope.
- There is no hard cap on operation batch size for MVP, but the UI should warn for large batches.
- Branch mode affects validation severity only. Materialization semantics do not change by branch mode.

## 10. Canonical Schema and Validation Contracts

The canonical store should be optimized for deterministic replay, efficient local queries, and compact LLM-readable exports.

Recommended storage pattern:

- DuckDB tables for canonical source graph, branches, operations, mappings, validation, and current materializations.
- Parquet snapshots for versioned source/materialized node and edge tables.
- JSONL exports for LLM-readable node, edge, and operation cards.

Normalized tables are canonical. JSON fields are allowed for extensibility, but core replay fields should remain typed columns.

### 10.1 Source Graph Tables

#### `source_nodes`

```sql
CREATE TABLE source_nodes (
  node_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  node_type TEXT NOT NULL, -- concept, file, slide, etc.
  path TEXT,
  properties JSON,
  created_at TIMESTAMP DEFAULT now()
);
```

#### `source_edges`

```sql
CREATE TABLE source_edges (
  edge_id TEXT PRIMARY KEY,
  src_node_id TEXT NOT NULL,
  dst_node_id TEXT NOT NULL,
  rel TEXT NOT NULL,
  weight DOUBLE DEFAULT 1.0,
  evidence_count INTEGER DEFAULT 0,
  properties JSON
);
```

#### `source_refs`

Source references are stored in a table rather than arrays so they can be joined, filtered, copied, or omitted efficiently.

```sql
CREATE TABLE source_refs (
  ref_id TEXT PRIMARY KEY,
  node_id TEXT,
  edge_id TEXT,
  ref_type TEXT NOT NULL, -- markdown_file, wikilink, slide, heading
  ref_path TEXT NOT NULL,
  ref_label TEXT,
  start_line INTEGER,
  end_line INTEGER
);
```

### 10.2 Branch Tables

#### `branches`

```sql
CREATE TABLE branches (
  branch_id TEXT PRIMARY KEY,
  parent_branch_id TEXT,
  mode TEXT NOT NULL, -- exploratory, pedagogical, conservative, forensic
  purpose TEXT NOT NULL,
  loss_policy JSON,
  branch_pointer TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

#### `branch_heads`

```sql
CREATE TABLE branch_heads (
  branch_id TEXT PRIMARY KEY,
  head_sequence_number BIGINT NOT NULL,
  updated_at TIMESTAMP DEFAULT now()
);
```

### 10.3 Transform Operation Tables

Transform operations are compact parent rows. Inputs, outputs, source mappings, and edge mappings are stored in child tables.

#### `transform_ops`

```sql
CREATE TABLE transform_ops (
  op_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,

  op_type TEXT NOT NULL, -- merge, split, relabel_node, retype_node, relabel_edge, retype_edge
  theory TEXT,           -- required for merge/split

  scope_type TEXT NOT NULL, -- selected_nodes, concept_layer, folder, full_graph, branch
  scope_value TEXT,

  status TEXT NOT NULL, -- draft, accepted, rejected, invalid
  proposed_by TEXT NOT NULL, -- llm, human
  accepted_at TIMESTAMP,

  rationale TEXT,
  llm_confidence DOUBLE,
  properties JSON,

  UNIQUE(branch_id, sequence_number)
);
```

#### `transform_inputs`

```sql
CREATE TABLE transform_inputs (
  op_id TEXT NOT NULL,
  input_node_id TEXT NOT NULL,
  input_node_kind TEXT NOT NULL, -- source, branch_materialized, hypothesis
  ordinal INTEGER,
  PRIMARY KEY (op_id, input_node_id)
);
```

#### `transform_outputs`

```sql
CREATE TABLE transform_outputs (
  op_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  output_node_id TEXT NOT NULL,
  label TEXT NOT NULL,
  node_type TEXT NOT NULL,
  hypothesis_status TEXT NOT NULL, -- source_backed, hypothesis, partially_hypothetical
  properties JSON,

  PRIMARY KEY (op_id, output_node_id),
  UNIQUE(branch_id, output_node_id)
);
```

The `UNIQUE(branch_id, output_node_id)` constraint encodes the rule that two operations in the same branch cannot output the same node.

### 10.4 Explicit Mapping Tables

Explicit mappings are required where the spec says source references or edge evidence are preserved only if mapped.

#### `node_source_mappings`

```sql
CREATE TABLE node_source_mappings (
  mapping_id TEXT PRIMARY KEY,
  op_id TEXT NOT NULL,
  input_node_id TEXT NOT NULL,
  output_node_id TEXT NOT NULL,
  copy_source_refs BOOLEAN NOT NULL DEFAULT false,
  rationale TEXT
);
```

#### `edge_mappings`

Used for merge edge transfer, explicit edge preservation, and lineage-only retention.

```sql
CREATE TABLE edge_mappings (
  mapping_id TEXT PRIMARY KEY,
  op_id TEXT NOT NULL,
  old_edge_id TEXT NOT NULL,

  new_src_node_id TEXT NOT NULL,
  new_dst_node_id TEXT NOT NULL,
  new_rel TEXT NOT NULL,

  copy_evidence_refs BOOLEAN NOT NULL DEFAULT false,
  mapping_status TEXT NOT NULL, -- materialized, lineage_only, dropped_conflict
  rationale TEXT,
  llm_confidence DOUBLE
);
```

#### `split_edge_assignments`

LLM split edge assignment happens once at acceptance and is stored canonically for deterministic replay.

```sql
CREATE TABLE split_edge_assignments (
  assignment_id TEXT PRIMARY KEY,
  op_id TEXT NOT NULL,
  old_edge_id TEXT NOT NULL,

  assigned_src_node_id TEXT,
  assigned_dst_node_id TEXT,
  assigned_rel TEXT,

  assignment_status TEXT NOT NULL, -- materialized, lineage_only
  rationale TEXT,
  llm_confidence DOUBLE
);
```

### 10.5 Conflict Resolution Tables

```sql
CREATE TABLE edge_conflicts (
  conflict_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  op_id TEXT NOT NULL,

  src_node_id TEXT NOT NULL,
  dst_node_id TEXT NOT NULL,

  conflicting_edge_ids JSON NOT NULL,
  conflicting_rels JSON NOT NULL,

  llm_chosen_rel TEXT,
  user_approved BOOLEAN NOT NULL DEFAULT false,

  dropped_edge_id TEXT,
  dropped_edge_retention TEXT NOT NULL DEFAULT 'lineage_only',

  rationale TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

If the user approves conflict resolution, the chosen relation is materialized. If not approved, the lower-confidence edge is dropped from the materialized graph and retained as lineage-only evidence.

### 10.6 Loss Receipt Table

Loss receipts are node-only in the MVP. Dropped or unmapped edges are represented through edge mapping status or lineage-only evidence.

```sql
CREATE TABLE loss_receipts (
  loss_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  op_id TEXT NOT NULL,

  loss_type TEXT NOT NULL DEFAULT 'node_removed',
  old_node_id TEXT NOT NULL,

  successor_node_ids JSON,
  dropped_because TEXT,
  impact TEXT,

  blocking BOOLEAN NOT NULL DEFAULT false,
  human_status TEXT NOT NULL DEFAULT 'unreviewed',

  created_at TIMESTAMP DEFAULT now()
);
```

### 10.7 Materialized Branch Tables

Materialized branch tables may be regenerated, but storing them makes UI rendering, branch comparison, and LLM export faster.

#### `materialized_nodes`

```sql
CREATE TABLE materialized_nodes (
  branch_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  label TEXT NOT NULL,
  node_type TEXT NOT NULL,

  origin_op_id TEXT,
  hypothesis_status TEXT NOT NULL, -- source_backed, hypothesis, partially_hypothetical

  lineage_hash TEXT,
  properties JSON,

  PRIMARY KEY (branch_id, node_id)
);
```

#### `materialized_edges`

```sql
CREATE TABLE materialized_edges (
  branch_id TEXT NOT NULL,
  edge_id TEXT NOT NULL,

  src_node_id TEXT NOT NULL,
  dst_node_id TEXT NOT NULL,
  rel TEXT NOT NULL,

  origin_op_id TEXT,
  source_edge_ids JSON,
  evidence_ref_ids JSON,

  weight DOUBLE DEFAULT 1.0,
  properties JSON,

  PRIMARY KEY (branch_id, edge_id)
);
```

Materialized edge ids should be deterministic, for example:

```text
edge:{branch_id}:{src_slug}:{rel_slug}:{dst_slug}:{hash(source_edge_ids)}
```

### 10.8 Lineage Tables

Operation nodes are not semantic graph nodes, but lineage should be stored explicitly for fast traversal and LLM-readable explanations.

```sql
CREATE TABLE lineage_links (
  lineage_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  op_id TEXT NOT NULL,

  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,

  lineage_type TEXT NOT NULL, -- merge_input, split_input, source_to_output, hypothesis_to_output
  source_depth INTEGER DEFAULT 0
);
```

### 10.9 Validation Results

```sql
CREATE TABLE validation_results (
  validation_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  op_id TEXT,

  severity TEXT NOT NULL, -- blocker, warning, info
  code TEXT NOT NULL,
  message TEXT NOT NULL,

  repairable_by_llm BOOLEAN DEFAULT false,
  requires_human BOOLEAN DEFAULT false,

  status TEXT NOT NULL DEFAULT 'open', -- open, repaired, ignored, approved
  created_at TIMESTAMP DEFAULT now()
);
```

### 10.10 LLM-Readable Views and Exports

LLMs should not read the raw normalized schema by default. The system should export compact cards that combine the most relevant canonical fields. Export jobs may enrich these views with lineage, input, output, and evidence details from child tables before writing JSONL.

#### `llm_node_cards`

```sql
CREATE VIEW llm_node_cards AS
SELECT
  n.branch_id,
  n.node_id,
  n.label,
  n.node_type,
  n.hypothesis_status,
  n.origin_op_id,
  n.lineage_hash,
  n.properties
FROM materialized_nodes n;
```

Example JSONL card:

```json
{
  "node_id": "prompt-control-surface",
  "label": "Prompt Control Surface",
  "type": "concept",
  "hypothesis_status": "source_backed",
  "lineage": ["Prompt", "Persona", "Few-Shot"],
  "origin_op": "op-0042"
}
```

#### `llm_edge_cards`

```sql
CREATE VIEW llm_edge_cards AS
SELECT
  e.branch_id,
  e.edge_id,
  e.src_node_id,
  e.rel,
  e.dst_node_id,
  e.origin_op_id,
  e.source_edge_ids,
  e.evidence_ref_ids,
  e.weight
FROM materialized_edges e;
```

Example JSONL card:

```json
{
  "edge_id": "edge:branch-a:prompt-control-surface:supports:agent-reliability:abc123",
  "src": "prompt-control-surface",
  "rel": "supports",
  "dst": "agent-reliability",
  "source_edge_ids": ["edge-001", "edge-044"],
  "evidence_ref_ids": ["ref-210", "ref-236"]
}
```

#### `llm_operation_cards`

```sql
CREATE VIEW llm_operation_cards AS
SELECT
  op_id,
  branch_id,
  sequence_number,
  op_type,
  theory,
  scope_type,
  status,
  rationale,
  llm_confidence
FROM transform_ops
WHERE status IN ('draft', 'accepted');
```

Example JSONL card:

```json
{
  "op_id": "op-0042",
  "type": "merge",
  "theory": "pedagogical",
  "inputs": ["Prompt", "Persona", "Few-Shot"],
  "outputs": ["prompt-control-surface"],
  "rationale": "These concepts function together as user-controllable prompt design levers.",
  "confidence": 0.82
}
```

### 10.11 Recommended Storage Layout

```text
data/project.duckdb
data/parquet/source_nodes.parquet
data/parquet/source_edges.parquet
data/parquet/branches/{branch_id}/materialized_nodes.parquet
data/parquet/branches/{branch_id}/materialized_edges.parquet
data/ops/{branch_id}.jsonl
data/llm_exports/{branch_id}/node_cards.jsonl
data/llm_exports/{branch_id}/edge_cards.jsonl
data/llm_exports/{branch_id}/operation_cards.jsonl
```

### 10.12 Schema Validation Contract

Validation should treat the following as blockers before acceptance:

- Missing branch mode or branch purpose.
- Missing transform scope.
- Missing operation type.
- Missing split/merge theory for split or merge operations.
- Output node id collision within a branch.
- Missing lineage or hypothesis marking for an accepted output node.
- Invalid dependency that cannot be repaired by the LLM.
- LLM-dependent split edge assignment that has not been stored canonically.

Validation should treat the following as warnings unless branch mode escalates severity:

- Large operation batches.
- Merge operations with no edge mappings.
- Low-confidence LLM assignments.
- Dropped lower-confidence conflict edges retained only as lineage evidence.
- Missing optional human-authored rationale.

## 11. Recommended Dependencies

### Recommended Stack

- Cytoscape.js for the semantic force graph
- React Flow for the split/merge operation graph
- DuckDB for local canonical tables and fast diff queries
- Parquet for versioned node/edge snapshots
- Dagre for initial lineage layout
- ELK/elkjs only if Dagre breaks on compound lineage

### Dependency Comparison

| Dependency | License | Role | Strength | Tradeoff |
|---|---:|---|---|---|
| Cytoscape.js | MIT | Interactive graph visualization | Good styling, selection, compound nodes, graph algorithms | Less WebGL-scale oriented than Sigma |
| Sigma.js | MIT | Large graph rendering | WebGL, strong for thousands of nodes | Weaker for rich semantic editing and compound operation inspection |
| Graphology | MIT | JS graph model | Pairs well with Sigma | More model than UI |
| React Flow / xyflow | MIT | Node-based operation UI | Strong for lineage editors and custom node cards | Not a graph analytics engine |
| Dagre | MIT | Directed layout | Simple and quick for DAGs | Weaker for compound graphs and cross-hierarchy edges |
| ELK / elkjs | EPL-2.0 | Advanced graph layout | Compound graphs, ports, edge labels, layered direction | License less permissive than MIT; more complexity |
| DuckDB | MIT | Local analytical database | Fast local queries, good for edge tables and diffs | Not a graph database |
| Parquet | Apache-2.0 | Columnar storage | Efficient versioned snapshots | Not directly interactive |
| NetworkX | BSD-3-Clause | Python graph analysis prototype | Great for algorithms and experiments | Not runtime UI infrastructure |
| Neo4j Community | GPLv3 | Graph database alternative | Strong graph query model | GPL and open-core tradeoffs; branch/version diff workflow is heavier |

## 12. Invariants

These invariants protect branch meaning rather than preserving the old graph at all costs.

### 12.1 Canonical Derivation Invariant

Canonical graph state is derived from source graph plus immutable accepted transform operations. UI layout and canvas edits are non-canonical metadata.

### 12.2 Lineage Invariant

Every accepted new node has at least one of:

- `source_node_ids`
- `transform_op_id`
- `hypothesis_origin`

No mystery nodes are allowed.

### 12.3 Operation Typing Invariant

Every split or merge declares its theory.

Examples:

- synonym
- alias_tool
- role
- evidence_neighbourhood
- causal
- abstraction
- temporal
- pedagogical
- controversy
- anti_merge

### 12.4 Branch Mode Invariant

Every branch declares a mode:

- exploratory
- pedagogical
- conservative
- forensic

Validation severity depends on branch mode.

### 12.5 Branch Purpose Invariant

Every branch has an explicit purpose statement before transform acceptance.

Example:

```text
Find a more teachable ontology for agentic AI concepts.
```

Exploratory transformations without a stated purpose become visually interesting but impossible to judge.

### 12.6 Deterministic Replay Invariant

`SourceGraph + AcceptedOps + BranchPointer` must regenerate the same semantic branch graph.

Layout, lineage rendering, and loss receipts are excluded from strict replay equality. LLM-dependent materialization choices, such as split edge assignment, must be run once at acceptance and stored as canonical data rather than recomputed during replay.

### 12.7 Non-Canonical UI Invariant

Dragging, clustering, hiding, zooming, and coloring never change semantic state.

### 12.8 Hypothesis Marking Invariant

Any LLM-invented node or edge without source ancestry is marked as hypothesis, not fact.

### 12.9 Acceptance Invariant

LLM proposals are drafts until user/system acceptance creates immutable transform operations.

### 12.10 Loss Receipt Invariant

Dropped nodes are recorded as loss receipts, but blocking depends on branch mode. Dropped or unmapped edges are retained as lineage-only evidence or operation metadata, not loss receipts.

### 12.11 No Silent Overwrite Invariant

Corrections create new operations. Old accepted operations are not mutated.

### 12.12 Scope Invariant

Every transform declares input scope:

- selected nodes
- concept layer
- folder/subgraph
- full graph
- branch

## 13. State Machine

The system moves from an initial graph to a proposed graph through explicit states.

### S0: SourceGraphLoaded

Obsidian nodes and wikilinks are imported.

No transform has been proposed.

### S1: BranchInitialized

A branch exists with:

- branch id
- parent branch id
- mode
- purpose
- loss policy

### S2: TransformScopeSelected

The user selects the scope of transformation:

- selected nodes
- concept layer
- folder/subgraph
- full graph
- branch

### S3: DirectionCaptured

The user gives natural-language direction.

Examples:

```text
Merge concepts by pedagogical abstraction.
```

```text
Split safety concepts by causal mechanism.
```

```text
Find a more useful ontology for teaching agentic AI reliability.
```

### S4: DraftOpsProposed

The LLM proposes split and merge operations.

These are non-canonical drafts.

### S5: DraftOpsValidated

The system checks invariants:

- lineage exists
- operation type is declared
- branch mode exists
- branch purpose exists
- hypotheses are marked
- losses are recorded
- transform scope is declared
- deterministic replay is possible

In exploratory mode, validation should surface issues without blocking unless the issue violates structural invariants such as missing lineage or missing operation type.

### S6: VisualDiffRendered

The system renders the proposed branch using synchronized views:

- Force graph
- Lineage graph
- Inspector panel
- Loss badges or summaries

The proposed graph is still not canonical.

### S7: HumanReview

The user can:

- accept operations
- reject operations
- edit draft operations
- request regeneration
- change branch mode
- change transform direction
- change transform scope

### S8: OpsAccepted

Accepted operations become immutable canonical events.

This is the dangerous transition because drafts become branch history.

### S9: BranchMaterialized

The branch graph is materialized from:

```text
SourceGraph + AcceptedOps + BranchPointer
```

In the MVP, materialization must reproduce an identical semantic graph on replay. Layout, lineage rendering, and loss receipt rendering may differ.

### S10: BranchCompared

The materialized branch can be compared against:

- source graph
- parent branch
- sibling branch
- previous accepted state

## 14. State Transitions

```text
S0 SourceGraphLoaded
  -> S1 BranchInitialized
  -> S2 TransformScopeSelected
  -> S3 DirectionCaptured
  -> S4 DraftOpsProposed
  -> S5 DraftOpsValidated
  -> S6 VisualDiffRendered
  -> S7 HumanReview
```

From `S7 HumanReview`:

```text
accept -> S8 OpsAccepted -> S9 BranchMaterialized -> S10 BranchCompared
reject -> S3 DirectionCaptured or S4 DraftOpsProposed
edit   -> S5 DraftOpsValidated
rescope -> S2 TransformScopeSelected
change mode -> S1 BranchInitialized or S5 DraftOpsValidated
```

## 15. MVP Scope

The MVP should test the smallest complete loop:

1. Import Obsidian wikilinks into node and edge tables.
2. Restrict first run to the 56 concept nodes.
3. Create an exploratory branch by default.
4. Require explicit branch purpose.
5. User provides transform direction.
6. LLM proposes split/merge transform operations.
7. System validates structural invariants.
8. System records loss receipts without blocking exploratory branches.
9. UI renders separate synchronized force and lineage views.
10. User accepts or rejects proposed operations.
11. Accepted operations materialize a branch.
12. Branch can be reconstructed or approximated from recorded decisions and lineage.

## 16. First Verification

The first verification should answer:

```text
Can an LLM, directed by a user, transform an Obsidian-like concept graph into a new ontology through split/merge operations, while preserving enough lineage and visual auditability for the user to assess whether the new ontology is insightful?
```

The verification should not require full provenance preservation. For exploratory and pedagogical modes, insight is more important than retaining every old edge or node.

Success indicators:

- User can understand what changed in under a few minutes.
- Each new node has lineage or is marked as hypothesis.
- Each split/merge has a declared theory.
- Losses are visible as receipts, not blockers.
- Branch can be replayed at the decision level, preserving accepted split/merge decisions, lineage, rationale, and loss receipts.
- The new ontology exposes at least one useful abstraction, bridge, teaching unit, or causal decomposition that was difficult to see in the original graph.

## 17. Open Design Questions

1. What exact scoring rubric should measure `insight_gain`?
2. Should pedagogical mode be a branch mode, a scoring overlay, or both?
3. How much editing should users do directly on draft transform operations before acceptance?
4. Should anti-merge candidates be generated automatically during validation?
5. Should the system support multiple LLM proposals side-by-side for the same scope and direction?
6. How should branch comparison handle two radically different ontologies with little shared node identity?
7. Should evidence-neighbourhood merge use graph clustering, embeddings, LLM rationale, or a hybrid?
8. What is the smallest UI that makes lineage review faster than reading a JSON diff?
