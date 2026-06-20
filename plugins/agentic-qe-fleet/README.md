# agentic-qe-fleet

PACTS-based agentic quality engineering fleet for Claude Code — a slim starter bundle of the AQE platform with 11 specialized QE agents, 9 core skills, 9 slash commands, and the `agentic-qe` MCP server.

## What's bundled

### Agents (11)

Routed by cognitive load — heavy reasoning agents on Opus, focused execution on Sonnet.

| Agent | Model | Purpose |
|---|---|---|
| `qe-test-architect` | opus | AI-powered test generation with sublinear optimization |
| `qe-fleet-commander` | opus | Fleet lifecycle and workload distribution |
| `qe-security-scanner` | opus | SAST/DAST/dependency/secrets scanning |
| `qe-chaos-engineer` | opus | Controlled fault injection and resilience testing |
| `qe-regression-analyzer` | opus | Intelligent test selection and change-impact scoring |
| `qe-requirements-validator` | opus | Testability analysis and BDD scenario generation |
| `qe-coverage-specialist` | sonnet | O(log n) sublinear coverage analysis with risk-weighted gap detection |
| `qe-flaky-hunter` | sonnet | Flaky test detection and auto-stabilization |
| `qe-performance-tester` | sonnet | Load, stress, endurance, regression detection |
| `qe-quality-gate` | sonnet | Quality gate enforcement with policy validation |
| `qe-tdd-specialist` | sonnet | Red-Green-Refactor (London + Chicago schools) |

### Skills (9)

Each skill ships with a scoped `allowed-tools` list and a trust tier. Tier 3 = full eval infrastructure (eval YAML + JSON schema + validator); tier 2 = tested without eval. The bundle excludes tier-1 (untested) skills per AQE trust-tier policy.

| Skill | Trust tier | Notes |
|---|---|---|
| `qe-test-generation` | 3 | Includes `mcp__agentic-qe__test_generate_enhanced` |
| `qe-coverage-analysis` | 3 | Includes `coverage_analyze_sublinear`, `qe_coverage_gaps` |
| `qe-test-execution` | 3 | Includes `test_execute_parallel` |
| `qe-chaos-resilience` | 3 | Includes `chaos_test` |
| `qe-quality-assessment` | 3 | Includes `quality_assess` |
| `chaos-engineering-resilience` | 3 | Methodology guide |
| `mutation-testing` | 3 | Stryker integration |
| `risk-based-testing` | 3 | Read-only analysis |
| `tdd-london-chicago` | 2 | TDD school comparison |

### Commands (9)

`/aqe-analyze`, `/aqe-benchmark`, `/aqe-chaos`, `/aqe-costs`, `/aqe-execute`, `/aqe-fleet-status`, `/aqe-generate`, `/aqe-optimize`, `/aqe-report`

### MCP server

The plugin auto-registers the `agentic-qe` MCP server (via `npx -y agentic-qe@latest mcp`) when loaded — no separate `claude mcp add` needed.

## Test locally

```bash
claude --plugin-dir ./plugins/agentic-qe-fleet
```

Then invoke an agent or skill, for example:

```
/aqe-fleet-status
```

## Install from a marketplace

Once published, users install with:

```bash
/plugin marketplace add <org>/<repo>
/plugin install agentic-qe-fleet
```
