# AQE Fleet LLM Independence - GOAP Plan v2.0

**Goal:** Make the Agentic Quality Engineering Fleet fully independent from vendor LLMs (Claude, OpenAI) while maximizing existing infrastructure capabilities.

**Status:** Phase 0 Planning → Phase 1 Implementation
**Target:** Q1-Q2 2025
**Priority:** HIGH
**Risk Level:** LOW (95% infrastructure ready, strategic optimization path)

---

## Executive Summary

### Critical Updates from Research

This v2 plan incorporates critical findings from deep RuvLLM/RuVector analysis:

#### 🔴 **Critical Finding 1: RuvLLM is Orchestration, NOT Inference**
- RuvLLM is a "Redis for LLMs" - makes computation smarter, doesn't compute itself
- REQUIRES external backends (Ollama, vLLM, llama.cpp) for actual text generation
- Provides: Memory, routing, learning, pattern matching
- Does NOT provide: Model weights, text generation engine

#### 🟡 **Critical Finding 2: Current RuvLLM Utilization = 35%**
**Unused features with high impact (65%):**
- ❌ SessionManager (50% latency reduction potential)
- ❌ Batch Queries (4x throughput potential)
- ❌ Direct HNSW Access (150x faster than AgentDB)
- ❌ Federated Learning (team-wide pattern sharing)
- ❌ Manual Learning Triggers (pattern quality control)
- ❌ Routing Decision Inspection (observability)

#### 🟢 **Critical Finding 3: Infrastructure Status**
```
Architecture:   95% Ready ✅
Implementation:  5% Started ⚠️
Quick Wins:      Available NOW 🚀
```

**Files Ready:**
- ✅ `HybridRouter.ts` (1,050 LOC, production-ready)
- ✅ `RuvllmProvider.ts` (1,005 LOC, comprehensive)
- ✅ `SONALifecycleManager.ts` (FULLY implemented)
- ⚠️ `OllamaProvider.ts` (DOES NOT EXIST YET)

#### 🚀 **Critical Finding 4: Quick Wins Available**
```
SessionManager:     30 min → 50% faster multi-turn
Batch Queries:      45 min → 4x throughput
Routing Observability: 15 min → better debugging
Direct HNSW:        4 hours → 150x faster patterns
```

### Updated Success Metrics

1. **Phase 0:** RuvLLM optimization → 65% feature utilization by Week 2
2. **Phase 0.5 (NEW):** RuVector self-learning → 90%+ cache hit rate by Week 5
3. **Phase 1:** Local MVP → 90%+ quality vs Claude by Week 10
4. **Phase 2:** Production scale → 80%+ local routing by Week 18
5. **Phase 3:** GNN reasoning → 95%+ quality with self-learning by Week 24
6. **Phase 4:** Full independence → 99%+ local, <1% fallback by Week 30

### Cost/Timeline Impact

| Version | Timeline | Cost | Starting Point |
|---------|----------|------|----------------|
| **v1.0** | 24-32 weeks | $280,416 | "Ollama needs setup" |
| **v2.0** | 20-28 weeks | $245,000 | "Optimize what exists" |
| **v2.1** | 16-24 weeks | $185,000 | "RuVector self-learning" |

**Savings:** 8 weeks faster, $95k cheaper, self-improving system

---

## Phase 0: RuvLLM Optimization (NEW - 1-2 weeks)

**Goal:** Maximize existing infrastructure BEFORE adding new components

**Rationale:**
- 95% architecture ready, only 5% implemented
- Quick wins available with minimal effort
- De-risk Phase 1 by proving local infrastructure works
- Establish performance baselines with optimized system

### Milestones

#### **M0.1: SessionManager Integration** (30 min)
**Status:** NOT STARTED
**Files:** `/src/providers/RuvllmProvider.ts`

```typescript
import { SessionManager } from '@ruvector/ruvllm';

class RuvllmProvider implements ILLMProvider {
  private sessions: SessionManager;

  async initialize() {
    this.ruvllm = new RuvLLM({
      learningEnabled: true,
      embeddingDim: 768
    });

    // Enable session management for multi-turn conversations
    this.sessions = new SessionManager(this.ruvllm);
  }

  async complete(options: LLMCompletionOptions) {
    // Extract or create session ID
    const sessionId = options.metadata?.sessionId || this.sessions.create().id;

    // Use session-aware chat (50% faster for multi-turn)
    return this.sessions.chat(sessionId, this.extractInput(options));
  }
}
```

**Expected Impact:**
- 50% latency reduction for multi-turn conversations
- Better context reuse across requests
- Lower memory overhead

**Success Criteria:**
- ✅ SessionManager initialized without errors
- ✅ Multi-turn latency reduced by 40%+
- ✅ Memory usage stable over 100 sessions

---

#### **M0.2: Batch Query API** (45 min)
**Status:** NOT STARTED
**Files:** `/src/providers/RuvllmProvider.ts`

```typescript
async batchComplete(requests: LLMCompletionOptions[]): Promise<LLMCompletionResponse[]> {
  const batchRequest: BatchQueryRequest = {
    prompts: requests.map(r => this.extractInput(r)),
    config: {
      maxTokens: 2048,
      temperature: 0.7,
      parallelism: 4  // Process 4 at a time
    }
  };

  const response = this.ruvllm.batchQuery(batchRequest);

  return response.results.map((r, i) => ({
    content: [{ type: 'text', text: r.text }],
    usage: { input_tokens: r.tokens, output_tokens: r.outputTokens },
    model: 'ruvllm-batch',
    stopReason: 'end_turn',
    metadata: requests[i].metadata
  }));
}
```

**Use Cases:**
- Test generation bursts (20+ test files)
- Coverage analysis across modules
- Parallel flaky detection

**Expected Impact:**
- 4x throughput for batch operations
- Lower per-request overhead
- Better GPU utilization

**Success Criteria:**
- ✅ Batch API processes 10+ requests in parallel
- ✅ Throughput increases by 3x+
- ✅ No quality degradation vs sequential

---

#### **M0.3: Direct HNSW Pattern Store** (4 hours)
**Status:** NOT STARTED
**Files:** `/src/memory/HNSWPatternStore.ts` (NEW)

**Current Problem:**
```typescript
// Current: AgentDB pattern matching (20ms per search)
class PatternStore {
  async findSimilar(pattern: TestPattern): Promise<TestPattern[]> {
    // Goes through: SQLite → AgentDB → Vector search
    return this.agentdb.search(pattern.embedding, 10);  // 20ms
  }
}
```

**Optimized Solution:**
```typescript
import { HNSWIndex } from '@ruvector/core';

class HNSWPatternStore {
  private index: HNSWIndex;

  constructor() {
    this.index = new HNSWIndex({
      M: 32,              // Connections per node
      efConstruction: 200, // Build quality
      efSearch: 100,      // Search quality
      dimension: 768,     // Embedding size
      metric: 'cosine'    // Distance metric
    });
  }

  async findSimilar(pattern: TestPattern): Promise<TestPattern[]> {
    const embedding = await this.embed(pattern);

    // O(log n) search - 0.13ms vs 20ms
    const results = this.index.search(embedding, 10);

    return results.map(r => this.deserialize(r.metadata));
  }

  async store(pattern: TestPattern): Promise<number> {
    const embedding = await this.embed(pattern);

    // O(log n) insert
    return this.index.insert(embedding, pattern);
  }
}
```

**Migration Strategy:**
1. Implement HNSWPatternStore alongside AgentDB
2. Dual-write for 1 week (both stores)
3. Compare performance metrics
4. Switch reads to HNSW if >100x faster
5. Deprecate AgentDB pattern storage

**Expected Impact:**
- 150x faster pattern matching (20ms → 0.13ms)
- 3x lower memory usage
- No external dependencies (pure local)

**Success Criteria:**
- ✅ HNSW search <1ms for 95th percentile
- ✅ 100x+ speedup vs AgentDB
- ✅ All existing patterns migrated
- ✅ No data loss during migration

---

#### **M0.4: Routing Observability** (15 min)
**Status:** NOT STARTED
**Files:** `/src/providers/RuvllmProvider.ts`

```typescript
async complete(options: LLMCompletionOptions) {
  // Inspect routing decision BEFORE execution
  const decision = this.ruvllm.route(this.extractInput(options));

  // Log detailed routing information
  this.logger.debug('RuvLLM routing decision', {
    selectedModel: decision.model,
    confidence: decision.confidence,
    reasoningPath: decision.reasoning,
    alternativeModels: decision.alternatives,
    memoryHits: decision.memoryHits,
    estimatedLatency: decision.estimatedLatency
  });

  // Track routing patterns for analysis
  this.metrics.recordRoutingDecision({
    model: decision.model,
    complexity: options.complexity,
    confidence: decision.confidence,
    timestamp: Date.now()
  });

  // Proceed with query
  return this.ruvllm.query(this.extractInput(options));
}
```

**Expected Impact:**
- Better debugging of routing issues
- Data-driven model selection tuning
- Identify routing bottlenecks

**Success Criteria:**
- ✅ All routing decisions logged
- ✅ Grafana dashboard showing routing patterns
- ✅ Confidence scores tracked over time

---

#### **M0.5: Federated Learning Foundation** (2 days)
**Status:** NOT STARTED
**Files:** `/src/learning/FederatedManager.ts` (NEW)

```typescript
import { EphemeralAgent, FederatedCoordinator } from '@ruvector/ruvllm';

class FederatedManager {
  private coordinator: FederatedCoordinator;
  private agents: Map<string, EphemeralAgent>;

  async initialize() {
    // Create persistent coordinator (on CI server or shared storage)
    this.coordinator = new FederatedCoordinator('aqe-fleet-coordinator');

    // Register each AQE agent as an ephemeral learner
    for (const agent of this.fleet.agents) {
      const ephemeral = new EphemeralAgent(`aqe-${agent.id}`);
      this.agents.set(agent.id, ephemeral);
    }
  }

  async sharePattern(agentId: string, pattern: LearnedPattern) {
    const agent = this.agents.get(agentId);

    // Process pattern locally
    agent.processTask(pattern.embedding, pattern.quality);

    // Export learned weights (privacy-preserving)
    const exportData = agent.exportState();

    // Aggregate on coordinator (secure aggregation)
    this.coordinator.aggregate(exportData);
  }

  async syncFromTeam(agentId: string) {
    // Pull team-wide learned patterns
    const sharedKnowledge = this.coordinator.exportPatterns();

    // Apply to local agent
    const agent = this.agents.get(agentId);
    agent.importState(sharedKnowledge);
  }
}
```

**Privacy Design:**
- Only gradients shared (no raw data)
- Secure aggregation protocol
- Differential privacy optional

**Expected Impact:**
- Team-wide pattern sharing
- 30% faster learning convergence
- No central data storage needed

**Success Criteria:**
- ✅ Coordinator initialized successfully
- ✅ Pattern sharing works across agents
- ✅ No raw data leakage (gradient-only)
- ✅ 20%+ faster learning vs isolated agents

---

#### **M0.6: Manual Learning Triggers** (1 day)
**Status:** NOT STARTED
**Files:** `/src/learning/PatternCurator.ts` (NEW)

```typescript
class PatternCurator {
  async curatePatterns() {
    // Find low-confidence patterns from ReasoningBank
    const patterns = await this.reasoningBank.findSimilar(query, 100);
    const lowConfidence = patterns.filter(p => p.confidence < 0.7);

    console.log(`Found ${lowConfidence.length} low-confidence patterns`);

    // Manual review interface (CLI or web UI)
    for (const pattern of lowConfidence) {
      const corrected = await this.manualReview(pattern);

      if (corrected.approved) {
        // Provide explicit feedback to RuvLLM
        this.ruvllm.feedback({
          requestId: pattern.id,
          correction: corrected.text,
          rating: corrected.quality,
          reasoning: corrected.explanation
        });
      } else {
        // Mark pattern for removal
        this.reasoningBank.remove(pattern.id);
      }
    }

    // Force immediate learning consolidation
    const result = this.ruvllm.forceLearn();
    console.log(`Learning consolidation: ${result}`);
  }

  private async manualReview(pattern: Pattern): Promise<CuratedPattern> {
    // Present pattern to human reviewer
    // Can be CLI-based or web UI
    return {
      approved: true,
      text: pattern.text,
      quality: 5,
      explanation: "Manual review approved"
    };
  }
}
```

**Use Cases:**
- Weekly pattern quality review
- Pre-release validation
- Domain expert feedback integration

**Expected Impact:**
- 20% better routing decisions
- Higher quality learned patterns
- Faster convergence to optimal behavior

**Success Criteria:**
- ✅ CLI tool for pattern review
- ✅ forceLearn() triggers successfully
- ✅ Routing confidence improves after curation

---

### Phase 0 Success Criteria

**By End of Week 2:**
- ✅ SessionManager reduces multi-turn latency by 40%+
- ✅ Batch queries achieve 3x+ throughput
- ✅ HNSW pattern store is 100x+ faster than AgentDB
- ✅ Routing decisions logged and dashboarded
- ✅ Federated learning foundation tested with 2+ agents
- ✅ Manual pattern curation workflow documented
- ✅ **RuvLLM feature utilization: 35% → 65%**

