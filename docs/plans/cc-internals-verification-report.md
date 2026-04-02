# CC-Internals Improvements (IMP-00 through IMP-10) — User-Perspective Verification Report

**Date**: 2026-04-01
**Version**: v3.8.14 (branch: `march-fixes-and-improvements`)
**Verifier**: Automated verification from user perspective
**Scope**: 11 improvements across 4 priority tiers (P0-P3)

---

## Executive Summary

| Area | Verdict | Details |
|------|---------|---------|
| **Build** | PASS | tsc + CLI bundle + MCP bundle compile cleanly |
| **Tests** | PASS | 416/416 new tests pass across 32 test files |
| **Source files** | PASS | 40/40 claimed source files exist |
| **Test files** | PARTIAL | 25/33 match plan names; 7 exist under different names; 5 genuinely missing test files |
| **Integration wiring** | PASS | All 11 IMPs are wired into production code paths (not dead code) |
| **CLI UX** | PASS with issues | All commands work; fast-path is slower than claimed |
| **Kill switches** | FAIL | Only 3/11 documented env vars are implemented |
| **Security hardening** | PASS | All 4 security claims verified |

**Overall: 7 of 8 verification areas pass. Kill switches are the critical gap.**

---

## 1. Build Verification

```
npm run build  =>  tsc + build:cli + build:mcp  =>  SUCCESS
```

- TypeScript compilation: clean
- CLI bundle: built successfully (v3.8.14)
- MCP bundle: built successfully (v3.8.14)
- One benign warning: empty glob for `init/*-installer.js` (pre-existing, unrelated)

**Verdict: PASS**

---

## 2. Test Verification

```
npx vitest run (32 IMP test files)  =>  416 passed, 0 failed  (4.27s)
```

All 416 new tests pass. Breakdown by wave:

| Wave | IMPs | Tests | Status |
|------|------|-------|--------|
| 0-2 | IMP-00 through IMP-07 | 192 | All pass |
| 3 | IMP-08, IMP-09 | 131 | All pass |
| 4 | IMP-10 | 93 | All pass |

**Verdict: PASS**

---

## 3. Source File Verification

All 40 claimed source files exist on disk:

| Module | Files | Status |
|--------|-------|--------|
| Middleware chain (IMP-00) | `src/mcp/middleware/middleware-chain.ts` | OK |
| Microcompact (IMP-01) | `src/mcp/middleware/microcompact.ts` | OK |
| Batch executor (IMP-02) | `src/mcp/middleware/batch-executor.ts` | OK |
| Retry engine (IMP-03) | `src/shared/retry-engine.ts` | OK |
| Session store (IMP-04) | `src/mcp/services/session-store.ts`, `session-resume.ts`, `session-durability-middleware.ts` | OK |
| Prompt cache latch (IMP-05) | `src/shared/prompt-cache-latch.ts` | OK |
| Fast paths (IMP-06) | `src/boot/fast-paths.ts`, `src/boot/parallel-prefetch.ts` | OK |
| Hook security (IMP-07) | `src/hooks/security/config-snapshot.ts`, `ssrf-guard.ts`, `exit-codes.ts`, `index.ts` | OK |
| Compaction (IMP-08) | `src/context/compaction/` (6 files) | OK |
| Plugins (IMP-09) | `src/plugins/` (9 files) | OK |
| Quality Daemon (IMP-10) | `src/workers/quality-daemon/` (9 files) + `src/cli/commands/daemon.ts` | OK |

**Verdict: PASS**

---

## 4. Test File Verification

### Plan vs Reality: Naming Discrepancies

The plan documentation uses abbreviated test file names that don't match the actual filenames:

| Plan claims | Actual filename | Status |
|-------------|----------------|--------|
| `tests/context/compaction/budget.test.ts` | `context-budget.test.ts` | Name mismatch |
| `tests/context/compaction/tier1.test.ts` | `tier1-microcompact.test.ts` | Name mismatch |
| `tests/context/compaction/tier2.test.ts` | `tier2-session-summary.test.ts` | Name mismatch |
| `tests/context/compaction/tier3.test.ts` | `tier3-llm-compact.test.ts` | Name mismatch |
| `tests/context/compaction/tier4.test.ts` | `tier4-reactive.test.ts` | Name mismatch |
| `tests/workers/quality-daemon/quality-daemon.test.ts` | `index.test.ts` | Name mismatch |
| `tests/cli/commands/daemon.test.ts` | `workers/quality-daemon/daemon-cli.test.ts` | Location mismatch |

