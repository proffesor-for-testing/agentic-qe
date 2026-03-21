# SFDIPOT Product Factors Analysis: SimpleAgents

**Analysis Date**: 2026-03-20
**Analyst**: QE Product Factors Assessor (HTSM Framework - James Bach)
**Subject**: SimpleAgents v0.2.26 -- Rust-first LLM application workspace
**Repository**: https://github.com/CraftsMan-Labs/SimpleAgents

---

## Executive Summary

SimpleAgents is a 14-crate Rust workspace (52,251 lines of Rust) that provides a unified client for LLM providers (OpenAI, Anthropic, OpenRouter) with routing, caching, healing/coercion, YAML workflow execution, and cross-language bindings (Python/PyO3, Node.js/NAPI-RS, Go/CGO-FFI). The project publishes to crates.io, PyPI, and npm.

This SFDIPOT analysis examines all seven product factor dimensions, generating 112 prioritized test ideas across Structure, Function, Data, Interfaces, Platform, Operations, and Time. The analysis identifies critical risks in FFI memory safety, cross-language parity gaps, workflow state machine correctness, and API key exposure paths.

**Key Findings**:

| Dimension | Risk Level | Test Ideas | Critical Gaps |
|-----------|-----------|------------|---------------|
| Structure | Medium | 15 | Cross-crate version coupling, duplicate code in bindings |
| Function | High | 22 | Streaming parity, healing edge cases, workflow scheduler |
| Data | High | 18 | API key flow, cache poisoning, workflow state corruption |
| Interfaces | High | 16 | FFI memory safety, binding API surface gaps, YAML DSL validation |
| Platform | Medium | 12 | Tokio runtime conflicts, OS-specific FFI behavior |
| Operations | Medium | 14 | No health endpoints, limited observability in bindings |
| Time | High | 15 | Circuit breaker timing, cache TTL races, workflow timeouts |

**Overall Quality Assessment**: 72/100 -- The Rust core is well-architected with strong type safety, but the binding layers contain significant code duplication, the FFI layer has inherent memory safety risks, and several subsystems lack adequate test coverage for timing-sensitive behavior.

---

## 1. STRUCTURE -- What the Product IS

### 1.1 Analysis

The workspace comprises 14 crates organized in a layered architecture:

**Foundation Layer**:
- `simple-agent-type` (12 modules, 0 runtime deps) -- Canonical types, traits, validation
- `simple-agents-macros` (proc-macro crate) -- Derive macros for schemas

**Core Layer**:
- `simple-agents-healing` (6 modules) -- BAML-inspired JSON parser + coercion engine
- `simple-agents-router` (8 modules) -- Round-robin, latency, cost, fallback, circuit breaker
- `simple-agents-cache` (3 modules) -- In-memory TTL cache + NoOp backend

**Orchestration Layer**:
- `simple-agents-core` (5 modules) -- Unified client, middleware hooks
- `simple-agents-providers` (20 modules) -- OpenAI, Anthropic, OpenRouter adapters

**Workflow Layer**:
- `simple-agents-workflow` (19 modules) -- IR, runtime, validation, replay, scheduler
- `simple-agents-workflow-workers` (3 modules) -- gRPC worker pool

**Binding Layer**:
- `simple-agents-cli` (1 module) -- Clap CLI
- `simple-agents-ffi` (1 module, 1258 lines) -- C ABI surface
- `simple-agents-napi` (1 module, 1224 lines) -- Node.js NAPI-RS
- `simple-agents-py` (1 module, 30K+ tokens) -- Python PyO3

**Structural Observations**:
1. The type crate correctly has zero runtime dependencies and uses `#![deny(missing_docs)]` + `#![deny(unsafe_code)]`.
2. Cross-crate version coupling is tight: `simple-agents-core` depends on exact versions of router, cache, and healing crates (all `0.2.26`).
3. Binding crates (FFI, NAPI, Py) contain substantial duplicate logic for schema parsing (`parse_schema`, `parse_schema_field`), message building, and provider instantiation.
4. The `simple-agents-providers` crate does not use workspace-level metadata for some fields (e.g., `repository` points to `yourusername/SimpleAgents`).
5. The healing crate has a mixed `thiserror` version: workspace uses `1.0` but providers uses `2.0`.

### 1.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| S-01 | P0 | Build every crate independently with `cargo build -p <crate>` to confirm no circular dependencies or missing workspace members | Unit (CI) |
| S-02 | P1 | Run `cargo deny check` or equivalent to detect duplicate crate versions (thiserror 1.0 vs 2.0 coexistence) | Unit (CI) |
| S-03 | P1 | Compile with `#[deny(warnings)]` on all targets to surface dormant deprecation warnings across workspace members | Unit (CI) |
| S-04 | P1 | Confirm that `simple-agent-type` compiles with no default features and no optional dependencies activated; inject a `tokio` or `reqwest` import and assert compile failure | Unit |
| S-05 | P2 | Assert all public types in `simple-agent-type::prelude` implement `Send + Sync` (existing test covers some; extend to ToolCall, ToolDefinition, CompletionChunk) | Unit |
| S-06 | P2 | Extract the `parse_schema` + `parse_schema_field` logic duplicated across FFI, NAPI, and Py into a shared module; confirm behavior parity via golden tests | Integration |
| S-07 | P2 | Run `cargo +nightly udeps` to identify unused dependencies in each crate | Unit (CI) |
| S-08 | P2 | Assert that `providers` crate metadata `repository` field matches workspace-level value (currently points to `yourusername/SimpleAgents`) | Unit |
| S-09 | P2 | Publish dry-run all crates (`make publish-crates-dry`) from a clean checkout to confirm packaging completeness | Integration (CI) |
| S-10 | P3 | Measure individual crate compile times with `cargo build --timings` to identify bottlenecks (workflow depends on opentelemetry, tonic, jsonschema) | Human Exploration |
| S-11 | P3 | Verify `Cargo.lock` is checked in and deterministic: delete and regenerate, diff for unexpected changes | Unit (CI) |
| S-12 | P1 | Confirm FFI crate produces `cdylib`, `staticlib`, and `rlib` outputs on all target triples; validate header file `simple_agents.h` matches exported symbols | Integration |
| S-13 | P2 | Assert that all workspace member crates share the same `version.workspace = true` or pinned version, and no stale hardcoded versions exist | Unit |
| S-14 | P3 | Run `cargo clippy --all-targets` with `-W clippy::pedantic` to surface deeper code quality issues | Human Exploration |
| S-15 | P2 | Confirm the `examples` crate compiles as a workspace member and its `Cargo.toml` version stays synchronized with the workspace version | Integration (CI) |

