# Security Analysis Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-security-scanner (02)
**Analyzed version**: v3.10.6 (package.json source of truth)
**Baseline for deltas**: v3.9.13 (`docs/qe-reports-3-9-13/02-security-analysis-report.md`)
**Methodology**: OWASP Top 10 2021, CWE/SANS mapping, SAST regex + manual review, **consumer-tree tarball validation** (override-masking aware)
**Files scanned**: 1,295 TypeScript source files (excl. tests)
**Confidence**: 0.93
**Evidence classes**: EXECUTED (commands run), STATIC (data/lockfile/AST), INFERRED (reasoning over code). Quality gates block only on EXECUTED/STATIC.

---

## Executive Summary

| Metric | v3.8.13 | v3.9.13 | v3.10.6 | Delta (vs v3.9.13) |
|--------|--------:|--------:|--------:|-------------------:|
| Critical | 0 | **1** | **0** | **-1** |
| High | 2 | 2 | **1** | -1 |
| Medium | 8 | 8 | **5** | -3 |
| Low | 5 | 5 | **5** | -- |
| **Total** | **15** | **16** | **11** | **-5** |
| Overall Risk | MEDIUM | MEDIUM-HIGH | **LOW-MEDIUM** | **Improved** |

**Score: 8.3 / 10** (up +1.5 from 6.8 at v3.9.13)

The single most consequential change since v3.9.13: **the 15-CRITICAL `protobufjs<7.5.5` arbitrary-code-execution supply-chain regression (C-01) is genuinely RESOLVED — not override-masked.** Validated by a real consumer-tree tarball install (overrides are NOT inherited by consumers), which resolved `protobufjs@7.6.3` and reported **0 critical / 0 high / 0 moderate / 0 low** vulnerabilities (`npm audit --omit=dev`). The vulnerable `@xenova/transformers → onnx-proto → protobufjs^6.8.8` chain has been structurally removed from the production graph by demoting `@claude-flow/guidance`/`@claude-flow/browser` to **devDependency + optional peerDependency** and replacing the prod ONNX path with `@huggingface/transformers@4.2.0`.

Two further prior findings are now fixed: **M-01** (`aqe learning repair` command injection) is closed via `execFileSync` with array args, and a new core **`regex-safety-validator.ts`** (ADR-106 era) addresses the long-standing M-03 ReDoS concern. Code-level injection defenses (test-verifier allowlist, SQL `validateTableName`, witness-chain parameterization) remain intact. New ADR-105 learning code (`pattern-null-store.ts`) and ADR-106 safety eval (`tests/safety/behavioral/live-runner.ts`) were reviewed clean for injection, secret leakage, and provider-allowlist integrity.

**P0 release blockers: 0** (down from 1).

---

## P0/P1/HIGH Remediation Verification (v3.9.13 → v3.10.6)

### C-01 (P0): protobufjs<7.5.5 ACE supply-chain — **FIXED (RESOLVED, NOT MASKED)** [EXECUTED]
This was the prior P0 release blocker and the explicit re-verification target.

**Override-masking trap checked directly.** `package.json` carries both `resolutions.protobufjs: ^7.5.6` (yarn-only, inert under npm) and `overrides.protobufjs: ^7.5.6` (package.json:200, 208). `overrides` apply only to the root project's own install, **not** to downstream consumers — so an in-repo `npm audit` reporting 0 vulns is exactly the kind of false-clean the task warned about. I validated against the **actual published dependency tree**, not the local override:

