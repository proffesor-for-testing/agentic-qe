# Agentic QE v3 - Architecture Decision Records

**Project:** Agentic QE v3 Reimagining
**Date Range:** 2026-01-07 onwards
**Status:** Implementation In Progress
**Decision Authority:** Architecture Team
**Last Verified:** 2026-01-09

---

## ADR Index

| ADR | Title | Status | Date | Implementation |
|-----|-------|--------|------|----------------|
| ADR-001 | Adopt DDD for QE Bounded Contexts | **Accepted** | 2026-01-07 | ✅ 12/12 domains |
| ADR-002 | Event-Driven Domain Communication | **Accepted** | 2026-01-07 | ✅ EventBus + Router |
| ADR-003 | Sublinear Algorithms for Coverage Analysis | Proposed | 2026-01-07 | ⏳ HNSW referenced |
| ADR-004 | Plugin Architecture for QE Extensions | **Accepted** | 2026-01-07 | ✅ 12 plugins |
| ADR-005 | AI-First Test Generation | Proposed | 2026-01-07 | ⏳ Stubs present |
| ADR-006 | Unified Learning System | Proposed | 2026-01-07 | ⏳ Domain exists |
| ADR-007 | Quality Gate Decision Engine | Proposed | 2026-01-07 | ⏳ Basic gates |
| ADR-008 | Multi-Agent Hierarchical Coordination | **Accepted** | 2026-01-07 | ✅ Queen + protocols |
| ADR-009 | AgentDB as Primary Memory Backend | **Accepted** | 2026-01-07 | ✅ Backend exists |
| ADR-010 | MCP-First Tool Design | Proposed | 2026-01-07 | ⏳ CLI only |
| ADR-011 | LLM Provider System for QE | Proposed | 2026-01-07 | ❌ Not started |
| ADR-012 | MCP Security Features for QE | Proposed | 2026-01-07 | ❌ Not started |
| ADR-013 | Core Security Module for QE | Proposed | 2026-01-07 | ⏳ Partial |
| ADR-014 | Background Workers for QE Monitoring | Proposed | 2026-01-07 | ❌ Not started |
| ADR-015 | Unified Plugin System for QE Extensions | Proposed | 2026-01-07 | ⏳ Basic loader |
| ADR-016 | Collaborative Test Task Claims | Proposed | 2026-01-07 | ❌ Not started |
| ADR-017 | RuVector Integration for QE Intelligence | Proposed | 2026-01-07 | ❌ Not started |
| ADR-018 | Expanded 12-Domain Architecture | **Accepted** | 2026-01-07 | ✅ All 12 domains |
| ADR-019 | Phase 1-3 Foundation Implementation | **Accepted** | 2026-01-07 | ✅ 1171 tests |
| ADR-020 | Stub Implementation Replacement | **In Progress** | 2026-01-07 | ⏳ 18 stubs remain |

---

## ADR-001: Adopt DDD for QE Bounded Contexts

**Status:** Accepted
**Date:** 2026-01-07
**Decision Makers:** Architecture Team
**Context Owner:** Lead Architect

### Context

Current Agentic QE v2.x implements quality engineering as monolithic services in `src/mcp/tools/` and `src/core/agents/`. This creates:
- Tight coupling between test generation and execution
- Difficulty in scaling individual QE capabilities
- Complex testing due to interdependencies
- Limited ability to evolve domains independently

**Current State:**
- All MCP tools in single directory (40+ tools)
- Agents mixed with different responsibilities
- Memory implementations scattered
- No clear domain boundaries

**Analysis:**
```
Current Structure:
├── src/mcp/tools/       # 40+ MCP tool implementations
├── src/core/agents/     # Mixed agent responsibilities
├── src/core/memory/     # Multiple memory implementations
└── High coupling, difficult to test

v3 Target Structure:
├── src/domains/
│   ├── test-generation/       # Bounded Context 1
│   ├── test-execution/        # Bounded Context 2
│   ├── coverage-analysis/     # Bounded Context 3
│   ├── quality-assessment/    # Bounded Context 4
│   ├── defect-intelligence/   # Bounded Context 5
│   └── learning-optimization/ # Bounded Context 6
└── Clear boundaries, independent evolution
```

### Decision

**We will restructure Agentic QE v3 using Domain-Driven Design with 12 bounded contexts (expanded per ADR-018) focused on quality engineering capabilities.**

> **Note:** Original proposal was 6 domains. Per ADR-018, expanded to 12 domains to ensure feature parity with v2.

