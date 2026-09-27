---
name: aqe-fleet
description: Spawn Agentic QE specialist subagents (test architect, coverage, flakiness, security, defect prediction, root cause, impact, quality gate). Use when a quality-engineering audit or generation task matches one of the seeded QE roles.
---

# AQE Fleet Subagents

Curated QE agent roles from Agentic QE v3, seeded for Prime Agent. Prime
Agent has no file-based agents; spawn a role as a subagent with its role
file as the task prompt:

    handle = await rlm.spawn(readText('agents/<role>.md') + '\n\nTask: <your task here>', name='<role>')

## Seeded roles

- `qe-test-architect` — see `agents/qe-test-architect.md` for the full role prompt
- `qe-coverage-specialist` — see `agents/qe-coverage-specialist.md` for the full role prompt
- `qe-flaky-hunter` — see `agents/qe-flaky-hunter.md` for the full role prompt
- `qe-quality-gate` — see `agents/qe-quality-gate.md` for the full role prompt
- `qe-security-scanner` — see `agents/qe-security-scanner.md` for the full role prompt
- `qe-defect-predictor` — see `agents/qe-defect-predictor.md` for the full role prompt
- `qe-root-cause-analyzer` — see `agents/qe-root-cause-analyzer.md` for the full role prompt
- `qe-impact-analyzer` — see `agents/qe-impact-analyzer.md` for the full role prompt

## Notes

- Role files are self-contained Claude Code agent definitions (frontmatter +
  prompt body); they work as subagent task prompts directly.
- Prefer the AQE MCP tools (fleet_init, coverage_analyze_sublinear,
  quality_assess) when the AQE MCP server is connected.
