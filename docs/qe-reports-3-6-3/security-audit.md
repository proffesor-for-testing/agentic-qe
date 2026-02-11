# Security Audit Report - Agentic QE v3.6.3

**Scan Date:** 2026-02-11
**Scanner:** V3 QE Security Scanner (claude-opus-4-6)
**Scope:** `/workspaces/agentic-qe-new/v3/src/` (all TypeScript source and configuration)
**Scan Type:** SAST + Dependency + Secrets + Auth/Authz Review

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| **Critical** | 2 | Requires immediate remediation |
| **High** | 5 | Requires remediation before next release |
| **Medium** | 8 | Should be addressed in next sprint |
| **Low** | 6 | Informational / best-practice improvements |
| **Total** | **21** | |

The Agentic QE v3.6.3 codebase demonstrates a **mature security posture** with dedicated security modules (OAuth 2.1, CVE prevention, input sanitization, rate limiting, ReDoS protection, prototype pollution guards). The security middleware framework in `src/mcp/security/` is well-designed and follows the Strategy Pattern with proper separation of concerns.

However, the audit identified **2 critical** and **5 high** severity findings that require attention, primarily related to SQL injection via string interpolation in SQLite operations, and hardcoded cloud infrastructure defaults.

---

## 1. SAST Findings

### CRITICAL-01: SQL Injection via String Interpolation in SQLite Operations (CWE-89)

**Severity:** CRITICAL
**OWASP:** A03:2021 - Injection
**CWE:** CWE-89 (SQL Injection)

Multiple locations use string interpolation to construct SQL statements with `better-sqlite3`, bypassing parameterized query protections. While the table names come from internal hardcoded arrays (not user input), this pattern is dangerous if the data flow changes and constitutes a defense-in-depth violation.

**Affected Files:**

| File | Line | Pattern |
|------|------|---------|
| `v3/src/kernel/unified-memory.ts` | 1230 | `` PRAGMA table_info(${tableName}) `` |
| `v3/src/kernel/unified-memory.ts` | 1272 | `` DROP TABLE IF EXISTS ${table} `` |
| `v3/src/kernel/unified-memory.ts` | 1918 | `` SELECT COUNT(*) as count FROM ${name} `` |
| `v3/src/kernel/unified-memory-migration.ts` | 136 | `` SELECT COUNT(*) as count FROM ${tableName} `` |
| `v3/src/kernel/unified-memory-migration.ts` | 159 | `` SELECT * FROM ${tableName} `` |
| `v3/src/kernel/unified-memory-migration.ts` | 165 | `` INSERT OR REPLACE INTO ${tableName} `` |
| `v3/src/sync/readers/sqlite-reader.ts` | 86 | `` SELECT * FROM ${this.getTableName()} `` |
| `v3/src/sync/readers/sqlite-reader.ts` | 128 | `` SELECT * FROM ${tableName} WHERE ... `` |
| `v3/src/sync/readers/sqlite-reader.ts` | 155 | `` SELECT COUNT(*) as count FROM ${tableName} `` |
| `v3/src/sync/readers/sqlite-reader.ts` | 220 | `` PRAGMA table_info(${tableName}) `` |
| `v3/src/sync/embeddings/sync-embedding-generator.ts` | 137 | `` PRAGMA table_info(${tableName}) `` |
| `v3/src/sync/embeddings/sync-embedding-generator.ts` | 148-149 | `` SELECT * FROM ${tableName} `` |
| `v3/src/sync/cloud/postgres-writer.ts` | 209 | `` INSERT INTO ${table} `` |
| `v3/src/cli/commands/learning.ts` | 1351 | `` SELECT COUNT(*) as count FROM ${table} `` |

**Risk Assessment:** Currently the table names originate from internal code (hardcoded arrays in `unified-memory-migration.ts` lines 108-122, internal config in sync). However, SQLite does not support parameterized identifiers, so the mitigation must be an allowlist check.