Bounded Contexts:
1. **Test Generation** - AI-powered test creation, pattern learning
2. **Test Execution** - Parallel execution, retry, flaky detection
3. **Coverage Analysis** - Sublinear gap detection, risk scoring
4. **Quality Assessment** - Quality gates, deployment decisions
5. **Defect Intelligence** - Prediction, root cause, pattern learning
6. **Requirements Validation** - BDD, testability scoring (per ADR-018)
7. **Code Intelligence** - Knowledge Graph, semantic search (per ADR-018)
8. **Security Compliance** - SAST/DAST, compliance (per ADR-018)
9. **Contract Testing** - API contracts, GraphQL (per ADR-018)
10. **Visual Accessibility** - Visual regression, a11y (per ADR-018)
11. **Chaos Resilience** - Chaos engineering, load testing (per ADR-018)
12. **Learning Optimization** - Cross-domain learning, transfer

### Rationale

**Pros:**
- Independent evolution of QE capabilities
- Clearer testing boundaries
- Team specialization possible
- Better scalability per domain
- Aligned with QE workflow stages

**Cons:**
- Migration effort from v2
- Cross-domain coordination complexity
- Learning curve for DDD concepts

**Alternatives Considered:**

1. **Status Quo (Keep Flat Structure)**
   - Rejected: Scaling issues, tight coupling

2. **Layer-Based Architecture**
   - Rejected: Doesn't align with QE workflow stages

3. **Feature-Based Modules**
   - Rejected: Less clear boundaries than DDD

### Implementation Plan

**Phase 1: Foundation (Week 1-2)**
- Define domain interfaces
- Create shared kernel
- Set up event bus

**Phase 2: Core Domains (Week 3-6)**
- Extract test-generation domain
- Extract test-execution domain
- Extract coverage-analysis domain

**Phase 3: Supporting Domains (Week 7-10)**
- Extract quality-assessment domain
- Extract defect-intelligence domain
- Extract learning-optimization domain

### Success Metrics

- [x] 12 clearly defined bounded contexts (expanded per ADR-018)
- [x] No circular dependencies between domains (verified 2026-01-09)
- [x] Each domain testable in isolation (1171 tests passing)
- [x] Domain events for cross-domain communication
- [ ] <300 lines per domain service (FAILED: some services exceed 1500 lines)

> **Implementation Note (2026-01-09):** All 12 domains implemented with coordinators, services, and plugins. However, some service files exceed the 300-line target (e.g., `security-auditor.ts` at 1715 lines, `test-generator.ts` at 1881 lines). Consider splitting in Phase 4.

---

## ADR-002: Event-Driven Domain Communication

**Status:** Accepted
**Date:** 2026-01-07

### Context

With DDD bounded contexts, we need a communication mechanism that maintains loose coupling while enabling reactive workflows (e.g., automatically generate tests when coverage gaps detected).

### Decision

**Use domain events for all cross-domain communication, enabling reactive QE workflows.**

Key Events:
- `TestCaseGeneratedEvent` - Triggers coverage analysis
- `CoverageGapDetectedEvent` - Triggers test generation
- `TestRunCompletedEvent` - Triggers quality gate evaluation
- `QualityGateEvaluatedEvent` - Triggers deployment decisions
- `DefectPredictedEvent` - Triggers targeted testing

### Implementation

```typescript
// Event Bus Interface
interface IDomainEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent>(
    eventType: new (...args: any[]) => T,
    handler: (event: T) => Promise<void>
  ): void;
}

// Event Handler Example
@EventHandler(CoverageGapDetectedEvent)
class AutoTestGenerationHandler {
  async handle(event: CoverageGapDetectedEvent): Promise<void> {
    if (event.riskScore > 0.7) {
      await this.testGenerator.generateForGap(event);
    }
  }
}
```

### Success Metrics

- [x] All cross-domain communication via events (CrossDomainEventRouter implemented)
- [x] Event handlers are idempotent (event correlation IDs)
- [ ] Event replay for debugging (not yet implemented)
- [x] <100ms event propagation latency (in-memory bus)

> **Implementation Note (2026-01-09):** CrossDomainEventRouter with 7 coordination protocols (morning-sync, quality-gate, regression-prevention, coverage-driven, tdd-cycle, security-audit, learning-consolidation). Event replay deferred to Phase 4.

---

## ADR-003: Sublinear Algorithms for Coverage Analysis

**Status:** Proposed
**Date:** 2026-01-07

### Context

Coverage analysis in large codebases (100k+ files) using linear O(n) algorithms is too slow for real-time feedback. We need O(log n) algorithms for interactive analysis.

### Decision

**Implement O(log n) coverage analysis using HNSW vector indexing via AgentDB.**

### Implementation

```typescript
// Sublinear Coverage Analyzer
class SublinearCoverageAnalyzer {
  private coverageIndex: HNSWIndex;  // O(log n) search

  async findGaps(query: CoverageQuery): Promise<CoverageGap[]> {
    // 1. Embed query context
    const embedding = await this.embedder.embed(query);

    // 2. HNSW search - O(log n)
    const similar = await this.coverageIndex.search(embedding, { k: 10 });

    // 3. Filter for coverage gaps
    return similar.filter(f => f.coverage < query.threshold);
  }
}
```

### Performance Targets