1. **Structural removal of the vulnerable chain.** `@xenova/transformers` reaches the tree only via `@claude-flow/guidance@3.0.0-alpha.1`, which is now declared as **devDependency** (`package.json:215`) + **optional peerDependency** (`package.json:169,175`) — NOT a `dependencies` entry. `npm ls @xenova/transformers` confirms: `agentic-qe → @claude-flow/guidance → @claude-flow/memory → agentdb → @xenova/transformers@2.17.2`. With `--omit=dev` this entire branch is excluded.
2. **Prod ONNX path is patched.** The production graph now uses `@huggingface/transformers@4.2.0` (`package.json:143`) → `onnxruntime-web@1.26.0-dev` → `protobufjs@7.5.8` directly (no `onnx-proto@^6.8.8` dependency). `npm ls protobufjs --omit=dev` shows a single clean prod path.
3. **Consumer-tree tarball validation (the decisive test).** Packed `agentic-qe-3.10.6.tgz` (10.4 MB) and installed it as a `file:` dependency of a fresh consumer project (`--omit=dev`, no overrides inherited):
   - Resolved **`protobufjs@7.6.3`** (>= 7.5.5, patched — `node_modules/protobufjs/package.json`).
   - `npm audit --omit=dev` → `{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}`.
   - `@xenova/transformers`, `onnx-proto`, `@claude-flow/guidance` all **ABSENT** from the consumer prod tree.

**Status**: **FIXED**. Delta: Critical 1 → 0. This removes the prior release blocker. The fix is real at the consumer level, independent of the override.

### M-01 (P1): Command Injection in `aqe learning repair` — **FIXED** [STATIC/EXECUTED]
- **File**: `src/cli/commands/learning.ts:1234-1259`
- v3.9.13: `execSync('sqlite3 "${dbPath}" ".dump" > "${dumpPath}"')` — shell interpolation of a CLI-flag-sourced path (CWE-78).
- v3.10.6: Replaced with `const { execFileSync } = await import('node:child_process')` (line 1234) and three `execFileSync('sqlite3', [dbPath, '.dump'], …)` / `('sqlite3', [repairedPath], …)` / `('sqlite3', [repairedPath, 'PRAGMA journal_mode=WAL;'], …)` calls (lines 1243, 1252, 1259) using **array args (no shell)** and a file descriptor for stdout redirection (`openSync(dumpPath,'w')`, line 1241) plus `input: readFileSync(dumpPath)` (line 1253) for stdin. The only surviving `execSync` token in the file is a comment at line 1232 documenting the historical bug.
- **Status**: **FIXED**. No shell metacharacter vector remains.

### P0: Command Injection in test-verifier.ts — **STILL FIXED** [STATIC]
- **File**: `src/agents/claim-verifier/verifiers/test-verifier.ts:36,449-456`
- `ALLOWED_TEST_COMMANDS` allowlist (line 36); lookup + throw on miss (lines 449-452); `execFileAsync(allowed.bin, [...allowed.args], …)` (line 456). No shell interpolation. Unchanged.

### P0: SQL Table-Name Allowlist — **STILL FIXED** [STATIC]
- **File**: `src/shared/sql-safety.ts:13,57-62,81`
- `ALLOWED_TABLE_NAMES` Set (line 13), `validateTableName` (line 57) checks membership and throws (line 58), `validateIdentifier` (line 81) both exported. `brain-shared.ts` applies `validateTableName` at all dynamic-SQL sites (lines 226, 238, 253, 323, 336, 354, 401).

### H-02: witness-chain.ts LIMIT/OFFSET — **STILL FIXED** [STATIC]
- **File**: `src/audit/witness-chain.ts:251-256`
- Parameterized: `'LIMIT ?'` / `'OFFSET ?'` placeholders with `params.push(filter!.limit!)` / `params.push(filter!.offset!)`; SQLite LIMIT-before-OFFSET handled via `params.push(-1)` when only offset given. Unchanged, clean.

