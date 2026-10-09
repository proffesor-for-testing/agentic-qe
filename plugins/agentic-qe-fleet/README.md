# agentic-qe-fleet

PACTS-based agentic quality engineering fleet for Claude Code. This is a slim starter bundle of the AQE platform. It has 11 specialized QE agents, 9 core skills, 9 slash commands, and the `agentic-qe` MCP server, pinned to the plugin version.

## Install

In one step (Claude Code 2.1.275 or later):

```
/plugin install agentic-qe-fleet --marketplace proffesor-for-testing/agentic-qe
```

Or add the marketplace first:

```
/plugin marketplace add proffesor-for-testing/agentic-qe
/plugin install agentic-qe-fleet@agentic-qe
```

The install registers the MCP server `plugin:agentic-qe-fleet:agentic-qe`, which runs `npx -y agentic-qe@<plugin version> mcp`. You don't need to run `claude mcp add`. Check it with `claude mcp list`.

### Options (`userConfig`)

Set these with `/plugin configure agentic-qe-fleet@agentic-qe`, or pass `--config KEY=VALUE` to `claude plugin install`. Every option has a default, so the server starts even if you leave them unset.

| Option | Sets | Default | Effect |
|---|---|---|---|
| `llm_provider` | `AQE_LLM_PROVIDER` | empty (auto) | Pins the LLM provider, e.g. `claude-code`, `claude`, `openrouter` or `ollama`. If it's empty, the provider comes from `llm-config.json` or env auto-detection. |
| `max_budget_usd` | `AQE_MAX_BUDGET_USD` | `0` (no cap) | Per-run spend cap for metered providers. |
| `memory_backend` | `AQE_MEMORY_BACKEND` | `hybrid` | `hybrid` saves learning to `.agentic-qe/memory.db`. `memory` is database-free mode: same features, but nothing is written under `.agentic-qe/`. |

## What's Included

### Agents (11)

Agents are routed by cognitive load: heavy reasoning runs on Opus, focused execution on Sonnet.

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

Each skill has a trust tier and a scoped `allowed-tools` list with no wildcards.
- **Tier 3:** full eval infrastructure (eval YAML, JSON schema and validator).
- **Tier 2:** tested, but without an eval.

The bundle leaves out tier-1 (untested) skills, per AQE trust-tier policy.

| Skill | Trust tier | MCP tools |
|---|---|---|
| `qe-test-generation` | 3 | `test_generate_enhanced` |
| `qe-coverage-analysis` | 3 | `coverage_analyze_sublinear`, `qe_coverage_gaps` |
| `qe-test-execution` | 3 | `test_execute_parallel` |
| `qe-chaos-resilience` | 3 | `chaos_test` |
| `qe-quality-assessment` | 3 | `quality_assess` |
| `chaos-engineering-resilience` | 3 | — (methodology guide) |
| `mutation-testing` | 3 | — (Stryker integration) |
| `risk-based-testing` | 3 | — (read-only analysis) |
| `tdd-london-chicago` | 2 | — (TDD school comparison) |

**MCP tool names.** A server that comes from this plugin exposes its tools as `mcp__plugin_agentic-qe-fleet_agentic-qe__<tool>`. A project set up with `aqe init` registers the server under the name `agentic-qe`, which gives `mcp__agentic-qe__<tool>`. Each skill lists both forms in `allowed-tools`, so it works with either setup. See [ADR-0001](docs/adrs/0001-agentic-qe-fleet-contract.md).

### Commands (9)

`/aqe-analyze`, `/aqe-benchmark`, `/aqe-chaos`, `/aqe-costs`, `/aqe-execute`, `/aqe-fleet-status`, `/aqe-generate`, `/aqe-optimize`, `/aqe-report`

## Requires

- Node.js >= 22.13.0, with `npx` on `PATH`. The MCP server runs through `npx`.
- Network access the first time the server starts, so `npx` can fetch the pinned `agentic-qe` package. After that it uses the npm cache.
- No other plugin. The plugin ships its own MCP server.

## Compatibility

- **Versioning:** the plugin version always equals the `agentic-qe` npm package version, and `.mcp.json` pins the server to that exact version (`agentic-qe@<version>`, never `@latest`). The release flow bumps all of these together: `npm version` runs `scripts/sync-plugin-versions.cjs`.
- **Coexisting with `aqe init`:** a project that has both the plugin and `aqe init` runs two `agentic-qe` server processes, one under each name. Both work. To keep only one, disable the plugin in that project or remove `agentic-qe` from the project `.mcp.json`.
- **Verification:** `bash plugins/agentic-qe-fleet/scripts/smoke.sh` is the contract.

## Namespace coordination

The fleet uses the AQE memory namespaces below. They are database identifiers, not filesystem paths, and other plugins MUST NOT shadow them.

- `aqe/v3/domains/<domain>/*`: per-domain data, for example:
  - `aqe/v3/domains/test-generation/patterns/`
  - `aqe/v3/domains/coverage-analysis/metrics/`
  - `aqe/v3/domains/test-execution/flaky/`
  - `aqe/v3/domains/security-compliance/scans/`
- `aqe/v3/queen/*`: fleet coordination (`aqe/v3/queen/fleet/`, `aqe/v3/queen/tasks/`).

With `memory_backend=hybrid`, they persist to `.agentic-qe/memory.db` in the project. With `memory_backend=memory`, they last only for the server process.

## Test locally

```bash
claude --plugin-dir ./plugins/agentic-qe-fleet
```

Then run, for example, `/aqe-fleet-status`.

## Verification

```bash
claude plugin validate plugins/agentic-qe-fleet
bash plugins/agentic-qe-fleet/scripts/smoke.sh     # or: npm run plugin:smoke
# Expected: "PASS: agentic-qe-fleet contract holds"
node scripts/sync-plugin-versions.cjs --check      # plugin versions == package.json
```

## Architecture Decisions

- [`ADR-0001` — agentic-qe-fleet plugin contract (bundled pinned MCP server, version tracking, tool naming, userConfig, smoke as contract)](./docs/adrs/0001-agentic-qe-fleet-contract.md)

## As a mod

_Placeholder — the function-hook mod (`hooks/`) is being added in a follow-up phase. This section will describe its guard, status file, local slash command and options._