| Codebase Size | Traditional O(n) | v3 O(log n) | Improvement |
|---------------|-----------------|-------------|-------------|
| 1,000 files   | 1,000 ops       | 10 ops      | 100x        |
| 10,000 files  | 10,000 ops      | 13 ops      | 770x        |
| 100,000 files | 100,000 ops     | 17 ops      | 5,900x      |

### Success Metrics

- [ ] <100ms gap detection on 100k files
- [ ] HNSW index with 1M+ vectors
- [ ] Real-time coverage updates
- [ ] >90% accuracy vs linear analysis

---

## ADR-004: Plugin Architecture for QE Extensions

**Status:** Accepted
**Date:** 2026-01-07

### Context

Agentic QE has specialized testing capabilities (n8n workflows, visual regression, performance) that not all users need. Core should be lean, with extensions as plugins.

### Decision

**Implement microkernel architecture with plugin system for optional QE capabilities.**

**Core (Always Loaded):**
- Test generation (basic)
- Test execution
- Coverage analysis
- Quality gates

**Plugins (Optional):**
- n8n Workflow Testing Plugin
- Visual Regression Plugin
- Performance Testing Plugin
- Security Scanning Plugin
- Accessibility Testing Plugin
- API Contract Testing Plugin

### Plugin Interface

```typescript
interface QEPlugin {
  name: string;
  version: string;
  dependencies: string[];

  initialize(kernel: QEKernel): Promise<void>;
  shutdown(): Promise<void>;

  registerAgents?(): AgentDefinition[];
  registerMCPTools?(): MCPTool[];
  registerDomainServices?(): ServiceDefinition[];
}
```

### Success Metrics

- [ ] Core <50MB (vs 100MB+ with all features)
- [ ] Plugin loading <200ms
- [ ] 6+ official plugins
- [ ] Plugin development guide

---

## ADR-005: AI-First Test Generation

**Status:** Proposed
**Date:** 2026-01-07

### Context

Traditional test generation relies on templates and heuristics. AI models (Claude, GPT) can generate higher-quality, context-aware tests.

### Decision

**Make AI-powered test generation the primary method, with template-based as fallback.**

### Implementation

```typescript
class AITestGenerationService {
  async generate(request: GenerateTestsRequest): Promise<TestCase[]> {
    // 1. Analyze source code
    const analysis = await this.analyzeSource(request.sourceFile);

    // 2. Retrieve learned patterns
    const patterns = await this.patternRepo.findByContext(request);

    // 3. Identify coverage gaps
    const gaps = await this.coverageAnalyzer.findGaps(request.sourceFile);

    // 4. Generate via AI
    const tests = await this.aiClient.generate(
      this.buildPrompt(analysis, patterns, gaps)
    );

    // 5. Store successful patterns
    await this.storePatterns(tests);

    return tests;
  }
}
```

### Success Metrics

- [ ] >80% of generated tests are valid
- [ ] AI tests improve coverage by 20%+
- [ ] <30 seconds per test suite generation
- [ ] Pattern learning improves quality over time

---

## ADR-006: Unified Learning System

**Status:** Proposed
**Date:** 2026-01-07

### Context

QE agents learn independently without sharing knowledge. Cross-agent and cross-project learning could significantly improve quality.

### Decision

**Implement unified learning system with pattern storage, cross-agent sharing, and transfer learning.**

### Components

1. **Pattern Storage** - Successful patterns indexed in AgentDB
2. **Cross-Agent Sharing** - Patterns shared via learning coordinator
3. **Transfer Learning** - Patterns transferred across projects
4. **Continuous Improvement** - Feedback loop for pattern refinement

### Success Metrics

- [ ] 1000+ learned patterns per project
- [ ] 15% improvement per sprint cycle
- [ ] Cross-project transfer working
- [ ] Pattern quality scoring

---

## ADR-007: Quality Gate Decision Engine

**Status:** Proposed
**Date:** 2026-01-07

### Context

Quality gates are currently simple threshold checks. Need intelligent decision engine that considers trends, risk, and context.

### Decision

**Implement intelligent quality gate engine with ML-based risk assessment.**

### Gate Evaluation

```typescript
class QualityGateEngine {
  async evaluate(context: GateContext): Promise<GateDecision> {
    const [
      coverage,
      testResults,
      riskScore,
      trends,
      defectPrediction
    ] = await Promise.all([
      this.getCoverage(context),
      this.getTestResults(context),
      this.calculateRisk(context),
      this.analyzeTrends(context),
      this.predictDefects(context)
    ]);

    // ML-based decision
    const decision = await this.decisionModel.predict({
      coverage,
      testResults,
      riskScore,
      trends,
      defectPrediction
    });

    return decision;
  }
}
```

### Success Metrics

- [ ] >95% accuracy in gate decisions
- [ ] <5% false positives (blocking good releases)
- [ ] <1% false negatives (allowing bad releases)
- [ ] Trend analysis integrated

---

## ADR-008: Multi-Agent Hierarchical Coordination

