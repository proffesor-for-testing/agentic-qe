# Modularization Proposal: Large File Analysis

## Executive Summary

This document analyzes five large files (>1000 LOC) in the Agentic-QE codebase and proposes modularization strategies to improve maintainability, testability, and developer experience.

**Total Lines Analyzed:** 15,028 LOC across 5 files

| File | LOC | Priority | Complexity |
|------|-----|----------|------------|
| src/mcp/tools.ts | 4,221 | 1 (Highest) | Medium |
| src/core/memory/SwarmMemoryManager.ts | 3,403 | 2 | High |
| src/agents/QXPartnerAgent.ts | 3,101 | 3 | High |
| src/agents/TestDataArchitectAgent.ts | 2,209 | 4 | Medium |
| src/providers/HybridRouter.ts | 2,094 | 5 | Medium |

---

## 1. src/mcp/tools.ts (4,221 LOC)

### Current Structure

The file contains a single massive array `agenticQETools` with 60+ MCP tool definitions organized into loosely-grouped categories via comments:

```
Lines 1-73:     Interfaces and type definitions
Lines 74-4077:  Tool definitions array (4,003 lines!)
Lines 4078-4221: TOOL_NAMES constants and type exports
```

**Categories identified via comments:**
- Core Tools - Fleet Management (fleet_init, agent_spawn, fleet_status)
- Core Tools - Testing Execution (test_execute, test_generate_enhanced)
- Core Tools - Memory Operations (memory_store, memory_retrieve, memory_query)
- Analysis Tools - Coverage & Quality
- Analysis Tools - Performance & Security
- AI/ML Tools - Predictions & Optimization
- RuVector Tools - Cache Integration

### Cohesion Analysis

**Low cohesion** - The file groups tools by comments only. No functional separation:
- Fleet management tools mixed with test execution tools
- Memory tools near AI prediction tools
- No clear domain boundaries enforced

### Coupling Analysis

**Low external coupling** - Tools are independent definitions
**High internal coupling** - All tools share the same export, making selective imports impossible

### Modularization Proposal

**Split into 8 domain-specific modules:**

```
src/mcp/tools/
  index.ts              - Re-exports all tools + TOOL_NAMES (aggregator)
  types.ts              - FleetConfig, AgentSpec, TestGenerationSpec, etc.
  fleet.tools.ts        - fleet_init, agent_spawn, fleet_status (~300 LOC)
  testing.tools.ts      - test_execute, test_generate_enhanced, test_execute_parallel (~600 LOC)
  memory.tools.ts       - memory_store, memory_retrieve, memory_query, memory_share (~400 LOC)
  coverage.tools.ts     - test_coverage_detailed, coverage_gap_analyzer (~300 LOC)
  quality.tools.ts      - quality_gate_evaluate, predict_defects_ai (~400 LOC)
  performance.tools.ts  - performance_test, load_generator, chaos_inject (~400 LOC)
  ruvector.tools.ts     - ruvector_store_pattern, ruvector_search (~200 LOC)
  learning.tools.ts     - learn_status, learn_patterns, kg_query (~300 LOC)
```

### Expected Benefits

1. **Selective loading**: Only import tools needed per context
2. **Parallel development**: Teams can work on different tool domains
3. **Faster builds**: Changed file triggers smaller rebuild scope
4. **Better testing**: Test individual tool categories in isolation
5. **Clearer ownership**: Domain experts own their tool modules

### Risks

- **Low risk**: Pure structural refactoring with no logic changes
- **Migration**: Update imports across ~15 handler files
- **Re-export compatibility**: index.ts maintains backward compatibility

### Estimated Effort: **Low** (2-3 days)

---

## 2. src/core/memory/SwarmMemoryManager.ts (3,403 LOC)

### Current Structure

A monolithic class managing 14 SQLite tables with complete CRUD operations:

```
Lines 1-200:     Imports, interfaces, type definitions
Lines 201-500:   Initialization, table creation, migration
Lines 501-1500:  Memory entries + Hints operations
Lines 1500-1750: Events operations
Lines 1750-2100: Workflow, Patterns, Consensus operations
Lines 2100-2500: Metrics, Artifacts, Sessions operations
Lines 2500-2850: Agent Registry, GOAP, OODA operations
Lines 2850-3050: ACL and Access Control
Lines 3050-3200: QUIC/AgentDB integration
Lines 3200-3403: Learning Operations (Q-learning, experiences)
```

### Cohesion Analysis

**Mixed cohesion** - Class has clear internal sections (good) but handles too many responsibilities:
- 14 different entity types (tables)
- 3 cross-cutting concerns (caching, TTL, ACL)
- 2 external integrations (AgentDB, QUIC)

### Coupling Analysis

**High internal coupling** - All methods depend on shared `this.db` instance
**Moderate external coupling** - Dependencies on AgentDB, AccessControl, PatternCache

