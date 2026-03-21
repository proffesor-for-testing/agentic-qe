# SimpleAgents Code Quality & Complexity Analysis

**Report ID**: SA-CQC-001
**Date**: 2026-03-20
**Analyzer**: QE Code Complexity Analyzer v3
**Scope**: /tmp/SimpleAgents -- 126 .rs files, 13 crates, ~53K total lines (~45K source)

---

## Executive Summary

The SimpleAgents project is a well-architected Rust workspace with clean crate boundaries and generally good error handling practices. However, it suffers from **severe module bloat in the workflow crate**, where two files alone (`yaml_runner.rs` at 7,954 lines and `runtime.rs` at 4,575 lines) account for 28% of the entire codebase. The single most critical finding is a **3,086-line function** (`run_workflow_yaml_with_client_and_custom_worker_and_events_and_options`) with an estimated cyclomatic complexity exceeding 360 -- one of the most complex single functions encountered in a Rust codebase.

### Key Findings

| Category | Status | Detail |
|----------|--------|--------|
| Files exceeding 500-line standard | **21 files** | 40% of source code in oversized files |
| Critical complexity functions (CC >50) | **4 functions** | yaml_runner and runtime dominate |
| High complexity functions (CC 25-50) | **5 functions** | Spread across bindings and CLI |
| unsafe code blocks | **26 occurrences** | Concentrated in FFI/PyO3 bindings (appropriate) |
| .unwrap() in non-test code | **~100 instances** | Most in production source paths |
| .clone() calls (non-test) | **869 calls** | Significant allocation pressure in workflow crate |
| .to_string() calls (non-test) | **1,584 calls** | Heavy string allocation patterns |
| Code duplication | **Significant** | Usage accumulation pattern repeated 4x identically |
| Public API convenience wrappers | **23 run_* functions** | Combinatorial explosion in yaml_runner.rs |

### Severity Distribution

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 6 | God functions/modules requiring immediate decomposition |
| High | 12 | Functions or patterns creating significant maintenance burden |
| Medium | 18 | Code smells impacting readability and testability |
| Low | 9 | Minor improvements for code hygiene |

---

## Per-Crate Analysis

### 1. simple-agents-workflow (19,648 lines, 25 files) -- CRITICAL

This is the largest and most problematic crate, containing 37% of all project code.

**Files over 500 lines:**
| File | Lines | Concern |
|------|-------|---------|
| yaml_runner.rs | 7,954 | 15.9x over 500-line standard. God module. |
| runtime.rs | 4,575 | 9.2x over standard. Second god module. |
| validation.rs | 1,265 | 2.5x over standard. Repetitive match arms. |
| worker.rs | 1,069 | 2.1x over standard. |
| expressions.rs | 561 | Slightly over standard. |
| observability/tracing.rs | 543 | Slightly over standard. |
| ir.rs | 534 | Slightly over standard. |

**yaml_runner.rs Deep Analysis (7,954 lines):**
- Contains 5,286 lines of source code and 2,668 lines of tests
- Defines 40 public types (31 structs, 9 enums)
- Exposes 23 `pub async fn run_*` convenience functions -- a combinatorial explosion of `(file/inline) x (email/generic) x (with_client/from_env) x (with_worker/without) x (with_events/without) x (with_options/without)`
- Maximum nesting depth: **16 levels** (line 2436)
- 2,100 lines at nesting depth >= 6
- The `run_workflow_yaml_with_client_and_custom_worker_and_events_and_options` function spans **3,086 lines** with an estimated cyclomatic complexity of **360**
- Contains an inner `complete_structured` implementation spanning 658 lines with CC ~96
- 196 `.clone()` calls within the single mega-function
- 129 `.to_string()` calls within the single mega-function
- Usage accumulation code (prompt_tokens/completion_tokens/total_tokens/reasoning_tokens) is copy-pasted identically across `Response`, `HealedJson`, `CoercedSchema`, and `Stream` match arms (4 copies of ~15 lines each)

**runtime.rs Deep Analysis (4,575 lines):**
- `execute_node` function: 747 lines, CC ~97 (CRITICAL)
- `execute_from_node`: 145 lines, CC ~26 (HIGH)
- 38 duplicated instances of the `.map_err(|source| WorkflowRuntimeError::ScopeAccess { ... })` pattern
- The `execute_node` function is a single exhaustive `match` on `NodeKind` with 15+ arms, each containing substantial inline logic rather than delegating to focused sub-functions
- Average nesting depth: 2.9, max nesting: 9

**validation.rs Deep Analysis (1,265 lines):**
- `validate_node_kind_fields`: 587 lines, CC ~99 (CRITICAL)
- Extremely repetitive pattern: every `NodeKind` variant has nearly identical validation boilerplate for checking empty fields
- 26 duplicated instances of `Some(node.id.clone())` pattern in 4-line blocks
- This file is a prime candidate for macro-based code generation or a validation trait per node kind

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 162 |
| .clone() | 645 |
| .to_string() | 919 |
| unsafe blocks | 0 |
| TODO/FIXME | 0 |

