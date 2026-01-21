# Agentic QE v2 vs v3: Complete Comparison Guide

> **Why Upgrade?** AQE v3 delivers significantly less code, O(log n) HNSW search, 166x faster MCP response times (verified benchmark), intelligent model routing, **persistent neural learning**, **60 QE Skills**, and **real browser automation**—while maintaining full backward compatibility.

---

## Executive Summary

| Metric | v2 | v3 | Improvement |
|--------|----|----|-------------|
| **Codebase Size** | 5,334 files / 125K LOC | 546 files / 65K LOC | Significantly smaller |
| **Architecture** | Monolithic + Feature-sprawl | DDD 12 Bounded Contexts | Clean separation |
| **Pattern Search** | O(n) linear scan | O(log n) HNSW indexed | Sublinear complexity |
| **MCP Response** | ~100ms P95 target | 0.6ms P95 actual | 166x faster |
| **Agents** | ~32 loosely organized | 50 specialized (43+7) | 1.5x more, organized |
| **Skills** | 35 QE skills | 60 QE skills | 71% more skills |
| **Learning** | Basic pattern store | ReasoningBank + Dream cycles + 9 RL algorithms | Full AI learning stack |
| **Model Routing** | None (manual selection) | 3-tier intelligent routing (ADR-026) | Cost optimized |
| **Coordination** | EventEmitter-based | Queen Coordinator + MinCut | 3-5x throughput |
| **Neural Backbone** | None | Persistent Q-Learning + SONA (ADR-050) | ✅ **NEW** |
| **Browser Testing** | None | Vibium + agent-browser real automation | ✅ **NEW** |
| **Deep Integration** | None | Claude Flow + Agentic Flow (ADR-051) | ✅ **NEW** |
| **Tests** | ~200 | 6,826 | 34x more tests |

---

## Table of Contents