### 1.3 Coverage Gaps

- No fuzz testing infrastructure for any crate
- No API surface diff tooling (e.g., `cargo public-api`) to detect breaking changes
- No cyclomatic complexity or code coverage gates per crate
- The `simple-agents-macros` crate has only 1 test file; proc-macro error paths are untested

---

## 2. FUNCTION -- What the Product DOES

### 2.1 Analysis

**Core Capabilities**:
1. **Unified Client** (`simple-agents-core`): Builder pattern, provider registration, routing delegation, cache integration, middleware hooks, healing orchestration. Supports both sync (complete) and streaming paths.
2. **Provider Adapters**: OpenAI (full streaming + structured output), Anthropic (streaming + thinking tokens), OpenRouter (delegating to OpenAI-compat base). Each provider has `transform_request`, `execute`, `transform_response` pipeline.
3. **Routing**: Round-robin, latency-weighted, cost-based, fallback chain, circuit breaker. All implement `RoutingStrategy` trait.
4. **Caching**: In-memory TTL with eviction, NoOp backend. Cache key derived from full serialized request.
5. **Healing**: Three-phase JSON parser (strip+fix, standard parse, lenient state machine), coercion engine (string-to-number, fuzzy field matching, union resolution), streaming parser with partial extraction.
6. **Workflow**: YAML DSL with canonical IR (v0), DAG scheduler with parallel fan-out, expression evaluation, subgraph support, trace recording/replay, checkpoint/recovery, gRPC worker delegation.
7. **CLI**: `complete`, `chat`, `benchmark`, `workflow mermaid/validate/run` commands.

**Functional Observations**:
- The NAPI binding explicitly rejects `healed_json` and `schema` modes in streaming: "healed_json and schema modes are not yet supported in Node bindings"
- The FFI layer creates a new Tokio runtime per client (`Mutex<Runtime>`), which is a blocking design
- Streaming usage in the streaming return path does not populate `usage` (hardcoded to zeros in NAPI)
- The `execute_stream` default implementation in the Provider trait silently disables streaming by setting `stream: false` and wrapping in a single-chunk stream -- this could mask provider-level streaming failures

### 2.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| F-01 | P0 | Send 50 concurrent completion requests through the unified client with a mock provider; assert no request drops, correct routing distribution, and response integrity | Integration |
| F-02 | P0 | Execute a streaming request through each provider adapter (OpenAI, Anthropic, OpenRouter) with a mock HTTP server; assert chunks arrive in order and final chunk carries usage stats | Integration |
| F-03 | P0 | Submit a malformed JSON response body `{"name": "test", "age": 25,}` wrapped in markdown fences through the healing pipeline; assert parsed value matches expected, CoercionFlag::StrippedMarkdown + FixedTrailingComma present, confidence >= 0.9 | Unit |
| F-04 | P1 | Trigger the fallback router with a primary provider returning 500 3 consecutive times; assert circuit breaker opens, fallback provider receives request, and circuit re-closes after cooldown | Integration |
| F-05 | P1 | Exercise the cost-based router with 3 providers at different price points; send 100 requests and assert traffic distribution favors lowest cost within statistical bounds | Unit |
| F-06 | P1 | Execute a YAML workflow with conditional branching (if/else) and verify the correct branch executes based on LLM output classification | Integration |
| F-07 | P1 | Run a YAML workflow that exceeds `max_steps` (default 256); assert the runtime aborts with a clear error and partial trace is available | Integration |
| F-08 | P1 | Test the healing coercion engine with schema containing nested objects, optional fields with defaults, and union types; assert coercion produces valid output with correct confidence scores | Unit |
| F-09 | P1 | Test `CompletionRequest::validate()` with boundary values: temperature at 0.0, 2.0, -0.001, 2.001; top_p at 0.0, 1.0; exactly 1000 messages; empty model string | Unit |
| F-10 | P2 | Execute streaming structured output through the healing streaming parser with partial JSON arriving across 10 chunks; assert progressive emission and final value completeness | Integration |
| F-11 | P2 | Register a middleware that rejects requests containing "forbidden" in content; assert the middleware fires before routing and returns appropriate error | Unit |
| F-12 | P2 | Test provider `from_env()` factory with missing, empty, and malformed API key environment variables for each provider type | Unit |
| F-13 | P2 | Execute a workflow with `parallel` node having 5 branches; inject one branch failure; assert the merge node receives results from successful branches with correct `MergePolicy` handling | Integration |
| F-14 | P2 | Test `map` node with an array of 100 items; assert all items processed and output array preserves order | Integration |
| F-15 | P2 | Exercise tool calling through OpenAI provider: send request with tool definitions, mock tool_calls response, send tool result message back; assert round-trip message integrity | Integration |
| F-16 | P2 | Test response caching: send identical request twice with cache enabled; assert second request returns cached response without hitting provider, and cache miss/hit metrics are correct | Integration |
| F-17 | P3 | Inject a response that requires every coercion flag type (StrippedMarkdown, FixedTrailingComma, TruncatedJson, StringToNumber, FuzzyFieldMatch) simultaneously; assert all flags reported | Unit |
| F-18 | P3 | Test the CLI `workflow mermaid` command produces valid Mermaid diagram syntax for a complex workflow YAML | Integration |
| F-19 | P3 | Test expression evaluation in workflow runtime with nested variable references `{{steps.classify.output.category}}` and assert correct value resolution | Unit |
| F-20 | P1 | Test that `execute_stream` default implementation correctly falls back to single-chunk behavior when a provider does not override it; assert the chunk contains complete response data | Unit |
| F-21 | P2 | Exercise workflow trace recording and replay: run a workflow, capture the trace, replay it, and assert `ReplayReport` shows no divergence | Integration |
| F-22 | P3 | Test the `reduce` node with all supported `ReduceOperation` variants (collect, first, last, concat) and verify each produces expected output | Unit |

### 2.3 Coverage Gaps

- No property-based testing for workflow scheduler DAG ordering (only healing has proptest)
- No mutation testing to assess test suite strength
- Workflow `filter` node and `subgraph` node have no dedicated test files
- No negative testing for workflow YAML parsing (malformed YAML, missing required fields)
- No testing of provider-specific error code mapping (e.g., Anthropic 529 overloaded vs OpenAI 429 rate limit)

---

## 3. DATA -- What it PROCESSES

### 3.1 Analysis

