# Coverage Gap Analysis Report - v3.6.3

**Date:** 2026-02-11
**Scope:** `/workspaces/agentic-qe-new/v3/src/` and `/workspaces/agentic-qe-new/v3/tests/`
**Analyzed by:** QE Coverage Gap Analyzer (qe-coverage-gap-analyzer)

---

## Executive Summary

The v3 codebase contains **939 source files** across **88 directories** with **517 test files** providing coverage. After excluding pure boilerplate files (index.ts re-exports, type definitions, constants, interfaces), there are approximately **683 implementation files** that warrant test coverage.

### Key Findings

| Metric | Value |
|--------|-------|
| Total source files | 939 |
| Total test files | 517 |
| Implementation files (non-boilerplate) | ~683 |
| Implementation files WITH tests | ~420 (61.5%) |
| Implementation files WITHOUT tests | ~263 (38.5%) |
| Critical gaps (CRITICAL risk) | 18 |
| High-risk gaps | 34 |
| Medium-risk gaps | 72 |
| Low-risk gaps | ~139 |

**Overall test coverage by domain:**

| Domain | Source Files | Test Files | Coverage % | Risk Level |
|--------|-------------|------------|------------|------------|
| kernel/ | 14 | 13 | 93% | Low |
| coordination/ | 87 | 55 | 63% | Medium |
| mcp/ | 87 | 33 | 38% | CRITICAL |
| routing/ | 9 | 10 | 100% | Low |
| domains/ (13 contexts) | 175 | 95 | 54% | High |
| learning/ | 28 | 32 | 78% | Medium |
| strange-loop/ | 19 | 12 | 63% | High |
| cli/ | 50 | 18 | 36% | Medium |
| integrations/ | 100 | 55 | 55% | Medium |
| feedback/ | 7 | 6 | 86% | Low |
| adapters/ | 72 | 42 | 58% | Medium |
| shared/ | 60 | 25 | 42% | High |
| governance/ | 16 | 13 | 81% | Low |
| memory/ | 10 | 1 (direct) | 10% | CRITICAL |
| workers/ | 17 | 14 | 82% | Low |
| init/ | 35 | 7 | 20% | High |
| planning/ | 5 | 3 | 60% | Medium |
| hooks/ | 6 | 3 | 50% | High |
| performance/ | 6 | 1 | 17% | High |
| testing/load/ | 4 | 0 | 0% | High |
| test-scheduling/ | 8 | 3 | 38% | Medium |
| early-exit/ | 6 | 6 | 100% | Low |
| sync/ | 12 | 7 | 58% | Medium |
| agents/ | 12 | 1 | 8% | CRITICAL |
| skills/ | 2 | 0 | 0% | Medium |
| workflows/ | 2 | 0 | 0% | Low |
| validation/ | 4 | 3 | 75% | Low |

---

## Gap Inventory with Risk Scores

### CRITICAL Risk Gaps (18 items)

These are untested modules that are public-facing, security-relevant, or in the critical execution path.

#### 1. MCP Security Validators (Security + Public API)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 1 | `src/mcp/security/validators/command-validator.ts` | 160 | NO TEST | Security-critical, prevents command injection |
| 2 | `src/mcp/security/validators/crypto-validator.ts` | 90 | NO TEST | Cryptographic validation, security boundary |
| 3 | `src/mcp/security/validators/input-sanitizer.ts` | 201 | NO TEST | Input sanitization, primary defense layer |
| 4 | `src/mcp/security/validators/path-traversal-validator.ts` | 303 | NO TEST | Path traversal prevention, security-critical |
| 5 | `src/mcp/security/validators/regex-safety-validator.ts` | 239 | NO TEST | ReDoS prevention, availability concern |

**Risk Score: 10/10** - These are security boundary validators with ZERO unit tests. Only the `validation-orchestrator.ts` (which delegates to these) has a test. Each validator needs independent testing for bypass scenarios and edge cases.

#### 2. MCP Server Infrastructure (Critical Path + Public API)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 6 | `src/mcp/http-server.ts` | 1130 | NO TEST | Primary HTTP entry point, 1130 lines |
| 7 | `src/mcp/protocol-server.ts` | 948 | NO TEST | MCP protocol implementation, 948 lines |
| 8 | `src/mcp/connection-pool.ts` | 488 | NO TEST | Connection lifecycle, resource management |
| 9 | `src/mcp/load-balancer.ts` | 356 | NO TEST | Request distribution, availability |
| 10 | `src/mcp/performance-monitor.ts` | 429 | NO TEST | Performance tracking, metrics collection |
| 11 | `src/mcp/services/task-router.ts` | 692 | NO TEST | Task routing logic, critical path |
| 12 | `src/mcp/services/reasoning-bank-service.ts` | 854 | NO TEST | Reasoning bank MCP service layer |

**Risk Score: 9/10** - The MCP server is the primary public API surface. The `server.ts` has a test but `http-server.ts` and `protocol-server.ts` which handle transport, connection management, and protocol compliance have NO tests.

#### 3. Agent Claim Verifier System (Critical Quality Gate)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 13 | `src/agents/claim-verifier/claim-verifier-service.ts` | 705 | NO TEST | Core verification logic |
| 14 | `src/agents/claim-verifier/verifiers/file-verifier.ts` | 472 | NO TEST | File existence/content verification |
| 15 | `src/agents/claim-verifier/verifiers/output-verifier.ts` | 465 | NO TEST | Output correctness verification |
| 16 | `src/agents/claim-verifier/verifiers/test-verifier.ts` | 548 | NO TEST | Test passage verification |