**Remediation:**
```typescript
// BEFORE (vulnerable pattern):
this.db.prepare(`PRAGMA table_info(${tableName})`).all();
this.db.exec(`DROP TABLE IF EXISTS ${table}`);

// AFTER (safe pattern - allowlist validation):
const ALLOWED_TABLES = new Set([
  'kv_store', 'vectors', 'rl_q_values', 'goap_actions',
  'goap_goals', 'goap_plans', 'goap_plan_signatures',
  'goap_execution_steps', 'dream_cycles', 'dream_insights',
  'concept_nodes', 'concept_edges', 'qe_patterns',
  'schema_version', 'mincut_graphs', 'hypergraph_nodes',
  'hypergraph_edges', 'sona_patterns',
]);

function validateTableName(name: string): string {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  // Also reject any non-alphanumeric/underscore characters
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Table name contains invalid characters: ${name}`);
  }
  return name;
}

this.db.prepare(`PRAGMA table_info(${validateTableName(tableName)})`).all();
```

---

### CRITICAL-02: Hardcoded Cloud Infrastructure Defaults with Identifiable Project IDs (CWE-798)

**Severity:** CRITICAL
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-798 (Use of Hard-coded Credentials)

The sync configuration contains hardcoded GCP project identifiers and database credentials as fallback defaults. While they are overridable via environment variables, the defaults expose production infrastructure details.

**Affected File:** `v3/src/sync/interfaces.ts` (lines 359-364)

```typescript
cloud: {
  project: process.env.GCP_PROJECT || 'ferrous-griffin-480616-s9',  // Real GCP project ID
  zone: process.env.GCP_ZONE || 'us-central1-a',
  instance: process.env.GCP_INSTANCE || 'ruvector-postgres',       // Real instance name
  database: process.env.GCP_DATABASE || 'aqe_learning',
  user: process.env.GCP_USER || 'ruvector',                        // Real database username
  tunnelPort: parseInt(process.env.GCP_TUNNEL_PORT || '15432', 10),
},
```

**Remediation:** Remove hardcoded defaults. Require environment variables or configuration file:
```typescript
cloud: {
  project: process.env.GCP_PROJECT || '',
  zone: process.env.GCP_ZONE || '',
  instance: process.env.GCP_INSTANCE || '',
  database: process.env.GCP_DATABASE || '',
  user: process.env.GCP_USER || '',
  tunnelPort: parseInt(process.env.GCP_TUNNEL_PORT || '15432', 10),
},
```

---

### HIGH-01: Potential ReDoS via Unvalidated `new RegExp()` from External Input (CWE-1333)

**Severity:** HIGH
**OWASP:** A03:2021 - Injection
**CWE:** CWE-1333 (Inefficient Regular Expression Complexity)

Multiple locations construct `new RegExp()` from configuration or semi-trusted input without passing through the `RegexSafetyValidator`. While the project has a dedicated ReDoS prevention module (`src/mcp/security/validators/regex-safety-validator.ts`), it is not consistently used across the codebase.

**Affected Files (sampling):**

| File | Line | Source of Pattern |
|------|------|-------------------|
| `v3/src/mcp/security/rate-limiter.ts` | 357, 372 | `EndpointRateLimit.pattern` (config-driven) |
| `v3/src/mcp/security/schema-validator.ts` | 493 | `schema.pattern` (schema-driven) |
| `v3/src/governance/deterministic-gateway-integration.ts` | 442 | `schema.pattern` |
| `v3/src/validation/parallel-eval-runner.ts` | 494, 504, 513 | Eval patterns |
| `v3/src/kernel/memory-backend.ts` | 86 | Wildcard-to-regex conversion |
| `v3/src/adapters/a2a/auth/routes.ts` | 698 | Route pattern matching |
| `v3/src/mcp/http-server.ts` | 208 | HTTP route patterns |
| `v3/src/coordination/cross-domain-router.ts` | 421 | Domain routing patterns |

**Remediation:** Wrap all `new RegExp()` calls with the existing `createSafeRegex()` from the regex-safety-validator, or add a timeout-based safeguard:
```typescript
import { createSafeRegex } from '../security/validators/regex-safety-validator';

// BEFORE:
const regex = new RegExp(pattern, 'i');

