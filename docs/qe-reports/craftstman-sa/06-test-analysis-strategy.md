# SimpleAgents Test Analysis, Strategy & Plan

**Project**: SimpleAgents (Rust-first multi-language AI agent framework)
**Date**: 2026-03-20
**Analyst**: QE Test Architect (AQE v3)
**Scope**: 14 crates, ~53K lines Rust, cross-language bindings (Python, Node.js, Go)

---

## Executive Summary

SimpleAgents is a well-structured Rust workspace with 14 crates totaling ~53,500 lines of code across 126 Rust files, plus Python, Node.js, and Go bindings. The existing test suite contains approximately **510 total test cases** across all languages: ~350 Rust tests (inline + integration), ~80 Python tests, ~25 Go tests, ~8 Node.js tests, and 4 Criterion benchmarks.

**Overall Test Health: MODERATE (6.2/10)**

Strengths:
- Property-based testing with proptest on the parser (exemplary)
- Contract/parity fixture tests ensuring cross-language consistency
- Good healing/parser coverage (~85% estimated)
- Send+Sync compile-time assertions on all core types
- Workflow benchmark suite with concurrency regression guards

Critical Gaps:
- **Workflow runtime** (4,575 LoC in runtime.rs + 7,954 LoC yaml_runner.rs) has only inline unit tests and fixture tests -- no dedicated integration test suite
- **Router crate** (1,682 LoC) has only 1 integration test (20 lines)
- **Cache crate** (488 LoC) has zero integration tests
- **CLI crate** (1,279 LoC) has zero tests of any kind
- **Workflow-workers crate** (388 LoC) has zero integration tests
- Provider error paths, retry logic, and rate limiting are undertested at the integration level
- No end-to-end tests exercising the full stack (client -> provider -> healing -> response)
- No security-focused tests (API key handling in transit, injection, path traversal in YAML loading)
- No fuzz tests beyond proptest (no cargo-fuzz harnesses)

---

## Part 1: Current Test Inventory & Quality Analysis

### 1.1 Test Inventory Table