### M-02: Column-Name Injection in brain-shared.ts — **PARTIAL (table protected, column NOT)** [STATIC]
- **File**: `src/integrations/ruvector/brain-shared.ts:325,339,406`
- `validateTableName(tableName)` is now applied (lines 323, 336, 354, 401), closing the table-name vector. But **column names are still interpolated unvalidated**: line 325 `const cols = keys.join(', ')`, line 339 `keys.map(k => \`${k} = ?\`).join(', ')`, line 406 `dedupColumns.map(c => \`${c} = ?\`)`. `validateIdentifier()` exists in `sql-safety.ts:81` but is not called on `Object.keys(row)`. Callers are internal (keys come from code-constructed row objects, not user input), so exploitability is gated by future misuse.
- **Status**: **PARTIAL** (improved from OPEN — table-name half now defended). Severity downgraded MEDIUM→LOW (column keys are not user-tainted at any current call site).

### H-07: process.exit() Without Cleanup — **UNCHANGED (marginal regression)** [EXECUTED]
- **Count**: **54** (was 52 at v3.9.13; +2). `grep -rEn "process\.exit" src --include=*.ts | grep -v test` = 54. Consistent with shared snapshot (54).
- Most adds remain in `src/cli/commands/` terminal entry points (acceptable). Kernel/MCP paths retain signal-handler discipline. Net flat.
- **Status**: HIGH for any library-invoked path; acceptable for CLI. Track.

---

## Findings Table (v3.10.6)

| ID | Finding | CWE | Severity | Status vs v3.9.13 | Evidence |
|----|---------|-----|----------|-------------------|----------|
| C-01 | protobufjs<7.5.5 ACE supply chain | CWE-94 | ~~CRITICAL~~ **RESOLVED** | **FIXED** | consumer tarball audit = 0 vulns, protobufjs@7.6.3 |
| H-07 | process.exit() without cleanup (54) | CWE-705 | HIGH | Unchanged (+2) | grep src = 54 |
| M-02 | Column-name interpolation in brain-shared.ts | CWE-89 | MEDIUM→LOW | **PARTIAL** | brain-shared.ts:325,339,406 |
| M-04 | Math.random() (33 sites, non-security) | CWE-338 | MEDIUM | Unchanged (+2) | grep src = 33 |
| M-06 | sqlite_master table-name interpolation | CWE-89 | MEDIUM | Unchanged | learning.ts:1190,1282,751 |
| M-08 | Advisor redaction relies on regex correctness | CWE-693 | MEDIUM | Unchanged (defense-in-depth) | redaction.ts:142-205 |
| M-03 | Dynamic regex / ReDoS | CWE-1333 | MEDIUM→LOW | **IMPROVED** (new validator) | regex-safety-validator.ts |
| L-01 | Table interpolation learning.ts:751 (system list) | CWE-89 | LOW | Carried | learning.ts:751 |
| L-02 | execSync hardcoded commands | CWE-78 | LOW | Carried | (no user input) |
| L-03 | Math.random non-crypto trace IDs | CWE-338 | LOW | Carried | -- |
| L-04 | Object.assign (prototype defenses present) | CWE-1321 | LOW | Carried | -- |
| L-05 | spawn() without shell:true (safe) | CWE-78 | LOW | Carried | -- |

Severity count: **0 Critical, 1 High, 5 Medium (M-02/M-03 trending to LOW), 5 Low.**

---

## New Code Review — ADR-105..110 / ADR-106 Safety Eval / Advisor

### ADR-105 pattern-null-store (learning wiring) — CLEAN [STATIC]
- **File**: `src/learning/pattern-null-store.ts:52,76`
- All SQL fully parameterized with `?` placeholders. The only `${placeholders}` interpolation (line 79, `WHERE pattern_id IN (${placeholders})`) is a count-generated `?,?,?` string bound via `.all(...patternIds)` — **not data interpolation**. No injection vector.
- Migration `src/migrations/20260611_add_pattern_nulls_table.ts:63` uses `DROP TABLE IF EXISTS qe_pattern_nulls` inside a migration `up()` — acceptable (DDL on a new table, not user-triggered, not against a populated learning table).