// AFTER:
const regex = createSafeRegex(pattern, 'i');
if (!regex) {
  throw new Error(`Unsafe regex pattern rejected: ${pattern}`);
}
```

---

### HIGH-02: Unprotected JSON.parse Usage Without Prototype Pollution Guards (CWE-1321)

**Severity:** HIGH
**OWASP:** A08:2021 - Software and Data Integrity Failures
**CWE:** CWE-1321 (Improperly Controlled Modification of Object Prototype Attributes)

The codebase has **201 occurrences** of `JSON.parse()` across **112 files**, while the secure alternative `safeJsonParse()` (using `secure-json-parse`) is only used in **3 files**. Most `JSON.parse()` calls operate on data from the SQLite database or internal sources, but several process data from external sources (file system, network, user input).

**High-risk `JSON.parse()` locations (external data):**

| File | Line | Data Source |
|------|------|-------------|
| `v3/src/validation/validation-result-aggregator.ts` | 690 | File system (manifest) |
| `v3/src/governance/shard-embeddings.ts` | 797 | File system (persisted data) |
| `v3/src/init/init-wizard.ts` | multiple | Config files |
| `v3/src/cli/commands/claude-flow-setup.ts` | multiple | External JSON files |
| `v3/src/mcp/transport/stdio.ts` | - | stdin transport |
| `v3/src/mcp/transport/sse/sse-transport.ts` | - | SSE transport data |
| `v3/src/mcp/transport/websocket/websocket-transport.ts` | - | WebSocket messages |
| `v3/src/adapters/a2a/jsonrpc/envelope.ts` | multiple | JSON-RPC messages |
| `v3/src/integrations/browser/agent-browser/client.ts` | multiple | Browser automation responses |

**Remediation:** Replace `JSON.parse()` with `safeJsonParse()` for all external data sources:
```typescript
import { safeJsonParse } from '../../cli/helpers/safe-json';

// BEFORE:
const data = JSON.parse(rawInput);