**Status:** Accepted
**Date:** 2026-01-07

### Context

Current agents operate independently. Need hierarchical coordination for complex QE workflows.

### Decision

**Implement hierarchical multi-agent coordination with Queen Coordinator pattern.**

### Agent Hierarchy

```
                Queen Coordinator
                      |
    +--------+--------+--------+--------+
    |        |        |        |        |
   Test    Quality  Coverage  Learning  Execution
   Gen      Gates   Analysis  Coord     Coord
   |        |        |        |         |
  2-5      6-8      9-11     12-14     15-17
agents   agents   agents    agents    agents
```

### Success Metrics

- [ ] >85% agent utilization
- [ ] <5 minute end-to-end QE workflow
- [ ] Coordination overhead <10%
- [ ] Automatic work distribution

---

## ADR-009: AgentDB as Primary Memory Backend

**Status:** Accepted
**Date:** 2026-01-07

### Context

Multiple memory implementations exist. Need single, optimized backend with vector search and pattern learning.

### Decision

**Use AgentDB with HNSW indexing as primary memory backend for all QE domains.**

### Benefits

- 150x-12,500x faster search via HNSW
- Vector embeddings for semantic search
- Built-in RL algorithms
- Cross-agent memory sharing

### Success Metrics

- [ ] <10ms vector search
- [ ] 1M+ patterns indexed
- [ ] Seamless cross-domain access
- [ ] Memory usage <500MB

---

## ADR-010: MCP-First Tool Design

**Status:** Proposed
**Date:** 2026-01-07

### Context

QE functionality should be accessible via multiple interfaces (CLI, API, programmatic). MCP provides standard interface.

### Decision

**All QE functionality exposed as MCP tools first, with CLI as wrapper.**

### Implementation

```typescript
// MCP Tool (primary)
const generateTestsTool: MCPTool = {
  name: 'qe/tests/generate',
  handler: async (input, context) => {
    return context.testGenerator.generate(input);
  }
};

// CLI Command (wrapper)
class GenerateCommand {
  async execute(args: Args): Promise<void> {
    const result = await mcpClient.callTool('qe/tests/generate', args);
    console.log(result);
  }
}
```

### Success Metrics

- [ ] 100% MCP coverage
- [ ] CLI adds <10% code
- [ ] Consistent API across interfaces
- [ ] Auto-generated documentation

---

## Decision Framework

For future ADRs, use this template:

### ADR-XXX: [Title]

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD

#### Context
What is the issue we're trying to solve?

#### Decision
What are we going to do?

#### Rationale
Why this decision? What alternatives did we consider?

#### Consequences
What are the trade-offs?

#### Implementation
How will we do this?

#### Success Metrics
How do we know it worked?

---

## ADR-011: LLM Provider System for QE

**Status:** Proposed
**Date:** 2026-01-07

### Context

Test generation requires multiple LLM providers for different scenarios:
- Claude for complex reasoning and test design
- GPT-4 for alternative test perspectives
- Local models (Ollama) for fast iteration and cost control
- Cost tracking for test generation budget management

### Decision

**Implement unified LLM provider system with cost tracking, failover, and circuit breaker.**

Key Components:
- Provider Manager with round-robin/cost-based load balancing
- Circuit breaker for cascading failure prevention
- Cost tracking per test generation request
- LRU caching for repeated test generation patterns

Provider Priority:
1. Claude (primary) - Complex test generation
2. GPT-4 (secondary) - Alternative test perspectives
3. Ollama (local) - Fast iteration, unlimited runs

### Success Metrics

- [ ] 3+ LLM providers supported
- [ ] Cost tracking with budget alerts
- [ ] Circuit breaker prevents cascading failures
- [ ] <50ms overhead for provider selection

---

## ADR-012: MCP Security Features for QE

**Status:** Proposed
**Date:** 2026-01-07

### Context

QE MCP tools handle sensitive operations: test execution, code analysis, credential management for integration tests. Need security hardening.

### Decision

**Implement security features following claude-flow v3 patterns.**

Security Features:
- **JSON Schema Validation** - Validate all MCP tool inputs
- **Rate Limiting** - Token bucket (100 req/s, 200 burst)
- **OAuth 2.1 + PKCE** - Enterprise authentication
- **Sampling** - Server-initiated LLM for AI-driven test decisions

CVE Prevention:
- Path traversal protection
- ReDoS prevention with regex escaping
- Timing-safe authentication comparison

### Success Metrics

- [ ] All MCP tools have input schema validation
- [ ] Rate limiting prevents abuse
- [ ] OAuth 2.1 for enterprise deployments
- [ ] Zero critical CVEs

---

## ADR-013: Core Security Module for QE

**Status:** Proposed
**Date:** 2026-01-07

### Context

QE executes tests with potentially dangerous operations: file access, command execution, credential handling for integration tests.

### Decision

**Create `@agentic-qe/security` package with defense-in-depth.**

