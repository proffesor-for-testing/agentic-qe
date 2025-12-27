# Math.random() Usage Inventory

## Overview

This document provides a comprehensive inventory of all `Math.random()` usages in the agentic-qe codebase to prioritize migration to a deterministic `SeededRandom` utility for improved test reproducibility.

**Generated:** 2025-12-27
**Total Occurrences:** 215+ usages across 60+ files

---

## Summary Statistics

| Category | Count | Priority |
|----------|-------|----------|
| TEST_ONLY | 85+ | P0 - Highest |
| SIMULATION | 45+ | P1 - High |
| RUNTIME | 55+ | P2 - Medium |
| ID_GENERATION | 30+ | P3 - Low (consider UUID) |

---

## Priority Legend

- **P0**: Test files using Math.random() in assertions or test data - **affects test determinism**
- **P1**: Mock/simulation code in production - high impact on reproducibility
- **P2**: Runtime code that could benefit from SeededRandom
- **P3**: Low-impact uses (ID generation may prefer UUID)

---

## Inventory by Directory

### 1. tests/ Directory (P0 - Highest Priority)

These directly affect test determinism and should be migrated first.

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `tests/learning/PPOLearner.test.ts` | 141, 171, 196, 332, 350, 425, 427 | TEST_ONLY | Creating test experiences with random rewards | Easy | **YES** |
| `tests/learning/integration.test.ts` | 206, 382 | TEST_ONLY | Random rewards in learning tests | Easy | **YES** |
| `tests/learning/performance.test.ts` | 176-398 (20+ occurrences) | TEST_ONLY | Random task complexity, resources, rewards | Medium | **YES** |
| `tests/learning/convergence.test.ts` | 207, 211, 285, 395 | TEST_ONLY | Random state values, action selection | Easy | **YES** |
| `tests/benchmarks/FlakyDetectionBenchmark.ts` | 205-291 (15+ occurrences) | TEST_ONLY | Simulating flaky test behavior | Medium | **YES** |
| `tests/benchmarks/agentdb-vs-ruvector.benchmark.ts` | 50, 62, 63, 67 | TEST_ONLY | Random embeddings, coverage scores | Easy | **YES** |
| `tests/benchmarks/pattern-query-performance.test.ts` | 47, 52 | TEST_ONLY | Random confidence, usage counts | Easy | **YES** |
| `tests/benchmarks/learning-performance.bench.ts` | 127, 142, 234, 255, 424 | TEST_ONLY | Q-value initialization, rewards | Easy | **YES** |
| `tests/benchmarks/mincut-performance.test.ts` | 58, 62, 69, 70, 82, 150 | TEST_ONLY | Random graph generation | Medium | **YES** |
| `tests/benchmarks/performance-benchmark.ts` | 531, 543 | TEST_ONLY | Random key/target selection | Easy | **YES** |
| `tests/routing/cost-savings.test.ts` | 61-95 (12+ occurrences) | TEST_ONLY | Random complexity metrics | Medium | **YES** |
| `tests/fixtures/phase2-mocks.ts` | 287 | TEST_ONLY | Random token usage | Easy | **YES** |
| `tests/cli/commands/learn.test.ts` | 61, 62, 205 | TEST_ONLY | Random success/timing values | Easy | **YES** |
| `tests/code-intelligence/search/VectorSearch.test.ts` | 35, 116 | TEST_ONLY | Random embeddings | Easy | **YES** |
| `tests/code-intelligence/chunking/fixtures/sample-large.ts` | 355 | TEST_ONLY | Random ID generation | Easy | No (ID gen) |
| `tests/code-intelligence/integration/RuVectorIntegration.test.ts` | 88, 163, 164, 198, 271, 319, 352 | TEST_ONLY | Random embeddings | Medium | **YES** |
| `tests/utils/testPrioritizer.test.ts` | 362-369 | TEST_ONLY | Random test metadata | Easy | **YES** |
| `tests/utils/sublinear/coverageOptimizer.test.ts` | 302, 303 | TEST_ONLY | Random weights, difficulty | Easy | **YES** |
| `tests/voting/orchestrator.test.ts` | 81, 82 | TEST_ONLY | Random scores, confidence | Easy | **YES** |
| `tests/providers/OllamaProvider.test.ts` | 437, 460 | TEST_ONLY | Mock embeddings | Easy | **YES** |
| `tests/n8n/n8n-agent-test-suite.test.ts` | 85 | TEST_ONLY | Random latency | Easy | **YES** |
| `tests/n8n/mock-n8n-server.ts` | 347 | TEST_ONLY | Random execution time | Easy | **YES** |
| `tests/reasoning/performance.test.ts` | 448-452 | TEST_ONLY | Random pattern metadata | Easy | **YES** |
| `tests/reasoning/cross-project.test.ts` | 391-393 | TEST_ONLY | Random pattern metadata | Easy | **YES** |
| `tests/reasoning/versioning.test.ts` | 401 | TEST_ONLY | Random confidence | Easy | **YES** |
| `tests/reasoning/accuracy.test.ts` | 311-313 | TEST_ONLY | Random pattern metadata | Easy | **YES** |
| `tests/integration/multi-agent-workflows.test.ts` | 25 | TEST_ONLY | Random agent ID | Easy | No (ID gen) |
| `tests/integration/ruvector-self-learning.test.ts` | 97, 265, 275, 290 | TEST_ONLY | Random embeddings | Medium | **YES** |
| `tests/integration/learning-performance.test.ts` | 127-597 (10+ occurrences) | TEST_ONLY | Random confidence, success rates | Medium | **YES** |
| `tests/integration/neural-training-system.test.ts` | 61-393 (15+ occurrences) | TEST_ONLY | Random metrics, features | Medium | **YES** |
| `tests/integration/RuVector.SelfLearning.test.ts` | 43, 59 | TEST_ONLY | Random embeddings | Easy | **YES** |
| `tests/integration/claude-flow-coordination.test.ts` | 298 | TEST_ONLY | Random progress | Easy | **YES** |
| `tests/integration/phase2/phase2-resource-usage.test.ts` | 172, 173 | TEST_ONLY | Random test results | Easy | **YES** |
| `tests/integration/neural-agent-integration.test.ts` | 728-749 (7 occurrences) | TEST_ONLY | Random pass rates, durations | Medium | **YES** |
| `tests/integration/learning/phase0-integration.test.ts` | 47, 166 | TEST_ONLY | Random embeddings, temp dir ID | Easy | **YES** |
| `tests/integration/learning/learning-improvement-proof.test.ts` | 77-81 | TEST_ONLY | Random test metrics | Easy | **YES** |
| `tests/integration/learning/learning-pipeline.test.ts` | 706 | TEST_ONLY | Random timestamp | Easy | **YES** |
| `tests/integration/filtered-handlers.test.ts` | 33-188 (25+ occurrences) | TEST_ONLY | Random coverage, results, metrics | Hard | **YES** |
| `tests/integration/code-intelligence/analysis/mincut/integration.test.ts` | 276 | TEST_ONLY | Random edge weights | Easy | **YES** |
| `tests/run-tests.ts` | 227 | TEST_ONLY | Random test count | Easy | No |

