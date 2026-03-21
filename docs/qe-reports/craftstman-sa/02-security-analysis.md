# SimpleAgents Security Analysis Report

**Project**: SimpleAgents (CraftsMan-Labs/SimpleAgents)
**Version**: 0.2.26
**Date**: 2026-03-20
**Analyst**: QE Security Reviewer (V3)
**Overall Risk Rating**: **MEDIUM** (with 2 HIGH-severity issues)

---

## Executive Summary

SimpleAgents is a Rust-first LLM application framework with C FFI, Python (PyO3), and Node (napi-rs) bindings, a YAML workflow engine, gRPC worker protocol, and CLI tooling. The codebase demonstrates strong security fundamentals: the `ApiKey` type prevents secret logging via custom `Debug`/`Serialize` impls with constant-time comparison, core crates enforce `#![deny(unsafe_code)]`, the expression engine has robust complexity limits, and all provider HTTP clients enforce timeouts. However, several issues require remediation.

**Key Findings Summary:**
- 2 HIGH severity findings (config file plaintext API keys, FFI `unsafe impl Send+Sync` without formal proof)
- 5 MEDIUM severity findings (deprecated dependency, path traversal in workflow runner, unbounded YAML deserialization, missing TLS certificate pinning, API key exposure via shared rate limiter key)
- 5 LOW/INFORMATIONAL findings (HTTP/2 prior knowledge misconfiguration, `ProviderConfig` serializes API key, cache eviction bias, error body logging, test-only secret patterns)

**Weighted Finding Score**: 2(2) + 1(5) + 0.5(3) + 0.25(2) = 11.0 (minimum threshold: 3.0 -- PASSED)

---

## Top 10 Critical Findings

| Rank | ID | Severity | OWASP | Title | Location |
|------|-----|----------|-------|-------|----------|
| 1 | SEC-001 | HIGH | A07 | CLI config allows plaintext API keys in TOML/YAML | `crates/simple-agents-cli/src/main.rs:214-218` |
| 2 | SEC-002 | HIGH | A08 | FFI `unsafe impl Send+Sync` for callback sink without formal safety proof | `crates/simple-agents-ffi/src/lib.rs:161-162` |
| 3 | SEC-003 | MEDIUM | A06 | `serde_yaml` v0.9.34 is deprecated; unmaintained | `Cargo.lock` |
| 4 | SEC-004 | MEDIUM | A01 | No path traversal guard on workflow file paths (FFI/NAPI/Py) | `crates/simple-agents-ffi/src/lib.rs:978-989` |
| 5 | SEC-005 | MEDIUM | A04 | YAML deserialization has no size/depth limit (billion-laughs DoS) | `crates/simple-agents-workflow/src/yaml_runner.rs:1354` |
| 6 | SEC-006 | MEDIUM | A02 | No TLS certificate pinning for provider API endpoints | `crates/simple-agents-providers/src/openai/mod.rs:217-224` |
| 7 | SEC-007 | MEDIUM | A07 | Shared rate limiter uses raw API key as HashMap key | `crates/simple-agents-providers/src/rate_limit.rs:82-121` |
| 8 | SEC-008 | LOW | A05 | `HttpClient::default()` forces HTTP/2 prior knowledge (breaks non-H2 servers) | `crates/simple-agents-providers/src/common/http_client.rs:75` |
| 9 | SEC-009 | LOW | A09 | Error response body logged at WARN level may contain sensitive data | `crates/simple-agents-providers/src/openai/mod.rs:449-453` |
| 10 | SEC-010 | LOW | A02 | `ProviderConfig` serializes API key field as plaintext | `crates/simple-agent-type/src/config.rs:170-171` |

---

## Detailed Findings

### SEC-001: CLI Config Allows Plaintext API Keys in TOML/YAML Files

**Severity**: HIGH
**OWASP**: A07:2021 - Identification and Authentication Failures
**CWE**: CWE-312 (Cleartext Storage of Sensitive Information)
**Location**: `/tmp/SimpleAgents/crates/simple-agents-cli/src/main.rs:214-218`