// AFTER:
const data = safeJsonParse(rawInput);
```

---

### HIGH-03: `Object.assign()` with Potentially Tainted Data in Performance Optimizer (CWE-915)

**Severity:** HIGH
**OWASP:** A08:2021 - Software and Data Integrity Failures
**CWE:** CWE-915 (Improperly Controlled Modification of Dynamically-Determined Object Attributes)

**File:** `v3/src/performance/optimizer.ts` (lines 547, 610, 686)

```typescript
Object.assign(event, data);   // line 547
Object.assign(message, data); // line 610
Object.assign(component, data); // line 686
```

The `Object.assign()` calls use pooled objects that get recycled. If `data` contains `__proto__` or `constructor` keys, it could pollute prototypes. While the workflow-orchestrator and other files properly guard against this, the performance optimizer does not.

**Remediation:**
```typescript
// Add prototype pollution guard before Object.assign
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function safeAssign<T extends object>(target: T, source: Record<string, unknown>): T {
  for (const [key, value] of Object.entries(source)) {
    if (!DANGEROUS_KEYS.has(key)) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}
```

---

### HIGH-04: OAuth 2.1 Provider Stores Raw Tokens in Memory (CWE-312)

**Severity:** HIGH
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-312 (Cleartext Storage of Sensitive Information)

**File:** `v3/src/mcp/security/oauth21-provider.ts` (lines 690, 703)

The `TokenData` interface and storage includes both the hashed token (`tokenHash`) and the raw token value (`token`). While the lookup is done via hash, storing the raw token in memory is unnecessary and creates risk in case of memory dumps or debugging exposure.

```typescript
// Line 690-700
this.tokens.set(accessTokenHash, {
  token: accessToken,        // RAW TOKEN STORED - unnecessary
  tokenHash: accessTokenHash,
  type: 'access_token',
  ...
});
```

**Remediation:** Remove the `token` field from stored `TokenData`. Only store the hash:
```typescript
this.tokens.set(accessTokenHash, {
  tokenHash: accessTokenHash,  // Only store the hash
  type: 'access_token',
  clientId: client.clientId,
  // ... other fields, but NOT the raw token
});
```

---

### HIGH-05: Client Secrets Stored in Plaintext in OAuth Provider (CWE-256)

**Severity:** HIGH
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-256 (Plaintext Storage of a Password)

**File:** `v3/src/mcp/security/oauth21-provider.ts` (lines 40-51)

The `OAuth21Client` interface stores `clientSecret` as a plaintext string. While the `timingSafeCompare` is correctly used for comparison, the secret should be stored as a salted hash.

```typescript
export interface OAuth21Client {
  clientId: string;
  clientSecret?: string;  // Plaintext storage
  // ...
}
```

**Remediation:** Store client secrets as hashed values:
```typescript
export interface OAuth21Client {
  clientId: string;
  clientSecretHash?: string;  // Store hash only
  // ...
}

// During registration:
client.clientSecretHash = secureHash(clientSecret, client.clientId);

// During validation:
const hash = secureHash(request.clientSecret, client.clientId);
if (!timingSafeCompare(hash, client.clientSecretHash)) { ... }
```

---

### MEDIUM-01: Password Included in Connection String URL (CWE-319)

**Severity:** MEDIUM
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

**File:** `v3/src/sync/cloud/tunnel-manager.ts` (line 231)

```typescript
return `postgresql://${user}:${password}@${host}:${port}/${database}`;
```

The password from `process.env.PGPASSWORD` is embedded directly in the connection string. This could appear in logs, error messages, or stack traces.

**Remediation:** Use separate connection parameters instead of a connection string URL, or use the `pg` library's config object:
```typescript
return {
  host,
  port,
  user,
  password,
  database,
};
```

---

### MEDIUM-02: Timing Attack Window in OAuth `timingSafeCompare` (CWE-208)

**Severity:** MEDIUM
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-208 (Observable Timing Discrepancy)

**File:** `v3/src/mcp/security/oauth21-provider.ts` (lines 735-740)

```typescript
private timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;  // Early return leaks length information
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

The early return on length mismatch leaks information about the expected string length. The CVE Prevention module's `CryptoValidator.timingSafeCompare` (lines 31-41) handles this correctly by padding.

**Remediation:** Use the CryptoValidator's implementation or pad strings:
```typescript
private timingSafeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const paddedA = a.padEnd(maxLen, '\0');
  const paddedB = b.padEnd(maxLen, '\0');
  try {
    return timingSafeEqual(Buffer.from(paddedA), Buffer.from(paddedB));
  } catch {
    return false;
  }
}
```

---

### MEDIUM-03: Missing Rate Limiting on OAuth Token Endpoint (CWE-307)

**Severity:** MEDIUM
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

The `OAuth21Provider.token()` method does not integrate with the `RateLimiter`. While the `SecurityMiddleware` provides both components, they are not wired together by default. An attacker could brute-force authorization codes or client credentials without rate limiting.

**Remediation:** Integrate rate limiting into the OAuth token endpoint:
```typescript
// In SecurityMiddleware.runSecurityChecks, or add to OAuth21Provider:
const strictLimiter = createStrictRateLimiter({ tokensPerSecond: 5, maxBurst: 10 });
// Apply to token exchange endpoint
```

---

### MEDIUM-04: OAuth is Disabled by Default in Security Middleware (CWE-306)

**Severity:** MEDIUM
**OWASP:** A07:2021 - Identification and Authentication Failures
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**File:** `v3/src/mcp/security/index.ts` (line 199)

```typescript
enableOAuth = false, // OAuth disabled by default
```

The security middleware factory disables OAuth by default. MCP tool invocations can proceed without authentication unless explicitly configured.

**Remediation:** Document that OAuth must be explicitly enabled for production deployments. Consider making it default-on with a flag to disable for development.

---

### MEDIUM-05: Schema Validator Allows `plain` PKCE Method Type (CWE-327)

**Severity:** MEDIUM
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)

**File:** `v3/src/mcp/security/oauth21-provider.ts` (line 36, 641-644)

The `PKCEMethod` type allows `'plain'`, and `computeCodeChallenge` handles it by returning the verifier as-is. OAuth 2.1 mandates S256 only. While the authorization flow correctly rejects `plain` (line 276), the `computeCodeChallenge` method still supports it.

```typescript
export type PKCEMethod = 'S256' | 'plain';

private computeCodeChallenge(verifier: string, method: PKCEMethod): string {
  if (method === 'plain') {
    return verifier;  // Insecure - OAuth 2.1 requires S256
  }
  // ...
}
```

**Remediation:** Remove `'plain'` from `PKCEMethod` type and the code path:
```typescript
export type PKCEMethod = 'S256';
```

---

### MEDIUM-06: Revoked Token Cleanup Never Actually Removes Entries (CWE-459)

**Severity:** MEDIUM
**OWASP:** A04:2021 - Insecure Design
**CWE:** CWE-459 (Incomplete Cleanup)

