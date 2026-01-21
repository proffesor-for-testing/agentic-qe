# Goal-Oriented Action Plan (GOAP): RuVector Nervous System Integration

## Executive Summary

This document provides a comprehensive Goal-Oriented Action Plan for integrating the bio-inspired RuVector Nervous System into the Agentic QE Fleet. Using A* pathfinding through the action state space, this plan identifies the optimal sequence of actions to transform the current QE architecture into a neuromorphic-enhanced system with sub-microsecond pattern matching and one-shot learning capabilities.

> **🎉 CRITICAL UPDATE (2026-01-04)**: The npm package `@ruvector/nervous-system-wasm@0.1.29` is **already published** to npm! This eliminates Phase 0 WASM compilation entirely, reducing total timeline from **4 weeks to ~2.5 weeks** (40% reduction).

### Pre-Built Package Available

```bash
npm install @ruvector/nervous-system-wasm
```

**Package Details:**
- **Version**: 0.1.29 (published 3 days ago)
- **Size**: 258KB (WASM + JS + TypeScript definitions)
- **Dependencies**: None
- **Maintainer**: ruvnet

**Exported Components (ready to use):**
| Component | Class | Performance Target |
|-----------|-------|-------------------|
| One-shot Learning | `BTSPLayer`, `BTSPAssociativeMemory` | Immediate (no iteration) |
| HDC Memory | `Hypervector`, `HdcMemory` | <50ns bind, <100ns similarity |
| Instant Decisions | `WTALayer`, `KWTALayer` | <1μs compete, <10μs k-select |
| Attention Bottleneck | `GlobalWorkspace`, `WorkspaceItem` | <10μs broadcast |

---

## 1. State Space Analysis

### 1.1 Current State (S0)

| Component | Implementation | Performance | Limitations |
|-----------|---------------|-------------|-------------|
| **Pattern Store** | `RuVectorPatternStore` with HNSW | 192K QPS, 1.5us p50 | Batch training required |
| **Learning Engine** | Q-Learning/SARSA/PPO/Actor-Critic | 32+ experiences needed | No one-shot learning |
| **Memory Manager** | `SwarmMemoryManager` + PostgreSQL | ~10ms queries | High latency for reflexes |
| **Code Intelligence** | `CodeChunkStore` with embeddings | Good accuracy | No real-time adaptation |
| **Event Processing** | Synchronous request/response | Seconds latency | No event streaming |
| **Duty Cycling** | None | Always-on compute | High idle costs |

### 1.2 Target State (Sg)

| Component | Implementation | Performance | Benefits |
|-----------|---------------|-------------|----------|
| **Pattern Store** | HDC Hypervectors + HNSW hybrid | <100ns binding, 10x faster | Near-instant pattern matching |
| **Learning Engine** | BTSP one-shot learning | 1 experience learning | Immediate adaptation |
| **Reflex Layer** | K-WTA competition | <1us decisions (90%) | Fast routine handling |
| **Attention System** | Global Workspace (4-7 items) | -50% coordination overhead | Focused processing |
| **Event Processing** | EventBus with DVS streams | 10K+ events/ms | Real-time responsiveness |
| **Duty Cycling** | Circadian Controller | 5-50x compute savings | Intelligent resource use |

### 1.3 State Gap Analysis

```
Gap = Sg - S0 = {
  HDC_memory: false -> true,
  BTSP_learning: false -> true,
  KWTA_reflex: false -> true,
  global_workspace: false -> true,
  circadian_control: false -> true,
  wasm_bindings: false -> true
}
```

---

## 2. Available Actions

### 2.1 Action Catalog

> **⚡ UPDATED**: With `@ruvector/nervous-system-wasm` already published, Phase 0 is reduced from 4.5 days to 0.5 days.

