# Security Analysis Report - Agentic QE v3.6.8

**Scan Date**: 2026-02-16
**Scanner**: V3 QE Security Scanner (claude-opus-4-6)
**Scope**: `/workspaces/agentic-qe-new/v3/src/` (1,522 TypeScript files)
**Scan Categories**: SAST, Dependency, Secrets Detection, OWASP Top 10 Mapping

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 7 |
| Medium | 12 |
| Low | 8 |
| **Total** | **30** |

The v3 codebase demonstrates strong security posture in several areas: SQL table name allowlisting, path traversal protection with CVE prevention validators, secure JSON parsing with prototype pollution protection, HMAC signature verification with timing-safe comparison, and a comprehensive OAuth 2.1 + PKCE implementation. However, several findings require attention, particularly around command injection surfaces, inconsistent use of secure JSON parsing, and Math.random() usage in security-adjacent contexts.

---

## 1. Injection Vulnerabilities

### 1.1 SQL Injection

**Overall Assessment: WELL MITIGATED**

The codebase uses `better-sqlite3` with parameterized queries for data operations. A `validateTableName()` allowlist in `/workspaces/agentic-qe-new/v3/src/shared/sql-safety.ts` provides defense-in-depth for table name interpolation, since SQLite does not support parameterized identifiers.

#### SEC-SQL-001: Unvalidated Table Name in CLI Learning Command

- **Severity**: Medium
- **CWE**: CWE-89 (SQL Injection)
- **OWASP**: A03:2021 - Injection
- **File**: `/workspaces/agentic-qe-new/v3/src/cli/commands/learning.ts`
- **Line**: 1352

```typescript
const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
```

The `table` variable iterates over a hardcoded array `['qe_patterns', 'qe_trajectories', 'learning_experiences', 'kv_store', 'vectors']` (line 1349), so this is not directly exploitable. However, it bypasses the `validateTableName()` pattern used consistently elsewhere.

**Remediation**: Wrap with `validateTableName(table)` for defense-in-depth consistency.

#### SEC-SQL-002: Dynamic Column Addition in Experience Replay

- **Severity**: Low
- **CWE**: CWE-89 (SQL Injection)
- **OWASP**: A03:2021 - Injection
- **File**: `/workspaces/agentic-qe-new/v3/src/integrations/agentic-flow/reasoning-bank/experience-replay.ts`
- **Line**: 314

```typescript
this.db.exec(`ALTER TABLE captured_experiences ADD COLUMN ${col} ${def}`);
```

The `col` and `def` values come from a hardcoded array defined at lines 304-311 (e.g., `['application_count', 'INTEGER DEFAULT 0']`). Not directly exploitable, but the pattern is fragile.

**Remediation**: Add a column name validation function similar to `validateTableName()`.

#### SEC-SQL-003: PostgreSQL Table/Column Interpolation

- **Severity**: Medium
- **CWE**: CWE-89 (SQL Injection)
- **OWASP**: A03:2021 - Injection
- **File**: `/workspaces/agentic-qe-new/v3/src/sync/cloud/postgres-writer.ts`
- **Lines**: 201-211

