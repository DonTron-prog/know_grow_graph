# RALPH.md

Durable instructions for the Ralph Wiggum loop. This file is read at the start of every fresh iteration.

## Project goal

[describe the project goal / JTBD here]

## Files and durable state

- specs/: requirements, one markdown file per JTBD topic of concern.
- src/: application source code.
- src/lib/: shared utilities and reusable patterns.
- IMPLEMENTATION_PLAN.md: prioritized work plan and run discoveries.
- AGENTS.md: concise operational build/test/run notes only.
- .ralph-runner/: runner status, control flags, logs, and events.

## PLAN phase

0a. Study specs/* with parallel subagents to learn the application specifications.
0b. Study IMPLEMENTATION_PLAN.md, if present, to understand the plan so far.
0c. Study src/lib/* to understand shared utilities and components.
0d. For reference, application source code is in src/*.

1. Study IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and study existing source code in src/* to compare it against specs/*. Create or update IMPLEMENTATION_PLAN.md as a prioritized bullet list sorted by items yet to be implemented. Ultrathink. Search for TODOs, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns.

IMPORTANT: Plan only. Do not implement anything. Do not assume functionality is missing; confirm with code search first. Treat src/lib as the project's standard library for shared utilities and components. Prefer consolidated, idiomatic implementations there over ad-hoc copies.

ULTIMATE GOAL: [describe the project goal / JTBD here]. If an element is missing, search first to confirm it does not exist, then author the specification at specs/FILENAME.md if needed and document the implementation plan in IMPLEMENTATION_PLAN.md.

## BUILD phase

0a. Study specs/* to learn the application specifications.
0b. Study IMPLEMENTATION_PLAN.md.
0c. For reference, application source code is in src/*.

1. Implement functionality per the specifications. Follow IMPLEMENTATION_PLAN.md and choose the most important item to address. Before making changes, search the codebase; do not assume it is not implemented. Use subagents for searches/reads where useful and only one validation lane for build/tests.
2. After implementing functionality or resolving problems, run the tests for the unit of code that was improved, plus any required validation from AGENTS.md. If functionality is missing, add it per the specs. Ultrathink.
3. When you discover issues, immediately update IMPLEMENTATION_PLAN.md with findings. When resolved, update/remove the item.
4. When tests pass, update IMPLEMENTATION_PLAN.md, then git add -A, git commit with a descriptive message, and git push when a remote exists.

99999. Important: When authoring documentation, capture the why — tests and implementation importance.
999999. Important: Single sources of truth, no migrations/adapters. If tests unrelated to your work fail, resolve them as part of the increment or document why they are unrelated.
9999999. You may add extra logging if required to debug issues.
99999999. Keep IMPLEMENTATION_PLAN.md current with learnings; future work depends on this to avoid duplication.
999999999. When you learn something new about how to run the application, update AGENTS.md but keep it brief.
9999999999. For bugs you notice, resolve them or document them in IMPLEMENTATION_PLAN.md even if unrelated to the current work.
99999999999. Implement functionality completely. Placeholders and stubs waste future iterations.
999999999999. Periodically clean completed clutter out of IMPLEMENTATION_PLAN.md.
9999999999999. Keep AGENTS.md operational only — status/progress notes belong in IMPLEMENTATION_PLAN.md.

## Preset

default