**Data Types and Flows**:
1. **Requests**: `CompletionRequest` with messages (role, content, tool_call_id, tool_calls), model ID, temperature, top_p, max_tokens, stop sequences, response_format, tool definitions
2. **Responses**: `CompletionResponse` with choices (message, finish_reason), usage (prompt/completion/reasoning tokens), healing_metadata (flags, confidence, original_error)
3. **Streaming**: `CompletionChunk` with `ChoiceDelta` (role, content, reasoning_content, tool_call deltas)
4. **Configuration**: `RetryConfig`, `HealingConfig`, `ProviderConfig`, `RateLimitConfig`, `CircuitBreakerConfig`
5. **Workflow State**: `WorkflowDefinition` (IR), node graph, expression evaluation scope (JSON Values), checkpoint/trace data
6. **Sensitive Data**: API keys handled via `ApiKey` type with REDACTED Debug output, blake3 hashing for equality checks

**Data Observations**:
- `ApiKey` uses `subtle::ConstantTimeEq` for comparison and blake3 for hashing -- good security practice
- `ProviderConfig` serializes `api_key` as `Option<String>` without skip -- potential leak risk in logs/serialization
- Cache key is derived from full serialized request including API key material in the model field
- Workflow expression evaluation scope has a 128KB limit (`max_expression_scope_bytes`) -- could be exceeded with large LLM outputs
- Message content validation caps at 1MB per message and 10MB total, but no validation on tool call arguments size
- The `duration_millis` serde helper truncates `u128` to `u64` which is technically lossy for extremely long durations

### 3.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| D-01 | P0 | Create an `ApiKey`, serialize a `ProviderRequest` containing it to JSON, and assert the API key value appears nowhere in the serialized output | Unit |
| D-02 | P0 | Submit a request with content containing null bytes (`\0`); assert validation rejects it before it reaches the provider | Unit |
| D-03 | P0 | Construct messages with content exactly at 1MB boundary, at 1MB+1, and at 10MB total boundary; assert validation accepts/rejects correctly at each boundary | Unit |
| D-04 | P1 | Inject a workflow expression scope exceeding 128KB; assert runtime rejects with a clear SecurityLimits error rather than OOM | Integration |
| D-05 | P1 | Send a request through the cache path; inspect the cache key and assert it does not contain raw API key material | Unit |
| D-06 | P1 | Deserialize a `RetryConfig` with `max_attempts: 0` from JSON; assert the custom deserializer rejects it | Unit |
| D-07 | P1 | Roundtrip-serialize every public type through `serde_json`: `CompletionRequest`, `CompletionResponse`, `CompletionChunk`, `Usage`, `HealingMetadata`, `CoercionFlag` | Unit |
| D-08 | P2 | Test `Usage::new()` with u32 overflow: `prompt_tokens = u32::MAX, completion_tokens = 1`; assert `total_tokens` wraps or is handled | Unit |
| D-09 | P2 | Test `HealingMetadata::new()` with confidence values at boundaries: -1.0, 0.0, 0.5, 1.0, 1.5; assert clamping to [0.0, 1.0] | Unit |
| D-10 | P2 | Construct a `CompletionResponse` with `thinking_tokens` alias in JSON; assert it deserializes correctly into `reasoning_tokens` field | Unit |
| D-11 | P2 | Feed the healing parser with extremely large input (10MB malformed JSON string); assert it does not OOM and either parses or returns a clean error | Unit |
| D-12 | P2 | Test workflow YAML with input containing Unicode, emoji, right-to-left text, and null characters in step outputs; assert data integrity through the pipeline | Integration |
| D-13 | P2 | Validate that serialized `ProviderConfig` omits `api_key` field when `None` (via `skip_serializing_if`) | Unit |
| D-14 | P3 | Test `parse_messages_json` and `parse_messages_value` with: empty array, single message, message with empty content, tool message missing tool_call_id | Unit |
| D-15 | P3 | Create a cached response, modify the underlying provider response, and re-fetch; assert the cached version is returned (staleness check) | Integration |
| D-16 | P3 | Test the JSON schema validation in workflow IR with `jsonschema` crate using schemas with recursive references, oneOf, and allOf | Unit |
| D-17 | P1 | Assert that `ProviderConfig`'s `api_key` field is NOT serialized when present -- it currently uses `skip_serializing_if = "Option::is_none"` which DOES serialize when `Some`; this is a data exposure risk | Unit |
| D-18 | P2 | Test tool call arguments with deeply nested JSON (100 levels), extremely long strings (1MB), and empty objects; verify no panics through the provider adapter | Unit |

### 3.3 Coverage Gaps

- No data corruption testing (bit-flip injection in cached responses)
- No PII/sensitive data detection in workflow trace logs
- Tool call argument size has no validation limits
- No testing of data lifecycle in the cache (TTL expiry, eviction under memory pressure)
- Workflow checkpoint serialization/deserialization is untested at scale

---

## 4. INTERFACES -- How it CONNECTS

### 4.1 Analysis

**Interface Surfaces**:
1. **Rust Public API**: Builder patterns, trait-based extensibility, prelude module
2. **CLI** (`clap`): `complete`, `chat`, `benchmark`, `workflow` subcommands
3. **C FFI**: 12 exported functions (`sa_client_new_from_env`, `sa_complete`, `sa_complete_messages_json`, `sa_stream_messages`, `sa_run_email_workflow_yaml`, `sa_run_workflow_yaml`, `sa_run_workflow_yaml_with_options`, `sa_run_workflow_yaml_with_events`, `sa_run_workflow_yaml_stream_events`, `sa_last_error_message`, `sa_string_free`, `sa_client_free`)
4. **Python/PyO3**: Classes exposed as Python module with async support via `pyo3-asyncio` pattern
5. **Node.js/NAPI-RS**: `Client` class with `complete()`, `stream()`, `stream_events()`, workflow methods; TypeScript type definitions generated
6. **Go/CGO**: Thin wrapper over C FFI
7. **gRPC**: Worker contract via `tonic` for workflow worker pool
8. **YAML DSL**: Workflow definition language with IR validation

**Interface Observations**:
- FFI uses `unsafe impl Send for CallbackWorkflowEventSink` + `unsafe impl Sync` with only a comment as justification -- no formal safety proof
- FFI `thread_local!` for `LAST_ERROR` means error state is per-thread, not per-client -- multi-client usage on same thread loses error context
- NAPI binding casts `f64` to `f32` for temperature/top_p (`temperature as f32`) which is lossy
- Go bindings depend on CGO which has significant build/runtime overhead
- No OpenAPI/protobuf schema for the FFI interface -- the header file is hand-maintained
- Python binding creates a new `tokio::runtime::Runtime` per client instance -- resource-heavy