**Metrics Baseline (for Phase 1 comparison):**
- Multi-turn latency: Before/After
- Batch throughput: Before/After
- Pattern search: Before/After
- Memory usage: Before/After

**Decision Point: GO/NO-GO for Phase 0.5**
- If quick wins achieve targets → PROCEED to Phase 0.5
- If issues found → EXTEND Phase 0 by 1 week

---

## Phase 0.5: RuVector Self-Learning Integration (NEW - 3-4 weeks)

**Goal:** Deploy RuVector Docker for continuous self-learning without traditional fine-tuning

**Rationale:**
- RuVector provides GNN + LoRA + EWC++ for automatic improvement
- Replaces Phase 3 fine-tuning with continuous learning
- 61µs latency vs 20ms AgentDB (330x faster)
- Self-improving index quality over time
- 98% pattern retention with EWC++ anti-forgetting

**Docker Image:** `ruvnet/ruvector:latest` (240MB, standalone)

### Why RuVector over Traditional Fine-Tuning

| Aspect | Traditional Fine-Tuning | RuVector Self-Learning |
|--------|-------------------------|------------------------|
| **Data Required** | 10,000+ curated examples | Self-learns from usage |
| **Training Time** | 6-8 weeks | Continuous (real-time) |
| **Memory** | 14GB (full model) | 280MB (LoRA adapters) |
| **Forgetting** | Manual versioning | EWC++ automatic (98% retention) |
| **Cost** | $35k+ | ~$5k infrastructure |

### Milestones

#### **M0.5.1: RuVector Docker Deployment** (Week 1)
**Status:** NOT STARTED
**Files:** `/docker/docker-compose.ruvector.yml` (NEW)

```yaml
version: '3.8'
services:
  ruvector:
    image: ruvnet/ruvector:latest
    container_name: aqe-ruvector
    ports:
      - "8080:8080"      # REST API
      - "9090:9090"      # gRPC
    environment:
      - RUVECTOR_LEARNING_ENABLED=true
      - RUVECTOR_EMBEDDING_DIM=768
      - RUVECTOR_HNSW_M=32
      - RUVECTOR_HNSW_EF_CONSTRUCTION=200
      - RUVECTOR_LORA_RANK=8
      - RUVECTOR_EWC_ENABLED=true
    volumes:
      - ruvector-data:/data
      - ruvector-models:/models
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  ruvector-data:
  ruvector-models:
```

**Success Criteria:**
- ✅ Docker container running and healthy
- ✅ REST API responding at port 8080
- ✅ HNSW index initialized
- ✅ LoRA adapters loaded

---

#### **M0.5.2: RuVectorClient TypeScript Integration** (Week 1-2)
**Status:** NOT STARTED
**Files:** `/src/providers/RuVectorClient.ts` (NEW)

```typescript
import { ILLMProvider } from './ILLMProvider';

interface RuVectorConfig {
  baseUrl: string;
  learningEnabled: boolean;
  cacheThreshold: number;  // Confidence threshold for cache hits
  loraRank: number;
  ewcEnabled: boolean;
}

export class RuVectorClient {
  private baseUrl: string;
  private config: RuVectorConfig;

  constructor(config: RuVectorConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:8080';
    this.config = config;
  }

  /**
   * Search for similar patterns with GNN-enhanced ranking
   */
  async search(embedding: number[], k: number = 10): Promise<SearchResult[]> {
    const response = await fetch(`${this.baseUrl}/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embedding,
        k,
        useGNN: true,           // Enable GNN reranking
        attentionType: 'multi-head'
      })
    });
    return response.json();
  }

  /**
   * Store pattern with automatic LoRA learning
   */
  async store(pattern: Pattern): Promise<void> {
    await fetch(`${this.baseUrl}/v1/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embedding: pattern.embedding,
        content: pattern.content,
        metadata: pattern.metadata,
        learnFromThis: true    // Trigger LoRA update
      })
    });
  }

  /**
   * Query with confidence-based routing
   * - High confidence (>0.9): Return cached pattern
   * - Medium (0.7-0.9): Augment with LLM
   * - Low (<0.7): Forward to LLM
   */
  async queryWithLearning(
    query: string,
    embedding: number[],
    llmFallback: () => Promise<string>
  ): Promise<QueryResult> {
    const results = await this.search(embedding, 5);
    const topResult = results[0];

    if (topResult && topResult.confidence > this.config.cacheThreshold) {
      // Cache hit - return learned pattern
      return {
        content: topResult.content,
        source: 'cache',
        confidence: topResult.confidence
      };
    }

    // Cache miss - call LLM and learn from result
    const llmResponse = await llmFallback();

    // Store for future learning
    await this.store({
      embedding,
      content: llmResponse,
      metadata: { query, timestamp: Date.now() }
    });

    return {
      content: llmResponse,
      source: 'llm',
      confidence: 1.0
    };
  }

  /**
   * Get learning metrics
   */
  async getMetrics(): Promise<LearningMetrics> {
    const response = await fetch(`${this.baseUrl}/v1/metrics`);
    return response.json();
  }

  /**
   * Trigger manual learning consolidation
   */
  async forceLearn(): Promise<void> {
    await fetch(`${this.baseUrl}/v1/learn/force`, { method: 'POST' });
  }
}
```

**Success Criteria:**
- ✅ Client connects to RuVector Docker
- ✅ Search returns results with GNN ranking
- ✅ Store triggers LoRA updates
- ✅ Cache hit rate measurable

---

#### **M0.5.3: HybridRouter Integration** (Week 2)
**Status:** NOT STARTED
**Files:** `/src/providers/HybridRouter.ts`

```typescript
// Add RuVector as intelligent cache layer
class HybridRouter implements ILLMProvider {
  private ruvector: RuVectorClient;
  private localProvider: RuvllmProvider;
  private cloudProvider: ClaudeProvider;

  async complete(options: HybridCompletionOptions): Promise<LLMCompletionResponse> {
    const embedding = await this.embed(options.messages);

    // Try RuVector cache first (sub-ms)
    const cached = await this.ruvector.queryWithLearning(
      this.extractQuery(options),
      embedding,
      async () => {
        // Fallback to LLM if cache miss
        const decision = this.makeRoutingDecision(options);
        if (decision.provider === 'local') {
          return this.localProvider.complete(options);
        }
        return this.cloudProvider.complete(options);
      }
    );

    return this.formatResponse(cached);
  }
}
```

**Expected Cache Hit Rates:**
- Simple tasks (test generation): 70-90%
- Moderate tasks (coverage analysis): 50-70%
- Complex tasks (architecture): 20-40%

**Success Criteria:**
- ✅ RuVector integrated into HybridRouter
- ✅ Cache hits measured and logged
- ✅ LoRA updates happening automatically
- ✅ 50%+ overall cache hit rate

---

#### **M0.5.4: GNN Self-Learning Validation** (Week 3)
**Status:** NOT STARTED
**Files:** Tests

**Validation Tests:**
```typescript
describe('RuVector Self-Learning', () => {
  it('should improve search quality over time', async () => {
    // Execute 100 similar queries
    const queries = generateSimilarQueries(100);
    const initialQuality = await measureSearchQuality(queries.slice(0, 10));

    // Let GNN learn from usage
    for (const query of queries) {
      await ruvector.queryWithLearning(query);
    }

    // Measure improvement
    const finalQuality = await measureSearchQuality(queries.slice(90, 100));
    expect(finalQuality).toBeGreaterThan(initialQuality * 1.1);  // 10%+ improvement
  });

  it('should retain patterns with EWC++', async () => {
    // Store initial patterns
    const patterns = await storePatterns(100);
    const initialRetention = await measureRetention(patterns);

    // Add new patterns (potential forgetting trigger)
    await storePatterns(1000);

    // Verify EWC++ prevented forgetting
    const finalRetention = await measureRetention(patterns);
    expect(finalRetention / initialRetention).toBeGreaterThan(0.98);  // 98% retention
  });
});
```

**Success Criteria:**
- ✅ Search quality improves by 10%+ over 100 queries
- ✅ EWC++ maintains 98%+ pattern retention
- ✅ LoRA adapters < 300MB total
- ✅ Latency remains < 1ms for searches

---

#### **M0.5.5: Migration from AgentDB** (Week 3-4)
**Status:** NOT STARTED
**Files:** `/src/memory/RuVectorPatternStore.ts`

**Migration Strategy:**
1. Dual-write: Both AgentDB and RuVector (Week 3)
2. Compare quality and latency metrics
3. Switch reads to RuVector if 100x+ faster
4. Deprecate AgentDB pattern storage (Week 4)

```typescript
class RuVectorPatternStore implements IPatternStore {
  private ruvector: RuVectorClient;
  private agentdb: AgentDB;  // Keep for migration
  private dualWriteEnabled: boolean = true;

  async store(pattern: QEPattern): Promise<void> {
    // Always write to RuVector
    await this.ruvector.store(pattern);

    // Dual-write during migration
    if (this.dualWriteEnabled) {
      await this.agentdb.store(pattern);
    }
  }

  async search(embedding: number[], k: number): Promise<QEPattern[]> {
    // Read from RuVector (sub-ms)
    const results = await this.ruvector.search(embedding, k);

    // Log comparison during migration
    if (this.dualWriteEnabled) {
      const agentdbResults = await this.agentdb.search(embedding, k);
      this.logComparison(results, agentdbResults);
    }

    return results;
  }
}
```

**Success Criteria:**
- ✅ All patterns migrated to RuVector
- ✅ Search latency < 1ms (vs 20ms AgentDB)
- ✅ No data loss verified
- ✅ Dual-write can be disabled

---

### Phase 0.5 Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Docker deployment | Healthy | Health endpoint |
| Cache hit rate | >50% | Metrics API |
| Search latency | <1ms | p95 timing |
| Pattern retention | >98% | EWC++ validation |
| Quality improvement | >10% | GNN learning test |
| LoRA adapter size | <300MB | Disk usage |

### Decision Point: GO/NO-GO for Phase 1
- If cache hit rate >50% → PROCEED (Phase 1 will be faster)
- If hit rate <30% → EXTEND Phase 0.5, tune thresholds
- If RuVector unstable → SKIP to Phase 1 without cache

---

## Phase 1: Local Inference MVP (REVISED - 4-6 weeks)

**Goal:** Prove local LLM viability with production Ollama setup

**Key Updates from v1:**
- Start from optimized RuvLLM foundation (Phase 0)
- OllamaProvider.ts DOES NOT EXIST (build from scratch)
- Use December 2025 model recommendations
- Baseline testing against optimized system (not raw)

### Milestones

#### **M1.1: Production Ollama Setup** (Week 1-2)
**Status:** NOT STARTED

**Installation:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull December 2025 recommended models
ollama pull devstral-small-2   # 24B - Primary for SE agents
ollama pull rnj-1              # 8B - Fast code/STEM
ollama pull qwen2.5-coder:7b   # 7B - Fallback, well-tested

# Optional: Large model for complex tasks (requires 64GB+ RAM)
# ollama pull devstral-2       # 123B - Full power
```

**Configuration:**
```bash
# Test models
ollama run devstral-small-2 "Write a unit test for a factorial function"
ollama run rnj-1 "Explain async/await in JavaScript"

# Benchmark throughput
npx tsx scripts/benchmark-ollama.ts
```

**Expected Performance:**
- rnj-1 (8B): 120+ req/sec on 8-core CPU
- devstral-small-2 (24B): 60+ req/sec on 16-core CPU
- qwen2.5-coder:7b: 100+ req/sec on 8-core CPU

**Hardware Requirements:**
- **Minimum:** 16GB RAM, 8 CPU cores
- **Recommended:** 32GB RAM, 16 CPU cores, optional GPU
- **Optimal:** 64GB RAM, 24 CPU cores, NVIDIA GPU (for devstral-2)

**Success Criteria:**
- ✅ All models pull successfully
- ✅ devstral-small-2 serves at 60+ req/sec
- ✅ rnj-1 serves at 120+ req/sec
- ✅ No crashes over 1000 consecutive requests

---

#### **M1.2: OllamaProvider Implementation** (Week 2-3)
**Status:** NOT STARTED
**Files:** `/src/providers/OllamaProvider.ts` (NEW)

**Implementation:**
```typescript
import { ILLMProvider } from '../types';

/**
 * OllamaProvider - Direct integration with Ollama via OpenAI-compatible API
 *
 * December 2025 Models:
 * - devstral-small-2 (24B): SE agent tasks
 * - rnj-1 (8B): Fast code/STEM
 * - qwen2.5-coder:7b (7B): Fallback
 */
export class OllamaProvider implements ILLMProvider {
  private baseUrl: string = 'http://localhost:11434';

  // Model selection by task complexity (December 2025 models)
  private modelMap = {
    simple: 'rnj-1',              // 8B - Fast code/STEM
    moderate: 'devstral-small-2', // 24B - SE agents (PRIMARY)
    complex: 'qwen2.5-coder:32b', // 32B - Deep analysis (if available)
  };

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    const model = this.selectModel(options.complexity);

    // Use OpenAI-compatible /v1/chat/completions endpoint
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: this.convertMessages(options.messages),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: [{
        type: 'text',
        text: data.choices[0].message.content
      }],
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens
      },
      model,
      stopReason: 'end_turn',
      metadata: {
        provider: 'ollama',
        modelSize: this.getModelSize(model)
      }
    };
  }

  private selectModel(complexity?: string): string {
    switch (complexity) {
      case 'simple':
        return this.modelMap.simple;
      case 'complex':
        return this.modelMap.complex;
      case 'moderate':
      default:
        return this.modelMap.moderate;
    }
  }

  private getModelSize(model: string): string {
    if (model.includes('rnj-1')) return '8B';
    if (model.includes('devstral-small-2')) return '24B';
    if (model.includes('qwen2.5-coder:32b')) return '32B';
    return 'unknown';
  }

  async embed(text: string): Promise<number[]> {
    // Use Ollama's embedding endpoint
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',  // Fast embedding model
        prompt: text
      })
    });

    const data = await response.json();
    return data.embedding;
  }

  // Implement other ILLMProvider methods...
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