**Description**:
The `ProviderEntry` struct in the CLI accepts an `api_key` field directly in TOML/YAML configuration files:

```rust
#[derive(Debug, Clone, Deserialize)]
struct ProviderEntry {
    kind: ProviderKind,
    api_key: Option<String>,      // Plaintext API key in config file
    api_key_env: Option<String>,   // Env var name (safer alternative)
    base_url: Option<String>,
    default_model: Option<String>,
}
```

If users store API keys directly in config files and commit them to version control, the keys are exposed. While `api_key_env` exists as a safer alternative, the `api_key` field provides no warnings or deprecation notice.

**Impact**: API key exposure if configuration files are committed to version control or shared.

**Remediation**:
1. Add a runtime warning when `api_key` is used directly instead of `api_key_env`.
2. Consider removing the `api_key` field and only supporting environment variable references.
3. Add a `#[serde(skip_serializing)]` attribute to prevent accidental re-serialization.

---

### SEC-002: FFI and Python Binding `unsafe impl Send+Sync` Without Formal Safety Proof

**Severity**: HIGH
**OWASP**: A08:2021 - Software and Data Integrity Failures
**CWE**: CWE-362 (Concurrent Execution Using Shared Resource with Improper Synchronization)
**Locations**:
- `/tmp/SimpleAgents/crates/simple-agents-ffi/src/lib.rs:160-162`
- `/tmp/SimpleAgents/crates/simple-agents-py/src/lib.rs:901-902`
- `/tmp/SimpleAgents/crates/simple-agents-py/src/lib.rs:1023-1024`
- `/tmp/SimpleAgents/crates/simple-agents-py/src/lib.rs:2343-2344`

**Description**:
Multiple structs use `unsafe impl Send` and `unsafe impl Sync` to allow cross-thread sharing of raw pointers (FFI) and Python objects (PyO3):

```rust
// FFI: CallbackWorkflowEventSink holds *mut c_void + extern "C" fn pointer
// Safe because callback/user_data ownership belongs to the caller
unsafe impl Send for CallbackWorkflowEventSink {}
unsafe impl Sync for CallbackWorkflowEventSink {}

// Python: PyMiddlewareAdapter holds Py<PyAny>
// Safe because all interaction with the Python object happens under the GIL.
unsafe impl Send for PyMiddlewareAdapter {}
unsafe impl Sync for PyMiddlewareAdapter {}
```

The FFI case is particularly concerning: `CallbackWorkflowEventSink` holds a `*mut c_void` user_data pointer and a raw function pointer. If the caller invalidates these while the workflow is running (e.g., frees user_data or unloads the library), this becomes use-after-free. The Python case is better justified (GIL guarantees) but still lacks formal proof that no `Py<PyAny>` is accessed outside the GIL.

**Impact**: Memory corruption, use-after-free, or data races in concurrent FFI/Python usage.

**Remediation**:
1. Document the exact safety invariants that callers must uphold for each `unsafe impl`.
2. For the FFI callback sink, consider wrapping user_data in an `Arc` or requiring the caller to provide a reference-counted handle.
3. Add integration tests that exercise these types from multiple threads.
4. Consider using `PhantomData<!Send>` on the base type and providing a safe `SendWrapper` pattern.

---

### SEC-003: `serde_yaml` v0.9.34 Is Deprecated and Unmaintained

**Severity**: MEDIUM
**OWASP**: A06:2021 - Vulnerable and Outdated Components
**CWE**: CWE-1104 (Use of Unmaintained Third Party Components)
**Location**: `Cargo.lock` - `serde_yaml 0.9.34+deprecated`

**Description**:
The project depends on `serde_yaml` v0.9.34, which is explicitly marked as deprecated (the version string in Cargo.lock includes `+deprecated`). The `serde_yaml` crate has been deprecated in favor of alternative YAML libraries. Deprecated crates receive no security patches.

YAML deserialization has a history of security issues (billion-laughs attacks, alias expansion bombs). Using an unmaintained YAML deserializer means any future CVEs will not be patched.

**Impact**: Unpatched vulnerabilities in YAML parsing; potential denial of service via malicious YAML input.