### 2. simple-agents-providers (10,207 lines, 34 files) -- MEDIUM

Well-organized with separate modules per provider, but individual provider files are large.

**Files over 500 lines:**
| File | Lines | Concern |
|------|-------|---------|
| openai/mod.rs | 1,293 | Provider + request building + response parsing in one file |
| anthropic/mod.rs | 959 | Same pattern as OpenAI |
| openrouter/mod.rs | 649 | Same pattern |
| examples/custom_api.rs | 584 | Example, but indicates API complexity |

**Findings:**
- The three provider implementations follow a consistent pattern but share no code for common HTTP plumbing
- Each provider re-implements request serialization, header construction, and response parsing
- 159 .unwrap()/.expect() calls in non-test source -- the highest of any crate
- Generally good error handling with Result types, but several unwrap calls on serde_json operations that could theoretically fail on malformed API responses
- Rate limiting module (328 lines) is well-isolated

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 159 |
| .clone() | 52 |
| .to_string() | 112 |
| unsafe blocks | 0 |

### 3. simple-agents-py (3,147 lines, 1 file) -- HIGH

The entire Python binding layer is a single monolithic `lib.rs`.

**Findings:**
- 3,147 lines in one file (6.3x over standard)
- `complete()` function: 129 lines with 14 parameters -- the highest parameter count in the project
- `new()` constructor: 12 parameters
- `build_request_with_messages()`: 9 parameters
- 6 `unsafe impl Send/Sync` blocks (required for PyO3 interop -- appropriate but worth auditing)
- `provider_from_params()`: 76 lines of provider selection logic duplicated from CLI
- The file mixes concerns: type definitions, PyO3 adapters, provider factory logic, workflow execution, and streaming
- No separation between "safe Rust adapter" and "FFI boundary" layers
- Maximum nesting depth: 10

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 0 |
| .clone() | 30 |
| .to_string() | 102 |
| unsafe blocks | 6 |

### 4. simple-agents-healing (5,534 lines, 15 files) -- LOW-MEDIUM

Well-structured crate with good separation of concerns. The parser and coercion modules are the most complex.

**Files over 500 lines:**
| File | Lines | Concern |
|------|-------|---------|
| parser.rs | 1,126 | Complex but inherently difficult domain |
| coercion.rs | 867 | Type coercion with good pattern matching |
| streaming.rs | 441 | Just under threshold |

**Findings:**
- `handle_expect_value`: 136 lines, CC ~31 (HIGH) -- complex state machine parsing, but domain-appropriate
- `lenient_parse`: 58 lines, CC ~12 (reasonable)
- `coerce_recursive`: 71 lines, CC ~20 (MEDIUM) -- clean recursive pattern matching
- `find_field_value`: 83 lines, CC ~16 (MEDIUM) -- fuzzy matching logic
- Parser has 48 .unwrap()/.expect() calls -- many in test assertions, but some in production code paths where parser state machine guarantees safety
- Good use of the builder pattern and configuration structs
- Well-documented with architecture diagrams in doc comments

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 48 |
| .clone() | 29 |
| .to_string() | 53 |
| unsafe blocks | 0 |

### 5. simple-agents-ffi (1,257 lines, 2 files) -- MEDIUM

C FFI binding layer with expected unsafe patterns.

**Findings:**
- 1,257 lines in single lib.rs (2.5x over standard)
- 20 unsafe blocks -- all at the FFI boundary (appropriate, necessary for C interop)
- 7 duplicated instances of `let client = &(*client).inner;` pattern
- 6 duplicated instances of null-check + runtime-build boilerplate per exported function
- `sa_complete_messages_json`: 9 parameters (HIGH parameter count for FFI)
- `sa_stream_messages`: 9 parameters
- Good defensive pattern: `set_last_error` / `take_last_error` for error propagation across FFI boundary
- All exported functions follow consistent safety patterns

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 0 |
| .clone() | 8 |
| .to_string() | 57 |
| unsafe blocks | 20 |

### 6. simple-agents-napi (1,223 lines, 2 files) -- MEDIUM

Node.js NAPI binding layer.

**Findings:**
- 1,223 lines in single lib.rs (2.4x over standard)
- Three `compute()` implementations for different task types with duplicated streaming logic
- Maximum nesting depth: 9, with 63 lines at depth >= 6
- `compute()` (streaming variant): 101 lines -- complex but structurally sound
- HealedJson and CoercedSchema outcomes return errors ("not yet supported") -- incomplete feature parity
- 3 duplicated 4-line blocks for runtime block_on patterns

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 0 |
| .clone() | 28 |
| .to_string() | 42 |
| unsafe blocks | 0 |

### 7. simple-agents-cli (1,279 lines, 1 file) -- MEDIUM

Single-file CLI application.