### Genuinely Missing Test Files

These 5 test files are documented in the plan but do not exist anywhere in the codebase:

| Missing test file | IMP | Impact |
|-------------------|-----|--------|
| `tests/boot/parallel-prefetch.test.ts` | IMP-06 | `parallelPrefetch()` has no dedicated unit tests |
| `tests/mcp/services/session-durability-middleware.test.ts` | IMP-04 | Session durability middleware untested in isolation |
| `tests/plugins/sources/local.test.ts` | IMP-09 | Local plugin source loader untested |
| `tests/plugins/sources/github.test.ts` | IMP-09 | GitHub plugin source loader untested |
| `tests/plugins/sources/npm.test.ts` | IMP-09 | npm plugin source loader untested |

**Verdict: PARTIAL — 5 test files missing; plan naming inaccurate for 7 others**

---

## 5. Integration Wiring Verification

All 11 improvements are wired into production code paths:

| IMP | Module | Evidence |
|-----|--------|----------|
| 00 | MiddlewareChain | Instantiated in protocol-server constructor; `executePreHooks`/`executePostHooks`/`executeErrorHooks` called in `handleToolsCall()` |
| 01 | Microcompact | `createMicrocompactMiddleware()` registered at priority 100; engine shared with compaction pipeline |
| 02 | Tool concurrency | `isConcurrencySafe` field in types.ts; 15+ tools annotated; `invokeBatch()` partitions by safety flag |
| 03 | Retry engine | `withRetry()` wraps `ToolRegistry.invoke()` with 3 attempts; also wraps `attemptReconnect()` |
| 04 | Session durability | `SessionStore` instantiated in constructor; `createSessionDurabilityMiddleware()` registered |
| 05 | Prompt cache latch | `PromptCacheLatch` used in `ClaudeModelProvider.complete()` for model/max_tokens/system |
| 06 | Startup fast paths | `isVersionFastPath()` in `cli/index.ts`; `parallelPrefetch()` in `mcp/entry.ts` |
| 07 | Hook security | `captureHooksConfigSnapshot()` freezes config at init; `AQE_HOOKS_DISABLED` checked at 4+ points |
| 08 | 4-Tier compaction | `CompactionPipeline` registered as middleware; all 4 tiers imported; 413 detection triggers Tier 4 |
| 09 | Plugin architecture | Plugin factories in kernel; dynamic import in PluginLoader; `aqe plugin` commands in CLI |
| 10 | Quality Daemon | Started from `entry.ts` with `PersistentWorkerMemory`; `isPrivateIp` SSRF guard on notifications; `aqe daemon` in CLI |

**Verdict: PASS — zero dead code found**

---

## 6. CLI User Experience Verification

### Commands Tested

| Command | Works? | Output Quality | Time |
|---------|--------|----------------|------|
| `aqe --version` | Yes | Prints `3.8.14` | ~500ms |
| `aqe plugin --help` | Yes | Clear subcommands + examples | ~1.7s |
| `aqe plugin list` | Yes | "No plugins installed" + hint | ~1.7s |
| `aqe daemon --help` | Yes | 5 subcommands shown | ~1.7s |
| `aqe daemon status` | Yes | "No daemon instance" + hint | ~1.7s |
| `aqe health` | Yes | 14 idle domains reported | ~2s |

### Issues Found

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **Fast path is not fast** | MEDIUM | `--version` takes ~500ms. IMP-06 claims <50ms. Tree-sitter WASM parser loading fires before the fast-path intercept. |
| 2 | **INFO log leaks into --version output** | LOW | `[ParserRegistry] tree-sitter WASM parsers available for: ...` printed before version number. Scripts piping `aqe --version` will get garbage. |
| 3 | **Heavy init for help screens** | LOW | `plugin --help` and `daemon --help` load AdversarialDefense and other modules before rendering. Help should be instantaneous. |
| 4 | **Noisy initialization logging** | LOW | Internal log lines (UnifiedMemory, HybridBackend, QueenCoordinator) visible before health output. Users shouldn't see these without `--verbose`. |

**Verdict: PASS — all commands work, but fast-path performance claim is not met**

---

## 7. Kill Switch / Environment Variable Verification

### Results