**Risk Score: 9/10** - The claim verifier is a quality gate ensuring agents produce correct results. Zero tests on 2,190 lines of verification logic means false positives/negatives go undetected.

#### 4. Memory CRDT and Cross-Phase (Coordination Critical)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 17 | `src/memory/cross-phase-memory.ts` | 389 | NO TEST | Cross-phase data persistence |
| 18 | `src/memory/crdt/` (6 files) | ~500+ | 1 TEST | Distributed state convergence |

**Risk Score: 9/10** - CRDT implementations (G-Counter, PN-Counter, OR-Set, LWW-Register) have only 1 test file covering all of them. Cross-phase memory has no dedicated test. These are foundations for distributed coordination correctness.

---

### HIGH Risk Gaps (34 items)

#### 5. Strange-Loop Self-Healing (Self-Healing Infrastructure)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 19 | `src/strange-loop/healing-controller.ts` | 906 | NO TEST | Orchestrates healing decisions |
| 20 | `src/strange-loop/self-model.ts` | 494 | NO TEST | Agent self-awareness model |
| 21 | `src/strange-loop/swarm-observer.ts` | 448 | NO TEST | Swarm health observation |
| 22 | `src/strange-loop/topology-analyzer.ts` | 565 | NO TEST | Network topology analysis |

**Risk Score: 8/10** - Self-healing is an automated recovery system. Incorrect healing decisions could cascade into system instability. 2,413 lines without tests.

#### 6. Learning Engine Core (Pattern Lifecycle + Persistence)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 23 | `src/learning/pattern-lifecycle.ts` | 962 | NO TEST | Pattern promotion/demotion logic |
| 24 | `src/learning/qe-patterns.ts` | 529 | NO TEST | QE pattern definitions |
| 25 | `src/learning/qe-unified-memory.ts` | 1260 | NO TEST | Unified memory for learning |
| 26 | `src/learning/real-embeddings.ts` | 292 | NO TEST | Real embedding generation |
| 27 | `src/learning/metrics-tracker.ts` | 601 | NO TEST | Learning metrics tracking |
| 28 | `src/learning/sqlite-persistence.ts` | 854 | NO TEST | SQLite persistence layer |
| 29 | `src/learning/dream/concept-graph.ts` | 717 | NO TEST | Concept graph structure |
| 30 | `src/learning/dream/insight-generator.ts` | 926 | NO TEST | Insight generation from patterns |
| 31 | `src/learning/dream/spreading-activation.ts` | 689 | NO TEST | Neural spreading activation |

**Risk Score: 8/10** - The learning subsystem is responsible for pattern retention and optimization. `pattern-lifecycle.ts` (962 lines) controls pattern promotion which directly affects QE quality over time.

#### 7. Domain Services Without Tests

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 32 | `src/domains/coverage-analysis/services/coverage-analyzer.ts` | 814 | NO TEST | Core coverage analysis |
| 33 | `src/domains/coverage-analysis/services/coverage-parser.ts` | 753 | NO TEST | Coverage report parsing |
| 34 | `src/domains/coverage-analysis/services/gap-detector.ts` | 912 | NO TEST | Gap detection logic |
| 35 | `src/domains/coverage-analysis/services/risk-scorer.ts` | 540 | NO TEST | Risk scoring logic |
| 36 | `src/domains/test-execution/services/test-executor.ts` | 1022 | NO TEST | Core test execution |
| 37 | `src/domains/test-execution/services/flaky-detector.ts` | 1292 | NO TEST | Flaky test detection |
| 38 | `src/domains/test-execution/services/retry-handler.ts` | 822 | NO TEST | Test retry logic |
| 39 | `src/domains/test-execution/services/test-prioritizer.ts` | 593 | NO TEST | Test prioritization |
| 40 | `src/domains/test-execution/services/user-flow-generator.ts` | 1401 | NO TEST | User flow generation |
| 41 | `src/domains/test-execution/services/network-mocker.ts` | 384 | NO TEST | Network mocking |
| 42 | `src/domains/test-execution/services/auth-state-manager.ts` | 502 | NO TEST | Auth state management |
| 43 | `src/domains/test-generation/services/test-generator.ts` | 863 | NO TEST | Core test generation |
| 44 | `src/domains/test-generation/services/pattern-matcher.ts` | 1725 | NO TEST | Pattern matching, 1725 lines |
| 45 | `src/domains/test-generation/services/tdd-generator.ts` | 380 | NO TEST | TDD test generation |
| 46 | `src/domains/test-generation/services/test-data-generator.ts` | 304 | NO TEST | Test data generation |
| 47 | `src/domains/test-generation/services/property-test-generator.ts` | 335 | NO TEST | Property-based test gen |
| 48 | `src/domains/test-generation/services/code-transform-integration.ts` | 352 | NO TEST | Code transform integration |

**Risk Score: 8/10** - These are the core services for test generation, execution, and coverage analysis domains. The coverage-analysis services are especially ironic -- the gap-detector (912 lines) and risk-scorer (540 lines) that detect gaps in OTHER projects have no tests themselves.