### 4.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| I-01 | P0 | Call every FFI function with null client pointer; assert each returns null/error without crashing (no segfault) | Unit |
| I-02 | P0 | Call `sa_string_free` and `sa_client_free` with null pointers; assert no crash. Call `sa_string_free` with an already-freed pointer (double-free); observe behavior (this WILL segfault -- document as known unsafe) | Human Exploration |
| I-03 | P0 | Pass non-UTF-8 byte sequences as C string arguments to every FFI function; assert graceful error rather than undefined behavior | Unit |
| I-04 | P1 | Call `sa_complete` followed by `sa_last_error_message` on the same thread; then call it again from a second thread; assert error state is correctly isolated per thread | Integration |
| I-05 | P1 | Create a Node.js `Client`, call `complete()` with temperature `0.123456789` (f64); assert the Rust side receives it without precision loss beyond f32 bounds; document the lossy cast | Unit |
| I-06 | P1 | Run the Node.js contract test suite (`npm run test:contract`); assert all contract fixtures pass | Integration (CI) |
| I-07 | P1 | Run the Go binding contract fixtures (`make test-go-bindings`); assert all pass and the CGO header matches the current FFI exports | Integration (CI) |
| I-08 | P1 | Generate TypeScript definitions from NAPI crate; diff against checked-in `.d.ts` file and assert no unintended API surface changes | Integration (CI) |
| I-09 | P2 | Submit a workflow YAML with invalid syntax (bad indentation, unknown node types, missing required fields); assert clear validation errors are returned | Unit |
| I-10 | P2 | Exercise the streaming callback in FFI (`sa_stream_messages`) with a callback that returns non-zero (cancellation); assert the stream stops and returns appropriate status | Integration |
| I-11 | P2 | Test Python binding `complete()` with async/await pattern in Python; assert it does not block the Python GIL during the HTTP call | Integration |
| I-12 | P2 | Test the `parity-fixtures/binding_contract.json` contract across Rust, Python, Node.js, and Go bindings; assert identical behavior for each fixture | Integration |
| I-13 | P3 | Test the gRPC worker pool (`simple-agents-workflow-workers`) with a mock gRPC server: connect, execute, disconnect, reconnect; assert pool management works correctly | Integration |
| I-14 | P3 | Call the CLI `workflow validate` command with each example YAML file in the repository; assert all pass validation | Integration (CI) |
| I-15 | P2 | Assert that the FFI header file `simple_agents.h` declares all 12 exported functions and their signatures match the Rust `#[no_mangle]` declarations | Unit |
| I-16 | P3 | Test NAPI binding `run_workflow_yaml` with empty `workflowPath` string; assert clear error (currently handled but untested) | Unit |

### 4.3 Coverage Gaps

- No automated FFI memory leak detection (e.g., Valgrind or AddressSanitizer integration)
- No fuzz testing of FFI string inputs
- No backward compatibility testing for YAML DSL schema changes
- gRPC worker pool has no integration tests in the repository
- CLI has no end-to-end test harness
- Python binding test suite (`make test-python`) requires provider API keys -- no mock-based unit tests

---

## 5. PLATFORM -- What it DEPENDS ON

### 5.1 Analysis

**Runtime Dependencies**:
- **Rust Toolchain**: Edition 2021, MSRV 1.75 (healing crate has 1.70)
- **Async Runtime**: Tokio with full features (`rt-multi-thread`, `time`, `sync`, `io`)
- **HTTP Client**: `reqwest 0.12` with `json`, `stream`, `default-tls`, `http2`, `gzip`, `brotli`, `deflate`
- **Serialization**: `serde 1.0` + `serde_json 1.0` + `serde_yaml 0.9`
- **Cryptography**: `blake3 1.5`, `subtle 2.6`
- **gRPC**: `tonic 0.12`, `prost 0.13`, `protoc-bin-vendored 3`
- **Observability**: `opentelemetry 0.24`, `metrics 0.23`, `tracing 0.1`
- **Rate Limiting**: `governor 0.6`
- **JSON Schema**: `jsonschema 0.18`

**Build System**:
- Cargo workspace with `resolver = "2"`
- Makefile with 40+ targets
- Scripts for version sync, coverage, binding contracts
- GitHub Actions CI: `bindings-ci.yml`, `workflow-benches.yml`, `docs-quality.yml`, `deploy-docs.yml`

**Platform Observations**:
- MSRV inconsistency: workspace specifies 1.75, healing crate specifies 1.70 independently
- `serde_yaml 0.9` is unmaintained (last release 2023) -- consider `serde_yml`
- `reqwest` uses `default-tls` which links to system OpenSSL on Linux -- could cause issues in minimal Docker images
- Binding crates disable Rust tests (`test = false, doctest = false`) -- no Rust-level testing for NAPI/Py code
- The Python binding uses `abi3-py312` which limits to Python 3.12+ only
- No `rust-toolchain.toml` file to pin the Rust toolchain version

### 5.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| P-01 | P0 | Build the entire workspace with the MSRV (1.75); assert compilation succeeds without errors | Integration (CI) |
| P-02 | P1 | Build the `simple-agents-healing` crate with Rust 1.70 independently to validate its declared MSRV | Integration (CI) |
| P-03 | P1 | Run `cargo test --all` with `RUSTFLAGS="-Zsanitizer=address"` on nightly to detect memory issues in unsafe FFI code | Integration (CI-nightly) |
| P-04 | P1 | Build the FFI crate as `cdylib` for Linux x86_64, macOS arm64, and Windows x86_64; assert all three produce valid shared libraries | Integration (CI) |
| P-05 | P2 | Test `reqwest` TLS behavior by pointing a provider at a server with an expired certificate; assert the error is caught and reported, not silently accepted | Integration |
| P-06 | P2 | Build the Python wheel and install it in Python 3.12 and Python 3.13; run the test suite on both | Integration (CI) |
| P-07 | P2 | Build the Node.js NAPI addon on Node 18 LTS and Node 22 LTS; run the test suite on both | Integration (CI) |
| P-08 | P2 | Run `cargo build --all` inside a minimal Docker container (Alpine musl) to detect missing system dependencies | Integration |
| P-09 | P3 | Compile with `--cfg tokio_unstable` and run tokio-console to inspect runtime behavior under load | Human Exploration |
| P-10 | P3 | Test that `protoc-bin-vendored` correctly provides protoc without requiring system installation | Integration (CI) |
| P-11 | P3 | Profile memory usage of the in-memory cache under sustained load (10K entries); measure RSS growth and eviction behavior | Human Exploration |
| P-12 | P2 | Run the full test suite on both `default-tls` and `rustls-tls` feature flags to confirm TLS backend portability | Integration (CI) |