**Remediation**:
1. Migrate to `serde_yml` (the successor) or `yaml-rust2` with `serde` integration.
2. If migration is not immediately possible, pin the version and audit for known vulnerabilities.
3. Add YAML input size limits before deserialization (see SEC-005).

---

### SEC-004: No Path Traversal Guard on Workflow File Paths

**Severity**: MEDIUM
**OWASP**: A01:2021 - Broken Access Control
**CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)
**Locations**:
- `/tmp/SimpleAgents/crates/simple-agents-ffi/src/lib.rs:978` (`sa_run_email_workflow_yaml`)
- `/tmp/SimpleAgents/crates/simple-agents-ffi/src/lib.rs:1043` (`sa_run_workflow_yaml_with_options`)
- `/tmp/SimpleAgents/crates/simple-agents-napi/src/lib.rs:1075` (`run_workflow_yaml_with_events`)
- `/tmp/SimpleAgents/crates/simple-agents-workflow/src/yaml_runner.rs:1348-1351`

**Description**:
Workflow file paths from FFI, Node.js, and Python callers are passed directly to `std::fs::read_to_string` without any path canonicalization or boundary checking:

```rust
// FFI layer - user provides workflow_path as C string
let workflow_path = cstr_to_string(workflow_path, "workflow_path")?;
// ...
let output = runtime.block_on(run_email_workflow_yaml_file_with_client(
    std::path::Path::new(workflow_path.as_str()), // No traversal check
    email_text.as_str(),
    &client.client,
))
```

The yaml_runner also reads sibling YAML files in the parent directory via `discover_referenced_subgraphs`, which uses `std::fs::read_dir(parent_dir)` to scan and parse all YAML files in the workflow's directory.

An attacker who controls the workflow path could use `../../etc/passwd` style paths to read arbitrary files, or point to a directory containing malicious YAML files that would be auto-discovered as subgraphs.

**Impact**: Arbitrary file read on the host system; loading of unintended workflow files.

**Remediation**:
1. Canonicalize workflow paths and validate they reside within an allowed base directory.
2. Add a `workflow_root` parameter to constrain file access.
3. At minimum, reject paths containing `..` segments.
4. Restrict `discover_referenced_subgraphs` to only read files explicitly referenced in the workflow.

---

### SEC-005: YAML Deserialization Has No Size/Depth Limit (Billion-Laughs DoS)

**Severity**: MEDIUM
**OWASP**: A04:2021 - Insecure Design
**CWE**: CWE-400 (Uncontrolled Resource Consumption)
**Location**: `/tmp/SimpleAgents/crates/simple-agents-workflow/src/yaml_runner.rs:1347-1357`

**Description**:
YAML workflow files are read entirely into memory and deserialized without any size or complexity limits:

```rust
let contents = std::fs::read_to_string(workflow_path)
    .map_err(|source| YamlWorkflowRunError::Read { ... })?;
let workflow: YamlWorkflow = serde_yaml::from_str(&contents)
    .map_err(|source| YamlWorkflowRunError::Parse { ... })?;
```

The `serde_yaml` library's YAML parser is susceptible to billion-laughs (entity expansion) attacks where a small YAML file expands to consume gigabytes of memory via YAML anchors and aliases. No file size check is performed before reading, and the 7954-line yaml_runner.rs file processes workflows with potentially unbounded node counts.

While the expression engine (expressions.rs) has excellent complexity limits (max chars, depth, operators, path segments, cache size), the YAML layer has none.

**Impact**: Denial of service via memory exhaustion from crafted YAML workflows.

**Remediation**:
1. Check file size before reading (e.g., reject files > 1MB).
2. Configure serde_yaml's recursion/alias limits if the successor library supports them.
3. Add limits on the number of workflow nodes, steps, and total workflow size.
4. Consider parsing YAML in a sandbox with memory limits.

---

### SEC-006: No TLS Certificate Pinning for Provider API Endpoints