| Action ID | Name | Preconditions | Effects | Cost (days) | Status |
|-----------|------|---------------|---------|-------------|--------|
| ~~A0.1~~ | ~~Setup Rust WASM toolchain~~ | ~~None~~ | ~~wasm_toolchain: true~~ | ~~0.5~~ | **SKIPPED** |
| ~~A0.2~~ | ~~Compile nervous-system to WASM~~ | ~~wasm_toolchain~~ | ~~wasm_module: true~~ | ~~2~~ | **SKIPPED** |
| ~~A0.3~~ | ~~Generate TypeScript bindings~~ | ~~wasm_module~~ | ~~ts_bindings: true~~ | ~~1~~ | **SKIPPED** |
| **A0.NEW** | **Install npm package** | None | wasm_runtime: true, ts_bindings: true | **0.5** | **NEW** |
| A1.1 | Design HDC adapter interface | ts_bindings | hdc_interface: true | 0.5 | Reduced |
| A1.2 | Implement HdcMemoryAdapter | hdc_interface, wasm_runtime | hdc_adapter: true | 2 | Reduced |
| A1.3 | Integrate with RuVectorPatternStore | hdc_adapter | HDC_memory: true | 1.5 | Reduced |
| A1.4 | Write HDC migration layer | HDC_memory | hdc_migration: true | 1 | Same |
| A2.1 | Design ReflexLayer interface | ts_bindings | reflex_interface: true | 0.5 | Reduced |
| A2.2 | Implement K-WTA TypeScript wrapper | reflex_interface, wasm_runtime | kwta_wrapper: true | 1 | Reduced |
| A2.3 | Integrate reflex decisions | kwta_wrapper | KWTA_reflex: true | 1.5 | Reduced |
| A3.1 | Design BTSPAdapter interface | ts_bindings | btsp_interface: true | 0.5 | Reduced |
| A3.2 | Implement BTSP TypeScript wrapper | btsp_interface, wasm_runtime | btsp_wrapper: true | 2 | Reduced |
| A3.3 | Integrate with LearningEngine | btsp_wrapper | BTSP_learning: true | 2.5 | Reduced |
| A4.1 | Design GlobalWorkspace adapter | ts_bindings | workspace_interface: true | 0.5 | Reduced |
| A4.2 | Implement workspace integration | workspace_interface, wasm_runtime | workspace_adapter: true | 1.5 | Reduced |
| A4.3 | Connect agents to workspace | workspace_adapter | global_workspace: true | 1 | Reduced |
| A5.1 | Design CircadianController adapter | ts_bindings | circadian_interface: true | 0.5 | Same |
| A5.2 | Implement duty cycling | circadian_interface | circadian_adapter: true | 1 | Same |
| A5.3 | Integrate with agent lifecycle | circadian_adapter | circadian_control: true | 1 | Same |

### 2.2 Cost Summary

| Phase | Original Cost | **Revised Cost** | Savings |
|-------|---------------|------------------|---------|
| Phase 0 (Foundation) | 4.5 days | **0.5 days** | 89% |
| Phase 1 (HDC Memory) | 7 days | **5 days** | 29% |
| Phase 2 (K-WTA Reflex) | 5 days | **3 days** | 40% |
| Phase 3 (BTSP Learning) | 7 days | **5 days** | 29% |
| Phase 4 (Global Workspace) | 5 days | **3 days** | 40% |
| Phase 5 (Circadian) | 2.5 days | **2.5 days** | 0% |
| **TOTAL** | **31 days** | **19 days** | **39%** |

---

## 3. GOAP Plan Generation (A* Search)

### 3.1 Optimal Action Sequence

Using A* with heuristic h(s) = count(false predicates in Sg), the optimal plan is:

```
Plan = [
  Phase 0: A0.1 -> A0.2 -> A0.3 -> A0.4  (Foundation)
  Phase 1: A1.1 -> A1.2 -> A1.3 -> A1.4  (HDC Memory)
  Phase 2: A2.1 -> A2.2 -> A2.3          (Reflex Layer)
  Phase 3: A3.1 -> A3.2 -> A3.3          (BTSP Learning)
  Phase 4: A4.1 -> A4.2 -> A4.3          (Global Workspace)
  Phase 5: A5.1 -> A5.2 -> A5.3          (Circadian)
]
```

### 3.2 Parallelization Opportunities

```
Parallel Group 1 (after A0.4):
  - A1.1, A2.1, A3.1, A4.1, A5.1 (all interface designs)

Parallel Group 2 (after interfaces):
  - A1.2, A2.2, A3.2, A4.2, A5.2 (all adapters)

Parallel Group 3 (after adapters):
  - A1.3, A2.3, A3.3, A4.3, A5.3 (all integrations)
```

---

## 4. Detailed Phase Plans

### Phase 0: Package Installation (SIMPLIFIED ✅)

> **🎉 DRAMATICALLY SIMPLIFIED**: The npm package `@ruvector/nervous-system-wasm@0.1.29` is already published!
> Original 4.5-day WASM compilation phase reduced to **0.5 days** (just npm install + verification).

**Duration**: 0.5 days (was 4.5 days - **89% reduction**)
**Risk Level**: LOW (was HIGH)
**Agents**: coder

#### Milestone 0.NEW: Install and Verify npm Package (0.5 days)

**Success Criteria**:
- Package installed successfully
- WASM loads in Node.js 20+
- All exported classes accessible
- TypeScript types working

**Actions**:
```bash
# Install the pre-built package
npm install @ruvector/nervous-system-wasm

# Verify installation
node -e "
const ns = require('@ruvector/nervous-system-wasm');
ns.default().then(() => {
  console.log('Version:', ns.version());
  console.log('Mechanisms:', ns.available_mechanisms());
  console.log('✅ Package loaded successfully');
});
"
```

