# Branching Multi-View Knowledge Graph Workbench

A specification and prototype workspace for exploring knowledge graphs as dynamic reasoning substrates rather than fixed domain representations.

The core idea is to let a user guide an LLM in transforming an Obsidian-like graph into alternate ontologies through split and merge operations. The system emphasizes visual assessment through separate synchronized views:

- a force graph for spatial intuition
- a lineage graph for split/merge accountability
- inspector panels and loss receipts for transformation review

The architectural rule is that visual state is never canonical. Canonical graph state is derived from the source graph plus immutable accepted transform operations.

## Documents

- `branching_multi_view_knowledge_graph_workbench.md`: initial project description
- `branching_multi_view_knowledge_graph_workbench_spec.md`: current specification

## Data policy

The local `applied_agentic_ai_vault/` reference directory is intentionally excluded from git and GitHub via `.gitignore`.