**Findings:**
- 1,279 lines in `main.rs` (2.6x over standard)
- `run_workflow_tools`: 158 lines, CC ~42 (HIGH)
- `run`: 106 lines -- top-level dispatch function
- `run_benchmark`: 61 lines -- reasonable
- 4 nearly identical CLI argument structs (CompleteArgs, ChatArgs, BenchmarkArgs, TestProviderArgs) each defining `model`, `provider`, `system`, `max_tokens`, `temperature`, `top_p`, `user`
- Provider construction logic duplicated from py bindings
- No `run_chat` separation of input/output handling from business logic

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 0 |
| .clone() | 22 |
| .to_string() | 31 |
| unsafe blocks | 0 |

### 8. simple-agents-core (1,452 lines, 7 files) -- LOW

Clean, well-structured core crate.

**Findings:**
- `client.rs` at 832 lines is the largest file (1.7x over standard)
- `instrument_stream`: 60 lines -- reasonable complexity
- Good use of traits for abstraction (`Provider`, `Cache`, `Middleware`)
- Clean builder pattern for `SimpleAgentsClient`
- 11 .unwrap()/.expect() calls in non-test code -- several in `RwLock` operations where poisoning is the concern
- Uses `Arc<RwLock<ClientState>>` for interior mutability -- correct concurrent pattern

**Crate-level metrics:**
| Metric | Value |
|--------|-------|
| .unwrap()/.expect() (non-test) | 11 |
| .clone() | 16 |
| .to_string() | 23 |
| unsafe blocks | 0 |

### 9. simple-agents-router (1,785 lines, 10 files) -- LOW

Clean, well-separated routing strategies.

**Findings:**
- Good separation: one file per routing strategy (latency, cost, fallback, round_robin, circuit_breaker)
- No file exceeds 500 lines (largest: latency.rs at 324)
- 39 .unwrap()/.expect() calls -- mostly in test code
- Clean trait-based design
- Good test coverage pattern

### 10. simple-agent-type (5,135 lines, 15 files) -- LOW

Type definitions crate serving as the project's shared vocabulary.

**Findings:**
- `response.rs` (564), `request.rs` (537), `config.rs` (528), `provider.rs` (493) -- all slightly over standard
- 112 .unwrap()/.expect() -- many are in `From`/`Into` implementations and test code
- Extensive use of `serde` derive macros -- appropriate
- Clean type hierarchy

### 11. simple-agents-cache (488 lines, 3 files) -- LOW

Compact, well-designed cache abstraction.

- No files over 500 lines
- 35 .unwrap()/.expect() -- concentrated in `memory.rs` RwLock operations
- Clean async trait design

### 12. simple-agents-macros (511 lines, 3 files) -- LOW

Procedural macro crate. Inherently complex but compact.

### 13. simple-agents-workflow-workers (399 lines, 4 files) -- LOW

Clean worker protocol definitions. Well under limits.

---

## Top 20 Complexity Hotspots

Ranked by composite risk score combining cyclomatic complexity, line count, nesting depth, and allocation density.

| Rank | Function | File | Lines | Est. CC | Max Nest | .clone() | Risk |
|------|----------|------|-------|---------|----------|----------|------|
| 1 | `run_workflow_yaml_w/..._options` | yaml_runner.rs:2202 | 3,086 | 360 | 16 | 196 | **0.99** |
| 2 | `validate_node_kind_fields` | validation.rs:250 | 587 | 99 | 6 | 30+ | **0.94** |
| 3 | `execute_node` | runtime.rs:1071 | 747 | 97 | 9 | 45+ | **0.93** |
| 4 | `complete_structured` (inner) | yaml_runner.rs:2218 | 658 | 96 | 16 | 80+ | **0.92** |
| 5 | `run_workflow_tools` | cli/main.rs:1105 | 158 | 42 | 7 | 8 | **0.75** |
| 6 | `complete` (py) | py/lib.rs:2717 | 129 | 32 | 10 | 12 | **0.72** |
| 7 | `handle_expect_value` | parser.rs:400 | 136 | 31 | 4 | 3 | **0.68** |
| 8 | `execute_from_node` | runtime.rs:925 | 145 | 26 | 5 | 8 | **0.62** |
| 9 | `coerce_recursive` | coercion.rs:135 | 71 | 20 | 4 | 10 | **0.52** |
| 10 | `find_field_value` | coercion.rs:477 | 83 | 16 | 4 | 5 | **0.48** |
| 11 | `compute` (napi stream) | napi/lib.rs:753 | 101 | ~18 | 9 | 6 | **0.47** |
| 12 | `compute` (napi basic) | napi/lib.rs:654 | 89 | ~15 | 9 | 5 | **0.44** |
| 13 | `execute_parallel_node` | runtime.rs:1981 | 89 | 10 | 5 | 8 | **0.38** |
| 14 | `execute_map_node` | runtime.rs:2139 | 87 | 11 | 5 | 7 | **0.37** |
| 15 | `execute_tool_w/policy_for_scope` | runtime.rs:2549 | 80 | ~14 | 5 | 6 | **0.36** |
| 16 | `build` (py client) | py/lib.rs:1821 | 86 | ~12 | 4 | 4 | **0.34** |
| 17 | `coerce_to_schema` (py) | py/lib.rs:2508 | 84 | ~12 | 4 | 5 | **0.34** |
| 18 | `execute_filter_node` | runtime.rs:2308 | 79 | ~10 | 5 | 4 | **0.33** |
| 19 | `execute_merge_node` | runtime.rs:2071 | 67 | ~10 | 5 | 5 | **0.32** |
| 20 | `run_chat` | cli/main.rs:785 | 64 | ~10 | 4 | 3 | **0.30** |