### 5.3 Coverage Gaps

- No Windows CI (all examples assume Unix paths and `.env` file sourcing)
- No Docker-based integration testing
- No load testing or performance regression benchmarks in CI (benchmarks exist but are not gated)
- No testing with OpenSSL 3.x vs 1.1.x specifically
- `serde_yaml 0.9` vulnerability/EOL status not tracked

---

## 6. OPERATIONS -- How it's USED

### 6.1 Analysis

**Operational Patterns**:
1. **Library Usage**: Import crates, build client with providers, call `complete()` or `stream()`
2. **CLI Usage**: `cargo run -p simple-agents-cli -- <subcommand>`
3. **Binding Usage**: Initialize client from env vars, call methods
4. **Workflow Execution**: Author YAML, validate, run with trace/replay

**Operational Observations**:
- No runtime health check endpoint or readiness probe for production deployments
- Error handling in bindings converts all errors to string messages, losing structured error context
- The FFI `LAST_ERROR` pattern is a well-known anti-pattern for concurrent access
- Workflow replay feature is powerful but undocumented in terms of production usage patterns
- No graceful shutdown mechanism for long-running workflows
- The version sync mechanism (`make version-sync`) touches 6+ files and auto-commits + pushes -- one failure mid-way leaves partial state
- No configuration file support -- all config is via environment variables or code

### 6.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| O-01 | P0 | Create a client, run 10 completions successfully, then kill the provider mock; assert the client degrades gracefully (circuit breaker opens) rather than hanging | Integration |
| O-02 | P1 | Execute `make version-patch` in a test environment; assert all 6+ files are updated consistently and the git tag is created correctly | Integration |
| O-03 | P1 | Test error propagation from provider through client to each binding layer (FFI, NAPI, Py); assert error messages are human-readable and contain actionable information | Integration |
| O-04 | P1 | Run a workflow with `enable_trace_recording: true`; assert the trace file is written, contains all node executions, and can be loaded for replay | Integration |
| O-05 | P2 | Intentionally poison the Mutex in the FFI layer (by panicking inside a lock); assert subsequent calls handle the poisoned lock gracefully (code uses `unwrap_or_else(poisoned.into_inner())` in circuit breaker) | Unit |
| O-06 | P2 | Test `make check-publish` end-to-end in CI; assert it catches missing metadata, formatting issues, and test failures | Integration (CI) |
| O-07 | P2 | Simulate a rate-limited response (429 with Retry-After header) from OpenAI provider; assert the retry logic respects the header value and eventually succeeds | Integration |
| O-08 | P2 | Test the `pre-commit-hook.sh` script with staged files containing formatting violations; assert it blocks the commit | Integration |
| O-09 | P2 | Exercise the middleware `on_error` callback with every `SimpleAgentsError` variant; assert each is handled without panic | Unit |
| O-10 | P3 | Test the Makefile `run-go-chat-history` target with mock env; assert CGO flags are correctly set and the binary builds | Integration |
| O-11 | P3 | Run the LOC report script (`make loc-report`) and verify output format matches README expectations | Integration |
| O-12 | P3 | Test workflow checkpoint save/restore: run 5 nodes, checkpoint, kill runtime, restore from checkpoint, and complete remaining nodes; assert final output matches non-interrupted run | Integration |
| O-13 | P2 | Test concurrent client registration (`register_provider`) from multiple tasks; assert the RwLock handles contention without deadlock | Integration |
| O-14 | P3 | Explore the tracing output with `tracing-subscriber` at DEBUG level; document which spans are emitted and verify they contain useful diagnostic information | Human Exploration |

### 6.3 Coverage Gaps

- No runbook or operational playbook for common failure modes
- No metrics export validation (Prometheus endpoint is optional feature, untested)
- No testing of the `governor` rate limiter behavior under burst conditions
- No disaster recovery testing for workflow state
- No canary or blue/green deployment testing guidance

---

## 7. TIME -- WHEN Things Happen

### 7.1 Analysis

**Temporal Aspects**:
1. **Build Time**: Full workspace with 14 crates + tonic/OTel deps -- significant compile time
2. **Request Latency**: Provider HTTP call + optional cache lookup + optional healing + middleware hooks
3. **Cache TTL**: Default 60s, configurable via builder
4. **Circuit Breaker Timing**: Default 10s open duration, configurable cooldown
5. **Rate Limiting**: `governor 0.6` with token bucket algorithm, per-instance or shared scope
6. **Retry Backoff**: Exponential with jitter, default 100ms initial, 10s max, 2x multiplier, 3 attempts
7. **Workflow Timeouts**: Per-node `timeout` via `NodeExecutionPolicy`, global `max_steps` limit
8. **Streaming**: Chunk-by-chunk delivery with middleware instrumentation at stream boundaries

**Temporal Observations**:
- Circuit breaker uses `Instant::now()` which is monotonic but the `Mutex<CircuitBreakerInner>` inner state could exhibit contention under high load
- Cache TTL is set once at client build time with no per-request override
- Retry backoff jitter uses `rand::thread_rng()` which is cryptographically secure but unnecessary for jitter -- `SmallRng` would be more appropriate
- No request timeout enforcement in the client layer -- depends entirely on provider-level timeout
- Streaming middleware `after_stream` fires only when stream is fully consumed -- if caller drops the stream early, middleware is never called
- Workflow `max_steps` is a global counter, not a per-node timeout -- a single slow node can consume the entire budget
- The FFI layer's `runtime.block_on()` pattern means the Tokio runtime's thread pool is occupied during synchronous FFI calls -- could starve async tasks

### 7.2 Test Ideas