**Verification Script** (create `/workspaces/agentic-qe/scripts/verify-nervous-system.ts`):
```typescript
import init, {
  BTSPLayer,
  Hypervector,
  HdcMemory,
  WTALayer,
  KWTALayer,
  GlobalWorkspace,
  WorkspaceItem,
  version,
  available_mechanisms,
} from '@ruvector/nervous-system-wasm';

async function verify() {
  await init();

  console.log('✅ WASM initialized');
  console.log('Version:', version());
  console.log('Mechanisms:', available_mechanisms());

  // Test HDC
  const v1 = Hypervector.random();
  const v2 = Hypervector.random();
  const bound = v1.bind(v2);
  console.log('✅ HDC binding works');

  // Test memory
  const memory = new HdcMemory();
  memory.store('test', v1);
  const results = memory.retrieve(v1, 0.9);
  console.log('✅ HDC memory works, retrieved:', results.length, 'items');

  // Test BTSP
  const btsp = new BTSPLayer(100, 2000.0);
  const pattern = new Float32Array(100).fill(0.1);
  btsp.one_shot_associate(pattern, 1.0);
  console.log('✅ BTSP one-shot learning works');

  // Test K-WTA
  const kwta = new KWTALayer(100, 10);
  const activations = new Float32Array(100);
  activations[42] = 1.0;
  const winners = kwta.select(activations);
  console.log('✅ K-WTA selection works, winners:', winners.length);

  // Test Global Workspace
  const workspace = new GlobalWorkspace(7);
  const item = new WorkspaceItem(new Float32Array([1, 2, 3]), 0.9, 1, Date.now());
  workspace.broadcast(item);
  console.log('✅ Global Workspace works');

  console.log('\n🎉 All nervous system components verified!');
}

verify().catch(console.error);
```

**Key Files to Create**:
- `/workspaces/agentic-qe/src/nervous-system/index.ts` - Re-exports from npm package
- `/workspaces/agentic-qe/scripts/verify-nervous-system.ts` - Verification script

**Rollback**: Not needed - package is published and stable

---

### ~~Phase 0 (ORIGINAL - SKIPPED)~~

<details>
<summary>Original Phase 0 plan (preserved for reference - NOT NEEDED)</summary>

#### ~~Milestone 0.1: WASM Toolchain Setup (0.5 days)~~ SKIPPED

~~**Success Criteria**:~~
~~- wasm-pack installed and functional~~
~~- wasm32-unknown-unknown target available~~
~~- wasm-bindgen configured~~

#### ~~Milestone 0.2: Nervous System WASM Compilation (2 days)~~ SKIPPED

~~**Success Criteria**:~~
~~- `ruvector_nervous_system.wasm` compiles without errors~~
~~- All HDC, BTSP, K-WTA, and Circadian modules included~~
~~- Size < 2MB (for reasonable load times)~~

#### ~~Milestone 0.3: TypeScript Bindings (1 day)~~ SKIPPED

~~**Success Criteria**:~~
~~- TypeScript definitions generated for all exported types~~
~~- ESM and CommonJS module support~~
~~- Type-safe wrapper functions~~

#### ~~Milestone 0.4: Node.js Runtime Integration (1 day)~~ SKIPPED

~~**Success Criteria**:~~
~~- WASM loads successfully in Node.js 20+~~
~~- Memory management works correctly~~
~~- Performance overhead < 5% vs native~~

</details>

---

### Phase 1: HDC Pattern Storage (HIGHEST VALUE)

**Duration**: 7 days
**Risk Level**: MEDIUM
**Agents**: coder, tester, reviewer

#### Milestone 1.1: HDC Adapter Interface Design (1 day)

**Success Criteria**:
- Interface compatible with IPatternStore
- Hypervector binding/unbinding operations defined
- Similarity search API designed

**Key Interface**:
```typescript
// /workspaces/agentic-qe/src/nervous-system/HdcMemoryAdapter.ts

export interface IHdcMemory {
  // Core hypervector operations
  createHypervector(seed?: number): Hypervector;
  bind(a: Hypervector, b: Hypervector): Hypervector;
  bundle(vectors: Hypervector[]): Hypervector;
  similarity(a: Hypervector, b: Hypervector): number;

  // Associative memory
  store(key: string, vector: Hypervector): void;
  retrieve(query: Hypervector, threshold: number): Array<{key: string, score: number}>;

  // Pattern encoding
  encodePattern(pattern: TestPattern): Hypervector;
  decodePattern(vector: Hypervector): Partial<TestPattern>;
}
```

#### Milestone 1.2: HdcMemoryAdapter Implementation (3 days)