---

### 2. src/learning/ Directory (P1 - High Priority)

Core learning algorithms - affects reproducibility of ML training.

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/learning/ExperienceReplayBuffer.ts` | 115, 135 | SIMULATION | Random sampling from buffer | Medium | **YES** |
| `src/learning/baselines/BaselineCollector.ts` | 288-296 | SIMULATION | Simulating baseline metrics | Easy | **YES** |
| `src/learning/baselines/StandardTaskSuite.ts` | 806 | ID_GENERATION | Task ID generation | Easy | No |
| `src/learning/algorithms/PPOLearner.ts` | 150, 384 | RUNTIME | Action sampling, shuffle | Medium | **YES** |
| `src/learning/QLearningLegacy.ts` | 98, 99, 116 | RUNTIME | Epsilon-greedy exploration | Medium | **YES** |
| `src/learning/algorithms/AbstractRLLearner.ts` | 82, 83, 100 | RUNTIME | Epsilon-greedy exploration | Medium | **YES** |
| `src/learning/algorithms/MAMLMetaLearner.ts` | 316 | RUNTIME | Experience shuffling | Easy | **YES** |
| `src/learning/algorithms/ActorCriticLearner.ts` | 130, 131, 147 | RUNTIME | Action sampling | Medium | **YES** |
| `src/learning/synthesis/ClusteringEngine.ts` | 312, 327 | RUNTIME | K-means++ initialization | Medium | **YES** |
| `src/learning/FederatedManager.ts` | 100, 216, 358, 391, 442 | RUNTIME | Weight initialization, noise | Hard | **YES** |
| `src/learning/ExperienceSharingProtocol.ts` | 533 | RUNTIME | Peer shuffling | Easy | **YES** |
| `src/learning/transfer/TransferValidator.ts` | 409 | ID_GENERATION | Validation ID | Easy | No |

---

### 3. src/agents/n8n/ Directory (P2 - Medium Priority)

n8n workflow agents - affects workflow testing reproducibility.

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/agents/n8n/N8nCIOrchestratorAgent.ts` | 169 | ID_GENERATION | Run ID generation | Easy | No |
| `src/agents/n8n/N8nAuditPersistence.ts` | 353 | ID_GENERATION | Audit ID generation | Easy | No |
| `src/agents/n8n/N8nTestHarness.ts` | 103, 129, 140 | SIMULATION | Error injection probability | Medium | **YES** |
| `src/agents/n8n/N8nReplayabilityTesterAgent.ts` | 1258 | ID_GENERATION | Fixture ID generation | Easy | No |
| `src/agents/n8n/N8nChaosTesterAgent.ts` | 825 | RUNTIME | Random node selection | Medium | **YES** |