| # | Priority | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| T-01 | P0 | Set circuit breaker `open_duration` to 100ms; trigger it open via failures; wait 150ms; send a request; assert it goes through in half-open state and closes on success | Integration |
| T-02 | P0 | Configure cache TTL to 1 second; send a request (cache miss); send again immediately (cache hit); wait 1.5 seconds; send again (cache miss); assert each step behaves correctly | Integration |
| T-03 | P1 | Configure retry with 3 attempts and 50ms initial backoff; mock provider to fail first 2 attempts; measure total elapsed time and assert it falls within expected bounds (50ms + 100ms + jitter) | Integration |
| T-04 | P1 | Start a streaming request; consume 2 chunks; drop the stream without consuming remaining chunks; assert middleware `after_stream` is NOT called (documenting current behavior) and assert no resource leak | Integration |
| T-05 | P1 | Set workflow node timeout to 500ms; mock an LLM node that takes 2 seconds; assert the node is cancelled and the workflow reports a timeout error | Integration |
| T-06 | P1 | Send 100 concurrent requests through the rate limiter configured at 10 req/s with burst of 20; measure actual throughput and assert it respects the limit within tolerance | Integration |
| T-07 | P2 | Set retry `max_backoff` to 200ms; configure 10 retry attempts with 100ms initial and 2x multiplier; assert no backoff exceeds 200ms (capping works) | Unit |
| T-08 | P2 | Measure time from `CompletionRequest` submission to first `CompletionChunk` delivery in streaming mode; assert latency overhead from client layer is < 10ms | Integration |
| T-09 | P2 | Test the circuit breaker `record_result` method with `ProviderError::BadRequest` (non-retryable); assert it does NOT increment the failure counter | Unit |
| T-10 | P2 | Run a workflow with 5 parallel branches, each taking a random 100-500ms; assert all branches complete and the `parallel` node respects `scheduler_max_in_flight` | Integration |
| T-11 | P2 | Test jitter randomness: generate 1000 backoff values with jitter enabled; assert they are not all identical and standard deviation is > 0 | Unit |
| T-12 | P3 | Configure two clients sharing a Tokio runtime via FFI; send requests through both simultaneously; assert no deadlock from the `Mutex<Runtime>` contention | Integration |
| T-13 | P3 | Test cache eviction under memory pressure: fill cache with 10K entries, each 10KB; assert memory usage is bounded and old entries are evicted | Human Exploration |
| T-14 | P3 | Benchmark the healing parser with a 1MB JSON input; assert parse time is < 100ms on reference hardware | Unit (Benchmark) |
| T-15 | P2 | Test that the FFI streaming callback receives chunks within 50ms of Tokio receiving them; assert the `block_on` pattern does not introduce excessive buffering delay | Integration |

### 7.3 Coverage Gaps

- No chaos testing (random delay injection, network partition simulation)
- No long-running stability tests (hours/days of continuous operation)
- No clock-skew testing for distributed workflow scenarios
- No testing of cache stampede behavior (many concurrent requests for the same uncached key)
- No testing of Tokio runtime behavior under thread starvation conditions

---

## Risk Heat Map

```
                 LOW                MEDIUM              HIGH               CRITICAL
              +-----------+    +------------+    +-----------+    +-------------+
 Structure    |           |    |  S-06,S-08 |    |  S-01,S-02|    |             |
              |           |    |  S-13,S-15 |    |  S-03,S-12|    |             |
              +-----------+    +------------+    +-----------+    +-------------+
 Function     |           |    |  F-17,F-18 |    | F-04,F-05 |    | F-01,F-02   |
              |           |    |  F-19,F-22 |    | F-06-F-16 |    | F-03        |
              +-----------+    +------------+    +-----------+    +-------------+
 Data         |           |    |  D-13,D-14 |    | D-04,D-05 |    | D-01,D-02   |
              |           |    |  D-15,D-16 |    | D-06-D-12 |    | D-03,D-17   |
              +-----------+    +------------+    +-----------+    +-------------+
 Interfaces   |           |    |  I-13,I-14 |    | I-04-I-12 |    | I-01,I-02   |
              |           |    |  I-16      |    | I-15      |    | I-03        |
              +-----------+    +------------+    +-----------+    +-------------+
 Platform     | P-09,P-10 |    | P-06,P-07  |    | P-01,P-03 |    |             |
              | P-11      |    | P-08,P-12  |    | P-04      |    |             |
              +-----------+    +------------+    +-----------+    +-------------+
 Operations   | O-10,O-11 |    | O-05,O-08  |    | O-01,O-03 |    |             |
              | O-14      |    | O-09,O-12  |    | O-02,O-04 |    |             |
              +-----------+    +------------+    +-----------+    +-------------+
 Time         | T-13,T-14 |    | T-07,T-08  |    | T-03,T-05 |    | T-01,T-02   |
              |           |    | T-11       |    | T-06,T-10 |    | T-04        |
              +-----------+    +------------+    +-----------+    +-------------+
```

---

## Priority-Ordered Test Backlog (Top 50)

