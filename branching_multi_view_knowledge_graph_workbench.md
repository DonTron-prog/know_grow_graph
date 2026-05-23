# Project Description: Branching Multi-View Knowledge Graph Workbench

This project explores how to use knowledge graphs as dynamic reasoning substrates rather than fixed representations of a domain.

Traditional knowledge graphs encode a single ontology: the entities, relationships, abstractions, and assumptions chosen by the graph creator. That structure is be useful for a specific analysis, but it often becomes limiting as new data, new questions, or new interpretations emerge. The same domain should also be viewed from different entrypoints. e.g. a causal system, different organizational maps, a research landscape, a memory structure, a set of competing hypotheses extra.

This proposed system allows users to generate, inspect, compare, and branch alternate representations of a knowledge graph. An LLM assists by proposing new ontologies, abstractions, entity groupings, relation reinterpretations, and missing-link hypotheses. The user can steer these transformations through natural language, rank useful views, edit the ontology or graph directly, and persist promising branches as versioned graph lineages.

The initial focus is representational exploration. The goal is not simply to build a better graph, but to test whether alternate graph views produce better explanation, compression, gap detection, and human insight.

Core capabilities include:

- A canonical source graph with evidence-linked nodes and edges (the initial state)
- Temporary analytical views generated from that graph
- Branching graph lineages for useful representations
- Adjustable transformation depth, from visual relabelling to entity restructuring
- LLM-assisted ontology generation and abstraction
- Deductive checks against graph evidence and view-specific assumptions
- Inductive reasoning for gap analysis, interpolation, and hypothesis generation
- Visual comparison of multiple graph views and branches

The first prototype would target agentic memory and research workflows, where evolving knowledge, uncertain structure, and multiple valid abstractions are normal. Success would be measured by whether users can extract insights that are difficult to see in a single fixed ontology.