Components:
1. **Safe Executor** - No shell interpretation, command allowlist
2. **Path Validator** - Traversal prevention, jail directories
3. **Credential Manager** - Secure storage for integration test credentials
4. **Input Sanitizer** - XSS, injection prevention

```typescript
const security = createSecurityModule({
  projectRoot: process.cwd(),
  allowedCommands: ['npm', 'jest', 'vitest', 'playwright'],
  allowedPaths: ['src/', 'tests/', 'coverage/']
});

// Safe test execution
await security.safeExecutor.execute('jest', ['--coverage']);
```

### Success Metrics

- [ ] No command injection vulnerabilities
- [ ] Path traversal blocked
- [ ] Credentials encrypted at rest
- [ ] 400+ security tests passing

---

## ADR-014: Background Workers for QE Monitoring

**Status:** Proposed
**Date:** 2026-01-07

### Context

QE needs continuous monitoring: test health, coverage trends, flaky test detection, security scanning. Claude-flow v3 has 12 background workers.

### Decision

**Implement QE-specific background worker system with daemon support.**

QE Workers (10 total):

| Worker | Interval | Description |
|--------|----------|-------------|
| test-health | 5 min | Monitor test suite health |
| coverage-tracker | 10 min | Track coverage trends |
| flaky-detector | 15 min | Detect flaky test patterns |
| security-scan | 30 min | Security vulnerability scanning |
| quality-gate | 5 min | Continuous gate evaluation |
| learning-consolidation | 30 min | Pattern consolidation |
| defect-predictor | 15 min | ML defect prediction |
| regression-monitor | 10 min | Watch for regressions |
| performance-baseline | 1 hour | Performance trend tracking |
| compliance-checker | 30 min | ADR/DDD compliance |

Session Integration:
```bash
# Auto-start on session begin
aqe daemon start --workers test-health,coverage-tracker,flaky-detector

# Check worker status
aqe daemon status
```

### Success Metrics

- [ ] 10 QE workers implemented
- [ ] Daemon survives session restarts
- [ ] Historical metrics stored (30 days)
- [ ] <500ms worker execution time

---

## ADR-015: Unified Plugin System for QE Extensions

**Status:** Proposed
**Date:** 2026-01-07

### Context

QE has optional capabilities (n8n testing, visual regression, performance testing) that not all users need. Following ADR-004, we need a formal plugin SDK.

### Decision

**Implement plugin SDK with builder pattern following claude-flow v3.**

Plugin Types:
1. **n8n Workflow Testing Plugin**
2. **Visual Regression Plugin**
3. **Performance Testing Plugin**
4. **API Contract Testing Plugin**
5. **Accessibility Testing Plugin**
6. **Security Scanning Plugin**

Builder Pattern:
```typescript
const visualPlugin = new QEPluginBuilder('visual-regression', '1.0.0')
  .withDescription('Visual regression testing with AI')
  .withMCPTools([screenshotTool, compareTool, baselinesTool])
  .withAgents(['visual-tester', 'accessibility-checker'])
  .withWorkers([baselineWorker, regressionWorker])
  .build();

await registry.register(visualPlugin);
```

### Success Metrics

- [ ] Plugin SDK published
- [ ] 6+ official QE plugins
- [ ] <50ms plugin load time
- [ ] Plugin development guide

---

## ADR-016: Collaborative Test Task Claims

**Status:** Proposed
**Date:** 2026-01-07

### Context

Multiple QE agents and humans work on test coverage. Need claim system to prevent duplicate work and enable handoffs.

### Decision

**Implement collaborative claim system for test tasks following claude-flow v3 patterns.**

Claim Types:
- Coverage gaps (uncovered code → agent claims to write tests)
- Flaky tests (detected → agent claims to fix)
- Defect investigations (predicted defect → agent claims to analyze)
- Test reviews (generated tests → human claims to review)

Work Stealing:
```typescript
// Agent B steals stale test gap claim
const stealable = await claimService.getStealable('test-generation');
if (stealable.length > 0) {
  await claimService.steal(stealable[0].gapId, agentB);
}
```

Handoff Patterns:
1. Test Generator → Test Reviewer (human reviews AI tests)
2. Coverage Analyzer → Test Generator (gaps trigger generation)
3. Flaky Detector → Flaky Hunter (detection triggers investigation)

### Success Metrics

- [ ] Claim service for test tasks
- [ ] Work stealing for idle agents
- [ ] Human ↔ Agent handoffs working
- [ ] >90% QE agent utilization

---

## ADR-017: RuVector Integration for QE Intelligence

**Status:** Proposed
**Date:** 2026-01-07

### Context

RuVector provides ML-based code intelligence that enhances QE:
- Q-Learning agent routing (80%+ accuracy)
- AST complexity for test prioritization
- Diff risk classification for targeted testing
- Graph analysis for module boundary testing

### Decision

**Integrate RuVector as OPTIONAL dependency with graceful fallback.**