| Rank | ID | Priority | Dimension | Test Idea Summary | Risk | Automation |
|------|----|----------|-----------|-------------------|------|------------|
| 1 | I-01 | P0 | Interfaces | FFI null pointer safety for all 12 functions | Critical | Unit |
| 2 | I-03 | P0 | Interfaces | FFI non-UTF-8 input injection | Critical | Unit |
| 3 | D-01 | P0 | Data | API key not exposed in serialized ProviderRequest | Critical | Unit |
| 4 | D-02 | P0 | Data | Null byte injection rejection in messages | Critical | Unit |
| 5 | D-03 | P0 | Data | Message size boundary validation (1MB/10MB) | Critical | Unit |
| 6 | F-01 | P0 | Function | 50 concurrent requests through unified client | Critical | Integration |
| 7 | F-02 | P0 | Function | Streaming correctness per provider with mock HTTP | Critical | Integration |
| 8 | F-03 | P0 | Function | Healing parser with malformed JSON + markdown | Critical | Unit |
| 9 | S-01 | P0 | Structure | Independent crate builds (no circular deps) | High | Unit (CI) |
| 10 | T-01 | P0 | Time | Circuit breaker open/half-open/close timing | Critical | Integration |
| 11 | T-02 | P0 | Time | Cache TTL expiry correctness | Critical | Integration |
| 12 | O-01 | P0 | Operations | Graceful degradation on provider death | High | Integration |
| 13 | P-01 | P0 | Platform | MSRV 1.75 build succeeds | High | Integration (CI) |
| 14 | D-17 | P1 | Data | ProviderConfig serializes api_key when Some (exposure risk) | High | Unit |
| 15 | I-02 | P0 | Interfaces | FFI double-free and null-free safety | Critical | Human Exploration |
| 16 | F-04 | P1 | Function | Fallback router with circuit breaker integration | High | Integration |
| 17 | F-05 | P1 | Function | Cost-based router traffic distribution | High | Unit |
| 18 | F-06 | P1 | Function | Workflow conditional branching | High | Integration |
| 19 | F-07 | P1 | Function | Workflow max_steps abort with partial trace | High | Integration |
| 20 | F-08 | P1 | Function | Healing coercion with nested schema + unions | High | Unit |
| 21 | F-09 | P1 | Function | CompletionRequest boundary validation | High | Unit |
| 22 | F-20 | P1 | Function | execute_stream default fallback behavior | High | Unit |
| 23 | D-04 | P1 | Data | Expression scope overflow security limit | High | Integration |
| 24 | D-05 | P1 | Data | Cache key does not contain API key material | High | Unit |
| 25 | D-06 | P1 | Data | RetryConfig zero max_attempts rejection | High | Unit |
| 26 | D-07 | P1 | Data | Roundtrip serde for all public types | Medium | Unit |
| 27 | I-04 | P1 | Interfaces | FFI LAST_ERROR thread isolation | High | Integration |
| 28 | I-05 | P1 | Interfaces | NAPI f64-to-f32 precision loss documentation | Medium | Unit |
| 29 | I-06 | P1 | Interfaces | Node.js contract test suite passes | High | Integration (CI) |
| 30 | I-07 | P1 | Interfaces | Go binding contract test suite passes | High | Integration (CI) |
| 31 | I-08 | P1 | Interfaces | TypeScript definition diff check | Medium | Integration (CI) |
| 32 | S-02 | P1 | Structure | Duplicate crate version detection | Medium | Unit (CI) |
| 33 | S-03 | P1 | Structure | Deny warnings on all targets | Medium | Unit (CI) |
| 34 | S-04 | P1 | Structure | Type crate has zero runtime dependencies | Medium | Unit |
| 35 | S-12 | P1 | Structure | FFI produces all 3 output types on all targets | Medium | Integration |
| 36 | T-03 | P1 | Time | Retry backoff timing correctness | High | Integration |
| 37 | T-04 | P1 | Time | Dropped stream middleware behavior | High | Integration |
| 38 | T-05 | P1 | Time | Workflow node timeout enforcement | High | Integration |
| 39 | T-06 | P1 | Time | Rate limiter throughput correctness | High | Integration |
| 40 | O-02 | P1 | Operations | Version bump consistency across all files | Medium | Integration |
| 41 | O-03 | P1 | Operations | Error propagation readability through bindings | High | Integration |
| 42 | O-04 | P1 | Operations | Workflow trace recording and replay | Medium | Integration |
| 43 | P-02 | P1 | Platform | Healing crate MSRV 1.70 build | Medium | Integration (CI) |
| 44 | P-03 | P1 | Platform | AddressSanitizer on FFI unsafe code | High | Integration (CI) |
| 45 | P-04 | P1 | Platform | FFI cross-platform shared library output | Medium | Integration (CI) |
| 46 | F-10 | P2 | Function | Streaming structured output progressive emission | Medium | Integration |
| 47 | F-11 | P2 | Function | Middleware rejection before routing | Medium | Unit |
| 48 | F-13 | P2 | Function | Parallel workflow with branch failure | Medium | Integration |
| 49 | F-15 | P2 | Function | Tool calling round-trip through OpenAI adapter | Medium | Integration |
| 50 | F-16 | P2 | Function | Cache hit/miss with metrics validation | Medium | Integration |

---

## Coverage Matrix

| SFDIPOT Factor | Subcategory | Test Ideas | Tests Exist | Gap Severity |
|---------------|-------------|------------|-------------|--------------|
| **Structure** | Code Integrity | S-01,S-03,S-07 | Partial (clippy, fmt) | Medium |
| | Dependencies | S-02,S-04,S-13 | Minimal | Medium |
| | Non-Executable Files | S-08,S-15 | None | Low |
| | Executable Files | S-09,S-12 | Partial (dry-run) | Medium |
| | Cross-Crate Coupling | S-06,S-10 | None | High |
| **Function** | Client Orchestration | F-01,F-11,F-16 | Partial (unit mocks) | Medium |
| | Provider Adapters | F-02,F-12,F-15,F-20 | Partial (mock only) | High |
| | Routing/Resilience | F-04,F-05 | Partial (circuit breaker unit) | Medium |
| | Healing/Coercion | F-03,F-08,F-10,F-17 | Good (proptest, parser_tests) | Low |
| | Workflow Runtime | F-06,F-07,F-13,F-14,F-19,F-21,F-22 | Partial (IR fixtures) | High |
| | CLI | F-18 | None | Medium |
| **Data** | Input Validation | D-02,D-03,D-14 | Good (request tests) | Low |
| | Sensitive Data | D-01,D-05,D-17 | Partial (ApiKey test) | High |
| | Serialization | D-07,D-10,D-13 | Good | Low |
| | Boundaries | D-08,D-09,D-11,D-18 | Partial | Medium |
| | Workflow Data | D-04,D-12,D-16 | Minimal | High |
| **Interfaces** | FFI Safety | I-01,I-02,I-03,I-15 | Partial (ffi_contract.rs) | Critical |
| | Binding Parity | I-05,I-06,I-07,I-08,I-12 | Partial (contract fixtures) | High |
| | YAML DSL | I-09,I-14 | Partial (IR fixtures) | Medium |
| | Streaming Callbacks | I-10,I-11 | Minimal | High |
| | gRPC | I-13 | None | Medium |
| **Platform** | Rust Toolchain | P-01,P-02 | Unknown (no CI evidence) | High |
| | Cross-OS | P-04,P-08 | None | High |
| | Runtime Compat | P-06,P-07 | Partial (CI for bindings) | Medium |
| | TLS | P-05,P-12 | None | Medium |
| **Operations** | Error Handling | O-01,O-03,O-05,O-09 | Partial | High |
| | Versioning | O-02,O-06 | None | Medium |
| | Observability | O-04,O-14 | Minimal | High |
| | Recovery | O-07,O-12,O-13 | None | High |
| **Time** | Circuit Breaker | T-01,T-09 | Good (unit tests) | Low |
| | Cache TTL | T-02,T-13 | Minimal | High |
| | Retry Timing | T-03,T-07,T-11 | Partial (backoff tests) | Medium |
| | Streaming Timing | T-04,T-08,T-15 | None | High |
| | Workflow Timing | T-05,T-10,T-12 | None | Critical |
| | Rate Limiting | T-06 | None | High |

---

## Test Strategy Recommendations by Dimension

### Structure
- **Approach**: Automated CI gates for build health, dependency analysis, and API surface tracking
- **Priority**: Add `cargo public-api diff` to PR checks to catch unintended breaking changes
- **Investment**: Medium -- most structure tests are low-cost CI additions