#### 8. Security-Compliance Scanners

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 49 | `src/domains/security-compliance/services/scanners/dast-scanner.ts` | 455 | NO TEST | DAST security scanning |
| 50 | `src/domains/security-compliance/services/scanners/sast-scanner.ts` | 586 | NO TEST | SAST security scanning |
| 51 | `src/domains/security-compliance/services/scanners/dependency-scanner.ts` | 247 | NO TEST | Dependency vulnerability |
| 52 | `src/domains/security-compliance/services/scanners/scanner-orchestrator.ts` | 268 | NO TEST | Scanner coordination |

**Risk Score: 8/10** - Security scanners without tests cannot be trusted to detect vulnerabilities accurately. False negatives in security scanning are high-impact.

#### 9. Enterprise Integration Services (ALL untested)

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 53 | `src/domains/enterprise-integration/services/esb-middleware-service.ts` | 870 | NO TEST | ESB middleware |
| 54 | `src/domains/enterprise-integration/services/message-broker-service.ts` | 743 | NO TEST | Message broker |
| 55 | `src/domains/enterprise-integration/services/odata-service.ts` | 834 | NO TEST | OData protocol |
| 56 | `src/domains/enterprise-integration/services/sap-integration-service.ts` | 696 | NO TEST | SAP integration |
| 57 | `src/domains/enterprise-integration/services/soap-wsdl-service.ts` | 844 | NO TEST | SOAP/WSDL handling |
| 58 | `src/domains/enterprise-integration/services/sod-analysis-service.ts` | 558 | NO TEST | SoD analysis |

**Risk Score: 7/10** - The entire enterprise-integration domain services (4,545 lines) have ZERO unit tests. Only the coordinator has a test.

#### 10. Quality Assessment Coherence Subsystem

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 59 | `src/domains/quality-assessment/coherence/gate-controller.ts` | 549 | NO TEST | Coherence gate control |
| 60 | `src/domains/quality-assessment/coherence/lambda-calculator.ts` | 384 | NO TEST | Lambda coherence calc |
| 61 | `src/domains/quality-assessment/coherence/partition-detector.ts` | 469 | NO TEST | Partition detection |
| 62 | `src/domains/defect-intelligence/services/causal-root-cause-analyzer.ts` | 494 | NO TEST | Causal RCA |

**Risk Score: 7/10** - Coherence scoring directly affects quality gates and deployment decisions.

#### 11. Performance and Load Testing Infrastructure

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 63 | `src/performance/ci-gates.ts` | 569 | NO TEST | CI gate enforcement |
| 64 | `src/performance/optimizer.ts` | 820 | NO TEST | Performance optimization |
| 65 | `src/performance/profiler.ts` | 524 | NO TEST | Performance profiling |
| 66 | `src/testing/load/agent-load-tester.ts` | 820 | NO TEST | Load testing |
| 67 | `src/testing/load/bottleneck-analyzer.ts` | 611 | NO TEST | Bottleneck analysis |
| 68 | `src/testing/load/metrics-collector.ts` | 707 | NO TEST | Load metrics |

**Risk Score: 7/10** - Performance gates without tests may incorrectly pass/fail builds. The entire testing/load directory has zero tests.

#### 12. Shared Security and Infrastructure

| # | Source File | Lines | Test Status | Risk Factors |
|---|-----------|-------|-------------|--------------|
| 69 | `src/shared/security/compliance-patterns.ts` | 666 | NO TEST | Security compliance |
| 70 | `src/shared/security/osv-client.ts` | 468 | NO TEST | OSV vulnerability DB |
| 71 | `src/shared/git/git-analyzer.ts` | 656 | NO TEST | Git analysis |
| 72 | `src/shared/metrics/code-metrics.ts` | 520 | NO TEST | Code metrics |
| 73 | `src/shared/metrics/system-metrics.ts` | 353 | NO TEST | System metrics |

**Risk Score: 7/10** - Security compliance patterns and OSV client are used across the security domain.

---

### MEDIUM Risk Gaps (72 items)

#### 13. CLI Commands (Majority Untested)

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/cli/commands/code.ts` | 290 | NO TEST |
| `src/cli/commands/coverage.ts` | 277 | NO TEST |
| `src/cli/commands/eval.ts` | 670 | NO TEST |
| `src/cli/commands/fleet.ts` | 431 | NO TEST |
| `src/cli/commands/hooks.ts` | 1042 | NO TEST |
| `src/cli/commands/learning.ts` | 1726 | NO TEST |
| `src/cli/commands/quality.ts` | 49 | NO TEST |
| `src/cli/commands/security.ts` | 137 | NO TEST |
| `src/cli/commands/sync.ts` | 348 | NO TEST |
| `src/cli/commands/test.ts` | 183 | NO TEST |
| `src/cli/commands/token-usage.ts` | 447 | NO TEST |
| `src/cli/commands/validate.ts` | 498 | NO TEST |
| `src/cli/commands/validate-swarm.ts` | 337 | NO TEST |
| `src/cli/commands/qe-tools.ts` | 931 | NO TEST |
| `src/cli/utils/workflow-parser.ts` | 1042 | NO TEST |

**Risk Score: 6/10** - 15 CLI commands (8,408 lines) have no tests. Only `init.ts`, `migrate.ts`, `mcp.ts`, and `llm-router.ts` are tested.

#### 14. CLI Handlers

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/cli/handlers/agent-handler.ts` | 208 | NO TEST |
| `src/cli/handlers/domain-handler.ts` | 144 | NO TEST |
| `src/cli/handlers/protocol-handler.ts` | 111 | NO TEST |
| `src/cli/handlers/status-handler.ts` | 277 | NO TEST |
| `src/cli/handlers/task-handler.ts` | 330 | NO TEST |