| Test File | Lang | Test Count | Type | Quality (1-5) | Notes |
|---|---|---|---|---|---|
| **simple-agent-type** | | | | | |
| `tests/integration_test.rs` | Rust | 12 | Integration | 4.5 | Excellent coverage of types, serialization, validation, Send+Sync |
| `src/*.rs` (inline) | Rust | ~99 | Unit | 4.0 | Strong inline tests across all 12 source files |
| **simple-agents-core** | | | | | |
| `tests/client_integration.rs` | Rust | 4 | Integration | 4.0 | Good: cache, healing, middleware hooks, uses mock provider |
| `src/client.rs` (inline) | Rust | ~0 | Unit | - | Has `#[cfg(test)]` module but no `#[test]` functions |
| **simple-agents-ffi** | | | | | |
| `tests/ffi_contract.rs` | Rust | 7 | Contract | 4.0 | Good null safety, contract fixture validation |
| **simple-agents-healing** | | | | | |
| `tests/parser_tests.rs` | Rust | 36 | Integration | 4.5 | Comprehensive: markdown, trailing commas, quotes, BOM, truncation, lenient parsing |
| `tests/property_tests.rs` | Rust | 22 | Property | 5.0 | Exemplary proptest coverage: arbitrary input, deep nesting, coercion |
| `tests/streaming_tests.rs` | Rust | 25 | Integration | 4.0 | Good streaming parser coverage |
| `tests/stream_annotations_tests.rs` | Rust | 15 | Unit | 3.5 | Thorough annotation tests but limited to data-in/data-out |
| `src/*.rs` (inline) | Rust | ~55 | Unit | 4.0 | Strong inline coverage across parser, coercion, schema, streaming |
| **simple-agents-macros** | | | | | |
| `tests/partial_type_tests.rs` | Rust | 15 | Integration | 4.5 | Covers generation, merge, serde, streaming simulation, defaults |
| **simple-agents-providers** | | | | | |
| `tests/healing_integration_tests.rs` | Rust | 13 | Integration | 4.0 | Schema conversion, healing modes (strict/lenient/disabled), complex schemas |
| `tests/openai_integration.rs` | Rust | 5 | Integration | 3.0 | Uses synthetic ProviderResponse (no HTTP mocking); no actual API calls |
| `src/*.rs` (inline) | Rust | ~104 | Unit | 3.5 | Many inline tests but retry, rate_limit only 2 each |
| **simple-agents-router** | | | | | |
| `tests/health_tracker_integration.rs` | Rust | 1 | Integration | 2.0 | Single test for health tracker config thresholds |
| `src/*.rs` (inline) | Rust | ~16 | Unit | 3.0 | Basic coverage; circuit_breaker=3, cost=4, fallback=1, latency=4, round_robin=1 |
| **simple-agents-workflow** | | | | | |
| `tests/expression_fixtures.rs` | Rust | 1 (fixture-driven) | Fixture | 4.0 | Data-driven expression evaluation tests |
| `tests/trace_fixtures.rs` | Rust | 2 | Fixture | 4.0 | Golden fixture for trace recording + invalid fixture replay |
| `tests/workflow_dsl_ir_fixtures.rs` | Rust | 1 (fixture-driven) | Fixture | 4.0 | Advanced node type coverage, wire expectations |
| `benches/runtime_benchmarks.rs` | Rust | 4 benches | Perf | 4.5 | Linear, sequential, concurrent, worker pool + regression guard |
| `src/*.rs` (inline) | Rust | ~75 | Unit | 3.0 | yaml_runner has 29 tests but runtime.rs has only 1 |
| **simple-agents-workflow-workers** | | | | | |
| `src/pool.rs` (inline) | Rust | 4 | Unit | 2.5 | Basic pool tests only |
| **simple-agents-cache** | | | | | |
| `src/memory.rs` (inline) | Rust | (see cfg) | Unit | 2.0 | Has test module but minimal coverage |
| **simple-agents-cli** | | | | | |
| (none) | - | 0 | - | 0.0 | Zero tests |
| **simple-agents-py** | | | | | |
| `tests/test_client.py` | Python | 2 | Unit | 3.0 | Basic error case only |
| `tests/test_client_builder.py` | Python | 21 | Unit | 4.0 | Good builder pattern coverage |
| `tests/test_contract_fixtures.py` | Python | 4 | Contract | 4.5 | Cross-language parity checks |
| `tests/test_direct_healing.py` | Python | 7 | Unit | 4.0 | heal_json and coerce_to_schema |
| `tests/test_error_mapping_consistency.py` | Python | 3 | Unit | 4.0 | Error type mapping verification |
| `tests/test_healing.py` | Python | 5 | Unit | 3.0 | Basic healing + method signature |
| `tests/test_integration_openai.py` | Python | 6 | Integration | 3.5 | Requires live API (CUSTOM_API_*) |
| `tests/test_routing_config.py` | Python | 25 | Unit | 4.0 | Comprehensive routing config coverage |
| `tests/test_streaming.py` | Python | 8 | Integration | 3.0 | Requires live API |
| `tests/test_streaming_parser.py` | Python | 10 | Unit | 4.0 | Good streaming parser coverage |
| `tests/test_structured_streaming.py` | Python | 10 | Integration | 3.5 | Requires live API |
| **simple-agents-napi** | | | | | |
| `test/unit.test.js` | JS | 2 | Unit | 2.0 | Export existence only |
| `test/contract.test.js` | JS | 3 | Contract | 4.0 | Fixture parity, workflow DSL |
| `test/live.test.js` | JS | 3 | Integration | 3.5 | Requires live API |
| **bindings/go** | | | | | |
| `simpleagents_test.go` | Go | 18 | Unit | 3.5 | Validation, uninitialized client, options golden |
| `contract_fixture_test.go` | Go | 2 | Contract | 4.0 | Binding + workflow fixture parity |
| `simpleagents_live_test.go` | Go | 3 | Integration | 3.5 | Requires live API |
| **workers/go** | | | | | |
| `worker_test.go` | Go | 1 | Smoke | 3.0 | gRPC smoke test |

### 1.2 Test Quality Scorecard

| Criterion | Score (1-5) | Assessment |
|---|---|---|
| **Assertion quality** | 4.0 | Specific assertions on values, types, and flags; some tests only check `is_ok()`/`is_err()` |
| **Edge case coverage** | 3.5 | Parser/healing excellent (BOM, control chars, truncation); router/workflow weak |
| **Error path testing** | 2.5 | Limited: provider errors, retry exhaustion, circuit breaker trips barely tested |
| **Test isolation** | 4.0 | Good use of MockProvider, AtomicUsize tracking; no shared mutable state between tests |
| **Flaky test risk** | 3.5 | Low risk in unit/integration; live API tests properly use `pytest.skip`/`t.Skip` |
| **Anti-pattern avoidance** | 4.0 | Tests behavior not implementation; minimal `assert!(true)` patterns |
| **Cross-language parity** | 4.5 | Excellent: `binding_contract.json` and `workflow_dsl_ir_golden.json` fixture system |
| **Property-based testing** | 5.0 | Exemplary proptest suite for parser; CoercionEngine also covered |
| **Performance testing** | 4.0 | Criterion benchmarks with regression guards for concurrency |
| **Documentation** | 3.0 | Some test files have doc comments; most rely on test names |

**Aggregate Quality Score: 3.8/5.0**

### 1.3 Flaky Test Risk Assessment