**File:** `v3/src/mcp/security/oauth21-provider.ts` (lines 771-774)

```typescript
// Cleanup old revoked tokens (keep for 24 hours)
const dayAgo = now - 24 * 60 * 60 * 1000;
// Note: In production, we'd track revocation time
```

The cleanup timer calculates `dayAgo` but never uses it. The `revokedTokens` Set grows unboundedly because revocation timestamps are not tracked.

**Remediation:** Track revocation time and implement actual cleanup:
```typescript
private readonly revokedTokens: Map<string, number> = new Map(); // hash -> revocation time

// In revoke():
this.revokedTokens.set(tokenHash, Date.now());

// In cleanup:
const dayAgo = now - 24 * 60 * 60 * 1000;
for (const [hash, revokedAt] of this.revokedTokens) {
  if (revokedAt < dayAgo) {
    this.revokedTokens.delete(hash);
  }
}
```

---

### MEDIUM-07: Unsafe Temporary File Creation in Task Executor (CWE-377)

**Severity:** MEDIUM
**OWASP:** A01:2021 - Broken Access Control
**CWE:** CWE-377 (Insecure Temporary File)

**File:** `v3/src/coordination/task-executor.ts` (line 264)

```typescript
const tempPath = `/tmp/aqe-temp-${uuidv4()}.ts`;
await fs.writeFile(tempPath, payload.sourceCode, 'utf-8');
```

User-provided source code is written to a predictable location pattern in `/tmp/`. While the UUID provides uniqueness, there is no cleanup guarantee, and the file permissions are not restricted.

**Remediation:** Use `os.tmpdir()` with restricted permissions and ensure cleanup:
```typescript
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';

const tempDir = await mkdtemp(path.join(tmpdir(), 'aqe-'));
const tempPath = path.join(tempDir, `temp-${uuidv4()}.ts`);
await writeFile(tempPath, payload.sourceCode, { mode: 0o600 });
try {
  // ... use the file
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
```

---

### MEDIUM-08: API Key Exposed in README Example (CWE-200)

**Severity:** MEDIUM
**OWASP:** A01:2021 - Broken Access Control
**CWE:** CWE-200 (Exposure of Sensitive Information)

**File:** `v3/src/coordination/consensus/providers/README.md` (line 155)

```markdown
export ANTHROPIC_API_KEY="sk-ant-..."
```

While this is a placeholder, the prefix `sk-ant-` reveals the key format. Documentation examples should use clearly fake values.

**Remediation:** Use obviously fake values:
```markdown
export ANTHROPIC_API_KEY="your-api-key-here"
```

---

### LOW-01: `execSync` Used for Command Detection (CWE-78)

**Severity:** LOW
**OWASP:** A03:2021 - Injection
**CWE:** CWE-78 (OS Command Injection)

**File:** `v3/src/workers/workers/cloud-sync.ts` (line 212)

```typescript
execSync('which gcloud', { stdio: 'ignore' });
```

The command is hardcoded (not user-influenced), so the actual injection risk is minimal. However, using `execSync` should be replaced with a safer check.

**Remediation:** Use `fs.accessSync` or `which` module instead of `execSync`.

---

### LOW-02: `spawn` Used Without Full Path Validation (CWE-426)

**Severity:** LOW
**OWASP:** A03:2021 - Injection
**CWE:** CWE-426 (Untrusted Search Path)

**Files:**
- `v3/src/cli/commands/mcp.ts` (line 54) - spawns `node`
- `v3/src/sync/cloud/tunnel-manager.ts` (line 101) - spawns `gcloud`

Both use `spawn` with command names resolved via PATH. An attacker with control over the PATH environment could substitute malicious binaries.

**Remediation:** Use absolute paths for critical commands:
```typescript
import { execPath } from 'process';
spawn(execPath, args, { ... }); // Use Node.js's own path
```

---

### LOW-03: Unsafe SHA-256 for Password/Secret Hashing (CWE-328)

**Severity:** LOW
**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-328 (Use of Weak Hash)

**File:** `v3/src/mcp/security/validators/crypto-validator.ts` (line 68-71)

SHA-256 is used for hashing secrets. While acceptable for token hashing, for password/secret storage, bcrypt/scrypt/argon2 would be more appropriate as they include work factors to resist brute force.

