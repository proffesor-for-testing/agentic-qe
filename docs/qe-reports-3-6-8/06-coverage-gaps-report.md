# Coverage Gap Analysis Report -- v3.6.8

**Date**: 2026-02-16
**Scope**: `/workspaces/agentic-qe-new/v3/src/` (35 modules, ~750 source files, ~490,000 LOC)
**Test Directory**: `/workspaces/agentic-qe-new/v3/tests/` (17 test subdirs, ~370 test files)
**Analyzer**: qe-coverage-gap-analyzer

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Total source modules | 35 |
| Modules with zero test coverage | 4 |
| Modules with partial coverage | 12 |
| Modules with strong coverage | 19 |
| Estimated overall file-level coverage | ~62% |
| Critical untested risk items | 10 |

Four source modules have **zero dedicated test files**: `skills`, `testing`, `workflows`, and `types`. An additional 12 modules have significant gaps where specific services or submodules lack any corresponding tests. The highest-risk gaps concentrate in **security scanners**, **enterprise integration services**, **test-execution e2e subsystem**, and **governance unit tests**.

---

## 2. Module-by-Module Coverage Map

### Legend

- **FULL**: All non-trivial source files have at least one corresponding test file (unit or integration)
- **STRONG**: >75% of source files have corresponding tests
- **PARTIAL**: 25-75% of source files have corresponding tests
- **MINIMAL**: <25% of source files have corresponding tests
- **NONE**: Zero test files correspond to this module

---

### 2.1 adapters (59 source files, ~42,431 LOC) -- STRONG

