# AQE v3.7.0 Security Analysis Report

**Date**: 2026-02-23
**Scope**: `/workspaces/agentic-qe-new/v3/src/` (full codebase)
**Baseline**: v3.6.8 Brutal Honesty Audit (SEC-001 through SEC-007)
**Scanner**: QE Security Scanner (Claude Opus 4.6 SAST)

---

## Executive Summary

| Dimension | v3.6.8 Baseline | v3.7.0 Status | Delta |
|-----------|----------------|---------------|-------|
| Command Injection (CWE-78) | Partially fixed | 3 Critical, 5 High | Regression in task-executor |
| Unsafe JSON.parse (CWE-1321) | ~18 raw calls | 20 raw calls (13 files) | Slight regression |
| Weak Randomness (CWE-338) | 170+ Math.random | 173 across 79 files | Stable (not fixed) |
| Auth Blacklist (CWE-287) | Blacklist | Fixed to whitelist | Resolved |
| SQL Injection (CWE-89) | Unknown | 2 High (brain-exporter) | Carried over |
| Credential Exposure (CWE-522) | Password redaction added | Properly handled | Maintained |
| Path Traversal (CWE-22) | Unknown | Low risk (validators exist) | Acceptable |
| Dependencies | Unknown | 21 high (minimatch) | Active |
| Prototype Pollution | Unknown | Well-defended | Good |
| ReDoS (CWE-1333) | markdown-it fixed | 2 Medium (new RegExp from user input) | New findings |

**Overall Risk Rating**: **HIGH** -- 3 Critical, 7 High, 8 Medium, 6 Low findings

**Critical Vulnerabilities**: 3 (all command injection via user-controlled file paths in execSync)

---

## Detailed Findings

### 1. Command Injection (CWE-78)

**SEC-001 Status from v3.6.8**: The command-executor.ts fix held. However, task-executor.ts has a new critical command injection, and session-manager.ts/client.ts execSync usage persists as noted in the baseline.

#### SEC-078-001 [CRITICAL] Command Injection via testFiles in task-executor.ts

- **CWE**: CWE-78
- **Severity**: Critical
- **File**: `v3/src/coordination/task-executor.ts:1491-1492`
- **Status**: NEW in v3.7.0
- **Description**: User-supplied `testFiles` array is joined and interpolated directly into an `execSync` shell command without any sanitization. An attacker providing a test file path like `"; rm -rf / #"` achieves arbitrary command execution.

```typescript
// VULNERABLE CODE
output = execSync(
  `npx vitest run ${testFiles.join(' ')} --reporter=json 2>/dev/null || npx jest ${testFiles.join(' ')} --json 2>/dev/null`,
  { cwd, timeout: 120000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
);
```

- **Remediation**: Use `execFileSync('npx', ['vitest', 'run', ...testFiles, '--reporter=json'])` with argument arrays. Never interpolate user input into shell commands.

#### SEC-078-002 [CRITICAL] Command Injection via coverageCmd in task-executor.ts

- **CWE**: CWE-78
- **Severity**: Critical
- **File**: `v3/src/coordination/task-executor.ts:952`
- **Status**: Carried over from v3.6.8
- **Description**: Coverage command is constructed from detected test runner and executed via `execSync`. While the command itself is internally determined, `targetPath` (from `payload.target || process.cwd()`) flows into `cwd` and is not validated. The shell command itself also uses shell features (pipes, redirects) requiring shell execution.

#### SEC-078-003 [CRITICAL] Command Injection in loc-counter.ts and test-counter.ts

- **CWE**: CWE-78
- **Severity**: Critical
- **File**: `v3/src/domains/code-intelligence/services/metric-collector/loc-counter.ts:111,170` and `test-counter.ts:209,299,341,388,441`
- **Status**: Carried over from v3.6.8
- **Description**: Multiple `execSync` calls with string interpolation. These files contain 9 total `execSync` calls that construct shell commands dynamically for `cloc`, `scc`, and other code analysis tools.

#### SEC-078-004 [HIGH] Hardcoded pkill patterns in agent-browser client.ts

- **CWE**: CWE-78
- **Severity**: High
- **File**: `v3/src/integrations/browser/agent-browser/client.ts:1190,1201`
- **Status**: Carried over from v3.6.8
- **Description**: Uses `execSync('pkill -9 -f ...')` with hardcoded patterns. While inputs are not user-controlled, `pkill -9 -f` with regex patterns is dangerous as it can match unintended processes system-wide. The function itself warns "Only use in test environments" but has no runtime enforcement.

