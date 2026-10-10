# Changelog: agentic-qe-fleet

Newest first. One `## <version> — <date>` heading per version, then `feat:`, `fix:`, `breaking:` and `chore:` bullets. Since 3.15.0 the plugin version tracks the `agentic-qe` npm package version (see [ADR-0001](docs/adrs/0001-agentic-qe-fleet-contract.md)). Built from git history.

## Unreleased
- fix: aqe-mod guard now refuses the bypasses that the post-merge adversarial review of 3.15.0 confirmed: shell keywords before the verb (`then rm`, `do rm`, `! rm`), brace expansion (`memory.db{,-wal,-shm}`), interpreter one-liners with several arguments and the destructive APIs they missed (`fs.rm`, `rename`, `copyFile`, `open(..., 'w')`, `os.replace`, pathlib, Perl/Ruby/PHP/Deno/Bun), `cd .agentic-qe && rm ./memory.db`, combined shell flags (`bash -lc`, `sh -ec`, `zsh -c`), git global options (`git -C . clean -fdx`, `git -C .agentic-qe rm`), `git clean -e` excludes that do not keep the data, sqlite3 `.backup`/`.save`/`.output`/`.once` onto a store, `ALTER TABLE ... DROP`, `$(pwd)/.agentic-qe/...`, and `find . -name '*.db' -delete` from the project root
- feat: aqe-mod guard also reads Monitor and PowerShell tool commands (`Remove-Item`, `Move-Item`, `Set-Content`, `Out-File`, .NET file APIs, `cmd /c del`)
- fix: aqe-mod guard no longer refuses read-only lines that mention SQL or code words elsewhere (`ls .agentic-qe && grep -rn "DROP TABLE" src/`). SQL is checked only in `sqlite3` commands (`-readonly` exempt, string literals ignored), and code only in interpreter commands
- fix: aqe-mod guard allows backup-named copies next to the store (`.agentic-qe/memory-backup-20261009.db`) and, when the session's project root is known, a temp-directory fixture outside the project (`rm -rf /tmp/fixture/.agentic-qe`)
- chore: aqe-mod guard split into focused modules (`shell.ts`, `context.ts`, `verbs.ts`, `scripts.ts`, `powershell.ts`); the `.catch` fail-closed decision is the pure `fallbackVerdict`, now tested with notify mode; the attack/benign corpus grows from 95 to 226 cases (157 attacks, 69 benign)
- docs: README "As a mod" records the guard's decisions (restore flow refused in enforce, `UPDATE` allowed, temp fixtures, `git clean -e`) and its limits

## 3.15.0 — 2026-10-09
- feat: aqe-mod function-hook mod (Claude Code ≥ 2.1.287): console status file `.claude-flow/aqe-mod/status.json`, `/aqe-mod` command (status, check, fleet, gate), and a tighten-only guard (on by default) refusing destructive operations on `.agentic-qe/*.db` / `*.rvf` learning data
- fix: ship `.mcp.json` inside the plugin so a marketplace install registers the `agentic-qe` MCP server (previously only the repo-root manifest declared it, and a marketplace install copies only `plugins/agentic-qe-fleet/`)
- fix: pin the MCP server to `agentic-qe@<plugin version>` instead of `@latest`
- fix: skills list the plugin-scoped MCP tool names (`mcp__plugin_agentic-qe-fleet_agentic-qe__*`) that an installed plugin actually exposes, alongside the `mcp__agentic-qe__*` names used by `aqe init` projects
- feat: `userConfig` option `guardMode` (off / notify / enforce) for the aqe-mod learning-data guard
- feat: `userConfig` options `llm_provider`, `max_budget_usd`, `memory_backend`, wired into the MCP server env (`AQE_LLM_PROVIDER`, `AQE_MAX_BUDGET_USD`, `AQE_MEMORY_BACKEND`)
- feat: contract ADR-0001, CHANGELOG, README Install / Requires / Compatibility / Namespace coordination / Verification sections
- fix: `scripts/smoke.sh` check 8 validates this plugin's own `.mcp.json` and its version pin, not the repo-root manifest
- breaking: plugin version jumps `0.1.0 → 3.15.0` (first released version that tracks the package) to track the npm package; `npm version` now bumps it via `scripts/sync-plugin-versions.cjs`

## 0.1.0 — 2026-04-30
The version stayed at 0.1.0 while these landed (2026-04-30 → 2026-10-04):
- chore: refresh AI model defaults and eval model IDs to the current generation
- feat: gate plugin skills as a strict body-mirror of `.claude/skills` (conservation guard)
- feat: machine-checkable smoke contract for the bundle (`scripts/smoke.sh`, #510 item 10)
- chore: migrate PACT → PACTS framework wording
- feat: initial slim bundle — 11 QE agents, 9 trust-tier-2/3 skills, 9 `/aqe-*` commands (released with agentic-qe v3.9.18)
