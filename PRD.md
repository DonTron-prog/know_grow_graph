# Product Requirements Document: Branching Multi-View Knowledge Graph Workbench

## 1. Product Summary

The Branching Multi-View Knowledge Graph Workbench is a local-first tool for transforming knowledge graphs into alternate ontologies with help from an LLM.

The product starts from an Obsidian-like graph, such as a vault of markdown files connected by wikilinks. A user gives the LLM a transformation direction, such as “merge concepts into clearer teaching units” or “split concepts by causal mechanism.” The LLM proposes split and merge operations. The user reviews the proposed transformation through visual diff views, accepts useful operations, and saves the result as a branch.

The product is not trying to produce one perfect graph. It is trying to help users explore multiple useful representations of the same knowledge base.

## 2. Problem Statement

Knowledge graphs often harden around one ontology: one set of entities, relationships, abstractions, and assumptions. That structure can be useful for one task, but limiting for others.

The same domain may need to be viewed as:

- a teaching sequence
- a causal system
- a research landscape
- a memory structure
- an organizational map
- a set of competing hypotheses
- a workflow or process model

Today, tools like Obsidian provide a graph view, but that view mostly shows links. It does not help a user safely transform the graph into a new ontology, compare branches, or understand what semantic operations changed the representation.

LLMs can propose alternate abstractions, but without structure they can silently lose provenance, invent unsupported concepts, or produce visually interesting but unreviewable changes.

The product solves this by treating graph transformation as an explicit, inspectable, branchable process.

## 3. Target Users

### Primary User

A technical researcher, instructor, or knowledge worker who maintains a large note graph and wants to explore alternate representations of the same material.

Example initial user:

- an AI instructor working with an Applied Agentic AI course vault
- has hundreds of markdown files and thousands of wikilinks
- wants to transform the graph into more useful teaching, reasoning, or research structures

### Secondary Users

- researchers building literature maps
- curriculum designers organizing complex teaching material
- teams maintaining enterprise knowledge graphs
- agent-memory system designers
- analysts comparing multiple interpretations of a domain

## 4. Product Goals

1. Let users transform an existing graph into new ontologies through LLM-proposed split and merge operations.
2. Make graph changes visually assessable quickly.
3. Keep force graph exploration separate from lineage and audit views.
4. Preserve semantic accountability through immutable transform operations.
5. Support exploratory transformation without treating every lost edge as a failure.
6. Allow useful branches to be saved, replayed, compared, and extended.
7. Keep source data and private vaults local by default.

## 5. Non-Goals

The first version will not:

- build a general-purpose Obsidian replacement
- require a graph database such as Neo4j
- optimize for one perfect ontology
- block exploratory transformations because edges or nodes are lost
- support full multi-user collaboration
- support every markdown feature in Obsidian
- automate final ontology selection
- treat visual layout as canonical state

## 6. First Verification Target

The first verification asks:

Can an LLM, directed by a user, transform an Obsidian-like concept graph into a new ontology through split and merge operations, while preserving enough lineage and visual auditability for the user to assess whether the new ontology is insightful?

The first dataset should use the concept layer of the Applied Agentic AI vault:

- 56 concept nodes
- drawn from a larger vault of 439 markdown files
- source vault excluded from git and GitHub

This scope is intentionally small. It tests semantic transformation before full vault complexity dominates the design.

## 7. Core User Workflow

1. User imports an Obsidian-like vault or graph export.
2. System extracts nodes and wikilink edges into canonical tables.
3. User creates a branch.
4. User chooses a branch mode. Default is exploratory.
5. User states a branch purpose.
6. User selects transform scope.
7. User gives natural-language direction.
8. LLM proposes split and merge operations.
9. System validates structural invariants.
10. System renders proposed changes in separate synchronized views.
11. User reviews operations.
12. User accepts, rejects, edits, or regenerates proposals.
13. Accepted operations become immutable canonical events.
14. System materializes the branch from source graph plus accepted operations.
15. User compares the branch with source, parent, or sibling branches.

## 8. Branch Modes

Branch mode determines how transformations are judged.

### 8.1 Exploratory

Default mode.

Purpose: uncover surprising alternate structure.

Loss policy: losses are allowed and recorded as receipts, not blockers.

LLM behavior: bold split and merge proposals are encouraged.

Primary metric: insight gain.

### 8.2 Pedagogical

Suggested when obvious.

Purpose: improve teachability, lesson sequence, and conceptual compression.

Loss policy: losses are allowed if clarity improves.

LLM behavior: merge concepts that form useful teaching units.

The model must explain why a branch or operation is pedagogical when it uses this mode.

### 8.3 Conservative

Purpose: improve labels and groupings while preserving most source structure.

Loss policy: high-evidence losses require review.

LLM behavior: prefer retyping and light grouping.

### 8.4 Forensic

Purpose: preserve evidence and provenance.

Loss policy: evidence-bearing losses block acceptance.

LLM behavior: avoid radical ontology surgery.

## 9. Core Concepts