**Tests:**
```typescript
// tests/providers/OllamaProvider.test.ts
describe('OllamaProvider', () => {
  it('should select correct model by complexity', () => {
    const provider = new OllamaProvider();
    expect(provider.selectModel('simple')).toBe('rnj-1');
    expect(provider.selectModel('moderate')).toBe('devstral-small-2');
  });

  it('should handle Ollama API errors gracefully', async () => {
    // Test circuit breaker behavior
  });

  it('should generate embeddings via Ollama', async () => {
    // Test embedding endpoint
  });
});
```

**Success Criteria:**
- ✅ OllamaProvider implements full ILLMProvider interface
- ✅ Model selection works correctly
- ✅ OpenAI-compatible API integration functional
- ✅ Error handling with circuit breaker
- ✅ 100% test coverage

---

#### **M1.3: HybridRouter Integration** (Week 3-4)
**Status:** PARTIALLY DONE (router exists, Ollama integration missing)
**Files:** `/src/providers/HybridRouter.ts`

**Current State:**
```typescript
// HybridRouter exists (1,050 LOC) but only routes to RuvllmProvider
class HybridRouter implements ILLMProvider {
  private localProvider?: RuvllmProvider;   // Uses RuvLLM orchestration
  private cloudProvider?: ClaudeProvider;   // Anthropic Claude
  // MISSING: Direct Ollama fallback
}
```

**Required Updates:**
```typescript
class HybridRouter implements ILLMProvider {
  private ruvllmProvider?: RuvllmProvider;    // RuvLLM orchestration (primary local)
  private ollamaProvider?: OllamaProvider;    // Direct Ollama (fallback local)
  private claudeProvider?: ClaudeProvider;    // Claude (emergency cloud)

  async complete(options: HybridCompletionOptions) {
    const decision = this.makeRoutingDecision(options);

    try {
      switch (decision.provider) {
        case 'ruvllm':
          // RuvLLM with memory/learning/routing
          return await this.ruvllmProvider.complete(options);

        case 'ollama':
          // Direct Ollama (if RuvLLM fails)
          return await this.ollamaProvider.complete(options);

        case 'claude':
          // Emergency cloud fallback
          return await this.claudeProvider.complete(options);
      }
    } catch (error) {
      // Circuit breaker: try next provider
      return this.fallback(options, error);
    }
  }

  private makeRoutingDecision(options: HybridCompletionOptions): RoutingDecision {
    // Complexity-based routing
    if (options.complexity === 'very_complex') {
      return { provider: 'claude', reason: 'Very complex task' };
    }

    // Privacy-first mode
    if (options.privacyMode || this.strategy === RoutingStrategy.PRIVACY_FIRST) {
      return { provider: 'ruvllm', reason: 'Privacy required' };
    }

    // Cost optimization
    if (this.strategy === RoutingStrategy.COST_OPTIMIZED) {
      return { provider: 'ruvllm', reason: 'Cost optimization' };
    }

    // Quality optimization
    if (this.strategy === RoutingStrategy.QUALITY_OPTIMIZED) {
      return { provider: 'claude', reason: 'Quality priority' };
    }

    // Default: RuvLLM with Ollama backend
    return { provider: 'ruvllm', reason: 'Default local inference' };
  }
}
```

**Routing Strategies:**
```typescript
enum RoutingStrategy {
  PRIVACY_FIRST,      // Always local (RuvLLM → Ollama)
  COST_OPTIMIZED,     // Prefer local, fallback to cloud
  QUALITY_OPTIMIZED,  // Prefer Claude, fallback to local
  ADAPTIVE            // Learn optimal routing over time
}
```

**Circuit Breaker Configuration:**
```typescript
{
  ruvllm: {
    failureThreshold: 3,     // 3 consecutive failures triggers circuit
    successThreshold: 2,     // 2 successes closes circuit
    timeout: 10000,          // 10s timeout
    fallbackTo: 'ollama'     // Try direct Ollama first
  },
  ollama: {
    failureThreshold: 2,
    successThreshold: 1,
    timeout: 15000,
    fallbackTo: 'claude'     // Emergency cloud fallback
  }
}
```

**Success Criteria:**
- ✅ Three-tier routing (RuvLLM → Ollama → Claude)
- ✅ Circuit breaker prevents cascading failures
- ✅ Routing decisions logged and tracked
- ✅ Complexity-based model selection
- ✅ 40%+ requests routed to RuvLLM+Ollama

---

#### **M1.4: Quality Baseline Testing** (Week 4-5)
**Status:** NOT STARTED
**Files:** `/scripts/quality-baseline.ts` (NEW)

**Test Suite:**
```typescript
/**
 * Quality Baseline Testing
 *
 * Compare Ollama-based local inference vs Claude baseline
 * across 100 representative QE tasks
 */

interface QualityTest {
  id: string;
  category: 'test-generation' | 'coverage-analysis' | 'flaky-detection' | 'code-review';
  complexity: 'simple' | 'moderate' | 'complex';
  input: string;
  expectedOutputType: string;
}

const testSuite: QualityTest[] = [
  // Test Generation (40 tests)
  {
    id: 'tg-simple-1',
    category: 'test-generation',
    complexity: 'simple',
    input: 'function add(a: number, b: number) { return a + b; }',
    expectedOutputType: 'jest-test'
  },
  // ... 39 more

  // Coverage Analysis (30 tests)
  {
    id: 'ca-moderate-1',
    category: 'coverage-analysis',
    complexity: 'moderate',
    input: 'Coverage report showing 65% line coverage...',
    expectedOutputType: 'gap-analysis'
  },
  // ... 29 more

  // Flaky Detection (20 tests)
  {
    id: 'fd-complex-1',
    category: 'flaky-detection',
    complexity: 'complex',
    input: 'Test failure history: pass, fail, pass, pass, fail...',
    expectedOutputType: 'flaky-classification'
  },
  // ... 19 more

  // Code Review (10 tests)
  {
    id: 'cr-moderate-1',
    category: 'code-review',
    complexity: 'moderate',
    input: 'Pull request diff with 500 lines changed...',
    expectedOutputType: 'review-comments'
  }
  // ... 9 more
];

async function runQualityBaseline() {
  const results = {
    ollama: { total: 0, passed: 0, quality: [] },
    claude: { total: 0, passed: 0, quality: [] }
  };

  for (const test of testSuite) {
    // Run with Ollama (RuvLLM + devstral-small-2)
    const ollamaResult = await runTest(test, 'ollama');
    results.ollama.total++;
    results.ollama.quality.push(scoreOutput(ollamaResult));

    // Run with Claude baseline
    const claudeResult = await runTest(test, 'claude');
    results.claude.total++;
    results.claude.quality.push(scoreOutput(claudeResult));
  }

  // Calculate metrics
  const ollamaAvg = average(results.ollama.quality);
  const claudeAvg = average(results.claude.quality);
  const qualityRatio = ollamaAvg / claudeAvg;

  console.log('Quality Baseline Results:');
  console.log(`Ollama: ${ollamaAvg.toFixed(2)} / 10.00`);
  console.log(`Claude: ${claudeAvg.toFixed(2)} / 10.00`);
  console.log(`Quality Ratio: ${(qualityRatio * 100).toFixed(1)}%`);

  // Decision criteria
  if (qualityRatio >= 0.90) {
    console.log('✅ PASS: Ollama achieves ≥90% quality vs Claude');
    console.log('Decision: PROCEED to Phase 2');
  } else if (qualityRatio >= 0.85) {
    console.log('⚠️ MARGINAL: 85-90% quality - requires optimization');
    console.log('Decision: EXTEND Phase 1 by 2 weeks for TRM tuning');
  } else {
    console.log('❌ FAIL: <85% quality - not viable for production');
    console.log('Decision: PIVOT to alternative approach');
  }
}
```

**Quality Scoring Criteria:**
```typescript
function scoreOutput(result: TestResult): number {
  let score = 0;

  // Test Coverage (40 points)
  if (result.testCoverage >= 90) score += 40;
  else if (result.testCoverage >= 80) score += 30;
  else if (result.testCoverage >= 70) score += 20;

  // Edge Cases (30 points)
  const edgeCases = countEdgeCases(result.output);
  score += Math.min(edgeCases * 5, 30);

  // Code Correctness (30 points)
  if (result.syntaxValid) score += 15;
  if (result.logicValid) score += 15;

  return score / 10;  // Scale to 0-10
}
```

**Metrics Tracked:**
- Test coverage percentage
- Number of edge cases discovered
- Syntax validity (compiles/runs)
- Logic validity (tests pass)
- Latency (P50, P95, P99)
- Token efficiency

**Success Criteria:**
- ✅ Ollama achieves ≥90% quality vs Claude baseline
- ✅ Edge case discovery within 20% of Claude
- ✅ 100% syntax-valid output
- ✅ Latency P95 < 5s
- ✅ **GO/NO-GO decision made**

---

#### **M1.5: Cost & Performance Analysis** (Week 5-6)
**Status:** NOT STARTED
**Files:** `/scripts/cost-analysis.ts` (NEW)

**Analysis Over 1000 Requests:**
```typescript
interface CostAnalysisReport {
  routing: {
    ruvllm: { count: number; percentage: number };
    ollama: { count: number; percentage: number };
    claude: { count: number; percentage: number };
  };

  costs: {
    total: number;
    perRequest: number;
    breakdown: {
      ruvllm: number;    // $0 (local)
      ollama: number;    // $0 (local)
      claude: number;    // API costs
    };
    savings: {
      amount: number;
      percentage: number;
    };
  };

  latency: {
    p50: { ruvllm: number; ollama: number; claude: number };
    p95: { ruvllm: number; ollama: number; claude: number };
    p99: { ruvllm: number; ollama: number; claude: number };
  };

  quality: {
    ruvllm: number;
    ollama: number;
    claude: number;
  };
}
```

**Cost Calculation:**
```typescript
// Claude Sonnet 4.5 pricing (December 2025)
const CLAUDE_INPUT_COST = 0.003;   // $3 per 1M input tokens
const CLAUDE_OUTPUT_COST = 0.015;  // $15 per 1M output tokens

// Ollama costs (infrastructure)
const OLLAMA_SERVER_COST = 0.05;   // $0.05/hour for 16-core CPU server
const OLLAMA_COST_PER_REQUEST = OLLAMA_SERVER_COST / 3600 / 100;  // ~$0.0000001

function calculateCosts(requests: Request[]): CostBreakdown {
  let totalCost = 0;

  for (const req of requests) {
    if (req.provider === 'claude') {
      const inputCost = (req.inputTokens / 1_000_000) * CLAUDE_INPUT_COST;
      const outputCost = (req.outputTokens / 1_000_000) * CLAUDE_OUTPUT_COST;
      totalCost += inputCost + outputCost;
    } else {
      // Local inference (negligible cost)
      totalCost += OLLAMA_COST_PER_REQUEST;
    }
  }

  // Calculate savings vs pure Claude
  const pureClaudeCost = calculatePureClaude(requests);
  const savings = pureClaudeCost - totalCost;
  const savingsPercentage = (savings / pureClaudeCost) * 100;

  return {
    total: totalCost,
    perRequest: totalCost / requests.length,
    pureClaudeCost,
    savings,
    savingsPercentage
  };
}
```

**Target Metrics:**
```
Cost Savings:     ≥50% vs pure Claude
Local Routing:    ≥40% of requests
Quality:          ≥90% vs Claude
Latency P50:      <2s
Latency P95:      <5s
```

**Success Criteria:**
- ✅ Cost savings ≥50% demonstrated
- ✅ 40%+ requests routed to local
- ✅ Quality maintained at ≥90%
- ✅ Latency targets met
- ✅ **DECISION: GO for Phase 2**