---

## Code Smells Catalog

### CRITICAL Severity

#### CS-001: God Module -- yaml_runner.rs (7,954 lines)
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs`
**Description**: Single file containing 40 public types, 23 public API functions, YAML workflow deserialization, IR conversion, Mermaid diagram generation, LLM execution orchestration, tool call handling, streaming, telemetry, tracing, validation, and 2,668 lines of tests. This is a textbook god module.
**Impact**: Impossible to understand, test, or modify any single concern without loading 8,000 lines of context. Merge conflicts guaranteed when multiple developers touch workflow features.
**Recommendation**: Decompose into at least 8 focused modules: `types.rs`, `api.rs` (convenience wrappers), `executor.rs`, `streaming.rs`, `tools.rs`, `telemetry.rs`, `mermaid.rs`, `ir_convert.rs`.

#### CS-002: God Function -- run_workflow_yaml_with_client_and_custom_worker_and_events_and_options (3,086 lines)
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs:2202`
**Description**: A single async function spanning 3,086 lines with an estimated cyclomatic complexity of 360. Contains inline struct definitions, trait implementations, and deeply nested streaming logic. This function handles: request building, tool calling loops, streaming aggregation, usage tracking, telemetry spans, event emission, subworkflow execution, JSON healing, and final output construction.
**Impact**: Untestable as a unit. Any modification risks breaking unrelated behaviors. The 16-level nesting depth makes control flow nearly impossible to trace.
**Recommendation**: Extract the inner `BorrowedClientExecutor` into a standalone type. Extract `complete_structured` as a proper method. Separate streaming logic, tool calling loop, and telemetry into distinct functions.

#### CS-003: God Function -- execute_node (747 lines, CC ~97)
**Location**: `crates/simple-agents-workflow/src/runtime.rs:1071`
**Description**: Exhaustive match on 15+ `NodeKind` variants with substantial inline logic per arm. Each arm handles scoping, error mapping, recording, and next-node resolution.
**Impact**: Adding a new node kind requires modifying this single function and understanding all existing arms.
**Recommendation**: Implement a `NodeExecutor` trait with `execute` method, and create one implementation per `NodeKind`. The match statement becomes a simple dispatch table.

#### CS-004: God Function -- validate_node_kind_fields (587 lines, CC ~99)
**Location**: `crates/simple-agents-workflow/src/validation.rs:250`
**Description**: Exhaustive match on every `NodeKind` variant with highly repetitive validation boilerplate. The pattern `if field.is_empty() { diagnostics.push(Diagnostic::error(..., Some(node.id.clone()))); }` is repeated dozens of times.
**Impact**: Adding a new field to any node kind requires adding multiple repetitive lines. High risk of inconsistency.
**Recommendation**: Use a macro like `validate_non_empty!(diagnostics, node, "field_name", value)` or implement a `Validate` trait on each `NodeKind` variant.

#### CS-005: Combinatorial API Explosion (23 run_* functions)
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs:1966-2200`
**Description**: 23 public `run_*` functions representing every combination of (file vs inline YAML) x (email vs generic input) x (default client vs provided) x (with custom worker vs without) x (with events vs without) x (with options vs without). Most are 5-15 line wrappers that delegate to the fully-parameterized version.
**Impact**: Massive API surface that is difficult to document, version, and maintain. Every new optional parameter requires doubling the function count.
**Recommendation**: Replace with a builder pattern: `WorkflowRunner::new(workflow).client(client).events(sink).options(opts).run(input).await`. This collapses 23 functions into 1 entry point + 5-6 builder methods.

#### CS-006: Duplicated Usage Accumulation (4 identical copies)
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs:2275-2347`
**Description**: The token usage accumulation pattern (prompt_tokens, completion_tokens, total_tokens, reasoning_tokens) is copy-pasted identically in 4 match arms (Response, HealedJson, CoercedSchema, Stream). Each copy is ~15 lines including the `unwrap_or(0) + reasoning_tokens` pattern.
**Impact**: Bug fixes to usage tracking must be applied to all 4 copies. Easy to miss one.
**Recommendation**: Extract `fn accumulate_usage(total: &mut Option<YamlLlmTokenUsage>, usage: &Usage)` helper.

### HIGH Severity

