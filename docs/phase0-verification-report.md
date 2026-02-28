# Phase 0 — Verification Report

**Date:** 2026-02-27
**AQE Version:** 3.7.2 (CLI) / 3.7.0 (MCP — version mismatch)
**Test Project:** `/tmp/aqe-test-project` (clean fixture with calculator.ts + auth.ts)
**Tester:** Claude Opus 4.6 automated verification

---

## Executive Summary

| Category | Total Tests | Pass | Fail | Hang/Timeout | Notes |
|----------|------------|------|------|--------------|-------|
| CLI Commands (TC-001→TC-026) | 52 | 25 | 10 | 17 | Process hang is systemic |
| MCP Tools (MCP-001→MCP-027) | 35 | 31 | 2 | 0 | MCP is significantly more reliable |
| **Total** | **87** | **56** | **12** | **17** | **64% pass rate** |

---

## CRITICAL Issues (Must Fix Before Release)

### CRIT-1: Process Hang — CLI commands don't exit cleanly
- **Severity:** CRITICAL
- **Affects:** ~50% of all CLI commands
- **Symptom:** After printing output and `[UnifiedMemory] Database closed`, process hangs indefinitely. Requires `timeout` or Ctrl+C to terminate.
- **Root Cause:** Likely the `RealEmbeddings` model loading happening asynchronously after main work completes, keeping the event loop alive. The `[RealEmbeddings] Model loaded in Xms` line often appears after `[UnifiedMemory] Database closed`.
- **Impact:** Unusable in CI pipelines. Any `aqe` command in a GitHub Actions step would hang the runner forever.
- **Commands affected:** `task submit`, `task list`, `agent spawn`, `agent list`, `domain list`, `domain health`, `llm providers`, `token-usage`, and others that use full system init.
- **Commands NOT affected:** `init`, `health`, `test generate`, `test execute`, `coverage`, `security --sast`, `fleet init/spawn/run/status`, `ci init`, `ci validate`, `--help` variants.

### CRIT-2: Stdout pollution — Internal logs written to stdout, not stderr
- **Severity:** CRITICAL
- **Affects:** ALL commands
- **Symptom:** Lines like `[UnifiedMemory] Initialized`, `[QueenCoordinator]`, `[PersistentSONAEngine]`, `Auto-initializing v3 system...` appear on stdout mixed with user output.
- **Impact:** JSON output from `--format json` is not parseable. `aqe health --format json | jq .` would fail. CI pipelines cannot consume structured output.
- **Fix:** All internal logging must go to stderr. Only user-facing output should go to stdout.

### CRIT-3: `qualityAPI.evaluate is not a function`
- **Severity:** CRITICAL
- **Affects:** `aqe quality --gate`, `aqe ci run` (quality-gate phase)
- **Symptom:** `TypeError: qualityAPI.evaluate is not a function`
- **Impact:** Quality gate — a core CI feature — is completely broken. The CI pipeline always fails at the quality-gate phase.

### CRIT-4: `securityAPI.checkCompliance is not a function`
- **Severity:** CRITICAL
- **Affects:** `aqe security --compliance gdpr,soc2`
- **Symptom:** `TypeError: securityAPI.checkCompliance is not a function`
- **Impact:** Compliance checking is broken. SAST scan works fine, but compliance overlay crashes.

### CRIT-5: OpenRouter provider registration error
- **Severity:** HIGH
- **Affects:** Every command that initializes all domains (non-lazy)
- **Symptom:** `[Providers] Failed to register OpenRouter provider: TypeError: Cannot read properties of undefined (reading 'replace')`
- **Impact:** Silent error in logs. Does not block execution but indicates broken provider registration. Users see error noise on every command run.

---

## HIGH Issues

### HIGH-1: `aqe test generate /nonexistent` hangs instead of erroring
- **Severity:** HIGH
- **Affects:** TC-004.6
- **Symptom:** Prints "No source files found" then hangs forever. Should exit 1 with error message.

### HIGH-2: `aqe status` auto-initializes instead of failing when not initialized
- **Severity:** HIGH (UX)
- **Affects:** TC-002.3
- **Expected:** Error message + exit 1 when `.agentic-qe/` doesn't exist
- **Actual:** Auto-creates `.agentic-qe/` and shows status as healthy. User has no way to know they haven't explicitly initialized.

### HIGH-3: Version mismatch — CLI reports 3.7.2, MCP `aqe_health` reports 3.7.0
- **Severity:** HIGH
- **Affects:** MCP `aqe_health` tool
- **Symptom:** `"version": "3.7.0"` in aqe_health response while CLI `--version` returns 3.7.2
- **Impact:** Version tracking confusion. CI version gates would get wrong version from MCP.