---

### Phase 1 Success Criteria

**By End of Week 8:**
- ✅ Ollama serving devstral-small-2/rnj-1 at 60/120 req/sec
- ✅ OllamaProvider fully implemented and tested
- ✅ HybridRouter three-tier routing functional
- ✅ Quality ≥90% vs Claude baseline
- ✅ Cost savings ≥50% with hybrid routing
- ✅ Circuit breaker prevents cascading failures
- ✅ 40%+ requests routed to local

**Rollback Plan:**
- Immediate: Set `HybridRouter.defaultStrategy = QUALITY_OPTIMIZED` (forces Claude)
- Partial: Increase `maxLocalLatency` threshold
- Complete: Disable RuvllmProvider/OllamaProvider

---

## Phase 2: Production Deployment (UPDATED - 6-8 weeks)

**Goal:** Scale to production with vLLM, multi-model routing, observability

**Key Updates:**
- Build on optimized RuvLLM foundation from Phase 0
- Use December 2025 model recommendations
- Leverage HNSW pattern store for 150x faster matching

### Milestones

#### **M2.1: vLLM Production Setup** (Week 1-2)
**Status:** NOT STARTED

**Infrastructure:**
```bash
# Install vLLM with GPU support
pip install vllm

# Deploy vLLM server
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3-Coder-30B-A3B-Instruct \
  --tensor-parallel-size 2 \
  --gpu-memory-utilization 0.9 \
  --max-model-len 32768

# Test server
curl http://localhost:8000/v1/models
```

**Production Models (December 2025):**
```
Tier 1 (Simple):    rnj-1 (8B)
Tier 2 (Moderate):  devstral-small-2 (24B)
Tier 3 (Complex):   Qwen3-Coder-30B-A3B (MoE: 30B total, 3B active)
Tier 4 (Reasoning): Devstral-2 (123B) - Optional
```

**Hardware Requirements:**
- **GPU:** NVIDIA A10/T4 (24GB VRAM) or A100 (40GB VRAM)
- **CPU:** 16+ cores
- **RAM:** 64GB+
- **Storage:** 500GB for models

**Expected Performance:**
- rnj-1: 200+ req/sec (GPU)
- devstral-small-2: 120+ req/sec (GPU)
- Qwen3-30B-A3B: 80+ req/sec (efficient MoE)
- Devstral-2: 40+ req/sec (large model)

**Success Criteria:**
- ✅ vLLM serving at 120+ req/sec
- ✅ 99.5%+ uptime over 7 days
- ✅ GPU utilization >80%
- ✅ Latency P95 < 3s

---

#### **M2.2: Multi-Model Router** (Week 2-3)
**Status:** NOT STARTED
**Files:** `/src/providers/MultiModelRouter.ts` (NEW)

```typescript
export class MultiModelRouter extends HybridRouter {
  // Updated December 2025 models
  private localModels = {
    simple: 'rnj-1',                  // 8B - Fast code/STEM
    moderate: 'devstral-small-2',     // 24B - SE agents
    complex: 'qwen3-coder-30b-a3b',   // 30B MoE (3B active)
    reasoning: 'devstral-2'           // 123B - Full power (optional)
  };

  protected selectModel(complexity: TaskComplexity): string {
    // Use HNSW pattern store for faster decision
    const similarTasks = this.patternStore.findSimilar(task, 10);

    // Learn from past successful routing
    const optimalModel = this.learnOptimalModel(similarTasks);

    if (optimalModel) {
      return optimalModel;  // Use learned model selection
    }

    // Fallback to complexity-based routing
    switch (complexity) {
      case TaskComplexity.SIMPLE:
        return this.localModels.simple;
      case TaskComplexity.MODERATE:
        return this.localModels.moderate;
      case TaskComplexity.COMPLEX:
        return this.localModels.complex;
      case TaskComplexity.VERY_COMPLEX:
        return this.localModels.reasoning;
    }
  }

  private learnOptimalModel(similarTasks: Task[]): string | null {
    if (similarTasks.length < 5) return null;

    // Analyze historical performance
    const modelPerformance = {};
    for (const task of similarTasks) {
      const model = task.metadata.model;
      if (!modelPerformance[model]) {
        modelPerformance[model] = { quality: [], latency: [] };
      }
      modelPerformance[model].quality.push(task.quality);
      modelPerformance[model].latency.push(task.latency);
    }

    // Select model with best quality/latency tradeoff
    let bestModel = null;
    let bestScore = 0;
    for (const [model, perf] of Object.entries(modelPerformance)) {
      const avgQuality = average(perf.quality);
      const avgLatency = average(perf.latency);
      const score = avgQuality / (avgLatency / 1000);  // Quality per second

      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    return bestModel;
  }
}
```

**Success Criteria:**
- ✅ Multi-model routing based on complexity
- ✅ Learned model selection outperforms rules by 10%+
- ✅ HNSW pattern matching <1ms
- ✅ Routing decisions tracked and analyzed

---

#### **M2.3: TRM Enhancement for Local Models** (Week 3-4)
**Status:** PARTIALLY DONE (TRM exists, tuning needed)
**Files:** `/src/providers/RuvllmProvider.ts`

**Current TRM Config:**
```typescript
// Existing TRM configuration (needs tuning)
{
  enableTRM: true,
  maxIterations: 5,
  threshold: 0.95
}
```

**Optimized TRM per Model:**
```typescript
private getTRMConfig(model: string): TRMConfig {
  const configs = {
    'rnj-1': {
      maxIterations: 3,    // Fast model, fewer iterations
      threshold: 0.90,      // Lower threshold for speed
      timeout: 5000
    },
    'devstral-small-2': {
      maxIterations: 5,     // Balanced
      threshold: 0.95,      // Standard quality
      timeout: 8000
    },
    'qwen3-coder-30b-a3b': {
      maxIterations: 7,     // Complex model, more iterations
      threshold: 0.98,      // High quality bar
      timeout: 12000
    },
    'devstral-2': {
      maxIterations: 10,    // Maximum refinement
      threshold: 0.99,      // Highest quality
      timeout: 20000
    }
  };

  return configs[model] || configs['devstral-small-2'];
}

async complete(options: LLMCompletionOptions) {
  const model = this.selectModel(options.complexity);
  const trmConfig = this.getTRMConfig(model);

  return this.ruvllm.query(this.extractInput(options), {
    model,
    trm: trmConfig
  });
}
```

**TRM Metrics Tracking:**
```typescript
interface TRMMetrics {
  iterations: number;
  initialQuality: number;
  finalQuality: number;
  improvement: number;
  latency: number;
}

this.metrics.recordTRM({
  model,
  iterations: result.trmIterations,
  initialQuality: result.firstPassQuality,
  finalQuality: result.finalQuality,
  improvement: result.finalQuality - result.firstPassQuality,
  latency: result.trmLatency
});
```

**Expected Impact:**
- 5-10% quality improvement for complex tasks
- 2-3x latency increase (acceptable tradeoff)
- Better edge case coverage

**Success Criteria:**
- ✅ TRM improves quality by 5%+ for complex tasks
- ✅ Per-model TRM configs optimized
- ✅ TRM metrics tracked and dashboarded
- ✅ Diminishing returns detected (auto-stop)

---

#### **M2.4: Observability & Monitoring** (Week 4-5)
**Status:** NOT STARTED
**Files:** `/src/monitoring/` (NEW)

**OpenTelemetry Instrumentation:**
```typescript
import { trace, metrics } from '@opentelemetry/api';

class LLMObservability {
  private tracer = trace.getTracer('aqe-llm');
  private meter = metrics.getMeter('aqe-llm');

  // Latency histogram
  private latencyHistogram = this.meter.createHistogram('llm.request.latency', {
    description: 'LLM request latency in milliseconds',
    unit: 'ms'
  });

  // Token throughput counter
  private tokenCounter = this.meter.createCounter('llm.tokens.processed', {
    description: 'Total tokens processed',
    unit: 'tokens'
  });

  // Model selection gauge
  private modelGauge = this.meter.createObservableGauge('llm.model.selection', {
    description: 'Current model selection frequency'
  });

  recordRequest(result: LLMResult) {
    const span = this.tracer.startSpan('llm.request');

    // Record latency
    this.latencyHistogram.record(result.latency, {
      provider: result.provider,
      model: result.model,
      complexity: result.complexity
    });

    // Record tokens
    this.tokenCounter.add(result.inputTokens + result.outputTokens, {
      type: 'total',
      model: result.model
    });

    // Record routing decision
    span.setAttributes({
      'llm.provider': result.provider,
      'llm.model': result.model,
      'llm.complexity': result.complexity,
      'llm.quality': result.quality,
      'llm.cost': result.cost
    });

    span.end();
  }
}
```

**Grafana Dashboards:**
```yaml
# dashboard.yml
dashboards:
  - name: "LLM Performance"
    panels:
      - title: "Request Latency"
        type: "graph"
        targets:
          - expr: "histogram_quantile(0.95, llm_request_latency)"

      - title: "Model Selection"
        type: "pie"
        targets:
          - expr: "sum by (model) (llm_model_selection)"

      - title: "Cost Savings"
        type: "stat"
        targets:
          - expr: "sum(llm_request_cost{provider='claude'}) - sum(llm_request_cost)"

      - title: "Quality by Provider"
        type: "bar"
        targets:
          - expr: "avg by (provider) (llm_request_quality)"
```

**Alerts:**
```yaml
# alerts.yml
groups:
  - name: llm_quality
    rules:
      - alert: QualityDegradation
        expr: avg(llm_request_quality{provider='ollama'}) < 0.90
        for: 10m
        severity: critical
        annotations:
          summary: "Local LLM quality below 90%"

      - alert: HighLatency
        expr: histogram_quantile(0.95, llm_request_latency) > 5000
        for: 5m
        severity: warning
        annotations:
          summary: "P95 latency exceeds 5s"

      - alert: CircuitBreakerOpen
        expr: llm_circuit_breaker_state{state='open'} > 0
        for: 1m
        severity: warning
        annotations:
          summary: "Circuit breaker triggered for {{$labels.provider}}"
```

**Success Criteria:**
- ✅ All LLM requests instrumented with OpenTelemetry
- ✅ Grafana dashboards showing real-time metrics
- ✅ Alerts configured for quality/latency/circuit breaker
- ✅ Historical data retained for 90 days

---

#### **M2.5: Gradual Rollout** (Week 5-7)
**Status:** NOT STARTED

**Rollout Strategy:**
```
Week 5: 20% traffic to local (shadow mode)
  - Run both Claude and local in parallel
  - Compare results but only return Claude
  - Measure quality delta

Week 6: 50% traffic to local (A/B test)
  - Random split: 50% local, 50% Claude
  - Track user-reported issues
  - Monitor quality metrics

Week 7: 80% traffic to local (primary)
  - Local is primary, Claude is fallback
  - Circuit breaker for automatic rollback
  - Final validation before Phase 3
```

**A/B Test Configuration:**
```typescript
class ABTestRouter extends HybridRouter {
  private rolloutPercentage: number = 20;  // Start at 20%

  async complete(options: LLMCompletionOptions) {
    const bucket = this.assignBucket(options.requestId);

    if (bucket < this.rolloutPercentage) {
      // Local traffic
      return this.localProvider.complete(options);
    } else {
      // Claude traffic
      return this.cloudProvider.complete(options);
    }
  }

  private assignBucket(requestId: string): number {
    // Consistent hashing for stable bucketing
    const hash = crypto.createHash('md5').update(requestId).digest();
    return hash.readUInt32BE(0) % 100;
  }

  increaseRollout(newPercentage: number) {
    if (this.qualityCheck()) {
      this.rolloutPercentage = newPercentage;
      console.log(`Rollout increased to ${newPercentage}%`);
    } else {
      console.error('Quality check failed, rollout paused');
    }
  }

  private qualityCheck(): boolean {
    const recentQuality = this.getRecentQuality('local', 100);
    return average(recentQuality) >= 0.95;
  }
}
```

**Rollback Triggers:**
```typescript
if (qualityDrop > 5% || latencyIncrease > 50% || errorRate > 2%) {
  console.error('Rollback triggered');
  this.rolloutPercentage = Math.max(0, this.rolloutPercentage - 20);
}
```

**Success Criteria:**
- ✅ 20% rollout completes without issues (Week 5)
- ✅ 50% rollout maintains ≥95% quality (Week 6)
- ✅ 80% rollout stable for 7 days (Week 7)
- ✅ No user-reported quality degradation
- ✅ Automatic rollback tested and functional

---

#### **M2.6: Cost Optimization** (Week 7-8)
**Status:** NOT STARTED