| Variable | IMP | Implemented? | Evidence |
|----------|-----|-------------|----------|
| `AQE_MAX_TOOL_CONCURRENCY` | 02 | **YES** | `batch-executor.ts:120` — read, parsed, controls semaphore |
| `AQE_HOOKS_DISABLED` | 07 | **YES** | `cross-phase-hooks.ts:126,164,185,224` — checked at init + events |
| `AQE_HOOKS_MANAGED_ONLY` | 07 | **YES** | `cross-phase-hooks.ts:450` — filters to managed hooks only |
| `AQE_MICROCOMPACT` | 01 | **NO** | Not found in source |
| `AQE_RETRY_DISABLED` | 03 | **NO** | Not found in source |
| `AQE_SESSION_DURABILITY` | 04 | **NO** | Not found in source |
| `AQE_PROMPT_CACHE_LATCH` | 05 | **NO** | Not found in source |
| `AQE_FAST_PATHS` | 06 | **NO** | Not found in source |
| `AQE_HOOKS_SSRF_DISABLED` | 07 | **NO** | SSRF is always enforced |
| `AQE_COMPACTION_DISABLED` | 08 | **NO** | Not found in source |
| `AQE_PLUGINS_DISABLED` | 09 | **NO** | Not found in source |

**Verdict: FAIL — only 3 of 11 documented kill switches are implemented. The Emergency Rollback Procedure section of the plan is materially inaccurate.**

---

## 8. Security Hardening Verification

| Claim | Verified? | Evidence |
|-------|-----------|---------|
| Plugin sources use `execFileSync` (not `execSync`) | **YES** | Both `github.ts:9` and `npm.ts:11` import `execFileSync`; args passed as arrays |
| SSRF guard has `isPrivateIp()` | **YES** | `ssrf-guard.ts:36` — checks RFC 1918, loopback, link-local, IPv6 ULA |
| Hook config uses `Object.freeze()` | **YES** | `config-snapshot.ts:24` — recursive deepFreeze + structuredClone |
| `isPrivateIp` wired into daemon startup | **YES** | Both `daemon.ts:16` (CLI) and `entry.ts:220` (MCP) create urlValidators using `isPrivateIp` |

**Verdict: PASS — all security claims verified**

---

## Findings Summary

### Critical (must fix before release)

| # | Finding | Impact |
|---|---------|--------|
| F-01 | **8 of 11 kill switches not implemented** | Users cannot disable features in production emergencies. The rollback procedure in the plan is fiction. |

### High (should fix before release)

| # | Finding | Impact |
|---|---------|--------|
| F-02 | **5 test files missing** (parallel-prefetch, session-durability-middleware, 3 plugin sources) | Coverage gaps in startup, session persistence, and plugin installation paths |
| F-03 | **`--version` fast path takes ~500ms** (plan claims <50ms) | User perceives slow CLI; `time aqe --version` in CI pipelines adds unnecessary latency |

### Medium (fix in next sprint)

| # | Finding | Impact |
|---|---------|--------|
| F-04 | **INFO log line leaks into `--version` stdout** | Scripts parsing version output will break |
| F-05 | **Help commands take ~1.7s** (full system init before rendering) | Poor first-impression UX for new users |
| F-06 | **Plan documentation has 7 wrong test file names** | Maintenance confusion; developers can't find tests from the plan |

### Low (nice to have)

| # | Finding | Impact |
|---|---------|--------|
| F-07 | **Noisy init logging on `health` command** | Cosmetic; internal logs visible to users |

---

## Recommendations

1. **Implement the 8 missing kill switches** (F-01) — each is a 1-line `process.env` check at module entry. Without these, there is no emergency rollback path for any new feature except `AQE_HOOKS_DISABLED` and `AQE_MAX_TOOL_CONCURRENCY`.

2. **Add the 5 missing test files** (F-02) — especially `tests/plugins/sources/*.test.ts` since plugin sources handle `execFileSync` (a security-sensitive path) and have no dedicated tests.

3. **Fix the fast-path bypass** (F-03) — the `isVersionFastPath()` check in `cli/index.ts` fires after tree-sitter WASM parser loading. Move the fast-path check earlier in the import chain, or use lazy imports.

4. **Suppress init logging for non-verbose commands** (F-04, F-07) — route `[INFO]` logs through a logger that respects `--quiet`/`--verbose` flags, or suppress entirely for `--version` and `--help`.

5. **Update plan documentation** (F-06) — correct the 7 wrong test file names in the Verification Matrix section so the plan matches reality.