### Modularization Proposal

**Extract into Repository pattern with domain partitions:**

```
src/core/memory/
  SwarmMemoryManager.ts   - Facade/coordinator (~400 LOC)
  repositories/
    index.ts              - Export all repositories
    MemoryEntryRepository.ts    - store, retrieve, query (~300 LOC)
    HintRepository.ts           - storeHint, getHints (~150 LOC)
    EventRepository.ts          - storeEvent, queryEvents (~150 LOC)
    WorkflowRepository.ts       - workflow state CRUD (~200 LOC)
    PatternRepository.ts        - patterns with caching (~250 LOC)
    ConsensusRepository.ts      - consensus proposals (~200 LOC)
    MetricsRepository.ts        - performance metrics (~150 LOC)
    ArtifactRepository.ts       - artifacts CRUD (~150 LOC)
    SessionRepository.ts        - sessions + checkpoints (~200 LOC)
    AgentRegistryRepository.ts  - agent registration (~200 LOC)
    GOAPRepository.ts           - goals, actions, plans (~200 LOC)
    OODARepository.ts           - OODA cycles (~150 LOC)
    LearningRepository.ts       - Q-values, experiences (~300 LOC)
  services/
    ACLService.ts               - Access control logic (~200 LOC)
    TTLService.ts               - TTL policy enforcement (~100 LOC)
    PatternCacheService.ts      - Pattern caching (~100 LOC)
  integrations/
    AgentDBIntegration.ts       - AgentDB/QUIC bridge (~200 LOC)
```

### Expected Benefits

1. **Single Responsibility**: Each repository handles one entity type
2. **Testability**: Mock individual repositories for unit tests
3. **Performance tuning**: Optimize hot repositories independently
4. **Team scaling**: Assign ownership by domain (GOAP team, Learning team)
5. **Selective loading**: Lazy-load repositories not needed

### Risks

- **Medium risk**: Requires careful database connection sharing
- **Transaction scope**: Cross-repository transactions need coordinator
- **Interface stability**: Repository interfaces become public contracts

### Estimated Effort: **High** (5-7 days)

---

## 3. src/agents/QXPartnerAgent.ts (3,101 LOC)

### Current Structure

A QX (Quality Experience) analysis agent with multiple analysis strategies:

```
Lines 1-150:     Imports, config interfaces
Lines 150-400:   QXPartnerAgent class setup
Lines 400-800:   Core analysis: analyzeProblem, collectQXContext
Lines 800-1200:  User needs analysis
Lines 1200-1700: Business needs analysis, creativity analysis
Lines 1700-2100: Design analysis (exactness, intuitive, counter-intuitive)
Lines 2100-2400: Oracle problem detection, impact analysis
Lines 2400-2800: Heuristics engine (QXHeuristicsEngine helper class)
Lines 2800-3000: Oracle detector, impact analyzer helper classes
Lines 3000-3101: Helper methods
```

### Cohesion Analysis

**Low cohesion** - Agent does too much:
- Problem analysis
- User needs analysis
- Business needs analysis
- Creativity analysis
- Design analysis (3 sub-types)
- Oracle detection
- Impact analysis
- 20+ heuristics evaluation

### Coupling Analysis

**High internal coupling** - Helper classes defined inline depend on private methods
**Low external coupling** - Well-defined QXContext interface

### Modularization Proposal

**Extract Strategy pattern for analysis dimensions:**

```
src/agents/qx/
  QXPartnerAgent.ts           - Orchestrator (~500 LOC)
  strategies/
    index.ts                  - Export all strategies
    ProblemAnalysisStrategy.ts      - analyzeProblem (~200 LOC)
    UserNeedsStrategy.ts            - analyzeUserNeeds (~300 LOC)
    BusinessNeedsStrategy.ts        - analyzeBusinessNeeds (~200 LOC)
    CreativityStrategy.ts           - analyzeCreativity (~200 LOC)
    DesignStrategy.ts               - analyzeDesign (~300 LOC)
    OracleDetectionStrategy.ts      - detectOracleProblems (~200 LOC)
    ImpactAnalysisStrategy.ts       - analyzeImpact (~200 LOC)
  heuristics/
    QXHeuristicsEngine.ts           - Main engine (~400 LOC)
    heuristics/                     - Individual heuristic implementations
      ConsistencyHeuristic.ts
      IntuitiveDesignHeuristic.ts
      UserFeelingsHeuristic.ts
      ...
  types/
    index.ts                        - All QX types
    contexts.ts                     - QXContext, analysis results
    heuristics.ts                   - Heuristic types
```

### Expected Benefits