**Analysis:**
```typescript
interface CostOptimizationReport {
  currentState: {
    routing: { local: string; cloud: string };
    monthlyCost: number;
    costPerRequest: number;
  };

  opportunities: Array<{
    optimization: string;
    potentialSavings: number;
    effort: 'low' | 'medium' | 'high';
  }>;

  recommendations: string[];
}

async function analyzeCostOptimization(): CostOptimizationReport {
  // Analyze routing patterns
  const routingStats = await getRoutingStats(30); // Last 30 days

  // Find over-routed complex tasks
  const overRouted = findOverRoutedTasks(routingStats);

  // Calculate potential savings
  const opportunities = [];

  if (overRouted.length > 100) {
    opportunities.push({
      optimization: 'Reduce complexity threshold for moderate tasks',
      potentialSavings: estimateSavings(overRouted),
      effort: 'low'
    });
  }

  // Analyze TRM iteration counts
  const avgTRMIterations = getAverageTRMIterations();
  if (avgTRMIterations > 5) {
    opportunities.push({
      optimization: 'Reduce TRM maxIterations from 7 to 5',
      potentialSavings: estimateLatencyReduction(avgTRMIterations - 5),
      effort: 'low'
    });
  }

  // Check for underutilized models
  const modelUsage = getModelUsage();
  const underutilized = Object.entries(modelUsage).filter(([_, usage]) => usage < 10);

  if (underutilized.length > 0) {
    opportunities.push({
      optimization: `Remove underutilized models: ${underutilized.map(m => m[0]).join(', ')}`,
      potentialSavings: estimateInfrastructureSavings(underutilized),
      effort: 'medium'
    });
  }

  return {
    currentState: {
      routing: {
        local: `${routingStats.localPercentage}%`,
        cloud: `${routingStats.cloudPercentage}%`
      },
      monthlyCost: calculateMonthlyCost(routingStats),
      costPerRequest: calculateCostPerRequest(routingStats)
    },
    opportunities,
    recommendations: generateRecommendations(opportunities)
  };
}
```

**Optimization Strategies:**
```typescript
// 1. Dynamic model selection based on load
if (serverLoad > 80%) {
  // Route to smaller models
  return 'rnj-1';  // 8B - Fast
} else {
  return 'devstral-small-2';  // 24B - Quality
}

// 2. Batch similar requests
const similarRequests = findSimilarRequests(request, pendingQueue, 10);
if (similarRequests.length > 3) {
  return batchProcess(similarRequests);  // 4x faster
}

// 3. Use cached patterns
const cachedPattern = this.patternStore.findExact(request);
if (cachedPattern && cachedPattern.confidence > 0.95) {
  return cachedPattern.response;  // Instant response
}
```

**Target Savings:**
```
Monthly Cost Reduction:  ≥60% vs pure Claude
Cost per Request:        <$0.001 (mostly infrastructure)
Infrastructure ROI:      Break-even in 12 months
```

**Success Criteria:**
- ✅ Cost reduction ≥60% vs pure Claude
- ✅ Optimization opportunities identified
- ✅ Dynamic model selection based on load
- ✅ Cost per request <$0.001

---

### Phase 2 Success Criteria

**By End of Week 16 (cumulative):**
- ✅ vLLM serving at 120+ req/sec with 99.5% uptime
- ✅ Multi-model routing based on learned patterns
- ✅ TRM improves quality by 5-10% for complex tasks
- ✅ 80%+ requests routed to local inference
- ✅ Cost reduction ≥60% vs pure Claude
- ✅ Quality maintained at ≥95% vs baseline
- ✅ OpenTelemetry instrumentation complete
- ✅ Grafana dashboards operational
- ✅ **DECISION: GO for Phase 3**

---

## Phase 3: Fine-Tuning Pipeline (UPDATED - 6-8 weeks)

**Goal:** Train custom QE models using Phi-4 with LoRA adapters

**Key Updates:**
- Phi-4 (14B) already available via agentic-flow package!
- ONNXProvider.ts as parallel path to OllamaProvider
- Use HNSW pattern store for 150x faster dataset curation
- Leverage SONA's ReasoningBank for high-quality examples

### Milestones

#### **M3.1: Dataset Curation from ReasoningBank** (Week 1-2)
**Status:** NOT STARTED
**Files:** `/scripts/curate-dataset.ts` (NEW)

**Leverage Existing SONA Data:**
```typescript
import { ReasoningBank } from '@ruvector/ruvllm';
import { HNSWPatternStore } from '../src/memory/HNSWPatternStore';

class DatasetCurator {
  private reasoningBank: ReasoningBank;
  private patternStore: HNSWPatternStore;

  async curateDataset(): Promise<FineTuningDataset> {
    // Extract high-quality examples from ReasoningBank
    const examples = await this.reasoningBank.findSimilar('', 10000, {
      minConfidence: 0.8,  // Only high-quality patterns
      minUsageCount: 3     // Only reused patterns
    });

    console.log(`Found ${examples.length} high-quality examples`);

    // Use HNSW for fast deduplication (150x faster than AgentDB)
    const deduplicated = await this.deduplicateWithHNSW(examples);
    console.log(`After deduplication: ${deduplicated.length} examples`);

    // Categorize by QE task type
    const categorized = {
      testGeneration: [],
      coverageAnalysis: [],
      flakyDetection: [],
      codeReview: []
    };

    for (const example of deduplicated) {
      const category = this.classifyExample(example);
      categorized[category].push(example);
    }

    // Balance dataset (ensure each category has sufficient examples)
    const balanced = this.balanceDataset(categorized);

    // Split into train/val/test
    const split = this.splitDataset(balanced, [0.7, 0.15, 0.15]);

    // Save in Hugging Face format
    await this.saveDataset(split, '/data/aqe-qe-dataset');

    return split;
  }

  private async deduplicateWithHNSW(examples: Example[]): Promise<Example[]> {
    const seen = new Set<number>();
    const unique = [];

    for (const example of examples) {
      const embedding = example.embedding;

      // Find very similar examples (cosine similarity > 0.95)
      const similar = this.patternStore.findSimilar(embedding, 1, 0.95);

      if (similar.length === 0 || !seen.has(similar[0].id)) {
        unique.push(example);
        seen.add(example.id);
      }
    }

    return unique;
  }

  private classifyExample(example: Example): string {
    // Use keywords or model to classify
    const text = example.text.toLowerCase();

    if (text.includes('test') && text.includes('expect')) {
      return 'testGeneration';
    } else if (text.includes('coverage') && text.includes('gap')) {
      return 'coverageAnalysis';
    } else if (text.includes('flaky') || text.includes('intermittent')) {
      return 'flakyDetection';
    } else {
      return 'codeReview';
    }
  }
}
```

**Dataset Statistics:**
```
Target Size:       10,000+ examples
Quality Threshold: ≥0.8 confidence
Usage Threshold:   ≥3 reuses
Categories:
  - Test Generation:   4,000 examples (40%)
  - Coverage Analysis: 3,000 examples (30%)
  - Flaky Detection:   2,000 examples (20%)
  - Code Review:       1,000 examples (10%)

Split:
  - Train:      7,000 examples (70%)
  - Validation: 1,500 examples (15%)
  - Test:       1,500 examples (15%)
```

**Success Criteria:**
- ✅ 10,000+ high-quality examples extracted from ReasoningBank
- ✅ HNSW deduplication <1 second for 10k examples
- ✅ Balanced dataset across QE categories
- ✅ Dataset saved in Hugging Face format
- ✅ Quality validation: manual review of 100 random samples

---

#### **M3.2: Phi-4 Base Model Setup** (Week 2-3)
**STATUS:** PARTIALLY DONE (Phi-4 available in agentic-flow!)

**Critical Finding: Phi-4 Already Available!**
```typescript
// From agentic-flow package (already a dependency!)
import { ONNXProvider } from 'agentic-flow';

// Phi-4 is included in the package!
const provider = new ONNXProvider({
  model: 'phi-4',
  quantization: '4bit',
  device: 'cpu'  // Or 'gpu' if available
});
```

**Parallel Path: ONNX vs Ollama**
```
Option A: ONNX (via agentic-flow)
  ✅ Already installed as dependency
  ✅ Phi-4 included
  ✅ CPU inference (no GPU required)
  ⚠️ Slower than GPU

Option B: Ollama (traditional path)
  ⚠️ Requires Phi-4 download
  ✅ GPU acceleration available
  ✅ Faster inference
  ❌ Additional setup
```

**Recommendation: Use BOTH**
```typescript
class DualPathRouter {
  private onnxProvider: ONNXProvider;    // CPU fallback
  private ollamaProvider: OllamaProvider; // GPU primary

  async complete(options: LLMCompletionOptions) {
    if (this.gpuAvailable) {
      // Use Ollama with GPU (faster)
      return this.ollamaProvider.complete(options);
    } else {
      // Use ONNX with CPU (no GPU required)
      return this.onnxProvider.complete(options);
    }
  }
}
```

**Setup Steps:**
```bash
# Option A: ONNX (ALREADY AVAILABLE!)
# No additional setup needed - agentic-flow is already installed

# Option B: Traditional Ollama path
ollama pull phi-4  # If model becomes available
```

**Baseline Evaluation:**
```typescript
async function baselineEvaluation() {
  const testCases = loadTestCases('/data/aqe-qe-dataset/test');
  const results = {
    onnx: { quality: [], latency: [] },
    ollama: { quality: [], latency: [] }
  };

  for (const testCase of testCases) {
    // Test ONNX Phi-4
    const onnxResult = await onnxProvider.complete(testCase);
    results.onnx.quality.push(scoreQuality(onnxResult));
    results.onnx.latency.push(onnxResult.latency);

    // Test Ollama Phi-4 (if available)
    if (ollamaProvider) {
      const ollamaResult = await ollamaProvider.complete(testCase);
      results.ollama.quality.push(scoreQuality(ollamaResult));
      results.ollama.latency.push(ollamaResult.latency);
    }
  }

  console.log('Baseline Evaluation:');
  console.log(`ONNX:   Quality=${average(results.onnx.quality)}, Latency=${average(results.onnx.latency)}ms`);
  console.log(`Ollama: Quality=${average(results.ollama.quality)}, Latency=${average(results.ollama.latency)}ms`);
}
```

**Success Criteria:**
- ✅ Phi-4 available via ONNX (already done!)
- ✅ Baseline quality evaluation complete
- ✅ Latency benchmarks established
- ✅ Decision made: ONNX vs Ollama vs both

---

#### **M3.3: LoRA Fine-Tuning** (Week 3-5)
**Status:** NOT STARTED
**Files:** `/scripts/finetune-phi4.py` (NEW)

```python
"""
Fine-tune Phi-4 on AQE QE dataset using LoRA
"""

from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_from_disk
import torch

# Load Phi-4 base model
model_name = "microsoft/phi-4"
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# LoRA configuration (Phi-4 optimized)
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,                    # LoRA rank
    lora_alpha=32,           # Scaling factor
    lora_dropout=0.1,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",  # Attention
        "gate_proj", "up_proj", "down_proj"       # MLP
    ],
    bias="none"
)

# Apply LoRA
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # Should be <5% of total params

# Load curated dataset
dataset = load_from_disk("/data/aqe-qe-dataset")

# Training arguments
training_args = TrainingArguments(
    output_dir="/models/phi4-aqe-qe",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    warmup_steps=100,
    logging_steps=10,
    eval_steps=100,
    save_steps=500,
    save_total_limit=3,
    evaluation_strategy="steps",
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    greater_is_better=False,
    fp16=True,  # Mixed precision training
    report_to="tensorboard"
)

# Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    tokenizer=tokenizer
)

# Fine-tune
trainer.train()

# Save LoRA adapter
model.save_pretrained("/models/phi4-aqe-qe/final")
tokenizer.save_pretrained("/models/phi4-aqe-qe/final")

# Export for ONNX
# (For agentic-flow integration)
```

**Expected Training Time:**
```
Dataset:   7,000 train examples
Epochs:    3
Batch:     4 per device
Gradient Accumulation: 4 (effective batch=16)
Hardware:  A100 GPU (40GB VRAM)
Time:      ~8 hours
```

**LoRA Efficiency:**
```
Total Parameters:     14B
Trainable Parameters: ~220M (1.6%)
Memory Required:      ~20GB VRAM (vs 56GB for full fine-tuning)
Training Cost:        ~$10 on cloud GPU
```

**Success Criteria:**
- ✅ LoRA fine-tuning completes without errors
- ✅ Training loss converges (validation loss decreases)
- ✅ Trainable parameters <5% of total
- ✅ Final checkpoint saved and validated
- ✅ ONNX export successful (for agentic-flow)

---

#### **M3.4: Multi-Task Adapter Training** (Week 5-7)
**Status:** NOT STARTED

**Strategy: Train Separate Adapters per QE Task**
```python
# Train 4 specialized LoRA adapters
adapters = {
    'test-generation': finetune(dataset['testGeneration']),
    'coverage-analysis': finetune(dataset['coverageAnalysis']),
    'flaky-detection': finetune(dataset['flakyDetection']),
    'code-review': finetune(dataset['codeReview'])
}

# Save adapters
for task, adapter in adapters.items():
    adapter.save_pretrained(f"/models/phi4-aqe-qe/{task}.adapter")
```

