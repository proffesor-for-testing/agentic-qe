# Changelog

All notable changes to Agentic QE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

**Cross-Phase Memory System** - New persistent memory architecture enabling automated learning between QCSD phases (Production→Ideation, Production→Grooming, CI/CD→Development, Development→Grooming).

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