1. **Strategy swapping**: Plug different analysis strategies per context
2. **Heuristic extensibility**: Add new heuristics without modifying engine
3. **Testing**: Test each strategy in isolation
4. **Parallel analysis**: Run independent strategies concurrently
5. **Maintainability**: Each strategy ~200 LOC vs 3,000 LOC monolith

### Risks

- **Medium risk**: Strategy interfaces must be carefully designed
- **Context passing**: QXContext may need enrichment between strategies
- **Orchestration complexity**: Agent becomes coordinator with more moving parts

### Estimated Effort: **High** (4-6 days)

---

## 4. src/agents/TestDataArchitectAgent.ts (2,209 LOC)

### Current Structure

Test data generation agent with multiple generator types:

```
Lines 1-165:     Type definitions (FieldValue, DataRecord, etc.)
Lines 165-425:   Schema interfaces (DatabaseSchema, TableSchema, FieldSchema)
Lines 425-530:   Agent class initialization, capabilities
Lines 530-720:   Lifecycle hooks, BaseAgent implementation
Lines 720-1020:  Schema introspection methods (SQL, Mongo, GraphQL, TypeScript)
Lines 1020-1220: Data generation with referential integrity
Lines 1220-1385: Edge case generation
Lines 1385-1560: PII anonymization methods
Lines 1560-1730: Validation methods
Lines 1730-1880: Production pattern analysis, data versioning
Lines 1880-2209: Helper methods (generators, UUID, email, etc.)
```

### Cohesion Analysis

**Moderate cohesion** - Clear functional sections but some could be standalone:
- Schema introspection (5 different sources)
- Data generation (core feature)
- Anonymization (separate concern)
- Validation (separate concern)

### Coupling Analysis

**Low external coupling** - Well-defined interfaces
**Moderate internal coupling** - Generators used across multiple methods

### Modularization Proposal

**Extract by functional domain:**

```
src/agents/test-data/
  TestDataArchitectAgent.ts     - Orchestrator (~600 LOC)
  types/
    index.ts                    - All type exports
    schema.types.ts             - DatabaseSchema, TableSchema, etc.
    generation.types.ts         - DataGenerationRequest, etc.
    anonymization.types.ts      - AnonymizationConfig, etc.
  introspection/
    index.ts                    - SchemaIntrospector interface
    SQLIntrospector.ts          - PostgreSQL, MySQL, SQLite
    MongoIntrospector.ts        - MongoDB collections
    OpenAPIIntrospector.ts      - OpenAPI schemas
    GraphQLIntrospector.ts      - GraphQL types
    TypeScriptIntrospector.ts   - TypeScript interfaces
  generators/
    index.ts                    - DataGenerator factory
    BaseGenerator.ts            - Abstract generator
    FieldGenerators.ts          - UUID, email, name, etc. (~200 LOC)
    EdgeCaseGenerator.ts        - Edge case generation (~200 LOC)
    IntegrityGenerator.ts       - Referential integrity (~200 LOC)
  anonymization/
    Anonymizer.ts               - Main anonymizer (~200 LOC)
    strategies/                 - Mask, Hash, Tokenize, etc.
  validation/
    DataValidator.ts            - Constraint validation (~200 LOC)
    SafeExpressionEvaluator.ts  - Safe eval replacement (~100 LOC)
```

### Expected Benefits

1. **Introspector plugins**: Add new schema sources without touching core
2. **Generator reuse**: Use field generators in other contexts
3. **Anonymization library**: Extract as standalone package potential
4. **Type organization**: Clear import paths for schema types
5. **Testing**: Test introspectors with mock database connections

### Risks

- **Low-Medium risk**: Clean separation boundaries already visible
- **Generator state**: Faker instance and token map need careful handling
- **Performance**: Ensure no overhead from modularization

### Estimated Effort: **Medium** (3-4 days)

---

## 5. src/providers/HybridRouter.ts (2,094 LOC)

### Current Structure

Intelligent LLM provider router with multiple routing strategies:

```
Lines 1-100:     Imports, enums (RequestPriority, TaskComplexity, RoutingStrategy)
Lines 100-260:   Interfaces (RoutingDecision, CostSavingsReport, BudgetConfig)
Lines 260-340:   HybridRouterConfig interface
Lines 340-470:   HybridRouter class initialization
Lines 470-700:   complete() method with RuVector cache integration
Lines 700-900:   executeWithDecision, TRM preparation
Lines 900-1120:  Health check, metadata, shutdown
Lines 1120-1400: Cost tracking, budget management
Lines 1400-1600: Routing statistics, RuVector metrics
Lines 1600-1800: Routing decision logic
Lines 1800-2000: Circuit breaker, fallback, helpers
Lines 2000-2094: Phase 2 integration methods (compression, ML classifier)
```

### Cohesion Analysis

**Moderate cohesion** - Clear sections but multiple concerns:
- Provider management (local/cloud)
- Routing decision making
- Cost tracking and budgeting
- Circuit breaker pattern
- RuVector cache integration
- ML complexity classification

