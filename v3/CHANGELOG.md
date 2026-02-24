# Changelog

All notable changes to Agentic QE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.7.1] - 2026-02-24

### Added

- **OpenCode integration** — Full multi-workstream integration making AQE accessible from OpenCode-compatible agent clients: SSE/WebSocket/HTTP transport routing, output compaction middleware, 10 agent configs, 20 QE skills, 5 tool wrappers, Zod config schema, graceful degradation, and provider capability matrix
- **`aqe init --with-opencode` flag** — Provisions OpenCode assets (10 agents, 20 skills, 5 tools, permissions.yaml, opencode.json) into user projects during initialization; follows the N8n installer pattern with auto-detection in `--auto` mode when `opencode.json` exists
- **RVF production wiring** — RVF dual-writer now activated in all production code paths (learning engine, hooks, dream tool, learning helpers); all QEReasoningBank instances receive the shared RvfDualWriter singleton for best-effort native vector replication alongside SQLite
- **Shared RVF dual-writer singleton** — Lazy-initialized factory with graceful degradation when native binding is unavailable; `AQE_RVF_MODE=sqlite-only` env var override for operator control
- **17 RVF integration tests** — 10 mock-based tests for graceful degradation and singleton lifecycle, plus 7 native-path tests exercising real RVF containers with QEReasoningBank integration

### Fixed

- **O(n^2) similarity edge explosion** — Dream engine spreading activation now caps edges to prevent quadratic blowup on large pattern sets; benchmark test DB pollution eliminated
- **Non-semantic metrics embedding** — Skip embedding of JSON metrics objects that don't carry semantic meaning; raised slow-warning threshold to reduce noise
- **Persistence reliability** — Fixed data loss scenarios in learning pipeline persistence
- **Postgres test mocking** — Fixed unit test mocking for PostgreSQL backend; added real integration tests
- **Security hardening** — God-file decomposition and security hardening across multiple modules
- **Brain CLI documentation** — Corrected examples in README for brain export/import commands
- **RVF shutdown ordering** — RVF cleanup now runs after MCP server drain (was before, risking data store closure during active requests)
- **RVF reset race condition** — Replaced fire-and-forget async import with synchronous `registerRvfResetFn()` callback pattern for deterministic cleanup in tests

### Changed

- **Build externals** — Added all `@ruvector/rvf-node` platform variants to esbuild native module externals in both CLI and MCP build scripts
- **MCP base module** — Added `registerRvfResetFn()` export for cross-module synchronous reset coordination

## [3.7.0] - 2026-02-23

### Added

- **RVF Cognitive Container integration** — 12 of 16 planned integration tasks completed across 4 workstreams: MinCut routing, dream cycle branching, witness chain attestation, and HNSW unification
- **MinCut-based task routing** — Lambda (vertex connectivity) analysis models task complexity as a graph problem for the 3-tier model router; shadow mode collects comparison data against the production heuristic router
- **RVCOW dream cycle branching** — Copy-on-write branching for dream cycle experimentation using SQLite savepoints and in-memory overlays; speculative insights are isolated until merged
- **Cryptographic witness chain** — SHA-256 hash-chained append-only audit trail for quality gate decisions, pattern promotions, test suite completions, and routing decisions; tamper-evident with chain verification
- **HNSW unification** — Consolidated 3 fragmented HNSW implementations behind a unified progressive adapter with 2-state search (fast flat scan vs full HNSW) based on collection size
- **Brain export/import CLI** — `aqe brain export`, `aqe brain import --dry-run`, and `aqe brain info` commands for portable QE intelligence containers (.aqe-brain format with JSONL + binary vectors)
- **MinCut test suite optimizer** — Models test suites as coverage graphs, computes minimum cut to identify critical tests, skippable tests, and optimal execution order; wired into test-execution domain
- **RVF dual-writer** — Best-effort dual-write from QEReasoningBank to both SQLite and RVF containers, preparing for future RVF promotion as primary storage
- **RVF native adapter** — Direct N-API bindings to @ruvector/rvf-node bypassing SDK wrapper bugs; graceful fallback when native binaries unavailable
- **Stoer-Wagner structural health monitor** — Computes exact mincut of swarm and codebase dependency graphs as a normalized connectivity health score
- **MinCut wrapper** — Unified interface over TypeScript MinCutCalculator with native @ruvector/mincut-node fallback detection
- **246 new tests** across all RVF integration modules (unit + integration)

### Fixed

- **Dead module wiring** — MinCut test optimizer, brain CLI handler, and RVF dual-writer were implemented but not reachable from production code paths; all three now wired into their respective domains
- **Benchmark baseline integrity** — Original pre-RVF baseline (Feb 22) restored after being accidentally overwritten by post-integration rerun; Feb 23 rerun preserved separately
- **Dual-writer test honesty** — 21 mock-only tests that verified call counts without checking behavior replaced with assertions that verify argument content and response shape
- **HNSW unification test stability** — Fixed non-deterministic vector ordering caused by cosine similarity scale-invariance (`v * 0.9` has identical cosine similarity to `v`); replaced with directionally different vector

### Changed

- **Benchmark report transparency** — All "Live" status claims corrected to "Wired" or "Internal"; added honest "Modules Not Yet Wired" section; recommendations expanded from 5 to 9
- **QEReasoningBank extensibility** — Added optional `setRvfDualWriter()` injection point for best-effort dual-write during `storePattern()` and `promotePattern()`
- **Test execution coordinator** — Added `optimizeTestSuite()` method delegating to MinCut test optimizer

## [3.6.19] - 2026-02-22

### Fixed

- **Event-driven trajectory lifecycle** — Replaced fragile fire-and-forget polling loop with event subscriptions on CrossDomainEventRouter (TaskCompleted/TaskFailed), eliminating race conditions and memory leaks in task trajectory tracking
- **Object return type misclassified as primitive** — Test generators (Jest/Vitest, Mocha, Node, Pytest) now correctly detect `{ valid: boolean }` as an object type instead of matching the inner `boolean` keyword; fixed across all 5 generators (7 code locations)
- **memory_store persistence check** — Removed unnecessary duck-typing dance for `isPersistent()` check; HybridMemoryBackend always persists to SQLite when initialized
- **memory_usage reported zeros** — `memory_usage` MCP tool now returns real vector count and namespace count from HybridMemoryBackend instead of hardcoded zeros
- **fleet_status missing learning metrics** — Added `learning` field to fleet_status response with real counts from SQLite (patterns, experiences, trajectories, vectors, dream cycles, embedding dimension)
- **Auto-team-wiring crash with partial mocks** — Guard against undefined DomainTeamManager during agent spawn in test environments

### Added

- **queryCount() on UnifiedMemoryManager** — SQL-injection-safe method with table allowlist for counting rows in learning tables
- **Trajectory event subscription wiring** — `subscribeTrajectoryEvents()` and `unsubscribeTrajectoryEvents()` called during fleet init/dispose
- **Orphaned trajectory cleanup** — Stale trajectories (>1 hour, never completed) are marked as failed at startup
- **ReasoningBank learning system guide** — New documentation at `docs/guides/reasoningbank-learning-system.md` covering the 4-stage learning pipeline, pattern lifecycle, and embedding architecture
- **25 new unit tests** — Coverage for all 6 fixes: trajectory events, task payload mapping, queryCount, memory persistence, memory usage, and object return type assertions

### Changed

- **Embedding dimension consolidation** — ReasoningBank and PatternStore layers standardized on 384-dim embeddings (all-MiniLM-L6-v2); coverage-analysis 768-dim indices are intentionally separate

## [3.6.18] - 2026-02-21

### Added

- **6 new Agent Teams MCP tools** — `team_list`, `team_health`, `team_message`, `team_broadcast`, `team_scale`, `team_rebalance` expose ADR-064 domain team management via MCP
- **Team membership in agent_list** — Each agent now shows its team role (`lead` or `teammate`) and team size
- **Teams summary in fleet_status** — Fleet status response now includes active teams count, total agents in teams, and healthy team count
- **Auto-team-wiring on agent spawn** — Agents are automatically registered in domain teams when spawned (first agent = lead, subsequent = teammates)
- **addTeammate() on DomainTeamManager** — New method to add real agent IDs as teammates (instead of synthetic IDs from scaleTeam)
- **Runtime message-type validation** — `team_message` and `team_broadcast` reject invalid message types with clear error messages

### Fixed

- **Race condition in parallel agent spawns** — Two concurrent spawns for the same domain no longer cause the second agent to become a ghost; the create-team failure now falls back to addTeammate
- **Duplicate agent guard** — `addTeammate()` rejects agents already in the team, preventing corrupted team size calculations

## [3.6.17] - 2026-02-21

### Added

- **HNSW semantic search** — `memory_query` now supports `semantic: true` for natural language queries using HNSW vector search with cosine similarity scoring, with automatic fallback to pattern matching
- **Vector storage on write** — `memory_store` now indexes entries in the HNSW vector index alongside KV storage, so semantic search finds them immediately
- **Hierarchical agent topology** — `fleet_init` with `topology: "hierarchical"` now assigns agents as domain leads or workers (first agent per domain becomes lead)
- **MCP reconnection with buffering** — Transport errors trigger exponential backoff reconnection with request buffering and replay
- **Real experience capture** — Tool executions now record patterns via ExperienceCaptureService instead of returning placeholder feedback

### Fixed

- **Stdio transport timeout under parallel load** — Write timeout increased from 30s to 120s with retry logic and backpressure handling, preventing dropped connections during parallel agent spawns
- **Semantic search returned 0 results** — `memory_store` was only saving to KV store but not indexing vectors; now calls `storeVector()` after every write
- **Embedding dimension mismatch** — Text embedding function now generates 768-dimension vectors matching the HNSW index configuration
- **Transport stop() race condition** — `running` flag now set before closing readline, preventing error handler from triggering reconnect during explicit shutdown

### Changed

- Queen Coordinator documentation updated with semantic search parameters and complete tool reference table
- Learning feedback messages now reflect actual capture status instead of hardcoded "patterns updated" text

## [3.6.16] - 2026-02-21

### Added

- **Node.js `node:test` runner** — 5th test framework using `node:test` describe/it and `node:assert`. Generate tests with `--framework node-test` for zero-dependency testing on Node.js 18+.
- **Smart assertions** — Test generators now infer assertion type from function name (`is*` → boolean, `get*` → not undefined, `create*` → truthy) and return type, across all 5 generators including class methods.
- **Destructured parameter handling** — Functions with `({ a, b })` or `([x, y])` parameters now get proper test values instead of broken variable references. Multiple destructured params get indexed names to avoid collisions.

### Fixed