**Risk Score: 5/10** - CLI handlers process user input and coordinate operations.

#### 15. Init System (Majority Untested)

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/init/orchestrator.ts` | 290 | NO TEST |
| `src/init/agents-installer.ts` | 663 | NO TEST |
| `src/init/governance-installer.ts` | 218 | NO TEST |
| `src/init/n8n-installer.ts` | 507 | NO TEST |
| `src/init/skills-installer.ts` | 580 | NO TEST |
| `src/init/token-bootstrap.ts` | 222 | NO TEST |
| `src/init/enhancements/claude-flow-adapter.ts` | ~200 | NO TEST |
| `src/init/enhancements/detector.ts` | ~200 | NO TEST |
| `src/init/migration/config-migrator.ts` | ~200 | NO TEST |
| `src/init/migration/data-migrator.ts` | ~200 | NO TEST |
| `src/init/migration/detector.ts` | ~200 | NO TEST |
| `src/init/phases/01-12` (12 phase files) | ~3000 | NO TEST |

**Risk Score: 6/10** - The initialization system is complex (35 files), but only 7 have tests. Phase execution files (01-12) have no individual tests.

#### 16. RL Suite Algorithms (Untested Individually)

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/integrations/rl-suite/algorithms/ppo.ts` | 319 | NO TEST |
| `src/integrations/rl-suite/algorithms/ddpg.ts` | 349 | NO TEST |
| `src/integrations/rl-suite/algorithms/a2c.ts` | 314 | NO TEST |
| `src/integrations/rl-suite/algorithms/actor-critic.ts` | 374 | NO TEST |
| `src/integrations/rl-suite/algorithms/decision-transformer.ts` | 427 | NO TEST |
| `src/integrations/rl-suite/algorithms/dqn.ts` | 228 | NO TEST |
| `src/integrations/rl-suite/algorithms/policy-gradient.ts` | 331 | NO TEST |
| `src/integrations/rl-suite/algorithms/sarsa.ts` | 209 | NO TEST |
| `src/integrations/rl-suite/base-algorithm.ts` | 681 | NO TEST |
| `src/integrations/rl-suite/orchestrator.ts` | 535 | NO TEST |
| `src/integrations/rl-suite/reward-signals.ts` | 397 | NO TEST |
| `src/integrations/rl-suite/neural/neural-network.ts` | 520 | NO TEST |
| `src/integrations/rl-suite/neural/replay-buffer.ts` | 344 | NO TEST |

**Risk Score: 6/10** - The RL suite has integration-level tests (sona.test.ts, rl-suite.test.ts) but NO unit tests for individual algorithms. Mathematical correctness of RL algorithms is not verified.

#### 17. Hooks System

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/hooks/cross-phase-hooks.ts` | 518 | NO TEST |
| `src/hooks/quality-gate-enforcer.ts` | 385 | NO TEST |

**Risk Score: 6/10** - Quality gate enforcer controls deployment decisions.

#### 18. Governance Gaps

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/governance/feature-flags.ts` | 560 | NO TEST |
| `src/governance/continue-gate-integration.ts` | 326 | NO TEST |
| `src/governance/memory-write-gate-integration.ts` | 414 | NO TEST |

**Risk Score: 6/10** - Feature flags control production behavior. Continue gate and memory-write gate are governance boundaries.

#### 19. Test Scheduling Gaps

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/test-scheduling/pipeline.ts` | 352 | NO TEST |
| `src/test-scheduling/executors/vitest-executor.ts` | 401 | NO TEST |
| `src/test-scheduling/cicd/github-actions.ts` | 400 | NO TEST |

**Risk Score: 5/10** - CI/CD integration and test pipeline orchestration.

#### 20. Claude Flow Adapter Bridges

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/adapters/claude-flow/model-router-bridge.ts` | 236 | NO TEST |
| `src/adapters/claude-flow/pretrain-bridge.ts` | 309 | NO TEST |
| `src/adapters/claude-flow/trajectory-bridge.ts` | 258 | NO TEST |

**Risk Score: 5/10** - Bridges between Claude Flow and AQE systems.

#### 21. RuVector Subsystem Gaps

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/integrations/ruvector/gnn-wrapper.ts` | 751 | NO TEST |
| `src/integrations/ruvector/fallback.ts` | 942 | NO TEST |
| `src/integrations/ruvector/feature-flags.ts` | 239 | NO TEST |

**Risk Score: 5/10** - GNN wrapper (751 lines) and fallback logic (942 lines) without tests.

#### 22. Kernel Migration

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/kernel/unified-memory-migration.ts` | 296 | NO TEST |

**Risk Score: 5/10** - Data migration correctness is important for upgrade paths.

#### 23. Shared Utilities

| Source File | Lines | Test Status |
|-------------|-------|-------------|
| `src/shared/utils/circular-buffer.ts` | 84 | NO TEST |
| `src/shared/utils/vector-math.ts` | 72 | NO TEST |
| `src/shared/embeddings/ollama-client.ts` | ~150 | NO TEST |
| `src/shared/embeddings/embedding-cache.ts` | ~150 | NO TEST |

