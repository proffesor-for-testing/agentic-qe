## Summary

v3.9.3 addresses the remaining root causes of the `aqe init --auto` hang and error cascade that the v3.9.2 hotfix did not cover. Five targeted fixes across init, workers, CLI bootstrap, HNSW lifecycle, and MCP entry-point resolution. All v3.9.1 feature flags (`useRVFPatternStore`, `useUnifiedHnsw`, `useAgentMemoryBranching`) remain `true` — this release preserves the v3.9.1 feature benefits and only fixes the rollout bugs.

## What was broken for users

Running `aqe init --auto` on real projects in v3.9.1 / v3.9.2 produced one of three symptoms depending on the codebase:

1. **Hang in phase 06 `code-intelligence pre-scan`** (seen in the ruview project). A single pathological source file or a native-layer stall on Codespace overlay filesystems could block the indexer indefinitely with no diagnostic.
2. **Cascade of cosmetic errors** (seen in the cf-devpod project):
   - `[RVF] Shared adapter init failed: FsyncFailed`
   - `VectorDb creation failed: Database already open. Cannot acquire lock`
   - `Error: Could not find MCP server entry point`
   None were real failures — they came from a spawned MCP daemon child racing the parent for file locks it could never acquire.
3. **Every CLI command opened `patterns.rvf` and `memory.db` at startup.** `aqe --version`, `aqe --help`, and `aqe init` all grabbed exclusive file locks before commander had even parsed argv, holding them for the entire lifetime of the command. This was the root cause of the lock contention in (2).

## The five fixes

### Fix 1 — `HnswAdapter` dispose plumbing (394a1e63)
Added the `dispose()` contract to `IHnswIndexProvider` and wired it through `NativeHnswBackend` (nulls `nativeDb`) and `ProgressiveHnswBackend` (no-op). Infrastructure for test and explicit shutdown paths. `UnifiedMemoryManager.close()` deliberately does **not** cascade dispose into `HnswAdapter` — the `qe-memory` adapter is intentionally process-global because `@ruvector/router` does not allow a second native `VectorDb` to be created in the same process while the first is still alive. Documented with the reasoning inline.

### Fix 2 — Lazy `TokenOptimizerService` lifecycle (4ac19198)
`TokenOptimizerServiceImpl.initialize()` is now a lazy registration — it stores the memory backend reference and config but defers pattern-store creation until the first `checkEarlyExit()` or `storePattern()` call. `ensurePatternStoreReady()` is race-safe (shared `readyPromise`) and degrades to session-cache-only mode on failure. Commands that never hit the early-exit path (`init`, `status`, `health`, `hooks`, `daemon`, `--version`, `--help`) no longer open any files.

### Fix 3 — Phase 10 no longer spawns MCP daemon (5fce095e)
The `startDaemon()` / `findMcpCommand()` helpers have been removed. The canonical path for starting the MCP server is `.mcp.json` (written by phase 08) — Claude Code reads it and starts `aqe mcp` on demand. Users who want to run the daemon manually can use the generated `.agentic-qe/workers/start-daemon.cjs` helper script or the `aqe daemon` subcommand. Phase 10 now completes in ~1 ms instead of ~1500 ms.

### Fix 4 — `findMcpEntry()` robustness (e2f9e188)
v3.9.0's esbuild code-splitting placed CLI chunks under `dist/cli/chunks/`, breaking the fixed `__dirname + '..'` paths the `aqe mcp` command used to locate `dist/mcp/bundle.js`. A regression of the v3.7.10 fix. `findMcpEntry()` now walks up to the nearest `package.json` with `name=agentic-qe` via the existing `findPackageRoot()` helper, with legacy sibling-path fallback for dev mode and an extra chunk-split candidate.

### Fix 5 — Phase 06 per-file + phase watchdog with progress logs (8ea578b2)
Primary reliability fix. Phase 06 now drives indexing file-by-file with hard caps:
- **Per-file timeout:** 30 seconds. A pathological file is skipped with a warning, the rest of the codebase still indexes.
- **Whole-phase timeout:** 180 seconds. Partial results are preserved, warning names the file responsible, init continues.
- **Progress logs:** `Indexed X/Y files` every 100 files.

All KG semantic-search features (vector embeddings, knowledge graph, hypergraph) remain fully enabled. When the watchdog fires on a real project, the user will see the exact file that hung — which is the diagnostic we've been missing to fix the underlying native cause in a targeted follow-up.

## User-perspective verification (this codespace)

| Scenario | v3.9.2 | v3.9.3 |
|---|---|---|
| Empty fresh project | 1787 ms + `Could not find MCP` error | **427 ms, clean** |
| 200-file fixture | — | **672 ms, progress logs** |
| 15 k-entity heavy fixture | 3401 ms | **3120 ms, 28050 entries** |
| `aqe --version` with pre-existing `.agentic-qe/` | 6+ lines bootstrap noise, opens `patterns.rvf` | **1 line `3.9.3`, zero file opens** |
| `aqe mcp --help` | `Error: Could not find MCP server entry point` | **prints usage, exit 0** |

## Targeted test results

- `token-optimizer-service`: 17/17 pass
- `native-hnsw-backend` + `hnsw-legacy-bridge` + `hnsw-unification`: 99/99 pass
- `unified-memory`: 53/53 pass
- `pattern-store` + `rvf-pattern-store`: 65/65 pass
- `init/orchestrator` + `init/phases/database-phase`: 32/32 pass

**Total: 266/266 targeted tests passing.** Full suite runs in CI.

## Test plan

- [ ] Verify CI passes on the branch (all workflows, no Test Gate timeout)
- [ ] Install the built package in the ruview project and run `aqe init --auto`; confirm the hang is either gone or reports a specific file via the watchdog warning
- [ ] Install in cf-devpod and confirm no more `FsyncFailed` / `Database already open` / `Could not find MCP` errors
- [ ] Smoke test `aqe mcp --help`, `aqe --version`, `aqe status` on a fresh project
- [ ] Code review of the 5 Fix commits individually (each is atomic and revertable)

## Deliberate non-goals

- **Feature flag defaults stay `true`.** `useRVFPatternStore`, `useUnifiedHnsw`, `useAgentMemoryBranching` remain as shipped in v3.9.1. Flipping them would defeat the v3.9.1 rollout.
- **No `.db` or `.rvf` file touched on disk.** Per CLAUDE.md data-protection rules.
- **v3.9.2's fix is NOT reverted.** The `createPatternStore` → `getSharedRvfAdapter` routing still applies; this PR adds to it rather than replacing it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