**Severity**: MEDIUM
**OWASP**: A02:2021 - Cryptographic Failures
**CWE**: CWE-295 (Improper Certificate Validation)
**Locations**:
- `/tmp/SimpleAgents/crates/simple-agents-providers/src/openai/mod.rs:217-224`
- `/tmp/SimpleAgents/crates/simple-agents-providers/src/anthropic/mod.rs:105-112`
- `/tmp/SimpleAgents/crates/simple-agents-providers/src/openrouter/mod.rs:127-134`

**Description**:
All provider HTTP clients use reqwest's default TLS configuration with system root certificates. While this is standard, the providers support user-configurable `base_url` values, meaning a user (or attacker controlling environment variables like `OPENAI_API_BASE`) could redirect API traffic to a malicious server. The project correctly does NOT disable certificate validation (`danger_accept_invalid_certs` is never used -- verified), but there is no certificate pinning for the known provider endpoints.

Additionally, the `HttpClient::default()` in `common/http_client.rs` enables `http2_prior_knowledge()` which forces HTTP/2 without TLS negotiation. This is appropriate only for plaintext HTTP/2 (h2c) and will fail silently or cause connection issues with standard HTTPS endpoints that use ALPN negotiation.

**Impact**: MITM attacks possible if DNS/network is compromised; API keys sent to attacker-controlled endpoints.

**Remediation**:
1. For known provider URLs (api.openai.com, api.anthropic.com, openrouter.ai), consider TLS certificate pinning.
2. Warn users when `base_url` is overridden to a non-HTTPS URL.
3. Fix `HttpClient::default()` to not use `http2_prior_knowledge()` for HTTPS connections (the `OpenAIProvider::from_env()` already removed this -- apply consistently).

---

### SEC-007: Shared Rate Limiter Uses Raw API Key as HashMap Key

**Severity**: MEDIUM
**OWASP**: A07:2021 - Identification and Authentication Failures
**CWE**: CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
**Location**: `/tmp/SimpleAgents/crates/simple-agents-providers/src/rate_limit.rs:82-121`

**Description**:
The `SharedRateLimiters` registry uses the raw API key string as a HashMap key:

```rust
pub fn get_or_create(&self, key: impl Into<String>) -> RateLimiter {
    let key = key.into(); // This is the raw API key
    // ...
    limiters.insert(key, limiter.clone()); // Stored as HashMap key
}
```

Callers pass the exposed API key directly:
```rust
self.rate_limiter.until_ready(Some(self.api_key.expose())).await;
```

This means the raw API key is stored in memory as a HashMap key, potentially persisting longer than necessary and visible in memory dumps. While this is in-process memory (not logged), it defeats the purpose of the `ApiKey` type's encapsulation.

**Impact**: API keys persist in memory as plain strings in the rate limiter registry; potential exposure in core dumps or memory inspection.

**Remediation**:
1. Hash the API key (e.g., using blake3, which is already a dependency) before using it as a HashMap key.
2. Use `ApiKey::preview()` or a hash digest as the map key instead of the raw key.

---

### SEC-008: `HttpClient::default()` Forces HTTP/2 Prior Knowledge

**Severity**: LOW
**OWASP**: A05:2021 - Security Misconfiguration
**CWE**: CWE-16 (Configuration)
**Location**: `/tmp/SimpleAgents/crates/simple-agents-providers/src/common/http_client.rs:71-76`

**Description**:
The `HttpClient::with_timeout()` method enables `http2_prior_knowledge()`, which assumes the server supports HTTP/2 without TLS ALPN negotiation. This causes connection failures when used against HTTPS servers that expect ALPN, and is only appropriate for plaintext h2c connections. The `OpenAIProvider::from_env()` method already fixed this by removing `http2_prior_knowledge()`, but the shared `HttpClient` still has it.

**Impact**: Connection failures with standard HTTPS API endpoints when using the default `HttpClient`.

**Remediation**: Remove `http2_prior_knowledge()` from `HttpClient::with_timeout()` and let reqwest handle protocol negotiation via ALPN.

---

### SEC-009: Error Response Body Logged at WARN Level May Contain Sensitive Data