| Risk | Location | Description |
|---|---|---|
| LOW | `property_tests.rs` | proptest uses deterministic seeds by default |
| MEDIUM | `test_streaming*.py` | Live API tests may flake on network issues, mitigated by `pytest.skip` |
| MEDIUM | `live.test.js` | Node.js live tests create temp YAML files, race condition possible |
| MEDIUM | `simpleagents_live_test.go` | `os.Setenv` modifies global state (no `t.Setenv` in older Go) |
| LOW | `worker_test.go` | Uses `time.Sleep(300ms)` for server startup -- could race on slow CI |
| LOW | `runtime_benchmarks.rs` | Concurrency regression guard uses configurable thresholds |

---

## Part 2: Coverage Gap Analysis

### 2.1 Coverage Heat Map by Crate

```
Crate                          | Src LoC | Test LoC | Unit | Integ | Prop | Contract | Est. Coverage
-------------------------------|---------|----------|------|-------|------|----------|-------------
simple-agent-type              |  4,358  |    327   |  99  |  12   |  0   |    0     |  ████████░░ 80%
simple-agents-core             |  1,144  |    244   |   0  |   4   |  0   |    0     |  █████░░░░░ 50%
simple-agents-ffi              |  1,257  |    183   |   0  |   7   |  0   |    1     |  ████░░░░░░ 40%
simple-agents-healing          |  3,187  |  1,430   |  55  |  76   | 22   |    0     |  █████████░ 85%
simple-agents-macros           |    257  |    254   |   0  |  15   |  0   |    0     |  █████████░ 90%
simple-agents-providers        |  7,431  |    617   | 104  |  18   |  0   |    0     |  ██████░░░░ 55%
simple-agents-router           |  1,682  |     20   |  16  |   1   |  0   |    0     |  ███░░░░░░░ 30%
simple-agents-workflow         | 18,793  |    304   |  75  |   3   |  0   |    1     |  ██░░░░░░░░ 25%
simple-agents-workflow-workers |    388  |      0   |   4  |   0   |  0   |    0     |  ██░░░░░░░░ 20%
simple-agents-cache            |    488  |      0   |   ~  |   0   |  0   |    0     |  ██░░░░░░░░ 15%
simple-agents-cli              |  1,279  |      0   |   0  |   0   |  0   |    0     |  ░░░░░░░░░░  0%
simple-agents-py (bindings)    |  3,147  |  1,783   |   -  |  ~80  |  0   |    4     |  ██████░░░░ 60%
simple-agents-napi (bindings)  |  1,223  |    ~300  |   -  |   8   |  0   |    3     |  ███░░░░░░░ 30%
bindings/go                    |  1,242  |    ~690  |   -  |  23   |  0   |    2     |  █████░░░░░ 50%
```

### 2.2 Critical Gap Analysis by Crate

#### simple-agents-workflow (CRITICAL -- 18,793 LoC, ~25% estimated coverage)

**What is tested:**
- Expression evaluation (via fixture file)
- Trace recording (golden fixture)
- DSL-to-IR transformation (fixture-driven)
- yaml_runner inline tests (29 tests, good for YAML parsing)
- Validation rules (12 inline tests)
- Runtime benchmarks (4 criterion benchmarks)

**What is NOT tested:**
- **Runtime execution paths**: Condition branching, loop iteration, parallel fan-out/merge, map/reduce
- **Error recovery**: What happens when an LLM call fails mid-workflow? When a tool times out?
- **Checkpoint/restore**: checkpoint.rs has 1 inline test; no integration test for actual save/restore
- **Scheduler**: scheduler.rs (152 LoC) -- no meaningful test of scheduling policies
- **State management**: state/mod.rs (445 LoC) -- 2 inline tests only
- **Worker adapter**: worker_adapter.rs (172 LoC) -- no tests
- **Recorder**: recorder.rs (148 LoC) -- no tests
- **Debug module**: debug.rs (263 LoC) -- 4 inline tests, no integration
- **Observability**: metrics.rs (165 LoC) has 1 test; tracing.rs (543 LoC) has 8 tests but no integration
- **Advanced node types**: HumanInTheLoop, RetryCompensate, Debounce, Throttle, EventTrigger, CacheRead/Write, Router, Transform -- no runtime execution tests despite fixture coverage for IR structure

#### simple-agents-router (HIGH -- 1,682 LoC, ~30% estimated coverage)

**What is tested:**
- Health tracker with config thresholds (1 integration test)
- Basic inline tests per strategy (circuit_breaker=3, cost=4, latency=4, fallback=1, round_robin=1)

