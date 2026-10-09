---
id: ADR-0001
title: agentic-qe-fleet plugin contract — bundled pinned MCP server, version tracking, tool naming, userConfig, smoke as contract
status: Accepted
date: 2026-10-09
authors:
  - Agentic QE maintainers
tags: [plugin, mcp, versioning, namespace, smoke-test, user-config]
---

## Context

`agentic-qe-fleet` is the slim Claude Code plugin of the AQE platform: 11 QE agents, 9 trust-tier-2/3 skills, and 9 `/aqe-*` commands. It is listed in the repo marketplace (`.claude-plugin/marketplace.json`, source `./plugins/agentic-qe-fleet`).

A review of `main` (c8bc4eec) found these defects:

1. **No MCP server after a marketplace install.** Only the repo-root `.claude-plugin/plugin.json` declared `mcpServers`. A marketplace install copies only `plugins/agentic-qe-fleet/`, so the `agentic-qe` server was never registered. Six files still called `mcp__agentic-qe__*` tools, and the README said the server was auto-registered.
2. **Wrong tool names.** Claude Code namespaces a plugin's MCP server as `plugin:<plugin>:<server>`. Its tools are exposed as `mcp__plugin_<plugin>_<server>__<tool>`, here `mcp__plugin_agentic-qe-fleet_agentic-qe__<tool>`. The skills' `allowed-tools` listed only the `aqe init` form, `mcp__agentic-qe__<tool>`.
3. **Unpinned server.** The server ran as `agentic-qe@latest`, so one plugin version could run any server version.
4. **Version drift.** The plugin stayed at `0.1.0` while the package went to `3.14.8`, and the release flow bumped neither.
5. **Wrong smoke target.** `scripts/smoke.sh` check 8 checked the repo-root manifest, so it could not catch defect 1.
6. **Invalid root manifest.** `claude plugin validate .` failed on the root `plugin.json` because `repository` was an object instead of a string.

## Decision

1. **The plugin bundles its own MCP server.** `plugins/agentic-qe-fleet/.mcp.json` registers server `agentic-qe` as `npx -y agentic-qe@<version> mcp`. Here `<version>` is the plugin version, which equals the `package.json` version.
2. **The plugin version tracks the npm package.** `plugin.json.version == package.json.version`. `scripts/sync-plugin-versions.cjs` is the npm `version` lifecycle script, so `npm version X.Y.Z` also rewrites:
   - the fleet `plugin.json` version
   - the `.mcp.json` pin
   - the repo-root `.claude-plugin/plugin.json` version and its pin

   Run it with `--check` to detect drift without writing anything. The smoke test runs it.
3. **Skills list both tool-name forms in `allowed-tools`:**
   - `mcp__plugin_agentic-qe-fleet_agentic-qe__<tool>` — the name when the server comes from this plugin.
   - `mcp__agentic-qe__<tool>` — the name in projects set up with `aqe init`, which writes a project `.mcp.json` server named `agentic-qe`.

   `allowed-tools` only pre-approves tools, so a name with no matching server does nothing. Listing both keeps one skill body working in both setups. That matters because `scripts/check-skill-parity.ts` requires the skill body to match `.claude/skills`. Only frontmatter may differ.
4. **`userConfig` exposes only options the server honours.** Each option is substituted into the server `env` as `${user_config.KEY}`. Each has a default, so an unconfigured install still boots.

   | Option | Env var | Default | Read by |
   |---|---|---|---|
   | `llm_provider` | `AQE_LLM_PROVIDER` | `""` (auto) | `src/shared/llm/router/config-store.ts` |
   | `max_budget_usd` | `AQE_MAX_BUDGET_USD` | `0` (no cap) | `src/shared/llm/provider-manager.ts` |
   | `memory_backend` | `AQE_MEMORY_BACKEND` | `hybrid` | `src/mcp/entry.ts`, `src/mcp/tools/base.ts` |

   There is no "enabled domains" option because the server reads no env var for it.
5. **The smoke script is the contract.** `scripts/smoke.sh` checks:
   - structure and counts
   - the plugin's own `.mcp.json` and its version pin
   - that every `${user_config.*}` reference is declared with a default
   - no wildcard `allowed-tools`, and plugin-scoped tool names present
   - a `model` on every agent
   - CHANGELOG, this ADR, and the README install line
   - version sync
   - the mod's own `smoke-mod.sh`, when that file exists
6. **Namespace coordination.** The plugin's agents write to the AQE memory namespaces `aqe/v3/domains/<domain>/*` and `aqe/v3/queen/*`. Those names are database identifiers, not filesystem paths, and other plugins MUST NOT shadow them.

## Consequences

**Positive:**
- A marketplace install now registers a working MCP server. This was verified locally: `claude mcp list` showed `plugin:agentic-qe-fleet:agentic-qe … ✔ Connected`.
- Plugin and server versions can no longer drift.
- A release bumps every plugin surface.

**Negative:**
- The plugin version jumped from `0.1.0` to `3.14.8`.
- A project that has both `aqe init` and the plugin runs two `agentic-qe` server processes, one under each name. The README documents this; disable one if it matters.
- `npx` downloads the pinned package on first use, which needs network access and Node ≥ 22.13.0.

## Verification

```bash
claude plugin validate plugins/agentic-qe-fleet
bash plugins/agentic-qe-fleet/scripts/smoke.sh      # Expected: "PASS: agentic-qe-fleet contract holds"
node scripts/sync-plugin-versions.cjs --check
```

## Related

- `.claude-plugin/marketplace.json` — marketplace entry
- `scripts/sync-plugin-versions.cjs` — version and pin sync
- `scripts/check-skill-parity.ts` — skill body mirror gate
- `src/init/phases/08-mcp.ts` — the `aqe init` MCP registration (the `mcp__agentic-qe__*` naming)