| Submodule | Source Files | Test Files | Coverage |
|-----------|-------------|------------|----------|
| a2a/agent-cards | generator, schema, validator | tests/unit/adapters/a2a/agent-cards.test.ts | PARTIAL (bundled) |
| a2a/auth | jwt-utils, middleware, oauth-provider, routes, scopes, token-store | 6 unit tests + integration oauth-flow | FULL |
| a2a/discovery | agent-health, discovery-service, file-watcher, hot-reload-service, metrics, routes | 5 unit + 1 integration | STRONG |
| a2a/jsonrpc | envelope, errors, methods | tests/unit/adapters/a2a/jsonrpc.test.ts | PARTIAL (bundled) |
| a2a/notifications | retry-queue, signature, subscription-store, webhook-service | 4 unit tests | FULL |
| a2a/tasks | task-manager, task-router, task-store | tests/unit/adapters/a2a/tasks.test.ts | PARTIAL (bundled) |
| a2ui/* | accessibility, catalog, data, integration, renderer | 5 unit tests | STRONG |
| ag-ui/* | backpressure-handler, event-adapter, event-batcher, json-patch, state-manager, stream-controller | 8 unit tests + 1 integration | FULL |
| browser-result-adapter, trajectory-adapter | 2 files | 2 unit tests | FULL |

**Gaps**: `a2a/agent-cards/schema.ts` and `a2a/agent-cards/validator.ts` are tested only through a bundled test. `a2a/jsonrpc/errors.ts` has no dedicated error-path tests. `a2a/discovery/routes.ts` has no dedicated route test.

---

### 2.2 agents (8 source files, ~4,711 LOC) -- MINIMAL

| Source File | Test File | Status |
|-------------|-----------|--------|
| claim-verifier/claim-verifier-service.ts | integration/coordination/quality-claimverifier-wiring.test.ts | Indirect only |
| claim-verifier/verifiers/file-verifier.ts | NONE | **MISSING** |
| claim-verifier/verifiers/output-verifier.ts | NONE | **MISSING** |
| claim-verifier/verifiers/test-verifier.ts | NONE | **MISSING** |
| devils-advocate/agent.ts | tests/agents/devils-advocate.test.ts | Covered |
| devils-advocate/strategies.ts | tested via agent.test.ts | Indirect |
| devils-advocate/types.ts | N/A (types only) | -- |

**Gaps**: The entire `claim-verifier/verifiers/` subdirectory (file-verifier, output-verifier, test-verifier) has no dedicated unit tests. These verifiers are critical for validating agent claims about file changes and test results.

---

### 2.3 benchmarks (2 source files, ~984 LOC) -- STRONG

| Source File | Test File | Status |
|-------------|-----------|--------|
| run-benchmarks.ts | tests/benchmarks/ (4 test files) | Covered |

---

### 2.4 causal-discovery (4 source files, ~2,060 LOC) -- FULL

| Source File | Test File | Status |
|-------------|-----------|--------|
| discovery-engine.ts | tests/unit/causal-discovery/discovery-engine.test.ts | Covered |
| weight-matrix.ts | tests/unit/causal-discovery/weight-matrix.test.ts | Covered |
| types.ts | N/A | -- |

Plus integration test: `tests/integration/causal-graph-verification.test.ts`

---

### 2.5 cli (42 source files, ~21,657 LOC) -- STRONG

| Submodule | Source Files | Tests | Status |
|-----------|-------------|-------|--------|
| commands/llm-router.ts | tests/unit/cli/commands/llm-router.test.ts | Covered |
| commands/qe-tools.ts | tests/unit/cli/commands.test.ts | Covered |
| config/cli-config.ts | tests/unit/cli/config.test.ts | Covered |
| helpers/safe-json.ts | tests/unit/cli/safe-json.test.ts | Covered |
| scheduler/ | tests/unit/cli/scheduler.test.ts | Covered |
| utils/progress.ts | tests/unit/cli/progress.test.ts | Covered |
| utils/streaming.ts | tests/unit/cli/streaming.test.ts | Covered |

**Gaps**: Multiple CLI wizard files exist (coverage-wizard, fleet-wizard, security-wizard, test-wizard) with tests. However, the CLI has **42 source files** and some sub-commands (particularly wizards for init phases) may have thin coverage. No integration test for the full CLI command lifecycle exists outside of `migrate-file-operations.test.ts`.

---

### 2.6 coordination (72 source files, ~49,741 LOC) -- STRONG

| Submodule | Source Files | Tests | Status |
|-----------|-------------|-------|--------|
| claims/* | claim-repository, claim-service, handoff-manager, work-stealing | 3 unit tests | STRONG |
| consensus/* | consensus-engine, factory, strategies, providers | 8 unit tests (providers) + integration | FULL |
| mincut/* | 7 files | 13 unit tests + integration | FULL |
| protocols/* | 6 files | 4 unit + 3 integration | STRONG |
| services/task-audit-logger.ts | 2 unit tests | FULL |
| plugin.ts, protocol-executor.ts, result-saver.ts | unit + integration tests | Covered |

**Gaps**:
- `src/coordination/protocols/code-intelligence-index.ts` -- **no dedicated test**
- `src/coordination/protocols/security-audit.ts` -- **no dedicated test** (only tested via `security-consensus-wiring`)
- `src/coordination/claims/claim-repository.ts` -- **no dedicated unit test** (only claim-service.test.ts)
- `src/coordination/consensus/factory.ts` -- no factory-specific test
- `src/coordination/interfaces.ts` -- N/A (types)

---

### 2.7 domains (163 source files, ~127,595 LOC) -- PARTIAL

This is the largest module. Coverage varies widely by subdomain.

#### 2.7.1 chaos-resilience (6 files) -- STRONG
All services tested: chaos-engineer, coordinator, load-tester, performance-profiler, plugin.

#### 2.7.2 code-intelligence (11 files) -- STRONG
8 unit tests + integration tests. Gap: `services/metric-collector/loc-counter.ts` has no dedicated test.

#### 2.7.3 contract-testing (6 files) -- FULL
5 unit tests cover all services.

#### 2.7.4 coverage-analysis (11 files) -- PARTIAL
6 unit tests + 1 integration. **Gaps**:
- `services/coverage-analyzer.ts` -- **no test**
- `services/coverage-parser.ts` -- **no test**
- `services/gap-detector.ts` -- **no test**
- `services/risk-scorer.ts` -- **no test**

These 4 files are core to the coverage analysis pipeline and their absence is a significant gap.

#### 2.7.5 defect-intelligence (7 files) -- STRONG
5 unit tests + 4 integration tests.

#### 2.7.6 enterprise-integration (9 files) -- MINIMAL
Only `tests/unit/domains/enterprise-integration/coordinator.test.ts` exists. **Gaps**:
- `services/esb-middleware-service.ts` -- **no test**
- `services/message-broker-service.ts` -- **no test**
- `services/odata-service.ts` -- **no test**
- `services/sap-integration-service.ts` -- **no test**
- `services/soap-wsdl-service.ts` -- **no test**
- `services/sod-analysis-service.ts` -- **no test**

All 6 enterprise services are completely untested.

#### 2.7.7 learning-optimization (7 files) -- FULL
6 unit tests cover all services.

#### 2.7.8 quality-assessment (11 files) -- STRONG
6 unit tests + 2 integration tests. Gap: `coherence/partition-detector.ts` and `coherence/lambda-calculator.ts` have no dedicated tests.

#### 2.7.9 requirements-validation (26 files) -- PARTIAL
7 unit tests + 3 integration tests. **Gaps** (product-factors-assessment submodule):
- `analyzers/brutal-honesty-analyzer.ts` -- **no test**
- `analyzers/sfdipot-analyzer.ts` -- no dedicated test (only via integration)
- `code-intelligence/codebase-analyzer.ts` -- **no test**
- `formatters/gherkin-formatter.ts` -- **no test**
- `formatters/html-formatter.ts` -- **no test**
- `formatters/json-formatter.ts` -- **no test**
- `formatters/markdown-formatter.ts` -- **no test**
- `generators/question-generator.ts` -- **no test**
- `generators/test-idea-generator.ts` -- **no test**
- `parsers/architecture-parser.ts` -- **no test**
- `parsers/document-parser.ts` -- **no test**
- `parsers/user-story-parser.ts` -- **no test**
- `patterns/domain-registry.ts` -- **no test**
- `product-factors-service.ts` -- **no test**
- `skills/skill-integration.ts` -- **no test**

15 files in the product-factors-assessment subsystem have zero test coverage.

#### 2.7.10 security-compliance (16 files) -- PARTIAL
5 unit tests exist for coordinator, plugin, compliance-validator, security-auditor, security-scanner. **Gaps**:
- `services/scanners/dast-auth-testing.ts` -- **no test**
- `services/scanners/dast-helpers.ts` -- **no test**
- `services/scanners/dast-injection-testing.ts` -- **no test**
- `services/scanners/dast-scanner.ts` -- **no test**
- `services/scanners/dependency-scanner.ts` -- **no test**
- `services/scanners/sast-scanner.ts` -- **no test**
- `services/scanners/scanner-orchestrator.ts` -- **no test**
- `services/scanners/security-patterns.ts` -- **no test**
- `services/semgrep-integration.ts` -- **no test**

9 security scanner files are completely untested. This is the highest-risk gap in the codebase.

#### 2.7.11 test-execution (22 files) -- PARTIAL
3 unit tests + 2 integration tests. **Gaps**:
- `services/auth-state-manager.ts` -- **no test**
- `services/e2e/assertion-handlers.ts` -- **no test**
- `services/e2e/browser-orchestrator.ts` -- **no test**
- `services/e2e/e2e-coordinator.ts` -- **no test**
- `services/e2e/result-collector.ts` -- **no test**
- `services/e2e/step-executors.ts` -- **no test**
- `services/e2e/step-retry-handler.ts` -- **no test**
- `services/e2e/wait-condition-handler.ts` -- **no test**
- `services/flaky-detector.ts` -- **no test** (unit test exists in workers, but not for this service)
- `services/network-mocker.ts` -- **no test**
- `services/retry-handler.ts` -- **no test**
- `services/test-executor.ts` -- **no test**
- `services/test-prioritizer.ts` -- **no test**
- `services/user-flow-generator.ts` -- tested via integration only

14 test-execution service files lack unit tests.

#### 2.7.12 test-generation (16 files) -- PARTIAL
5 unit tests + 3 integration tests. **Gaps**:
- `generators/base-test-generator.ts` -- **no test**
- `generators/jest-vitest-generator.ts` -- **no test**
- `generators/mocha-generator.ts` -- **no test**
- `generators/pytest-generator.ts` -- **no test**
- `services/code-transform-integration.ts` -- **no test**
- `services/pattern-matcher.ts` -- **no test**
- `services/property-test-generator.ts` -- **no test**
- `services/tdd-generator.ts` -- **no test**
- `services/test-data-generator.ts` -- **no test**
- `services/test-generator.ts` -- **no test**

10 test-generation service files lack tests.

#### 2.7.13 visual-accessibility (13 files) -- FULL
13 unit tests + integration tests provide thorough coverage.

---

### 2.8 early-exit (5 source files, ~2,386 LOC) -- FULL

5 unit tests cover all source files.

---

### 2.9 feedback (6 source files, ~2,904 LOC) -- STRONG

5 unit tests + 1 integration test. Gap: `cross-phase-feedback.ts` may not have a dedicated test (indirectly tested).

---

### 2.10 governance (15 source files, ~13,334 LOC) -- PARTIAL

13 integration tests exist but **zero unit tests**. All governance files are tested only at the integration level.

**Gaps**: No unit-level isolation tests for:
- `feature-flags.ts`
- `continue-gate-integration.ts`
- `memory-write-gate-integration.ts`
- `queen-governance-adapter.ts`

---

### 2.11 hooks (5 source files, ~2,055 LOC) -- PARTIAL

| Source File | Test File | Status |
|-------------|-----------|--------|
| reasoning-bank-pattern-store.ts | tests/hooks/reasoning-bank-pattern-store.test.ts | Covered |
| task-completed-hook.ts | tests/hooks/task-completed-hook.test.ts | Covered |
| teammate-idle-hook.ts | tests/hooks/teammate-idle-hook.test.ts | Covered |
| cross-phase-hooks.ts | NONE | **MISSING** |
| quality-gate-enforcer.ts | NONE | **MISSING** |

---

### 2.12 init (31 source files, ~10,921 LOC) -- PARTIAL

6 unit tests cover init-wizard, project-analyzer, self-configurator, fleet-integration, config-preservation, assets-phase. **Gaps**:
- `agents-installer.ts` -- **no test**
- `governance-installer.ts` -- **no test**
- `n8n-installer.ts` -- **no test**
- `skills-installer.ts` -- **no test**
- `orchestrator.ts` -- **no test**
- `token-bootstrap.ts` -- **no test**
- All 13 phase files (01-detection through 13-governance) -- **no dedicated tests**
- `migration/config-migrator.ts` -- **no test**
- `migration/data-migrator.ts` -- **no test**
- `migration/detector.ts` -- **no test**
- `enhancements/detector.ts` -- **no test**
- `enhancements/claude-flow-adapter.ts` -- **no test**

25 of 31 source files have no dedicated tests.

---

### 2.13 integrations (94 source files, ~58,261 LOC) -- STRONG

Well covered with both unit and integration tests across agentic-flow, browser, coherence, n8n, rl-suite, ruvector, vibium submodules. Some gaps in deeper service files.

---

### 2.14 kernel (13 source files, ~5,880 LOC) -- FULL

12 unit tests + 1 standalone test. All critical components covered.

---

### 2.15 learning (26 source files, ~22,075 LOC) -- STRONG

17 unit tests + 4 integration/learning tests. Gap: `aqe-learning-engine.ts` internals and `asymmetric-learning.ts` have tests but some deeper dream-cycle paths may be thin.

---

### 2.16 logging (3 source files, ~785 LOC) -- FULL

3 unit tests for logger, console-logger, logger-factory.

---

### 2.17 mcp (69 source files, ~36,486 LOC) -- STRONG

~35 unit tests + 4 integration tests. Well tested for handlers, security, tools, transport.

---

### 2.18 memory (8 source files, ~3,237 LOC) -- PARTIAL

Only `tests/unit/memory/crdt.test.ts` exists as a dedicated memory test. **Gaps**:
- `cross-phase-memory.ts` -- **no dedicated test**
- CRDT subtypes (g-counter, lww-register, or-set, pn-counter, convergence-tracker) may be bundled in crdt.test.ts but lack individual test files

---

### 2.19 migration (1 source file, ~323 LOC) -- PARTIAL

`agent-compat.ts` tested indirectly via integration migration tests.

### 2.20 migrations (1 source file, ~129 LOC) -- NONE

`20260120_add_hypergraph_tables.ts` -- **no test**

---

### 2.21 neural-optimizer (5 source files, ~2,734 LOC) -- FULL

4 unit tests cover replay-buffer, swarm-topology, topology-optimizer, value-network.

---

### 2.22 optimization (7 source files, ~4,097 LOC) -- FULL

6 unit tests cover auto-tuner, early-exit-token-optimizer, metric-collectors, qe-workers, token-optimizer-service, tuning-algorithm.

---

### 2.23 performance (5 source files, ~2,870 LOC) -- MINIMAL

Only `tests/unit/performance/benchmarks.test.ts` exists. **Gaps**:
- `ci-gates.ts` -- **no test**
- `optimizer.ts` -- **no test**
- `profiler.ts` -- **no test**
- `run-gates.ts` -- **no test**

4 of 5 source files untested.

---

### 2.24 planning (4 source files, ~3,899 LOC) -- STRONG

2 unit tests + 1 integration benchmark. Gap: `types.ts` and deeper plan-executor edge cases.

---

### 2.25 routing (8 source files, ~4,699 LOC) -- FULL

7 unit tests cover all routing components.

---

### 2.26 shared (43 source files, ~25,109 LOC) -- STRONG

~20 unit tests cover LLM providers, parsers, embeddings, HTTP, IO, utilities. Some deeper files may lack dedicated tests.

---

### 2.27 skills (1 source file, ~945 LOC) -- NONE

`security-visual-testing/index.ts` -- **no test file exists anywhere in the test directory**

---

### 2.28 strange-loop (17 source files, ~8,027 LOC) -- STRONG

10 unit tests + 2 integration tests. Well covered including infra-healing subsystem.

---

### 2.29 sync (8 source files, ~3,264 LOC) -- STRONG

6 unit tests. Gap: `embeddings/sync-embedding-generator.ts` -- **no test**

---

### 2.30 testing (3 source files, ~2,223 LOC) -- NONE

| Source File | Test File | Status |
|-------------|-----------|--------|
| load/agent-load-tester.ts | NONE | **MISSING** |
| load/bottleneck-analyzer.ts | NONE | **MISSING** |
| load/metrics-collector.ts | NONE | **MISSING** |

The entire `testing/load/` subsystem has zero tests. Ironically, the test infrastructure itself is untested.

---

### 2.31 test-scheduling (7 source files, ~2,808 LOC) -- PARTIAL

3 unit tests for flaky-tracker, git-aware-selector, phase-scheduler. **Gaps**:
- `cicd/github-actions.ts` -- **no test**
- `executors/vitest-executor.ts` -- **no test**
- `pipeline.ts` -- **no test**

---

### 2.32 types (1 source file, ~204 LOC) -- NONE

`cross-phase-signals.ts` -- types-only file, low risk.

---

### 2.33 validation (3 source files, ~2,700 LOC) -- FULL

All 3 files tested: swarm-skill-validator, validation-result-aggregator, parallel-eval-runner (integration).

---

### 2.34 workers (15 source files, ~6,174 LOC) -- FULL

13 unit tests cover base-worker, daemon, worker-manager, and all 10 worker implementations.

---

### 2.35 workflows (1 source file, ~486 LOC) -- NONE

`browser/workflow-loader.ts` -- **no test**

---

## 3. Completely Untested Modules (Zero Test Coverage)

| Module | Source Files | LOC | Risk |
|--------|-------------|-----|------|
| **skills** | 1 file | 945 | MEDIUM -- security-visual-testing skill |
| **testing** | 3 files | 2,223 | MEDIUM -- load testing infrastructure |
| **workflows** | 1 file | 486 | LOW -- browser workflow loader |
| **types** | 1 file | 204 | LOW -- type definitions only |

---

## 4. Partially Tested Modules -- Significant Gaps

| Module | Untested Files | Total Files | Gap % | Risk |
|--------|---------------|-------------|-------|------|
| domains/security-compliance/scanners | 9 | 9 | 100% | **CRITICAL** |
| domains/requirements-validation/product-factors | 15 | 15 | 100% | HIGH |
| domains/test-execution/services | 14 | 17 | 82% | HIGH |
| domains/test-generation/services+generators | 10 | 12 | 83% | HIGH |
| domains/enterprise-integration/services | 6 | 6 | 100% | HIGH |
| init/phases + installers | 25 | 31 | 81% | MEDIUM |
| domains/coverage-analysis/services | 4 | 7 | 57% | HIGH |
| performance | 4 | 5 | 80% | MEDIUM |
| governance (no unit tests) | 15 | 15 | 100% (integration only) | MEDIUM |
| hooks | 2 | 5 | 40% | MEDIUM |
| agents/claim-verifier/verifiers | 3 | 3 | 100% | HIGH |
| test-scheduling | 3 | 6 | 50% | MEDIUM |
| memory/crdt subtypes | 5 | 7 | ~71% | MEDIUM |

---

## 5. Risk-Scored Gap Analysis

Risk Score = Criticality (1-5) x Complexity (1-5) x Blast Radius (1-5)

| Rank | Module / File | Criticality | Complexity | Blast Radius | Risk Score | Rationale |
|------|---------------|-------------|------------|--------------|------------|-----------|
| 1 | security-compliance/scanners/* (9 files) | 5 | 4 | 5 | **100** | Security scanners are the highest-criticality untested code. DAST, SAST, dependency scanning, and injection testing directly affect vulnerability detection. A bug here means undetected security flaws in user code. |
| 2 | test-execution/services/e2e/* (8 files) | 4 | 5 | 4 | **80** | E2E browser orchestration, step execution, assertion handling, and retry logic. Failures cascade to all e2e test runs. |
| 3 | agents/claim-verifier/verifiers/* (3 files) | 5 | 3 | 5 | **75** | File-verifier, output-verifier, and test-verifier validate that agents actually did what they claim. False positives here undermine the entire trust model. |
| 4 | requirements-validation/product-factors/* (15 files) | 3 | 4 | 4 | **48** | Parsers, formatters, generators, and analyzers for product factor assessment. Errors produce bad test ideas and misleading quality reports. |
| 5 | coverage-analysis/services (4 untested files) | 4 | 3 | 4 | **48** | coverage-analyzer, coverage-parser, gap-detector, risk-scorer. The very tools that detect coverage gaps are themselves untested. |
| 6 | enterprise-integration/services (6 files) | 3 | 4 | 3 | **36** | SAP, SOAP, OData, ESB, message-broker, SOD analysis. Complex integration points; bugs could cause silent data corruption. |
| 7 | test-generation/generators+services (10 files) | 4 | 3 | 3 | **36** | Jest/Vitest, Mocha, pytest generators and supporting services. Bad test generation undermines the entire QE pipeline output. |
| 8 | performance (4 untested files) | 3 | 3 | 3 | **27** | CI gates, optimizer, profiler, run-gates. Performance regressions may go undetected. |
| 9 | governance (no unit tests) | 3 | 3 | 3 | **27** | Feature flags, constitutional enforcement, trust accumulation. Integration tests exist but no isolation testing. |
| 10 | hooks (2 untested files) | 3 | 2 | 4 | **24** | cross-phase-hooks and quality-gate-enforcer control phase transitions. Bugs could skip quality gates silently. |

---

## 6. Test Type Gap Analysis

### 6.1 Modules with Unit Tests Only (Need Integration Tests)

| Module | Current Tests | Recommended Integration Tests |
|--------|--------------|-------------------------------|
| early-exit | 5 unit tests | Integration: early-exit + quality signals + kernel lifecycle |
| neural-optimizer | 4 unit tests | Integration: optimizer + coordination/mincut + learning |
| memory/crdt | 1 unit test | Integration: CRDT convergence across multiple agents |
| optimization | 6 unit tests | Integration: auto-tuner + token tracking + performance |
| logging | 3 unit tests | Integration: structured logging across kernel lifecycle |

### 6.2 Modules with Integration Tests Only (Need Unit Tests)

| Module | Current Tests | Recommended Unit Tests |
|--------|--------------|------------------------|
| governance | 13 integration tests | Unit tests for each governance file in isolation |
| agents/claim-verifier | 1 integration wiring test | Unit tests for each verifier |

### 6.3 Modules Needing E2E Tests

| Module | Rationale |
|--------|-----------|
| security-compliance/scanners | Full DAST/SAST scan pipeline against a sample vulnerable app |
| test-execution/e2e subsystem | Browser orchestration with real headless browser |
| init (full wizard flow) | End-to-end project initialization from empty directory |
| mcp (full tool invocation) | Full MCP server start, tool registration, invocation, shutdown |
| adapters/a2a (full A2A flow) | Agent discovery, task delegation, result collection |

---

## 7. Top 10 Recommended Test Cases (Priority Order)

### 7.1 CRITICAL: Security Scanner Unit Tests
**File**: `tests/unit/domains/security-compliance/scanners/`
**Target**: All 9 scanner source files

```
Test cases to write:
- dast-scanner.test.ts
  - should detect XSS vulnerabilities in HTML responses
  - should detect SQL injection in form parameters
  - should handle timeout on unresponsive targets
  - should respect rate limiting configuration
  - should report CVSS scores correctly

- sast-scanner.test.ts
  - should detect hardcoded credentials patterns
  - should flag unsafe eval/exec usage
  - should detect path traversal patterns
  - should handle malformed source files gracefully

- dependency-scanner.test.ts
  - should detect known CVEs in package.json dependencies
  - should flag outdated packages with security patches
  - should handle missing lock files

- scanner-orchestrator.test.ts
  - should run all scanners in parallel
  - should aggregate results from multiple scanners
  - should respect scanner priority configuration
  - should handle individual scanner failures without aborting
```

### 7.2 CRITICAL: Claim Verifier Unit Tests
**File**: `tests/unit/agents/claim-verifier/`
**Target**: file-verifier.ts, output-verifier.ts, test-verifier.ts

```
Test cases to write:
- file-verifier.test.ts
  - should verify file was created at claimed path
  - should verify file content matches claimed changes
  - should detect false claims about non-existent files
  - should handle permission errors gracefully

- output-verifier.test.ts
  - should verify command output matches claimed result
  - should detect truncated or modified output
  - should handle binary output correctly

- test-verifier.test.ts
  - should verify test pass/fail status matches claims
  - should detect fabricated test results
  - should handle test framework output parsing errors
```

### 7.3 HIGH: E2E Test Execution Services
**File**: `tests/unit/domains/test-execution/services/e2e/`
**Target**: 8 e2e service files

```
Test cases to write:
- browser-orchestrator.test.ts
  - should launch browser with correct configuration
  - should handle browser crash during test execution
  - should manage multiple concurrent browser instances
  - should clean up resources on test completion

- step-executors.test.ts
  - should execute click actions on correct selectors
  - should handle element-not-found errors
  - should execute navigation steps with proper waiting
  - should handle JavaScript execution steps

- assertion-handlers.test.ts
  - should verify element visibility assertions
  - should verify text content assertions
  - should verify URL assertions after navigation
  - should produce clear failure messages with screenshots

- step-retry-handler.test.ts
  - should retry failed steps up to max retries
  - should apply exponential backoff between retries
  - should not retry non-retryable errors
```

### 7.4 HIGH: Coverage Analysis Core Services
**File**: `tests/unit/domains/coverage-analysis/`
**Target**: coverage-analyzer.ts, coverage-parser.ts, gap-detector.ts, risk-scorer.ts

```
Test cases to write:
- coverage-parser.test.ts
  - should parse Istanbul/NYC JSON coverage format
  - should parse lcov format
  - should handle malformed coverage data
  - should extract line, branch, and function coverage

- gap-detector.test.ts
  - should identify uncovered lines in source files
  - should identify uncovered branches
  - should prioritize gaps by file criticality
  - should handle empty coverage reports

- risk-scorer.test.ts
  - should score higher risk for security-related files
  - should incorporate change frequency into risk score
  - should handle files with no git history
```

### 7.5 HIGH: Test Generation Generators
**File**: `tests/unit/domains/test-generation/generators/`
**Target**: jest-vitest-generator.ts, mocha-generator.ts, pytest-generator.ts, base-test-generator.ts

```
Test cases to write:
- jest-vitest-generator.test.ts
  - should generate valid Jest test syntax
  - should include proper imports for test subjects
  - should generate describe/it blocks with correct nesting
  - should handle async test generation
  - should generate mock setup code

- pytest-generator.test.ts
  - should generate valid pytest syntax
  - should use pytest fixtures correctly
  - should generate parametrized test cases
```

### 7.6 HIGH: Enterprise Integration Services
**File**: `tests/unit/domains/enterprise-integration/services/`
**Target**: All 6 service files

```
Test cases to write:
- sap-integration-service.test.ts
  - should establish SAP RFC connection
  - should handle authentication failures
  - should transform SAP data to internal format

- soap-wsdl-service.test.ts
  - should parse WSDL definitions
  - should generate SOAP envelopes
  - should handle SOAP faults

- message-broker-service.test.ts
  - should publish messages to configured broker
  - should handle broker disconnection
  - should implement retry logic for failed publishes
```

### 7.7 MEDIUM: Performance Module Tests
**File**: `tests/unit/performance/`
**Target**: ci-gates.ts, optimizer.ts, profiler.ts, run-gates.ts

```
Test cases to write:
- ci-gates.test.ts
  - should fail CI when performance threshold exceeded
  - should pass CI when metrics within bounds
  - should handle missing baseline data

- profiler.test.ts
  - should measure function execution time accurately
  - should track memory allocation
  - should aggregate profiling data across runs
```

### 7.8 MEDIUM: Governance Unit Tests
**File**: `tests/unit/governance/`
**Target**: All 15 governance source files (currently only integration tests)

```
Test cases to write:
- feature-flags.test.ts
  - should enable/disable features based on configuration
  - should support percentage rollouts
  - should handle missing flag gracefully

- constitutional-enforcer.test.ts
  - should reject actions violating constitutional rules
  - should allow compliant actions
  - should log enforcement decisions

- trust-accumulator.test.ts
  - should increase trust score on successful actions
  - should decrease trust on failures
  - should cap trust within bounds
```

### 7.9 MEDIUM: Hooks Missing Tests
**File**: `tests/unit/hooks/`
**Target**: cross-phase-hooks.ts, quality-gate-enforcer.ts

```
Test cases to write:
- cross-phase-hooks.test.ts
  - should trigger hooks at phase boundaries
  - should pass phase context to hook handlers
  - should handle hook execution failures
  - should support hook priority ordering

- quality-gate-enforcer.test.ts
  - should block phase transition when gate fails
  - should allow transition when all gates pass
  - should report gate failure reasons
  - should support configurable gate thresholds
```

### 7.10 MEDIUM: Test Scheduling Pipeline
**File**: `tests/unit/test-scheduling/`
**Target**: cicd/github-actions.ts, executors/vitest-executor.ts, pipeline.ts

```
Test cases to write:
- github-actions.test.ts
  - should generate correct workflow YAML
  - should configure matrix builds
  - should handle environment secrets

- vitest-executor.test.ts
  - should execute vitest with correct configuration
  - should parse vitest output format
  - should handle test timeout correctly

- pipeline.test.ts
  - should execute phases in correct order
  - should skip phases based on configuration
  - should handle phase failures with fallback
```

---

## 8. Projected Coverage Impact

If all 10 recommended test suites are implemented:

| Priority | Tests Added | Files Covered | Estimated LOC Covered | Coverage Delta |
|----------|------------|---------------|----------------------|----------------|
| 7.1 Security Scanners | ~40 tests | 9 files | ~4,500 LOC | +0.9% |
| 7.2 Claim Verifiers | ~12 tests | 3 files | ~1,200 LOC | +0.2% |
| 7.3 E2E Execution | ~30 tests | 8 files | ~5,000 LOC | +1.0% |
| 7.4 Coverage Analysis | ~15 tests | 4 files | ~2,000 LOC | +0.4% |
| 7.5 Test Generators | ~20 tests | 4 files | ~3,000 LOC | +0.6% |
| 7.6 Enterprise Integration | ~18 tests | 6 files | ~3,500 LOC | +0.7% |
| 7.7 Performance | ~12 tests | 4 files | ~2,000 LOC | +0.4% |
| 7.8 Governance Unit | ~25 tests | 15 files | ~8,000 LOC | +1.6% |
| 7.9 Hooks | ~8 tests | 2 files | ~800 LOC | +0.2% |
| 7.10 Test Scheduling | ~12 tests | 3 files | ~1,500 LOC | +0.3% |
| **TOTAL** | **~192 tests** | **58 files** | **~31,500 LOC** | **+6.3%** |

This would raise estimated file-level coverage from ~62% to ~68%, with the most impactful gains in security-critical paths.

---

## 9. Optimal Test Writing Order

Based on risk-adjusted ROI (risk score / estimated effort):

1. **Claim Verifiers** (75 risk / low effort) -- 3 small files, high trust impact
2. **Security Scanners** (100 risk / medium effort) -- highest risk, moderate complexity
3. **Coverage Analysis Services** (48 risk / low effort) -- meta-testing, high symbolic value
4. **Hooks** (24 risk / low effort) -- 2 files, guards quality gates
5. **E2E Test Execution** (80 risk / high effort) -- browser orchestration is complex
6. **Test Generators** (36 risk / medium effort) -- validates QE output quality
7. **Governance Unit Tests** (27 risk / medium effort) -- fills integration-only gap
8. **Enterprise Integration** (36 risk / high effort) -- requires mock external services
9. **Performance** (27 risk / medium effort) -- prevents silent regressions
10. **Test Scheduling** (18 risk / low effort) -- CI pipeline integrity

---

## 10. Summary of All Untested Source Files

Total untested source files (excluding index.ts, types-only, and interface-only files): **~98 files**

| Category | Count | Key Files |
|----------|-------|-----------|
| Security scanners | 9 | dast-scanner, sast-scanner, dependency-scanner, scanner-orchestrator |
| Requirements-validation/product-factors | 15 | All parsers, formatters, generators, analyzers |
| Test-execution/e2e services | 14 | browser-orchestrator, step-executors, assertion-handlers |
| Test-generation services/generators | 10 | jest-vitest-generator, pytest-generator, tdd-generator |
| Init phases + installers | 25 | All 13 phase files, 4 installers, 3 migration files |
| Enterprise-integration services | 6 | SAP, SOAP, OData, ESB, message-broker, SOD |
| Performance | 4 | ci-gates, optimizer, profiler, run-gates |
| Coverage-analysis services | 4 | coverage-analyzer, coverage-parser, gap-detector, risk-scorer |
| Agents/claim-verifier | 3 | file-verifier, output-verifier, test-verifier |
| Hooks | 2 | cross-phase-hooks, quality-gate-enforcer |
| Other (skills, testing, workflows, sync-embeddings, etc.) | 6 | security-visual-testing, load tester, workflow-loader |

---

*Report generated by qe-coverage-gap-analyzer for v3.6.8 release cycle.*