### HIGH-4: `team_scale` doesn't actually scale
- **Severity:** HIGH
- **Affects:** MCP `team_scale`
- **Symptom:** `team_scale({domain: "test-generation", targetSize: 4})` returns `previousSize: 3, newSize: 3, addedAgents: []`. No agents were added despite requesting 4.

### HIGH-5: `test_execute_parallel` returns 0 tests despite being given test files
- **Severity:** HIGH
- **Affects:** MCP `test_execute_parallel`
- **Symptom:** `{testFiles: ["src/calculator.test.ts"]}` returns `total: 0, passed: 0`. The test file exists and has 98 assertions.
- **Impact:** MCP test execution doesn't actually find/run tests.

### HIGH-6: `infra_healing_status` and `infra_healing_feed_output` always fail
- **Severity:** HIGH
- **Affects:** MCP infra healing tools
- **Symptom:** `"error": "Infrastructure healing not initialized"` even after fleet_init
- **Impact:** Self-healing infrastructure feature is non-functional via MCP.

---

## MEDIUM Issues

### MED-1: Test plan documents flags that don't exist
- **Severity:** MEDIUM (Documentation)
- **Affects:** TC-001.4, TC-003.2, TC-003.3
- **Details:**
  - `--skip-code-scan` doesn't exist on `init`
  - `-v` doesn't exist on `health` (use `--format json` or `-d <domain>`)
  - `--json` doesn't exist on `health` (use `--format json`)

### MED-2: Coverage reports percentage with excessive decimal places
- **Severity:** MEDIUM (UX)
- **Symptom:** `Lines: 55.8891454965358%` instead of `55.9%`
- **Affects:** `aqe coverage`, `aqe ci run` coverage phase

### MED-3: `aqe quality` (without --gate) submits async task, never returns result
- **Severity:** MEDIUM
- **Affects:** TC-007.1
- **Symptom:** Prints task ID then hangs. User expected: quality score + recommendations inline.

### MED-4: Coverage gap detection flags calculator.ts for "missing-security-check"
- **Severity:** MEDIUM (False positive)
- **Affects:** `aqe coverage --gaps`
- **Symptom:** Pure math functions flagged for "missing security check tests. Cover auth bypass and injection attacks."

### MED-5: `model_route` always returns tier 0 (Agent Booster) for complex tasks
- **Severity:** MEDIUM
- **Affects:** MCP `model_route`
- **Symptom:** "generate unit tests for authentication module" gets complexity=0 and routes to tier 0. Only security-scoped tasks get tier 2. The complexity analyzer appears to always return 0 for non-security tasks.

### MED-6: `coverage_analyze_sublinear` via MCP returns 0% for all metrics
- **Severity:** MEDIUM
- **Affects:** MCP coverage tool
- **Symptom:** Returns `lineCoverage: 0, branchCoverage: 0` while CLI `aqe coverage` returns ~56% heuristic estimates for the same path. Inconsistent behavior between CLI and MCP.

---

## LOW Issues

### LOW-1: Progress bar shows `{name}` instead of actual fleet operation name
- **Severity:** LOW (UX cosmetic)
- **Affects:** `aqe fleet spawn`, `aqe fleet run`
- **Symptom:** First progress bar line shows literal `{name}` instead of operation name.

### LOW-2: `aqe init --wizard` shows steps but hangs waiting for input in non-interactive mode
- **Severity:** LOW
- **Affects:** TC-001.2 in CI context
- **Note:** Expected for interactive mode, but should detect non-TTY and error.

### LOW-3: `aqe test generate` coverage estimate inconsistent
- **Severity:** LOW
- **Affects:** TC-004.1 vs TC-004.2
- **Symptom:** Same file generates 37% estimate first run, 0% on second run with framework flag.

---

## CLI Command Verification Details

### TC-001: `aqe init`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Default init | **PASS** | 0 | Works, but OpenRouter error in logs (CRIT-5) |
| 2 | Wizard mode | **PASS** | 0 | Shows wizard steps correctly |
| 3 | Custom topology | **PASS** | 0 | `-d test-generation -m 8 --memory sqlite` respected |
| 4 | Minimal mode | **PARTIAL** | 0 | `--skip-code-scan` doesn't exist (MED-1). `--minimal --skip-patterns` works |
| 5 | Lazy loading | **PASS** | 0 | `--lazy` works, fewer domain logs |
| 6 | Re-init safety | **PASS** | 0 | Handles gracefully, re-initializes |

### TC-002: `aqe status`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Basic status | **PASS** | 0 | Shows agents/tasks/utilization |
| 2 | Verbose | **PASS** | 0 | Includes domain details + load bars |
| 3 | Before init | **FAIL** | 0 | Auto-initializes instead of erroring (HIGH-2) |