#### CS-007: Monolithic Python Binding File (3,147 lines)
**Location**: `crates/simple-agents-py/src/lib.rs`
**Description**: All Python bindings in a single file mixing type wrappers, provider factories, streaming adapters, workflow execution, and schema conversion.
**Impact**: Difficult to navigate and maintain. Any PyO3 upgrade requires touching one massive file.
**Recommendation**: Split into `types.rs`, `client.rs`, `streaming.rs`, `workflow.rs`, `healing.rs`, `schema.rs`.

#### CS-008: 14-Parameter Function
**Location**: `crates/simple-agents-py/src/lib.rs` -- `complete()` function
**Description**: The `complete` function accepts 14 parameters including model, messages, system prompt, temperature, top_p, max_tokens, user, tools, tool_choice, json_schema, response_format, stream, healing config, and middleware.
**Impact**: Extremely difficult to call correctly. Easy to mix up positional arguments. Python does help with keyword arguments, but the Rust implementation still has 14 variables in scope.
**Recommendation**: Group related parameters into structs: `ModelConfig { model, temperature, top_p, max_tokens }`, `CompletionConfig { tools, tool_choice, json_schema, response_format }`.

#### CS-009: Duplicated CLI Argument Structs
**Location**: `crates/simple-agents-cli/src/main.rs:84-195`
**Description**: Four nearly identical clap argument structs (`CompleteArgs`, `ChatArgs`, `BenchmarkArgs`, `TestProviderArgs`) each defining `model`, `provider`, `system`, `max_tokens`, `temperature`, `top_p`, `user`.
**Impact**: Any new common argument must be added to all four structs.
**Recommendation**: Extract `CommonModelArgs` struct and use `#[command(flatten)]`.

#### CS-010: Duplicated FFI Boilerplate
**Location**: `crates/simple-agents-ffi/src/lib.rs`
**Description**: Every exported C function repeats: null check on client pointer, dereference, build runtime, execute, handle error. 7 instances of identical `let client = &(*client).inner; let runtime = client...` blocks.
**Impact**: New FFI functions require copy-pasting boilerplate.
**Recommendation**: Extract a macro or helper function: `fn with_client<F, T>(client: *mut SAClient, f: F) -> *mut c_char where F: FnOnce(&SAClient, &Runtime) -> Result<T>`.

#### CS-011: Duplicated Provider Factory Logic
**Location**: `crates/simple-agents-py/src/lib.rs:1106` and `crates/simple-agents-cli/src/main.rs`
**Description**: Provider construction from environment variables and configuration is implemented independently in the Python bindings, CLI, FFI, and NAPI layers.
**Impact**: Provider configuration changes must be replicated across 4 crates.
**Recommendation**: Create a `ProviderFactory` in `simple-agents-core` or `simple-agents-providers` that all binding layers delegate to.

#### CS-012: Excessive Nesting in Streaming Code
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs:2357-2580`
**Description**: The streaming branch within `complete_structured` reaches 16 levels of nesting: `fn > impl > match > for > match > while > if > if > if > if > if > let > if > if > if > emit`. This makes the control flow nearly impossible to follow.
**Impact**: High cognitive complexity. Developers must hold 16 levels of context simultaneously.
**Recommendation**: Extract the stream processing loop into a dedicated `async fn process_completion_stream(...)` function. Extract event emission into `emit_stream_delta(...)` and `emit_thinking_delta(...)` helpers.

### MEDIUM Severity

#### CS-013: ScopeAccess Error Mapping Duplication (38 instances)
**Location**: `crates/simple-agents-workflow/src/runtime.rs`
**Description**: The pattern `.map_err(|source| WorkflowRuntimeError::ScopeAccess { node_id: node.id.clone(), source })` appears 38 times.
**Impact**: Verbose code that obscures actual logic.
**Recommendation**: Add a `fn scope_err(node_id: &str) -> impl FnOnce(ScopeAccessError) -> WorkflowRuntimeError` helper or a trait extension method.

#### CS-014: YamlWorkflowEvent Construction Boilerplate
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs` (20+ instances)
**Description**: `YamlWorkflowEvent` structs are constructed inline with 12 fields, most set to `None` or default values. The same construction pattern appears at every event emission point.
**Impact**: Noisy code that obscures the actual event data.
**Recommendation**: Add builder methods or constructor functions: `YamlWorkflowEvent::stream_delta(node_id, delta)`, `YamlWorkflowEvent::tool_call_requested(node_id, tool_name, args)`.

#### CS-015: String Allocation Pressure
**Location**: Project-wide, concentrated in workflow crate
**Description**: 1,584 `.to_string()` calls and 336 `format!()` calls across non-test code. The workflow crate alone has 919 `.to_string()` calls. Many involve converting `&str` constants to `String` for struct fields that could accept `&str` or `Cow<str>`.
**Impact**: Unnecessary heap allocations, especially in hot paths like streaming and event emission.
**Recommendation**: Use `Cow<'a, str>` for struct fields that often hold static strings. Use `SmolStr` or `CompactStr` for short, frequently allocated strings like node IDs and event types.