- **`convertToAssert()` double-lambda bug** — `assert.throws(() => action)` never threw because `action` was already a function. Now correctly passes `assert.throws(action)`.
- **`convertToAssert()` regex ordering** — Specific patterns (`typeof`, `Array.isArray`) now fire before generic `toBe`, preventing garbled output.
- **Missing `toBeInstanceOf` conversion** — Node:test generator now converts `expect(e).toBeInstanceOf(Error)` to `assert.ok(e instanceof Error)`.
- **Unconverted `expect()` in action fields** — Boundary/edge-case test actions containing `expect()` are now converted to `assert.*` for node:test output.
- **`is`/`has`/`can` prefix false positives** — Smart assertions now require uppercase after prefix (e.g., `isValid` matches but `isolate` does not).
- **Mocha/Pytest missing `#` private method filter** — ES private methods (`#method`) are now excluded from generated tests in all frameworks.
- **`node-test` missing from runtime paths** — Added to task executor, CLI wizard, shell completions, MCP tools, and plugin interfaces.

### Changed

- Smart assertions now apply to class method tests across all generators (previously only standalone functions)
- Factory test suite expanded to cover all 5 frameworks in integration tests

## [3.6.15] - 2026-02-20

### Fixed

- **Test generation produces unusable stub code** (#295) — Fixed 11 bugs across 8 files in the test-generation domain:
  - Python import regex matching `{` from TypeScript destructured imports as a dependency
  - Non-exported functions/classes getting test stubs (all 4 generators: Jest, Vitest, Mocha, Pytest)
  - Undefined `mockXxx` variables from unknown types — now returns safe inline values
  - Missing void return type handling in Mocha and Pytest generators
  - `pattern-matcher` `generateMockValue()` returning bare variable references
  - Generated test files only printed to stdout, never written to disk
  - Blanket `toThrow()` assertions for undefined params — now wrapped in try-catch
- **Cloud sync silently falls back to mock mode** — `await import('pg')` fails inside esbuild bundles. Changed to `createRequire(import.meta.url)('pg')` which resolves correctly at runtime. Separated "pg not installed" from "connection failed" error paths.
- **Cloud sync source paths resolve to wrong directory** — JSON source paths used `../` prefix that resolved relative to `v3/` instead of project root. Fixed all sync source paths to use `./` prefix.

### Added

- Data protection rules in CLAUDE.md to prevent accidental database deletion or corruption by AI agents

## [3.6.14] - 2026-02-20

### Fixed

- **MCP unit test timeouts and DevPod OOM crashes** (#294, #251) — Mock `createTaskExecutor` at module level in domain-handlers and wrapped-domain-handlers tests to prevent real task execution (each fleet init allocates ~200-400MB). Reduced fleet init from ~31x to ~5x per test file via shared beforeAll/afterAll lifecycle in core-handlers tests.
- **Vitest parallel execution causing memory exhaustion** — Changed `maxForks: 2` to `1` and disabled `fileParallelism` in vitest.config.ts. Added `bail: 3` to fail fast instead of accumulating OOM pressure.
- **CI artifact upload 403 Forbidden** (#294) — Added `actions: write` permission to `optimized-ci.yml` and `mcp-tools-test.yml` workflows for `upload-artifact@v4`.
- **Topology optimizer flaky convergence test** (#251) — Widened tolerance from `earlyAvg * 2` to `earlyAvg * 3` and added `retry: 3` for probabilistic convergence assertion.
- **Test assertions using 128-dim instead of 768-dim** — Updated remaining test assertions to match the 768-dim embedding vectors from v3.6.12's HNSW fix.

## [3.6.13] - 2026-02-19

### Fixed

- **test_generate_enhanced returned placeholder stubs** (#292) — Agent Booster was intercepting generate-tests tasks via func-to-arrow pattern detection in source code. Added task-type blocklist to prevent Booster from hijacking domain tasks. Fixed mapToResult to use real testCode from domain service with extracted assertions instead of V2 `func() === null` stubs.
- **MCP connection crash from uncaught exceptions** (#292) — Added uncaughtException and unhandledRejection handlers in MCP entry to keep the JSON-RPC connection alive. Wrapped QualityFeedbackLoop initialization in defensive try/catch.
- **Vector dimension mismatch 128 vs 768 in 6 locations** (#292) — Changed embeddingDim defaults from 128 to 768 in decision-transformer, test-generation coordinator, test-prioritizer, feature-flags (2 locations), and shard-embeddings.
- **coverage_analyze_sublinear returned empty coverageByFile** (#292) — Handler now attempts automatic coverage collection by running `npm test --coverage` when no existing data found. Detects test runner from package.json. Added per-file coverage data mapping in result.
- **Security scan missed secrets in JS/TS files and known CVEs** (#292) — Cross-language secret patterns now run on ALL files (was only non-JS/TS). Added known-CVE checking for python-jose (CVE-2024-33663/33664) and python-multipart (CVE-2026-24486). Added generic SECRET assignment pattern.
- **aqe init --auto hooks verification** (#292) — Added post-write verification after settings.json write to detect and warn about missing AQE hooks.

### Added

- Bug Fix Verification rules in CLAUDE.md (reproduction-first, MCP-CLI parity, per-issue verification, smoke test, evidence required, integration tests for MCP)

## [3.6.12] - 2026-02-19

### Fixed

- **HNSW native crash on vector dimension mismatch** (#284, #285) — All 13 HNSW-related source files were initialized with 128 dimensions while RealEmbeddings produces 768-dim vectors. The mismatch triggered a native Rust SIGABRT in ruvector-gnn, killing the MCP connection. All dimension constants now correctly use 768.
- **Dimension guard for mismatched vectors** (#284) — `unified-memory-hnsw.ts` now skips mismatched vectors with a warning instead of producing garbage partial cosine similarity results.
- **Security scan returned hardcoded fake findings** (#287) — Complete rewrite of `scan.ts` to perform real SAST file scanning using 40+ regex patterns from security-patterns.ts. Now scans security-relevant directories (.github, .docker, .aws) and checks dependency vulnerabilities.
- **Coverage analyzer missing XML parser** (#286) — Added Cobertura XML parser with order-independent attribute extraction to `loadCoverageData()`. XML coverage files no longer silently fall through.
- **Secret detection only found first match per line** (#286) — Changed from `test()` to `matchAll()` so multiple secrets on the same line are all reported.
- **CORS detection too narrow** (#286) — Broadened from single Express pattern to 5 patterns covering Express, Spring Boot, Nginx, Go, and raw HTTP headers.
- **Fake MCP handlers** (#286) — Replaced 6 stub handlers (execute-tests, validate-requirements, validate-contracts, test-accessibility, run-chaos, optimize-learning) with real implementations or honest guidance responses.
- **`aqe init --auto` did not create .claude/hooks/ directory** (#288) — Init phase 07-hooks.ts now creates `.claude/hooks/`, installs real hook assets (cross-phase-memory.yaml, v3-domain-workers.json), and writes a README explaining the hook setup.
- **Dangerous uncaughtException handler** — Removed `process.on('uncaughtException')` from protocol-server.ts that was masking bugs. The existing try/catch on `onRequest` handles JS errors; native SIGABRT from Rust cannot be caught by any JS handler.

## [3.6.11] - 2026-02-18

### Added

- **Smart settings merge for `aqe init --auto`** — Init now detects existing AQE hooks and updates them in-place instead of duplicating. Non-AQE user hooks are preserved. Both modular and wizard init paths share the same merge logic.
- **Multi-language file discovery** — New shared `file-discovery.ts` utility supports 12+ languages (TypeScript, Python, Go, Rust, Java, Kotlin, Ruby, C#, PHP, Swift, C/C++, Scala). Used by all CLI commands.
- **Accuracy indicator on metrics** (#281) — `ProjectMetrics` now includes an `accuracy` field (`accurate` | `approximate`) so consumers know whether LOC/test counts come from real file analysis or estimation.

### Fixed

- **MCP server crash on malformed requests** (#274) — Added try/catch safety wrapper on `onRequest` handler. Malformed tool calls now return structured errors instead of killing the MCP connection.
- **`code_index` hardcoded to JS/TS only** (#275) — Replaced inline TypeScript-only file walkers in `code`, `coverage`, `security`, and `test` CLI commands with the shared multi-language discovery utility.
- **`test_generate_enhanced` temp file extension** (#274) — Temp file now uses the correct extension based on the `language` parameter instead of always `.ts`.
- **Coverage handler returned synthetic file paths** (#276) — Removed fabricated `src/module0.ts` placeholders from coverage results. Only real file paths are returned.
- **Model router fallback score went negative** (#278) — Fixed `fallbackToLLM: -1` with `Math.max(0, ...)`. Improved complexity scoring with proper tier thresholds and domain-specific floors.
- **HNSW index panic on dimension mismatch** (#277) — `validateVector()` now resizes vectors (averaging to shrink, zero-padding to grow) instead of throwing on 768→128 mismatch.
- **LOC counter accuracy for node-native fallback** (#281) — Expanded `excludeDirs` with Python, Java, and framework directories. Added max file size guard (2MB), depth limit, and dot-directory exclusion. Renamed source from `'fallback'` to `'node-native'` since it reads real files.
- **Init wizard missing `--json` flags on hooks** — Legacy wizard path hooks now include `--json` flags matching the working configuration.
- **MCP server name mismatch** — Changed from `'aqe'` to `'agentic-qe'` with migration for old entries.

### Changed

- **Cross-language security scanning** — `task-executor.ts` now applies regex-based security patterns (hardcoded secrets, SQL injection, CORS misconfig) to non-JS/TS files during `test_generate_enhanced`.
- **Model routing enrichment** — `task_orchestrate` and `model_route` MCP handlers now infer domain and criticality from task descriptions for better routing decisions.

## [3.6.10] - 2026-02-18

### Added

- **QCSD Production Telemetry Swarm** (#271) — 5th and final QCSD lifecycle phase. Collects DORA metrics, deployment frequency, change failure rate, and MTTR via GitHub API. Includes auto-trigger workflow after npm publish and cross-phase memory hooks (Loop 5: CI/CD → Production).
- **Eval-driven development workflow** — New `scripts/eval-driven-workflow.ts` for creating, running, and iterating on skill evaluations as the primary development loop.
- **Deterministic skill quality scorer** — `scripts/score-skill-quality.ts` computes reproducible quality scores for skills based on structure, coverage, and eval results.
- **Skill conflict detector** — `scripts/detect-skill-conflicts.ts` identifies overlapping skill scopes and trigger conflicts across the fleet.
- **Eval runner P1 grading improvements** — Negative control test cases (inverted pass logic for "skill should decline" tests), finding count enforcement, schema validation, weighted grading rubric (completeness/accuracy/actionability), and adaptive rubric with dynamic keyword extraction.
- **KG-assisted test generation** — Knowledge Graph integration into test generators with 276x faster HNSW vector loading. All generators (Jest/Vitest, Mocha, Pytest) now emit mock declarations from KG dependency analysis.

### Fixed

- **Self-learning hooks not recording from CLI** — Hook interactions from CLI commands were silently dropped. Now all CLI hook interactions record learning data.

### Security

- **Dependency updates** (#272) — Bumped `tar` 7.5.7→7.5.9 (symlink path traversal fix) and `ajv` 8.17.1→8.18.0 (CVE-2025-69873 ReDoS mitigation).

## [3.6.9] - 2026-02-17

### Fixed

- **ESM TypeScript import failure in devcontainers** (#267) — Build scripts failed with ESM resolution errors in devcontainer environments. Fixed CLI and MCP esbuild scripts to handle TypeScript imports correctly.
- **DomainServiceRegistry not registered in kernel** — CQ-005 wired `DomainServiceRegistry` into the kernel bootstrap so domain services are discoverable at runtime.
- **ONNX adapter and shard-embeddings using wrong vectors table** — Wired ONNX embedding adapter and governance shard-embeddings to the unified `vectors` table instead of separate storage.
- **10 empty persistence tables and async race condition** — Wired persistence for mincut health monitor, strange loop, code-intelligence index, embedding cache, GOAP planner, and 5 other modules. Fixed async race condition in handler factory initialization.
- **Self-learning feedback loop not closing** (#265) — Test generation coordinator, pattern store, and reasoning bank were not feeding outcomes back into the learning system. Closed the loop so learning experiences actually improve future generations.
- **Queen coordinator missing tasksCompleted counter** — Task context lacked a `tasksCompleted` counter, preventing accurate progress tracking in swarm orchestration.

### Changed

- **Eliminated all 77 `as any` type casts** — Replaced unsafe casts across 20 files with proper typed interfaces, improving type safety across adapters, learning, MCP handlers, and security modules.
- **P0 security and performance fixes** — Applied critical security hardening (JWT validation, input sanitization, safe JSON parsing) and performance fixes identified by QE fleet analysis.
- **Code quality overhaul (41 goals across 6 phases)** — Completed comprehensive improvement plan covering all 13 domain coordinators with consistent error handling, proper typing, and reduced complexity.
- **God file splits** — Split oversized queen-coordinator (CQ-004) and code-intelligence/learning-optimization coordinators into focused modules (event handlers, lifecycle, task management, work stealing).
- **P1 code quality improvements** — Added error utilities, improved typing across all domain coordinators, and expanded test coverage.
- **Consolidated .db gitignore** — Unified database file exclusions and added `.agentic-qe/.claude/memory/` to gitignore.

## [3.6.8] - 2026-02-15

### Fixed

- **MCP tools failing with "Fleet not initialized"** — Every MCP tool call required a prior `fleet_init` call, which Claude Code doesn't do automatically. Fleet now auto-initializes on MCP server startup with default configuration (hierarchical topology, hybrid memory).
- **Experience persistence gap** — Learning system (`ExperienceReplay`) read from a separate `experiences` table while the capture middleware wrote to `captured_experiences`, so new experiences were never visible to the learning system. Unified to use `captured_experiences` as the single source of truth.
- **Split-brain database from relative dbPath** — `UnifiedMemoryManager` accepted relative paths (e.g. `.agentic-qe/memory.db`) which could create duplicate databases when CWD differed from project root. Now resolves relative paths through `findProjectRoot()`.
- **Missing runtime dependency `fast-json-patch`** (#262) — Package was marked as external in the MCP esbuild bundle but not listed in root `package.json`, causing `ERR_MODULE_NOT_FOUND` on fresh installs. Added `fast-json-patch` and `jose` to root dependencies.

### Changed

- **Data migrator** — v2-to-v3 migration now writes to `captured_experiences` table instead of the removed `experiences` table.

## [3.6.7] - 2026-02-14

### Fixed

- **Database corruption from concurrent VACUUM** — Automated VACUUM in HybridBackend ran every 10 minutes while 3+ hook processes held concurrent SQLite connections, causing intermittent "database disk image is malformed" errors. Removed automated VACUUM entirely; SQLite WAL mode handles space reclamation safely without it.
- **Dual-database split-brain** — `findProjectRoot()` found the first `.agentic-qe` directory walking up, which resolved to `v3/.agentic-qe` instead of root. Changed to find the topmost `.agentic-qe`, preventing shadow databases from forming.
- **Vector table bloat (124MB)** — Every HNSW index insert wrote vectors to SQLite's `vectors` table via `storeVector()`, accumulating 30K+ rows (124MB). Removed persistence since the in-memory HNSW index is the source of truth for search.
- **Cross-domain transfer re-running every session** — The seed flag (`reasoning-bank:cross-domain-seeded`) was set after `seedCrossDomainPatterns()`, but the 10-second hooks init timeout could fire mid-transfer, preventing the flag from ever being written. Moved the flag write before the transfer so it persists even on timeout.
- **Stop hook JSON validation error** — Stop hook output included `hookSpecificOutput` with `hookEventName: "Stop"`, but Claude Code's hook schema only accepts this field for PreToolUse, UserPromptSubmit, and PostToolUse events. Simplified to plain JSON output.
- **Hypergraph database path** — Code-intelligence coordinator used a relative path `.agentic-qe/hypergraph.db`, which created a shadow directory when run from `v3/`. Fixed to use `findProjectRoot()`.
- **Seed flag namespace collision** — Graph-boundaries kv_store writes used wrong namespace, causing cross-domain seed flag to not persist correctly.

### Added

- **File guardian hook** — Pre-edit hook that protects critical files (database files, WAL files, config) from accidental modification.
- **Command bouncer hook** — Pre-command hook that blocks dangerous shell commands (rm -rf on databases, VACUUM on live DB) with configurable rules.
- **Context injection hook** — Injects relevant context (recent patterns, domain knowledge) into prompts via UserPromptSubmit hooks.
- **Tier 2/3 kv_store persistence** — Learning experiences and routing feedback now persist to kv_store for cross-session retention.
- **Coverage learner feedback loop** — Tracks test outcomes and coverage trends to improve future test generation.
- **Token usage tracker** — Records token consumption per operation for cost analysis and optimization.
- **Q-learning router** — Reinforcement learning-based routing that improves agent selection over time.
- **RuVector WASM integrations** — AST complexity analyzer, coverage router, diff-risk classifier, and graph boundaries modules for fast local inference.

### Changed

- **Knowledge graph cache-only mode** — Code-intelligence knowledge graph no longer persists to PostgreSQL by default, preventing errors when PG is unavailable. Uses in-memory graph with SQLite-backed concept nodes/edges.
- **Pattern store simplified** — Removed unused code paths and reduced complexity in pattern persistence layer.

## [3.6.6] - 2026-02-13

### Fixed

- **Node 22+ crash on `npm install -g`** — `aqe --version` failed with `ERR_MODULE_NOT_FOUND: better-sqlite3` because Node 22's ESM resolver cannot handle packages without an `exports` field. Build scripts now use a `createRequire()` shim for all native modules, eliminating bare ESM imports that triggered `legacyMainResolve` failures.
- **Hooks writing to wrong database** — Self-learning hooks used `process.cwd()` to find the database, which could resolve to the wrong `.agentic-qe/` directory in monorepos or subdirectories. All hooks and learning commands now use `findProjectRoot()` to always write to the project root database.
- **Silent hook failures for 8+ days** — Removed 9 dead `npx @claude-flow/cli@latest` hooks and 3 `v3-qe-bridge.sh` hooks from settings.json that silently failed on every tool use. Each hook event now has exactly one working `aqe` handler.
- **Vector dimension mismatch in hooks** — HNSW index initialized at 128 dimensions while database vectors were 768, causing fallback to in-memory mode. Fixed all `embeddingDimension` defaults across hooks, learning, pattern-store, reasoning-bank, and MCP audit to 768.
- **Learning experiences not tracked** — `recordOutcome` in `post-task` hook only fired when both `--task-id` and `--agent` were passed, but hooks never pass `--agent`. Relaxed guard to only require `--task-id`, with agent defaulting to `"unknown"`.
- **FK constraint blocking analytics** — `qe_pattern_usage` table had a foreign key to `qe_patterns`, but hooks write synthetic pattern IDs. Removed the FK constraint so analytics writes succeed.
- **Statusline missing hook experiences** — Statusline experience count didn't include `qe_pattern_usage` table. Added it as a source, so hook-recorded learning now appears in metrics.
- **Noisy `[PatternStore] Loaded 0 patterns` log** — Suppressed the zero-count log that printed on every CLI invocation.

### Changed

- **Build system modernized** — `build-cli.js` and `build-mcp.js` now use esbuild's JavaScript API with a `nativeRequirePlugin` instead of shelling out via `execSync`. Native modules (better-sqlite3, @ruvector/*, hnswlib-node, etc.) are shimmed with `createRequire()` for Node 22+ compatibility. `chalk` externalized to avoid CJS `require('os')` failures in ESM context.

## [3.6.5] - 2026-02-13

### Fixed

- **Vector dimension mismatch (#255)** — `fleet_init` crashed with `Vector length mismatch: 128 vs 768` because QE domain HNSW indices were hardcoded to 128-dim while the embedding system produces 768-dim vectors. All 6 QE domain HNSW configs now derive dimensions from `EMBEDDING_CONFIG.DIMENSIONS` (768), and `DEFAULT_VECTOR_DIMENSIONS` aligned from 384 to 768. Coverage-analysis (128-dim custom feature vectors) remains unchanged.
- **Agent asset learning protocol** — 48 agent templates in `v3/assets/agents/v3/` had broken learning persistence: wrong namespace (`"patterns"` instead of `"learning"`), missing `persist: true`, and malformed key formats. Synced all assets from the correct committed agent definitions.
- **README CLI commands** — Fixed 13 incorrect CLI commands referencing non-existent flags/subcommands: `aqe init --wizard` → `aqe init`, `aqe memory search` → `aqe hooks search`, `aqe hooks metrics` → `aqe hooks stats`, `aqe hooks intelligence` → `aqe learning dream`, `aqe hooks model-route` → `aqe llm route`, `aqe coordination` → `aqe fleet status`, `aqe coherence` → MCP tools, `aqe migrate validate` → `aqe migrate verify`, `aqe workflow load` → `aqe workflow run`.

### Changed

- **CLAUDE.md init template** — `aqe init` now generates a CLAUDE.md with comprehensive MCP tool usage instructions including `fleet_init` requirement, tool examples with correct `mcp__agentic-qe__` prefix, and full tool reference table.
- **README MCP setup flow** — Clarified that `aqe init --auto` configures `.mcp.json` automatically; Claude Code auto-starts the MCP server on connection. Manual `aqe-mcp` only needed for non-Claude-Code clients.

## [3.6.4] - 2026-02-12

### Added

- **Dream Scheduler** — Automated dream consolidation with configurable cron schedules, CLI subcommand (`aqe learning dream`), and schema migration for dream cycle persistence.
- **QE Pattern Seeding** — 18 QE patterns seeded across 9 previously empty learning domains (chaos-resilience, code-intelligence, contract-testing, defect-intelligence, learning-optimization, quality-assessment, requirements-validation, security-compliance, visual-accessibility).
- **Delta Scanning for Code Intelligence** — `aqe init` code intelligence phase now performs incremental delta scans instead of full re-scans, with expanded exclusion patterns for faster initialization.
- **Concept Graph Edge Discovery** — `ConceptGraph.loadFromPatterns()` is now idempotent and automatically discovers co-occurrence and similarity edges between related patterns.
- **Pattern Usage Recording** — Domain handler factory records pattern usage asynchronously after task completion, feeding the self-learning feedback loop.
- **5 New Security Validator Test Suites** — Command, crypto, input sanitizer, path traversal, and regex safety validators with 150+ test cases.

### Fixed

- **Security Hardening (3 Sprints)** — OAuth provider PKCE enforcement, rate limiter bypass prevention, schema validator prototype pollution protection, SQL injection via table name interpolation, ReDoS-safe regex patterns, connection pool resource exhaustion guards.
- **SQL Safety Module** — New `sql-safety.ts` shared module with table name allowlist applied consistently across all SQL interpolation sites.
- **4 Flaky Test Suites Stabilized** — Retry queue, event batcher, queen coordinator race condition, and domain tools tests now use deterministic mocking instead of timing-dependent assertions.
- **SONA Test Timeouts** — Learning optimization coordinator and plugin tests no longer time out during CI runs.
- **Init Auto-Install Prevention** — `aqe init` no longer triggers `npx` auto-installation of `@claude-flow/cli` when the package isn't available.
- **MCP Config Cleanup** — Removed duplicate `agentic-qe-v3` MCP server entry, keeping only the canonical `agentic-qe` entry.

### Changed

- **Performance Hardening** — Connection pool with bounded size limits, mincut calculator iteration caps, embedding generator batch size guards, and SSE/WebSocket/stdio transport resource cleanup improvements.
- **Statusline Updated** — Reflects 13 domains and 60 agents in the fleet configuration.

## [3.6.3] - 2026-02-11

### Added

- **QX (Quality Experience) Analysis Tool** — New MCP tool `qe/analysis/qx_analysis` bridging QA and UX by analyzing user journeys, experience impact, and quality-experience correlation.
- **SFDIPOT Product Factors Assessment** — `qe-product-factors-assessor` agent implementing James Bach's HTSM v6.3 framework for comprehensive test strategy generation.

### Fixed

- **Cross-platform compatibility** — Replaced all bash-only `.sh` scripts with cross-platform Node.js (`.cjs`) equivalents. Windows, macOS, and Linux now fully supported for skill validation, daemon management, and project initialization.
- **Stop hook hanging on exit** — Session-end hook no longer initializes the full database/HNSW/memory system just to print shutdown stats. Added `unref()` to all cleanup intervals so Node.js process exits cleanly.
- **Cross-platform daemon scripts** — `start-daemon.cjs` and `stop-daemon.cjs` replace bash scripts, using `process.kill()` and `spawn()` with `detached: true` for portable process management.
- **TypeScript shell type in execSync** — Fixed `ExecSyncOptionsWithStringEncoding` overload conflict by using platform-specific shell string instead of `shell: true` boolean.
- **Tunnel manager test stability** — Pre-spawn port availability check prevents flaky failures from port conflicts.

### Changed

- **QE agents use only AQE MCP** — All 46 QE agent definitions now reference `agentic-qe` MCP tools exclusively, removing any Claude Flow MCP dependencies.
- **Skill validation is now declarative** — `validate-config.json` + `validate-skill.cjs` replaces all 104 `validate.sh` scripts. Validators are fully cross-platform with no bash dependency.
- **Registry tool count** — MCP tool registry updated from 32 to 33 tools to include QX Analysis.

## [3.6.2] - 2026-02-10

### Fixed

- **YAML parser empty array crash (Issue #244)** — `aqe init --auto` no longer fails on re-runs when `config.yaml` has empty array fields like `disabled:` with no items. The custom YAML parser now normalizes known array fields after parsing, and `mergeConfigs()` uses defensive `Array.isArray()` checks.
- **Agent parse errors on helper files (Issue #243)** — Helper reference files (`htsm-categories.md`, `evidence-classification.md`) and the generated `README.md` are no longer placed inside `.claude/agents/v3/` where `claude doctor` would incorrectly parse them as agent definitions. Helpers now install to `.claude/helpers/v3/` and the agents index writes to `.claude/docs/v3-agents-index.md`.

### Changed

- **Helper files location** — Agent helper/reference files (quality-criteria templates, SFDIPOT templates) now install to `.claude/helpers/v3/` instead of `.claude/agents/v3/helpers/`. Updated all path references in `quality-criteria-service.ts` and agent definitions.

## [3.6.1] - 2026-02-09

### Added

- **Agent Teams Integration (ADR-064)** — Hybrid fleet architecture layering Claude Code Agent Teams communication patterns on the existing Queen Coordinator. 4-phase implementation: Foundation, Hybrid Architecture, Learning & Observability, Advanced Patterns.
- **Agent Teams Adapter** — Direct mailbox messaging between agents with domain-scoped teams (2-4 agents per domain), team lead/teammate model, and subscription-based event delivery.
- **Fleet Tier Selector** — Tiered fleet activation (smoke/standard/deep/crisis) that controls agent count and token costs based on trigger context (commit, PR, release, incident).
- **Task Dependency DAG** — Topological ordering with cycle detection for multi-step task workflows. DAGScheduler for automated execution of ready tasks.
- **TeammateIdle Hook** — Auto-assigns pending tasks to idle agents, reducing Queen bottleneck for task distribution.
- **TaskCompleted Hook** — Extracts patterns from completed tasks and trains them into ReasoningBank automatically. Quality gate validation with exit code 2 rejection.
- **Domain Circuit Breakers** — Per-domain fault isolation with configurable failure thresholds, half-open recovery probing, and criticality-based configs.
- **Domain Team Manager** — Creates and manages domain-scoped agent teams with health monitoring, scaling, and rebalancing.
- **HNSW Graph Construction** — Real O(log n) HNSW insert and search in unified memory, replacing the O(n) linear scan stub.
- **Distributed Tracing** — TraceCollector with W3C-style TraceContext propagation encoded into AgentMessage correlationId fields. Queen traces full task lifecycles.
- **Competing Hypotheses** — HypothesisManager for multi-agent root cause investigation with evidence scoring, confidence tracking, and convergence (evidence-scoring, unanimous, majority, timeout). Auto-triggered on p0/p1 task failures.
- **Cross-Fleet Federation** — FederationMailbox with service registry, domain-based routing, health monitoring via heartbeats, and graceful degradation for unreachable services.
- **Dynamic Agent Scaling** — DynamicScaler with workload metrics collection, configurable scaling policies (queue depth, idle ratio, error rate thresholds), cooldown enforcement, and executor callbacks. Wired into Queen's metrics loop.
- **ReasoningBank Pattern Store Adapter** — Bridges TaskCompletedHook pattern extraction to QEReasoningBank storage with domain detection, type mapping, and confidence propagation.
- **promotePattern() Implementation** — Completes the ReasoningBank promotion stub: delegates to PatternStore.promote() and publishes pattern:promoted events.
- **Devil's Advocate Agent** — `qe-devils-advocate` agent that challenges other agents' outputs by finding gaps and questioning assumptions.
- **397+ New Tests** — 282 coordination tests, 67 hook tests, 48 learning tests covering all ADR-064 phases including adapter tracing integration and latency benchmarks.

### Fixed

- **6 CodeQL Alerts** — Resolved security alerts in enterprise-integration services (input validation, type safety).
- **Pattern Training Pipeline** — Connected the disconnected TaskCompletedHook → ReasoningBank pipeline so patterns are automatically trained on task completion.
- **Queen Operational Wiring** — All Phase 3+4 modules (tracing, dynamic scaler, hypotheses) are now called by Queen's operational flow, not just initialized as shelf-ware.

### Changed

- **Queen Coordinator** — Extended with tracing (startTrace on submitTask, completeSpan/failSpan on completion/failure), dynamic scaling (metrics feed + evaluate + execute in metrics loop), and competing hypotheses (auto-investigation on critical failures).
- **Agent Teams Adapter** — sendMessage() and broadcast() now encode TraceContext into correlationId when provided, enabling end-to-end distributed tracing.

## [3.6.0] - 2026-02-08

### Added

- **Pentest Validation (Shannon-Inspired)** — Graduated exploit validation with "No Exploit, No Report" quality gate. Transforms security findings from theoretical risks into proven vulnerabilities with PoC evidence. Based on Six Thinking Hats analysis of Shannon (KeygraphHQ) pentesting concepts.
- **`qe-pentest-validator` Agent** — New agent in security-compliance domain with 3-tier graduated exploitation (pattern proof, payload test, full exploit), parallel per-vulnerability-type pipelines (injection, XSS, auth, SSRF), exploit playbook memory with ReasoningBank learning, and cost optimization via 3-tier model routing.
- **`pentest-validation` Skill (Tier 3)** — Orchestration skill with 4-phase pipeline (recon → analysis → validation → report), full eval suite (15 test cases), JSON schema validation, and bash validator script. Trust tier 3 with comprehensive validation infrastructure.
- **Init Fixes** — Templates directory support in agents-installer, 5 skills synced between .claude/ and v3/assets/, SKILL.md casing fixes, 'release' added to EXCLUDED_SKILLS.

### Changed

- **Skill Count** — 74 → 75 QE skills (46 Tier 3 + 29 additional)
- **Agent Count** — 58 → 59 specialized QE agents (52 agents + 7 subagents)
- **Version Bump** — v3.5.6 → v3.6.0 (minor version bump for new agent/skill/capabilities)

## [3.5.6] - 2026-02-08

### Added

- **Enterprise Integration Domain (ADR-063)** — 14th DDD bounded context covering SOAP/WSDL, SAP RFC/BAPI/IDoc, OData, ESB/middleware, message broker, and Segregation of Duties testing. Full coordinator, interfaces, plugin, and 6 production services (4,575 lines). 87 unit tests.
- **7 New QE Agents** — `qe-soap-tester`, `qe-sap-rfc-tester`, `qe-sap-idoc-tester`, `qe-middleware-validator`, `qe-odata-contract-tester`, `qe-message-broker-tester`, `qe-sod-analyzer`
- **4 New Skills** — `enterprise-integration-testing`, `middleware-testing-patterns`, `wms-testing-patterns`, `observability-testing-patterns`
- **QCSD Swarm Enhancements** — All 4 swarm phases (ideation, development, refinement, cicd) updated with 3 enterprise integration flags (`HAS_MIDDLEWARE`, `HAS_SAP_INTEGRATION`, `HAS_AUTHORIZATION`) and conditional agent mappings
- **QX Partner HTML Report Template** — Mandatory HTML generation with 11 required sections, 23+ heuristics with scoring, 6-8 creativity domains, and auto-collapse JS
- **StrongDM Software Factory Integration (ADR-062)** — Tier 1 loop detection + token dashboard for software delivery governance
- **Self-Healing Infrastructure Docs** — Design docs for DB recovery patterns, Strange Loop capabilities, and infrastructure extension design
- **V3 Technical Architecture Glossary** — Comprehensive glossary of v3 architecture terms

### Fixed

- **Dual-database data splits** — Unified `findProjectRoot` to prevent SQLite databases from being created in wrong directories
- **Test data generator locale** — Faker now correctly applies locale parameter instead of always generating English data
- **OOM in Codespaces** — Capped `NODE_OPTIONS` heap to 1GB to prevent out-of-memory crashes in constrained environments

### Changed

- **Benchmark reports cleanup** — Removed ~6k lines of auto-generated reports from `v3/docs/reports/`
- **ADR numbering** — Renumbered enterprise integration ADR from 059 to 063 to avoid conflict with ghost-intent-coverage ADR-059

## [3.5.5] - 2026-02-06

### Added

- **Ghost Intent Coverage Analysis (ADR-059)** - Detect untested behavioral intents ("phantom gaps") that traditional line/branch coverage misses. Surfaces hidden coverage gaps in error handling, edge cases, and implicit behavioral contracts.
- **Semantic Anti-Drift Middleware (ADR-060)** - Event pipeline middleware that attaches semantic fingerprints to domain events and verifies payload integrity across agent-hop boundaries using cosine similarity checks.
- **Asymmetric Learning Rates (ADR-061)** - 10:1 penalty-to-reward ratio for learning from failures vs successes. Failed patterns are quarantined with exponential confidence decay; successful patterns earn gradual trust through consecutive wins.

### Fixed

- **Dynamic package version in init** - `aqe init --auto` now reads version from package.json instead of hardcoded `3.0.0` (#240)
- **Init upgrade path** - Resolved issues with `aqe init --auto` when upgrading existing projects (#239)

### Changed

- **CLAUDE.md** - Added insights-driven rules and custom skills for improved agent coordination
- **Release workflow** - Updated `/release` skill with artifact verification gates and working-branch-first PR flow

## [3.5.2] - 2026-02-05

### Added

#### Standalone Learning Commands (ADR-021)
- **`aqe learning` command** - New command group for self-learning system management without claude-flow dependency
  - `aqe learning stats` - Display learning system statistics (patterns, domains, search performance)
  - `aqe learning export` - Export learned patterns to JSON for sharing between projects
  - `aqe learning import` - Import patterns from JSON file
  - `aqe learning consolidate` - Promote successful patterns to long-term memory
  - `aqe learning extract` - **NEW** Extract QE patterns from existing learning experiences in the database
  - `aqe learning reset` - Reset learning data (with confirmation)
  - `aqe learning info` - Show learning system configuration and paths
- **Portable hooks** - `aqe init --auto` now generates hooks using `npx agentic-qe` for portability (no global install required)
- **Pattern extraction** - Mine historical learning data to bootstrap new patterns with proper confidence scoring

#### Domain-Driven Design Documentation
- **DDD README** - Comprehensive guide to V3's 12 bounded contexts architecture
- **12 Domain Specifications** - Full DDD documentation for each QE domain:
  - test-generation, test-execution, coverage-analysis, quality-assessment
  - defect-intelligence, learning-optimization, requirements-validation, code-intelligence
  - security-compliance, contract-testing, visual-accessibility, chaos-resilience
- Each domain doc includes: bounded context, aggregates, domain events, anti-corruption layers, and integration patterns

### Fixed

- **JSON parse bug in v3-qe-bridge.sh** - Fixed shell escaping issue by passing data via environment variables instead of direct interpolation. Now handles file paths with spaces and special characters correctly.
- **Statusline accuracy** - Show actual values for sub-agents and memory utilization instead of placeholders

### Changed

- **Hooks configuration** - All hook commands now use `--json` flag for structured output
- **CLAUDE.md** - Streamlined project instructions

## [3.5.1] - 2026-02-04

### Security

- **tar vulnerability fix** - Added `tar>=7.5.7` override to fix 6 HIGH severity Dependabot alerts
  - Fixes: Hardlink Path Traversal, Unicode Ligature Race Condition, Symlink Poisoning
  - `npm audit` now shows 0 vulnerabilities

### Changed

- **Documentation** - Added v3.5.0 release highlights to README.md and v3/README.md
- **skills-manifest.json** - Updated to v1.3.0 with skill breakdown (67 QE skills)

## [3.5.0] - 2026-02-04

### 🎯 Highlights

**Governance ON by Default (ADR-058)** - The @claude-flow/guidance governance integration is now enabled by default during `aqe init`. This provides invisible guardrails that protect your AI agents from rule drift, runaway loops, memory corruption, and trust erosion—without slowing them down.

**QCSD 2.0 Complete Lifecycle** - All four QCSD phases are now implemented:
- **Phase 1: Ideation** - Quality criteria analysis with HTSM/SFDIPOT
- **Phase 2: Refinement** - BDD scenario generation for Sprint Refinement
- **Phase 3: Development** - Code-integrated quality gates (SHIP/CONDITIONAL/HOLD)
- **Phase 4: CI/CD Verification** - Pipeline quality gates (RELEASE/REMEDIATE/BLOCK)

**Infrastructure Self-Healing Enterprise Edition (ADR-057)** - Extended with 12 enterprise error signatures (SAP RFC/BAPI, Salesforce, Payment Gateway, WMS/ERP), auto-recovery pipeline, and MCP tools.

### Added

#### @claude-flow/guidance Governance Integration (ADR-058)
- **Governance Phase in `aqe init`** - Phase 13 installs constitution.md and 12 domain shards to `.claude/guidance/`
- **Governance ON by default** - Use `--no-governance` to opt-out (not recommended)
- **Constitution** - 7 unbreakable QE invariants enforced across all agents
- **Domain Shards** - 12 governance rule files, one per QE domain
- **Feature Flags** - Fine-grained control over individual governance gates
- **Non-strict Mode** - Logs violations but doesn't block (graceful degradation)
- **`--upgrade` support** - Overwrites governance files when upgrading

#### QCSD Refinement Swarm (Phase 2)
- **SKILL.md** - 2076-line skill definition with 9 phases, 7 agents, 3 parallel batches
- **qcsd-refinement-plugin.ts** - 1860-line TypeScript plugin with 10 workflow actions
- **SFDIPOT Analysis** - Structure, Function, Data, Interface, Platform, Operations, Time factor analysis
- **BDD Scenario Generation** - Automated Gherkin scenario creation from requirements
- **Requirements Validation** - Testability scoring and acceptance criteria validation
- **28 integration tests** - Full test coverage

#### QCSD Development Swarm (Phase 3)
- **SKILL.md** - 1839-line skill definition with 9 phases, 7 agents
- **Flag Detection** - HAS_SECURITY_CODE, HAS_PERFORMANCE_CODE, HAS_CRITICAL_CODE
- **Decision Logic** - SHIP/CONDITIONAL/HOLD based on quality gates
- **Cross-phase Memory** - Consumes signals from Refinement phase

#### QCSD CI/CD Verification Swarm (Phase 4)
- **SKILL.md** - 1904-line skill definition with 9 phases, 7 agents
- **Flag Detection** - HAS_SECURITY_PIPELINE, HAS_PERFORMANCE_PIPELINE, HAS_INFRA_CHANGE
- **Decision Logic** - RELEASE/REMEDIATE/BLOCK based on pipeline quality gates
- **E1-E9 Enforcement Rules** - Mandatory execution with violation detection
- **Cross-phase Signal Consumption** - Consumes SHIP/CONDITIONAL/HOLD from Development phase

#### Infrastructure Self-Healing Enterprise Signatures (ADR-057)
- **12 Enterprise Error Signatures** - SAP RFC, SAP BAPI, SAP BTP, Salesforce API, Payment Gateway (Stripe/Braintree/Adyen), WMS/ERP integrations
- **Priority-ordered Matching** - Enterprise patterns match before generic catch-alls
- **4 Enterprise Recovery Playbooks** - sap-rfc, sap-btp, salesforce, payment-gateway
- **TestRerunManager** - Tracks and re-runs tests affected by infrastructure failures
- **Auto-recovery Pipeline** - Automatic detect → track → recover → re-run cycle
- **3 MCP Tools** - `infra_healing_status`, `infra_healing_feed_output`, `infra_healing_recover`
- **Global Singleton Bridge** - Avoids circular dependencies between MCP and domain layers

#### V3 Memory Initialization
- **Eager Memory Init** - Experience capture and UnifiedMemory initialized at MCP startup (not lazy)
- **V2→V3 Migration Script** - `scripts/migrate-v2-to-v3-memory.js` migrates all data:
  - kv_store, memory_entries, learning_experiences, goap_actions
  - dream_cycles, mincut_history/snapshots, patterns, RL Q-values
- **MCP Config Updates** - AQE_MEMORY_PATH and AQE_LEARNING_ENABLED env vars added to `.claude/mcp.json`

### Changed
- **Grooming → Refinement** - Renamed QCSD "Grooming" phase to "Refinement" across entire codebase (modern Scrum terminology)
- **skills-manifest.json** - Updated to v1.3.0 with totalQESkills: 67 and full skill breakdown
- **Documentation Updates** - Updated README, v3/README, and release-verification with accurate skill counts (67 QE skills)
- **CLAUDE.md** - Added auto-invocation rules for all 4 QCSD phases
- **SwarmVulnerability type** - Extended with 6 enterprise vulnerability types
- **ToolCategory type** - Added 'infra-healing' category
- **healing-controller.ts** - Added mappings for all enterprise vulnerability types

### Fixed
- **Duplicate BDDScenario export** - Renamed to RefinementBDDScenario to avoid conflict with interfaces.ts
- **Missing ToolCategory** - Added 'infra-healing' to ToolCategory union type
- **Incomplete Record type** - Added 6 missing enterprise vulnerability types to healing controller

### Technical Details
- Governance integration uses dependency injection, not core modifications
- Feature flags provide rollback for any individual governance gate
- Non-strict mode ensures graceful degradation (violations logged, not blocked)
- QCSD cross-phase memory enables signal flow: Ideation → Refinement → Development → CI/CD
- 700+ tests passing (governance, QCSD, infrastructure self-healing)

## [3.4.6] - 2026-02-03

### Fixed
- **Code Intelligence KG scan performance** - Fixed glob patterns to properly exclude nested `node_modules`, `dist`, `coverage`, and `.agentic-qe` directories at any depth
  - Before: 15+ min init, 941K entries, 1.1GB database (76% from node_modules)
  - After: ~1.5 min init, 90K entries, 245MB database
  - Changed `node_modules/**` to `**/node_modules/**` (and same for other excludes)
- **Hooks duplication bug** - Fixed hooks phase appending duplicate hooks on every `aqe init` run
  - Now deduplicates by command string before adding new hooks
  - Prevents settings.json from growing unbounded with repeated init runs

### Changed
- Hooks phase now checks for existing hook commands before adding duplicates
- Code intelligence phase uses recursive glob excludes for all ignored directories

## [3.4.5] - 2026-02-03

### Fixed
- MCP daemon startup and code intelligence KG persistence

## [3.4.4] - 2026-02-03

### Added

#### Infrastructure Self-Healing Extension (ADR-057)
- **TestOutputObserver** - Pattern-matches 22+ OS-level error signatures (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ENOMEM, ENOSPC) from test stderr to detect infrastructure failures
- **RecoveryPlaybook** - YAML-driven configuration for service recovery with `${VAR}` environment interpolation
- **CoordinationLock** - In-process TTL-based mutex preventing duplicate recovery attempts for the same service
- **InfraActionExecutor** - Executes recovery cycle: healthCheck → recover → backoff → verify
- **CompositeActionExecutor** - Routes swarm actions to original executor, infra actions to InfraActionExecutor
- **InfraAwareAgentProvider** - Wraps AgentProvider to inject synthetic infrastructure agents with health derived from observer state
- **InfraHealingOrchestrator** - Top-level coordinator: `feedTestOutput()` → `runRecoveryCycle()` → stats
- **Factory functions** - `createStrangeLoopWithInfraHealing()` and `createInMemoryStrangeLoopWithInfraHealing()` for easy integration
- **Default playbook** - Reference YAML template for 8 services (postgres, mysql, mongodb, redis, elasticsearch, rabbitmq, selenium-grid, generic-service)
- **Demo script** - `scripts/demo-infra-healing.ts` demonstrates full pipeline

### Changed
- **Strange Loop types** - Added 8 infrastructure vulnerability types to `SwarmVulnerability['type']` union
- **Healing controller** - Extended with `restart_service` action type and infra-agent override logic in `mapVulnerabilityToAction()`
- **ADR index** - Updated v3-adrs.md with ADR-057 entry (54 total ADRs implemented)

### Technical Details
- Extends Strange Loop through existing DI seams without modifying core OMDA cycle
- Framework-agnostic: works with Jest, Pytest, JUnit, or any test framework
- 245 tests (151 new + 94 existing), zero regressions
- Security: uses `execFile` (not `exec`), documents trust boundary for playbook YAML

## [3.4.3] - 2026-02-02

### Added
- **`--upgrade` flag for `aqe init`** - Enables overwriting existing skills, agents, and validation infrastructure when upgrading between versions
- Skills installer now scans actual directory for accurate README generation

### Fixed
- **Skills README accuracy** - README now shows actual skills count instead of only newly-installed skills
- **Upgrade path from v3.2.3 to v3.4.x** - Previously only 31 new files were installed; now all skills + agents + validation are properly updated when using `--upgrade`

### Changed
- Assets phase respects `--upgrade` flag for all installers (skills, agents, n8n)
- Improved init help text with upgrade examples

### Usage
```bash
# Upgrade existing installation (overwrites all skills, agents, validation)
aqe init --auto --upgrade

# Or standalone
aqe init --upgrade
```

## [3.4.0] - 2026-02-01

### 🎯 Highlights

**AG-UI, A2A, and A2UI Protocol Implementation** - Full implementation of Agent-to-UI (AG-UI), Agent-to-Agent (A2A), and Agent-to-UI (A2UI) protocols enabling interoperability with other agentic frameworks and real-time UI state synchronization.

**All 12 DDD Domains Now Enabled by Default** - Critical fix ensuring all QE domains are available out of the box. Previously, V2→V3 migration only enabled 3 domains, causing "No factory registered" errors when using `fleet_init` with domains like `test-execution` or `quality-assessment`.

**Portable Configuration** - Removed all hardcoded workspace paths throughout the codebase. AQE now works seamlessly across different environments (DevPod, Codespaces, local machines) without path-related failures.

### Added

#### AG-UI Protocol (Agent-to-UI)
- **EventAdapter** - Transforms internal events to AG-UI format
- **StateManager** - JSON Patch-based state synchronization
- **SurfaceGenerator** - Dynamic UI surface generation from agent state
- **StreamingRenderer** - Real-time UI updates via SSE/WebSocket

#### A2A Protocol (Agent-to-Agent)
- **DiscoveryService** - Agent capability discovery and registration
- **MessageRouter** - Inter-agent message routing with delivery guarantees
- **CapabilityNegotiator** - Protocol version and capability negotiation
- **TaskDelegator** - Cross-agent task delegation and result aggregation

#### A2UI Protocol (Agent-to-UI Integration)
- **IntegrationBridge** - Bridges A2A and AG-UI for seamless UI updates
- **StateSync** - Bidirectional state synchronization between agents and UI
- **EventTransformer** - Event normalization across protocol boundaries

#### Configuration Improvements
- **Root config.yaml** - New `.agentic-qe/config.yaml` with all 12 domains enabled
- **Relative path support** - MCP server configs use `./v3/dist/...` instead of absolute paths
- **Environment-agnostic skills** - SKILL.md files use `npx` and relative paths

### Changed

#### Domain Registration (Breaking Fix)
- **V2→V3 Migration** - Now enables all 12 DDD domains instead of just 3
  - Previously: `test-generation`, `coverage-analysis`, `learning-optimization`
  - Now: All 12 domains including `test-execution`, `quality-assessment`, `security-compliance`, etc.
- **Default kernel config** - Uses `ALL_DOMAINS` constant ensuring consistency

#### Error Messages
- **Plugin loader** - Shows registered domains and actionable fix when domain not found:
  ```
  No factory registered for domain: test-execution
  Registered domains: test-generation, coverage-analysis, ...
  Fix: Add 'test-execution' to domains.enabled in .agentic-qe/config.yaml
  ```

#### Path Handling
- **verify.sh** - Uses `$SCRIPT_DIR` instead of hardcoded paths
- **Test files** - Use `process.cwd()` for project root detection
- **MCP config** - Removed `AQE_PROJECT_ROOT` hardcoded environment variable

### Fixed

- **fleet_init failures** - "No factory registered for domain: test-execution" error resolved
- **Cross-environment compatibility** - Works in DevPod, Codespaces, and local environments
- **Integration test batching** - Disabled batching in protocol integration tests for deterministic behavior
- **State update ordering** - Fixed task state creation before error assignment in full-flow tests

### Migration Guide

If you're upgrading from v3.3.x and experiencing domain registration errors:

1. **Quick fix** - Re-run initialization:
   ```bash
   aqe init --auto-migrate
   ```

2. **Manual fix** - Add missing domains to `.agentic-qe/config.yaml`:
   ```yaml
   domains:
     enabled:
       - "test-generation"
       - "test-execution"        # ADD
       - "coverage-analysis"
       - "quality-assessment"    # ADD
       - "defect-intelligence"   # ADD
       - "requirements-validation"
       - "code-intelligence"
       - "security-compliance"
       - "contract-testing"
       - "visual-accessibility"
       - "chaos-resilience"
       - "learning-optimization"
   ```

---

## [3.3.5] - 2026-01-30

### 🎯 Highlights

**QE Queen MCP-Powered Orchestration** - Complete rewrite of `qe-queen-coordinator` to use MCP tools for real fleet coordination. Queen now actually spawns agents via `mcp__agentic-qe__agent_spawn`, monitors task completion, and stores learnings - instead of just describing what agents would do.

**Unified Database Architecture** - All databases consolidated to single `{project-root}/.agentic-qe/memory.db` with automatic project root detection. Eliminates scattered database files and ensures consistent data storage.

**252 New Tests for Coordination Module** - Comprehensive test coverage for previously untested consensus providers, protocols, services, and cross-domain router.

### Added

#### QE Queen MCP-Powered Orchestration (v3.1.0)
- **Mandatory 10-phase execution protocol** - fleet_init → memory_store
- **Real agent spawning** via `mcp__agentic-qe__agent_spawn`
- **Task monitoring loop** - polls `task_list` until completion
- **Learning persistence** - stores patterns after each orchestration
- **Task-to-domain routing table** - automatic agent selection by task type
- **MCP tools reference** - fleet, agent, task, QE, and memory operations
- **Execution examples** - comprehensive and coverage-specific

#### Unified Database Architecture
- **Project root detection** - finds nearest package.json/git root
- **Single memory.db** - all tables in one SQLite database
- **Automatic migration** - moves data from scattered locations
- **Cross-phase memory hooks** - auto-installed on `aqe init`

#### New Test Coverage (252 tests, all passing)
- **consensus/providers/** - 6 provider test files
  - `claude-provider.test.ts` (366 lines)
  - `gemini-provider.test.ts` (391 lines)
  - `native-learning-provider.test.ts` (500 lines)
  - `ollama-provider.test.ts` (440 lines)
  - `openai-provider.test.ts` (373 lines)
  - `openrouter-provider.test.ts` (393 lines)
- **protocols/** - 4 protocol test files
  - `defect-investigation.test.ts` (618 lines)
  - `learning-consolidation.test.ts` (594 lines)
  - `morning-sync.test.ts` (853 lines)
  - `quality-gate.test.ts` (727 lines)
- **services/** - 2 service test files
  - `task-audit-logger.test.ts` (611 lines)
  - `index.test.ts` (103 lines)
- **cross-domain-router.test.ts** (686 lines)

### Changed

#### QE Queen Coordinator
- Upgraded from v3.0.0 to v3.1.0
- Now uses MCP tools instead of descriptions
- Added prohibited behaviors section
- Added domain topology diagram

#### CLI Hook Commands
- Updated to use `aqe` binary instead of `npx`
- Implemented missing CLI hook commands for Claude Code integration

### Fixed

- **CI timeout** - Increased Fast Tests timeout from 5m to 10m
- **Workflow permissions** - Added permissions block to sauce-demo-e2e workflow
- **Hook commands** - Fixed CLI hook commands to use correct binary

---

## [3.3.4] - 2026-01-29

### 🎯 Highlights

**QCSD Ideation Phase Complete** - Full Quality Conscious Software Delivery (QCSD) Ideation phase implementation with HTSM v6.3 quality criteria analysis, SFDIPOT product factors assessment, and cross-phase memory feedback loops.

**Cross-Phase Memory System** - New persistent memory architecture enabling automated learning between QCSD phases (Production→Ideation, Production→Refinement, CI/CD→Development, Development→Refinement).

**Comprehensive Test Coverage** - 358 files changed with 83,990+ lines of new tests across all 12 domains, kernel, MCP handlers, routing, and workers.

### Added

#### QCSD Ideation Phase Agents
- **qe-quality-criteria-recommender** - HTSM v6.3 quality criteria analysis with 10 categories
- **qe-product-factors-assessor** - SFDIPOT framework with 7 factors, 37 subcategories
- **qe-risk-assessor** - Multi-factor risk scoring with mitigation recommendations
- **qe-test-idea-rewriter** - Transform passive "Verify X" patterns to active test actions

#### Cross-Phase Memory System
- **CrossPhaseMemoryService** - File-based persistence for QCSD feedback loops
- **Cross-phase MCP handlers** - 8 new tools for signal storage/retrieval
- **Hook executor** - Automatic trigger of cross-phase hooks on agent completion
- **4 feedback loops** - Strategic, Tactical, Operational, Quality Criteria

#### New Skills
- **a11y-ally** - Comprehensive WCAG accessibility audit with video caption generation
- **qcsd-ideation-swarm** - Multi-agent swarm for QCSD Ideation phase
- **skills-manifest.json** - Centralized skill registration

#### Comprehensive Test Coverage (83,990+ lines)
- **Kernel tests** - unified-memory, hybrid-backend, kernel, plugin-loader
- **MCP handler tests** - All domain handlers, handler-factory, task-handlers
- **Domain tests** - All 12 domain plugins with coordinator tests
- **Learning tests** - pattern-store, experience-capture, v2-to-v3-migration
- **Routing tests** - tiny-dancer-router, task-classifier, routing-config
- **Sync tests** - claude-flow-bridge, sync-agent, json/sqlite readers
- **Worker tests** - All 10 background workers

#### E2E Test Framework
- Moved e2e tests to v3/tests/e2e/
- Sauce Demo test suite with accessibility, cart, checkout, security specs
- Page Object Model with BasePage, CartPage, CheckoutPage, etc.

#### Documentation Updates
- Updated agent catalog with QCSD Ideation agents
- Added HTSM v6.3 quality categories reference
- Added SFDIPOT framework documentation
- Updated skill counts: 61 → 63 QE Skills
- Updated agent counts with new QCSD agents

### Changed

#### Handler Factory Migration
- All 11 domain handlers now use centralized handler-factory.ts
- Experience capture middleware wraps all domain operations
- Consistent error handling across handlers

#### Security Scanner Refactoring
- Split monolithic security-scanner.ts into modular components
- New scanner-orchestrator.ts for coordinating SAST/DAST scans
- Separate sast-scanner.ts and dast-scanner.ts modules
- security-patterns.ts for pattern definitions

#### E2E Runner Modularization
- Split e2e-runner.ts into 9 focused modules
- browser-orchestrator.ts - Browser session management
- step-executors.ts - Step execution logic
- assertion-handlers.ts - Assertion processing
- result-collector.ts - Test result aggregation

### Fixed

#### Test Timeout Fixes
- Fixed 6 timeout failures in security-compliance/coordinator.test.ts
- Added proper class-based mocks for SecurityScannerService
- Added mocks for SecurityAuditorService and ComplianceValidatorService

#### TypeScript Compilation
- Fixed all TypeScript errors from PR #215 merge
- Fixed history.length on unknown type casting
- Fixed performTask payload access patterns
- Fixed Map iteration with Array.from()

#### Architecture Cleanup
- Removed wrong-pattern TypeScript agent classes (QualityCriteriaRecommenderAgent, RiskAssessorAgent)
- Removed orphaned QCSD agent tests
- Moved n8n-validator to v3/packages/

### Security

- SSRF protection recommendations for DAST scanner (private IP blocking)
- Path traversal edge case fix recommendation (startsWith + path.sep)
- npm audit: 0 vulnerabilities

### Deprecated

- Root-level tests/e2e/ directory (moved to v3/tests/e2e/)
- Root-level src/agents/ TypeScript classes (use .claude/agents/v3/*.md instead)

---

## [3.3.3] - 2026-01-27

### 🎯 Highlights

**Full MinCut/Consensus Integration** - All 12 QE domains now have active MinCut topology awareness, multi-model consensus verification, and self-healing triggers. This completes the ADR-047 implementation with production-ready distributed coordination.

**LLM Integration Across All Domains** - ADR-051 enables intelligent LLM-powered analysis in all 12 QE domains with TinyDancer model routing for cost optimization.

### Added

#### LLM Integration for All 12 QE Domains (ADR-051)
- **test-generation** - AI-powered test synthesis with pattern learning
- **test-execution** - Intelligent flaky test analysis and retry recommendations
- **coverage-analysis** - LLM-assisted gap prioritization and risk scoring
- **quality-assessment** - AI-driven quality gate decisions with explanations
- **defect-intelligence** - ML-powered defect prediction and root cause analysis
- **requirements-validation** - LLM testability analysis and BDD generation
- **code-intelligence** - Semantic code search with natural language queries
- **security-compliance** - AI vulnerability analysis with remediation guidance
- **contract-testing** - LLM contract validation and breaking change detection
- **visual-accessibility** - AI visual regression analysis and WCAG recommendations
- **chaos-resilience** - Intelligent resilience assessment and failure prediction
- **learning-optimization** - Pattern consolidation with LLM synthesis

#### QE Agent Registry Fixes
- Added missing agents to registry: `qe-product-factors-assessor`, `qe-quality-criteria-recommender`, `qe-test-idea-rewriter`
- Fixed skill counts: 61 QE skills properly registered
- Updated agent-to-domain mappings

#### Documentation
- **TinyDancer Integration Plan** - Detailed plan for model routing across domains
- **Contract Validator LLM Docs** - LLM integration documentation for contract testing

#### MinCut/Consensus Full Domain Integration (ADR-047, MM-001)
- **All 12 domains** now actively use consensus verification (not just initialized)
- **Topology-aware routing** - `getTopologyBasedRouting()` in all domains
- **Self-healing triggers** - `shouldPauseOperations()` pauses work on critical topology

| Domain | verifyFinding Calls | Self-Healing | Routing |
|--------|---------------------|--------------|---------|
| test-generation | 3 | ✅ | ✅ |
| test-execution | 3 | ✅ | ✅ |
| coverage-analysis | 3 | ✅ | ✅ |
| quality-assessment | 2 | ✅ | ✅ |
| defect-intelligence | 3 | ✅ | ✅ |
| learning-optimization | 3 | ✅ | ✅ |
| security-compliance | 2 | ✅ | ✅ |
| chaos-resilience | 3 | ✅ | ✅ |
| code-intelligence | 3 | ✅ | ✅ |
| contract-testing | 3 | ✅ | ✅ |
| requirements-validation | 3 | ✅ | ✅ |
| visual-accessibility | 3 | ✅ | ✅ |

#### Performance Benchmarks
- **mincut-performance.test.ts** (20 tests) - Graph operations, health monitoring, memory usage
- **consensus-latency.test.ts** (18 tests) - Finding verification, batch operations, strategy comparison

#### Cross-Domain Integration Tests
- **cross-domain-mincut-consensus.test.ts** (34 tests) - Queen→Domain bridge injection, topology coordination

### Changed

#### Domain Coordinators (all 12)
- Added `verifyFinding()` calls for high-stakes decisions
- Added `getTopologyBasedRouting()` method
- Added `getDomainWeakVertices()` method
- Added `isDomainWeakPoint()` method
- Added self-healing with `shouldPauseOperations()` checks

#### Type Exports
- **consensus-enabled-domain.ts** - Re-export `ConsensusStats` type for domain use
- **contract-testing/interfaces.ts** - Use proper `WeakVertex[]` and `DomainName[]` types
- **code-intelligence/coordinator.ts** - Fixed routing type signatures

### Fixed

- **fix(types)**: ConsensusStats now properly exported from mixin module
- **fix(types)**: DomainName[] type consistency across routing methods
- **fix(coverage-analysis)**: Use `factors.contribution` instead of non-existent `factors.weight`
- **fix(benchmarks)**: Relaxed timing thresholds for CI stability (0.2ms→0.5ms, 512B→1KB)

### Documentation

- **MINCUT_CONSENSUS_INTEGRATION_PLAN.md** - Updated status to IMPLEMENTED with completion metrics

---

## [3.3.2] - 2026-01-26

### 🎯 Highlights

**Automatic Dream Scheduling** - Dream Cycles are now actively triggered by QE agents instead of being passive-only. This upgrade brings QE v3 agent utilization to full capacity with cross-domain pattern consolidation.

### Added

#### DreamScheduler Service
- **dream-scheduler.ts** - Central scheduling service for automatic dream cycles
- Multiple trigger types:
  | Trigger | When | Duration | Priority |
  |---------|------|----------|----------|
  | `scheduled` | Every 1 hour (configurable) | 30s | Low |
  | `experience_threshold` | After 20 tasks accumulated | 10s | Medium |
  | `quality_gate_failure` | On quality gate failure | 5s (quick) | High |
  | `domain_milestone` | On domain milestone | 10s | Medium |
  | `manual` | On-demand API call | Configurable | Varies |

#### Cross-Domain Dream Integration
- **EventBus integration** - `learning-optimization.dream.completed` event broadcasts insights
- **TestGenerationCoordinator** - Subscribes to dream insights, auto-applies high-confidence patterns
- **QualityAssessmentCoordinator** - Subscribes to dream insights for quality threshold tuning
- **LearningOptimizationCoordinator** - Records task experiences, manages DreamScheduler lifecycle

#### New Tests (84 total)
- `dream-scheduler.test.ts` (unit) - 38 tests for scheduler triggers, lifecycle, status
- `dream-scheduler.test.ts` (integration) - 46 tests for full pipeline, cross-domain events

### Changed

- **LearningOptimizationCoordinator** - Now initializes and manages DreamScheduler
- **interfaces.ts** - Added `publishDreamCycleCompleted()` method
- **domain-events.ts** - Added `DreamCycleCompletedPayload` type

### Fixed

- **fix(coordination)**: Wire Queen-Domain direct task execution integration
- **fix(learning)**: Close ReasoningBank integration gaps for full learning pipeline

### Documentation

- `DREAM_SCHEDULER_DESIGN.md` - Architecture design document with trigger specifications

---

## [3.3.1] - 2026-01-25

### 🎯 Highlights

**GOAP Quality Remediation Complete** - Comprehensive 6-phase quality improvement achieving production-ready status. Quality score improved from 37 to 82 (+121%), cyclomatic complexity reduced by 52%, and 527 tests now passing with 80%+ coverage.

### Added

#### Quality Metrics Improvement
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Quality Score | 37/100 | 82/100 | +121% |
| Cyclomatic Complexity | 41.91 | <20 | -52% |
| Maintainability Index | 20.13 | 88/100 | +337% |
| Test Coverage | 70% | 80%+ | +14% |
| Security False Positives | 20 | 0 | -100% |

#### New Modules (Extract Method + Strategy Pattern)
- **score-calculator.ts** - Extracted complexity score calculations
- **tier-recommender.ts** - Extracted model tier recommendation logic
- **validators/** - Security validation using Strategy Pattern:
  - `path-traversal-validator.ts` - Directory traversal prevention
  - `regex-safety-validator.ts` - ReDoS attack prevention
  - `command-validator.ts` - Shell injection prevention
  - `input-sanitizer.ts` - General input sanitization
  - `crypto-validator.ts` - Cryptographic input validation
  - `validation-orchestrator.ts` - Orchestrates all validators

#### CLI Commands Modularization
- Extracted standalone command modules: `code.ts`, `coverage.ts`, `fleet.ts`, `security.ts`, `test.ts`, `quality.ts`, `migrate.ts`, `completions.ts`
- Added `command-registry.ts` for centralized command management
- Improved CLI handlers organization

#### Test Generation Improvements
- **coherence-gate-service.ts** - Service layer for coherence verification
- **property-test-generator.ts** - Property-based testing support
- **tdd-generator.ts** - TDD-specific test generation
- **test-data-generator.ts** - Test data factory patterns
- Factory pattern implementation in `factories/`
- Interface segregation in `interfaces/`

#### 527 New Tests (Phase 4)
- `score-calculator.test.ts` - 109 tests for complexity scoring
- `tier-recommender.test.ts` - 86 tests for tier selection
- `validation-orchestrator.test.ts` - 136 tests for security validators
- `coherence-gate-service.test.ts` - 56 tests for coherence service
- `complexity-analyzer.test.ts` - 89 tests for signal collection
- `test-generator-di.test.ts` - 11 tests for dependency injection
- `test-generator-factory.test.ts` - 40 tests for factory patterns

#### Cloud Sync Feature
- **feat(sync)**: Cloud sync to ruvector-postgres backend
- Incremental and full sync modes
- Sync status and verification commands

### Changed

- **complexity-analyzer.ts** - Refactored from 656 to ~200 lines using Extract Method
- **cve-prevention.ts** - Refactored from 823 to ~300 lines using Strategy Pattern
- **test-generator.ts** - Refactored to use dependency injection
- **Wizard files** - Standardized using Command Pattern
- All domains now follow consistent code organization standards

### Fixed

- **fix(coherence)**: Resolve WASM SpectralEngine binding and add defensive null checks
- **fix(init)**: Preserve config.yaml customizations on reinstall
- **fix(security)**: Implement SEC-001 input validation and sanitization
- **fix(ux)**: Resolve issue #205 regression - fresh install shows 'idle' not 'degraded'
- Security scanner false positives eliminated via `.gitleaks.toml` and `security-scan.config.json`
- Defect-prone files remediated with comprehensive test coverage

### Security

- Resolved 20 false positive AWS secret detections in wizard files
- CodeQL incomplete-sanitization alerts #116-121 fixed
- Shell argument backslash escaping (CodeQL #117)

### Documentation

- `CODE-ORGANIZATION-STANDARDIZATION.md` - Domain structure guidelines
- `DOMAIN-STRUCTURE-GUIDE.md` - DDD implementation guide
- `JSDOC-TEMPLATES.md` - 15 JSDoc documentation templates
- `quality-remediation-final.md` - Complete remediation report
- `phase3-verification-report.md` - Maintainability improvements

---

## [3.3.0] - 2026-01-24

### 🎯 Highlights

**Mathematical Coherence Verification** - ADR-052 introduces Prime Radiant WASM engines for mathematically-proven coherence checking. This is a major quality improvement that prevents contradictory test generation, detects swarm drift 10x faster, and provides formal verification for multi-agent decisions.

### Added

#### Coherence-Gated Quality Engineering (ADR-052)
- **CoherenceService** with 6 Prime Radiant WASM engines:
  - CohomologyEngine - Sheaf cohomology for contradiction detection
  - SpectralEngine - Spectral analysis for swarm collapse prediction
  - CausalEngine - Causal inference for spurious correlation detection
  - CategoryEngine - Category theory for type verification
  - HomotopyEngine - Homotopy type theory for formal verification
  - WitnessEngine - Blake3 witness chain for audit trails

- **Compute Lanes** - Automatic routing based on coherence energy:
  | Lane | Energy | Latency | Action |
  |------|--------|---------|--------|
  | Reflex | < 0.1 | <1ms | Immediate execution |
  | Retrieval | 0.1-0.4 | ~10ms | Fetch additional context |
  | Heavy | 0.4-0.7 | ~100ms | Deep analysis |
  | Human | > 0.7 | Async | Queen escalation |

- **ThresholdTuner** - Auto-calibrating energy thresholds with EMA
- **BeliefReconciler** - Contradiction resolution with 5 strategies (latest, authority, consensus, merge, escalate)
- **MemoryAuditor** - Background coherence auditing for QE patterns
- **CausalVerifier** - Intervention-based causal link verification
- **Test Generation Coherence Gate** - Block incoherent requirements before test generation

#### 4 New MCP Tools
- `qe/coherence/check` - Check coherence of beliefs/facts
- `qe/coherence/audit` - Audit QE memory for contradictions
- `qe/coherence/consensus` - Verify multi-agent consensus mathematically
- `qe/coherence/collapse` - Predict swarm collapse risk

#### CI/CD Integration
- GitHub Actions workflow for coherence verification
- Shields.io badge generation (verified/fallback/violation)
- Automatic coherence checks on PR

### Changed

- **Strange Loop Integration** - Now includes coherence verification in self-awareness cycle
- **QEReasoningBank** - Pattern promotion now requires coherence gate approval
- **WASM Loader** - Enhanced with full fallback support and retry logic

### Fixed

- Fresh install UX now shows 'idle' status instead of alarming warnings
- ESM/CommonJS interop issue with hnswlib-node resolved
- Visual-accessibility workflow actions properly registered with orchestrator
- **DevPod/Codespaces OOM crash** - Test suite now uses forks pool with process isolation
  - Prevents HNSW native module segfaults from concurrent access
  - Limits to 2 parallel workers (was unlimited)
  - Added `npm run test:safe` script with 1.5GB heap limit

### Performance

Benchmark results (ADR-052 targets met):
- 10 nodes: **0.3ms** (target: <1ms) ✅
- 100 nodes: **3.2ms** (target: <5ms) ✅
- 1000 nodes: **32ms** (target: <50ms) ✅
- Memory overhead: **<10MB** ✅
- Concurrent checks: **865 ops/sec** (10 parallel)

---

## [3.2.3] - 2026-01-23

### Added

- EN 301 549 EU accessibility compliance mapping
- Phase 4 Self-Learning Features with brutal honesty fixes
- Experience capture integration tests

### Fixed

- CodeQL security alerts #69, #70, #71, #74
- All vulnerabilities from security audit #202
- Real HNSW implementation in ExperienceReplay for O(log n) search

### Security

- Resolved lodash security vulnerability
- Fixed potential prototype pollution issues

---

## [3.2.0] - 2026-01-21

### Added

- Agentic-Flow deep integration (ADR-051)
- Agent Booster for instant transforms
- Model Router with 3-tier optimization
- ONNX Embeddings for fast vector generation

### Performance

- 100% success rate on AgentBooster operations
- Model routing: 0.05ms average latency
- Embeddings: 0.57ms average generation time

---

## User Benefits

### For Test Generation
```typescript
// Before v3.3.0: Tests could be generated from contradictory requirements
const tests = await generator.generate(conflictingSpecs); // No warning!

// After v3.3.0: Coherence check prevents bad tests
const tests = await generator.generate(specs);
// Throws: "Requirements contain unresolvable contradictions"
// Returns: coherence.contradictions with specific conflicts
```

### For Multi-Agent Coordination
```typescript
// Mathematically verify consensus instead of simple majority
const consensus = await coherenceService.verifyConsensus(votes);

if (consensus.isFalseConsensus) {
  // Fiedler value < 0.05 indicates weak connectivity
  // Spawn independent reviewer to break false agreement
}
```

### For Memory Quality
```typescript
// Audit QE patterns for contradictions
const audit = await memoryAuditor.auditPatterns(patterns);

// Get hotspots (high-energy domains with conflicts)
audit.hotspots.forEach(h => {
  console.log(`${h.domain}: energy=${h.energy}, patterns=${h.patternIds}`);
});
```

### For Swarm Health
```typescript
// Predict collapse before it happens
const risk = await coherenceService.predictCollapse(swarmState);

if (risk.probability > 0.5) {
  // Weak vertices identified - take preventive action
  await strangeLoop.reinforceConnections(risk.weakVertices);
}
```

---

[3.3.0]: https://github.com/anthropics/agentic-qe/compare/v3.2.3...v3.3.0
[3.2.3]: https://github.com/anthropics/agentic-qe/compare/v3.2.0...v3.2.3
[3.2.0]: https://github.com/anthropics/agentic-qe/releases/tag/v3.2.0

## [3.4.2] - 2026-02-02

### Added
- **ADR-056: Skill Validation System** - 4-layer trust tier validation architecture
- Trust tier badges and manifest tracking (97 skills categorized)
- 46 Tier 3 (Verified) skills with full evaluation test suites
- 7 Tier 2 (Validated) skills with validator scripts
- 5 Tier 1 (Structured) skills with JSON output schemas
- Shared validation infrastructure in `.validation/` directory
- GitHub Actions workflow for skill validation CI/CD
- Skill validation learner integration for pattern learning

### Changed
- Updated all 52 skills with `trust_tier` frontmatter
- Enhanced prepare-assets.sh to sync validation infrastructure
- Improved skills-installer.ts to handle validation directories

### Fixed
- Skill output schema validation for deterministic results
- Eval suite test case formatting and MCP integration