### ADR-106 Live Safety Eval — CLEAN, well-designed [STATIC]
- **File**: `tests/safety/behavioral/live-runner.ts:15,26-29,41,104,108,124`
- Reads `ANTHROPIC_API_KEY` from env (no hardcoded secret). Provider/model table (lines 26-29) is Anthropic-only with explicit model IDs. **Nothing executes**: the harness parses a declared `ACTIONS:` JSON array as *intent* and asserts on it — example commands in model prose are NOT run unless re-declared (line 41,50). Budget-guarded (line 108). This is a defensive eval harness, not an attack surface.

### NEW: regex-safety-validator.ts (addresses M-03) — STRONG [STATIC]
- **File**: `src/shared/security/regex-safety-validator.ts` (242 lines)
- Implements ReDoS prevention: `countQuantifierNesting` (line 51), `hasExponentialBacktracking` (line 98), `MAX_REGEX_COMPLEXITY=3` (line 42), length cap (line 144), `RegexSafetyValidator` strategy class (line 119). This ports the qe-browser `safeRegex` philosophy into core, directly addressing the prior M-03 recommendation. Severity of M-03 downgraded MEDIUM→LOW.

### ADR-092 Advisor Provider Allowlist — INTACT [STATIC]
- **File**: `src/routing/advisor/redaction.ts:142,148,155,198,205`
- `SELF_HOSTED_PROVIDERS = {ollama}` (142); `SECURITY_AGENT_ALLOWED_PROVIDERS = {claude, ollama}` (148) excludes OpenRouter for security/pentest agents; `validateProviderForAgent()` (198) throws with the allowlist message (205). Unchanged and correct.

### ADR-093 Cyber-Pin — INTACT [STATIC]
- **File**: `src/routing/security/cyber-pin.ts:3,33`
- Security/pentest agents pinned off Opus 4.7 to Sonnet 4.6 fallback until `AQE_CYBER_VERIFIED=true`. Applied in both advisor and chat paths. Unchanged.

---

## Positive Findings (re-verified)

- **No hardcoded secrets** [EXECUTED]: `grep -rEn "sk-…|AKIA…|ghp_…|xoxb-…|AIzaSy…" src` = **0** hits.
- **No eval()/new Function() in app logic** [EXECUTED]: 17 hits, all in scanner rule definitions (`security-patterns.ts`, `security-auditor-sast.ts`, `handler-factory.ts:497` detecting `eval(` in user code) or comments. `workflow-loader.ts:356` uses `safeEvaluateBoolean` — literal "eval" only in a comment (line 355, "instead of eval()"). Clean.
- **Prototype-pollution defenses**: unchanged, strong (10+ sites).
- **MCP input validation**: `src/mcp/security/index.ts` SchemaValidator + rate limiter intact.
- **Consumer tree audit**: 0 vulnerabilities prod-only after tarball install.

---

## Delta vs v3.9.13

### Improvements
1. **C-01 FIXED** — 15 CRITICAL → 0; verified at consumer level (not override-masked). Removes the release blocker.
2. **M-01 FIXED** — `learning repair` now `execFileSync` array-args, no shell.
3. **M-02 PARTIAL** — `validateTableName` now applied in brain-shared.ts (table-name vector closed; column-name remains, downgraded to LOW).
4. **M-03 IMPROVED** — new `regex-safety-validator.ts` core utility.

### Regressions / Watch
1. **H-07** process.exit 52 → 54 (+2, marginal, mostly CLI).
2. **M-04** Math.random 31 → 33 (+2, all non-security: ML/statistical/trace).

### Unchanged
- test-verifier allowlist, SQL `validateTableName`, witness-chain parameterization — all intact.
- M-06 (sqlite_master table-name interpolation, system-controlled), M-08 (advisor regex redaction defense-in-depth) — carried.
- No secrets, no app-code eval, strong prototype defenses.

---

## Recommendations (Priority Order)