**Success Criteria**:
- All IHdcMemory methods implemented
- Pattern encoding preserves semantic similarity
- <100ns binding operations (via WASM)

**Key Implementation Details**:
```typescript
export class HdcMemoryAdapter implements IHdcMemory {
  private wasm: NervousSystemWasm;
  private memory: HdcMemory;
  private encoder: PatternEncoder;

  async initialize(): Promise<void> {
    this.wasm = await loadNervousSystem();
    this.memory = this.wasm.HdcMemory.new();
    this.encoder = new PatternEncoder(this.wasm);
  }

  encodePattern(pattern: TestPattern): Hypervector {
    // Role-filler encoding: bind(role_vector, filler_vector)
    const typeVec = this.wasm.Hypervector.from_seed(hash(pattern.type));
    const domainVec = this.wasm.Hypervector.from_seed(hash(pattern.domain));

    // Bundle role-filler pairs
    return this.wasm.bundle([
      this.bind(TYPE_ROLE, typeVec),
      this.bind(DOMAIN_ROLE, domainVec),
      // ... content encoding via learned embeddings
    ]);
  }
}
```

#### Milestone 1.3: RuVectorPatternStore Integration (2 days)

**Success Criteria**:
- HDC operates alongside HNSW (dual-write)
- Fast path uses HDC for <100ns lookups
- Fallback to HNSW for complex queries

**Integration Pattern**:
```typescript
// Extend RuVectorPatternStore
export class HybridPatternStore extends RuVectorPatternStore {
  private hdcAdapter: HdcMemoryAdapter;

  async searchSimilar(query: number[], options: PatternSearchOptions) {
    // Fast path: HDC binding check
    const hdcQuery = this.hdcAdapter.encodeEmbedding(query);
    const hdcResults = this.hdcAdapter.retrieve(hdcQuery, 0.9);

    if (hdcResults.length > 0 && hdcResults[0].score > 0.95) {
      // High-confidence HDC match - use directly
      return this.hydrateResults(hdcResults);
    }

    // Fallback to HNSW for lower-confidence or complex queries
    return super.searchSimilar(query, options);
  }
}
```

#### Milestone 1.4: Migration Layer (1 day)

**Success Criteria**:
- Existing patterns migrated to HDC format
- No data loss during migration
- Dual-write ensures consistency

---

### Phase 2: K-WTA Reflex Layer (HIGH VALUE)

**Duration**: 5 days
**Risk Level**: MEDIUM
**Agents**: coder, tester

#### Milestone 2.1: Reflex Layer Interface Design (1 day)

**Success Criteria**:
- Decision interface defined
- Configurable K value for K-WTA
- Lateral inhibition parameters exposed

**Key Interface**:
```typescript
// /workspaces/agentic-qe/src/nervous-system/ReflexLayer.ts

export interface IReflexLayer {
  // Configure competition
  setK(k: number): void;
  setInhibition(strength: number, radius: number): void;

  // Fast decision making
  compete(activations: number[]): number[];  // Returns winner indices
  shouldDelegate(pattern: TestPattern): boolean;  // Reflex vs deliberate

  // Performance
  getDecisionLatency(): { p50: number, p95: number };
}
```

#### Milestone 2.2: K-WTA TypeScript Wrapper (2 days)

**Success Criteria**:
- K-WTA layer operational via WASM
- <1us competition for 1000 neurons
- Configurable sparsity levels

#### Milestone 2.3: Reflex Integration (2 days)

**Success Criteria**:
- 90% of routine decisions handled by reflex
- Complex decisions delegated to full LearningEngine
- Decision routing overhead < 100ns

**Integration Pattern**:
```typescript
export class ReflexEnhancedLearningEngine extends LearningEngine {
  private reflexLayer: ReflexLayer;

  async recommendStrategy(state: TaskState): Promise<StrategyRecommendation> {
    // First: Attempt reflex decision
    const reflexDecision = this.reflexLayer.attemptReflex(state);

    if (reflexDecision.confidence > 0.9) {
      // High-confidence reflex - use directly
      return reflexDecision;
    }

    // Delegate to full deliberation
    return super.recommendStrategy(state);
  }
}
```

---

### Phase 3: BTSP One-Shot Learning (TRANSFORMATIVE)

**Duration**: 7 days
**Risk Level**: HIGH
**Agents**: researcher, coder, tester, reviewer

#### Milestone 3.1: BTSP Adapter Interface Design (1 day)

**Success Criteria**:
- One-shot association interface defined
- Eligibility trace parameters exposed
- Integration with existing experience types