Integration Points:

| RuVector Feature | QE Application |
|------------------|----------------|
| Q-Learning Router | Route test tasks to optimal agents |
| AST Complexity | Prioritize tests by code complexity |
| Diff Risk Classification | Target tests at high-risk changes |
| Coverage Routing | Test coverage-aware agent selection |
| Graph Boundaries | Focus integration tests at module boundaries |

CLI Commands:
```bash
# Route test task with Q-Learning
aqe route --task "Test user authentication" --q-learning

# Analyze code for test prioritization
aqe analyze complexity --path src/auth/

# Classify PR risk for targeted testing
aqe analyze diff --risk
```

Fallback: When RuVector not installed, fall back to rule-based routing.

### Success Metrics

- [ ] RuVector optional dependency configured
- [ ] Q-Learning routing >80% accuracy
- [ ] AST complexity analysis integrated
- [ ] Graceful fallback when unavailable

---

## ADR-018: Expanded 12-Domain Architecture

**Status:** Accepted
**Date:** 2026-01-07

### Context

Initial v3 architecture (ADR-001) proposed 6 bounded contexts with 21 agents. Analysis of v2 capabilities revealed critical gaps:

**Missing Capabilities from v2:**
- Code Intelligence (Knowledge Graph) - `qe-code-intelligence`
- Requirements Validation - `qe-requirements-validator`
- Regression Risk Analysis - `qe-regression-risk-analyzer`
- API Contract Testing - `qe-api-contract-validator`
- Visual Testing - `qe-visual-tester`
- Accessibility Testing - `qe-a11y-ally`
- Chaos Engineering - `qe-chaos-engineer`
- Production Intelligence - `qe-production-intelligence`

**Comparison with claude-flow v3:**
- claude-flow: 60+ agent types, 26 core commands, 140+ subcommands
- Initial AQE v3: 21 agents, 6 domains - insufficient

### Decision

**Expand from 6 domains/21 agents to 12 domains/47 agents to ensure complete v2 migration and feature parity with enterprise needs.**

**12 Bounded Contexts:**

| # | Domain | Agents | Key Capabilities |
|---|--------|--------|------------------|
| 1 | test-generation | 5 | AI test creation, TDD, data generation |
| 2 | test-execution | 4 | Parallel execution, flaky detection |
| 3 | coverage-analysis | 4 | O(log n) gaps, mutation testing |
| 4 | quality-assessment | 4 | Quality gates, deployment readiness |
| 5 | defect-intelligence | 4 | Prediction, regression risk |
| 6 | **requirements-validation** | 4 | BDD, testability scoring (NEW) |
| 7 | **code-intelligence** | 4 | Knowledge Graph, semantic search (NEW) |
| 8 | **security-compliance** | 4 | SAST/DAST, compliance (EXPANDED) |
| 9 | **contract-testing** | 4 | API contracts, GraphQL (NEW) |
| 10 | **visual-accessibility** | 4 | Visual regression, a11y (NEW) |
| 11 | **chaos-resilience** | 4 | Chaos engineering, load testing (NEW) |
| 12 | learning-optimization | 5 | Pattern learning, knowledge transfer |

**Agent Breakdown:**
- 1 Queen Coordinator
- 46 Domain Agents (across 12 domains)
- 7 Subagents (task-specific workers)
- 2 Specialized (cross-domain: QX Partner, Fleet Commander)
- **Total: 56 agents**

### Migration Map (v2 → v3)

```
v2 Agent                    → v3 Agent                     Domain
─────────────────────────────────────────────────────────────────
qe-code-intelligence       → v3-qe-code-intelligence       code-intelligence
qe-requirements-validator  → v3-qe-requirements-validator  requirements-validation
qe-regression-risk-analyzer→ v3-qe-regression-analyzer     defect-intelligence
qe-api-contract-validator  → v3-qe-contract-validator      contract-testing
qe-visual-tester          → v3-qe-visual-tester           visual-accessibility
qe-a11y-ally              → v3-qe-a11y-specialist         visual-accessibility
qe-chaos-engineer         → v3-qe-chaos-engineer          chaos-resilience
qe-security-scanner       → v3-qe-security-scanner        security-compliance
qe-performance-tester     → v3-qe-performance-profiler    chaos-resilience
qe-production-intelligence→ v3-qe-production-intel        learning-optimization
qe-code-complexity        → v3-qe-code-complexity         quality-assessment
qe-test-data-architect    → v3-qe-test-data-architect     test-generation
qx-partner                → v3-qe-qx-partner              specialized
qe-fleet-commander        → v3-qe-fleet-commander         specialized
```

### New Coordination Protocols