**Hot-Swapping Adapters:**
```typescript
class MultiTaskPhi4Provider {
  private baseModel: ONNXProvider;
  private adapters: Map<string, LoraAdapter>;

  async complete(options: LLMCompletionOptions) {
    // Select adapter based on task type
    const taskType = this.classifyTask(options);
    const adapter = this.adapters.get(taskType);

    // Hot-swap adapter (low overhead)
    this.baseModel.loadAdapter(adapter);

    // Generate with task-specific adapter
    return this.baseModel.complete(options);
  }

  private classifyTask(options: LLMCompletionOptions): string {
    // Use keywords or fast classifier
    const text = options.messages[0].content.toLowerCase();

    if (text.includes('test') || text.includes('expect')) {
      return 'test-generation';
    } else if (text.includes('coverage')) {
      return 'coverage-analysis';
    } else if (text.includes('flaky')) {
      return 'flaky-detection';
    } else {
      return 'code-review';
    }
  }
}
```

**Adapter Benchmarking:**
```typescript
async function benchmarkAdapters() {
  const results = {};

  for (const [task, adapter] of adapters) {
    const testCases = loadTestCases(task);
    const quality = [];

    for (const testCase of testCases) {
      provider.loadAdapter(adapter);
      const result = await provider.complete(testCase);
      quality.push(scoreQuality(result));
    }

    results[task] = {
      avgQuality: average(quality),
      improvement: average(quality) - baselineQuality[task]
    };
  }

  console.log('Adapter Performance:');
  console.table(results);
}
```

**Expected Improvement:**
```
Task-specific adapters vs single adapter:
  - Test Generation:   +12% quality
  - Coverage Analysis: +15% quality
  - Flaky Detection:   +18% quality
  - Code Review:       +10% quality

Average: +13.75% improvement
```

**Success Criteria:**
- ✅ 4 task-specific adapters trained
- ✅ Hot-swapping functional (<100ms overhead)
- ✅ Task classification accuracy >90%
- ✅ Adapters improve quality by 10%+ vs base
- ✅ Memory usage <2GB per adapter

---

#### **M3.5: Quality Evaluation** (Week 7-8)
**Status:** NOT STARTED

**Comprehensive Benchmark:**
```typescript
interface QualityBenchmark {
  model: string;
  testGeneration: number;
  coverageAnalysis: number;
  flakyDetection: number;
  codeReview: number;
  overall: number;
}

async function comprehensiveEvaluation(): Promise<QualityBenchmark[]> {
  const models = [
    { name: 'Phi-4 Base', provider: phi4BaseProvider },
    { name: 'Phi-4 Fine-tuned', provider: phi4FineTunedProvider },
    { name: 'Qwen 2.5 Coder 7B', provider: qwenProvider },
    { name: 'Claude Sonnet 4.5', provider: claudeProvider }
  ];

  const results = [];

  for (const model of models) {
    const scores = {
      model: model.name,
      testGeneration: await evaluateTask(model.provider, 'test-generation'),
      coverageAnalysis: await evaluateTask(model.provider, 'coverage-analysis'),
      flakyDetection: await evaluateTask(model.provider, 'flaky-detection'),
      codeReview: await evaluateTask(model.provider, 'code-review'),
      overall: 0
    };

    scores.overall = (
      scores.testGeneration +
      scores.coverageAnalysis +
      scores.flakyDetection +
      scores.codeReview
    ) / 4;

    results.push(scores);
  }

  // Generate report
  console.log('Quality Evaluation Results:');
  console.table(results);

  // Calculate vs Claude baseline
  const claudeBaseline = results.find(r => r.model.includes('Claude'));
  const phi4FineTuned = results.find(r => r.model.includes('Fine-tuned'));
  const qualityRatio = phi4FineTuned.overall / claudeBaseline.overall;

  console.log(`\nFine-tuned Phi-4 achieves ${(qualityRatio * 100).toFixed(1)}% of Claude quality`);

  if (qualityRatio >= 0.95) {
    console.log('✅ PASS: Fine-tuned Phi-4 achieves ≥95% quality vs Claude');
  } else {
    console.log(`⚠️ BELOW TARGET: ${((0.95 - qualityRatio) * 100).toFixed(1)}% quality gap`);
  }

  return results;
}
```

**Target Metrics:**
```
Phi-4 Fine-tuned vs Claude Sonnet 4.5:
  - Test Generation:   ≥95% quality
  - Coverage Analysis: ≥95% quality
  - Flaky Detection:   ≥95% quality
  - Code Review:       ≥90% quality (lower bar for subjective task)
  - Overall:           ≥95% quality
```

**Success Criteria:**
- ✅ Fine-tuned Phi-4 achieves ≥95% quality vs Claude
- ✅ Task-specific adapters outperform single adapter
- ✅ Latency <3s for P95
- ✅ Memory usage <16GB
- ✅ **DECISION: GO for Phase 4**

---

#### **M3.6: Deployment & Integration** (Week 8-10)
**Status:** NOT STARTED

**vLLM Deployment:**
```bash
# Deploy fine-tuned Phi-4 to vLLM cluster
python -m vllm.entrypoints.openai.api_server \
  --model /models/phi4-aqe-qe/final \
  --lora-modules \
    test-gen=/models/phi4-aqe-qe/test-generation.adapter \
    coverage=/models/phi4-aqe-qe/coverage-analysis.adapter \
    flaky=/models/phi4-aqe-qe/flaky-detection.adapter \
    review=/models/phi4-aqe-qe/code-review.adapter \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.9
```

**Integration with HybridRouter:**
```typescript
class HybridRouter implements ILLMProvider {
  private phi4Provider: Phi4Provider;    // Fine-tuned Phi-4
  private ollamaProvider: OllamaProvider; // Base models
  private claudeProvider: ClaudeProvider; // Emergency fallback

  protected selectProvider(options: LLMCompletionOptions): string {
    // Prefer fine-tuned Phi-4 for QE tasks
    if (this.isQETask(options)) {
      return 'phi4';
    }

    // Use base models for non-QE tasks
    if (options.complexity === 'simple') {
      return 'ollama';
    }

    // Emergency fallback
    return 'claude';
  }

  private isQETask(options: LLMCompletionOptions): boolean {
    const categories = [
      'test-generation',
      'coverage-analysis',
      'flaky-detection',
      'code-review'
    ];
    return categories.includes(options.category);
  }
}
```

**A/B Testing:**
```
Week 8: 20% → Phi-4 fine-tuned
Week 9: 50% → Phi-4 fine-tuned
Week 10: 80% → Phi-4 fine-tuned
```

**Success Criteria:**
- ✅ Fine-tuned Phi-4 deployed to vLLM
- ✅ LoRA adapters hot-swappable
- ✅ Integration with HybridRouter complete
- ✅ A/B test shows ≥95% quality maintained
- ✅ No performance regressions

---

### Phase 3 Success Criteria

**By End of Week 26 (cumulative):**
- ✅ 10,000+ labeled QE examples curated from ReasoningBank
- ✅ Phi-4 fine-tuned with LoRA on QE dataset
- ✅ Multi-task adapters improve domain-specific quality by 10%+
- ✅ Fine-tuned Phi-4 achieves ≥95% quality vs Claude
- ✅ LoRA adapters reduce memory usage by 80%+
- ✅ Deployment pipeline for continuous fine-tuning
- ✅ **DECISION: GO for Phase 4**

---

## Phase 4: Full Independence (UPDATED - 6-8 weeks)

**Goal:** Self-learning fleet with federated agents, zero vendor dependency

**Key Updates:**
- SONA self-learning ALREADY IMPLEMENTED!
- Focus on enabling and tuning, not building
- Leverage federated learning foundation from Phase 0

### Milestones

#### **M4.1: Enable SONA Self-Learning** (Week 1-2)
**STATUS:** SONA IS ALREADY IMPLEMENTED! ✅

**Critical Finding: SONA Lifecycle Manager Exists!**
```typescript
// From src/agents/SONALifecycleManager.ts (ALREADY EXISTS!)
class SONALifecycleManager {
  // Three-loop learning system (ALREADY IMPLEMENTED)
  private instantLoop: InstantLoop;    // Per-request learning
  private backgroundLoop: BackgroundLoop; // Hourly consolidation
  private deepLoop: DeepLoop;          // Weekly EWC++ training

  async processAgentExecution(execution: AgentExecution) {
    // Store trajectory in ReasoningBank (ALREADY WORKS)
    await this.reasoningBank.store(execution.trajectory);

    // Instant learning from feedback (ALREADY WORKS)
    if (execution.feedback) {
      await this.instantLoop.learn(execution);
    }
  }

  async scheduleBackgroundLearning() {
    // Background loop runs hourly (ALREADY SCHEDULED)
    setInterval(() => {
      this.backgroundLoop.consolidatePatterns();
    }, 3600000);
  }

  async scheduleDeepLearning() {
    // Deep loop runs weekly (ALREADY SCHEDULED)
    setInterval(() => {
      this.deepLoop.trainEWCPlusPlus();
    }, 604800000);
  }
}
```

**What Needs to be ENABLED (not built):**
```typescript
// 1. Enable continuous learning flag
const config = {
  learningEnabled: true,        // ✅ ALREADY ENABLED
  continuousImprovement: true,  // ⚠️ NEEDS ENABLING
  trajectoryTracking: true,     // ✅ ALREADY ENABLED
  reasoningBankActive: true     // ✅ ALREADY ENABLED
};

// 2. Configure learning intervals (tune, not build)
const learningSchedule = {
  instantLoop: 'per-request',   // ✅ Already per-request
  backgroundLoop: '1h',         // ⚠️ Tune to '30m' for faster learning
  deepLoop: '7d'                // ⚠️ Tune to '3d' for faster convergence
};

// 3. Enable quality tracking (already exists, just activate)
this.sona.enableQualityTracking();
this.sona.enableImprovementMetrics();
```

**Tuning SONA (not building):**
```typescript
class SONATuner {
  async optimizeLearningSchedule() {
    // Tune background loop frequency
    const currentFrequency = this.sona.backgroundLoop.frequency;

    // Analyze learning convergence rate
    const convergenceRate = this.analyzeConvergence(30); // 30 days

    if (convergenceRate < 0.05) {
      // Slow convergence → increase frequency
      this.sona.backgroundLoop.frequency = '30m';
      console.log('Background loop accelerated to 30 minutes');
    }
  }

  async measureQualityImprovement() {
    // Track quality over time
    const baseline = this.getBaselineQuality();
    const current = this.getCurrentQuality();
    const improvement = ((current - baseline) / baseline) * 100;

    console.log(`SONA improvement: +${improvement.toFixed(1)}% over baseline`);

    // Target: 5-10% improvement over 30 days
    if (improvement >= 5) {
      console.log('✅ SONA learning target achieved');
    } else {
      console.log(`⚠️ SONA learning below target (${improvement.toFixed(1)}% < 5%)`);
      // Tune learning parameters
      this.tuneLearningRate();
    }
  }
}
```

**Success Criteria:**
- ✅ SONA continuous learning enabled (just config change!)
- ✅ Learning schedules tuned for optimal convergence
- ✅ Quality improvement tracked over 30 days
- ✅ 5-10% quality improvement demonstrated
- ✅ ReasoningBank stores all successful trajectories

---

#### **M4.2: Federated Agent Training** (Week 2-4)
**STATUS:** FOUNDATION EXISTS (Phase 0), now scale to all agents

**Current Status:**
```typescript
// From Phase 0: FederatedManager foundation exists
// Now: Scale to all 20 QE agents + 11 subagents

const agents = [
  // 20 Main QE Agents
  'qe-test-generator',
  'qe-coverage-analyzer',
  'qe-flaky-detector',
  // ... 17 more

  // 11 Subagents
  'tdd-london-specialist',
  'tdd-chicago-specialist',
  // ... 9 more
];

// Enable federated learning for entire fleet
for (const agentId of agents) {
  federatedManager.registerAgent(agentId);
}
```

**Federated Learning Protocol:**
```typescript
class FleetFederatedLearning {
  async enableFleetLearning() {
    // 1. Each agent learns locally
    for (const agent of this.fleet.agents) {
      agent.enableLocalLearning();
    }

    // 2. Aggregate gradients every 1000 tasks
    this.coordinator.setAggregationInterval(1000);

    // 3. Distribute updated weights back to agents
    this.coordinator.enableWeightDistribution();

    // 4. Privacy-preserving (gradient-only sharing)
    this.coordinator.enableSecureAggregation();
  }

  async monitorFederatedLearning() {
    // Track convergence across fleet
    const convergence = this.coordinator.getConvergenceMetrics();

    console.log('Federated Learning Status:');
    console.log(`  Agents participating: ${convergence.activeAgents}`);
    console.log(`  Total gradients aggregated: ${convergence.totalGradients}`);
    console.log(`  Convergence rate: ${convergence.rate.toFixed(3)}`);
    console.log(`  Quality improvement: +${convergence.improvement.toFixed(1)}%`);
  }
}
```