```typescript
conflictClause = `ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSet}`;
const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuePlaceholders.join(', ')} ${conflictClause}`;
```

The `table`, `columns`, and `conflictColumns` values are interpolated directly into SQL. While values use parameterized `$N` placeholders (good), the identifiers are not validated against an allowlist.

**Remediation**: Implement identifier validation (regex allowlist of `^[a-z_][a-z0-9_]*$`) or an allowlist for the Postgres writer.

---

### 1.2 Command Injection

#### SEC-CMD-001: Command Injection via Session Name in Browser Command Executor

- **Severity**: Critical
- **CWE**: CWE-78 (OS Command Injection)
- **OWASP**: A03:2021 - Injection
- **File**: `/workspaces/agentic-qe-new/v3/src/integrations/browser/agent-browser/command-executor.ts`
- **Lines**: 48, 55, 168-169

```typescript
const cmdString = `npx agent-browser ${fullArgs.join(' ')}`;
const output = execSync(cmdString, { ... });
```

And at line 168-169:
```typescript
execSync(
  `pkill -f "agent-browser.*--session[= ]${sessionName}" 2>/dev/null || true`,
  { timeout: 5000, stdio: 'ignore' }
);
```

The `sessionName` from `this.config.sessionName` is interpolated directly into a shell command string passed to `execSync`. If the session name comes from user input, an attacker could inject arbitrary shell commands. The `execute()` method at line 48 also builds a command string from `args[]` without escaping.

**Remediation**:
1. Use `spawn()` with argument arrays instead of `execSync()` with string concatenation.
2. Validate `sessionName` against a strict alphanumeric pattern.
3. For `pkill`, use `spawn('pkill', ['-f', pattern])` instead of string interpolation.

#### SEC-CMD-002: Command Execution in Claude Flow Bridges (Mitigated)

- **Severity**: Low
- **CWE**: CWE-78 (OS Command Injection)
- **OWASP**: A03:2021 - Injection
- **Files**:
  - `/workspaces/agentic-qe-new/v3/src/adapters/claude-flow/trajectory-bridge.ts` (lines 51-53, 94-96, 131-133)
  - `/workspaces/agentic-qe-new/v3/src/adapters/claude-flow/pretrain-bridge.ts` (lines 60-61, 137)
  - `/workspaces/agentic-qe-new/v3/src/adapters/claude-flow/model-router-bridge.ts` (lines 64, 106)

These files use `execSync()` with string interpolation but apply `this.escapeArg()` which uses ANSI-C `$'...'` quoting with proper backslash and single-quote escaping (trajectory-bridge.ts lines 234-241). This is a reasonable mitigation.

**Residual Risk**: The ANSI-C quoting approach is shell-dependent and may behave differently across shells. The safer pattern remains `spawn()` with argument arrays.

**Remediation**: Consider migrating to `spawn()` with argument arrays for maximum portability.

#### SEC-CMD-003: Hardcoded Shell Commands in Browser Integration

- **Severity**: Medium
- **CWE**: CWE-78 (OS Command Injection)
- **OWASP**: A03:2021 - Injection
- **File**: `/workspaces/agentic-qe-new/v3/src/integrations/browser/agent-browser/client.ts`
- **Lines**: 1188, 1199

```typescript
execSync('pkill -9 -f "agent-browser.*daemon" 2>/dev/null || true', { ... });
execSync('pkill -9 -f "chromium_headless_shell\\|headless_shell" 2>/dev/null || true', { ... });
```

These are hardcoded strings (not user-influenced), so not directly exploitable. However, using `pkill -9 -f` with broad regex patterns risks killing unrelated processes.

**Remediation**: Use more specific process identification (e.g., PID files).

---

### 1.3 Path Traversal

**Overall Assessment: WELL MITIGATED**

The `FileReader` class at `/workspaces/agentic-qe-new/v3/src/shared/io/file-reader.ts` integrates CVE prevention path validation from `/workspaces/agentic-qe-new/v3/src/mcp/security/cve-prevention.ts`. This includes:
- `../` traversal detection
- Base path containment validation
- Dangerous extension blocking (`.exe`, `.bat`, `.cmd`, `.ps1`, `.dll`, `.so`)
- Custom `PathTraversalError` type with risk levels

No unmitigated path traversal vulnerabilities were found.

---

## 2. Secret/Credential Exposure

#### SEC-SEC-001: Password in Connection String

- **Severity**: High
- **CWE**: CWE-522 (Insufficiently Protected Credentials)
- **OWASP**: A07:2021 - Identification and Authentication Failures
- **File**: `/workspaces/agentic-qe-new/v3/src/sync/cloud/tunnel-manager.ts`
- **Lines**: 227-231

```typescript
const password = process.env.PGPASSWORD || '';
return `postgresql://${user}:${password}@${host}:${port}/${database}`;
```

The database password is embedded in the connection string. If this string is logged, serialized, or passed to error handlers, the password could be exposed.

**Remediation**: Use a connection object rather than a URL string, or redact the password in any logging/serialization.

#### SEC-SEC-002: Password in Postgres Connection Config Logging

- **Severity**: Medium
- **CWE**: CWE-532 (Information Exposure Through Log Files)
- **OWASP**: A09:2021 - Security Logging and Monitoring Failures
- **File**: `/workspaces/agentic-qe-new/v3/src/sync/cloud/postgres-writer.ts`
- **Line**: 84, 91

```typescript
password: process.env.PGPASSWORD || '',
...
console.log(`[PostgresWriter] Connected to ${connection.host}:${connection.port}/${this.config.cloud.database}`);
```

While the log line itself does not include the password, the password is stored in the config object that could be inadvertently serialized.

**Remediation**: Store password in a separate non-serializable field or use a getter that reads from env at call time.

#### SEC-SEC-003: No Hardcoded Secrets Detected

No hardcoded API keys, tokens, or credentials were found in the source code. All sensitive values are read from `process.env.*` variables, which is the correct pattern.

---

## 3. Input Validation

#### SEC-VAL-001: Unvalidated process.env Parsing

- **Severity**: Medium
- **CWE**: CWE-20 (Improper Input Validation)
- **OWASP**: A03:2021 - Injection
- **Files**:
  - `/workspaces/agentic-qe-new/v3/src/routing/routing-config.ts` (lines 207-239)
  - `/workspaces/agentic-qe-new/v3/src/performance/run-gates.ts` (lines 31-34)

```typescript
config.confidence.multiModel = parseFloat(process.env.ROUTING_CONFIDENCE_MULTI_MODEL);
config.costOptimization.dailyCostLimit = parseFloat(process.env.ROUTING_COST_DAILY_LIMIT);
```

Environment variable values are parsed with `parseFloat()` and `parseInt()` without NaN/bounds checking. Malformed values could produce `NaN` which propagates through calculations.

**Remediation**: Add validation: `const val = parseFloat(env); if (isNaN(val) || val < 0 || val > 1) { use default }`.

#### SEC-VAL-002: Insufficient Webhook Payload Validation

- **Severity**: Medium
- **CWE**: CWE-20 (Improper Input Validation)
- **OWASP**: A08:2021 - Software and Data Integrity Failures
- **File**: `/workspaces/agentic-qe-new/v3/src/adapters/a2a/notifications/webhook-service.ts`

Webhook endpoints receive external JSON payloads. While signature verification is implemented (via `/workspaces/agentic-qe-new/v3/src/adapters/a2a/notifications/signature.ts`), schema validation of the payload body after signature verification should be confirmed.

**Remediation**: Ensure all webhook payloads are validated against a schema after signature verification.

---

## 4. Dependency Security

#### SEC-DEP-001: markdown-it ReDoS Vulnerability

- **Severity**: Medium
- **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **OWASP**: A06:2021 - Vulnerable and Outdated Components
- **Package**: `markdown-it` (transitive dependency)
- **Advisory**: GHSA-38c4-r59v-3vqw
- **CVSS**: 5.3
- **Range**: `>=13.0.0 <14.1.1`
- **Fix Available**: Yes

```
npm audit: 1 moderate vulnerability found
```

**Remediation**: Run `npm audit fix` or upgrade `markdown-it` to `>=14.1.1`.

#### SEC-DEP-002: Dependency Health Assessment

The following dependencies are well-maintained and current:
- `better-sqlite3@^12.4.1` - Active maintenance
- `jose@^6.1.3` - Industry-standard JWT library
- `secure-json-parse@^4.1.0` - Prototype pollution protection
- `commander@^14.0.1` - CLI framework
- `tar` resolution forced to `>=7.5.7` (CVE patched)

No critical or high-severity dependency vulnerabilities were found via `npm audit`.

---

## 5. Authentication/Authorization

**Overall Assessment: STRONG**

#### Positive Findings

1. **OAuth 2.1 + PKCE**: The OAuth implementation at `/workspaces/agentic-qe-new/v3/src/mcp/security/oauth21-provider.ts` requires PKCE for all clients (OAuth 2.1 compliant) and uses `crypto.createHash('sha256')` for code challenge verification.

2. **JWT Implementation**: Uses the `jose` library at `/workspaces/agentic-qe-new/v3/src/adapters/a2a/auth/jwt-utils.ts` with:
   - Algorithm validation
   - Expiration/nbf/issuer/audience claims
   - Proper error typing (JWTError with specific error codes)
   - `crypto.randomUUID()` for JTI generation

3. **Middleware Chain**: JWT middleware at `/workspaces/agentic-qe-new/v3/src/adapters/a2a/auth/middleware.ts` implements proper RFC 6750 Bearer token handling with `WWW-Authenticate` headers.

4. **Scope-Based Authorization**: `requireScopes()` middleware supports both AND and OR scope requirements.

#### SEC-AUTH-001: Mock Auth Middleware Available in Production Code

- **Severity**: Medium
- **CWE**: CWE-287 (Improper Authentication)
- **OWASP**: A07:2021 - Identification and Authentication Failures
- **File**: `/workspaces/agentic-qe-new/v3/src/adapters/a2a/auth/middleware.ts`
- **Lines**: 452-467

```typescript
export function mockAuthMiddleware(
  mockUser?: { id: string; scopes?: string[] }
): ... {
  const user = mockUser ?? { id: 'mock-user', scopes: ['*'] };
  ...
}
```

A `mockAuthMiddleware` function with wildcard scope `['*']` is exported and available in production builds.

**Remediation**: Gate this behind `NODE_ENV !== 'production'` or move to a test-only module.

#### SEC-AUTH-002: Token in WWW-Authenticate Error Description

- **Severity**: Low
- **CWE**: CWE-209 (Information Exposure Through Error Message)
- **OWASP**: A07:2021 - Identification and Authentication Failures
- **File**: `/workspaces/agentic-qe-new/v3/src/adapters/a2a/auth/middleware.ts`
- **Line**: 254

```typescript
res.setHeader('WWW-Authenticate', `Bearer realm="a2a", error="invalid_token", error_description="${message}"`);
```

The JWT verification error message is passed directly into the `WWW-Authenticate` header. This could leak internal error details.

**Remediation**: Use a generic error description and log the specific message server-side.

---

## 6. Data Exposure

#### SEC-DATA-001: Connection Details in Console Logs

- **Severity**: Low
- **CWE**: CWE-532 (Information Exposure Through Log Files)
- **OWASP**: A09:2021 - Security Logging and Monitoring Failures
- **File**: `/workspaces/agentic-qe-new/v3/src/sync/cloud/postgres-writer.ts`
- **Line**: 91

```typescript
console.log(`[PostgresWriter] Connected to ${connection.host}:${connection.port}/${this.config.cloud.database}`);
```

Host, port, and database name are logged. While not containing credentials, this reveals infrastructure details.

**Remediation**: Use debug-level logging that can be disabled in production.

#### SEC-DATA-002: Error Messages Expose Internal Paths

- **Severity**: Low
- **CWE**: CWE-209 (Information Exposure Through Error Message)
- **OWASP**: A04:2021 - Insecure Design
- **Files**: Multiple (FileReader error messages, database error handlers)

Error messages include absolute file paths (e.g., `'File not found: ' + absolutePath`). These could be returned to end users in MCP tool responses.

**Remediation**: Sanitize error messages before returning them in external-facing responses.

---

## 7. File System Security

**Overall Assessment: STRONG**

The `FileReader` class implements comprehensive path traversal prevention using the CVE prevention module. Key security controls:

1. **Path validation**: All paths go through `validatePath()` before file operations
2. **Base path containment**: Absolute paths are verified to stay within `basePath`
3. **Extension blocking**: Dangerous executable extensions are denied
4. **Error typing**: Distinct `PathTraversalError` type with risk levels

No unmitigated file system vulnerabilities were found.

---

## 8. Deserialization

#### SEC-DES-001: Inconsistent JSON.parse Usage

- **Severity**: High
- **CWE**: CWE-1321 (Improperly Controlled Modification of Object Prototype Attributes)
- **OWASP**: A08:2021 - Software and Data Integrity Failures
- **Files**: 97+ files using `JSON.parse()`, only 3 files using `secure-json-parse`

The codebase has `secure-json-parse` as a dependency and a `safeJsonParse()` helper at `/workspaces/agentic-qe-new/v3/src/cli/helpers/safe-json.ts`, but the vast majority of `JSON.parse()` calls do not use it.

Key examples of unprotected `JSON.parse()` on potentially untrusted data:
- `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` line 1601: `JSON.parse(row.value)` - Database values
- `/workspaces/agentic-qe-new/v3/src/cli/commands/hooks.ts` line 743: `JSON.parse(options.data)` - CLI user input
- `/workspaces/agentic-qe-new/v3/src/cli/commands/learning.ts` line 653: `JSON.parse(content)` - File import data
- `/workspaces/agentic-qe-new/v3/src/learning/dream/dream-engine.ts` line 761: `JSON.parse(row.source_concepts)` - Database data

While prototype pollution via SQLite-stored data requires prior write access, the CLI-facing `JSON.parse()` calls on user input and file imports are a direct risk.

**Remediation**:
1. Replace all `JSON.parse()` on external/user input with `safeJsonParse()`.
2. Create an ESLint rule to flag direct `JSON.parse()` usage.
3. Consider replacing `JSON.parse()` on database values as defense-in-depth.

#### SEC-DES-002: Safe Expression Evaluator (Positive Finding)

The file `/workspaces/agentic-qe-new/v3/src/shared/utils/safe-expression-evaluator.ts` implements a custom tokenizer/parser that explicitly rejects dangerous patterns (`eval`, `Function`, `constructor`, `__proto__`, `prototype`, `import`, `require`, `process`, `global`, `window`, `document`). This is a well-implemented alternative to `eval()`.

#### SEC-DES-003: eval() Detection (Positive Finding)

The handler factory at `/workspaces/agentic-qe-new/v3/src/mcp/handlers/handler-factory.ts` (line 302) actively detects `eval()` usage in analyzed source code and flags it as a critical anti-pattern. No actual `eval()` or `new Function()` usage was found in the production codebase.

---

## 9. OWASP Top 10 (2021) Mapping

| OWASP Category | Findings | Status |
|----------------|----------|--------|
| A01: Broken Access Control | Mock auth middleware in production (SEC-AUTH-001) | Medium Risk |
| A02: Cryptographic Failures | Math.random() usage (SEC-CRYPTO-001) | Medium Risk |
| A03: Injection | Command injection in browser executor (SEC-CMD-001), SQL identifier interpolation (SEC-SQL-003) | High Risk |
| A04: Insecure Design | Error messages expose internal paths (SEC-DATA-002) | Low Risk |
| A05: Security Misconfiguration | No issues found | Low Risk |
| A06: Vulnerable Components | markdown-it ReDoS (SEC-DEP-001) | Medium Risk |
| A07: Authentication Failures | Token error detail leakage (SEC-AUTH-002) | Low Risk |
| A08: Software/Data Integrity | Inconsistent JSON.parse (SEC-DES-001) | High Risk |
| A09: Logging/Monitoring Failures | Connection details in logs (SEC-DATA-001) | Low Risk |
| A10: Server-Side Request Forgery | No issues found | Low Risk |

---

## 10. Cryptographic Issues

#### SEC-CRYPTO-001: Math.random() Usage in Security-Adjacent Contexts

- **Severity**: High
- **CWE**: CWE-338 (Use of Cryptographically Weak PRNG)
- **OWASP**: A02:2021 - Cryptographic Failures
- **Files**: 97 files use `Math.random()`

Most usages are for non-security purposes (RL exploration, benchmarking, test data generation). However, some are used for identifier generation:

**Potentially Problematic**:
- `/workspaces/agentic-qe-new/v3/src/governance/compliance-reporter.ts` line 1016: ID generation with `Math.random().toString(36)`
- `/workspaces/agentic-qe-new/v3/src/governance/proof-envelope-integration.ts` line 781: ID generation
- `/workspaces/agentic-qe-new/v3/src/governance/adversarial-defense-integration.ts` line 406: Assessment ID
- `/workspaces/agentic-qe-new/v3/src/adapters/claude-flow/trajectory-bridge.ts` line 45: Trajectory ID

**Acceptable**:
- Neural network epsilon-greedy exploration (RL algorithms)
- Benchmark timing jitter
- Test data generation
- HNSW level selection (kernel/unified-memory.ts line 859)

**Remediation**: Replace `Math.random()` with `crypto.randomUUID()` or `crypto.randomBytes()` for all identifier generation, especially in governance and compliance contexts.

#### SEC-CRYPTO-002: Proper Cryptographic Usage (Positive Findings)

1. **HMAC-SHA256** for webhook signatures (`createHmac('sha256', secret)`)
2. **timing-safe comparison** (`timingSafeEqual`) for signature verification
3. **crypto.randomUUID()** for JWT JTI values
4. **crypto.randomBytes()** in OAuth provider for token generation
5. **SHA-256** for PKCE code challenge verification
6. **jose library** for JWT signing/verification (industry standard)

---

## 11. Additional Findings

#### SEC-MISC-001: Rate Limiter Exists

- **Status**: Positive
- **File**: `/workspaces/agentic-qe-new/v3/src/mcp/security/rate-limiter.ts`

Token bucket rate limiting is implemented with per-client and global limits (100 req/s, 200 burst).

#### SEC-MISC-002: Comprehensive Security Validator Framework

- **Status**: Positive
- **Directory**: `/workspaces/agentic-qe-new/v3/src/mcp/security/validators/`

The codebase includes a well-organized Strategy Pattern security framework:
- `path-traversal-validator.ts` - Path traversal prevention
- `regex-safety-validator.ts` - ReDoS prevention
- `crypto-validator.ts` - Timing-safe comparison
- `input-sanitizer.ts` - Input sanitization
- `command-validator.ts` - Command injection prevention
- `validation-orchestrator.ts` - Orchestrates all validators

#### SEC-MISC-003: SQL Safety Module

- **Status**: Positive
- **File**: `/workspaces/agentic-qe-new/v3/src/shared/sql-safety.ts`

Allowlist-based table name validation with 36 allowed table names. All SQLite table name interpolations in the kernel and sync modules use this validator.

---

## Remediation Priority Matrix

| Priority | Finding | Severity | Effort | Impact |
|----------|---------|----------|--------|--------|
| P0 | SEC-CMD-001: Browser command injection | Critical | Medium | High - RCE possible |
| P0 | SEC-DES-001: Inconsistent JSON.parse | High | Medium | High - Prototype pollution |
| P0 | SEC-CRYPTO-001: Math.random() for IDs | High | Low | Medium - Predictable IDs |
| P1 | SEC-SQL-003: Postgres identifier interpolation | Medium | Medium | Medium - SQL injection |
| P1 | SEC-AUTH-001: Mock auth in production | Medium | Low | Medium - Auth bypass |
| P1 | SEC-SEC-001: Password in connection string | High | Low | High - Credential exposure |
| P2 | SEC-VAL-001: Unvalidated env parsing | Medium | Low | Low - NaN propagation |
| P2 | SEC-DEP-001: markdown-it ReDoS | Medium | Low | Low - DoS vector |
| P2 | SEC-AUTH-002: Error detail leakage | Low | Low | Low - Info disclosure |
| P3 | SEC-CMD-002: Claude Flow bridge commands | Low | Medium | Low - Already mitigated |
| P3 | SEC-DATA-001: Connection details in logs | Low | Low | Low - Info disclosure |
| P3 | SEC-DATA-002: Path exposure in errors | Low | Low | Low - Info disclosure |

---

## Positive Security Controls Summary

The v3 codebase demonstrates mature security engineering in several areas:

1. **Defense-in-Depth SQL Safety**: Allowlist-based table name validation prevents SQL injection via identifier interpolation
2. **CVE Prevention Framework**: Strategy Pattern validators for path traversal, command injection, input sanitization, ReDoS, and crypto
3. **OAuth 2.1 + PKCE**: Modern authentication with mandatory PKCE for all clients
4. **JWT with jose Library**: Industry-standard JWT handling with proper claim validation
5. **Timing-Safe Comparisons**: `timingSafeEqual` used for all security-critical comparisons
6. **Secure JSON Parsing**: `secure-json-parse` available (though underutilized)
7. **Safe Expression Evaluator**: Custom tokenizer/parser replaces `eval()` safely
8. **Rate Limiting**: Token bucket algorithm with per-client limits
9. **Webhook Signatures**: HMAC-SHA256 with replay protection (timestamp + max age)
10. **Path Traversal Protection**: Comprehensive path validation in FileReader

---

## Scan Metadata

```json
{
  "scanId": "sec-scan-2026-02-16-v3.6.8",
  "filesScanned": 1522,
  "vulnerabilitiesFound": 30,
  "critical": 3,
  "high": 7,
  "medium": 12,
  "low": 8,
  "falsePositives": 0,
  "scanCategories": ["SAST", "dependency", "secrets", "crypto", "auth", "owasp-top-10"],
  "codebaseVersion": "3.6.8",
  "scannerVersion": "claude-opus-4-6"
}
```