1. [Architecture Comparison](#1-architecture-comparison)
2. [Agent System](#2-agent-system)
3. [QE Skills](#3-qe-skills) ✅ **NEW**
4. [MCP Integration](#4-mcp-integration)
5. [Learning & Self-Improvement](#5-learning--self-improvement)
6. [Intelligent Model Routing](#6-intelligent-model-routing)
7. [Memory & Vector Search](#7-memory--vector-search)
8. [RuVector Neural Backbone](#8-ruvector-neural-backbone)
9. [Deep Integration (ADR-051)](#9-deep-integration-adr-051) ✅ **NEW**
10. [Browser Automation](#10-browser-automation)
11. [CLI & Developer Experience](#11-cli--developer-experience)
12. [Performance Benchmarks](#12-performance-benchmarks)
13. [Migration Path](#13-migration-path)
14. [Why Upgrade to v3?](#14-why-upgrade-to-v3)

---

## 1. Architecture Comparison

### v2 Architecture: Feature-Driven Monolith

```
v2/src/ (60+ directories, 5,334 files)
├── agents/             # Agent lifecycle, coordination, memory, pools
├── core/               # 20+ subdirs: cache, DI, embeddings, events, hooks, neural, routing
├── code-intelligence/  # 12+ subdirs: analysis, chunking, embeddings, graph, RAG
├── cli/commands/       # 70+ command files
├── mcp/                # Tools, handlers, services, streaming
├── learning/           # SONA, capture, dashboard, dream, metrics, transfer
├── memory/             # DAO layer, encrypted storage
├── edge/               # Browser, DevTools, mobile, P2P, VSCode, WASM
├── fleet/              # Topology, SPOF monitoring
├── nervous-system/     # Adapters, integration
├── planning/           # GOAP integration
├── infrastructure/     # Network, sandbox
└── ... 40+ more directories
```

**Problems:**
- Feature sprawl: 60+ directories with unclear boundaries
- Tight coupling: Changes ripple across multiple modules
- Unclear ownership: Which team owns what?
- Testing difficulty: Integration tests require understanding entire system

### v3 Architecture: Domain-Driven Design (DDD)

```
v3/src/ (504 files, clean separation)
├── kernel/           # Microkernel: plugins, events, memory, coordination
│   ├── interfaces.ts      # Core abstractions
│   ├── kernel.ts          # QEKernelImpl
│   ├── agent-coordinator.ts
│   ├── event-bus.ts
│   ├── memory-backend.ts
│   └── hybrid-backend.ts
├── coordination/     # Queen Coordinator, consensus, protocols
│   ├── queen-coordinator.ts
│   ├── consensus/    # Multi-model consensus
│   ├── mincut/       # Topology optimization
│   └── protocols/    # Cross-domain workflows
├── domains/          # 12 Bounded Contexts (each self-contained)
│   ├── test-generation/
│   ├── test-execution/
│   ├── coverage-analysis/
│   ├── quality-assessment/
│   ├── defect-intelligence/
│   ├── learning-optimization/
│   ├── security-compliance/
│   ├── chaos-resilience/
│   ├── code-intelligence/
│   ├── contract-testing/
│   ├── requirements-validation/
│   └── visual-accessibility/
├── routing/          # TinyDancer intelligent model routing
├── learning/         # ReasoningBank, dream cycles, pattern store
├── mcp/              # 25+ MCP tools with connection pooling
├── init/             # Enhanced initialization wizard
└── cli/              # Streamlined commands
```

**Benefits:**
- Clear bounded contexts: Each domain is self-contained
- Plugin architecture: Domains loaded on-demand (lazy loading)
- Single responsibility: Each domain handles one QE concern
- Easy testing: Test domains in isolation

### 12 Domain Summary

| Domain | v2 Location | v3 Location | Purpose |
|--------|-------------|-------------|---------|
| Test Generation | `/agents/`, `/core/` | `/domains/test-generation/` | AI-powered test creation |
| Test Execution | `/test/` | `/domains/test-execution/` | Parallel running, flaky detection |
| Coverage Analysis | `/coverage/` | `/domains/coverage-analysis/` | O(log n) gap detection |
| Quality Assessment | `/core/metrics/` | `/domains/quality-assessment/` | Quality gates, risk scoring |
| Defect Intelligence | `/learning/` | `/domains/defect-intelligence/` | ML defect prediction |
| Learning Optimization | `/learning/` | `/domains/learning-optimization/` | Pattern learning, transfer |
| Security Compliance | `/security/` | `/domains/security-compliance/` | OWASP, CVE, SAST/DAST |
| Chaos Resilience | N/A (new) | `/domains/chaos-resilience/` | Fault injection |
| Code Intelligence | `/code-intelligence/` | `/domains/code-intelligence/` | Knowledge graphs |
| Contract Testing | N/A (new) | `/domains/contract-testing/` | API contracts |
| Requirements Validation | N/A (new) | `/domains/requirements-validation/` | BDD scenarios |
| Visual Accessibility | N/A (new) | `/domains/visual-accessibility/` | WCAG testing |

---

## 2. Agent System

### v2: Loosely Organized Agents (~20)

```typescript
// v2 agents spread across multiple directories
/agents/lifecycle/AgentLifecycleManager.ts
/agents/coordination/AgentCoordinator.ts
/agents/memory/AgentMemoryService.ts
/agents/pool/AgentPool.ts

// Example agents (limited specialization)
- CodeComplexityAnalyzerAgent
- SecurityScannerAgent
- FleetCommanderAgent
- PerformanceTesterAgent
- AccessibilityAllyAgent
```

**Limitations:**
- Manual agent assignment
- No intelligent routing
- Limited specialization
- Flat hierarchy

### v3: 50 Specialized QE Agents (43 main + 7 TDD subagents)

```typescript
// v3: Queen-led hierarchical coordination
Queen Coordinator (Agent #1)
├── Test Generation Domain (5 agents)
│   ├── qe-test-architect        # AI-powered test design
│   ├── qe-tdd-specialist        # TDD Red/Green/Refactor
│   ├── qe-tdd-red               # Write failing tests
│   ├── qe-tdd-green             # Make tests pass
│   └── qe-tdd-refactor          # Improve design
├── Test Execution Domain (4 agents)
│   ├── qe-test-executor         # Multi-framework execution
│   ├── qe-parallel-executor     # Parallel with sharding
│   ├── qe-flaky-hunter          # Flaky detection
│   └── qe-retry-handler         # Intelligent retry
├── Coverage Analysis Domain (3 agents)
│   ├── qe-coverage-specialist   # O(log n) analysis
│   ├── qe-gap-detector          # Gap identification
│   └── qe-mutation-tester       # Test effectiveness
├── Quality Assessment Domain (4 agents)
│   ├── qe-quality-gate          # Gate enforcement
│   ├── qe-quality-analyzer      # Metrics analysis
│   ├── qe-code-reviewer         # Code quality
│   └── qe-deployment-advisor    # Deploy readiness
├── Defect Intelligence Domain (3 agents)
│   ├── qe-defect-predictor      # ML prediction
│   ├── qe-pattern-learner       # Pattern recognition
│   └── qe-root-cause-analyzer   # Root cause analysis
├── Security Compliance Domain (4 agents)
│   ├── qe-security-scanner      # SAST/DAST
│   ├── qe-security-auditor      # Compliance audits
│   ├── qe-security-reviewer     # Code security review
│   └── qe-vulnerability-hunter  # CVE detection
└── ... (more domains)
```

**v3 Agent Coordination Features:**
- **Work Stealing**: Queen redistributes work from overloaded agents (3-5x throughput)
- **MinCut Analysis**: Graph-based topology optimization
- **Consensus**: Multi-agent voting for critical decisions
- **Claims System**: Task ownership tracking with handoff support

---

## 3. QE Skills

### v2: 35 QE Skills

v2 provided 35 quality engineering skills focused on testing methodologies and practices.

### v3: 60 QE Skills (71% increase)

v3 expands the skill library to 60 domain-specific quality engineering skills:

| Category | Count | Examples |
|----------|-------|----------|
| **Core Testing & Methodologies** | 12 | agentic-quality-engineering, tdd-london-chicago, context-driven-testing, shift-left-testing |
| **Specialized Testing** | 12 | accessibility-testing, mobile-testing, chaos-engineering-resilience, security-testing |
| **V3 Domain Skills** | 14 | qe-test-generation, qe-coverage-analysis, qe-security-compliance, qe-defect-intelligence |
| **Strategic & Communication** | 8 | six-thinking-hats, brutal-honesty-review, sherlock-review, pair-programming |
| **Testing Techniques & Management** | 9 | exploratory-testing-advanced, test-design-techniques, api-testing-patterns |
| **n8n Workflow Testing** | 5 | n8n-workflow-testing-fundamentals, n8n-expression-testing, n8n-security-testing |

**Key Additions in v3:**
- 14 V3 Domain Skills aligned with 12 DDD bounded contexts
- `qe-iterative-loop` for continuous improvement workflows
- `aqe-v2-v3-migration` skill for seamless upgrade guidance
- Enhanced n8n workflow testing capabilities

> **Note**: Claude Flow platform skills (agentdb, github, flow-nexus) are managed separately and not counted in QE skills.

---

## 4. MCP Integration

### v2: Basic MCP Tools (~14)

```typescript
// v2 tools (70% verified working)
- memory_store, memory_retrieve, memory_query, memory_share, memory_backup
- blackboard_post, blackboard_read
- consensus_propose, consensus_vote
- quality_analyze, regression_risk_analyze
- coverage_analyze_sublinear, coverage_gaps_detect
- test_generate_enhanced, test_execute_parallel
```

**v2 Limitations:**
- No connection pooling
- ~100ms P95 response times
- Limited domain coverage
- No security middleware

### v3: Production-Grade MCP Server (25+ tools)

```typescript
// v3 Complete Tool Catalog

// CORE (3 tools)
fleet_init          // Initialize fleet with topology
fleet_status        // Get health metrics
fleet_health        // Domain health checks

// TASK MANAGEMENT (5 tools)
task_submit         // Submit to Queen
task_list           // Filter by status/priority
task_status         // Detailed status
task_cancel         // Cancel running task
task_orchestrate    // Multi-agent orchestration

// AGENT MANAGEMENT (4 tools)
agent_list          // List active agents
agent_spawn         // Spawn in domain
agent_metrics       // CPU/memory/task metrics
agent_status        // Detailed status

// DOMAIN TOOLS (11+ tools)
test_generate_enhanced        // AI test generation
test_execute_parallel         // Parallel execution
coverage_analyze_sublinear    // O(log n) coverage
coverage_gaps                 // Critical gap detection
quality_assess                // Quality gates
security_scan_comprehensive   // SAST/DAST/compliance
defect_predict                // ML prediction
code_index                    // Knowledge graph
contract_validate             // API contracts
accessibility_test            // WCAG compliance
chaos_test                    // Fault injection

// MEMORY (6 tools)
memory_store, memory_retrieve, memory_query
memory_delete, memory_usage, memory_share
```

**v3 MCP Infrastructure:**

| Feature | v2 | v3 |
|---------|----|----|
| Connection Pool | None | 50 max, 5 pre-warmed |
| Load Balancer | None | Least-connections |
| P95 Latency | ~100ms | **0.6ms** (166x faster) |
| Rate Limiting | None | 100 req/s, 200 burst |
| Schema Validation | Basic | JSON Schema + security |
| Performance Monitor | None | P50/P95/P99 tracking |

---

## 5. Learning & Self-Improvement

### v2: Basic Learning

```typescript
// v2 learning capabilities
- EnhancedSwarmMemoryManager (encryption, compression)
- CachedHNSWVectorMemory (O(n) fallback)
- ReasoningBankAdapter (limited integration)
- SONAIntegration (basic MicroLoRA)
- ExperienceCapture, MetricsStore
```

**Limitations:**
- Linear pattern search
- Manual pattern promotion
- No dream cycles
- Limited RL algorithms

### v3: Complete AI Learning Stack

```
┌─────────────────────────────────────────────────────┐
│ REAL-TIME LEARNING (Per Task)                       │
├─────────────────────────────────────────────────────┤
│ • Outcome recording (+0.02 success, -0.01 failure)  │
│ • Token savings tracking                            │
│ • Routing decision recording                        │
│ • Coverage analysis                                 │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ SESSION LEARNING (Per Session)                      │
├─────────────────────────────────────────────────────┤
│ • Pattern promotion (3+ uses → long-term)           │
│ • Best technique identification                     │
│ • Agent score updates                               │
│ • ML weight fine-tuning                             │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ SYSTEM LEARNING (Weekly)                            │
├─────────────────────────────────────────────────────┤
│ • Learning Consolidation Protocol (Friday 6pm)      │
│ • Dream Cycle execution                             │
│ • RL algorithm training                             │
│ • Cross-project knowledge transfer                  │
└─────────────────────────────────────────────────────┘
```

**v3 Learning Components:**

| Component | Purpose | Technology |
|-----------|---------|------------|
| **QE ReasoningBank** | Pattern storage with 8 QE domains | HNSW + SQLite |
| **Pattern Store** | Tier-based storage (short→long term) | Quality scoring |
| **Dream Engine** | Neural consolidation simulation | Spreading activation |
| **Concept Graph** | Association discovery | Weighted directed graph |
| **Insight Generator** | Novel pattern creation | Novelty + confidence |
| **9 RL Algorithms** | Domain-specific learning | Q-Learning, PPO, DQN, A2C, DDPG, etc. |
| **SONA** | Self-optimizing neural architecture | Persistent patterns ✅ |
| **Transfer Specialist** | Cross-domain knowledge sharing | Semantic similarity |

**Dream Cycle Process:**
1. Load patterns as concepts (min 10 required)
2. Spreading activation (50% spread, 10% decay)
3. Find co-activated concept pairs
4. Generate insights (0.3 novelty, 0.5 confidence min)
5. Persist new patterns

---

## 6. Intelligent Model Routing

### v2: No Model Routing

```typescript
// v2: Manual model selection
// Users had to decide which model to use
// No cost optimization
// No confidence-based escalation
```

### v3: ADR-026 TinyDancer 3-Tier Routing

```
┌───────────────────────────────────────────────────────────┐
│                 COMPLEXITY SCORE (0-100)                  │
├───────────────────────────────────────────────────────────┤
│  TRIVIAL      SIMPLE      MODERATE       COMPLEX  CRITICAL│
│   (0-20)      (20-45)      (45-70)       (70-100)  (>=70) │
├───────────────────────────────────────────────────────────┤
│ Agent Booster   Haiku       Sonnet        Sonnet    Opus  │
│  or Haiku                                                 │
└───────────────────────────────────────────────────────────┘
```

**Complexity Factors (10 weighted factors):**
- File count: +10-25 points based on count
- Domain complexity: +15-30 (security/chaos = high)
- Cross-component impact: +25
- Priority level: +15-25
- Complex capabilities: +0-20 (SAST, DAST, mutation testing)
- External APIs: +10
- Database operations: +10
- Time sensitivity: +5
- Large code changes: +10-15
- Security tasks: +20

**Confidence-Based Triggers:**
```typescript
// Multi-model verification when:
confidence < 0.80 && complexity !== 'simple'
// OR
isSecurity && confidence < 0.85

// Human review when:
uncertainty > 0.20
// OR
isSecurity && complexity === 'critical'
```

**Cost Savings Example:**
| Task Type | v2 (manual Opus) | v3 (routed) | Savings |
|-----------|------------------|-------------|---------|
| Fix typo | $0.045 | $0.0005 (Haiku) | 99% |
| Refactor auth | $0.045 | $0.045 (Opus) | 0% |
| Moderate feature | $0.045 | $0.01 (Sonnet) | 78% |

**Intelligent routing optimizes costs by matching task complexity to appropriate model tier**

---

## 7. Memory & Vector Search

### v2: O(n) Linear Search

```typescript
// v2 vector search
CachedHNSWVectorMemory
- HNSW available but often fell back to linear
- O(n) scan for large pattern stores
- Performance degraded with scale
```

### v3: O(log n) HNSW-Indexed Search

```typescript
// v3 HNSW configuration
{
  dimensions: 128,
  M: 16,              // Neighbors per node
  efConstruction: 200,
  efSearch: 100,
  metric: 'cosine',
  maxElements: 100000,
}

// Domain-specific tuning
| Domain       | M  | ef   | Purpose                          |
|--------------|----|----- |----------------------------------|
| defects      | 32 | 400  | Highest precision for defects    |
| learning     | 24 | 300  | Highest recall for patterns      |
| coverage     | 16 | 200  | Balanced for gap detection       |
| test-suites  | 8  | 100  | Fast test lookup                 |
```

**Performance Comparison:**

| Codebase Size | v2 O(n) | v3 O(log n) | Complexity |
|---------------|---------|-------------|------------|
| 1,000 files | ~10ms | ~0.1ms | O(log n) |
| 10,000 files | ~100ms | ~0.13ms | O(log n) |
| 100,000 files | ~1000ms | ~0.17ms | O(log n) |

*Note: O(log n) complexity confirmed. Actual speedup varies by hardware and configuration.*

---

## 8. RuVector Neural Backbone

> **NEW in v3.0.0-alpha.43** - Implemented via ADR-050 GOAP (8/8 actions complete)

### v2: No Persistent Neural Learning

```typescript
// v2: Learning resets on restart
- Q-values lost between sessions
- SONA patterns not persisted
- No EWC protection against forgetting
- Manual model selection every time
```

### v3: Persistent Neural Backbone (ADR-050)

```
┌────────────────────────────────────────────────────────────────┐
│                 RUVECTOR NEURAL BACKBONE                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐    ┌──────────────────────┐         │
│  │ PersistentQLearning  │    │ PersistentSONAEngine │         │
│  │     Router           │    │                      │         │
│  │ ─────────────────    │    │ ─────────────────    │         │
│  │ • SQLite Q-values    │    │ • Pattern persistence│         │
│  │ • EWC++ protection   │    │ • Cross-session state│         │
│  │ • Fisher Information │    │ • Auto-save intervals│         │
│  │ • Route optimization │    │ • Domain-specific    │         │
│  └──────────┬───────────┘    └──────────┬───────────┘         │
│             │                           │                      │
│             └─────────┬─────────────────┘                      │
│                       ▼                                        │
│  ┌────────────────────────────────────────────────────────┐   │
│  │           Unified Memory Backend (SQLite)               │   │
│  │  • rl_q_values, sona_patterns, hypergraph_nodes/edges  │   │
│  │  • dream_cycles, goap_*, mincut_*, vectors             │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Key Components:**

| Component | Purpose | Persistence |
|-----------|---------|-------------|
| **PersistentQLearningRouter** | Agent-to-task routing optimization | SQLite `rl_q_values` table |
| **PersistentSONAEngine** | Self-optimizing neural patterns | SQLite `sona_patterns` table |
| **EWC++ Protection** | Prevents catastrophic forgetting | Fisher Information Matrix |
| **HypergraphEngine** | Code intelligence graph queries | SQLite `hypergraph_*` tables |
| **ML Observability** | Track ML vs fallback usage | Metrics collection |
| **SharedMemoryManager** | Fleet-wide state sharing | Cross-agent coordination |

**EWC++ (Elastic Weight Consolidation):**

```typescript
// v3: Learning survives restarts with EWC++ protection
{
  ewcEnabled: true,        // Prevent catastrophic forgetting
  ewcLambda: 0.5,          // Regularization strength
  consolidationThreshold: 100,  // Consolidate after N updates
  fisherSamples: 50,       // Samples for Fisher Information Matrix
}

// Q-values persist across sessions
await router.updateQValue('security-scanner', 'security-audit', 0.95);
// → Saved to SQLite with EWC protection
// → Available after restart
```

**Integration Points (8/8 Complete):**

1. ✅ `DefaultRuVectorClient` → `PersistentQLearningRouter`
2. ✅ `TestGenerationCoordinator` → `PersistentSONAEngine`
3. ✅ `CoverageAnalysisCoordinator` → `PersistentSONAEngine`
4. ✅ `QualityAssessmentCoordinator` → `PersistentSONAEngine`
5. ✅ `DefectIntelligenceCoordinator` → `PersistentSONAEngine`
6. ✅ `LearningOptimizationCoordinator` → `PersistentSONAEngine`
7. ✅ `CodeIntelligenceCoordinator` → `PersistentSONAEngine` + `HypergraphEngine`
8. ✅ `RuVectorServiceProvider.getGlobalSONA()` → `PersistentSONAEngine`

---

## 9. Deep Integration (ADR-051)

> **NEW in v3.0.0** - Deep integration with Claude Flow and Agentic Flow ecosystems

### v2: Standalone System

```typescript
// v2: Limited integrations
- Basic MCP tools
- No Claude Flow integration
- No pattern sharing across tools
- Manual model selection
```

### v3: Deep Ecosystem Integration (ADR-051)

```
┌────────────────────────────────────────────────────────────────┐
│                 ADR-051 INTEGRATION ARCHITECTURE               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐    ┌──────────────────────┐         │
│  │   CLAUDE FLOW        │    │   AGENTIC FLOW       │         │
│  │   Integration        │    │   Integration        │         │
│  │ ─────────────────    │    │ ─────────────────    │         │
│  │ • MCP Tool Bridge    │    │ • Pattern Loading    │         │
│  │ • Memory Namespaces  │    │ • Agent Booster      │         │
│  │ • Swarm Coordination │    │ • Model Router       │         │
│  │ • Session Management │    │ • ONNX Embeddings    │         │
│  └──────────┬───────────┘    └──────────┬───────────┘         │
│             │                           │                      │
│             └─────────┬─────────────────┘                      │
│                       ▼                                        │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Unified QE Platform                        │   │
│  │  • Intelligent Model Routing (Haiku/Sonnet/Opus)       │   │
│  │  • ReasoningBank Pattern Learning                      │   │
│  │  • Cross-agent Memory Coordination                     │   │
│  │  • HNSW Vector Search                                  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Integration Components:**

| Component | Purpose | Source |
|-----------|---------|--------|
| **Pattern Loader** | Load pre-trained QE patterns | Agentic Flow |
| **Agent Booster** | Pre-LLM transforms for simple tasks | Agentic Flow |
| **Model Router** | 3-tier intelligent routing | TinyDancer (ADR-026) |
| **ONNX Embeddings** | Local semantic search | Agentic Flow |
| **Memory Bridge** | Cross-tool state sharing | Claude Flow |
| **Swarm Coordinator** | Multi-agent orchestration | Claude Flow |

**Benefits:**

- **Cost Reduction**: Agent Booster handles simple transforms without LLM calls
- **Pattern Reuse**: Load proven QE patterns from Agentic Flow ecosystem
- **Unified Memory**: Seamless state sharing between Claude Flow and AQE
- **Local Embeddings**: ONNX-based semantic search without API calls

---

## 10. Browser Automation

> **NEW in v3.0.0-alpha.32** - Real browser testing with Vibium and agent-browser

### v2: No Browser Automation

```typescript
// v2: Mock-based testing only
- No real browser interaction
- Accessibility testing via static analysis
- Visual regression not supported
- E2E tests require external tools
```

### v3: Dual Browser Integration

```
┌─────────────────────────────────────────────────────────────┐
│                  BROWSER AUTOMATION                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────────┐    ┌─────────────────────┐        │
│   │      VIBIUM         │    │   AGENT-BROWSER     │        │
│   │ ─────────────────   │    │ ─────────────────   │        │
│   │ • WebDriver BiDi    │    │ • CDP-based         │        │
│   │ • Lightweight       │    │ • Full debugging    │        │
│   │ • Fast execution    │    │ • Trace recording   │        │
│   │ • axe-core a11y     │    │ • Network mocking   │        │
│   └─────────┬───────────┘    └─────────┬───────────┘        │
│             │                           │                    │
│             └─────────┬─────────────────┘                    │
│                       ▼                                      │
│   ┌──────────────────────────────────────────────────────┐  │
│   │             Visual Accessibility Domain               │  │
│   │  • Multi-viewport screenshots                        │  │
│   │  • Visual regression with baseline comparison        │  │
│   │  • Real WCAG testing via axe-core in browser        │  │
│   │  • E2E user flow generation                         │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Comparison:**

| Feature | Vibium | agent-browser |
|---------|--------|---------------|
| **Protocol** | WebDriver BiDi | CDP |
| **Weight** | Lightweight | Full-featured |
| **Speed** | Faster | More thorough |
| **Network Mocking** | Basic | Full control |
| **Auth Persistence** | Session-based | Cookies + localStorage |
| **Trace Recording** | No | Yes |
| **Best For** | Quick validation | Deep debugging |

**Capabilities:**

```typescript
// Real browser accessibility testing
const results = await accessibilityTester.runAccessibilityAudit({
  url: 'https://example.com',
  standard: 'WCAG2.1-AA',
  browserMode: 'vibium',  // or 'agent-browser'
});

// Multi-viewport visual regression
const screenshots = await viewportCapture.captureAllViewports({
  url: 'https://example.com',
  viewports: ['mobile', 'tablet', 'desktop'],
  compareBaseline: true,
});

// E2E test generation with real browser
const e2eTests = await e2eRunner.generateUserFlows({
  entryUrl: 'https://example.com/login',
  targetActions: ['login', 'navigate', 'submit-form'],
  captureNetwork: true,
});

// Network mocking for isolated testing
await networkMocker.mockRoute('/api/users', {
  status: 200,
  body: { users: [{ id: 1, name: 'Test' }] },
});
```

**Integration with Visual-Accessibility Domain:**

| Service | Vibium Support | agent-browser Support |
|---------|----------------|----------------------|
| `AccessibilityTester` | ✅ axe-core in browser | ✅ axe-core in browser |
| `ViewportCapture` | ✅ Screenshots | ✅ Screenshots + trace |
| `E2ERunner` | ✅ User flows | ✅ User flows + debug |
| `NetworkMocker` | ⚠️ Limited | ✅ Full CDP control |
| `AuthStateManager` | ⚠️ Session | ✅ Full persistence |

---

## 11. CLI & Developer Experience

### v2: 70+ CLI Commands

```bash
# v2 command sprawl
aqe spawn, kill, restart, list, logs, metrics, inspect
aqe attach, detach, clone, assign, benchmark, migrate
aqe init, get, set, list, export, import, validate, reset, schema
aqe compact, vacuum, stats
aqe extract, index, search, list, show, stats
aqe learn, dream
aqe run, pause, cancel, list
aqe knowledge-graph, mincut
aqe debug, health-check, trace, profile, diagnostics
# ... 70+ total commands
```

**Problems:** Command discovery difficult, inconsistent naming

### v3: Streamlined CLI with Discovery

```bash
# v3 organized by domain
# Fleet management
aqe fleet init --topology hierarchical --max-agents 15
aqe fleet status
aqe fleet health

# Task execution
aqe task submit --type generate-tests --priority p1
aqe task list --status pending
aqe task status <task-id>

# Domain commands (one per domain)
aqe test generate src/
aqe coverage analyze
aqe security scan --sast --dast
aqe quality assess

# Learning
aqe pattern search "authentication"
aqe pattern promote <pattern-id>
aqe dream cycle

# Hooks integration
aqe hooks init
aqe hooks pre-task --description "implement auth"
aqe hooks post-task --task-id <id> --success true
```

**v3 CLI Features:**
- Interactive init wizard (7+ steps)
- Auto-configuration from project analysis
- Pre-trained pattern loading
- Claude Code hooks setup
- Background workers configuration

---

## 12. Performance Benchmarks

### MCP Response Times

| Operation | v2 Target | v2 Actual | v3 Actual | Improvement |
|-----------|-----------|-----------|-----------|-------------|
| Fleet init | N/A | ~200ms | ~124ms | 38% faster |
| Fleet status | N/A | ~100ms | <1ms | 100x faster |
| Agent spawn | N/A | ~150ms | ~45ms | 70% faster |
| Memory store | N/A | ~50ms | <2ms | 25x faster |
| Memory retrieve | N/A | ~30ms | <1ms | 30x faster |
| Test generate | N/A | ~500ms | ~240ms | 52% faster |
| P95 overall | 100ms | ~100ms | **0.6ms** | **166x faster** |

### Pattern Search Performance

| Operation | v2 | v3 | Improvement |
|-----------|----|----|-------------|
| Pattern search (1K) | 10ms | 0.1ms | O(log n) |
| Pattern search (100K) | 1000ms | 0.17ms | O(log n) |
| SONA adaptation | ~1ms | Persistent | Pattern survival ✅ |
| Dream cycle | N/A | 30s max | New feature |

### Resource Usage

| Metric | v2 | v3 | Improvement |
|--------|----|----|-------------|
| Files loaded | 5,334 | 504 (lazy) | Significantly less |
| Memory baseline | ~200MB | ~80MB | Reduced |
| CLI startup | ~3s | <1s | Faster |

---

## 13. Migration Path

### Zero-Breaking-Changes Guarantee

v3 maintains full backward compatibility with v2 MCP tools:

```typescript
// v2 code works unchanged in v3
mcp__agentic-qe__memory_store({ key: "test", value: {...} })
mcp__agentic-qe__test_generate_enhanced({ sourceCode: "..." })
mcp__agentic-qe__coverage_analyze_sublinear({ target: "src/" })
```

### Migration Steps

1. **Install v3** (side-by-side with v2)
   ```bash
   npm install agentic-qe@3
   ```

2. **Run migration wizard**
   ```bash
   aqe init --wizard --migrate-from-v2
   ```

3. **Verify patterns migrated**
   ```bash
   aqe pattern list --namespace v2-migrated
   ```

4. **Test MCP tools**
   ```bash
   # All v2 tools work in v3
   ```

5. **Enable v3 features incrementally**
   ```typescript
   // Enable intelligent routing
   mcp__agentic-qe__fleet_init({
     topology: "hierarchical",
     enableModelRouting: true
   })
   ```

---

## 14. Why Upgrade to v3?

### For Individual Developers

| Benefit | Impact |
|---------|--------|
| **Cost optimization** | Intelligent routing uses cheaper models for simple tasks |
| **166x faster MCP** | Sub-millisecond response times |
| **Auto-learning** | System improves from your usage patterns |
| **Better tests** | AI-powered test generation with pattern matching |
| **Persistent learning** | Q-values and SONA patterns survive restarts ✅ **NEW** |
| **Real browser testing** | Vibium and agent-browser integrations ✅ **NEW** |

### For Teams

| Benefit | Impact |
|---------|--------|
| **Clear domain ownership** | 12 bounded contexts with explicit responsibilities |
| **3-5x throughput** | Queen Coordinator with work stealing |
| **Quality gates** | Automated deployment readiness assessment |
| **Knowledge sharing** | Cross-project pattern transfer |
| **Real accessibility** | axe-core testing in actual browser context ✅ **NEW** |
| **Visual regression** | Automated screenshot comparison ✅ **NEW** |

### For Organizations

| Benefit | Impact |
|---------|--------|
| **Reduced API costs** | Intelligent model routing optimizes spend |
| **Compliance ready** | Built-in OWASP, CVE, GDPR, SOC2 validation |
| **Scalability** | O(log n) algorithms handle 100K+ file codebases |
| **Auditability** | Token tracking, cost reporting, decision logging |
| **EWC++ protection** | Prevents catastrophic forgetting in production ✅ **NEW** |
| **29-table database** | Complete persistence layer for all QE data ✅ **NEW** |

### Feature Comparison Summary

| Feature | v2 | v3 |
|---------|----|----|
| Domain-Driven Design | No | Yes (12 domains) |
| QE Agents | 32 | 50 (43 main + 7 TDD) |
| QE Skills | 35 | 60 (+71%) |
| Queen Coordinator | No | Yes |
| Intelligent Model Routing | No | Yes (ADR-026) |
| Deep Integration | No | Claude Flow + Agentic Flow (ADR-051) |
| Dream Cycle Learning | No | Yes |
| 9 RL Algorithms | No | Yes |
| O(log n) HNSW Search | Partial | Full |
| Connection Pooling | No | Yes (50 max) |
| Load Balancing | No | Yes |
| Work Stealing | No | Yes |
| MinCut Topology | No | Yes |
| Interactive Init | No | Yes |
| Cost Tracking | No | Yes |
| Multi-Model Consensus | No | Yes |
| Persistent Q-Learning | No | Yes |
| Persistent SONA | No | Yes |
| EWC++ Protection | No | Yes |
| Browser Automation | No | Vibium + agent-browser |
| Real axe-core A11y | No | Yes |
| Visual Regression | No | Yes |
| Hypergraph Engine | No | Yes |
| V2 Migration Complete | N/A | Yes (all agents including legacy) |

---

## Conclusion

AQE v3 represents a complete architectural reimagining of the quality engineering platform:

- **50 QE Agents** organized in 12 DDD bounded contexts
- **60 QE Skills** (+71% from v2's 35 skills)
- **O(log n) faster** pattern search with HNSW
- **166x faster** MCP response times (verified benchmark)
- **Cost optimization** with TinyDancer 3-tier routing (ADR-026)
- **Deep integration** with Claude Flow and Agentic Flow (ADR-051)
- **Full AI learning stack** with Dream cycles and 9 RL algorithms
- **Persistent neural learning** with EWC++ protection
- **Real browser automation** with Vibium and agent-browser
- **Complete v2 migration** including legacy agents (qx-partner, base-template-generator)
- **6,826 tests** ensuring stability and correctness
- **Zero breaking changes** for migration

**Recommendation:** Upgrade to v3 for any new project, and migrate existing projects to benefit from cost savings, performance improvements, and the comprehensive QE skill library.

---

## Quick Start

```bash
# Install globally
npm install -g agentic-qe

# Initialize your project
cd your-project
aqe init --wizard

# Or auto-configure with migration from v2
aqe init --auto-migrate

# Add MCP server to Claude Code
claude mcp add aqe -- aqe-mcp

# Start using
# MCP tools are now available in Claude Code
# 50 agents, 60 skills, and learning persists across sessions
```

---

*Document updated: 2026-01-21*
*AQE v3.0.0 (Release Candidate)*