**What is NOT tested:**
- **End-to-end routing flow**: Provider selection under load
- **Circuit breaker state transitions**: Open -> half-open -> closed
- **Fallback chain exhaustion**: All providers failing
- **Latency-weighted routing accuracy**: Actual latency tracking affecting selection
- **Cost routing with real metrics**: Provider cost comparison
- **Round-robin wrap-around**: Correctness over many requests
- **Retry strategy integration**: retry.rs (212 LoC) with actual error scenarios

#### simple-agents-cache (HIGH -- 488 LoC, ~15% estimated coverage)

**What is tested:**
- `#[cfg(test)]` modules exist in memory.rs and noop.rs
- Cache key generation tested in simple-agent-type

**What is NOT tested:**
- **Cache hit/miss behavior**: Eviction, TTL expiry, LRU behavior
- **InMemoryCache capacity limits**: What happens when full?
- **Thread safety**: Concurrent read/write
- **NoopCache behavior**: Verify it actually does nothing

#### simple-agents-cli (CRITICAL -- 1,279 LoC, 0% coverage)

**What is NOT tested:**
- Argument parsing
- Provider initialization from CLI args
- Output formatting
- Error messaging
- Streaming output display

#### simple-agents-providers (MODERATE -- 7,431 LoC, ~55% estimated coverage)

**What is tested:**
- OpenAI request/response transformation (with synthetic data, no HTTP)
- Schema conversion (15 inline tests, 13 integration tests)
- Healing integration modes (strict, lenient, disabled)
- Anthropic error mapping, models, streaming (21 inline tests)
- OpenAI error mapping, models, streaming (31 inline tests)
- OpenRouter basics (4 inline tests)

**What is NOT tested:**
- **Actual HTTP requests** (no wiremock/mockito)
- **Retry logic under failure**: retry.rs (361 LoC, only 2 inline tests for config)
- **Rate limiting behavior**: rate_limit.rs (328 LoC, only 2 inline tests)
- **Streaming structured output**: streaming_structured.rs end-to-end
- **Provider-specific error parsing**: Anthropic overload, OpenAI quota exceeded
- **HTTP client error handling**: Timeouts, connection refused, malformed responses

#### simple-agents-core (MODERATE -- 1,144 LoC, ~50% estimated coverage)

**What is tested:**
- Cache integration (1 test)
- HealedJson mode (1 test)
- CoercedSchema mode (1 test)
- Middleware hooks (1 test)

**What is NOT tested:**
- **Error propagation**: Provider failure through client
- **Routing mode integration**: RoundRobin/Fallback/Latency through complete()
- **Multiple middleware**: Chain of middlewares
- **Concurrent requests**: Thread safety under load
- **client.rs** (832 LoC): Only 4 integration tests

#### Cross-Language Bindings

**Python (60% estimated):**
- Good builder and config coverage
- Direct healing/coercion tested
- Missing: error mapping exhaustiveness, memory leak checks, GIL safety under threading

**Node.js (30% estimated):**
- Only 2 non-live unit tests
- Missing: streaming parser from JS, error handling, memory management, async safety

**Go (50% estimated):**
- Good validation and uninitialized client checks
- Missing: concurrent usage, context cancellation behavior, streaming error recovery

---

## Part 3: Test Strategy

### 3.1 Test Pyramid

Current distribution vs recommended:

```
                Current                          Recommended

                 /\                                  /\
                /  \                                /  \
               / E2E\  ~0%                         /E2E \  10%
              /      \                             /  5   \
             /--------\                           /--------\
            /  Integ   \  ~25%                   / Integr.  \  20%
           /   ~130     \                       /   ~200     \
          /--------------\                     /--------------\
         /    Unit        \  ~75%             /    Unit        \  70%
        /    ~380          \                 /    ~500          \
       /--------------------\               /--------------------\
```

**Target: 700+ total test cases** (up from ~510), with emphasis on integration and E2E.

### 3.2 Per-Crate Testing Approach

#### Tier 1: Critical Path (must have 80%+ coverage)

| Crate | Current | Target | Approach |
|---|---|---|---|
| `simple-agents-workflow` | ~25% | 70% | Add integration test suite for runtime execution (all node types), checkpoint/restore, error recovery |
| `simple-agents-core` | ~50% | 85% | Add integration tests for all CompletionMode variants, error propagation, concurrent usage |
| `simple-agents-providers` | ~55% | 80% | Add HTTP mocking (wiremock), retry exhaustion, rate limiting, streaming errors |
| `simple-agents-router` | ~30% | 80% | Add integration tests for all routing strategies, circuit breaker state machine, fallback exhaustion |

#### Tier 2: Important (must have 60%+ coverage)

