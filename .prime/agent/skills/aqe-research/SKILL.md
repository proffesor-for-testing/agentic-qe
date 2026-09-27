---
name: aqe-research
description: Conduct evidence-first technical research for Agentic QE, Ruflo, related ruvnet projects, or external tools. Use when Codex must investigate a repository, compare current upstream changes, trace dependencies and history, distinguish verified facts from inference, or synthesize findings into actionable engineering recommendations. Do not use for a simple known-answer lookup or an implementation-only task.
---

# Research AQE Systems

1. Read `AGENTS.md`, the question, and any user-supplied artifacts completely.
2. Define the decision the research must support, its scope, and freshness needs.
3. Search local evidence broad-to-narrow with `rg --files`, `rg`, code navigation,
   tests, configuration, documentation, and git history.
4. For current external claims, inspect primary sources: upstream repositories,
   releases, commits, issues, pull requests, and official documentation. Record
   dates, versions, commit identifiers, and links.
5. Trace definitions to usages and public boundaries. Map dependencies, data
   flow, CLI/MCP parity, configuration generation, and tests when relevant.
6. Classify each material statement using
   [references/evidence-rules.md](references/evidence-rules.md). Never repeat a
   benchmark, capability, or roadmap claim as fact without direct evidence.
7. Synthesize only after gathering evidence. State contradictions, uncertainty,
   missing access, and stale documentation explicitly.
8. Return:
   - the decision-oriented summary;
   - verified findings with source locations;
   - inferences and their supporting evidence;
   - gaps and risks;
   - prioritized recommendations and the smallest useful next validation.

Use parallel agents only when the user requests delegation or repository
instructions explicitly permit it. Treat Claude agent definitions as domain
references; do not copy or execute their Claude-only hooks or tool syntax.