**Risk Score: 4/10** - Utility modules used across the codebase.

---

### LOW Risk Gaps (~139 items)

These include:
- Index/re-export files (no logic)
- Type definition files
- Interface files
- Constants files
- Plugin registration files (boilerplate patterns)
- Small adapter glue code

These are intentionally deprioritized as they contain minimal logic.

---

## Coverage Matrix - Detailed Domain Mapping

### 1. Kernel (`src/kernel/` --> `tests/unit/kernel/`)

| Source Module | Test File | Status |
|--------------|-----------|--------|
| kernel.ts | kernel.test.ts | COVERED |
| unified-memory.ts | unified-memory.test.ts | COVERED |
| hybrid-backend.ts | hybrid-backend.test.ts | COVERED |
| event-bus.ts | event-bus.test.ts | COVERED |
| agent-coordinator.ts | agent-coordinator.test.ts | COVERED |
| anti-drift-middleware.ts | anti-drift-middleware.test.ts | COVERED |
| memory-backend.ts | memory-backend.test.ts | COVERED |
| memory-factory.ts | memory-factory.test.ts | COVERED |
| plugin-loader.ts | plugin-loader.test.ts | COVERED |
| unified-persistence.ts | unified-persistence.test.ts | COVERED |
| unified-memory-migration.ts | -- | **GAP** |
| constants.ts | -- | N/A (no logic) |
| interfaces.ts | -- | N/A (types only) |
| index.ts | -- | N/A (re-export) |

**Coverage: 10/11 testable files = 91%**

### 2. Coordination (`src/coordination/`)

