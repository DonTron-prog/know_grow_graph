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

This is an event-sourcing model. Accepted transform operations are immutable semantic events. The current branch graph is regenerated from the source graph and accepted operations.

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

## 9. Recommended Dependencies

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

## 10. Invariants

These invariants protect branch meaning rather than preserving the old graph at all costs.

### 10.1 Canonical Derivation Invariant

Canonical graph state is derived from source graph plus immutable accepted transform operations. UI layout and canvas edits are non-canonical metadata.

### 10.2 Lineage Invariant

Every accepted new node has at least one of:

- `source_node_ids`
- `transform_op_id`
- `hypothesis_origin`

No mystery nodes are allowed.

### 10.3 Operation Typing Invariant

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

### 10.4 Branch Mode Invariant

Every branch declares a mode:

- exploratory
- pedagogical
- conservative
- forensic

Validation severity depends on branch mode.

### 10.5 Branch Purpose Invariant

Every branch has an explicit purpose statement before transform acceptance.

Example:

```text
Find a more teachable ontology for agentic AI concepts.
```

Exploratory transformations without a stated purpose become visually interesting but impossible to judge.

### 10.6 Deterministic Replay Invariant

`SourceGraph + AcceptedOps + BranchPointer` must regenerate the same branch graph.

Layout is excluded from this invariant.

### 10.7 Non-Canonical UI Invariant

Dragging, clustering, hiding, zooming, and coloring never change semantic state.

### 10.8 Hypothesis Marking Invariant

Any LLM-invented node or edge without source ancestry is marked as hypothesis, not fact.

### 10.9 Acceptance Invariant

LLM proposals are drafts until user/system acceptance creates immutable transform operations.

### 10.10 Loss Receipt Invariant

Dropped nodes and edges are recorded, but blocking depends on branch mode.

### 10.11 No Silent Overwrite Invariant

Corrections create new operations. Old accepted operations are not mutated.

### 10.12 Scope Invariant

Every transform declares input scope:

- selected nodes
- concept layer
- folder/subgraph
- full graph
- branch

## 11. State Machine

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

The branch graph is regenerated from:

```text
SourceGraph + AcceptedOps + BranchPointer
```

### S10: BranchCompared

The materialized branch can be compared against:

- source graph
- parent branch
- sibling branch
- previous accepted state

## 12. State Transitions

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

## 13. MVP Scope

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
12. Branch can be deterministically replayed.

## 14. First Verification

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
- Branch can be replayed deterministically.
- The new ontology exposes at least one useful abstraction, bridge, teaching unit, or causal decomposition that was difficult to see in the original graph.

## 15. Open Design Questions

1. What exact scoring rubric should measure `insight_gain`?
2. Should pedagogical mode be a branch mode, a scoring overlay, or both?
3. How much editing should users do directly on draft transform operations before acceptance?
4. Should anti-merge candidates be generated automatically during validation?
5. Should the system support multiple LLM proposals side-by-side for the same scope and direction?
6. How should branch comparison handle two radically different ontologies with little shared node identity?
7. Should evidence-neighbourhood merge use graph clustering, embeddings, LLM rationale, or a hybrid?
8. What is the smallest UI that makes lineage review faster than reading a JSON diff?