**Severity**: LOW
**OWASP**: A09:2021 - Security Logging and Monitoring Failures
**CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
**Locations**:
- `/tmp/SimpleAgents/crates/simple-agents-providers/src/openai/mod.rs:449-453`
- `/tmp/SimpleAgents/crates/simple-agents-providers/src/anthropic/mod.rs:342-347`

**Description**:
When API requests fail, the error response body is logged at WARN level with a 200-character preview:

```rust
tracing::warn!(
    status = %status,
    body_preview = %body.chars().take(200).collect::<String>(),
    "API request failed"
);
```

Provider error responses may echo back parts of the request, including user prompts, model names, or authentication error details that could reveal partial key information. The OpenAI provider also logs all response headers at DEBUG level, which could include sensitive rate-limit or account-specific headers.

**Impact**: Potential leakage of user prompts or account details into application logs.

**Remediation**:
1. Reduce the body preview to 100 characters.
2. Strip or redact known sensitive patterns from error body previews before logging.
3. Move detailed header logging from DEBUG to TRACE level.

---

### SEC-010: `ProviderConfig` Serializes API Key as Plaintext

**Severity**: LOW
**OWASP**: A02:2021 - Cryptographic Failures
**CWE**: CWE-312 (Cleartext Storage of Sensitive Information)
**Location**: `/tmp/SimpleAgents/crates/simple-agent-type/src/config.rs:170-171`

**Description**:
The `ProviderConfig` struct has an `api_key: Option<String>` field that is serializable without redaction:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderConfig {
    // ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    // ...
}
```

While `skip_serializing_if = "Option::is_none"` prevents serialization when absent, if present, it serializes in plaintext. This is inconsistent with the main `ApiKey` type which serializes as `[REDACTED]`.

**Impact**: If `ProviderConfig` is ever serialized to JSON (e.g., for logging, config export, or debugging), the API key is exposed.

**Remediation**: Change the type to `Option<ApiKey>` or add `#[serde(skip_serializing)]` to the field.

---

## Unsafe Code Inventory

| Location | Type | Justification | Risk |
|----------|------|---------------|------|
| `simple-agents-ffi/src/lib.rs:161-162` | `unsafe impl Send+Sync` for `CallbackWorkflowEventSink` | Holds raw C fn ptr + `*mut c_void`; caller owns lifetime | HIGH - no lifetime enforcement |
| `simple-agents-ffi/src/lib.rs:254-270` | `unsafe fn cstr_to_string` | FFI C string conversion; null-checked | LOW - properly validated |
| `simple-agents-ffi/src/lib.rs:549` | `std::slice::from_raw_parts` | Constructs slice from FFI array ptr + len | MEDIUM - relies on caller for validity |
| `simple-agents-ffi/src/lib.rs:673-1257` | 10 `unsafe extern "C"` functions | C ABI entry points with null checks and panic guards | LOW - defensive patterns used |
| `simple-agents-py/src/lib.rs:901-902` | `unsafe impl Send+Sync` for `PyMiddlewareAdapter` | Holds `Py<PyAny>`; GIL guarantees safety | LOW - PyO3 pattern |
| `simple-agents-py/src/lib.rs:1023-1024` | `unsafe impl Send+Sync` for `PyCacheAdapter` | Holds `Py<PyAny>`; GIL guarantees safety | LOW - PyO3 pattern |
| `simple-agents-py/src/lib.rs:2343-2344` | `unsafe impl Send+Sync` for `PythonWorkflowEventSink` | Holds `Py<PyAny>`; GIL guarantees safety | LOW - PyO3 pattern |

**Positive Note**: Core crates (`simple-agent-type`, `simple-agents-core`, `simple-agents-healing`) enforce `#![deny(unsafe_code)]`, which is excellent practice.

---

## Dependency Vulnerability Scan