---

### 4. src/mcp/tools/qe/ Directory (P2 - Medium Priority)

QE tools - many simulation/mock uses.

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/mcp/tools/qe/fleet/index.ts` | 704-1192 (20+ occurrences) | SIMULATION | Fleet status simulation, metrics | Hard | No (demo data) |
| `src/mcp/handlers/learning/learning-store-pattern.ts` | 74 | ID_GENERATION | Pattern ID | Easy | No |
| `src/mcp/tools/qe/performance/monitor-realtime.ts` | 208-226 (7 occurrences) | SIMULATION | Simulated metrics | Medium | No (demo) |
| `src/mcp/tools/qe/requirements/index.ts` | 89 | ID_GENERATION | Request ID | Easy | No |
| `src/mcp/tools/qe/performance/generate-report.ts` | 269 | ID_GENERATION | Report ID | Easy | No |
| `src/mcp/tools/qe/requirements/validate-requirements.ts` | 1021 | ID_GENERATION | Validation ID | Easy | No |
| `src/mcp/tools/qe/performance/run-benchmark.ts` | 199 | SIMULATION | Variance simulation | Easy | **YES** |
| `src/mcp/tools/qe/requirements/generate-bdd-scenarios.ts` | 944 | ID_GENERATION | BDD generation ID | Easy | No |
| `src/mcp/tools/qe/regression/analyze-risk.ts` | 757 | SIMULATION | Risk score variance | Easy | **YES** |
| `src/mcp/tools/qe/regression/select-tests.ts` | 530, 535 | SIMULATION | Failure probability, ML confidence | Easy | **YES** |
| `src/mcp/tools/qe/flaky-detection/stabilize-auto.ts` | 563, 564 | SIMULATION | Flaky test simulation | Easy | **YES** |
| `src/mcp/handlers/test/test-execute-parallel.ts` | 294 | RUNTIME | Random dependency check | Easy | **YES** |
| `src/mcp/tools/qe/quality-gates/*.ts` | Multiple | ID_GENERATION | Various IDs | Easy | No |
| `src/mcp/tools/qe/security/detect-vulnerabilities.ts` | 380-873 (20+ occurrences) | SIMULATION | Vulnerability simulation | Hard | No (demo) |
| `src/mcp/tools/qe/security/validate-compliance.ts` | 458, 539, 604 | SIMULATION | Compliance findings | Medium | No (demo) |
| `src/mcp/tools/qe/test-data/generate-test-data.ts` | 400 | ID_GENERATION | Request ID | Easy | No |
| `src/mcp/tools/qe/test-data/mask-sensitive-data.ts` | 254 | RUNTIME | Data masking | Easy | No |

---

### 5. src/memory/ Directory (P1 - High Priority)

Memory/vector operations - affects search reproducibility.

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/memory/__tests__/HNSWPatternStore.test.ts` | 20, 159 | TEST_ONLY | Random embeddings | Easy | **YES** |

---

### 6. src/visualization/ Directory (P3 - Low Priority)

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/visualization/api/RestEndpoints.ts` | 514 | ID_GENERATION | Request ID | Easy | No |
| `src/visualization/api/WebSocketServer.ts` | 675 | ID_GENERATION | Client ID | Easy | No |

---

### 7. src/output/ Directory (P3 - Low Priority)

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/output/OutputFormatterImpl.ts` | 653 | ID_GENERATION | Hash salt | Easy | No |

---

### 8. src/providers/ Directory (P3 - Low Priority)

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/providers/HybridRouterComplexityIntegration.ts` | 389 | ID_GENERATION | Request ID | Easy | No |
| `src/providers/RuVectorPostgresAdapter.ts` | 589 | ID_GENERATION | Pattern ID | Easy | No |

---

### 9. src/cli/commands/ Directory (P2 - Medium Priority)

| File | Line | Category | Context | Migration Difficulty | Affects Determinism |
|------|------|----------|---------|---------------------|---------------------|
| `src/cli/commands/patterns/extract.ts` | 208, 236 | ID_GENERATION | Pattern IDs | Easy | No |
| `src/cli/commands/constitution.ts` | 750, 757, 758 | SIMULATION | Simulated expertise scores | Easy | No (demo) |

---

## Migration Priorities

### P0 - Critical (Test Determinism) - 60+ files

Files where `Math.random()` directly affects test outcomes. These should be migrated first for reproducible CI/CD.

**Top Priority Files:**
1. `tests/learning/performance.test.ts` - 20+ occurrences
2. `tests/integration/filtered-handlers.test.ts` - 25+ occurrences
3. `tests/integration/neural-training-system.test.ts` - 15+ occurrences
4. `tests/benchmarks/FlakyDetectionBenchmark.ts` - 15+ occurrences
5. `tests/integration/learning-performance.test.ts` - 10+ occurrences
6. `tests/routing/cost-savings.test.ts` - 12+ occurrences
7. `tests/learning/PPOLearner.test.ts` - 7 occurrences
8. `tests/code-intelligence/integration/RuVectorIntegration.test.ts` - 7 occurrences
9. `tests/integration/neural-agent-integration.test.ts` - 7 occurrences
10. `tests/benchmarks/learning-performance.bench.ts` - 5 occurrences

### P1 - High Priority (ML Reproducibility) - 12 files

Learning algorithms and experience replay - critical for reproducible ML training.

**Files:**
1. `src/learning/FederatedManager.ts` - 5 occurrences (weight init)
2. `src/learning/algorithms/ActorCriticLearner.ts` - 3 occurrences
3. `src/learning/QLearningLegacy.ts` - 3 occurrences
4. `src/learning/algorithms/AbstractRLLearner.ts` - 3 occurrences
5. `src/learning/ExperienceReplayBuffer.ts` - 2 occurrences
6. `src/learning/algorithms/PPOLearner.ts` - 2 occurrences
7. `src/learning/synthesis/ClusteringEngine.ts` - 2 occurrences
8. `src/learning/baselines/BaselineCollector.ts` - 4 occurrences

### P2 - Medium Priority (Runtime Code) - 10 files

Runtime code that could benefit from determinism.

**Files:**
1. `src/agents/n8n/N8nTestHarness.ts` - 3 occurrences
2. `src/agents/n8n/N8nChaosTesterAgent.ts` - 1 occurrence
3. `src/mcp/tools/qe/regression/*.ts` - 4 occurrences
4. `src/mcp/handlers/test/test-execute-parallel.ts` - 1 occurrence

### P3 - Low Priority (ID Generation) - 20+ files

ID generation should consider `crypto.randomUUID()` instead.

---

## Migration Script Templates

### Pattern 1: Simple Random Value

```typescript
// Before
const value = Math.random();

// After (with SeededRandom instance)
const value = seededRandom.random();
```

### Pattern 2: Random Integer in Range

```typescript
// Before
const index = Math.floor(Math.random() * array.length);

// After
const index = seededRandom.randomInt(0, array.length - 1);
```

### Pattern 3: Random Float in Range

```typescript
// Before
const value = min + Math.random() * (max - min);

// After
const value = seededRandom.randomFloat(min, max);
```

### Pattern 4: Array Shuffle

```typescript
// Before
const shuffled = [...array].sort(() => Math.random() - 0.5);

// After
const shuffled = seededRandom.shuffle([...array]);
```

### Pattern 5: ID Generation (Consider UUID)

```typescript
// Before
const id = `prefix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// After (Option A: SeededRandom for determinism)
const id = `prefix-${Date.now()}-${seededRandom.randomString(9)}`;

// After (Option B: crypto.randomUUID for uniqueness)
import { randomUUID } from 'crypto';
const id = `prefix-${randomUUID()}`;
```

### Pattern 6: Probability Check

```typescript
// Before
if (Math.random() < probability) { ... }

// After
if (seededRandom.random() < probability) { ... }
```

### Pattern 7: Random Selection from Array

```typescript
// Before
const item = items[Math.floor(Math.random() * items.length)];

// After
const item = seededRandom.sample(items);
```

### Pattern 8: Weighted Random Selection

```typescript
// Before
let random = Math.random() * totalWeight;
for (const item of items) {
  random -= item.weight;
  if (random <= 0) return item;
}

// After
const item = seededRandom.weightedSample(items, item => item.weight);
```

---

## Recommended SeededRandom Interface

Based on the usage patterns found, here is the recommended interface:

```typescript
interface SeededRandom {
  // Core
  random(): number;  // [0, 1)

  // Integers
  randomInt(min: number, max: number): number;  // inclusive

  // Floats
  randomFloat(min: number, max: number): number;

  // Arrays
  shuffle<T>(array: T[]): T[];
  sample<T>(array: T[]): T;
  sampleN<T>(array: T[], n: number): T[];
  weightedSample<T>(array: T[], weightFn: (item: T) => number): T;

  // Strings
  randomString(length: number, charset?: string): string;

  // Utility
  reset(seed?: number): void;
  fork(): SeededRandom;  // Create independent instance
}
```

---

## Existing SeededRandom Implementation

The codebase already has a partial implementation in `src/learning/FlakyPredictionModel.ts`:

```typescript
if (seed !== undefined) {
  let currentSeed = seed;
  this.seededRandom = () => {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 2147483648;
    return currentSeed / 2147483648;
  };
}
```

This should be extracted into a shared utility class.

---

## Estimated Migration Effort

| Priority | Files | Occurrences | Effort |
|----------|-------|-------------|--------|
| P0 | 40 | 100+ | 16-24 hours |
| P1 | 12 | 25 | 4-6 hours |
| P2 | 10 | 15 | 2-4 hours |
| P3 | 20+ | 30 | 4-6 hours (optional) |

**Total: 26-40 hours**

---

## Next Steps

1. **Create shared SeededRandom utility** in `src/utils/SeededRandom.ts`
2. **Add test helper** in `tests/utils/testSeededRandom.ts` with default seed
3. **Start with P0 files** - prioritize files with most occurrences
4. **Add seed parameter to test setup** - allow reproducible test runs
5. **Consider UUID for ID generation** - P3 items may not need SeededRandom

---

## References

- Linear algebra constant (1664525) is from Numerical Recipes LCG
- Alternative: Consider using `seedrandom` npm package for more robust implementation
- For cryptographic uses, continue using `crypto.randomBytes()` or `crypto.randomUUID()`