```yaml
protocols:
  code-intelligence-index:
    description: "Knowledge graph indexing"
    participants: [v3-qe-code-intelligence, v3-qe-semantic-analyzer]
    triggers: [code-change, hourly, "aqe kg index"]

  security-audit:
    description: "Security and compliance audit"
    participants: [v3-qe-security-scanner, v3-qe-compliance-validator]
    triggers: [daily-2am, dependency-update, "aqe security audit"]

  requirements-validation:
    description: "Pre-development requirements analysis"
    participants: [v3-qe-requirements-validator, v3-qe-bdd-scenario-writer]
    triggers: [user-story-created, sprint-planning]
```

### Rationale

**Pros:**
- Complete v2 feature migration
- Addresses user feedback about missing agents
- Knowledge Graph crucial for intelligent test targeting
- Requirements validation enables shift-left testing
- Visual/a11y testing for modern web applications
- Chaos engineering for distributed systems

**Cons:**
- More complex coordination (47 vs 21 agents)
- Longer migration timeline
- Higher resource requirements

**Mitigation:**
- Hierarchical coordination (Queen + 6 group leaders)
- Max 15 concurrent agents (per claude-flow v3)
- Lazy loading of domains (only activate when needed)

### Configuration

```yaml
# .agentic-qe/config.yaml
v3:
  domains: 12
  maxConcurrentAgents: 15
  lazyLoading: true
  memoryBackend: hybrid
  hnswEnabled: true
  backgroundWorkers: 12
  hooks: 17
```

### Success Metrics

- [ ] All 22 v2 QE agents migrated to v3
- [ ] 12 domains implemented
- [ ] Knowledge Graph operational with O(log n) search
- [ ] Requirements validation integrated with CI/CD
- [ ] Visual/a11y testing automated
- [ ] <15 concurrent agents during peak load

---

---

## ADR-019: Phase 1 Foundation Implementation

**Status:** Accepted
**Date:** 2026-01-07
**Decision Makers:** Architecture Team

### Context

Phase 1 of AQE v3 implementation requires establishing the foundational architecture before domain-specific work can begin. This ADR tracks the implementation progress of Phase 1 Foundation (Weeks 1-4 per Master Plan).

### Decision

**Implement Phase 1 Foundation with the following components:**

### Implementation Progress

#### ✅ Completed Tasks

| Task | Status | Date | Details |
|------|--------|------|---------|
| Directory structure for 12 domains | ✅ Complete | 2026-01-07 | All domain directories created |
| Shared kernel types | ✅ Complete | 2026-01-07 | `src/shared/types/index.ts` |
| Value objects | ✅ Complete | 2026-01-07 | FilePath, Coverage, RiskScore, TimeRange, Version |
| Domain entities | ✅ Complete | 2026-01-07 | Agent, TestCase, TestSuite with AggregateRoot |
| Domain events | ✅ Complete | 2026-01-07 | 15 core domain events defined |
| Event bus | ✅ Complete | 2026-01-07 | InMemoryEventBus with pub/sub |
| Agent coordinator | ✅ Complete | 2026-01-07 | Max 15 concurrent agents enforced |
| Plugin loader | ✅ Complete | 2026-01-07 | Lazy loading with dependency resolution |
| Memory backend | ✅ Complete | 2026-01-07 | In-memory store with vector search |
| QE Kernel | ✅ Complete | 2026-01-07 | QEKernelImpl microkernel |
| Domain interfaces (12/12) | ✅ Complete | 2026-01-07 | All 12 domains defined |
| Foundation tests | ✅ Complete | 2026-01-07 | Event bus, coordinator, value objects |
| Build configuration | ✅ Complete | 2026-01-07 | package.json, tsconfig.json, vitest.config.ts |

#### Domain Interfaces Implemented

| # | Domain | File | Status |
|---|--------|------|--------|
| 1 | test-generation | `src/domains/test-generation/interfaces.ts` | ✅ |
| 2 | test-execution | `src/domains/test-execution/interfaces.ts` | ✅ |
| 3 | coverage-analysis | `src/domains/coverage-analysis/interfaces.ts` | ✅ |
| 4 | quality-assessment | `src/domains/quality-assessment/interfaces.ts` | ✅ |
| 5 | defect-intelligence | `src/domains/defect-intelligence/interfaces.ts` | ✅ |
| 6 | code-intelligence | `src/domains/code-intelligence/interfaces.ts` | ✅ |
| 7 | requirements-validation | `src/domains/requirements-validation/interfaces.ts` | ✅ |
| 8 | security-compliance | `src/domains/security-compliance/interfaces.ts` | ✅ |
| 9 | contract-testing | `src/domains/contract-testing/interfaces.ts` | ✅ |
| 10 | visual-accessibility | `src/domains/visual-accessibility/interfaces.ts` | ✅ |
| 11 | chaos-resilience | `src/domains/chaos-resilience/interfaces.ts` | ✅ |
| 12 | learning-optimization | `src/domains/learning-optimization/interfaces.ts` | ✅ |

### Key Architecture Decisions Made