### Coupling Analysis

**High external coupling** - Depends on ClaudeProvider, RuvllmProvider, RuVectorClient, ComplexityClassifier, CostOptimizationManager
**Moderate internal coupling** - Routing uses cost, circuit breaker, and classifier

### Modularization Proposal

**Extract routing strategies and cross-cutting concerns:**

```
src/providers/hybrid-router/
  HybridRouter.ts              - Main coordinator (~600 LOC)
  types/
    index.ts                   - All type exports
    routing.types.ts           - RoutingDecision, strategies
    cost.types.ts              - CostSavingsReport, BudgetConfig
    config.types.ts            - HybridRouterConfig
  routing/
    RoutingEngine.ts           - Core routing logic (~300 LOC)
    strategies/
      CostOptimizedStrategy.ts
      LatencyOptimizedStrategy.ts
      QualityOptimizedStrategy.ts
      PrivacyFirstStrategy.ts
      BalancedStrategy.ts
    ComplexityAnalyzer.ts      - Heuristic + ML classification (~200 LOC)
  resilience/
    CircuitBreaker.ts          - Circuit breaker pattern (~150 LOC)
    FallbackHandler.ts         - Fallback logic (~100 LOC)
  cost/
    CostTracker.ts             - Cost history, tracking (~200 LOC)
    BudgetManager.ts           - Budget enforcement (~150 LOC)
    CostReporter.ts            - Reports generation (~100 LOC)
  cache/
    RuVectorCacheLayer.ts      - RuVector integration (~250 LOC)
```

### Expected Benefits

1. **Strategy pattern**: Swap routing strategies at runtime
2. **Circuit breaker reuse**: Use pattern in other providers
3. **Cost tracking isolation**: Budget logic testable independently
4. **Cache abstraction**: RuVector behind interface for future alternatives
5. **Complexity analysis**: ML classifier as pluggable component

### Risks

- **Medium risk**: Provider coordination requires careful state management
- **Async complexity**: Multiple async operations during routing
- **Performance**: Additional abstraction layers may add latency

### Estimated Effort: **Medium** (3-4 days)

---

## Implementation Priority Order

Based on impact, risk, and dependencies:

| Priority | File | Rationale |
|----------|------|-----------|
| 1 | tools.ts | Lowest risk, highest visibility, enables selective loading |
| 2 | SwarmMemoryManager.ts | High impact, enables team scaling, but complex |
| 3 | QXPartnerAgent.ts | Enables heuristic extensibility, strategy swapping |
| 4 | TestDataArchitectAgent.ts | Clean boundaries, moderate effort |
| 5 | HybridRouter.ts | Lower priority, router works well as monolith |

---

## Migration Strategy

### Phase 1: Preparation (1 day)
1. Create comprehensive tests for current behavior
2. Document public API surface for each file
3. Set up new directory structures

### Phase 2: Incremental Extraction (per file)
1. Extract types first (no logic changes)
2. Create interfaces for extracted modules
3. Extract one module at a time with tests
4. Update imports incrementally
5. Deprecate old structure with re-exports

### Phase 3: Validation (per file)
1. Run full test suite
2. Performance benchmarking
3. Integration testing
4. Documentation update

---

## Success Metrics

1. **File size**: No file >500 LOC (target: 300 LOC average)
2. **Test coverage**: >90% for extracted modules
3. **Build time**: 20% reduction in incremental builds
4. **Import graph**: Clear dependency direction (no cycles)
5. **Cognitive load**: Each module readable in <5 minutes

---

## Appendix: Quick Reference

### tools.ts Split Commands
```bash
# Create directory structure
mkdir -p src/mcp/tools

# Files to create:
# - src/mcp/tools/index.ts
# - src/mcp/tools/types.ts
# - src/mcp/tools/fleet.tools.ts
# - src/mcp/tools/testing.tools.ts
# - src/mcp/tools/memory.tools.ts
# - src/mcp/tools/coverage.tools.ts
# - src/mcp/tools/quality.tools.ts
# - src/mcp/tools/performance.tools.ts
# - src/mcp/tools/ruvector.tools.ts
# - src/mcp/tools/learning.tools.ts
```

### SwarmMemoryManager Split Commands
```bash
# Create directory structure
mkdir -p src/core/memory/repositories
mkdir -p src/core/memory/services
mkdir -p src/core/memory/integrations
```

### QXPartnerAgent Split Commands
```bash
# Create directory structure
mkdir -p src/agents/qx/strategies
mkdir -p src/agents/qx/heuristics
mkdir -p src/agents/qx/types
```

---

**Document Version:** 1.0.0
**Created:** 2025-12-27
**Author:** System Architecture Designer (Claude Opus 4.5)