| Crate | Current | Target | Approach |
|---|---|---|---|
| `simple-agents-cache` | ~15% | 70% | Add TTL expiry, eviction, concurrent access, noop verification |
| `simple-agents-ffi` | ~40% | 65% | Add streaming FFI, memory leak detection, multi-threaded FFI calls |
| `simple-agents-workflow-workers` | ~20% | 60% | Add pool scaling, worker failure, timeout handling |
| `simple-agents-py` | ~60% | 75% | Add threading safety, error exhaustiveness, streaming edge cases |
| `bindings/go` | ~50% | 65% | Add concurrent usage, context cancellation, streaming error recovery |

#### Tier 3: Nice to Have (40%+ coverage)

| Crate | Current | Target | Approach |
|---|---|---|---|
| `simple-agents-cli` | 0% | 40% | Add argument parsing tests, output formatting, error messages (use `assert_cmd`) |
| `simple-agents-napi` | ~30% | 50% | Add streaming, error handling, async safety |
| `simple-agents-macros` | ~90% | 90% | Maintain (already well-tested) |
| `simple-agents-healing` | ~85% | 90% | Add edge cases found via fuzzing, schema validation errors |
| `simple-agent-type` | ~80% | 85% | Add builder edge cases, Clone/Debug exhaustiveness |

### 3.3 Cross-Language Parity Testing Strategy

The existing `parity-fixtures/` system is excellent. Extend it:

1. **Behavioral Parity Matrix**: For each shared fixture case (request, response, healing, streaming, tool_call), ensure all 4 bindings (Rust, Python, Node.js, Go) produce identical output given identical input.

2. **Error Parity**: Create `parity-fixtures/error_contract.json` defining how each error type maps across languages:
   - Rust `ProviderError::RateLimit` -> Python `RuntimeError("rate limit")` -> Go `ErrRateLimit` -> JS `Error("rate_limit")`

3. **Streaming Parity**: Create `parity-fixtures/streaming_contract.json` defining chunk format, finish reasons, and event types that must be identical.

4. **Workflow Parity**: The `workflow_dsl_ir_golden.json` is already tested in Rust, Python, JS, Go. Add execution parity tests (same workflow + mock LLM = same trace).

### 3.4 Workflow Testing Strategy

Given the workflow engine is the largest and least-tested subsystem (~18.8K LoC, ~25% coverage), a dedicated strategy is required:

1. **Node Type Matrix Testing**:
   Create `tests/workflow_node_tests.rs` with one test per node type executing through the runtime:
   - Start -> End (trivial)
   - Start -> LLM -> End (single LLM call)
   - Start -> Tool -> End (single tool call)
   - Start -> Condition -> (true branch) -> End
   - Start -> Condition -> (false branch) -> End
   - Start -> Loop (3 iterations) -> End
   - Start -> Parallel (2 branches) -> Merge -> End
   - Start -> Map (3 items) -> Reduce -> End
   - Start -> Subgraph -> End
   - Start -> Filter -> End
   - Start -> Batch -> End
   - CacheWrite -> CacheRead chain
   - HumanInTheLoop (mock approval)
   - RetryCompensate (with failing tool)
   - Debounce / Throttle (timing tests)

2. **Error Scenario Testing**:
   - LLM call fails -> RetryCompensate -> compensation runs
   - Tool times out -> error propagation
   - Invalid workflow definition -> validation error
   - Circular dependency detection
   - Missing node reference

3. **Checkpoint/Restore Testing**:
   - Execute half a workflow, checkpoint, restore, complete
   - Checkpoint format stability (golden fixture)

4. **YAML Runner Testing**:
   - Valid YAML files -> correct execution
   - Malformed YAML -> clear error messages
   - Schema validation in YAML nodes

### 3.5 Security Testing Approach

1. **API Key Handling**:
   - Verify ApiKey redaction in Debug, Display, Serialize (already tested in integration_test.rs)
   - Add test: API key not leaked in error messages from provider failures
   - Add test: API key not logged in tracing output

2. **Input Validation**:
   - YAML path traversal: `../../etc/passwd` as workflow path
   - Oversized JSON input to parser (DoS via deeply nested structures -- proptest partially covers this)
   - Invalid UTF-8 in provider names, model names
   - SQL/command injection in tool inputs

3. **FFI Safety**:
   - Double-free protection (partially tested: `allows_freeing_null_client`)
   - Buffer overflow with oversized strings
   - Concurrent FFI calls from multiple threads

### 3.6 Performance Testing Approach

The existing Criterion benchmarks are good. Extend with:

1. **Parser Throughput**: Parse N documents/sec for various sizes (1KB, 10KB, 100KB)
2. **Streaming Latency**: Time-to-first-parsed-field for progressive JSON
3. **Router Selection Latency**: Provider selection time with N providers
4. **Cache Lookup Latency**: Hit/miss latency at various cache sizes
5. **Workflow Node Throughput**: Nodes/sec for linear, parallel, and map workflows
6. **Memory Profiling**: Peak memory during large workflow execution (use `dhat` or `jemalloc` stats)