**Key Interface**:
```typescript
// /workspaces/agentic-qe/src/nervous-system/BTSPAdapter.ts

export interface IBTSPLearner {
  // One-shot learning
  associateOneShot(pattern: number[], target: number): void;
  associateBatch(pairs: Array<{pattern: number[], target: number}>): void;

  // Recall
  recall(query: number[]): number;
  recallWithConfidence(query: number[]): { value: number, confidence: number };

  // Plateau detection
  detectPlateau(prediction: number, actual: number): boolean;

  // Memory management
  getCapacity(): number;
  consolidate(): void;  // EWC-style consolidation
}
```

#### Milestone 3.2: BTSP TypeScript Wrapper (3 days)

**Success Criteria**:
- BTSPLayer and BTSPAssociativeMemory operational
- <100us for 10K synapse one-shot learning
- Bidirectional plasticity working correctly

**Key Implementation**:
```typescript
export class BTSPAdapter implements IBTSPLearner {
  private btspLayers: Map<string, BTSPLayer>;
  private wasm: NervousSystemWasm;

  associateOneShot(pattern: number[], target: number): void {
    const layer = this.getOrCreateLayer(pattern.length);

    // Single-step weight update via BTSP
    // No iteration needed - immediate learning
    layer.one_shot_associate(
      new Float32Array(pattern),
      target
    );
  }

  // Learning from single test failure
  async learnFromFailure(
    testPattern: TestPattern,
    errorSignal: number
  ): Promise<void> {
    const encoded = this.encodePattern(testPattern);

    // One-shot association: pattern -> error correction
    this.associateOneShot(encoded, -errorSignal);

    // Trigger plateau potential for consolidation
    if (Math.abs(errorSignal) > 0.5) {
      await this.consolidate();
    }
  }
}
```

#### Milestone 3.3: LearningEngine Integration (3 days)

**Success Criteria**:
- Learning from 1 experience vs 32
- Backward compatible with existing RL algorithms
- Graceful degradation when BTSP unavailable

**Integration Pattern**:
```typescript
export class BTSPEnhancedLearningEngine extends LearningEngine {
  private btspAdapter: BTSPAdapter;
  private btspEnabled: boolean = false;

  async learnFromExecution(
    task: unknown,
    result: unknown,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome> {
    // Try BTSP one-shot learning first
    if (this.btspEnabled) {
      const experience = this.extractExperience(task, result, feedback);

      // High-signal experiences get one-shot learning
      if (Math.abs(experience.reward) > 0.5) {
        await this.btspAdapter.learnFromExperience(experience);

        // Also update traditional Q-table for hybrid learning
        await this.updateQTable(experience);

        return this.createOutcome(true, experience.reward);
      }
    }

    // Fall back to standard RL for low-signal experiences
    return super.learnFromExecution(task, result, feedback);
  }
}
```

---

### Phase 4: Global Workspace Coordination (MEDIUM VALUE)

**Duration**: 5 days
**Risk Level**: LOW
**Agents**: coder, tester

#### Milestone 4.1: Global Workspace Adapter (1 day)

**Success Criteria**:
- Representation broadcast interface defined
- Competition mechanism accessible
- Capacity limits configurable (4-7 items)

**Key Interface**:
```typescript
// /workspaces/agentic-qe/src/nervous-system/GlobalWorkspace.ts

export interface IGlobalWorkspace {
  // Broadcast
  broadcast(rep: AgentRepresentation): boolean;

  // Competition
  compete(): void;

  // Retrieval
  retrieveTopK(k: number): AgentRepresentation[];

  // Metrics
  getOccupancy(): number;
  getSynchronization(): number;
}

export interface AgentRepresentation {
  agentId: string;
  content: number[];
  salience: number;
  timestamp: number;
}
```

#### Milestone 4.2: Workspace Implementation (2 days)

**Success Criteria**:
- Global Workspace operational via WASM
- Miller's Law capacity (4-7 items)
- Salience-based competition working

#### Milestone 4.3: Agent Coordination Integration (2 days)

**Success Criteria**:
- Agents broadcast to workspace
- Coherent agent attention
- -50% coordination overhead

**Integration Pattern**:
```typescript
export class WorkspaceCoordinatedAgent extends BaseAgent {
  private workspace: GlobalWorkspace;

  async execute(task: QETask): Promise<TaskResult> {
    // Broadcast intention to workspace
    const representation = {
      agentId: this.id,
      content: this.encodeTask(task),
      salience: task.priority,
      timestamp: Date.now()
    };

    this.workspace.broadcast(representation);
    this.workspace.compete();

    // Check if this agent won attention slot
    const winners = this.workspace.retrieveTopK(4);
    const hasAttention = winners.some(w => w.agentId === this.id);

    if (hasAttention) {
      // Full execution with attention
      return await this.executeWithFullResources(task);
    } else {
      // Background execution with reduced resources
      return await this.executeInBackground(task);
    }
  }
}
```

