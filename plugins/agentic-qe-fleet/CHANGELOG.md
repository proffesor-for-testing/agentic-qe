# Changelog: agentic-qe-fleet

Newest first. One `## <version> — <date>` heading per version, then `feat:`, `fix:`, `breaking:` and `chore:` bullets. Since 3.14.8 the plugin version tracks the `agentic-qe` npm package version (see [ADR-0001](docs/adrs/0001-agentic-qe-fleet-contract.md)). Built from git history.

## 3.14.8 — 2026-10-09
- fix: ship `.mcp.json` inside the plugin so a marketplace install registers the `agentic-qe` MCP server (previously only the repo-root manifest declared it, and a marketplace install copies only `plugins/agentic-qe-fleet/`)
- fix: pin the MCP server to `agentic-qe@<plugin version>` instead of `@latest`
- fix: skills list the plugin-scoped MCP tool names (`mcp__plugin_agentic-qe-fleet_agentic-qe__*`) that an installed plugin actually exposes, alongside the `mcp__agentic-qe__*` names used by `aqe init` projects
- feat: `userConfig` option `guardMode` (off / notify / enforce) for the aqe-mod learning-data guard
- feat: `userConfig` options `llm_provider`, `max_budget_usd`, `memory_backend`, wired into the MCP server env (`AQE_LLM_PROVIDER`, `AQE_MAX_BUDGET_USD`, `AQE_MEMORY_BACKEND`)
- feat: contract ADR-0001, CHANGELOG, README Install / Requires / Compatibility / Namespace coordination / Verification sections
- fix: `scripts/smoke.sh` check 8 validates this plugin's own `.mcp.json` and its version pin, not the repo-root manifest
- breaking: plugin version jumps `0.1.0 → 3.14.8` to track the npm package; `npm version` now bumps it via `scripts/sync-plugin-versions.cjs`

## 0.1.0 — 2026-04-30
The version stayed at 0.1.0 while these landed (2026-04-30 → 2026-10-04):
- chore: refresh AI model defaults and eval model IDs to the current generation
- feat: gate plugin skills as a strict body-mirror of `.claude/skills` (conservation guard)
- feat: machine-checkable smoke contract for the bundle (`scripts/smoke.sh`, #510 item 10)
- chore: migrate PACT → PACTS framework wording
- feat: initial slim bundle — 11 QE agents, 9 trust-tier-2/3 skills, 9 `/aqe-*` commands (released with agentic-qe v3.9.18)