### 9.1 Source Graph

The imported original graph. For the MVP, this comes from markdown files and wikilinks.

### 9.2 Branch

A versioned alternate representation derived from the source graph or another branch.

Each branch has:

- branch id
- parent branch id
- mode
- purpose
- loss policy
- accepted transform operations

### 9.3 Transform Operation

A semantic change proposed by the LLM or user and accepted into a branch.

Primary operations:

- merge
- split
- retype
- add edge
- remove edge
- mark hypothesis

The MVP should focus on split and merge.

### 9.4 Lineage

The relationship between old nodes, transform operations, and new nodes.

Shape:

old nodes -> transform operation -> new nodes

Lineage is required for every accepted transformed node unless the node is explicitly marked as a hypothesis.

### 9.5 Loss Receipt

A record of a dropped or orphaned node or edge.

Loss receipts do not necessarily block acceptance. In exploratory mode, they are awareness artifacts.

## 10. Split and Merge Types

The system must require every split or merge to declare its theory.

Supported merge theories:

1. Synonym merge
2. Alias or tool merge
3. Role merge
4. Evidence-neighbourhood merge
5. Causal merge
6. Abstraction merge
7. Temporal merge
8. Pedagogical merge
9. Controversy merge
10. Anti-merge candidate

Supported split theories:

1. Split by causal mechanism
2. Split by pedagogical unit
3. Split by workflow role
4. Split by evidence source
5. Split by abstraction level
6. Split by temporal phase
7. Split by controversy or competing frame

## 11. Visual Requirements

The product must use separate synchronized views rather than one combined graph.

### 11.1 Force Graph View

Purpose: spatial intuition.

Answers:

- What clusters changed?
- What bridges appeared?
- What neighbourhoods shifted?

Recommended dependency: Cytoscape.js.

Alternative for large graphs: Sigma.js with Graphology.

### 11.2 Lineage Graph View

Purpose: semantic accountability.

Answers:

- What old nodes became what new nodes?
- Which operation caused the change?
- Which nodes were merged, split, invented, or orphaned?

Recommended dependency: React Flow with Dagre.

Escalation option: ELK/elkjs if compound lineage layouts outgrow Dagre.

### 11.3 Inspector Panel

The inspector must show details for selected nodes and operations:

- operation id
- operation type
- split or merge theory
- source nodes
- output nodes
- branch mode
- branch purpose
- LLM rationale
- evidence references
- lost nodes and edges
- hypothesis markers
- human review status

### 11.4 Visual Synchronization

The views must coordinate selection:

- Selecting a merged node in the force graph highlights its source nodes in lineage.
- Selecting a split operation in lineage highlights output nodes in the force graph.
- Selecting a loss badge opens the loss receipt.

## 12. Data and Architecture Requirements

### 12.1 Canonical State Rule

Visual state is never canonical.

Canonical graph state is derived from:

SourceGraph + AcceptedTransformOps + BranchPointer

The UI may propose, render, and annotate changes, but it must not directly define semantic graph state.

### 12.2 Storage

Recommended stack:

- DuckDB for local tables and fast diff queries
- Parquet for versioned snapshots
- JSON or JSONL for transform operation logs

### 12.3 Canonical Tables

Minimum tables:

- nodes
- edges
- branches
- transform_ops
- transform_inputs
- transform_outputs
- loss_receipts
- evidence_refs
- layout_metadata

### 12.4 Local-First Policy

The system should work locally by default.

Private source vaults, including `applied_agentic_ai_vault/`, must not be committed to git or pushed to GitHub.

## 13. Invariants

The following invariants must hold:

1. Canonical graph state is derived from source graph plus immutable accepted transform operations.
2. Every accepted new node has lineage or is marked as a hypothesis.
3. Every split or merge declares its operation theory.
4. Every branch declares a mode.
5. Every branch declares a purpose before transform acceptance.
6. SourceGraph + AcceptedOps + BranchPointer can deterministically regenerate a branch.
7. UI layout changes do not change semantic state.
8. LLM-invented nodes and edges are marked as hypotheses.
9. LLM proposals are drafts until accepted.
10. Dropped nodes and edges are recorded as loss receipts.
11. Old accepted operations are not silently overwritten. Corrections create new operations.
12. Every transform declares its input scope.

## 14. Functional Requirements

### FR1: Import Obsidian-Like Graph

The system must import markdown files and wikilinks into canonical node and edge tables.

MVP scope: concept files only.

### FR2: Create Branch

The system must allow a user to create a branch with mode, purpose, parent, and loss policy.

Default mode: exploratory.

### FR3: Select Transform Scope

The system must allow transform scope selection:

- selected nodes
- concept layer
- folder or subgraph
- full graph
- existing branch

### FR4: Capture User Direction

The system must accept natural-language transformation direction.

Example:

“Merge concepts into more teachable units for an introductory agentic AI workshop.”

### FR5: Generate Draft Operations

The LLM must propose structured split and merge operations.

Draft operations must include:

- operation type
- input nodes
- output nodes
- split or merge theory
- rationale
- evidence references where available
- hypothesis markers where needed

### FR6: Validate Draft Operations

The system must validate structural invariants before rendering or acceptance.

In exploratory mode, losses are not blockers. Missing lineage, missing branch purpose, or missing operation type are blockers.

### FR7: Render Visual Diff

The system must render:

- force graph view
- lineage graph view
- inspector panel
- loss receipt indicators

### FR8: Review Operations

The user must be able to accept, reject, edit, or regenerate draft operations.

### FR9: Accept Operations

Accepted operations become immutable canonical events.

### FR10: Materialize Branch

The system must regenerate the branch graph from source graph plus accepted operations.

### FR11: Compare Branches

The system must compare a branch to source, parent, or sibling branch.

MVP comparison may be limited to counts and visual highlighting.

## 15. Non-Functional Requirements

### 15.1 Performance

The MVP must handle the 56-node concept graph interactively.

The design should scale toward hundreds of nodes and thousands of edges without changing the canonical model.

### 15.2 Explainability

A user must be able to inspect why a node exists in a branch.

### 15.3 Replayability

Branches must be regenerable from accepted operations.

### 15.4 Auditability

Losses, hypotheses, and operation rationales must be visible.

### 15.5 Extensibility

The system should allow new split and merge theories to be added without changing the basic architecture.

### 15.6 Open Source Preference

The recommended dependencies are open source and mostly permissive:

- Cytoscape.js: MIT
- React Flow / xyflow: MIT
- DuckDB: MIT
- Parquet: Apache 2.0
- Dagre: MIT
- Sigma.js: MIT
- Graphology: MIT
- NetworkX: BSD-3-Clause
- ELK/elkjs: EPL-2.0

## 16. MVP Definition

The MVP is complete when a user can:

1. Import the concept layer from an Obsidian-style vault.
2. Create an exploratory branch with an explicit purpose.
3. Ask the LLM to propose split and merge operations.
4. See those operations in a lineage graph.
5. See the resulting graph in a force graph.
6. Inspect one operation at a time.
7. Accept selected operations.
8. Regenerate the branch deterministically.
9. See loss receipts without blocking exploratory work.

## 17. Success Metrics

### Product Success

- User can understand a proposed transformation within a few minutes.
- User can identify the most important split and merge operations visually.
- User can tell which nodes are inherited, merged, split, invented, or orphaned.
- User can accept a branch and regenerate it later.
- User finds at least one useful abstraction, bridge, teaching unit, or causal decomposition that was not obvious in the original graph.

### Technical Success

- No accepted node exists without lineage or hypothesis marking.
- No branch exists without mode and purpose.
- No accepted split or merge lacks an operation theory.
- No accepted operation mutates prior accepted operations.
- Branch materialization is deterministic.
- The source vault remains excluded from git and GitHub.

## 18. Risks

### Risk 1: Force Graph Hairball

Force graphs can look impressive while hiding semantic failure.

Mitigation: keep lineage graph separate and make it the primary validation view.

### Risk 2: LLM Semantic Drift

The LLM may propose plausible abstractions that lose important evidence.

Mitigation: record losses as receipts and mark hypotheses explicitly.

### Risk 3: Over-Preserving the Old Graph

If every lost edge becomes a blocker, exploratory branches become timid and uninteresting.

Mitigation: branch mode controls loss policy. Exploratory mode treats losses as awareness, not failure.

### Risk 4: Visual Edits Corrupt Canonical State

If dragging, grouping, or manual layout changes alter semantic state, branches become unreplayable.

Mitigation: visual state is non-canonical. Semantic changes require accepted transform operations.

### Risk 5: Scope Too Large Too Early

Starting with the full 439-file vault may bury the transformation problem in noise.

Mitigation: start with the 56 concept nodes.

## 19. Open Questions

1. How should `insight_gain` be scored?
2. Should users compare multiple LLM-proposed branches side by side?
3. Should anti-merge candidates be generated automatically?
4. How should evidence-neighbourhood merges balance embeddings, graph structure, and LLM rationale?
5. What is the smallest inspector UI that makes lineage review faster than reading JSON?
6. How should branch comparison work when two ontologies share little node identity?
7. Should pedagogical mode be a full branch mode, a scoring overlay, or both?

## 20. Recommended Build Sequence

1. Create importer for markdown files and wikilinks.
2. Build DuckDB schema for nodes, edges, branches, transform operations, and loss receipts.
3. Implement branch creation with mode and purpose.
4. Implement structured transform operation schema.
5. Add LLM prompt for split and merge proposals over selected concept nodes.
6. Validate structural invariants.
7. Render lineage graph with React Flow and Dagre.
8. Render force graph with Cytoscape.js.
9. Add inspector panel.
10. Add accept/reject workflow.
11. Add deterministic branch materialization.
12. Add basic branch comparison.

## 21. One-Sentence Product Principle

The product should make radical graph transformation safe to explore by separating creative ontology generation from canonical state, lineage, and branch replay.