#### SEC-078-005 [HIGH] 17 execSync calls in claude-flow-adapter.ts

- **CWE**: CWE-78
- **Severity**: High
- **File**: `v3/src/init/enhancements/claude-flow-adapter.ts` (17 occurrences)
- **Status**: Carried over from v3.6.8
- **Description**: Dense use of `execSync` for CLI integration. Most commands are hardcoded npx calls, but the volume increases attack surface if any path or config value is ever user-controlled.

#### SEC-078-006 [HIGH] execSync in pretrain-bridge.ts, trajectory-bridge.ts, model-router-bridge.ts

- **CWE**: CWE-78
- **Severity**: High
- **File**: `v3/src/adapters/claude-flow/pretrain-bridge.ts` (6 calls), `trajectory-bridge.ts` (6 calls), `model-router-bridge.ts` (4 calls)
- **Status**: Carried over from v3.6.8
- **Description**: Bridge adapters use `execSync` to invoke CLI tools. Commands appear to be hardcoded, but the pattern is fragile and bypasses the validated command-executor.ts safeguards.

**Total execSync/exec/spawn occurrences**: 268 across 95 TypeScript files. Only command-executor.ts and chaos-engineer.ts use command whitelisting.

---

### 2. Unsafe Deserialization (CWE-1321)

**SEC-002 Status from v3.6.8**: Migration to `safeJsonParse` continued. Now 329 `safeJsonParse` calls across 114 files (up from 25 files). However, 20 raw `JSON.parse` calls remain across 13 source files.

#### SEC-1321-001 [HIGH] Raw JSON.parse on file content in brain-exporter.ts

- **CWE**: CWE-1321
- **Severity**: High
- **File**: `v3/src/integrations/ruvector/brain-exporter.ts:121,317,781`
- **Status**: Carried over
- **Description**: `readJsonl` function uses raw `JSON.parse` on each line of JSONL files. If these files are sourced from external exports or untrusted origins, prototype pollution is possible. Line 317 and 781 parse manifest files without sanitization.

```typescript
// VULNERABLE: No prototype pollution protection
return content.split('\n').map(line => JSON.parse(line) as T);
```

#### SEC-1321-002 [MEDIUM] Raw JSON.parse on external file in rvf-native-adapter.ts

- **CWE**: CWE-1321
- **Severity**: Medium
- **File**: `v3/src/integrations/ruvector/rvf-native-adapter.ts:116`
- **Status**: Carried over
- **Description**: Parses an ID map file with raw `JSON.parse`. The file could be tampered with if stored in a shared or user-writable location.

#### SEC-1321-003 [MEDIUM] Raw JSON.parse on test runner output in task-executor.ts

- **CWE**: CWE-1321
- **Severity**: Medium
- **File**: `v3/src/coordination/task-executor.ts:1504`
- **Status**: Carried over
- **Description**: Parses stdout from a child process test runner. While exploitability is low, output from external processes should be treated as untrusted.

#### SEC-1321-004 [LOW] Raw JSON.parse on postgres sanitized content

- **CWE**: CWE-1321
- **Severity**: Low
- **File**: `v3/src/sync/cloud/postgres-writer.ts:358,390`
- **Status**: Carried over
- **Description**: Uses `JSON.parse` for validation only (result discarded), not for data consumption. Low risk but should use `safeJsonParse` for consistency.

**safeJsonParse adoption**: 329 calls across 114 files (up from 25). Progress is strong but 20 raw calls remain in 13 files. 7 of those are in documentation/comments, leaving ~13 actionable.

---

### 3. Weak Randomness (CWE-338)

**SEC-003 Status from v3.6.8**: Governance Math.random was fixed. The remaining count is 173 occurrences across 79 files (roughly stable from 170+).

#### SEC-338-001 [HIGH] Math.random for ID generation in production code

- **CWE**: CWE-338
- **Severity**: High
- **Files** (security-relevant ID generation):
  - `v3/src/workers/base-worker.ts:303` -- Worker ID generation
  - `v3/src/mcp/connection-pool.ts:364,391` -- Connection IDs
  - `v3/src/mcp/security/sampling-server.ts:567` -- Sampling request IDs
  - `v3/src/routing/routing-feedback.ts:229` -- Routing outcome IDs
  - `v3/src/coordination/consensus/consensus-engine.ts:628` -- Consensus IDs
  - `v3/src/adapters/a2a/tasks/task-manager.ts:114,115` -- Task and context IDs
  - `v3/src/adapters/a2a/notifications/subscription-store.ts:646` -- Subscription IDs
  - `v3/src/adapters/a2a/notifications/retry-queue.ts:225` -- Retry queue IDs
  - `v3/src/integrations/coherence/engines/witness-adapter.ts:208` -- Witness chain hash (mock)
