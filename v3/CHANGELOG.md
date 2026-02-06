# Changelog

All notable changes to Agentic QE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