---

### Phase 5: Circadian Duty Cycling (QUICK WIN)

**Duration**: 2.5 days
**Risk Level**: LOW
**Agents**: coder, tester

#### Milestone 5.1: Circadian Adapter (0.5 days)

**Success Criteria**:
- CircadianController accessible from TypeScript
- Phase modulation configurable
- Budget guardrails functional

**Key Interface**:
```typescript
// /workspaces/agentic-qe/src/nervous-system/CircadianController.ts

export interface ICircadianController {
  // Time management
  advance(dt: number): void;

  // Decision gating
  shouldCompute(): boolean;
  shouldLearn(): boolean;
  shouldConsolidate(): boolean;

  // Phase info
  getPhase(): CircadianPhase;
  getDutyFactor(): number;
  getCostReductionFactor(): number;

  // Modulation
  modulate(mod: PhaseModulation): void;
}

export type CircadianPhase = 'Active' | 'Dawn' | 'Dusk' | 'Rest';
```

#### Milestone 5.2: Duty Cycling Implementation (1 day)

**Success Criteria**:
- 4-phase circadian cycle operational
- Duty factors applied to compute decisions
- Phase modulation from external signals

#### Milestone 5.3: Agent Lifecycle Integration (1 day)

**Success Criteria**:
- Agents respect circadian phases
- 5-50x compute savings during Rest
- Smooth phase transitions

**Integration Pattern**:
```typescript
export class CircadianAwareAgent extends BaseAgent {
  private circadian: CircadianController;

  async tick(): Promise<void> {
    this.circadian.advance(1); // 1 second tick

    // Phase-aware operation
    if (this.circadian.shouldCompute()) {
      await this.processActiveQueue();
    }

    if (this.circadian.shouldLearn()) {
      await this.updateLearningModels();
    }

    if (this.circadian.shouldConsolidate()) {
      await this.runConsolidation();
    }
  }

  async handleEvent(event: QEEvent): Promise<void> {
    const importance = this.calculateImportance(event);

    if (this.circadian.shouldReact(importance)) {
      await this.processEvent(event);
    } else {
      // Queue for later processing
      this.deferredQueue.push(event);
    }
  }
}
```

---

## 5. Risk Mitigation

### 5.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WASM compilation fails | Medium | Critical | Fallback to gRPC Rust service |
| Performance regression | Low | High | Benchmark gates at each milestone |
| Memory leaks in WASM | Medium | Medium | Automatic GC integration, memory limits |
| Type safety breaks | Low | Medium | Strict TypeScript, runtime validation |

### 5.2 Integration Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing tests | Medium | High | Dual-write, feature flags |
| Agent behavior changes | Medium | Medium | A/B testing, gradual rollout |
| Data migration issues | Low | High | Backup before migration, rollback scripts |

### 5.3 Rollback Procedures

**Phase 0 Rollback**: Switch to gRPC service mode
```typescript
// In config
export const NERVOUS_SYSTEM_MODE = process.env.NS_MODE || 'wasm';

// Runtime switch
if (NERVOUS_SYSTEM_MODE === 'grpc') {
  return new GrpcNervousSystemClient(config);
} else {
  return new WasmNervousSystemClient(config);
}
```

**Phase 1-5 Rollback**: Feature flag disable
```typescript
// Feature flags in config
export const FEATURES = {
  HDC_MEMORY: process.env.FEATURE_HDC === 'true',
  BTSP_LEARNING: process.env.FEATURE_BTSP === 'true',
  KWTA_REFLEX: process.env.FEATURE_KWTA === 'true',
  GLOBAL_WORKSPACE: process.env.FEATURE_GW === 'true',
  CIRCADIAN: process.env.FEATURE_CIRCADIAN === 'true',
};
```

---

## 6. Parallel Execution Plan

### 6.1 Agent Assignment

```
Phase 0 (Sequential - Critical Path):
  researcher: Analyze WASM requirements, write bindings spec
  coder: Implement WASM compilation, TypeScript bindings
  tester: Verify WASM functionality, write integration tests

Phase 1-5 (Parallel after Phase 0):

  Stream A (HDC + BTSP):
    coder-1: HdcMemoryAdapter, BTSPAdapter
    tester-1: HDC tests, BTSP tests

  Stream B (Reflex + Workspace):
    coder-2: ReflexLayer, GlobalWorkspace
    tester-2: K-WTA tests, workspace tests

  Stream C (Circadian):
    coder-3: CircadianController
    tester-3: Duty cycling tests

  Integration:
    system-architect: Design integration points
    reviewer: Review all implementations
```

### 6.2 Timeline (ACCELERATED ✅)