1. **Max 15 Concurrent Agents**: Per claude-flow v3 spec, enforced in `agent-coordinator.ts`
2. **HNSW Indexing**: Prepared for O(log n) vector search in memory backend
3. **Event-Driven Communication**: All domains communicate via domain events
4. **Microkernel Pattern**: Core QEKernel with lazy-loaded domain plugins
5. **Value Objects**: Immutable value objects for domain concepts
6. **Result Type**: Functional error handling with `Result<T, E>`

### Files Created

```
v3/
├── package.json (v3.0.0-alpha.1)
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── shared/
│   │   ├── types/index.ts
│   │   ├── value-objects/index.ts
│   │   ├── entities/
│   │   │   ├── base.ts
│   │   │   ├── agent.ts
│   │   │   ├── test-case.ts
│   │   │   └── test-suite.ts
│   │   └── events/index.ts
│   ├── kernel/
│   │   ├── interfaces.ts
│   │   ├── event-bus.ts
│   │   ├── agent-coordinator.ts
│   │   ├── plugin-loader.ts
│   │   ├── memory-backend.ts
│   │   └── kernel.ts
│   └── domains/ (12 domains with interfaces.ts)
└── tests/
    └── unit/
        ├── kernel/
        │   ├── event-bus.test.ts
        │   └── agent-coordinator.test.ts
        └── shared/
            └── value-objects.test.ts
```

### Success Metrics

- [x] 12 domain directories created
- [x] Shared kernel implemented
- [x] All domain interfaces defined
- [x] QE Kernel operational
- [x] Event bus functional
- [x] Agent concurrency limit enforced (max 15)
- [x] Foundation tests written
- [x] All tests passing ✅
- [x] TypeScript compilation successful ✅

### Phase 2: Domain Services - **COMPLETE**

- 48 service files implemented across 12 domains
- Note: 18 stub implementations remain (to be replaced per ADR-020)

### Phase 3: Event Integration - **COMPLETE**

- CrossDomainEventRouter implemented
- 7 coordination protocols (morning-sync, quality-gate, regression-prevention, coverage-driven, tdd-cycle, security-audit, learning-consolidation)
- WorkflowOrchestrator with built-in workflows
- Queen Coordinator with hierarchical coordination

### Current Stats (2026-01-09)

| Metric | Count |
|--------|-------|
| Source Files | 166 |
| Test Files | 46 |
| Tests Passing | 1171 |
| Domains | 12 |
| Stubs Remaining | 18 |
| Shared Modules | 8 (embeddings, entities, events, git, http, io, parsers, security) |

### Next Steps (Phase 4)

1. Replace stub implementations with real functionality (per ADR-020)
2. Implement TypeScript Compiler API for AST parsing
3. Port Nomic embeddings from v2 for semantic analysis
4. Add real OWASP detection for security scanning
5. Implement OSV API for dependency vulnerability scanning

### Rationale

Phase 1 establishes the architectural foundation that all subsequent phases depend on. By completing the shared kernel, event bus, and domain interfaces first, we ensure:

- Consistent patterns across all 12 domains
- Type safety through comprehensive interfaces
- Testable foundation before adding complexity
- Clear boundaries for parallel development

---

## ADR-020: Stub Implementation Replacement

**Status:** In Progress
**Date:** 2026-01-07
**Updated:** 2026-01-09

### Context

Phase 2 domain services contain stub implementations across service files. These stubs simulate behavior rather than perform real operations.

### Decision

Replace stub implementations with real functionality:
1. TypeScript Compiler API for AST parsing
2. Nomic embeddings (ported from v2) for semantic analysis
3. Pattern-based OWASP detection for security scanning
4. Real HTTP clients for load testing
5. OSV API for dependency vulnerability scanning

### Progress (2026-01-09)

**Shared Modules Created:**
- [x] `src/shared/parsers/` - TypeScript parser utilities
- [x] `src/shared/io/` - File I/O abstractions
- [x] `src/shared/http/` - HTTP client utilities
- [x] `src/shared/embeddings/` - Nomic embedder integration
- [x] `src/shared/security/` - Security utilities
- [x] `src/shared/git/` - Git integration utilities
- [x] `src/shared/metrics/` - Metrics collection

**Stubs Remaining (18):**

| Domain | File | Stub Count |
|--------|------|------------|
| chaos-resilience | chaos-engineer.ts | 1 |
| code-intelligence | knowledge-graph.ts | 1 |
| test-generation | test-generator.ts | 3 |
| defect-intelligence | defect-predictor.ts | 1 |
| visual-accessibility | accessibility-tester.ts | 4 |
| Other domains | Various | 8 |

### Success Criteria

- [ ] 0 "// Stub:" comments remaining in production code (currently 18)
- [x] Real file I/O for code intelligence operations
- [ ] Real vulnerability detection against OWASP Top 10
- [x] Integration tests with actual I/O operations (42 integration tests)

---

**Document Maintained By:** Architecture Team
**Last Updated:** 2026-01-09
**Next Review:** After Phase 4 Sprint