| Source Module | Test File(s) | Status |
|--------------|-------------|--------|
| queen-coordinator.ts | queen-coordinator.test.ts + 2 more | COVERED (3 tests) |
| workflow-orchestrator.ts | workflow-orchestrator.test.ts (integration) | PARTIAL |
| task-executor.ts | task-executor.test.ts | COVERED |
| protocol-executor.ts | protocol-executor.test.ts (integration) | COVERED |
| cross-domain-router.ts | cross-domain-router.test.ts (unit+integration) | COVERED |
| result-saver.ts | result-saver.test.ts | COVERED |
| consensus/consensus-engine.ts | consensus-engine.test.ts | COVERED |
| consensus/domain-findings.ts | -- | **GAP** |
| consensus/factory.ts | -- | **GAP** |
| consensus/model-provider.ts | -- | **GAP** |
| consensus/providers/* (6 files) | 6 test files | COVERED |
| consensus/strategies/* (3 files) | -- | **GAP** |
| claims/claim-service.ts | claim-service.test.ts | COVERED |
| claims/handoff-manager.ts | handoff-manager.test.ts | COVERED |
| claims/work-stealing.ts | work-stealing.test.ts | COVERED |
| claims/claim-repository.ts | -- | **GAP** |
| agent-teams/adapter.ts | agent-teams.test.ts | COVERED |
| agent-teams/domain-team-manager.ts | domain-team-manager.test.ts | COVERED |
| agent-teams/mailbox.ts | -- | **GAP** |
| agent-teams/tracing.ts | tracing.test.ts | COVERED |
| competing-hypotheses/hypothesis-manager.ts | competing-hypotheses.test.ts | COVERED |
| circuit-breaker/* | domain-circuit-breaker.test.ts | COVERED |
| dynamic-scaling/dynamic-scaler.ts | dynamic-scaling.test.ts | COVERED |
| federation/federation-mailbox.ts | federation.test.ts | COVERED |
| fleet-tiers/tier-selector.ts | fleet-tiers.test.ts | COVERED |
| mincut/* (13 files) | 12 test files | COVERED |
| mixins/consensus-enabled-domain.ts | test | COVERED |
| mixins/mincut-aware-domain.ts | test | COVERED |
| mixins/governance-aware-domain.ts | -- | **GAP** |
| protocols/* (6 files) | 4 test files | PARTIAL |
| services/task-audit-logger.ts | task-audit-logger.test.ts | COVERED |
| task-dag/* | task-dag.test.ts | COVERED |
| plugin.ts | -- | **GAP** (but boilerplate) |

**Coverage: ~42/55 testable files = 76%**
**Gaps: consensus strategies, consensus factory/model-provider, claim-repository, mailbox, governance mixin, security-audit protocol**

### 3. MCP (`src/mcp/`)

| Source Module | Test File(s) | Status |
|--------------|-------------|--------|
| server.ts | mcp-server.test.ts | COVERED |
| http-server.ts | -- | **CRITICAL GAP** |
| protocol-server.ts | -- | **CRITICAL GAP** |
| connection-pool.ts | -- | **CRITICAL GAP** |
| load-balancer.ts | -- | **CRITICAL GAP** |
| performance-monitor.ts | -- | **GAP** |
| entry.ts | -- | **GAP** |
| tool-registry.ts | tool-registry-security.test.ts | COVERED |
| handlers/agent-handlers.ts | agent-handlers.test.ts | COVERED |
| handlers/core-handlers.ts | core-handlers.test.ts | COVERED |
| handlers/domain-handlers.ts | domain-handlers.test.ts | COVERED |
| handlers/handler-factory.ts | handler-factory.test.ts | COVERED |
| handlers/memory-handlers.ts | memory-handlers.test.ts | COVERED |
| handlers/task-handlers.ts | task-handlers.test.ts | COVERED |
| handlers/wrapped-domain-handlers.ts | wrapped-domain-handlers.test.ts | COVERED |
| handlers/cross-phase-handlers.ts | -- | **GAP** |
| handlers/domain-handler-configs.ts | -- | N/A (config) |
| metrics/metrics-collector.ts | metrics-collector.test.ts | COVERED |
| security/cve-prevention.ts | cve-prevention.test.ts | COVERED |
| security/oauth21-provider.ts | oauth21-provider.test.ts | COVERED |
| security/rate-limiter.ts | rate-limiter.test.ts | COVERED |
| security/sampling-server.ts | sampling-server.test.ts | COVERED |
| security/schema-validator.ts | schema-validator.test.ts | COVERED |
| security/validators/validation-orchestrator.ts | validation-orchestrator.test.ts | COVERED |
| security/validators/command-validator.ts | -- | **CRITICAL GAP** |
| security/validators/crypto-validator.ts | -- | **CRITICAL GAP** |
| security/validators/input-sanitizer.ts | -- | **CRITICAL GAP** |
| security/validators/path-traversal-validator.ts | -- | **CRITICAL GAP** |
| security/validators/regex-safety-validator.ts | -- | **CRITICAL GAP** |
| services/task-router.ts | -- | **CRITICAL GAP** |
| services/reasoning-bank-service.ts | -- | **GAP** |
| tools/base.ts | base.test.ts | COVERED |
| tools/registry.ts | registry.test.ts | COVERED |
| tools/analysis/token-usage.ts | token-usage.test.ts | COVERED |
| tools/qx-analysis/* | qx-analysis.test.ts | COVERED |
| tools (domain-specific, ~20 files) | domain-tools.test.ts | PARTIAL |
| transport/sse/* | sse tests | COVERED |
| transport/websocket/* | websocket-transport.test.ts | COVERED |
| transport/stdio.ts | -- | **GAP** |

**Coverage: ~25/45 testable files = 56%**
**CRITICAL: 12 files without tests including all 5 security validators, HTTP/protocol servers, connection pool**

### 4. Routing (`src/routing/`)

| Source Module | Test File | Status |
|--------------|-----------|--------|
| qe-task-router.ts | qe-task-router.test.ts | COVERED |
| qe-agent-registry.ts | qe-agent-registry.test.ts | COVERED |
| queen-integration.ts | queen-integration.test.ts | COVERED |
| routing-config.ts | routing-config.test.ts | COVERED |
| routing-feedback.ts | routing-feedback.test.ts | COVERED |
| task-classifier.ts | task-classifier.test.ts | COVERED |
| tiny-dancer-router.ts | tiny-dancer-router.test.ts | COVERED |
| types.ts | -- | N/A |
| index.ts | -- | N/A |

**Coverage: 7/7 testable files = 100%** -- Best covered domain.

### 5. Feedback (`src/feedback/`)

| Source Module | Test File | Status |
|--------------|-----------|--------|
| feedback-loop.ts | feedback-loop.test.ts + integration | COVERED |
| quality-score-calculator.ts | quality-score-calculator.test.ts | COVERED |
| coverage-learner.ts | coverage-learner.test.ts | COVERED |
| pattern-promotion.ts | pattern-promotion.test.ts | COVERED |
| test-outcome-tracker.ts | test-outcome-tracker.test.ts | COVERED |
| types.ts | -- | N/A |
| index.ts | -- | N/A |

**Coverage: 5/5 testable files = 100%**

---

## Missing Test Categories

### Error Path Tests

The following critical modules lack dedicated error path testing:

1. **MCP server error handling** - No tests for malformed requests, connection drops, timeout handling
2. **Coordination failure modes** - No tests for queen-coordinator when agents fail mid-task
3. **Memory persistence failures** - No tests for SQLite write failures, corruption recovery
4. **Network failure in RL algorithms** - No tests for training interruptions, state recovery
5. **Dream engine overflow** - No tests for concept-graph memory limits, activation runaway

### Boundary Condition Tests

1. **Connection pool limits** - No tests for pool exhaustion, connection recycling at capacity
2. **Rate limiter edge cases** - Rate limiter has tests but no boundary tests for burst patterns
3. **CRDT convergence under conflict** - Single test file, needs concurrent modification tests
4. **RL algorithm numerical stability** - No tests for extreme reward values, gradient explosion
5. **Load balancer weight distribution** - No tests for all-unhealthy-backends scenario

### Integration Tests Missing

1. **Kernel -> MCP server lifecycle** - No end-to-end initialization test
2. **Learning -> Governance pipeline** - Pattern promotion through governance approval
3. **Agent claim-verifier -> queen coordinator** - Claim verification in real workflow
4. **Strange-loop healing -> coordinator recovery** - Self-healing triggering coordinator restart
5. **Dream engine -> pattern-lifecycle** - Dream insights affecting pattern promotion

---

## Recommended Tests to Write (Priority Order)

### Priority 1 - CRITICAL (Write Immediately)

| # | Test to Write | Target Module | Est. Effort | Coverage Impact |
|---|-------------|---------------|-------------|-----------------|
| 1 | `tests/unit/mcp/security/validators/command-validator.test.ts` | command-validator.ts | 2h | +0.2% |
| 2 | `tests/unit/mcp/security/validators/path-traversal-validator.test.ts` | path-traversal-validator.ts | 3h | +0.3% |
| 3 | `tests/unit/mcp/security/validators/input-sanitizer.test.ts` | input-sanitizer.ts | 2h | +0.2% |
| 4 | `tests/unit/mcp/security/validators/crypto-validator.test.ts` | crypto-validator.ts | 1h | +0.1% |
| 5 | `tests/unit/mcp/security/validators/regex-safety-validator.test.ts` | regex-safety-validator.ts | 2h | +0.2% |
| 6 | `tests/unit/mcp/http-server.test.ts` | http-server.ts | 4h | +1.2% |
| 7 | `tests/unit/mcp/protocol-server.test.ts` | protocol-server.ts | 4h | +1.0% |
| 8 | `tests/unit/mcp/connection-pool.test.ts` | connection-pool.ts | 3h | +0.5% |
| 9 | `tests/unit/agents/claim-verifier/claim-verifier-service.test.ts` | claim-verifier-service.ts | 4h | +0.8% |
| 10 | `tests/unit/agents/claim-verifier/verifiers/file-verifier.test.ts` | file-verifier.ts | 2h | +0.5% |
| 11 | `tests/unit/agents/claim-verifier/verifiers/output-verifier.test.ts` | output-verifier.ts | 2h | +0.5% |
| 12 | `tests/unit/agents/claim-verifier/verifiers/test-verifier.test.ts` | test-verifier.ts | 2h | +0.6% |
| 13 | `tests/unit/memory/cross-phase-memory.test.ts` | cross-phase-memory.ts | 2h | +0.4% |
| 14 | `tests/unit/memory/crdt/individual-crdt.test.ts` | g-counter, pn-counter, or-set, lww-register | 3h | +0.5% |

**Estimated total: ~36 hours, Coverage impact: +7.0%**

### Priority 2 - HIGH (Write This Sprint)

| # | Test to Write | Target Module | Est. Effort | Coverage Impact |
|---|-------------|---------------|-------------|-----------------|
| 15 | `tests/unit/strange-loop/healing-controller.test.ts` | healing-controller.ts | 4h | +1.0% |
| 16 | `tests/unit/strange-loop/self-model.test.ts` | self-model.ts | 2h | +0.5% |
| 17 | `tests/unit/strange-loop/swarm-observer.test.ts` | swarm-observer.ts | 2h | +0.5% |
| 18 | `tests/unit/strange-loop/topology-analyzer.test.ts` | topology-analyzer.ts | 3h | +0.6% |
| 19 | `tests/unit/learning/pattern-lifecycle.test.ts` | pattern-lifecycle.ts | 4h | +1.0% |
| 20 | `tests/unit/learning/sqlite-persistence.test.ts` | sqlite-persistence.ts | 3h | +0.9% |
| 21 | `tests/unit/learning/qe-unified-memory.test.ts` | qe-unified-memory.ts | 4h | +1.3% |
| 22 | `tests/unit/domains/coverage-analysis/coverage-analyzer.test.ts` | coverage-analyzer.ts | 3h | +0.9% |
| 23 | `tests/unit/domains/coverage-analysis/gap-detector.test.ts` | gap-detector.ts | 3h | +1.0% |
| 24 | `tests/unit/domains/test-execution/test-executor.test.ts` | test-executor.ts | 4h | +1.1% |
| 25 | `tests/unit/domains/test-execution/flaky-detector.test.ts` | flaky-detector.ts | 4h | +1.4% |
| 26 | `tests/unit/domains/test-generation/test-generator.test.ts` | test-generator.ts | 3h | +0.9% |
| 27 | `tests/unit/domains/test-generation/pattern-matcher.test.ts` | pattern-matcher.ts | 5h | +1.8% |
| 28 | `tests/unit/domains/security-compliance/scanners/dast-scanner.test.ts` | dast-scanner.ts | 3h | +0.5% |
| 29 | `tests/unit/domains/security-compliance/scanners/sast-scanner.test.ts` | sast-scanner.ts | 3h | +0.6% |
| 30 | `tests/unit/mcp/services/task-router.test.ts` | task-router.ts | 3h | +0.7% |
| 31 | `tests/unit/mcp/load-balancer.test.ts` | load-balancer.ts | 2h | +0.4% |
| 32 | `tests/unit/shared/security/compliance-patterns.test.ts` | compliance-patterns.ts | 2h | +0.7% |
| 33 | `tests/unit/shared/security/osv-client.test.ts` | osv-client.ts | 2h | +0.5% |

**Estimated total: ~59 hours, Coverage impact: +16.3%**

### Priority 3 - MEDIUM (Write Next Sprint)

| # | Test to Write | Target Module | Est. Effort |
|---|-------------|---------------|-------------|
| 34 | Enterprise integration service tests (6 files) | enterprise-integration/services/* | 12h |
| 35 | CLI command tests (14 untested commands) | cli/commands/* | 14h |
| 36 | CLI handler tests (5 handlers) | cli/handlers/* | 5h |
| 37 | Init system tests (installers, phases) | init/* | 10h |
| 38 | RL algorithm unit tests (8 algorithms) | rl-suite/algorithms/* | 12h |
| 39 | Performance infrastructure tests | performance/* | 6h |
| 40 | Load testing infrastructure tests | testing/load/* | 6h |
| 41 | Learning dream subsystem tests | learning/dream/* (3 files) | 6h |
| 42 | Governance gate tests | governance/* (3 files) | 4h |
| 43 | Hooks system tests | hooks/* (2 files) | 3h |
| 44 | Test scheduling tests | test-scheduling/* (3 files) | 4h |
| 45 | Quality assessment coherence tests | quality-assessment/coherence/* | 4h |

**Estimated total: ~86 hours, Coverage impact: +15.0%**

---

## Statistics Summary

### By the Numbers

| Metric | Count |
|--------|-------|
| Total source files in v3/src | 939 |
| Total test files in v3/tests | 517 |
| Implementation files requiring tests | ~683 |
| Files WITH corresponding tests | ~420 (61.5%) |
| Files WITHOUT tests | ~263 (38.5%) |
| CRITICAL untested files | 18 |
| HIGH-risk untested files | 34 |
| MEDIUM-risk untested files | 72 |
| LOW-risk/boilerplate untested files | ~139 |
| Total untested lines (CRITICAL+HIGH) | ~36,500 |
| Estimated effort for Priority 1 | 36 hours |
| Estimated effort for Priority 2 | 59 hours |
| Estimated effort for Priority 3 | 86 hours |
| Projected coverage after Priority 1 | ~68.5% |
| Projected coverage after Priority 1+2 | ~84.8% |
| Projected coverage after all priorities | ~99.8% |

### Domain Health Scorecard

| Domain | Health | Grade | Action Required |
|--------|--------|-------|-----------------|
| routing/ | 100% | A+ | None |
| feedback/ | 100% | A+ | None |
| early-exit/ | 100% | A+ | None |
| kernel/ | 91% | A | Migration test needed |
| workers/ | 82% | B+ | Cloud-sync worker test |
| governance/ | 81% | B | Feature flags + gate tests |
| learning/ | 78% | B- | Pattern lifecycle + persistence tests |
| coordination/ | 76% | B- | Strategy + factory tests |
| planning/ | 60% | C- | Action library test |
| adapters/ | 58% | C- | Claude-flow bridge tests |
| sync/ | 58% | C- | Embedding sync tests |
| integrations/ | 55% | D+ | RL algorithms + RuVector gaps |
| domains/ | 54% | D | Major service gaps |
| hooks/ | 50% | D | Cross-phase + quality gate tests |
| shared/ | 42% | D- | Security + metrics tests |
| mcp/ | 38% | F+ | Server infrastructure + validators |
| test-scheduling/ | 38% | F+ | Pipeline + executor tests |
| cli/ | 36% | F | 14 commands untested |
| init/ | 20% | F | Installers + phases untested |
| performance/ | 17% | F | Nearly all untested |
| memory/ | 10% | F | CRDT + cross-phase untested |
| agents/ | 8% | F | Claim verifier completely untested |
| testing/load/ | 0% | F- | Entire domain untested |
| skills/ | 0% | F- | Both files untested |
| workflows/ | 0% | F- | Both files untested |

---

## Recommendations

### Immediate Actions (This Week)

1. **Write all 5 MCP security validator tests** - These are security boundary defenses with zero coverage. Each validator should test: valid input acceptance, malicious input rejection, edge cases (empty strings, unicode, null bytes), and bypass attempts.

2. **Write MCP http-server and protocol-server tests** - The primary public API surface (2,078 lines combined) has no tests. Focus on request lifecycle, error responses, connection management, and protocol compliance.

3. **Write claim-verifier tests** - The quality gate that verifies agent work (2,190 lines) is completely untested. Prioritize file-verifier and test-verifier as they verify the most critical claims.

### Short-Term Actions (This Sprint)

4. **Write strange-loop self-healing tests** - Automated recovery without tests is dangerous. Focus on healing-controller decision logic and topology-analyzer correctness.

5. **Write learning persistence tests** - The learning subsystem stores patterns that affect future QE quality. SQLite persistence and pattern-lifecycle need tests to ensure data integrity.

6. **Write domain service tests for coverage-analysis and test-execution** - These are the core QE value proposition domains. The gap-detector and risk-scorer especially need testing (meta: testing the testers).

### Medium-Term Actions (Next Sprint)

7. **CLI command test coverage** - 14 commands represent the primary user interface. Start with `learning` (1,726 lines) and `hooks` (1,042 lines) as the most complex.

8. **Enterprise integration service tests** - 4,545 lines of untested integration code. If enterprise customers are a target, these need coverage.

9. **RL algorithm unit tests** - Mathematical correctness of 8 RL algorithms is not verified. Write property-based tests for convergence guarantees.

### Architectural Recommendations

10. **Establish test-to-source naming convention** - Many test directories do not mirror source directories exactly, making gap analysis harder. Standardize the mapping.

11. **Add coverage gates to CI** - Require new PRs to include tests for any new source files. Current lack of enforcement has allowed gaps to grow.

12. **Create test templates** - For domains with consistent patterns (domain coordinators, plugins, services), create test templates to reduce effort for Priority 3 items.

---

*Report generated by QE Coverage Gap Analyzer on 2026-02-11*
*Source: /workspaces/agentic-qe-new/v3/src/ (939 files)*
*Tests: /workspaces/agentic-qe-new/v3/tests/ (517 test files)*