- **Status**: Carried over from v3.6.8
- **Description**: `Math.random()` is used for generating identifiers in production code paths. While most are not cryptographic, predictable IDs in connection pools, task managers, and consensus engines can enable enumeration attacks or race conditions.
- **Remediation**: Replace with `crypto.randomUUID()` or the existing `generateSecureToken()` utility in `v3/src/mcp/security/validators/crypto-validator.ts`. Note: `token-tracker.ts` already has comments referencing this fix at lines 247 and 655.

#### SEC-338-002 [LOW] Math.random in ML/RL algorithms (ACCEPTABLE)

- **CWE**: CWE-338
- **Severity**: Low / Informational
- **Files**: 40+ occurrences in `rl-suite/`, `neural-optimizer/`, `optimization/`, `benchmarks/`
- **Status**: Acceptable
- **Description**: Math.random used for ML exploration (epsilon-greedy, weight initialization, sampling). This is standard practice and does not require cryptographic randomness.

#### SEC-338-003 [LOW] Math.random in simulation/test code (ACCEPTABLE)

- **CWE**: CWE-338
- **Severity**: Low / Informational
- **Files**: 30+ occurrences in `mcp/tools/test-execution/`, `domains/test-execution/`, `benchmarks/`, `validation/`
- **Status**: Acceptable
- **Description**: Used in mock executors, simulated test results, and benchmark data generation. Appropriate for non-production paths.

---

### 4. Authentication (CWE-287)

**SEC-004 Status from v3.6.8**: FIXED. The mock auth middleware now uses a whitelist approach.

#### SEC-287-001 [RESOLVED] Mock auth changed from blacklist to whitelist

- **CWE**: CWE-287
- **Severity**: Previously High, now Resolved
- **File**: `v3/src/adapters/a2a/auth/middleware.ts:455`
- **Status**: FIXED in v3.7.0
- **Description**: The `mockAuthMiddleware` function now explicitly checks for `test` or `development` environments via whitelist:

```typescript
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
  throw new Error(`mockAuthMiddleware is only available in test/development environments`);
}
```

This is a proper whitelist approach (only `test`/`development` allowed) rather than the v3.6.8 blacklist (`!== 'production'`). No remaining security concern.

---

### 5. SQL Injection (CWE-89)

#### SEC-089-001 [HIGH] Unvalidated table name interpolation in brain-exporter.ts

- **CWE**: CWE-89
- **Severity**: High
- **File**: `v3/src/integrations/ruvector/brain-exporter.ts:99,107`
- **Status**: Carried over
- **Description**: `countRows` and `queryAll` functions interpolate `table` parameter directly into SQL without using `validateTableName()`. The `table` parameter comes from caller code and could be manipulated.