**Remediation:** For password-equivalent secrets, consider using `scrypt` from Node.js crypto module.

---

### LOW-04: Missing Input Length Validation on Rate Limiter Client IDs (CWE-400)

**Severity:** LOW
**OWASP:** A04:2021 - Insecure Design
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**File:** `v3/src/mcp/security/rate-limiter.ts`

The `clientId` parameter is used as a Map key without length validation. An attacker could send extremely long client IDs to consume memory.

**Remediation:** Add max length check:
```typescript
check(clientId?: string, endpoint?: string): RateLimitResult {
  if (clientId && clientId.length > 256) {
    return { allowed: false, remaining: 0, headers: ... };
  }
  // ...
}
```

---

### LOW-05: `safe-path` Format Validator Allows Symlink Traversal (CWE-59)

**Severity:** LOW
**OWASP:** A01:2021 - Broken Access Control
**CWE:** CWE-59 (Improper Link Resolution Before File Access)

**File:** `v3/src/mcp/security/schema-validator.ts` (lines 199-205)

The `safe-path` format validator rejects `..` and absolute paths but does not check for symbolic link traversal.

**Remediation:** Add `fs.realpathSync` resolution after path validation to detect symlink escapes.

---

### LOW-06: Test Secret in OAuth Test Code (CWE-798)

**Severity:** LOW (Test code only)
**OWASP:** A07:2021 - Identification and Authentication Failures

**File:** `v3/src/adapters/a2a/auth/oauth-provider.ts` (line 881)

```typescript
clientSecret: 'test-secret',
```

This appears to be test/example code. No action needed if confirmed as test-only, but ensure this file is excluded from production bundles.

---

## 2. Dependency Vulnerabilities

### npm audit Results

| Package | Severity | CVE/Advisory | Description | Fix |
|---------|----------|--------------|-------------|-----|
| `@isaacs/brace-expansion` (<=5.0.0) | HIGH | GHSA-7h2j-956f-4vf2 | Uncontrolled Resource Consumption (CWE-1333: ReDoS) | Update to >5.0.0 |

**Total vulnerable dependencies:** 1 (high)
**Total dependencies:** 847 (172 prod, 146 dev, 582 optional)

### Dependency Risk Assessment

| Dependency | Version | Risk | Notes |
|------------|---------|------|-------|
| `better-sqlite3` | ^12.5.0 | Low | Native addon, well-maintained |
| `jose` | ^6.1.3 | Low | JOSE/JWT library, actively maintained |
| `secure-json-parse` | ^4.1.0 | Low | Used for prototype pollution prevention |
| `pg` | ^8.17.2 | Low | PostgreSQL client, well-maintained |
| `yaml` | ^2.8.2 | Low | YAML parser, review for prototype pollution |
| `@xenova/transformers` | ^2.17.2 | Medium | Large ML library, monitor for supply chain |
| `vibium` | ^0.1.2 | Medium | Browser automation, early version |
| `prime-radiant-advanced-wasm` | ^0.1.3 | Medium | WASM module, early version |
| `@ruvector/*` | various | Medium | Custom packages, verify provenance |

### Positive Findings

- The `tar` package is overridden to `>=7.5.7` to address known vulnerabilities
- `secure-json-parse` is included as a dependency for prototype pollution prevention
- No known critical CVEs in direct production dependencies

---

## 3. Authentication and Authorization Findings

### OAuth 2.1 Implementation Review

**File:** `v3/src/mcp/security/oauth21-provider.ts`

| Check | Status | Notes |
|-------|--------|-------|
| PKCE enforcement | PASS | S256 required, plain rejected at authorization |
| Authorization code one-time use | PASS | Code deleted immediately after exchange |
| Authorization code expiry (10 min) | PASS | Appropriate lifetime |
| Refresh token rotation | PASS | Old token revoked on refresh |
| Client credential validation | PASS | Proper confidential client checks |
| Timing-safe comparison | PARTIAL | Uses `timingSafeEqual` but with length leak (MEDIUM-02) |
| Token storage | FAIL | Raw tokens stored in memory (HIGH-04) |
| Client secret storage | FAIL | Plaintext storage (HIGH-05) |
| Scope validation | PASS | Proper subset checking |
| Redirect URI validation | PASS | Exact match required |

### Rate Limiting Review