| Dependency | Version | Status | Notes |
|-----------|---------|--------|-------|
| `serde_yaml` | 0.9.34 | **DEPRECATED** | Unmaintained; migrate to `serde_yml` or alternative |
| `reqwest` | 0.12.28 | Current | No known CVEs |
| `tonic` | 0.12.3 | Current | No known CVEs |
| `serde` | 1.0 | Current | No known CVEs |
| `serde_json` | 1.0 | Current | No known CVEs |
| `tokio` | 1.35 | Current | No known CVEs |
| `prost` | 0.13 | Current | No known CVEs |
| `subtle` | 2.6 | Current | Constant-time operations (good security practice) |
| `blake3` | 1.5 | Current | Used for hashing (good security practice) |
| `governor` | 0.6 | Current | Rate limiting (good security practice) |
| `rand` | 0.8 | Current | Used for jitter randomness |
| `opentelemetry` | 0.24.0 | Current | Observability stack |
| `jsonschema` | 0.18 | Current | Used for workflow validation |

**Assessment**: Only `serde_yaml` is flagged. The overall dependency hygiene is good.

---

## Security Strengths (Positive Findings)

The following secure patterns were observed and should be maintained:

1. **`ApiKey` Type Design** (`simple-agent-type/src/validation.rs`): Custom `Debug` (prints `[REDACTED]`), custom `Serialize` (outputs `[REDACTED]`), constant-time comparison via `subtle::ConstantTimeEq`, null-byte rejection, minimum length validation. This is an exemplary pattern.

2. **Expression Engine Complexity Limits** (`simple-agents-workflow/src/expressions.rs`): Maximum expression length (2048 chars), operator count (64), depth (24), path segments (16), and cache entries (512). This prevents ReDoS and resource exhaustion attacks.

3. **`#![deny(unsafe_code)]` on Core Crates**: `simple-agent-type`, `simple-agents-core`, and `simple-agents-healing` all deny unsafe code at the crate level. This ensures safety in the core business logic.

4. **FFI Panic Guards**: All FFI entry points use `catch_unwind(AssertUnwindSafe(...))` to prevent Rust panics from unwinding across the C ABI boundary (undefined behavior). This is correct FFI practice.

5. **FFI Null Pointer Checks**: All FFI functions check for null client pointers before dereferencing. String conversion functions (`cstr_to_string`) validate null pointers, empty strings, and UTF-8 encoding.

6. **No TLS Validation Bypass**: Confirmed that `danger_accept_invalid_certs` and `danger_accept_invalid_hostnames` are never used anywhere in the codebase.

7. **Rate Limiting Implementation**: The `governor`-based rate limiter with token bucket algorithm, shared/per-instance scoping, and poisoned-lock recovery is well-implemented.

8. **No Hardcoded Secrets**: All API key values in `.rs` files are test fixtures using obvious patterns (`sk-test1234...`). The `.gitignore` correctly excludes `.env` files. The `.env.example` files contain only placeholder values.

9. **Error Handling**: All providers use typed error enums (`ProviderError`, `OpenAIError`, `AnthropicError`) with retry classification. Errors are properly mapped and no raw stack traces are exposed to users.

10. **No SQL Injection Risk**: The project uses no SQL database; all data is in-memory or via gRPC protocol buffers.

---

## Recommendations (Prioritized by Risk)

### Priority 1 (Fix Before Next Release)

| # | Action | Finding |
|---|--------|---------|
| 1 | Add path traversal guard to all workflow file loading functions | SEC-004 |
| 2 | Add YAML file size limit (e.g., 1MB) before deserialization | SEC-005 |
| 3 | Hash API keys before using as rate limiter HashMap keys | SEC-007 |

### Priority 2 (Fix Within 30 Days)

| # | Action | Finding |
|---|--------|---------|
| 4 | Migrate from deprecated `serde_yaml` to a maintained alternative | SEC-003 |
| 5 | Add runtime warning when plaintext `api_key` is used in CLI config | SEC-001 |
| 6 | Document exact safety invariants for all `unsafe impl Send+Sync` | SEC-002 |
| 7 | Warn when provider base_url is overridden to non-HTTPS | SEC-006 |

### Priority 3 (Track and Address)

| # | Action | Finding |
|---|--------|---------|
| 8 | Remove `http2_prior_knowledge()` from `HttpClient::default()` | SEC-008 |
| 9 | Reduce error body preview length and redact sensitive patterns | SEC-009 |
| 10 | Change `ProviderConfig.api_key` to `Option<ApiKey>` or skip serialization | SEC-010 |