#### CS-016: Clone-Heavy Workflow Execution
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs`
**Description**: 196 `.clone()` calls within the main execution function, including cloning of `request.node_id`, `tool_name`, `tool_call_id` on every iteration of tool call loops. Many clones of `Value` (serde_json) which involves deep allocation.
**Impact**: Memory pressure and GC overhead in long-running workflows with many nodes.
**Recommendation**: Use `Arc<str>` for node IDs and tool names that are read frequently but written once. Pass references where ownership is not needed.

#### CS-017: Incomplete Feature Parity in NAPI Bindings
**Location**: `crates/simple-agents-napi/src/lib.rs:820-828`
**Description**: `HealedJson` and `CoercedSchema` completion outcomes return errors ("not yet supported in Node bindings") rather than being handled.
**Impact**: Users discovering this at runtime rather than compile time. Feature parity gap.
**Recommendation**: Either implement the missing codepaths or document the limitation clearly in the API.

#### CS-018: Implicit State Machine in Parser
**Location**: `crates/simple-agents-healing/src/parser.rs:363-943`
**Description**: The lenient parser uses an enum-driven state machine (`ParserState`) with 10+ states. State transitions are spread across 8 handler methods, making the complete state diagram difficult to reconstruct.
**Impact**: Adding new syntax support requires understanding the full state graph.
**Recommendation**: Add a state transition diagram as documentation. Consider a table-driven parser approach for clearer state management.

### LOW Severity

#### CS-019: Unused Import Warnings Suppressed
**Location**: `crates/simple-agents-py/src/lib.rs:3`
**Description**: `#![allow(clippy::useless_conversion)]` suppresses warnings project-wide for the Python bindings.
**Impact**: May mask legitimate conversion issues.
**Recommendation**: Apply the allow attribute to specific functions rather than the entire crate.

#### CS-020: Test Code Mixed with Source
**Location**: `crates/simple-agents-workflow/src/yaml_runner.rs:5287`
**Description**: 2,668 lines of tests at the bottom of a 7,954-line file.
**Impact**: File size inflation. Slow editor performance.
**Recommendation**: Move tests to `tests/yaml_runner_tests.rs` or a `tests/` directory.

#### CS-021: Magic Numbers
**Location**: Various
**Description**: Constants like `256` (max_steps), `128 * 1024` (max expression scope bytes), `4096` (max map items), `8192` (max filter items) are defined as defaults but not documented as to why these specific values were chosen.
**Impact**: Unclear if limits are based on benchmarks or arbitrary.
**Recommendation**: Add doc comments explaining the rationale for each limit.

---

## Error Handling Assessment

### Overall Pattern Quality: GOOD

The project demonstrates generally strong error handling practices:

**Strengths:**
- Extensive use of `thiserror` for structured error types
- Rich error enums with context (e.g., `YamlWorkflowRunError` with 12 variants carrying node_id, path, message)
- Proper `Result` propagation through the `?` operator
- Good use of `map_err` for error context enrichment
- The FFI layer correctly uses `set_last_error`/`take_last_error` pattern

**Concerns:**
- ~100 `.unwrap()` calls in non-test production code paths
  - Most are in `serde_json` operations where the input is controlled
  - Some are on `RwLock` operations (panics on poison -- acceptable but could be more defensive)
  - 1 instance in yaml_runner.rs line 5668: `.expect("recording sink lock should not be poisoned")` -- correct reasoning but panic in production
- The healing crate has the highest density of `.unwrap()` in production code -- many are safe due to parser state machine guarantees, but violate defense-in-depth

### Recommendation
Replace `.unwrap()` in production paths with `.expect("reason")` at minimum, or preferably with proper error propagation. The 48 instances in the healing crate deserve individual audit.

---

## Unsafe Code Assessment

**Total unsafe blocks**: 26 (all in binding crates)
**Distribution:**
| Crate | Count | Justification |
|-------|-------|---------------|
| simple-agents-ffi | 20 | C FFI boundary -- mandatory for extern "C" functions |
| simple-agents-py | 6 | PyO3 Send/Sync impls for callback wrappers |

**Assessment**: All unsafe usage is at FFI boundaries where it is expected and necessary. The FFI crate properly validates null pointers before dereferencing. The PyO3 `unsafe impl Send/Sync` blocks are documented with the assumption that Python GIL protects access.

**No unsafe code** exists in the core logic crates (workflow, healing, core, router, providers, cache, type), which is excellent.

---

## Inter-Crate Coupling Analysis

```
simple-agent-type (0 deps) -- FOUNDATION
    |
    +-- simple-agents-cache (1 dep)
    +-- simple-agents-router (1 dep)
    +-- simple-agents-healing (2 deps) -- depends on macros
    |       |
    +-- simple-agents-providers (4 deps)
    |       |
    +-- simple-agents-core (4 deps) -- depends on healing, cache, router
            |
    +-- simple-agents-workflow (3 deps) -- depends on core, healing, type
            |
    +------ simple-agents-cli (5 deps)
    +------ simple-agents-ffi (5 deps)
    +------ simple-agents-napi (5 deps)
    +------ simple-agents-py (7 deps) -- highest fan-out
```