### 3.7 Contract Testing Between Crates

Define explicit contracts at crate boundaries:

```
simple-agent-type  <--provides types-->  ALL crates
simple-agents-healing  <--healing API-->  simple-agents-providers, simple-agents-core
simple-agents-providers  <--Provider trait-->  simple-agents-core
simple-agents-router  <--RoutingStrategy-->  simple-agents-core
simple-agents-cache  <--Cache trait-->  simple-agents-core
simple-agents-workflow  <--Runtime API-->  simple-agents-py, simple-agents-napi, simple-agents-ffi
simple-agents-workflow-workers  <--WorkerPool-->  simple-agents-workflow
```

**Recommended contract tests:**
- Provider trait contract: Any implementation of `Provider` must handle all `CompletionRequest` variants
- Cache trait contract: Any `Cache` implementation must return `None` after TTL expiry
- WorkerHandler contract: Echo handler -> expected response format

### 3.8 CI/CD Test Execution Plan

```
Stage 1: Fast Feedback (< 2 min)
  - `cargo test --lib` (all inline unit tests, ~350 tests)
  - `cargo clippy --all-targets`
  - Python unit tests: `pytest tests/ -k "not integration and not live"` (~60 tests)

Stage 2: Integration (< 5 min)
  - `cargo test --test '*'` (all integration tests, ~130 tests)
  - Node.js unit + contract tests: `node --test test/unit.test.js test/contract.test.js`
  - Go unit tests: `go test ./... -short`

Stage 3: Property + Perf (< 10 min)
  - `cargo test -p simple-agents-healing --test property_tests` (proptest, ~22 tests)
  - `cargo bench --bench runtime_benchmarks -- --output-format bencher` (regression detection)

Stage 4: Live API (optional, gated on secrets)
  - Python live: `pytest tests/test_integration_openai.py tests/test_streaming.py tests/test_structured_streaming.py`
  - Node.js live: `node --test test/live.test.js`
  - Go live: `go test ./... -run 'TestLive'`

Stage 5: Nightly (extended)
  - Miri safety checks: `cargo +nightly miri test -p simple-agent-type`
  - Extended proptest: `PROPTEST_CASES=10000 cargo test -p simple-agents-healing --test property_tests`
  - Fuzz corpus run: `cargo fuzz run parser_fuzz -- -max_total_time=300`
```

---

## Part 4: Detailed Test Plan

### 4.1 Priority-Ordered Test Cases (Top 50)

#### P0: Critical (Week 1) -- Unblocks confidence in core functionality

| # | Crate | Test Description | Type | Est. Effort |
|---|---|---|---|---|
| 1 | workflow | Runtime: Condition node true/false branching | Integration | 2h |
| 2 | workflow | Runtime: Loop node with iteration count | Integration | 2h |
| 3 | workflow | Runtime: Parallel fan-out and Merge | Integration | 3h |
| 4 | workflow | Runtime: Map + Reduce pipeline | Integration | 2h |
| 5 | workflow | Runtime: LLM failure mid-workflow error propagation | Integration | 2h |
| 6 | workflow | Runtime: Tool timeout handling | Integration | 2h |
| 7 | workflow | Checkpoint save and restore round-trip | Integration | 3h |
| 8 | core | Error propagation from provider through client | Integration | 1h |
| 9 | core | Concurrent complete() calls (thread safety) | Integration | 2h |
| 10 | router | Circuit breaker: closed -> open -> half-open -> closed | Integration | 3h |
| 11 | router | Fallback chain: all providers fail | Integration | 2h |
| 12 | router | Round-robin correctness over 100 requests | Integration | 1h |
| 13 | providers | HTTP mock: successful request/response cycle (wiremock) | Integration | 3h |
| 14 | providers | HTTP mock: retry on 429 with backoff | Integration | 2h |
| 15 | providers | HTTP mock: rate limit exhaustion | Integration | 2h |

#### P1: High (Week 2) -- Covers major gaps

| # | Crate | Test Description | Type | Est. Effort |
|---|---|---|---|---|
| 16 | cache | InMemoryCache: TTL expiry verification | Integration | 1h |
| 17 | cache | InMemoryCache: capacity eviction | Integration | 1h |
| 18 | cache | InMemoryCache: concurrent read/write | Integration | 2h |
| 19 | cache | NoopCache: verify no-op behavior | Unit | 0.5h |
| 20 | workflow | YAML runner: malformed YAML error messages | Integration | 1h |
| 21 | workflow | YAML runner: path traversal prevention | Security | 1h |
| 22 | workflow | Scheduler: task prioritization | Unit | 2h |
| 23 | workflow | State management: concurrent updates | Integration | 2h |
| 24 | workflow | Worker adapter: connection lifecycle | Integration | 2h |
| 25 | workflow | Recorder: event recording fidelity | Integration | 1h |
| 26 | router | Latency-weighted routing: selection accuracy | Integration | 2h |
| 27 | router | Cost routing: cheapest provider selection | Integration | 1h |
| 28 | router | Retry strategy: exponential backoff timing | Unit | 1h |
| 29 | providers | Anthropic: streaming response parsing | Integration | 2h |
| 30 | providers | OpenRouter: request transformation | Integration | 1h |