> **Updated**: With pre-built npm package, timeline reduced from 4 weeks to ~2.5 weeks.

```
Week 1:
  Day 1 (AM): Phase 0 - npm install + verification (0.5 days)
  Day 1 (PM): All interface designs (parallel)
  Day 2-3: Parallel adapter implementations
    - Stream A: HdcMemoryAdapter + BTSPAdapter
    - Stream B: ReflexLayer + GlobalWorkspace
    - Stream C: CircadianController
  Day 4-5: Unit tests for all adapters

Week 2:
  Day 1-2: Integration with existing components
    - HDC → RuVectorPatternStore
    - BTSP → LearningEngine
    - Reflex → BaseAgent
  Day 3-4: Global Workspace agent coordination
  Day 5: Circadian lifecycle integration

Week 3:
  Day 1: Full system integration testing
  Day 2: Performance benchmarking
  Day 3: Migration scripts + documentation
  Day 4-5: A/B testing setup + gradual rollout
```

**Original Timeline**: 4 weeks (31 days)
**Revised Timeline**: 2.5 weeks (19 days)
**Time Saved**: 12 days (39% reduction)

---

## 7. Success Metrics

### 7.1 Performance Benchmarks

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Pattern search p50 | 1.5us | <100ns | `npm run benchmark:hdc` |
| Decision latency (reflex) | N/A | <1us | `npm run benchmark:reflex` |
| Learning examples needed | 32+ | 1 | `npm run test:btsp` |
| Coordination overhead | 100% | -50% | `npm run benchmark:workspace` |
| Idle compute cost | 100% | -80% | `npm run benchmark:circadian` |

### 7.2 Quality Gates

Each phase must pass before proceeding:

1. **Unit Tests**: 100% pass rate
2. **Integration Tests**: 95% pass rate
3. **Performance Tests**: Meet target benchmarks
4. **Memory Tests**: No leaks detected
5. **Backward Compatibility**: All existing tests pass

---

## 8. Implementation Order (Claude Flow Agents)

### 8.1 Parallel Agent Execution

```javascript
// Phase 0: Foundation (sequential, critical path)
[Sequential Message 1]:
  Task("WASM Setup", "Set up Rust WASM toolchain with wasm-pack, wasm-bindgen, and wasm32 target", "coder")

[Sequential Message 2]:
  Task("WASM Compile", "Compile ruvector-nervous-system to WASM with all HDC, BTSP, K-WTA, Circadian modules", "coder")

[Sequential Message 3]:
  Task("TS Bindings", "Generate TypeScript bindings for WASM module with full type safety", "coder")
  Task("WASM Runtime", "Create Node.js WASM loader with memory management", "coder")

// Phase 1-5: Parallel streams after Phase 0 complete
[Parallel Message 4]:
  // Stream A: HDC + Learning
  Task("HDC Adapter", "Implement HdcMemoryAdapter with pattern encoding/decoding", "coder")
  Task("BTSP Adapter", "Implement BTSPAdapter with one-shot learning", "coder")

  // Stream B: Reflex + Coordination
  Task("Reflex Layer", "Implement K-WTA ReflexLayer with <1us decisions", "coder")
  Task("Global Workspace", "Implement GlobalWorkspace with agent coordination", "coder")

  // Stream C: Efficiency
  Task("Circadian Controller", "Implement CircadianController with duty cycling", "coder")

  // Testing (parallel)
  Task("Test Suite", "Write comprehensive tests for all nervous system components", "tester")

  // Architecture
  Task("Integration Design", "Design integration points for all adapters", "system-architect")

[Parallel Message 5]:
  // Integration work (after adapters complete)
  Task("PatternStore Integration", "Integrate HDC with RuVectorPatternStore", "coder")
  Task("LearningEngine Integration", "Integrate BTSP with LearningEngine", "coder")
  Task("Agent Integration", "Integrate Reflex, Workspace, Circadian with agents", "coder")
  Task("Code Review", "Review all implementations for quality and consistency", "reviewer")
```

---

## 9. File Structure

```
/workspaces/agentic-qe/
  src/
    nervous-system/
      index.ts                    # Main exports
      wasm-loader.ts              # WASM initialization
      memory-bridge.ts            # TypeScript/WASM memory bridge

      bindings/
        index.ts                  # Generated bindings
        types.ts                  # TypeScript type definitions

      adapters/
        HdcMemoryAdapter.ts       # HDC pattern store
        BTSPAdapter.ts            # One-shot learning
        ReflexLayer.ts            # K-WTA decisions
        GlobalWorkspace.ts        # Agent coordination
        CircadianController.ts    # Duty cycling

      integration/
        HybridPatternStore.ts     # Extended RuVectorPatternStore
        BTSPLearningEngine.ts     # Extended LearningEngine
        WorkspaceAgent.ts         # Workspace-aware agent
        CircadianAgent.ts         # Circadian-aware agent

      __tests__/
        hdc.test.ts
        btsp.test.ts
        reflex.test.ts
        workspace.test.ts
        circadian.test.ts
        integration.test.ts

    core/memory/
      RuVectorPatternStore.ts     # Modified to support HDC

    learning/
      LearningEngine.ts           # Modified to support BTSP
```