**Assessment:**
- The dependency graph is a clean DAG with no cycles
- `simple-agent-type` is a proper shared kernel with zero dependencies
- Binding crates (py, ffi, napi, cli) are leaf nodes -- correct for the adapter layer
- `simple-agents-py` has the highest fan-out at 7 internal dependencies -- this is a mild concern for build times but architecturally reasonable given it must expose the full API surface
- `simple-agents-core` depends on `simple-agents-router` which creates a potential circular concern if router ever needs core features (currently it doesn't)

**Cohesion Assessment:**
| Crate | Cohesion | Notes |
|-------|----------|-------|
| simple-agent-type | HIGH | Pure type definitions |
| simple-agents-cache | HIGH | Single responsibility |
| simple-agents-router | HIGH | Clean strategy pattern |
| simple-agents-healing | HIGH | Well-bounded domain |
| simple-agents-core | MEDIUM | Client + builder + routing + healing integration |
| simple-agents-providers | MEDIUM | Good per-provider isolation, but shared code opportunity missed |
| simple-agents-workflow | LOW | Too many concerns in yaml_runner.rs |
| simple-agents-py | LOW | All bindings in one file |
| simple-agents-ffi | MEDIUM | Repetitive but focused |
| simple-agents-napi | MEDIUM | Duplicated but focused |
| simple-agents-cli | MEDIUM | Single-file but straightforward |

---

## Metrics Summary

### Project-Wide

| Metric | Value |
|--------|-------|
| Total .rs files | 126 |
| Total lines | 53,557 |
| Source lines (excluding tests/examples) | ~45,000 |
| Crates | 13 |
| Files > 500 lines | 21 (17%) |
| Files > 1000 lines | 9 (7%) |
| Avg file size (source) | 354 lines |
| Median file size (source) | ~250 lines |
| Functions > 100 lines | 9 |
| Functions > 50 lines | 25+ |
| Functions with CC > 50 | 4 |
| Functions with CC > 20 | 9 |
| Total .unwrap() (non-test) | ~100 |
| Total .clone() (non-test) | 869 |
| Total .to_string() (non-test) | 1,584 |
| Total unsafe blocks | 26 |
| Total TODO/FIXME/HACK | 0 |

### Per-Crate Complexity Index

| Crate | Lines (src) | Files | Avg CC | Max CC | Smells | Grade |
|-------|-------------|-------|--------|--------|--------|-------|
| simple-agents-workflow | 18,793 | 25 | HIGH | 360 | 6 Critical | **F** |
| simple-agents-providers | 7,431 | 34 | LOW | ~15 | 2 Medium | **B** |
| simple-agents-py | 3,147 | 1 | MEDIUM | 32 | 2 High | **C** |
| simple-agents-healing | 3,187 | 15 | MEDIUM | 31 | 1 Medium | **B+** |
| simple-agents-core | 1,144 | 7 | LOW | ~12 | 0 | **A-** |
| simple-agents-ffi | 1,257 | 2 | LOW | ~15 | 1 High | **B-** |
| simple-agents-napi | 1,223 | 2 | LOW | ~18 | 1 Medium | **B** |
| simple-agents-cli | 1,279 | 1 | MEDIUM | 42 | 1 High | **C+** |
| simple-agents-router | 1,682 | 10 | LOW | ~8 | 0 | **A** |
| simple-agents-cache | 488 | 3 | LOW | ~5 | 0 | **A** |
| simple-agent-type | 4,358 | 15 | LOW | ~10 | 0 | **A-** |
| simple-agents-macros | 257 | 3 | LOW | ~5 | 0 | **A** |
| simple-agents-workflow-workers | 388 | 4 | LOW | ~5 | 0 | **A** |

### Nesting Depth Analysis

| File | Max Depth | Avg Depth | Lines at Depth >= 6 |
|------|-----------|-----------|---------------------|
| yaml_runner.rs | 16 | 4.8 | 2,100 |
| runtime.rs | 9 | 2.9 | 240 |
| py/lib.rs | 10 | 2.4 | 126 |
| napi/lib.rs | 9 | 2.3 | 63 |
| openai/mod.rs | 8 | 2.6 | 48 |
| client.rs | 8 | 2.4 | 28 |
| cli/main.rs | 7 | 2.4 | 21 |
| validation.rs | 6 | 3.2 | 21 |
| anthropic/mod.rs | 6 | 2.5 | 19 |
| coercion.rs | 6 | 2.4 | 13 |
| ffi/lib.rs | 7 | 2.2 | 12 |
| parser.rs | 4 | 1.6 | 0 |

---

## Refactoring Recommendations (Priority Order)

### P0: Decompose yaml_runner.rs (Estimated effort: 3-5 days)

**Strategy**: Module extraction without changing public API.

1. **Extract types** into `yaml_types.rs` (structs, enums, error types) -- ~500 lines
2. **Extract Mermaid generation** into `yaml_mermaid.rs` -- ~400 lines
3. **Extract IR conversion** into `yaml_ir_convert.rs` -- ~200 lines
4. **Extract telemetry/tracing** into `yaml_telemetry.rs` -- ~300 lines
5. **Extract streaming logic** into `yaml_streaming.rs` -- ~400 lines
6. **Extract tool execution** into `yaml_tools.rs` -- ~300 lines
7. **Replace 23 run_* functions** with builder pattern -- collapses to ~100 lines
8. **Move tests** to `tests/yaml_runner/` directory -- ~2,668 lines

**Estimated reduction**: yaml_runner.rs from 7,954 to ~2,100 lines (core execution loop only).

### P1: Decompose runtime.rs execute_node (Estimated effort: 2-3 days)

**Strategy**: Trait-based dispatch.

1. Create `trait NodeHandler { async fn execute(...) -> Result<NodeExecution>; }`
2. Implement per `NodeKind`: `LlmNodeHandler`, `ToolNodeHandler`, `ConditionNodeHandler`, etc.
3. Replace the 747-line match with: `node_handler_for(&node.kind).execute(ctx).await`
4. Each handler is 20-80 lines -- testable in isolation

**Estimated reduction**: execute_node from 747 to ~30 lines dispatch + 15 focused handlers.

### P2: Refactor validation.rs with macros (Estimated effort: 1 day)

**Strategy**: Reduce repetitive validation with a macro.

```rust
macro_rules! validate_non_empty {
    ($diag:expr, $node:expr, $field_name:expr, $value:expr) => {
        if $value.is_empty() {
            $diag.push(Diagnostic::error(
                DiagnosticCode::EmptyField,
                concat!($field_name, " must not be empty"),
                Some($node.id.clone()),
            ));
        }
    };
}
```

**Estimated reduction**: validation.rs from 1,265 to ~400 lines.

### P3: Extract token usage accumulation (Estimated effort: 30 minutes)

Extract a helper function to eliminate 4 identical copies:

```rust
fn accumulate_usage(total: &mut Option<YamlLlmTokenUsage>, usage: &Usage) {
    if let Some(t) = total.as_mut() {
        t.prompt_tokens += usage.prompt_tokens;
        t.completion_tokens += usage.completion_tokens;
        t.total_tokens += usage.total_tokens;
        if let Some(rt) = usage.reasoning_tokens {
            t.reasoning_tokens = Some(t.reasoning_tokens.unwrap_or(0) + rt);
        }
    } else {
        *total = Some(YamlLlmTokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            reasoning_tokens: usage.reasoning_tokens,
        });
    }
}
```

### P4: Consolidate provider factory (Estimated effort: 1 day)

Create `ProviderFactory` in `simple-agents-providers` that encapsulates the environment-based provider construction logic currently duplicated in py, ffi, napi, and cli crates.

### P5: Builder pattern for YamlWorkflowEvent (Estimated effort: 2 hours)

Replace inline 12-field struct construction with focused constructors:

```rust
impl YamlWorkflowEvent {
    fn stream_delta(node_id: &str, delta: String, is_terminal: bool) -> Self { ... }
    fn node_completed(node_id: &str, kind: &str, elapsed_ms: u128) -> Self { ... }
    fn tool_call_requested(node_id: &str, tool: &str, args: &Value) -> Self { ... }
}
```

### P6: Flatten CLI argument structs (Estimated effort: 1 hour)

Extract common model/provider arguments into `CommonModelArgs` and use `#[command(flatten)]`.

---

## Testability Assessment

| Component | Testability Score | Blockers |
|-----------|------------------|----------|
| simple-agents-router | 92/100 | Clean traits, pure logic |
| simple-agents-cache | 88/100 | Async traits, simple state |
| simple-agents-healing | 85/100 | Parser state machine complexity |
| simple-agent-type | 90/100 | Pure data types |
| simple-agents-core | 75/100 | Requires mocking Provider trait |
| simple-agents-providers | 60/100 | External HTTP dependencies |
| simple-agents-workflow (runtime) | 45/100 | 747-line function, 6-param methods |
| simple-agents-workflow (yaml_runner) | 15/100 | 3,086-line function, deep coupling |
| simple-agents-py | 30/100 | PyO3 runtime dependency |
| simple-agents-ffi | 35/100 | C FFI boundary |
| simple-agents-napi | 35/100 | NAPI runtime dependency |

The yaml_runner module scores 15/100 because the 3,086-line execution function is untestable as a unit. The existing tests (2,668 lines) are integration tests requiring mock providers, which is the only viable strategy given the current architecture. After the recommended P0 decomposition, testability would improve to approximately 65/100.

---

*Analysis completed by QE Code Complexity Analyzer v3. Metrics are estimates based on static analysis heuristics. Actual cyclomatic complexity may vary from tool-computed values by 10-15%.*