**File:** `v3/src/mcp/security/rate-limiter.ts`

| Check | Status | Notes |
|-------|--------|-------|
| Token bucket algorithm | PASS | Correct implementation |
| Per-client limiting | PASS | Separate buckets per client |
| Sliding window alternative | PASS | Available for higher accuracy |
| Cleanup of stale buckets | PASS | 5-minute cleanup cycle |
| Strict limiter for sensitive endpoints | PASS | Factory function available |
| Integration with OAuth | FAIL | Not wired together (MEDIUM-03) |

### Security Middleware Review

**File:** `v3/src/mcp/security/index.ts`

| Check | Status | Notes |
|-------|--------|-------|
| Schema validation | PASS | Enabled by default |
| Rate limiting | PASS | Enabled by default |
| OAuth authentication | FAIL | Disabled by default (MEDIUM-04) |
| CVE prevention | PASS | Enabled by default |
| Input sanitization | PASS | Available |
| Command validation | PASS | Available |

---

## 4. Data Security Findings

### SQLite Database Security

| Check | Status | Notes |
|-------|--------|-------|
| Parameterized queries for data | PASS | KV store, vectors, patterns use `?` params |
| Parameterized identifiers | FAIL | Table names via string interpolation (CRITICAL-01) |
| Transaction support | PASS | Migration uses transactions |
| WAL mode | N/A | Not explicitly set (default journal mode) |
| Database encryption | N/A | Not implemented (acceptable for local dev) |

### Memory/Storage Data Leaks

| Check | Status | Notes |
|-------|--------|-------|
| Token storage in memory | FAIL | Raw tokens stored (HIGH-04) |
| Connection string exposure | FAIL | Password in URL (MEDIUM-01) |
| Temp file cleanup | FAIL | No guaranteed cleanup (MEDIUM-07) |
| Log sanitization | PASS | No evidence of secrets in log calls |
| Error message information leaks | PASS | OAuth errors use standard codes |

### Input Validation

| Check | Status | Notes |
|-------|--------|-------|
| Path traversal prevention | PASS | Comprehensive validator with 12 patterns |
| Command injection prevention | PASS | Allowlist + blocked patterns |
| SQL injection prevention | PASS | Input sanitizer strips SQL patterns |
| XSS prevention | PASS | HTML escaping and tag stripping |
| Null byte injection | PASS | Detected in path and input validators |
| Control character stripping | PASS | Dangerous control chars removed |
| ReDoS prevention | PASS | Dedicated validator with complexity limits |
| Prototype pollution | PARTIAL | Guards in many places but inconsistent (HIGH-02, HIGH-03) |

---

## 5. Configuration Security

### `security-scan.config.json` Review

| Check | Status | Notes |
|-------|--------|-------|
| Critical/High fail build | PASS | `threshold: 0` for both |
| Medium/Low tolerances | PASS | Reasonable thresholds (50/100) |
| False positive management | PASS | Well-documented allowlist |
| SARIF output | PASS | Enabled for IDE/CI integration |
| Pre-commit scanning | PASS | Enabled with quick scan |
| CI/CD integration | PASS | Block PR on critical/high |

### Security Defaults Assessment

| Setting | Value | Assessment |
|---------|-------|------------|
| OAuth default | Disabled | Risk: MEDIUM - should document clearly |
| Rate limit default | 100 req/s, 200 burst | Appropriate for development |
| Strict rate limit | 10 req/s, 20 burst | Good for sensitive endpoints |
| Auth code lifetime | 10 minutes | Appropriate |
| Access token TTL | 1 hour | Appropriate |
| Refresh token TTL | 30 days | Acceptable for dev, reduce for prod |
| PKCE required | true | Correct per OAuth 2.1 |
| Schema strict mode | true | Good default |

---

## 6. OWASP Top 10 (2021) Mapping