---

## 10. Dependencies

### 10.1 External Dependencies (SIMPLIFIED ✅)

> **Updated**: With pre-built npm package, no Rust/WASM tooling needed!

```json
{
  "dependencies": {
    "@ruvector/nervous-system-wasm": "^0.1.29"
  }
}
```

**That's it!** No Rust toolchain, no wasm-pack, no bazel. Just npm install.

### 10.2 ~~Rust Dependencies~~ (NOT NEEDED)

<details>
<summary>Original Rust dependencies (preserved for reference - NOT NEEDED)</summary>

```toml
[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = "0.3"
console_error_panic_hook = "0.1"
```

</details>

### 10.3 Related RuVector Packages (Optional)

These additional packages may be useful for extended functionality:

```json
{
  "dependencies": {
    "@ruvector/nervous-system-wasm": "^0.1.29",
    "@ruvector/sona": "^0.1.5",
    "@ruvector/core": "^0.1.30"
  }
}
```

| Package | Purpose | Use Case |
|---------|---------|----------|
| `@ruvector/nervous-system-wasm` | HDC, BTSP, K-WTA, Workspace | **Required** - Core nervous system |
| `@ruvector/sona` | LoRA, EWC++, ReasoningBank | Optional - Enhanced adaptive learning |
| `@ruvector/core` | HNSW vector database | Optional - Already using via RuVectorPatternStore |

---

## 11. Appendix: Nervous System Component Mapping

| Rust Component | TypeScript Adapter | QE Integration Point |
|----------------|-------------------|---------------------|
| `hdc::HdcMemory` | `HdcMemoryAdapter` | `RuVectorPatternStore` |
| `hdc::Hypervector` | `Hypervector` class | Pattern encoding |
| `plasticity::btsp::BTSPLayer` | `BTSPAdapter` | `LearningEngine` |
| `plasticity::btsp::BTSPAssociativeMemory` | `BTSPAdapter` | Pattern learning |
| `compete::KWTALayer` | `ReflexLayer` | Decision routing |
| `compete::LateralInhibition` | `ReflexLayer` | Competition tuning |
| `routing::GlobalWorkspace` | `GlobalWorkspace` | Agent coordination |
| `routing::Representation` | `AgentRepresentation` | Broadcast content |
| `routing::CircadianController` | `CircadianController` | Agent lifecycle |
| `routing::CircadianPhase` | `CircadianPhase` enum | Phase detection |
| `plasticity::eprop::EpropNetwork` | Future: `EpropAdapter` | Online learning |
| `eventbus::ShardedEventBus` | Future: `EventBus` | Real-time events |

---

## 12. Conclusion

This GOAP plan provides a systematic approach to integrating the RuVector Nervous System into the Agentic QE Fleet.

### Key Discovery: Pre-Built npm Package

The discovery that `@ruvector/nervous-system-wasm@0.1.29` is already published to npm dramatically simplifies integration:

| Aspect | Original Plan | Revised Plan |
|--------|---------------|--------------|
| Phase 0 Duration | 4.5 days | **0.5 days** |
| Total Duration | 4 weeks | **~2.5 weeks** |
| Risk Level | HIGH (WASM compilation) | **LOW** (npm install) |
| Rust Tooling | Required | **Not needed** |

### Expected Outcomes

By following the A* optimal action sequence with parallel execution, the integration can be completed in approximately **2.5 weeks** with the following outcomes:

- **10x faster pattern matching** via HDC hypervectors (<100ns vs 1.5μs)
- **32x reduction in learning examples** via BTSP one-shot learning (1 vs 32+)
- **90% of decisions in <1μs** via K-WTA reflex layer
- **50% reduction in coordination overhead** via Global Workspace
- **80% reduction in idle compute costs** via Circadian duty cycling

### Quick Start

```bash
# Install the nervous system package
npm install @ruvector/nervous-system-wasm

# Verify installation
npx tsx scripts/verify-nervous-system.ts
```

The plan includes comprehensive risk mitigation, rollback procedures, and quality gates to ensure safe, incremental adoption without breaking existing functionality.

---

*Document Version: 1.1.0*
*Generated: 2026-01-04*
*Updated: 2026-01-04 (npm package discovery)*
*Author: GOAP Specialist Agent*