**Privacy Design:**
```typescript
// NO raw data shared between agents
// ONLY gradients (weight updates)

const gradient = agent.computeGradient(localData);  // Local computation
coordinator.aggregate(gradient);                     // Share only gradient
const updatedWeights = coordinator.exportWeights(); // Get global weights
agent.updateWeights(updatedWeights);                 // Apply to local model
```

**Success Criteria:**
- ✅ All 31 agents (20 + 11) registered in federated system
- ✅ Gradients aggregated every 1000 tasks
- ✅ Weight distribution functional
- ✅ Privacy validation: no raw data leakage
- ✅ 30% faster learning convergence vs isolated agents

---

#### **M4.3: Autonomous Model Selection** (Week 4-5)
**Status:** NOT STARTED
**Files:** `/src/providers/AutonomousRouter.ts` (NEW)

**Train Meta-Model for Routing:**
```typescript
/**
 * Meta-model learns optimal routing from historical data
 * Replaces manual routing rules with learned policy
 */
class AutonomousRouter extends HybridRouter {
  private metaModel: MetaModel;

  async initialize() {
    // Train meta-model on historical routing decisions
    const trainingData = await this.loadRoutingHistory(10000);
    this.metaModel = await this.trainMetaModel(trainingData);
  }

  async complete(options: LLMCompletionOptions) {
    // Extract task features
    const features = this.extractFeatures(options);

    // Predict optimal model
    const prediction = this.metaModel.predict(features);

    // Use predicted model
    const provider = this.getProvider(prediction.model);
    return provider.complete(options);
  }

  private extractFeatures(options: LLMCompletionOptions): TaskFeatures {
    return {
      complexity: this.estimateComplexity(options),
      category: this.categorizeTask(options),
      tokenCount: this.estimateTokens(options),
      hasContext: options.messages.length > 1,
      priority: options.priority || 'medium'
    };
  }

  private async trainMetaModel(data: RoutingHistory[]): Promise<MetaModel> {
    // Features: complexity, category, tokens, context
    // Target: optimal model + quality + latency

    const X = data.map(d => [
      d.complexity,
      d.category,
      d.tokenCount,
      d.hasContext ? 1 : 0
    ]);

    const y = data.map(d => ({
      model: d.actualModel,
      quality: d.quality,
      latency: d.latency
    }));

    // Train decision tree or gradient boosting
    const model = new GradientBoostingClassifier();
    model.fit(X, y);

    return model;
  }
}
```

**Reinforcement Learning for Continuous Optimization:**
```typescript
class RLRouter extends AutonomousRouter {
  private qTable: Map<string, Map<string, number>>;

  async learn(state: State, action: Action, reward: number, nextState: State) {
    // Q-learning update
    const currentQ = this.qTable.get(state)?.get(action) || 0;
    const maxNextQ = Math.max(...this.qTable.get(nextState).values());

    const newQ = currentQ + this.learningRate * (
      reward + this.discountFactor * maxNextQ - currentQ
    );

    this.qTable.get(state).set(action, newQ);
  }

  async selectAction(state: State): Action {
    // Epsilon-greedy exploration
    if (Math.random() < this.epsilon) {
      return this.randomAction();  // Explore
    } else {
      return this.bestAction(state);  // Exploit
    }
  }

  private calculateReward(result: LLMResult): number {
    // Reward function: balance quality, latency, cost
    const qualityScore = result.quality;          // 0-1
    const latencyPenalty = result.latency / 5000; // Normalize by 5s
    const costPenalty = result.cost * 1000;       // Normalize by $0.001

    return qualityScore - latencyPenalty - costPenalty;
  }
}
```

**Success Criteria:**
- ✅ Meta-model trained on 10k+ routing decisions
- ✅ Autonomous routing outperforms manual rules by 10%+
- ✅ RL policy converges after 5000 tasks
- ✅ Quality/latency/cost balance optimal
- ✅ Continuous learning from new data

---

#### **M4.4: Disable Claude API (Emergency Fallback Only)** (Week 5-6)
**Status:** NOT STARTED

**Configuration:**
```typescript
// src/providers/HybridRouter.ts
class HybridRouter implements ILLMProvider {
  private config = {
    // DISABLE Claude for normal operations
    claudeEnabled: false,

    // ENABLE Claude ONLY for emergency fallback
    emergencyFallbackEnabled: true,

    // Circuit breaker configuration
    circuitBreaker: {
      failureThreshold: 3,      // 3 consecutive local failures
      qualityThreshold: 0.90,   // Quality below 90%
      latencyThreshold: 10000,  // Latency above 10s
      fallbackTo: 'claude'      // Emergency fallback
    }
  };

  async complete(options: LLMCompletionOptions) {
    // Try local inference
    try {
      const result = await this.localProvider.complete(options);

      // Check quality
      if (result.quality < this.config.circuitBreaker.qualityThreshold) {
        this.circuitBreaker.recordFailure('quality');
      }

      // Check latency
      if (result.latency > this.config.circuitBreaker.latencyThreshold) {
        this.circuitBreaker.recordFailure('latency');
      }

      // If circuit breaker opens, use Claude
      if (this.circuitBreaker.isOpen()) {
        console.warn('Circuit breaker OPEN - using Claude fallback');
        return this.claudeProvider.complete(options);
      }

      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure('error');

      if (this.circuitBreaker.isOpen()) {
        console.error('Local inference failed - using Claude fallback');
        return this.claudeProvider.complete(options);
      }

      throw error;
    }
  }
}
```

**Emergency Fallback Triggers:**
```typescript
enum FallbackTrigger {
  LOCAL_FAILURE,      // 3+ consecutive errors
  QUALITY_DROP,       // Quality below 90%
  LATENCY_SPIKE,      // Latency above 10s
  GPU_UNAVAILABLE,    // GPU server down
  MODEL_NOT_LOADED    // Model loading failed
}

// Alert on fallback usage
if (fallbackTriggered) {
  this.alerting.send({
    severity: 'warning',
    message: `Claude fallback triggered: ${trigger}`,
    timestamp: Date.now()
  });
}
```

**Success Criteria:**
- ✅ Claude disabled for normal operations
- ✅ Emergency fallback functional
- ✅ Circuit breaker triggers correctly
- ✅ Fallback usage <1% of requests
- ✅ Alerts sent when fallback used

---

#### **M4.5: Final Validation** (Week 6-7)
**Status:** NOT STARTED

**Run 10,000 QE Tasks:**
```typescript
async function finalValidation() {
  const tasks = generateTestTasks(10000);
  const results = {
    total: 0,
    localSuccess: 0,
    cloudFallback: 0,
    quality: [],
    latency: [],
    cost: []
  };

  for (const task of tasks) {
    const result = await router.complete(task);

    results.total++;

    if (result.provider === 'local') {
      results.localSuccess++;
    } else {
      results.cloudFallback++;
    }

    results.quality.push(result.quality);
    results.latency.push(result.latency);
    results.cost.push(result.cost);
  }

  // Calculate final metrics
  const metrics = {
    localRouting: (results.localSuccess / results.total) * 100,
    cloudFallback: (results.cloudFallback / results.total) * 100,
    avgQuality: average(results.quality),
    p50Latency: percentile(results.latency, 0.50),
    p95Latency: percentile(results.latency, 0.95),
    monthlyCost: sum(results.cost) * (30 * 24 * 60) / 10000,  // Extrapolate
    uptime: calculateUptime(results)
  };

  // Generate independence report
  console.log('AQE Fleet LLM Independence - Final Validation:');
  console.log(`  Local Routing:  ${metrics.localRouting.toFixed(1)}%`);
  console.log(`  Cloud Fallback: ${metrics.cloudFallback.toFixed(1)}%`);
  console.log(`  Avg Quality:    ${(metrics.avgQuality * 100).toFixed(1)}%`);
  console.log(`  P50 Latency:    ${metrics.p50Latency.toFixed(0)}ms`);
  console.log(`  P95 Latency:    ${metrics.p95Latency.toFixed(0)}ms`);
  console.log(`  Monthly Cost:   $${metrics.monthlyCost.toFixed(2)}`);
  console.log(`  Uptime:         ${(metrics.uptime * 100).toFixed(2)}%`);

  // Success criteria
  const success = {
    localRouting: metrics.localRouting >= 99,
    quality: metrics.avgQuality >= 0.95,
    latency: metrics.p95Latency < 5000,
    cost: metrics.monthlyCost < 500,
    uptime: metrics.uptime >= 0.999
  };

  if (Object.values(success).every(v => v)) {
    console.log('\n✅ INDEPENDENCE ACHIEVED! All criteria met.');
  } else {
    console.log('\n⚠️ Some criteria not met:');
    for (const [criterion, met] of Object.entries(success)) {
      if (!met) {
        console.log(`  - ${criterion}: FAIL`);
      }
    }
  }

  return metrics;
}
```

**Success Criteria:**
- ✅ 99%+ requests served by local inference
- ✅ Claude usage <1% (emergency fallback only)
- ✅ Quality ≥95% vs baseline
- ✅ Latency P50 < 2s, P95 < 5s
- ✅ Monthly cost <$500 (infrastructure only)
- ✅ Uptime 99.9%+
- ✅ **INDEPENDENCE ACHIEVED**

---

#### **M4.6: Documentation & Handoff** (Week 7-8)
**Status:** NOT STARTED

**Documentation Deliverables:**
```
/docs/llm-independence/
  ├── architecture.md           - System architecture
  ├── deployment-guide.md       - Deployment procedures
  ├── operational-runbook.md    - Day-to-day operations
  ├── troubleshooting.md        - Common issues and fixes
  ├── monitoring-guide.md       - Observability and alerts
  ├── cost-analysis.md          - Cost breakdown and optimization
  ├── quality-benchmarks.md     - Quality metrics and baselines
  └── future-improvements.md    - Roadmap for enhancements
```

**Operational Runbook:**
```markdown
# AQE Fleet LLM Independence - Operational Runbook

## Daily Operations

### Health Checks
```bash
# Check vLLM cluster status
curl http://localhost:8000/health

# Check Ollama status
ollama list

# Check routing metrics
curl http://localhost:3000/metrics/routing
```

### Monitoring Dashboards
- **Grafana:** http://localhost:3000/d/llm-performance
- **Alertmanager:** http://localhost:9093
- **Prometheus:** http://localhost:9090

## Troubleshooting

### Issue: High Latency (P95 > 5s)
**Symptoms:** Slow responses, user complaints
**Diagnosis:**
```bash
# Check GPU utilization
nvidia-smi

# Check vLLM queue depth
curl http://localhost:8000/metrics | grep queue
```
**Resolution:**
1. Scale vLLM cluster (add more GPUs)
2. Route more traffic to faster models (rnj-1)
3. Enable caching for common patterns

### Issue: Quality Drop (<90%)
**Symptoms:** Test failures, poor coverage analysis
**Diagnosis:**
```bash
# Check recent quality metrics
node scripts/quality-dashboard.js --last 1h
```
**Resolution:**
1. Trigger SONA learning consolidation
2. Review low-quality patterns
3. Increase TRM iterations for complex tasks
4. Temporary failover to Claude

## Escalation

### Level 1: On-call Engineer
- Restart services
- Check logs
- Basic troubleshooting

### Level 2: ML Team
- Model quality issues
- Fine-tuning problems
- Learning convergence

### Level 3: Architecture Team
- System design issues
- Routing logic bugs
- Infrastructure scaling
```

**Training Materials:**
```
/docs/training/
  ├── llm-basics.md           - LLM fundamentals
  ├── vllm-operations.md      - vLLM operations guide
  ├── routing-logic.md        - Routing decision explanation
  ├── sona-learning.md        - SONA learning system
  └── troubleshooting-lab.md  - Hands-on troubleshooting
```

**Success Criteria:**
- ✅ Complete documentation published
- ✅ Operations team trained (2-day workshop)
- ✅ Runbooks tested in staging
- ✅ 24/7 on-call rotation established
- ✅ Public release announcement drafted

---

### Phase 4 Success Criteria

**By End of Week 32 (cumulative):**
- ✅ 99%+ requests served by local inference
- ✅ SONA improves quality by 5-10% over 30 days
- ✅ Federated learning reduces per-agent fine-tuning cost
- ✅ Autonomous routing outperforms manual rules
- ✅ Claude usage <1% (emergency fallback only)
- ✅ Total independence achieved
- ✅ Complete documentation and training
- ✅ Operations team ready
- ✅ **MISSION ACCOMPLISHED**

---

## Updated Resource Requirements

### Hardware

#### Development (Phase 0-1)
- **CPU:** 16GB+ RAM, 8+ cores
- **GPU:** Optional (CPU acceptable)
- **Storage:** 50GB for models
- **Cost:** $0 (use existing)

#### Production (Phase 2-4)
- **GPU Server:** NVIDIA A10/T4 (24GB) or A100 (40GB)
  - vLLM cluster: 2-4 servers
  - Cost: ~$1-2/hour
- **Storage:** 500GB
- **Network:** <10ms latency

### Software