---

## Files Examined

The following files were fully analyzed during this review:

**Providers (API Key Handling, HTTP, TLS)**:
- `crates/simple-agents-providers/src/openai/mod.rs` (1294 lines)
- `crates/simple-agents-providers/src/anthropic/mod.rs` (960 lines)
- `crates/simple-agents-providers/src/openrouter/mod.rs` (650 lines)
- `crates/simple-agents-providers/src/common/http_client.rs` (169 lines)
- `crates/simple-agents-providers/src/common/error.rs` (177 lines)
- `crates/simple-agents-providers/src/rate_limit.rs` (329 lines)
- `crates/simple-agents-providers/src/utils.rs` (130 lines)

**Core Types (Secret Handling, Validation)**:
- `crates/simple-agent-type/src/validation.rs` (262 lines)
- `crates/simple-agent-type/src/config.rs` (529 lines)

**FFI/Bindings (Unsafe Code, Memory Safety)**:
- `crates/simple-agents-ffi/src/lib.rs` (1258 lines)
- `crates/simple-agents-napi/src/lib.rs` (1224 lines)
- `crates/simple-agents-py/src/lib.rs` (sampled sections; ~2400 lines total)

**Workflow Engine (YAML Injection, Expressions)**:
- `crates/simple-agents-workflow/src/yaml_runner.rs` (first 200 lines + file access patterns)
- `crates/simple-agents-workflow/src/expressions.rs` (562 lines)

**CLI (Input Handling, Config Parsing)**:
- `crates/simple-agents-cli/src/main.rs` (1280 lines)

**gRPC Workers (Network Security)**:
- `crates/simple-agents-workflow-workers/src/client.rs` (221 lines)

**Project Configuration**:
- `Cargo.toml` (workspace)
- `Cargo.lock` (dependency versions)
- `.gitignore`
- `.env.example`, `examples/.env.example`

**Patterns Checked**:
- All `unsafe` blocks and `unsafe impl` across entire codebase
- All `sk-`, `AKIA`, `ghp_`, `ghr_` patterns in non-test code
- All `danger_accept_invalid_certs`/`danger_accept_invalid_hostnames` usage
- All `println!`/`tracing!` calls referencing key/secret/token
- All `std::fs::read`/`read_to_string`/`File::open` for path handling
- All `serde_yaml::from_str` call sites
- All `.env*` files for leaked credentials

---

## SARIF-Compatible Finding Summary

```json
{
  "version": "2.1.0",
  "$schema": "https://json.schemastore.org/sarif-2.1.0-rtm.5",
  "runs": [{
    "tool": { "driver": { "name": "QE Security Reviewer V3", "version": "3.8.4" } },
    "results": [
      { "ruleId": "SEC-001", "level": "error", "message": { "text": "CLI config allows plaintext API keys" } },
      { "ruleId": "SEC-002", "level": "error", "message": { "text": "FFI unsafe impl Send+Sync without formal proof" } },
      { "ruleId": "SEC-003", "level": "warning", "message": { "text": "serde_yaml v0.9.34 is deprecated" } },
      { "ruleId": "SEC-004", "level": "warning", "message": { "text": "No path traversal guard on workflow file paths" } },
      { "ruleId": "SEC-005", "level": "warning", "message": { "text": "YAML deserialization has no size/depth limit" } },
      { "ruleId": "SEC-006", "level": "warning", "message": { "text": "No TLS certificate pinning for provider endpoints" } },
      { "ruleId": "SEC-007", "level": "warning", "message": { "text": "Shared rate limiter uses raw API key as map key" } },
      { "ruleId": "SEC-008", "level": "note", "message": { "text": "HttpClient::default() forces HTTP/2 prior knowledge" } },
      { "ruleId": "SEC-009", "level": "note", "message": { "text": "Error body logged at WARN may contain sensitive data" } },
      { "ruleId": "SEC-010", "level": "note", "message": { "text": "ProviderConfig serializes API key as plaintext" } }
    ]
  }]
}
```

---

*Report generated by QE Security Reviewer V3 -- Agentic QE v3.8.4*