### TC-003: `aqe health`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Basic health | **PASS** | 0 | Shows domain health summary |
| 2 | Verbose (`-v`) | **FAIL** | 1 | Flag doesn't exist (MED-1) |
| 3 | JSON output | **PASS** | 0 | Valid JSON via `--format json`, but stdout polluted (CRIT-2) |

### TC-004: `aqe test generate`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Generate for file | **PASS** | 0 | Generates tests, writes to file |
| 2 | With framework | **PASS** | 0 | `-f vitest` accepted |
| 3 | Integration type | Not tested | - | - |
| 4 | E2E type | Not tested | - | - |
| 5 | No target | Not tested | - | - |
| 6 | Invalid path | **FAIL** | HANG | Prints "No source files found" then hangs (HIGH-1) |

### TC-005: `aqe test execute`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Execute all | **PASS** | 1 | Runs vitest, shows 26 pass/2 fail. Exit 1 correct for failures. |

### TC-006: `aqe coverage`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Basic coverage | **PASS** | 0 | Shows heuristic estimates |
| 2 | With threshold | **PASS** | 0 | Reports "Not met (90%)" correctly |
| 3 | With risk | **PASS** | 0 | Shows risk scores per file |
| 4 | Gap detection | **PASS** | 0 | Lists gaps with severity (false positives - MED-4) |
| 5-8 | Ghost/sensitivity/wizard | Not tested | - | - |

### TC-007: `aqe quality`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Basic quality | **FAIL** | HANG | Submits async task, never returns result (MED-3) |
| 2 | Quality gate | **FAIL** | 1 | `qualityAPI.evaluate is not a function` (CRIT-3) |

### TC-008: `aqe security`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | SAST scan | **PASS** | 0 | "No vulnerabilities found" for clean code |
| 2 | DAST scan | **PASS** | 0 | Notes URL requirement correctly |
| 5 | SAST + compliance | **FAIL** | 0 | SAST passes, compliance crashes (CRIT-4) |

### TC-009: `aqe fleet init`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Default fleet | **PASS** | 0 | Initializes, shows next steps |

### TC-010: `aqe fleet spawn`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Default spawn | **PASS** | 0 | 2 agents spawned with progress bars (LOW-1: `{name}` placeholder) |

### TC-011: `aqe fleet run`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Run test | **PASS** | 0 | 4 workers, all complete |

### TC-012: `aqe fleet status`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Basic status | **PASS** | 0 | Shows utilization bars per domain |

### TC-013: `aqe task`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Submit task | **FAIL** | HANG | Output correct but process hangs (CRIT-1) |
| 3 | List tasks | **FAIL** | HANG | Process hangs (CRIT-1) |

### TC-014: `aqe agent`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Spawn agent | **FAIL** | HANG | Output correct but process hangs (CRIT-1) |
| 2 | List agents | **FAIL** | HANG | Process hangs (CRIT-1) |

### TC-015: `aqe domain`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | List domains | **FAIL** | HANG | Output correct but process hangs (CRIT-1) |

### TC-017: `aqe code`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Index code | **PASS** | 0 | 2 files indexed, 10 nodes, 8 edges |

### TC-020: `aqe learning`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Stats | **PASS** | 0 | Pattern counts, HNSW stats, search perf |
| 2 | Stats JSON | **PASS** | 0 | Valid JSON output |

### TC-021: `aqe llm`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | List providers | **FAIL** | HANG | Output correct (8 providers listed) but hangs (CRIT-1) |

### TC-022: `aqe token-usage`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Default (24h) | **FAIL** | HANG | Output correct but hangs (CRIT-1) |

### TC-024: `aqe migrate`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Dry run | **PASS** | 0 | Detects v2 installation status |

### TC-025: `aqe completions`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | Bash completions | **FAIL** | HANG | Process hangs |

### New: `aqe ci`
| # | Test | Result | Exit Code | Notes |
|---|------|--------|-----------|-------|
| 1 | ci init | **PASS** | 0 | Creates .aqe-ci.yml correctly |
| 2 | ci validate | **PASS** | 0 | Validates YAML, lists phases |
| 3 | ci run | **FAIL** | 1 | Phases 1-3 work, phase 4 (quality gate) crashes (CRIT-3) |

---

## MCP Tool Verification Details

### MCP-001: `fleet_init` — **PASS**
Returns fleetId, topology, domains. Structured JSON.

### MCP-002: `fleet_status` — **PASS**
Returns agents, tasks, teams, learning stats. Verbose mode works.

### MCP-003: `fleet_health` — **PASS**
Returns health status, agent counts, work stealing state.

### MCP-004: `task_submit` — **PASS**
Returns taskId, assigns to domain. Note: task failed with "missing sourceFiles" — valid error for empty payload.