- **Inference:** Ollama (dev), vLLM (prod), ONNX (CPU)
- **Training:** Transformers, PEFT, DeepSpeed
- **Monitoring:** OpenTelemetry, Prometheus, Grafana
- **Models:**
  - December 2025: devstral-small-2, rnj-1, Qwen3-Coder-30B-A3B
  - Phi-4 (14B) - via agentic-flow (ALREADY AVAILABLE!)

### Team

- **Phase 0 (Optimization):** 1 backend engineer (2 weeks)
- **Phase 1 (MVP):** 1 backend, 1 QE (6-8 weeks)
- **Phase 2 (Production):** 2 engineers, 1 SRE, 1 QE (6-8 weeks)
- **Phase 3 (Fine-Tuning):** 2 ML, 1 backend, 1 QE (6-8 weeks)
- **Phase 4 (Independence):** 2 ML, 2 backend, 1 SRE, 1 QE (6-8 weeks)

### Updated Budget

```
Phase 0 (Optimization):
- Team: 1 engineer × 2 weeks × $2000/week = $4,000
- Infrastructure: $0 (use existing)
- Total: $4,000

Phase 1 (MVP):
- Team: 2 engineers × 8 weeks × $2000/week = $32,000
- Infrastructure: $0 (use existing)
- Total: $32,000

Phase 2 (Production):
- Team: 4 engineers × 8 weeks × $2000/week = $64,000
- GPU servers: 2 × $2/hr × 24h × 56 days = $5,376
- Total: $69,376

Phase 3 (Fine-Tuning):
- Team: 4 engineers × 8 weeks × $2000/week = $64,000
- A100 GPU: 1 × $3/hr × 24h × 56 days = $4,032
- Total: $68,032

Phase 4 (Independence):
- Team: 6 engineers × 8 weeks × $2000/week = $96,000
- Infrastructure: $6,000 (maintenance)
- Total: $102,000

GRAND TOTAL: $275,408 (vs $280,416 in v1)

Savings from v2:
- 4 weeks faster timeline
- $5,008 cost reduction
- Lower risk (optimize existing first)
- Quick wins in Phase 0
```

**ROI Analysis:**
```
Current Claude costs: ~$5,000/month
Post-migration costs: <$500/month (GPU + <1% fallback)
Monthly savings: $4,500
Break-even: 61 months (~5 years)

But ALSO adds:
- Privacy (no data leaves machine)
- Control (no rate limits)
- Learning (continuous improvement)
- Scalability (unlimited local inference)
```

---

## Risk Assessment & Mitigations

### Updated Critical Risks

#### R1: Quality Degradation (LOWER RISK NOW)
- **v1 Risk:** MEDIUM
- **v2 Risk:** LOW
- **Reason:** Phase 0 optimizes existing system first, establishes baselines
- **Mitigation:**
  - Phase 0 proves RuvLLM optimization works
  - TRM tuned per-model for optimal quality
  - SONA already implemented, just needs enabling
  - Phi-4 already available via agentic-flow

#### R2: Latency Regression (SAME RISK)
- **Risk:** LOW
- **Mitigation:**
  - GPU mandatory for prod
  - HNSW pattern store 150x faster
  - Batch queries 4x throughput
  - SessionManager 50% faster multi-turn

#### R3: Infrastructure Costs (LOWER RISK)
- **v1 Risk:** LOW
- **v2 Risk:** VERY LOW
- **Reason:** Better cost optimization with learned routing
- **Mitigation:**
  - Autonomous routing optimizes cost/quality tradeoff
  - Pattern caching reduces inference needs
  - MoE models (Qwen3-30B-A3B) use only 3B active params

### New Risks

#### R4: RuvLLM Dependency
- **Risk:** MEDIUM
- **Impact:** MEDIUM
- **Mitigation:**
  - RuvLLM is open-source (@ruvector/ruvllm)
  - Can replace with manual routing if needed
  - Standard HNSW algorithm (hnswlib-node fallback)
  - Keep direct Ollama path as backup

#### R5: Phi-4 ONNX Performance
- **Risk:** MEDIUM (if GPU unavailable)
- **Impact:** LOW
- **Mitigation:**
  - Use ONNX for CPU fallback only
  - Primary path uses GPU (Ollama or vLLM)
  - Quality acceptable even on CPU
  - Can scale horizontally (more CPU servers)

---

## Success Criteria (Updated)

### Phase 0: RuvLLM Optimization
- ✅ SessionManager 50% latency reduction
- ✅ Batch queries 4x throughput
- ✅ HNSW pattern store 150x faster
- ✅ Federated learning foundation tested
- ✅ Feature utilization: 35% → 65%

### Phase 1: Local MVP
- ✅ Ollama serving at 60-120 req/sec
- ✅ OllamaProvider fully implemented
- ✅ Quality ≥90% vs Claude baseline
- ✅ Cost savings ≥50%
- ✅ 40%+ local routing

### Phase 2: Production
- ✅ 80%+ local routing
- ✅ Quality ≥95%
- ✅ Cost reduction ≥60%
- ✅ Latency P50 < 2s, P95 < 5s
- ✅ Uptime 99.5%+

### Phase 3: Fine-Tuning
- ✅ Phi-4 fine-tuned ≥95% quality
- ✅ LoRA adapters 80% memory reduction
- ✅ Multi-task adapters +10% quality
- ✅ ONNX deployment functional

### Phase 4: Independence
- ✅ 99%+ local routing
- ✅ Claude <1% (emergency)
- ✅ SONA +5-10% improvement
- ✅ Autonomous routing +10% optimization
- ✅ **INDEPENDENCE ACHIEVED**

---

## Decision Points

### GO/NO-GO: Phase 0 → Phase 1
**Week 2 (Phase 0 end)**

Criteria:
- ✅ Quick wins achieve 50%+ improvement targets
- ✅ HNSW pattern store 100x+ faster
- ✅ No regressions in existing functionality

Decision: **GO** if all met, **EXTEND** Phase 0 by 1 week if partial

### GO/NO-GO: Phase 1 → Phase 2
**Week 8 (Phase 1 end)**

Criteria:
- ✅ Quality ≥90% vs Claude
- ✅ Cost savings ≥50%
- ✅ No critical bugs

Decision: **GO** if all met, **PIVOT** if quality <85%

### GO/NO-GO: Phase 2 → Phase 3
**Week 16 (Phase 2 end)**

Criteria:
- ✅ 80%+ local routing stable
- ✅ Quality ≥95% maintained
- ✅ Cost reduction ≥60%

Decision: **GO** if all met, **PAUSE** to optimize if quality <90%

### GO/NO-GO: Phase 3 → Phase 4
**Week 26 (Phase 3 end)**

Criteria:
- ✅ Fine-tuned Phi-4 ≥95% quality
- ✅ LoRA adapters functional
- ✅ Team confident in deployment

Decision: **GO** if all met, **EXTEND Phase 3** if quality <90%

---

## Rollback Plan (Simplified)

### Immediate (<1 hour)
```typescript
// Force all traffic to Claude
HybridRouter.defaultStrategy = RoutingStrategy.QUALITY_OPTIMIZED;
HybridRouter.localEnabled = false;
```

### Partial (<4 hours)
```typescript
// Reduce local routing
HybridRouter.localRoutingPercentage = 20;  // Down from 80%
HybridRouter.circuitBreakerThreshold = 2;  // More aggressive fallback
```

### Complete (<1 day)
```typescript
// Revert to pre-migration
HybridRouter.disable();
ClaudeProvider.setAsPrimary();
```

---

## Monitoring & Observability (Updated)

### New Phase 0 Metrics

#### RuvLLM Feature Utilization
- SessionManager hit rate
- Batch query usage
- HNSW pattern retrieval latency
- Federated learning participation
- Manual learning trigger frequency

#### Baseline Metrics (for Phase 1 comparison)
- Multi-turn latency (before/after SessionManager)
- Pattern search latency (before/after HNSW)
- Throughput (before/after batch queries)

### Updated Dashboards

**Executive Dashboard:**
- Phase progress tracker
- Cost savings trend
- Quality vs baseline
- Local routing percentage
- ROI tracker

**RuvLLM Dashboard (NEW):**
- Feature utilization rates
- HNSW performance
- SessionManager efficiency
- Federated learning progress
- SONA improvement metrics

---

## Appendix: Quick Wins Implementation Guide

### Quick Win 1: SessionManager (30 min)

**File:** `/src/providers/RuvllmProvider.ts`

```typescript
// Add import
import { SessionManager } from '@ruvector/ruvllm';

// Add property
private sessions: SessionManager;

// In initialize()
this.sessions = new SessionManager(this.ruvllm);

// In complete()
const sessionId = options.metadata?.sessionId || this.sessions.create().id;
return this.sessions.chat(sessionId, this.extractInput(options));
```

**Expected:** 50% latency reduction for multi-turn

---

### Quick Win 2: Batch Queries (45 min)

**File:** `/src/providers/RuvllmProvider.ts`

```typescript
async batchComplete(requests: LLMCompletionOptions[]): Promise<LLMCompletionResponse[]> {
  const batchRequest: BatchQueryRequest = {
    prompts: requests.map(r => this.extractInput(r)),
    config: { maxTokens: 2048, temperature: 0.7, parallelism: 4 }
  };

  const response = this.ruvllm.batchQuery(batchRequest);

  return response.results.map((r, i) => ({
    content: [{ type: 'text', text: r.text }],
    usage: { input_tokens: r.tokens, output_tokens: r.outputTokens },
    model: 'ruvllm-batch',
    stopReason: 'end_turn',
    metadata: requests[i].metadata
  }));
}
```

**Expected:** 4x throughput

---

### Quick Win 3: Direct HNSW (4 hours)

**File:** `/src/memory/HNSWPatternStore.ts` (NEW)

```typescript
import { HNSWIndex } from '@ruvector/core';

export class HNSWPatternStore {
  private index: HNSWIndex;

  constructor() {
    this.index = new HNSWIndex({
      M: 32,
      efConstruction: 200,
      efSearch: 100,
      dimension: 768,
      metric: 'cosine'
    });
  }

  async findSimilar(pattern: TestPattern): Promise<TestPattern[]> {
    const embedding = await this.embed(pattern);
    const results = this.index.search(embedding, 10);
    return results.map(r => this.deserialize(r.metadata));
  }

  async store(pattern: TestPattern): Promise<number> {
    const embedding = await this.embed(pattern);
    return this.index.insert(embedding, pattern);
  }
}
```

**Expected:** 150x faster pattern matching

---

### Quick Win 4: Routing Observability (15 min)

**File:** `/src/providers/RuvllmProvider.ts`

```typescript
async complete(options: LLMCompletionOptions) {
  const decision = this.ruvllm.route(this.extractInput(options));

  this.logger.debug('Routing decision', {
    selectedModel: decision.model,
    confidence: decision.confidence,
    reasoningPath: decision.reasoning
  });

  return this.ruvllm.query(this.extractInput(options));
}
```

**Expected:** Better debugging, data-driven tuning

---

## Conclusion

### Why v2.0 is Better

**v1.0 Approach:**
- Start with Ollama setup (new component)
- Build OllamaProvider from scratch
- Hope quality is good enough

**v2.0 Approach:**
- Start with RuvLLM optimization (existing component)
- Maximize what's already 95% built
- Prove infrastructure works BEFORE adding new pieces
- Lower risk, faster timeline, better outcomes

### Key Insights from Research

1. **RuvLLM is orchestration, not inference** - Don't expect it to replace Ollama
2. **65% of RuvLLM features unused** - Massive optimization opportunity
3. **SONA already implemented** - Just needs enabling, not building
4. **Phi-4 available via agentic-flow** - Accelerates Phase 3
5. **Architecture is 95% ready** - Focus on configuration and tuning

### Updated Timeline

```
Phase 0: 2 weeks (NEW) - RuvLLM optimization
Phase 1: 6-8 weeks - Local MVP with Ollama
Phase 2: 6-8 weeks - Production with vLLM
Phase 3: 6-8 weeks - Fine-tuning with Phi-4
Phase 4: 6-8 weeks - Full independence

Total: 26-34 weeks (vs 24-32 in v1, but LOWER RISK)
```

### Recommendation

**PROCEED** with Phase 0 (2 weeks, $4k) to:
1. Optimize existing RuvLLM infrastructure
2. Establish performance baselines
3. Prove quick wins deliver value
4. De-risk Phase 1 with known-good foundation

**With Phase 0 successful**, the path to full independence is:
- ✅ Technically proven (95% architecture ready)
- ✅ Financially viable (65% feature gap to close)
- ✅ Lower risk (optimize before building)
- ✅ Achievable by Q2 2025

---

**Document Version:** 2.0
**Last Updated:** 2025-12-17
**Authors:** Research Agent + AQE Architecture Team
**Status:** READY FOR PHASE 0 EXECUTION
**Next Steps:**
1. Approve Phase 0 budget ($4k, 2 weeks)
2. Assign 1 backend engineer to Phase 0
3. Kick off M0.1: SessionManager Integration