#### P2: Medium (Week 3) -- Cross-language and edge cases

| # | Crate | Test Description | Type | Est. Effort |
|---|---|---|---|---|
| 31 | ffi | Streaming FFI: chunk delivery | Integration | 2h |
| 32 | ffi | Memory: double-free protection (beyond null) | Safety | 1h |
| 33 | ffi | Multi-threaded FFI calls | Integration | 2h |
| 34 | py | Threading safety: concurrent complete() from Python | Integration | 2h |
| 35 | py | Error mapping exhaustiveness: all Rust errors -> Python exceptions | Contract | 2h |
| 36 | napi | Streaming from Node.js: chunk ordering | Integration | 2h |
| 37 | napi | Error handling: all error types | Unit | 1h |
| 38 | go | Context cancellation: mid-request cancel | Integration | 2h |
| 39 | go | Concurrent client usage | Integration | 1h |
| 40 | parity | Error contract fixture: all bindings produce consistent errors | Contract | 3h |

#### P3: Nice to Have (Week 4) -- Polish and advanced

| # | Crate | Test Description | Type | Est. Effort |
|---|---|---|---|---|
| 41 | cli | Argument parsing: all flags | Unit | 2h |
| 42 | cli | Output formatting: JSON/text modes | Unit | 1h |
| 43 | cli | Error messages: user-friendly | Unit | 1h |
| 44 | workflow-workers | Pool scaling: add/remove workers | Integration | 2h |
| 45 | workflow-workers | Worker failure: graceful degradation | Integration | 2h |
| 46 | healing | cargo-fuzz harness for parser | Fuzz | 3h |
| 47 | healing | Schema validation: malformed schemas | Unit | 1h |
| 48 | providers | Streaming structured: partial JSON delivery | Integration | 2h |
| 49 | workflow | Observability: tracing span correctness | Integration | 2h |
| 50 | workflow | Visualize: DOT output correctness | Unit | 1h |

### 4.2 Test Infrastructure Recommendations

#### 4.2.1 HTTP Mocking (Priority: HIGH)

Add `wiremock` for Rust HTTP mocking:

```toml
# In simple-agents-providers/Cargo.toml
[dev-dependencies]
wiremock = "0.6"
```

This enables testing provider HTTP interactions without live APIs, including:
- Response parsing for all status codes
- Retry behavior on transient failures
- Rate limit handling with Retry-After headers
- Streaming SSE response simulation

#### 4.2.2 Test Fixtures Directory (Priority: MEDIUM)

Standardize fixture management:

```
tests/fixtures/
  expression_cases.json         (exists)
  linear_trace.json             (exists)
  invalid_missing_terminal_trace.json (exists)
  workflow_node_matrix/         (new: one fixture per node type)
    condition_true.json
    condition_false.json
    loop_3_iterations.json
    parallel_2_branches.json
    map_reduce_3_items.json
  error_scenarios/              (new: expected error outputs)
    provider_timeout.json
    all_providers_down.json
    invalid_workflow.json
  checkpoint/                   (new: checkpoint round-trip fixtures)
    mid_execution.bin
```

#### 4.2.3 Test Utilities Crate (Priority: MEDIUM)

Create `crates/simple-agents-test-utils/` with shared test helpers:

- `MockProvider` (currently duplicated in core and benchmarks)
- `MockLlmExecutor` (currently duplicated in trace_fixtures and benchmarks)
- `MockToolExecutor` (same)
- Builder helpers for test requests/responses
- Assertion helpers for coercion flags, confidence ranges

#### 4.2.4 Miri Integration (Priority: LOW)

Run Miri on `simple-agent-type` and `simple-agents-healing` for undefined behavior detection:

```bash
cargo +nightly miri test -p simple-agent-type
cargo +nightly miri test -p simple-agents-healing --lib
```

#### 4.2.5 Fuzz Testing (Priority: MEDIUM)

Add `cargo-fuzz` targets:

```
fuzz/
  Cargo.toml
  fuzz_targets/
    parser_fuzz.rs       (JsonishParser arbitrary input)
    coercion_fuzz.rs     (CoercionEngine with random schema+value)
    yaml_runner_fuzz.rs  (YAML workflow definition parsing)
    ffi_fuzz.rs          (FFI function calls with random args)
```

### 4.3 Mocking Strategy