| OWASP Category | Findings | Severity |
|----------------|----------|----------|
| **A01: Broken Access Control** | MEDIUM-07 (temp files), LOW-05 (symlink) | Medium |
| **A02: Cryptographic Failures** | HIGH-04 (token storage), HIGH-05 (secret storage), MEDIUM-01 (password in URL), MEDIUM-02 (timing), MEDIUM-05 (plain PKCE), LOW-03 (SHA-256) | High |
| **A03: Injection** | CRITICAL-01 (SQL injection), HIGH-01 (ReDoS), LOW-01 (execSync), LOW-02 (PATH) | Critical |
| **A04: Insecure Design** | MEDIUM-06 (cleanup), LOW-04 (resource) | Medium |
| **A05: Security Misconfiguration** | No findings | N/A |
| **A06: Vulnerable Components** | 1 npm audit high (brace-expansion) | High |
| **A07: Identification Failures** | CRITICAL-02 (hardcoded infra), MEDIUM-03 (rate limit), MEDIUM-04 (OAuth disabled) | Critical |
| **A08: Data Integrity Failures** | HIGH-02 (JSON.parse), HIGH-03 (Object.assign) | High |
| **A09: Logging Failures** | No findings | N/A |
| **A10: SSRF** | No findings (URL validation present in browser tools) | N/A |

---

## 7. Prioritized Recommendations

### Immediate (Before Next Release)

1. **CRITICAL-01:** Add table name allowlist validation to all SQLite string-interpolated queries in `unified-memory.ts`, `unified-memory-migration.ts`, `sqlite-reader.ts`, and `sync-embedding-generator.ts`
2. **CRITICAL-02:** Remove hardcoded GCP project ID, instance name, and username defaults from `sync/interfaces.ts`

### Short-term (Next Sprint)

3. **HIGH-01:** Create a lint rule or wrapper that enforces `createSafeRegex()` for all `new RegExp()` calls with non-literal patterns
4. **HIGH-02:** Replace `JSON.parse()` with `safeJsonParse()` in all transport layers (stdio, SSE, WebSocket) and file readers that process external data
5. **HIGH-03:** Add prototype pollution guards to `Object.assign()` calls in `performance/optimizer.ts`
6. **HIGH-04:** Remove raw token storage from OAuth `TokenData`
7. **HIGH-05:** Hash client secrets before storage in OAuth provider

### Medium-term (Next Month)

8. **MEDIUM-02:** Replace OAuth provider's `timingSafeCompare` with `CryptoValidator.timingSafeCompare`
9. **MEDIUM-03:** Wire rate limiting into OAuth token endpoint
10. **MEDIUM-05:** Remove `'plain'` from PKCEMethod type
11. **MEDIUM-06:** Implement revoked token cleanup with timestamp tracking
12. **MEDIUM-07:** Fix temp file creation with proper permissions and cleanup
13. Fix npm audit finding: update `@isaacs/brace-expansion` to >5.0.0

### Long-term (Backlog)

14. Enable WAL mode for SQLite for better concurrent access
15. Consider database-at-rest encryption for production deployments
16. Add HSTS headers and security headers to HTTP server
17. Implement CSRF protection for any web-facing endpoints
18. Add automated DAST scanning to CI/CD pipeline

---

## 8. Positive Security Observations

The codebase demonstrates several security best practices that should be maintained:

1. **Comprehensive CVE Prevention Module** - The `src/mcp/security/validators/` directory implements the Strategy Pattern with dedicated validators for path traversal, command injection, input sanitization, ReDoS, and cryptographic operations
2. **Prototype Pollution Awareness** - Multiple files (`workflow-orchestrator.ts`, `goap-planner.ts`, `plan-executor.ts`, `cli-config.ts`, `safe-json.ts`) include explicit `__proto__`/`constructor`/`prototype` guards
3. **Safe Expression Evaluator** - Custom expression evaluator (`safe-expression-evaluator.ts`) avoids `eval()` and `new Function()`
4. **Secure JSON Parsing** - `secure-json-parse` library is available and used in CLI helpers
5. **OAuth 2.1 Compliance** - PKCE enforcement, one-time auth codes, refresh token rotation
6. **Input Sanitization** - Null byte detection, control character stripping, HTML tag removal, SQL pattern detection
7. **Rate Limiting** - Both token bucket and sliding window implementations available
8. **Schema Validation** - Comprehensive JSON Schema validator with safe-path format
9. **Security Scan Configuration** - Well-structured `security-scan.config.json` with CI/CD integration

---

*Report generated by V3 QE Security Scanner*
*Scan duration: ~45 seconds*
*Files analyzed: 250+ TypeScript source files*
*Rules applied: OWASP Top 10 2021, CWE/SANS Top 25, custom patterns*