### Function
- **Approach**: Expand property-based testing (proptest) beyond healing to workflow scheduler and routing. Add integration tests with mock HTTP servers for provider adapters.
- **Priority**: Workflow runtime correctness is the highest-risk area; invest in DAG scheduler invariant testing
- **Investment**: High -- workflow and streaming paths need significant new test infrastructure

### Data
- **Approach**: Boundary value analysis for all numeric fields, sensitive data audit, roundtrip serialization property tests
- **Priority**: Fix `ProviderConfig` API key serialization exposure (D-17) immediately
- **Investment**: Medium -- most data tests are unit-level and fast to implement

### Interfaces
- **Approach**: FFI safety must be the top priority. Run all FFI tests under AddressSanitizer. Expand cross-language contract fixtures. Add fuzz testing for FFI string inputs.
- **Priority**: FFI null pointer and non-UTF-8 safety are P0 blockers for production use
- **Investment**: High -- FFI testing requires specialized tooling (Valgrind, ASan, libFuzzer)

### Platform
- **Approach**: Add MSRV check to CI, test on multiple OS targets, validate TLS backend portability
- **Priority**: MSRV compliance and cross-OS FFI builds are blocking distribution quality
- **Investment**: Medium -- mostly CI configuration changes

### Operations
- **Approach**: End-to-end testing of operational workflows (version bump, publish, error propagation). Add structured logging validation.
- **Priority**: Error message quality through binding layers directly impacts developer experience
- **Investment**: Medium -- operational tests are integration-level

### Time
- **Approach**: Deterministic time testing using `tokio::time::pause()` for cache TTL, circuit breaker, and retry timing. Load testing for rate limiter and concurrent access.
- **Priority**: Cache and circuit breaker timing correctness are fundamental to production reliability
- **Investment**: High -- temporal tests are inherently complex and require careful test design

---

## Clarifying Questions

The following questions identify gaps in the available requirements and documentation that would improve test coverage:

1. **Security**: Is there a threat model for the FFI layer? The `unsafe impl Send + Sync` on `CallbackWorkflowEventSink` needs formal justification beyond a comment. What are the memory safety guarantees provided to FFI consumers?

2. **Data Retention**: What is the expected cache eviction behavior under memory pressure? The in-memory cache has no documented maximum size limit.

3. **Backward Compatibility**: What is the YAML DSL versioning strategy? The IR is currently `v0` -- what happens when `v1` is introduced? Will old YAMLs continue to work?

4. **Performance Budgets**: What are the latency requirements for the client layer overhead? Is 10ms of overhead acceptable for the routing + middleware + cache lookup path?

5. **Error Recovery**: What should happen when a workflow checkpoint is corrupted? Is there a fallback to restart from scratch, or should it fail permanently?

6. **Binding Parity**: Is feature parity across Python, Node.js, and Go an explicit goal? Currently Node.js lacks `healed_json` and `schema` mode in streaming -- is this a known limitation or a gap to close?

7. **Deployment**: Are there production deployment patterns for the FFI library? The one-runtime-per-client design could be problematic in environments with many concurrent clients.

8. **Rate Limiting**: The `governor` integration uses per-instance rate limiting by default. Is shared rate limiting across process boundaries a requirement?

9. **Observability**: What observability data should flow through the binding layers? Currently, tracing spans and metrics are Rust-only -- should Python/Node/Go consumers have access?

10. **Compliance**: Are there any regulatory requirements (SOC2, HIPAA) for the workflow trace data? The trace recorder captures full LLM prompts and responses which may contain PII.

---

## Test Data Suggestions

### Structure
- Version mismatch fixtures: Cargo.toml files with intentionally mismatched versions
- Dependency graph DOT files for visual review of coupling

### Function
- Malformed JSON corpus: 50+ variants of broken JSON for healing parser testing
- Workflow YAML corpus: Valid and invalid examples for each node type
- Provider response fixtures: Real anonymized responses from OpenAI, Anthropic, OpenRouter

### Data
- Boundary value sets for all numeric fields (temperature, top_p, max_tokens, penalties)
- Unicode edge cases: zero-width joiners, combining characters, right-to-left markers
- Large payload fixtures: 1MB, 10MB, 100MB for size limit testing

### Interfaces
- FFI input vectors: null pointers, non-UTF-8 sequences, interior null bytes, extremely long strings
- Contract fixture expansion: add tool calling, streaming, healing, and workflow scenarios

### Platform
- Docker images: Alpine (musl), Ubuntu 22.04, macOS runner, Windows runner
- Rust toolchain versions: 1.70, 1.75, stable, nightly

### Operations
- Error scenario scripts: provider timeout, rate limit, invalid API key, network partition
- Version bump simulation files for testing `make version-patch`

### Time
- Deterministic time schedules for circuit breaker state machine testing
- Load profiles: steady-state, burst, ramp-up for rate limiter testing

---

## Exploratory Test Session Suggestions

### Structure
- **Session**: Trace the dependency graph from `simple-agents-py` up through all transitive dependencies; identify any feature flag combinations that could cause compilation failures in downstream crates.

### Function
- **Session**: Take a complex real-world YAML workflow with subgraphs, parallel nodes, map, filter, and conditional branches. Execute it with a mock LLM that returns increasingly adversarial responses. Document where the runtime breaks or produces incorrect results.
- **Session**: Feed the healing parser with outputs from GPT-4, Claude 3, and Gemini for the same structured output prompt. Document which response formats each produces and how well the parser handles each.

### Data
- **Session**: Trace the lifecycle of an API key from environment variable through provider construction, request building, HTTP header injection, and response logging. Identify every point where the key could be exposed.

### Interfaces
- **Session**: Build the Go bindings on macOS with CGO enabled; exercise every FFI function from Go code and use `go test -race` to detect data races. Deliberately pass malformed inputs and observe crash behavior.

### Platform
- **Session**: Deploy the FFI library into a Python FastAPI application serving concurrent requests. Monitor thread pool exhaustion from the per-client Tokio runtime design. Identify the practical concurrency limit.

### Operations
- **Session**: Perform a full release dry-run: version bump, build all artifacts (Rust crates, Python wheel, Node package, Go binding), run all test suites, simulate publishing. Document every manual step and failure mode.

### Time
- **Session**: Run a 24-hour stability test with a mock provider that randomly returns 429, 500, and timeout responses. Monitor circuit breaker state transitions, cache hit rates, and memory growth over time.