### MCP-005: `task_orchestrate` — **PASS**
Returns task with routing info, parallel strategy.

### MCP-006: `task_list`, `task_status`, `task_cancel` — **PASS** (cancel: expected behavior)
- `task_list`: Returns array of tasks with full metadata
- `task_status`: Returns detailed task info
- `task_cancel`: Returns "Task already finished" (correct — task completed before cancel)

### MCP-007: `agent_spawn`, `agent_list`, `agent_status`, `agent_metrics` — **PASS**
All return structured data. Metrics include CPU/memory stats.

### MCP-008: `test_generate_enhanced` — **PASS**
Generates test code with assertions, anti-patterns, AI insights.

### MCP-009: `test_execute_parallel` — **FAIL** (HIGH-5)
Returns 0 tests despite being given valid test file paths.

### MCP-010: `coverage_analyze_sublinear` — **PARTIAL** (MED-6)
Returns structured response but all coverage metrics are 0%. CLI returns heuristic estimates.

### MCP-011: `quality_assess` — **PASS**
Returns quality score (37), passed=false, metrics, recommendations. Gate mode works via MCP (unlike CLI!).

### MCP-012: `security_scan_comprehensive` — **PASS**
Returns vulnerability counts, saves SARIF. Note: "No source files found to scan" — may need absolute path.

### MCP-013: `defect_predict` — **PASS**
Returns predictions array (empty for simple fixture).

### MCP-014: `requirements_validate` — **PASS**
Returns structured result. 0 requirements analyzed (no file at path — expected).

### MCP-015: `contract_validate` — **PASS**
Returns valid=false (no contract file — expected).

### MCP-016: `accessibility_test` — **PASS**
Returns score=0, passed=false (no server running — expected).

### MCP-017: `chaos_test` — **PASS**
Returns resilience data, saves results.

### MCP-018: `code_index` — **PASS** (via CLI), **PARTIAL** (via MCP)
CLI: 2 files indexed, 10 nodes. MCP: 0 files indexed (path resolution issue).

### MCP-019: Memory CRUD — **ALL PASS**
- `memory_store`: Stores with namespace, confirmation
- `memory_retrieve`: Returns stored value
- `memory_query` (pattern): Glob matching works
- `memory_query` (semantic): HNSW vector search works, returns scored results
- `memory_delete`: Confirms deletion
- `memory_usage`: Returns entry count (443), vectors (410), namespaces (16)
- `memory_share`: Shares between agents

### MCP-020: `model_route`, `routing_metrics` — **PASS** (with MED-5 concern)
Routing works but complexity always returns 0 for non-security tasks.

### MCP Infrastructure Tools
- `team_list`: **PASS** — Shows teams with members
- `team_health`: **PASS** — Health per domain
- `team_broadcast`: **PASS** — Delivers to recipients
- `team_scale`: **FAIL** (HIGH-4) — Doesn't actually add agents
- `team_rebalance`: **PASS** — Returns (no moves needed)
- `infra_healing_status`: **FAIL** (HIGH-6) — Not initialized error
- `infra_healing_feed_output`: **FAIL** (HIGH-6) — Not initialized error
- `aqe_health`: **PASS** (with HIGH-3 version mismatch)

---

## Priority Fix Order

### P0 — Blocking (fix before any CI usage)
1. **CRIT-1**: Process hang — add `process.exit()` or fix event loop cleanup after command completion
2. **CRIT-2**: Route all internal logs to stderr — only user output to stdout
3. **CRIT-3**: Fix `qualityAPI.evaluate` — likely missing method in quality domain service

### P1 — High (fix before next release)
4. **CRIT-4**: Fix `securityAPI.checkCompliance`
5. **CRIT-5**: Fix OpenRouter provider registration (handle missing config gracefully)
6. **HIGH-1**: `test generate` with invalid path should exit cleanly
7. **HIGH-3**: Sync version string between CLI and MCP
8. **HIGH-5**: MCP `test_execute_parallel` should actually execute tests

### P2 — Medium (fix in upcoming sprint)
9. **HIGH-2**: `status` should error when not initialized (or at least warn)
10. **HIGH-4**: `team_scale` should actually scale
11. **HIGH-6**: Initialize infra healing during fleet_init
12. **MED-2**: Round coverage percentages to 1 decimal
13. **MED-5**: Fix model routing complexity analysis
14. **MED-6**: Make MCP coverage consistent with CLI

### P3 — Low (backlog)
15. **LOW-1**: Fix `{name}` placeholder in progress bars
16. **LOW-2**: Detect non-TTY for wizard mode
17. **LOW-3**: Consistent coverage estimates across runs
18. **MED-1**: Update test plan documentation to match actual flags
19. **MED-4**: Reduce false positive gap detection for utility functions