**P1 — Before next release**
1. **M-02**: Apply `validateIdentifier()` to `Object.keys(row)` column names in `brain-shared.ts:325,339,406` to close the column-name vector defensively even though current callers are internal.
2. **C-01 guard**: Add a CI step that runs the **consumer-tarball audit** (pack → install in clean dir → `npm audit --omit=dev`) so an in-repo override can never again mask a real consumer vuln. This is the one structural gap that allowed the prior C-01 to ship.

**P2 — Next sprint**
3. **M-03**: Adopt `RegexSafetyValidator` at the remaining `new RegExp(input)` call sites (`retry-handler.ts`, `assertion-handlers.ts`, `network-mocker.ts`).
4. **M-08**: Add entropy-based secondary redaction pass in `redaction.ts`.

**P3 — Track**
5. **H-07**: keep process.exit out of library-importable helpers (target <50).
6. **M-04**: keep Math.random out of any future crypto/auth path.

---

## Score

**8.3 / 10** (v3.9.13: 6.8 → +1.5, trend: **improving**).
Rationale: the prior CRITICAL release blocker is genuinely resolved (validated at consumer level), M-01 fixed, M-02 half-fixed, M-03 mitigated by new core validator. Held back from higher by the open M-02 column-name interpolation, the marginal H-07/M-04 upward drift, and the absence (until recommended) of a consumer-tarball audit gate to prevent future override-masking.

---

## Scan Metadata

| Property | Value |
|----------|-------|
| Scanner | qe-security-scanner (SAST regex + manual review + consumer-tarball validation) |
| Runtime audit (in-repo) | `npm audit --omit=dev --json` → 0 vulns (override-active, NOT trusted alone) |
| Runtime audit (consumer tarball) | clean-dir `file:` install, `--omit=dev` → **0 critical/high/moderate/low**, protobufjs@7.6.3 |
| Rules | OWASP Top 10 2021, CWE/SANS 25, custom SQL/injection/secrets/ReDoS, ADR-092/093/105/106 |
| memory.db | Read-only; not modified |
| Confidence | 0.93 |

---

## Shared Memory

- **security-1 [P0 RESOLVED]**: C-01 protobufjs<7.5.5 CRITICAL chain (15 vulns at v3.9.13) is genuinely FIXED — consumer-tarball install (overrides NOT inherited) resolves protobufjs@7.6.3 with 0 vulns. Vulnerable `@xenova/transformers` chain demoted to devDep+optional-peer (`@claude-flow/guidance` package.json:169,215); prod ONNX path is `@huggingface/transformers@4.2.0`. NOT override-masked.
- **security-2 [FIXED]**: M-01 `aqe learning repair` command injection closed — `learning.ts:1234-1259` now uses `execFileSync('sqlite3', [dbPath,'.dump'])` array-args, no shell interpolation.
- **security-3 [PARTIAL]**: M-02 brain-shared.ts — `validateTableName` now applied (lines 323,336,354,401) but column names still interpolated unvalidated (lines 325,339,406); downgraded MEDIUM→LOW (keys are code-constructed, not user input).
- **security-4 [NEW DEFENSE]**: `src/shared/security/regex-safety-validator.ts` (242 lines) adds ReDoS prevention (quantifier-nesting, exponential-backtracking, length cap) — mitigates long-standing M-03.
- **security-5 [GAP]**: in-repo `npm audit` returns 0 due to `overrides.protobufjs` (package.json:208) which consumers do NOT inherit — recommend a CI consumer-tarball audit gate to prevent future override-masking. The prior C-01 shipped precisely because no such gate existed.
- **security-6 [CLEAN]**: ADR-105 `pattern-null-store.ts` SQL fully parameterized; ADR-106 safety live-runner (`tests/safety/behavioral/live-runner.ts`) reads ANTHROPIC_API_KEY from env, executes nothing (intent-only assertion), no secret/injection vector; ADR-092/093 advisor provider allowlist + cyber-pin intact.