```typescript
// VULNERABLE: table is not validated
const sql = `SELECT COUNT(*) as cnt FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
```

- **Remediation**: Wrap with `validateTableName(table)` from `v3/src/shared/sql-safety.ts`.

#### SEC-089-002 [MEDIUM] Interpolated identifiers in hypergraph-engine.ts

- **CWE**: CWE-89
- **Severity**: Medium
- **File**: `v3/src/integrations/ruvector/hypergraph-engine.ts:503,553`
- **Status**: Carried over
- **Description**: WHERE clause conditions are built dynamically. While values use parameterized queries (`?` placeholders), column names in conditions are interpolated without validation. The `conditions` array is built from internal logic but pattern is risky.

#### SEC-089-003 [MEDIUM] Dynamic SET clause in sqlite-persistence.ts

- **CWE**: CWE-89
- **Severity**: Medium
- **File**: `v3/src/learning/sqlite-persistence.ts:684`
- **Status**: Carried over
- **Description**: `setClauses` array is built from object keys and interpolated into UPDATE statement. Keys come from internal `updates` parameter but are not validated.

**Positive finding**: The codebase has a robust `sql-safety.ts` module with `validateTableName()` (allowlist of 36 tables) and `validateIdentifier()` (strict regex). These are used 37 times across 8 files. The sync layer (postgres-writer, postgres-reader, sqlite-writer, sqlite-reader) consistently uses these validators.

---

### 6. Credential Exposure (CWE-522)

**SEC-006 Status from v3.6.8**: Password redaction added. This fix held.

#### SEC-522-001 [LOW] Password in connection string (properly handled)

- **CWE**: CWE-522
- **Severity**: Low / Informational
- **File**: `v3/src/sync/cloud/tunnel-manager.ts:251-255`
- **Status**: Properly mitigated
- **Description**: The `getConnectionString()` method includes a password from `process.env.PGPASSWORD` in the connection string. However:
  - The method has a clear WARNING comment
  - A `getRedactedConnectionString()` alternative exists and is used for logging
  - The `redactPassword()` utility function masks passwords in URLs
  - Password comes from environment variable (not hardcoded)

#### SEC-522-002 [LOW] n8n apiKey in configuration types

- **CWE**: CWE-522
- **Severity**: Low
- **File**: `v3/src/integrations/n8n/types.ts:20,174,252`
- **Status**: Carried over
- **Description**: `apiKey` field exists in n8n configuration types. No hardcoded values found -- the key is expected to come from configuration at runtime. No credentials detected in source code.

**No hardcoded credentials found** in any source file. The codebase properly uses environment variables for sensitive configuration.

---

### 7. Path Traversal (CWE-22)

#### SEC-022-001 [MEDIUM] File operations without path validation

- **CWE**: CWE-22
- **Severity**: Medium
- **Files**: Multiple files use `path.join()` and `readFileSync()` without traversal checks
- **Status**: Partially mitigated
- **Description**: The codebase has a dedicated `PathTraversalValidator` at `v3/src/mcp/security/validators/path-traversal-validator.ts` with `validatePath()` and `normalizePath()` functions. The `shared/io/file-reader.ts` uses these validators. However, many other file operations in adapters, bridges, and init code directly use `readFileSync`/`writeFileSync` without traversal validation.
- **Mitigating factors**: Most file paths are internally constructed from known base directories. External user input to file paths is limited.
- **Remediation**: Apply `validatePath()` to all file operations that accept user-configurable paths.

---

### 8. Dependency Vulnerabilities

#### SEC-DEP-001 [HIGH] minimatch ReDoS (21 vulnerable paths)

- **CWE**: CWE-1333
- **Severity**: High (per npm audit)
- **Package**: `minimatch <10.2.1`
- **Advisory**: GHSA-3ppc-4f35-3m26
- **Status**: Active
- **Description**: 21 high-severity vulnerability paths through `minimatch` via `eslint`, `@typescript-eslint/*`, `glob`, `rimraf`, `cacache`, `node-gyp`, `sqlite3`, `agentdb`, `@claude-flow/memory`, `typedoc`, and `flat-cache`.
- **Remediation**: `npm audit fix --force` would install `eslint@10.x` (breaking change). Evaluate upgrading eslint or using overrides to force `minimatch>=10.2.1`.

**Note**: All 21 paths are development/build dependencies. No production-runtime dependency has this vulnerability.

---

### 9. Prototype Pollution

#### SEC-PP-001 [LOW] Well-defended -- no action needed

- **Severity**: Low / Informational
- **Status**: Well-defended
- **Description**: The codebase has comprehensive prototype pollution defenses:
  - `safeJsonParse()` in `v3/src/shared/safe-json.ts` strips `__proto__`, `constructor`, `prototype` keys
  - 6 files define `DANGEROUS_KEYS` / `DANGEROUS_PROPS` sets for object merge safety:
    - `v3/src/performance/optimizer.ts:55`
    - `v3/src/coordination/workflow-orchestrator.ts:317,580`
    - `v3/src/cli/utils/workflow-parser.ts:163`
    - `v3/src/cli/config/cli-config.ts:358`
    - `v3/src/domains/learning-optimization/services/metrics-optimizer.ts:45`
    - `v3/src/planning/plan-executor.ts:975`
    - `v3/src/planning/goap-planner.ts:169`
  - `safe-expression-evaluator.ts` blocks `__proto__` in expressions
  - Spread operator usage (`{ ...config }`) is limited to merging typed configuration objects (no raw user input merging detected)

---

### 10. ReDoS (CWE-1333)

**SEC-007 Status from v3.6.8**: markdown-it ReDoS fixed. New findings below.

#### SEC-1333-001 [MEDIUM] new RegExp from partially user-controlled patterns

- **CWE**: CWE-1333
- **Severity**: Medium
- **Files**:
  - `v3/src/domains/requirements-validation/services/requirements-validator.ts:470` -- User requirement terms turned into regex via `new RegExp(\`\\b${term}\\b\`, 'gi')`
  - `v3/src/domains/requirements-validation/services/product-factors-assessment/analyzers/brutal-honesty-analyzer.ts:303,324,345,367,423,452` -- Analysis patterns from config used in `new RegExp(check.pattern, 'gi')`
  - `v3/src/adapters/a2a/auth/routes.ts:698` -- Route patterns from configuration
  - `v3/src/mcp/http-server.ts:209` -- URL patterns
- **Status**: NEW
- **Description**: Multiple locations create `new RegExp()` from strings that may contain user-influenced content. If an attacker can control the pattern string, they can inject catastrophic backtracking patterns (e.g., `(a+)+$`).
- **Mitigating factor**: `v3/src/mcp/security/validators/regex-safety-validator.ts` exists (line 216) with safety validation. However, it is not applied at all `new RegExp()` call sites.
- **Remediation**: Run all user-influenced patterns through the existing `regex-safety-validator` before `new RegExp()` construction.

#### SEC-1333-002 [MEDIUM] Glob-to-regex conversion in memory-backend and worker-manager

- **CWE**: CWE-1333
- **Severity**: Medium
- **Files**:
  - `v3/src/kernel/memory-backend.ts:86` -- `new RegExp(pattern.replace(/\*/g, '.*'))`
  - `v3/src/workers/worker-manager.ts:80` -- Same pattern
  - `v3/src/cli/commands/hooks.ts:220` -- Same pattern
- **Status**: Carried over
- **Description**: Simple glob-to-regex conversion (`*` to `.*`) without anchoring or complexity limits. A pattern like `*a*a*a*a*a*a*` creates exponential backtracking on non-matching input.
- **Remediation**: Use anchored patterns (`^...$`), limit input length, or use a dedicated glob library.

---

## Summary Table

| ID | CWE | Severity | File | Description | Status |
|----|-----|----------|------|-------------|--------|
| SEC-078-001 | CWE-78 | **Critical** | task-executor.ts:1491 | testFiles interpolated into execSync | NEW |
| SEC-078-002 | CWE-78 | **Critical** | task-executor.ts:952 | coverageCmd via execSync with shell | Carried over |
| SEC-078-003 | CWE-78 | **Critical** | loc-counter.ts, test-counter.ts | 9 execSync calls with interpolation | Carried over |
| SEC-078-004 | CWE-78 | High | client.ts:1190 | pkill -9 -f with regex patterns | Carried over |
| SEC-078-005 | CWE-78 | High | claude-flow-adapter.ts | 17 execSync calls | Carried over |
| SEC-078-006 | CWE-78 | High | pretrain-bridge.ts et al. | 16 execSync calls across bridges | Carried over |
| SEC-1321-001 | CWE-1321 | High | brain-exporter.ts:121,317,781 | Raw JSON.parse on file content | Carried over |
| SEC-338-001 | CWE-338 | High | 9+ production files | Math.random for IDs | Carried over |
| SEC-089-001 | CWE-89 | High | brain-exporter.ts:99,107 | Unvalidated table names in SQL | Carried over |
| SEC-DEP-001 | CWE-1333 | High | minimatch <10.2.1 | 21 vulnerable dependency paths | Active |
| SEC-1321-002 | CWE-1321 | Medium | rvf-native-adapter.ts:116 | Raw JSON.parse on file | Carried over |
| SEC-1321-003 | CWE-1321 | Medium | task-executor.ts:1504 | Raw JSON.parse on process output | Carried over |
| SEC-089-002 | CWE-89 | Medium | hypergraph-engine.ts:503 | Dynamic conditions without validation | Carried over |
| SEC-089-003 | CWE-89 | Medium | sqlite-persistence.ts:684 | Dynamic SET clause from keys | Carried over |
| SEC-022-001 | CWE-22 | Medium | Multiple files | File ops without path validation | Partially mitigated |
| SEC-1333-001 | CWE-1333 | Medium | requirements-validator.ts:470 et al. | new RegExp from user patterns | NEW |
| SEC-1333-002 | CWE-1333 | Medium | memory-backend.ts:86 et al. | Unsafe glob-to-regex | Carried over |
| SEC-287-001 | CWE-287 | Resolved | middleware.ts:455 | Mock auth whitelist | FIXED |
| SEC-1321-004 | CWE-1321 | Low | postgres-writer.ts:358 | JSON.parse for validation only | Carried over |
| SEC-522-001 | CWE-522 | Low | tunnel-manager.ts:251 | Password in conn string (handled) | Maintained |
| SEC-522-002 | CWE-522 | Low | n8n/types.ts:20 | apiKey field in types | Carried over |
| SEC-PP-001 | -- | Low | Multiple files | Prototype pollution (well-defended) | Acceptable |
| SEC-338-002 | CWE-338 | Low | rl-suite/, neural-optimizer/ | Math.random in ML (acceptable) | Acceptable |
| SEC-338-003 | CWE-338 | Low | test-execution/, benchmarks/ | Math.random in simulation | Acceptable |

---

## Positive Security Findings

1. **safeJsonParse adoption**: 329 calls across 114 files (up from 25 in v3.6.8). Strong progress.
2. **SQL safety module**: `v3/src/shared/sql-safety.ts` with `validateTableName()` (36-table allowlist) and `validateIdentifier()` (strict regex) used 37 times across 8 sync/persistence files.
3. **Prototype pollution defense**: 7+ files define dangerous key sets. `safeJsonParse` strips pollution vectors.
4. **Path traversal validator**: Dedicated `PathTraversalValidator` with `validatePath()` and `normalizePath()` in MCP security layer.
5. **Command whitelist**: `chaos-engineer.ts` and `command-validator.ts` use command whitelists for shell execution.
6. **Safe expression evaluator**: `v3/src/shared/utils/safe-expression-evaluator.ts` avoids eval() entirely.
7. **Password redaction**: `tunnel-manager.ts` has `redactPassword()` and `getRedactedConnectionString()`.
8. **Regex safety validator**: `v3/src/mcp/security/validators/regex-safety-validator.ts` exists (needs broader adoption).
9. **No eval() usage**: Zero actual `eval()` calls in production code. All references are in scanner rules that detect eval.
10. **No hardcoded credentials**: No API keys, passwords, or tokens found in source code.

---

## Recommended Remediation Priority

### P0 -- Fix Immediately (Critical)

1. **SEC-078-001**: Replace `execSync` with `execFileSync` in task-executor.ts:1491. Use argument arrays instead of string interpolation for test file paths.
2. **SEC-078-003**: Refactor loc-counter.ts and test-counter.ts to use `execFileSync` with argument arrays instead of `execSync` with string concatenation.

### P1 -- Fix Before Next Release (High)

3. **SEC-078-002**: Validate `targetPath` and use `execFileSync` for coverage commands.
4. **SEC-1321-001**: Replace `JSON.parse` with `safeJsonParse` in brain-exporter.ts.
5. **SEC-338-001**: Replace `Math.random()` with `crypto.randomUUID()` for all ID generation in production code (9+ files identified). The `generateSecureToken()` utility already exists.
6. **SEC-089-001**: Add `validateTableName()` calls in brain-exporter.ts:99,107.
7. **SEC-DEP-001**: Evaluate eslint upgrade path or add `overrides` in package.json for `minimatch>=10.2.1`.

### P2 -- Fix in Next Sprint (Medium)

8. **SEC-1333-001**: Apply `regex-safety-validator` to all `new RegExp()` sites with user-influenced patterns.
9. **SEC-1333-002**: Replace glob-to-regex conversion with anchored patterns or a proper glob library.
10. **SEC-089-002,003**: Validate column names in hypergraph-engine.ts and sqlite-persistence.ts.
11. **SEC-022-001**: Expand `validatePath()` usage to adapter and init file operations.

### P3 -- Track (Low)

12. Remaining raw `JSON.parse` calls on internal data (postgres-writer validation, plan-executor clone).
13. Bridge adapter execSync consolidation into a single validated executor pattern.

---

## Metrics

| Metric | Value |
|--------|-------|
| Files scanned | ~500+ TypeScript files in v3/src |
| Total execSync/exec/spawn calls | 268 across 95 files |
| Raw JSON.parse calls | 20 across 13 files |
| safeJsonParse calls | 329 across 114 files |
| Math.random occurrences | 173 across 79 files |
| validateTableName/validateIdentifier calls | 37 across 8 files |
| new RegExp() from dynamic input | 60+ across 30+ files |
| Dependency vulnerabilities (npm audit) | 21 high |
| Prototype pollution defenses | 7+ files with DANGEROUS_KEYS |
| Hardcoded credentials found | 0 |

---

*Report generated by QE Security Scanner (Claude Opus 4.6 SAST) on 2026-02-23*