| Component | Mock Approach | Library |
|---|---|---|
| HTTP providers | `wiremock` server per test | wiremock 0.6 |
| LLM execution | `MockLlmExecutor` (existing pattern) | Custom trait impl |
| Tool execution | `MockToolExecutor` (existing pattern) | Custom trait impl |
| Cache | `InMemoryCache` (already exists) or `NoopCache` | Built-in |
| Clock/time | `tokio::time::pause()` for TTL/timeout tests | tokio test-util |
| File system | `tempfile` for YAML workflow files | tempfile |
| gRPC workers | `tonic-mock` or in-process handler | Custom |

### 4.4 Test Data Management

1. **Golden Fixtures**: JSON/YAML files in `tests/fixtures/` and `parity-fixtures/` -- version-controlled, reviewed in PRs
2. **Generated Data**: proptest for random input; deterministic seeds for reproducibility
3. **Shared Test Constants**: API keys like `sk-test-1234567890123456` (already used consistently)
4. **Environment Variables**: Live tests gated on `CUSTOM_API_BASE`, `CUSTOM_API_KEY`, `CUSTOM_API_MODEL`
5. **No Secrets in Tests**: All test API keys are obviously fake; real keys only via env vars

### 4.5 Effort Estimates

| Area | Tests to Add | Estimated Effort | Priority |
|---|---|---|---|
| Workflow runtime integration | ~30 tests | 40 hours | P0 |
| Router integration suite | ~15 tests | 20 hours | P0 |
| Provider HTTP mocking | ~15 tests | 25 hours | P0 |
| Cache integration | ~8 tests | 8 hours | P1 |
| Core client integration | ~8 tests | 12 hours | P0 |
| Cross-language parity | ~10 tests | 15 hours | P2 |
| CLI basic tests | ~8 tests | 8 hours | P3 |
| FFI safety tests | ~5 tests | 8 hours | P2 |
| Fuzz harnesses | 4 targets | 12 hours | P2 |
| Worker pool tests | ~5 tests | 8 hours | P2 |
| Security tests | ~5 tests | 6 hours | P1 |
| **Total** | **~133 tests** | **~162 hours** | |

---

## Appendix A: Test Anti-Patterns Found

1. **Overly permissive error matching** (LOW risk):
   - `parser_tests.rs:316-322`: Test for truncation lenient parsing accepts both `Ok` and `Err` -- should be split into two tests with explicit expectations.
   - `healing_integration_tests.rs:168-177`: Strict mode test accepts both success and failure -- unclear what the expected behavior is.

2. **Duplicate mock implementations** (MEDIUM effort to fix):
   - `MockProvider` in `client_integration.rs`
   - `BenchLlm`/`BenchTool` in `runtime_benchmarks.rs`
   - `MockLlmExecutor`/`MockToolExecutor` in `trace_fixtures.rs`
   - Recommend extracting to shared test utilities crate.

3. **Global state mutation in Go tests** (LOW risk):
   - `simpleagents_live_test.go:24-36`: Uses `os.Setenv` which affects global state. Use `t.Setenv` (Go 1.17+) instead for automatic cleanup.

4. **Hardcoded sleep in Go worker test** (LOW risk):
   - `worker_test.go:27`: `time.Sleep(300 * time.Millisecond)` -- replace with retry loop or health check.

5. **Test file in wrong location**:
   - No issues found -- all test files are properly placed in `tests/` directories or as `#[cfg(test)]` inline modules.

## Appendix B: Recommended Test Dependencies

```toml
# Workspace-level dev-dependencies to add
[workspace.dev-dependencies]
wiremock = "0.6"           # HTTP mocking for provider tests
assert_cmd = "2.0"         # CLI testing
predicates = "3.0"         # CLI output assertions
tempfile = "3.10"          # Temp file management
tokio-test = "0.4"         # Async test utilities
criterion = { version = "0.5", features = ["async_tokio"] }  # Already present
proptest = "1.4"           # Already present in healing
```

## Appendix C: Quick Wins (< 1 hour each)

1. Add `NoopCache::get()` returns `None` test (cache, 15 min)
2. Add round-robin wraps after N providers test (router, 30 min)
3. Add `CompletionRequest::builder()` with all optional fields test (core, 20 min)
4. Add `ProviderError` Display output verification (providers, 20 min)
5. Add `WorkflowDefinition` with no nodes validation test (workflow, 15 min)
6. Add `StreamingParser::new().finalize()` error test for Rust (healing, 15 min)
7. Add `CacheKey::from_parts()` with empty strings test (types, 15 min)
8. Add `Message::tool()` constructor test (types, 10 min)
9. Add `HealingConfig::default()` field value assertions (types, 10 min)
10. Add `RetryConfig::calculate_backoff()` monotonicity test (types, 20 min)
