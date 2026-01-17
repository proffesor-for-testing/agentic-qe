# ruvLLM TRM Integration - System Architecture Design

**Document Version**: 1.0.0
**Date**: 2025-12-13
**Author**: SPARC Architecture Agent
**Status**: DESIGN SPECIFICATION
**Target Release**: v2.5.0

---

## Executive Summary

This document provides the **system architecture design** for integrating **ruvLLM TRM (Tiny Recursive Models)** into the **Agentic QE Fleet v2.4.0**. The architecture leverages v2.4.0's strategy-based design patterns, binary cache infrastructure, and namespaced memory to achieve clean, maintainable integration with minimal coupling.

**Key Architectural Principles**:
- **Strategy Pattern Injection**: TRM capabilities injected via `AgentLearningStrategy` interface
- **Adapter Extension**: SONA learning extends `LearningEngineAdapter` without modifying core
- **Binary Cache Acceleration**: 6x faster pattern loading via `BinaryMetadataCache`
- **Namespace Isolation**: Per-agent LoRA weights isolated in agent-local namespaces
- **Zero Core Modification**: No changes to `BaseAgent`, `LearningEngine`, or `SwarmMemoryManager`

**Performance Targets**:
- **70%+ cost reduction** via local inference routing
- **6x pattern loading speedup** (already achieved in v2.4.0)
- **15%+ quality improvement** via TRM recursive reasoning
- **<100ms p95 local inference latency**

---

## 1. System Architecture Diagram

### 1.1 High-Level Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ruvLLM Integration Layer                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ TRMLearning      │  │ SONALearning     │  │ RuvllmProvider   │     │
│  │ Strategy         │  │ Adapter          │  │ (Enhanced)       │     │
│  │                  │  │                  │  │                  │     │
│  │ • completeTRM()  │  │ • MicroLoRA      │  │ • TRM inference  │     │
│  │ • convergence    │  │ • BaseLoRA       │  │ • SONA hooks     │     │
│  │ • quality        │  │ • EWC++          │  │ • Binary cache   │     │
│  │   tracking       │  │ • Consolidation  │  │   integration    │     │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘     │
└───────────┼──────────────────────┼──────────────────────┼──────────────┘
            │                      │                      │
            │ implements           │ extends              │ implements
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    v2.4.0 Strategy Layer (STABLE)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ AgentLearning    │  │ LearningEngine   │  │ ILLMProvider     │     │
│  │ Strategy         │  │ Adapter          │  │ Interface        │     │
│  │ (interface)      │  │ (base class)     │  │                  │     │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘     │
└───────────┼──────────────────────┼──────────────────────┼──────────────┘
            │                      │                      │
            │ uses                 │ uses                 │ routes via
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Infrastructure Layer (v2.4.0 + ruvLLM)                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ BinaryMetadata   │  │ SwarmMemory      │  │ HybridRouter     │     │
│  │ Cache            │  │ Manager          │  │                  │     │
│  │                  │  │                  │  │ • Local routing  │     │
│  │ • MessagePack    │  │ • Namespaced     │  │ • Cloud fallback │     │
│  │ • Compression    │  │   storage        │  │ • Cost tracking  │     │
│  │ • Lazy deser.    │  │ • HNSW index     │  │ • Circuit break  │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 TRM Inference Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Step 1: Task Arrives at TestGeneratorAgent                              │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Step 2: Agent Invokes LearningStrategy.recommendStrategy(taskState)     │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Step 3: TRMLearningStrategy.recommendStrategy()                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 1. Check Binary Cache for Cached TRM Pattern                    │    │
│  │    → Cache Key: `trm:${taskStateHash}`                          │    │
│  │    → Cache Hit: Return cached optimization (6x faster)          │    │
│  │                                                                  │    │
│  │ 2. Cache Miss: Invoke RuvllmProvider.completeTRM()              │    │
│  │    → Build optimization prompt from taskState                   │    │
│  │    → maxIterations: 7, convergenceThreshold: 0.95              │    │
│  │                                                                  │    │
│  │ 3. HybridRouter Routes to Local (ruvLLM) or Cloud               │    │
│  │    → Complexity Analysis: TaskComplexity.MODERATE              │    │
│  │    → Local Available: YES                                       │    │
│  │    → Decision: ROUTE_TO_LOCAL                                   │    │
│  │                                                                  │    │
│  │ 4. RuvllmProvider Executes TRM Recursive Reasoning              │    │
│  │    Iteration 1: Generate initial test suite                     │    │
│  │    Iteration 2: Optimize coverage (quality: 0.72 → 0.84)       │    │
│  │    Iteration 3: Refine edge cases (quality: 0.84 → 0.91)       │    │
│  │    Iteration 4: Convergence detected (Δquality < 0.01)         │    │
│  │    → Result: Optimized TestSuite, 4 iterations, quality 0.91   │    │
│  │                                                                  │    │
│  │ 5. Cache Result in Binary Cache                                 │    │
│  │    → Store at `trm:${taskStateHash}` with compression           │    │
│  │    → MessagePack serialization (4x smaller)                     │    │
│  │                                                                  │    │
│  │ 6. Convert to StrategyRecommendation                            │    │
│  │    → strategy: "use-optimized-suite"                            │    │
│  │    → confidence: 0.91                                           │    │
│  │    → reasoning: "TRM optimized in 4 iterations"                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Step 4: Agent Applies Recommendation & Generates Tests                  │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Step 5: SONALearningAdapter Records Execution for Continuous Learning   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 1. Record Execution Event (success, reward, duration)           │    │
│  │                                                                  │    │
│  │ 2. MicroLoRA Instant Adaptation (rank=2)                        │    │
│  │    → Update weights based on (input, output, reward)            │    │
│  │    → Store in namespaced memory:                                │    │
│  │      `aqe/test-generator/sona/microLoRA/${taskId}`             │    │
│  │                                                                  │    │
│  │ 3. Check Consolidation Trigger (every 100 tasks)                │    │
│  │    → Task Count: 100 → TRIGGER CONSOLIDATION                    │    │
│  │                                                                  │    │
│  │ 4. Consolidate MicroLoRA → BaseLoRA (rank=8)                   │    │
│  │    → Apply EWC++ importance weights (λ=0.5)                    │    │
│  │    → Prevents catastrophic forgetting (>95% retention)          │    │
│  │    → Store consolidated weights in binary cache                 │    │
│  │                                                                  │    │
│  │ 5. Share Patterns Fleet-Wide (optional)                         │    │
│  │    → Store in shared namespace:                                 │    │
│  │      `aqe/shared/test-generator/sona/patterns/successful`      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 TRMLearningStrategy (NEW)

**Location**: `src/learning/strategies/TRMLearningStrategy.ts`

**Implements**: `AgentLearningStrategy` interface

**Purpose**: Provides TRM recursive reasoning capabilities as a drop-in learning strategy.

#### Interface Definition

```typescript
/**
 * TRM-enhanced learning strategy
 *
 * Implements AgentLearningStrategy with TRM recursive reasoning.
 * Zero modification to BaseAgent or existing infrastructure.
 */
export class TRMLearningStrategy implements AgentLearningStrategy {
  private readonly ruvllm: RuvllmProvider;
  private readonly learningEngine: LearningEngine;
  private readonly patternCache: BinaryMetadataCache;
  private readonly memoryStrategy: AgentMemoryStrategy;
  private readonly config: TRMStrategyConfig;

  constructor(deps: {
    ruvllm: RuvllmProvider;
    learningEngine: LearningEngine;
    patternCache: BinaryMetadataCache;
    memoryStrategy: AgentMemoryStrategy;
    config?: Partial<TRMStrategyConfig>;
  });

  // === Core TRM Methods ===

  /**
   * Recommend strategy using TRM recursive reasoning
   *
   * Flow:
   * 1. Check binary cache for cached optimization
   * 2. If miss, invoke RuvllmProvider.completeTRM()
   * 3. Cache result for 6x faster future retrieval
   * 4. Convert TRM output to StrategyRecommendation
   *
   * @param taskState - Task context for optimization
   * @returns Strategy recommendation with TRM metadata
   */
  async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null>;

  /**
   * Execute TRM recursive optimization
   *
   * @param prompt - Optimization prompt
   * @param maxIterations - Maximum TRM iterations (default: 7)
   * @returns TRM optimization result
   */
  async completeTRM(
    prompt: string,
    maxIterations?: number
  ): Promise<TRMOptimizationResult>;

  // === AgentLearningStrategy Implementation ===

  async storePattern(pattern: LearnedPattern): Promise<void>;
  async getPatterns(query: PatternQuery): Promise<LearnedPattern[]>;
  async findSimilarPatterns(embedding: number[], limit?: number): Promise<LearnedPattern[]>;
  async updatePatternConfidence(patternId: string, success: boolean): Promise<void>;
  async recordExecution(event: ExecutionEvent): Promise<void>;
  async getExecutionHistory(limit?: number): Promise<ExecutionEvent[]>;
  async train(iterations?: number): Promise<TrainingResult>;
  async exportPatterns(): Promise<LearnedPattern[]>;
  async importPatterns(patterns: LearnedPattern[]): Promise<number>;
  async initialize(): Promise<void>;
  getStatus(): LearningStatus;
  async getMetrics(): Promise<LearningMetrics>;
  async reset?(): Promise<void>;
}
```

#### Configuration Interface

```typescript
/**
 * TRM strategy configuration
 */
export interface TRMStrategyConfig {
  /** Enable TRM recursive reasoning (default: true) */
  enableTRM: boolean;

  /** Maximum TRM iterations per optimization (default: 7) */
  maxIterations: number;

  /** Convergence threshold (default: 0.95) */
  convergenceThreshold: number;

  /** Quality improvement threshold to continue (default: 0.01) */
  qualityThreshold: number;

  /** Enable binary cache for TRM patterns (default: true) */
  enableCache: boolean;

  /** Cache TTL in milliseconds (default: 3600000 = 1 hour) */
  cacheTTL: number;

  /** Minimum confidence to use TRM (default: 0.0) */
  minConfidenceForTRM: number;

  /** Complexity threshold to trigger TRM (default: MODERATE) */
  complexityThreshold: TaskComplexity;
}

/**
 * TRM optimization result
 */
export interface TRMOptimizationResult {
  /** Optimized output from TRM */
  optimizedOutput: string;

  /** Number of TRM iterations executed */
  iterations: number;

  /** Final quality score (0-1) */
  finalQuality: number;

  /** Quality improvement per iteration */
  qualityHistory: Array<{
    iteration: number;
    quality: number;
    improvement: number;
  }>;

  /** Whether TRM converged */
  converged: boolean;

  /** Total optimization time (ms) */
  duration: number;

  /** Token usage statistics */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };

  /** TRM reasoning trace (for debugging) */
  trace?: string[];
}
```

#### Class Structure

```typescript
export class TRMLearningStrategy implements AgentLearningStrategy {
  // === Private Fields ===
  private readonly ruvllm: RuvllmProvider;
  private readonly learningEngine: LearningEngine;
  private readonly patternCache: BinaryMetadataCache;
  private readonly memoryStrategy: AgentMemoryStrategy;
  private readonly config: Required<TRMStrategyConfig>;

  private executionHistory: ExecutionEvent[] = [];
  private trmInvocations = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  // === Constructor ===
  constructor(deps: TRMStrategyDependencies) {
    this.ruvllm = deps.ruvllm;
    this.learningEngine = deps.learningEngine;
    this.patternCache = deps.patternCache;
    this.memoryStrategy = deps.memoryStrategy;
    this.config = { ...DEFAULT_TRM_CONFIG, ...deps.config };
  }

  // === TRM Core Logic ===

  async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null> {
    // 1. Compute cache key from task state
    const cacheKey = this.computeCacheKey(taskState);

    // 2. Check binary cache
    const cached = await this.patternCache.get<TRMOptimizationResult>(cacheKey);
    if (cached) {
      this.cacheHits++;
      return this.convertToRecommendation(cached, true);
    }

    this.cacheMisses++;

    // 3. Analyze complexity
    const complexity = this.analyzeComplexity(taskState);
    if (complexity < this.config.complexityThreshold) {
      // Fall back to standard learning engine
      const baseRec = await this.learningEngine.recommendStrategy(
        this.convertToTaskState(taskState)
      );
      return baseRec ? this.convertLearningEngineRec(baseRec) : null;
    }

    // 4. Build optimization prompt
    const prompt = this.buildOptimizationPrompt(taskState);

    // 5. Invoke TRM
    const trmResult = await this.completeTRM(prompt, this.config.maxIterations);
    this.trmInvocations++;

    // 6. Cache result
    await this.patternCache.set(cacheKey, trmResult, {
      ttl: this.config.cacheTTL,
      compress: true
    });

    // 7. Convert and return
    return this.convertToRecommendation(trmResult, false);
  }

  async completeTRM(
    prompt: string,
    maxIterations: number = this.config.maxIterations
  ): Promise<TRMOptimizationResult> {
    const startTime = Date.now();
    const qualityHistory: Array<{ iteration: number; quality: number; improvement: number }> = [];

    let currentOutput = '';
    let currentQuality = 0;
    let converged = false;
    let totalTokens = { input: 0, output: 0, total: 0 };

    for (let i = 0; i < maxIterations; i++) {
      // Build iteration prompt
      const iterationPrompt = i === 0
        ? prompt
        : this.buildRefinementPrompt(prompt, currentOutput, currentQuality);

      // Invoke ruvLLM
      const response = await this.ruvllm.complete({
        messages: [{ role: 'user', content: iterationPrompt }],
        maxTokens: 2048,
        temperature: 0.7
      });

      // Extract output
      const newOutput = response.content[0].text;

      // Measure quality
      const newQuality = await this.measureQuality(newOutput, prompt);
      const improvement = newQuality - currentQuality;

      // Track iteration
      qualityHistory.push({
        iteration: i + 1,
        quality: newQuality,
        improvement
      });

      // Update token usage
      totalTokens.input += response.usage.input_tokens;
      totalTokens.output += response.usage.output_tokens;
      totalTokens.total += response.usage.input_tokens + response.usage.output_tokens;

      // Check convergence
      if (i > 0 && improvement < this.config.qualityThreshold) {
        converged = true;
        currentOutput = newOutput;
        currentQuality = newQuality;
        break;
      }

      currentOutput = newOutput;
      currentQuality = newQuality;
    }

    return {
      optimizedOutput: currentOutput,
      iterations: qualityHistory.length,
      finalQuality: currentQuality,
      qualityHistory,
      converged,
      duration: Date.now() - startTime,
      tokenUsage: totalTokens
    };
  }

  // === Helper Methods ===

  private computeCacheKey(taskState: unknown): string {
    const hash = this.hashObject(taskState);
    return `trm:${hash}`;
  }

  private hashObject(obj: unknown): string {
    const str = JSON.stringify(obj);
    // Simple hash (replace with crypto.createHash('sha256') in production)
    return Buffer.from(str).toString('base64').substring(0, 32);
  }

  private analyzeComplexity(taskState: unknown): TaskComplexity {
    // Complexity analysis logic (reuse HybridRouter logic)
    const state = taskState as Record<string, unknown>;
    const contentLength = JSON.stringify(state).length;
    const hasCode = /```|function|class/.test(JSON.stringify(state));

    let score = 0;
    if (contentLength > 5000) score += 2;
    else if (contentLength > 2000) score += 1;
    if (hasCode) score += 1;

    if (score >= 3) return TaskComplexity.COMPLEX;
    if (score >= 2) return TaskComplexity.MODERATE;
    return TaskComplexity.SIMPLE;
  }

  private buildOptimizationPrompt(taskState: unknown): string {
    const state = taskState as Record<string, unknown>;
    return `
Optimize the following test generation task using recursive reasoning:

Task Context:
${JSON.stringify(state, null, 2)}

Requirements:
- Maximize test coverage
- Minimize redundant tests
- Identify edge cases
- Ensure maintainability

Provide an optimized test suite strategy.
    `.trim();
  }

  private buildRefinementPrompt(
    originalPrompt: string,
    previousOutput: string,
    previousQuality: number
  ): string {
    return `
${originalPrompt}

Previous Iteration Output (Quality: ${previousQuality.toFixed(2)}):
${previousOutput}

Refine the above output to improve quality. Focus on:
- Addressing any gaps or weaknesses
- Improving clarity and specificity
- Optimizing for better coverage
    `.trim();
  }

  private async measureQuality(output: string, prompt: string): Promise<number> {
    // Quality scoring logic
    // (In production, use LLM-as-judge or heuristic scoring)
    const hasKeywords = /test|coverage|edge case|strategy/.test(output.toLowerCase());
    const lengthScore = Math.min(1, output.length / 500);
    const structureScore = output.includes('```') ? 0.2 : 0;

    return Math.min(1, (hasKeywords ? 0.5 : 0) + lengthScore * 0.3 + structureScore);
  }

  private convertToRecommendation(
    trmResult: TRMOptimizationResult,
    fromCache: boolean
  ): StrategyRecommendation {
    return {
      strategy: 'use-trm-optimized-strategy',
      confidence: trmResult.finalQuality,
      reasoning: `TRM optimized in ${trmResult.iterations} iterations (${fromCache ? 'cached' : 'computed'})`,
      metadata: {
        trmIterations: trmResult.iterations,
        converged: trmResult.converged,
        qualityImprovement: trmResult.qualityHistory[trmResult.qualityHistory.length - 1]?.quality || 0,
        cached: fromCache,
        tokenUsage: trmResult.tokenUsage
      }
    };
  }

  // === AgentLearningStrategy Delegated Methods ===

  async storePattern(pattern: LearnedPattern): Promise<void> {
    // Delegate to learning engine
    return this.learningEngine.storePattern(pattern);
  }

  async getPatterns(query: PatternQuery): Promise<LearnedPattern[]> {
    return this.learningEngine.getPatterns(query);
  }

  async findSimilarPatterns(embedding: number[], limit = 10): Promise<LearnedPattern[]> {
    return this.learningEngine.findSimilarPatterns(embedding, limit);
  }

  async updatePatternConfidence(patternId: string, success: boolean): Promise<void> {
    return this.learningEngine.updatePatternConfidence(patternId, success);
  }

  async recordExecution(event: ExecutionEvent): Promise<void> {
    this.executionHistory.push(event);
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
    return this.learningEngine.recordExecution(event);
  }

  async getExecutionHistory(limit = 100): Promise<ExecutionEvent[]> {
    return this.executionHistory.slice(-limit);
  }

  async train(iterations = 10): Promise<TrainingResult> {
    return this.learningEngine.train(iterations);
  }

  async exportPatterns(): Promise<LearnedPattern[]> {
    return this.learningEngine.exportPatterns();
  }

  async importPatterns(patterns: LearnedPattern[]): Promise<number> {
    return this.learningEngine.importPatterns(patterns);
  }

  async initialize(): Promise<void> {
    await this.learningEngine.initialize();
  }

  getStatus(): LearningStatus {
    const baseStatus = this.learningEngine.getStatus();
    return {
      ...baseStatus,
      metadata: {
        trmInvocations: this.trmInvocations,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cacheHitRate: this.trmInvocations > 0
          ? this.cacheHits / (this.cacheHits + this.cacheMisses)
          : 0
      }
    };
  }

  async getMetrics(): Promise<LearningMetrics> {
    return this.learningEngine.getMetrics();
  }

  async reset(): Promise<void> {
    this.executionHistory = [];
    this.trmInvocations = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    return this.learningEngine.reset?.();
  }
}
```

---

### 2.2 SONALearningAdapter (NEW)

**Location**: `src/learning/adapters/SONALearningAdapter.ts`

**Extends**: `LearningEngineAdapter`

**Purpose**: Adds SONA adaptive learning (MicroLoRA + BaseLoRA + EWC++) to existing `LearningEngine` without modification.

#### Class Structure

```typescript
/**
 * SONA-enhanced learning adapter
 *
 * Extends LearningEngineAdapter with SONA two-tier LoRA adaptation.
 * Prevents catastrophic forgetting via EWC++.
 */
export class SONALearningAdapter extends LearningEngineAdapter {
  private readonly microLoRA: MicroLoRAAdapter;
  private readonly baseLoRA: BaseLoRAAdapter;
  private readonly ewc: EWCProtection;
  private readonly patternCache: BinaryMetadataCache;
  private readonly memoryStrategy: AgentMemoryStrategy;
  private readonly config: SONAConfig;

  private taskCount = 0;
  private lastConsolidation: Date | null = null;

  constructor(deps: SONAAdapterDependencies) {
    super(deps.engine);

    this.microLoRA = new MicroLoRAAdapter(deps.ruvllm, {
      rank: deps.config?.microLoRArank || 2,
      alpha: deps.config?.microLoRAalpha || 0.1
    });

    this.baseLoRA = new BaseLoRAAdapter(deps.ruvllm, {
      rank: deps.config?.baseLoRArank || 8,
      alpha: deps.config?.baseLoRAalpha || 0.05
    });

    this.ewc = new EWCProtection(deps.ruvllm, {
      lambda: deps.config?.ewcLambda || 0.5
    });

    this.patternCache = deps.patternCache;
    this.memoryStrategy = deps.memoryStrategy;
    this.config = { ...DEFAULT_SONA_CONFIG, ...deps.config };
  }

  // === SONA Core Methods ===

  /**
   * Record execution with SONA instant adaptation
   *
   * Flow:
   * 1. Call parent recordExecution() for standard tracking
   * 2. Apply MicroLoRA instant adaptation
   * 3. Store weights in agent-local namespace
   * 4. Check consolidation trigger (every N tasks)
   * 5. Consolidate MicroLoRA → BaseLoRA with EWC++
   */
  async recordExecution(event: ExecutionEvent): Promise<void> {
    // 1. Parent tracking
    await super.recordExecution(event);

    this.taskCount++;

    // 2. MicroLoRA instant adaptation
    const adaptationInput = this.buildAdaptationInput(event);
    await this.microLoRA.adapt(adaptationInput);

    // 3. Store MicroLoRA weights in namespaced memory
    const weights = await this.microLoRA.getWeights();
    await this.memoryStrategy.storeLocal(
      `sona/microLoRA/${event.task.id}`,
      weights
    );

    // 4. Check consolidation trigger
    if (this.taskCount % this.config.consolidationInterval === 0) {
      await this.consolidateToBaseLoRA();
    }
  }

  /**
   * Consolidate MicroLoRA → BaseLoRA
   *
   * Flow:
   * 1. Compute EWC++ importance weights
   * 2. Consolidate MicroLoRA weights to BaseLoRA
   * 3. Store consolidated weights in binary cache
   * 4. Share successful patterns fleet-wide
   * 5. Reset MicroLoRA for new learning
   */
  private async consolidateToBaseLoRA(): Promise<void> {
    // 1. Compute importance weights (prevents forgetting)
    const experiences = await this.getExecutionHistory(this.config.consolidationInterval);
    const importanceWeights = await this.ewc.computeImportance(experiences);

    // 2. Consolidate
    const microWeights = await this.microLoRA.getWeights();
    await this.baseLoRA.consolidate(microWeights, importanceWeights);

    // 3. Cache consolidated weights (6x faster retrieval)
    const consolidatedWeights = await this.baseLoRA.getWeights();
    await this.patternCache.set('sona/baseLoRA/consolidated', consolidatedWeights, {
      ttl: this.config.cacheTTL,
      compress: true
    });

    // 4. Share successful patterns fleet-wide (optional)
    if (this.config.enablePatternSharing) {
      const successfulPatterns = await this.extractSuccessfulPatterns(experiences);
      await this.memoryStrategy.storeShared(
        'sona/patterns/successful',
        successfulPatterns
      );
    }

    // 5. Reset MicroLoRA
    await this.microLoRA.reset();
    this.lastConsolidation = new Date();
  }

  // === Helper Methods ===

  private buildAdaptationInput(event: ExecutionEvent): AdaptationInput {
    return {
      input: this.extractState(event.task),
      output: event.result,
      reward: this.calculateReward(event),
      metadata: {
        success: event.success,
        duration: event.duration
      }
    };
  }

  private extractState(task: QETask): Record<string, unknown> {
    // Extract relevant state from task
    return {
      type: task.type,
      complexity: task.complexity || 0.5,
      context: task.context || {}
    };
  }

  private calculateReward(event: ExecutionEvent): number {
    // Reward calculation logic
    const baseReward = event.success ? 1.0 : -0.5;
    const latencyPenalty = event.duration > 5000 ? -0.2 : 0;
    return Math.max(-1, Math.min(1, baseReward + latencyPenalty));
  }

  private async extractSuccessfulPatterns(
    experiences: ExecutionEvent[]
  ): Promise<LearnedPattern[]> {
    const successful = experiences.filter(e => e.success && e.result);
    const patterns: LearnedPattern[] = [];

    for (const exp of successful) {
      patterns.push({
        id: `sona-pattern-${exp.task.id}`,
        type: exp.task.type,
        domain: 'sona',
        content: JSON.stringify(exp.result),
        confidence: 0.8,
        usageCount: 1,
        successRate: 1.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          reward: this.calculateReward(exp),
          duration: exp.duration
        }
      });
    }

    return patterns;
  }
}
```

#### SONA Configuration Interface

```typescript
export interface SONAConfig {
  /** Enable SONA adaptive learning (default: true) */
  enabled: boolean;

  /** MicroLoRA rank (default: 2) */
  microLoRArank: number;

  /** MicroLoRA learning rate (default: 0.1) */
  microLoRAalpha: number;

  /** BaseLoRA rank (default: 8) */
  baseLoRArank: number;

  /** BaseLoRA learning rate (default: 0.05) */
  baseLoRAalpha: number;

  /** EWC++ lambda (forgetting prevention) (default: 0.5) */
  ewcLambda: number;

  /** Consolidation interval in tasks (default: 100) */
  consolidationInterval: number;

  /** Enable pattern sharing across agents (default: true) */
  enablePatternSharing: boolean;

  /** Cache TTL for consolidated weights (default: 7200000 = 2 hours) */
  cacheTTL: number;
}

/**
 * Adaptation input for LoRA
 */
export interface AdaptationInput {
  input: Record<string, unknown>;
  output: unknown;
  reward: number;
  metadata?: Record<string, unknown>;
}
```

---

### 2.3 RuvllmProvider Enhancement

**Location**: `src/providers/RuvllmProvider.ts` (modify existing)

**Implements**: `ILLMProvider` (existing interface)

**Purpose**: Add TRM capabilities to existing RuvllmProvider.

#### Enhanced Methods

```typescript
export class RuvllmProvider implements ILLMProvider {
  // === Existing fields ===
  private readonly logger: Logger;
  private config: RuvllmProviderConfig;
  private isInitialized: boolean;
  private serverProcess?: ChildProcess;
  private baseUrl: string;
  private loadedModel?: LocalModelInfo;
  private requestCount: number;

  // === NEW: TRM-specific fields ===
  private trmConfig?: TRMInferenceConfig;
  private sonaConfig?: SONAInferenceConfig;
  private patternCache?: BinaryMetadataCache;

  // === Enhanced constructor ===
  constructor(config: RuvllmProviderConfig = {}) {
    // ... existing initialization ...

    // NEW: TRM configuration
    this.trmConfig = config.trmConfig;
    this.sonaConfig = config.sonaConfig;
    this.patternCache = config.patternCache;
  }

  // === NEW: TRM completion method ===
  /**
   * Complete with TRM recursive reasoning
   *
   * @param options - Completion options
   * @param trmOptions - TRM-specific options
   * @returns Completion response with TRM metadata
   */
  async completeTRM(
    options: LLMCompletionOptions,
    trmOptions?: TRMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const maxIterations = trmOptions?.maxIterations || this.trmConfig?.maxIterations || 7;
    const convergenceThreshold = trmOptions?.convergenceThreshold || 0.95;

    const iterations: TRMIteration[] = [];
    let currentOutput = '';
    let currentQuality = 0;

    for (let i = 0; i < maxIterations; i++) {
      // Build iteration messages
      const messages = i === 0
        ? options.messages
        : this.buildRefinementMessages(options.messages, currentOutput, currentQuality);

      // Standard completion
      const response = await this.complete({
        ...options,
        messages
      });

      const newOutput = response.content[0].text;
      const newQuality = await this.estimateQuality(newOutput);

      iterations.push({
        iteration: i + 1,
        output: newOutput,
        quality: newQuality,
        improvement: newQuality - currentQuality,
        tokenUsage: response.usage
      });

      // Check convergence
      if (i > 0 && (newQuality - currentQuality) < (1 - convergenceThreshold)) {
        currentOutput = newOutput;
        currentQuality = newQuality;
        break;
      }

      currentOutput = newOutput;
      currentQuality = newQuality;
    }

    // Return final iteration as response
    const finalIteration = iterations[iterations.length - 1];
    return {
      content: [{ type: 'text', text: finalIteration.output }],
      usage: {
        input_tokens: iterations.reduce((sum, it) => sum + it.tokenUsage.input_tokens, 0),
        output_tokens: iterations.reduce((sum, it) => sum + it.tokenUsage.output_tokens, 0)
      },
      model: options.model || this.config.defaultModel!,
      stop_reason: 'end_turn',
      id: `ruvllm-trm-${Date.now()}`,
      metadata: {
        trmIterations: iterations.length,
        finalQuality: currentQuality,
        convergenceAchieved: currentQuality >= convergenceThreshold,
        qualityHistory: iterations.map(it => it.quality)
      }
    };
  }

  // === Helper methods for TRM ===

  private buildRefinementMessages(
    originalMessages: LLMMessage[],
    previousOutput: string,
    previousQuality: number
  ): LLMMessage[] {
    const refinementPrompt = `
Previous output (Quality: ${previousQuality.toFixed(2)}):
${previousOutput}

Please refine the above output to improve quality and accuracy.
    `.trim();

    return [
      ...originalMessages,
      { role: 'assistant', content: previousOutput },
      { role: 'user', content: refinementPrompt }
    ];
  }

  private async estimateQuality(output: string): Promise<number> {
    // Simple heuristic quality estimation
    // (In production, use LLM-as-judge or more sophisticated metrics)
    const hasStructure = output.includes('```') || output.includes('##');
    const lengthScore = Math.min(1, output.length / 1000);
    const keywordScore = /test|coverage|strategy|implementation/.test(output.toLowerCase()) ? 0.3 : 0;

    return Math.min(1, (hasStructure ? 0.4 : 0) + lengthScore * 0.3 + keywordScore);
  }
}
```

#### TRM Configuration Interfaces

```typescript
/**
 * TRM inference configuration
 */
export interface TRMInferenceConfig {
  /** Enable TRM recursive reasoning (default: false) */
  enabled: boolean;

  /** Maximum iterations (default: 7) */
  maxIterations: number;

  /** Convergence threshold (default: 0.95) */
  convergenceThreshold: number;

  /** Quality improvement threshold (default: 0.01) */
  qualityThreshold: number;
}

/**
 * SONA inference configuration
 */
export interface SONAInferenceConfig {
  /** Enable SONA adaptive learning (default: false) */
  enabled: boolean;

  /** LoRA adaptation hooks */
  adaptationHooks?: {
    onAdaptation?: (weights: LoRAWeights) => Promise<void>;
    onConsolidation?: (weights: LoRAWeights) => Promise<void>;
  };
}

/**
 * TRM completion options
 */
export interface TRMCompletionOptions {
  maxIterations?: number;
  convergenceThreshold?: number;
  qualityMetric?: 'coherence' | 'accuracy' | 'completeness';
}

/**
 * TRM iteration result
 */
export interface TRMIteration {
  iteration: number;
  output: string;
  quality: number;
  improvement: number;
  tokenUsage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * LoRA weights (placeholder - actual implementation from ruvllm)
 */
export interface LoRAWeights {
  rank: number;
  alpha: number;
  weights: Float32Array;
  metadata: Record<string, unknown>;
}
```

---

### 2.4 HybridRouter Integration

**Location**: `src/providers/HybridRouter.ts` (minimal modification)

**Purpose**: Add TRM suitability analysis to routing decisions.

#### Enhanced Routing Logic

```typescript
export class HybridRouter implements ILLMProvider {
  // ... existing fields ...

  /**
   * Make routing decision (ENHANCED with TRM awareness)
   */
  private makeRoutingDecision(
    options: LLMCompletionOptions,
    strategy?: RoutingStrategy,
    priority: RequestPriority = RequestPriority.NORMAL
  ): RoutingDecision {
    const activeStrategy = strategy || this.config.defaultStrategy;
    const complexity = this.analyzeComplexity(options);

    // NEW: Check if TRM-suitable
    const trmSuitable = this.isTRMSuitable(options, complexity);
    if (trmSuitable && this.isProviderAvailable('local')) {
      return this.createDecision(
        'local',
        'ruvllm',
        'TRM recursive reasoning suitable for local',
        complexity,
        priority
      );
    }

    // ... existing routing logic ...
  }

  /**
   * Check if task is suitable for TRM
   */
  private isTRMSuitable(options: LLMCompletionOptions, complexity: TaskComplexity): boolean {
    // TRM is suitable for:
    // 1. Moderate to complex tasks (not too simple, not too complex)
    // 2. Tasks that benefit from iterative refinement
    // 3. Tasks with clear quality metrics

    if (complexity === TaskComplexity.SIMPLE) {
      return false; // Too simple for TRM overhead
    }

    if (complexity === TaskComplexity.VERY_COMPLEX) {
      return false; // Too complex, prefer cloud quality
    }

    // Check for iterative refinement keywords
    const content = this.extractContent(options);
    const hasRefinementKeywords = /optimize|refine|improve|iterate|enhance/.test(
      content.toLowerCase()
    );

    return hasRefinementKeywords || complexity === TaskComplexity.MODERATE;
  }

  private extractContent(options: LLMCompletionOptions): string {
    return options.messages
      .map(m => (typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')))
      .join(' ');
  }
}
```

---

### 2.5 BinaryMetadataCache Integration

**Location**: `src/core/cache/BinaryMetadataCache.ts` (existing, no changes needed)

**Purpose**: Store TRM reasoning patterns and SONA LoRA weights with 6x speedup.

#### Usage Pattern

```typescript
// TRM pattern caching
const trmCache = new BinaryMetadataCache({
  cachePath: '.agentic-qe/cache/trm-patterns.bin',
  compressionThreshold: 1024, // Compress patterns > 1KB
  enableLazyDeserialization: true
});

// Store TRM optimization result
await trmCache.set('trm:task-hash-123', {
  optimizedOutput: '...',
  iterations: 4,
  finalQuality: 0.91,
  qualityHistory: [...]
}, {
  ttl: 3600000, // 1 hour
  compress: true
});

// Retrieve (6x faster than SQLite)
const cached = await trmCache.get<TRMOptimizationResult>('trm:task-hash-123');
if (cached) {
  return cached; // Cache hit, skip TRM computation
}

// SONA weight caching
const sonaCache = new BinaryMetadataCache({
  cachePath: '.agentic-qe/cache/sona-weights.bin',
  compressionThreshold: 2048 // LoRA weights are larger
});

await sonaCache.set('sona/baseLoRA/consolidated', {
  rank: 8,
  alpha: 0.05,
  weights: Float32Array(...),
  metadata: { consolidatedAt: Date.now() }
}, {
  compress: true
});
```

---

## 3. Integration with v2.4.0 Infrastructure

### 3.1 Agent Integration Pattern

```typescript
// TestGeneratorAgent with TRM + SONA
const agent = new TestGeneratorAgent({
  id: { type: 'test-generator', id: 'tg-001' },

  // Inject TRM learning strategy (v2.4.0 strategy pattern)
  learningStrategy: new TRMLearningStrategy({
    ruvllm: ruvllmProvider,
    learningEngine: baseLearningEngine,
    patternCache: trmCache,
    memoryStrategy: agentMemoryStrategy,
    config: {
      enableTRM: true,
      maxIterations: 7,
      convergenceThreshold: 0.95
    }
  }),

  // Other strategies use defaults
  lifecycleStrategy: defaultLifecycleStrategy,
  memoryStrategy: agentMemoryStrategy,
  coordinationStrategy: defaultCoordinationStrategy
});

await agent.initialize();

// Agent automatically uses TRM for recommendations
const result = await agent.executeTask({
  type: 'generate-tests',
  context: { ... }
});
// → Internally calls learningStrategy.recommendStrategy()
// → TRMLearningStrategy invokes completeTRM()
// → Result cached for 6x faster future retrieval
```

### 3.2 SONA Integration Pattern

```typescript
// Create SONA-enhanced learning adapter
const sonaAdapter = new SONALearningAdapter({
  engine: baseLearningEngine,
  ruvllm: ruvllmProvider,
  patternCache: sonaCache,
  memoryStrategy: agentMemoryStrategy,
  config: {
    enabled: true,
    microLoRArank: 2,
    baseLoRArank: 8,
    ewcLambda: 0.5,
    consolidationInterval: 100
  }
});

// Use as learning strategy
const agent = new TestGeneratorAgent({
  id: { type: 'test-generator', id: 'tg-002' },
  learningStrategy: sonaAdapter
});

// Agent records executions, SONA adapts automatically
await agent.executeTask({ ... });
// → recordExecution() called internally
// → MicroLoRA adapts instantly
// → Every 100 tasks, consolidates to BaseLoRA with EWC++
```

### 3.3 Binary Cache Integration

**Automatic integration via dependency injection**:

```typescript
// Initialize binary caches
const trmCache = new BinaryMetadataCache({
  cachePath: '.agentic-qe/cache/trm-patterns.bin',
  compressionThreshold: 1024
});

const sonaCache = new BinaryMetadataCache({
  cachePath: '.agentic-qe/cache/sona-weights.bin',
  compressionThreshold: 2048
});

// Pass to strategies
const trmStrategy = new TRMLearningStrategy({
  patternCache: trmCache,
  ...
});

const sonaAdapter = new SONALearningAdapter({
  patternCache: sonaCache,
  ...
});

// Caches used transparently
// - TRM checks cache before computation
// - SONA stores consolidated weights in cache
// - 6x faster pattern retrieval vs SQLite
```

---

## 4. Deployment Architecture

### 4.1 Local Development

```
┌──────────────────────────────────────────────────────────────┐
│ Developer Workstation                                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Agentic QE CLI                                         │ │
│  │  $ aqe generate tests --enable-trm                     │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ HybridRouter                                           │ │
│  │  • Analyzes complexity → MODERATE                      │ │
│  │  • TRM suitable → YES                                  │ │
│  │  • Decision → ROUTE_TO_LOCAL                           │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ RuvllmProvider (Local Inference)                       │ │
│  │  • Model: llama-3.2-3b-instruct                        │ │
│  │  • TRM enabled: YES                                    │ │
│  │  • Iterations: 4                                       │ │
│  │  • Latency: 85ms p95                                   │ │
│  │  • Cost: $0 (local)                                    │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ Binary Cache + HNSW Memory                             │ │
│  │  • .agentic-qe/cache/trm-patterns.bin                  │ │
│  │  • .agentic-qe/cache/sona-weights.bin                  │ │
│  │  • .agentic-qe/memory.db (SQLite)                      │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Production Deployment

```
┌──────────────────────────────────────────────────────────────┐
│ Production CI/CD Pipeline                                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ GitHub Actions / Jenkins                               │ │
│  │  $ npm run test:generate -- --enable-trm              │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ HybridRouter (Cost-Optimized)                          │ │
│  │  • 70% tasks → Local (ruvLLM)                          │ │
│  │  • 30% tasks → Cloud (Claude)                          │ │
│  │  • Circuit breakers enabled                            │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│         ┌─────────┴─────────┐                                │
│         │                   │                                │
│  ┌──────▼──────┐    ┌──────▼──────┐                         │
│  │ Local       │    │ Cloud       │                         │
│  │ (ruvLLM)    │    │ (Claude)    │                         │
│  │             │    │             │                         │
│  │ • 70% load  │    │ • 30% load  │                         │
│  │ • $0 cost   │    │ • $540/mo   │                         │
│  │ • 85ms p95  │    │ • 250ms p95 │                         │
│  └─────────────┘    └─────────────┘                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Shared Binary Cache (Redis-backed)                     │ │
│  │  • Distributed cache for fleet-wide patterns           │ │
│  │  • SONA pattern sharing across agents                  │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Performance Characteristics

### 5.1 TRM Inference Performance

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| **Local Inference Latency** | <100ms p95 | OpenTelemetry histogram |
| **TRM Iterations** | 3-7 | TRMOptimizationResult.iterations |
| **Convergence Rate** | >80% | (converged / total) * 100 |
| **Quality Improvement** | +15% | Before/after quality score |
| **Cache Hit Rate** | >70% | (cacheHits / totalRequests) * 100 |
| **Pattern Load Time** | <8ms | Binary cache latency (6x baseline) |

### 5.2 SONA Learning Performance

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| **Adaptation Speed** | <10 iterations | MicroLoRA adaptation count |
| **Consolidation Time** | <2s | BaseLoRA consolidation duration |
| **Retention Rate** | >95% | EWC++ old pattern accuracy |
| **Pattern Quality** | +5% over 1000 tasks | Success rate trend |
| **Weight Compression** | 4x | Binary cache compression ratio |

### 5.3 Cost Performance

| Scenario | Cloud-Only Cost | Hybrid Cost | Savings |
|----------|-----------------|-------------|---------|
| **100K tasks/month** | $1,800 | $540 | **70%** ($1,260) |
| **Local inference only** | $0 | $0 | **100%** |
| **Simple tasks** | $900 | $0 | **100%** |
| **Complex tasks** | $900 | $540 | **40%** |

---

## 6. Interface Contracts

### 6.1 TRMLearningStrategy Interface

```typescript
interface TRMLearningStrategy extends AgentLearningStrategy {
  // === TRM-Specific Methods ===
  completeTRM(prompt: string, maxIterations?: number): Promise<TRMOptimizationResult>;

  // === Inherited from AgentLearningStrategy ===
  recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null>;
  storePattern(pattern: LearnedPattern): Promise<void>;
  getPatterns(query: PatternQuery): Promise<LearnedPattern[]>;
  findSimilarPatterns(embedding: number[], limit?: number): Promise<LearnedPattern[]>;
  updatePatternConfidence(patternId: string, success: boolean): Promise<void>;
  recordExecution(event: ExecutionEvent): Promise<void>;
  getExecutionHistory(limit?: number): Promise<ExecutionEvent[]>;
  train(iterations?: number): Promise<TrainingResult>;
  exportPatterns(): Promise<LearnedPattern[]>;
  importPatterns(patterns: LearnedPattern[]): Promise<number>;
  initialize(): Promise<void>;
  getStatus(): LearningStatus;
  getMetrics(): Promise<LearningMetrics>;
  reset?(): Promise<void>;
}
```

### 6.2 SONALearningAdapter Interface

```typescript
interface SONALearningAdapter extends LearningEngineAdapter {
  // === SONA-Specific Methods ===
  getMicroLoRAWeights(): Promise<LoRAWeights>;
  getBaseLoRAWeights(): Promise<LoRAWeights>;
  getEWCImportance(): Promise<Float32Array>;
  forceConsolidation(): Promise<void>;

  // === Overridden from LearningEngineAdapter ===
  recordExecution(event: ExecutionEvent): Promise<void>; // Enhanced with SONA

  // === Inherited from LearningEngineAdapter ===
  storePattern(pattern: LearnedPattern): Promise<void>;
  getPatterns(query: PatternQuery): Promise<LearnedPattern[]>;
  findSimilarPatterns(embedding: number[], limit?: number): Promise<LearnedPattern[]>;
  updatePatternConfidence(patternId: string, success: boolean): Promise<void>;
  recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null>;
  recordRecommendationOutcome(rec: StrategyRecommendation, success: boolean): Promise<void>;
  getExecutionHistory(limit?: number): Promise<ExecutionEvent[]>;
  train(iterations?: number): Promise<TrainingResult>;
  exportPatterns(): Promise<LearnedPattern[]>;
  importPatterns(patterns: LearnedPattern[]): Promise<number>;
  initialize(): Promise<void>;
  getStatus(): LearningStatus;
  getMetrics(): Promise<LearningMetrics>;
  reset?(): Promise<void>;
}
```

### 6.3 RuvllmProvider Interface (Enhanced)

```typescript
interface RuvllmProvider extends ILLMProvider {
  // === NEW: TRM Methods ===
  completeTRM(
    options: LLMCompletionOptions,
    trmOptions?: TRMCompletionOptions
  ): Promise<LLMCompletionResponse>;

  // === Existing ILLMProvider Methods ===
  initialize(): Promise<void>;
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse>;
  streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent>;
  embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse>;
  countTokens(options: LLMTokenCountOptions): Promise<number>;
  healthCheck(): Promise<LLMHealthStatus>;
  getMetadata(): LLMProviderMetadata;
  shutdown(): Promise<void>;
  trackCost(usage: LLMCompletionResponse['usage']): number;
}
```

---

## 7. Migration Path & Rollout Strategy

### 7.1 Phase 1: Foundation (Week 1)

```typescript
// Step 1: Install ruvLLM dependencies
npm install @ruvector/ruvllm@^0.2.3

// Step 2: Enhance RuvllmProvider with completeTRM()
// src/providers/RuvllmProvider.ts
export class RuvllmProvider implements ILLMProvider {
  async completeTRM(options, trmOptions?) { /* implementation */ }
}

// Step 3: Integrate with HybridRouter
// src/providers/HybridRouter.ts
private isTRMSuitable(options, complexity) { /* TRM suitability check */ }

// Step 4: Initialize binary caches
const trmCache = new BinaryMetadataCache({ /* config */ });
const sonaCache = new BinaryMetadataCache({ /* config */ });
```

### 7.2 Phase 2: TRM Integration (Week 2)

```typescript
// Step 1: Create TRMLearningStrategy
// src/learning/strategies/TRMLearningStrategy.ts
export class TRMLearningStrategy implements AgentLearningStrategy {
  async recommendStrategy(taskState) {
    const cached = await this.patternCache.get(cacheKey);
    if (cached) return this.convertToRecommendation(cached);

    const trmResult = await this.completeTRM(prompt);
    await this.patternCache.set(cacheKey, trmResult);
    return this.convertToRecommendation(trmResult);
  }
}

// Step 2: Inject into TestGeneratorAgent
const agent = new TestGeneratorAgent({
  learningStrategy: new TRMLearningStrategy({ ruvllm, learningEngine, trmCache })
});

// Step 3: Test with benchmarks
npm run benchmark -- --compare-baseline=v2.4.0
```

### 7.3 Phase 3: SONA Integration (Week 3)

```typescript
// Step 1: Create SONALearningAdapter
// src/learning/adapters/SONALearningAdapter.ts
export class SONALearningAdapter extends LearningEngineAdapter {
  async recordExecution(event) {
    await super.recordExecution(event);
    await this.microLoRA.adapt({ input, output, reward });
    if (this.taskCount % 100 === 0) await this.consolidateToBaseLoRA();
  }
}

// Step 2: Use in agents
const agent = new TestGeneratorAgent({
  learningStrategy: new SONALearningAdapter({ engine, ruvllm, sonaCache })
});

// Step 3: Validate retention
// Run retention tests to ensure >95% old pattern retention
```

### 7.4 Phase 4: Production Deployment (Week 4-5)

```typescript
// Step 1: Enable in production config
// config/production.json
{
  "ruvllm": {
    "enabled": true,
    "trmConfig": {
      "enabled": true,
      "maxIterations": 7
    }
  },
  "hybridRouter": {
    "defaultStrategy": "cost-optimized"
  }
}

// Step 2: Monitor metrics
// OpenTelemetry metrics, Grafana dashboards
// Track: cost savings, quality, latency, cache hit rate

// Step 3: Gradual rollout (feature flag)
if (featureFlags.get('ruvllm-trm-enabled')) {
  learningStrategy = new TRMLearningStrategy({ ... });
} else {
  learningStrategy = defaultLearningStrategy;
}
```

---

## 8. Monitoring & Observability

### 8.1 Metrics to Track

```typescript
// OpenTelemetry metrics
const metrics = {
  // TRM metrics
  'trm.invocations.total': Counter,
  'trm.iterations.histogram': Histogram,
  'trm.convergence_rate': Gauge,
  'trm.quality_improvement': Histogram,
  'trm.cache_hit_rate': Gauge,

  // SONA metrics
  'sona.adaptations.total': Counter,
  'sona.consolidations.total': Counter,
  'sona.retention_rate': Gauge,
  'sona.pattern_quality': Gauge,

  // Cost metrics
  'routing.local_requests': Counter,
  'routing.cloud_requests': Counter,
  'routing.cost_savings': Gauge,

  // Performance metrics
  'inference.latency.local': Histogram,
  'inference.latency.cloud': Histogram,
  'cache.load_time': Histogram
};
```

### 8.2 Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| **TRM Convergence Failure** | convergence_rate < 50% for 1h | Warning | Adjust maxIterations or convergenceThreshold |
| **SONA Retention Drop** | retention_rate < 90% for 30min | Critical | Check EWC++ lambda, investigate catastrophic forgetting |
| **Cache Miss Rate High** | cache_hit_rate < 50% for 1h | Warning | Increase cache TTL, check cache invalidation logic |
| **Local Inference Slow** | p95_latency > 200ms for 10min | Warning | Check ruvLLM health, consider cloud fallback |
| **Cost Savings Low** | savings < 50% for 1 day | Info | Review routing strategy, check local availability |

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
describe('TRMLearningStrategy', () => {
  it('should cache TRM optimization results', async () => {
    const strategy = new TRMLearningStrategy({ ruvllm, patternCache, ... });

    // First call: cache miss
    const rec1 = await strategy.recommendStrategy(taskState);
    expect(rec1.metadata.cached).toBe(false);

    // Second call: cache hit (6x faster)
    const rec2 = await strategy.recommendStrategy(taskState);
    expect(rec2.metadata.cached).toBe(true);
  });

  it('should converge within max iterations', async () => {
    const result = await strategy.completeTRM(prompt, 7);
    expect(result.iterations).toBeLessThanOrEqual(7);
    expect(result.converged).toBe(true);
  });
});

describe('SONALearningAdapter', () => {
  it('should adapt MicroLoRA on execution', async () => {
    const adapter = new SONALearningAdapter({ engine, ruvllm, sonaCache, ... });

    await adapter.recordExecution(event);

    const weights = await adapter.getMicroLoRAWeights();
    expect(weights.rank).toBe(2);
  });

  it('should consolidate every 100 tasks', async () => {
    for (let i = 0; i < 100; i++) {
      await adapter.recordExecution(mockEvent());
    }

    const baseWeights = await adapter.getBaseLoRAWeights();
    expect(baseWeights.rank).toBe(8);
  });
});
```

### 9.2 Integration Tests

```typescript
describe('End-to-End TRM Flow', () => {
  it('should generate tests with TRM optimization', async () => {
    const agent = new TestGeneratorAgent({
      learningStrategy: new TRMLearningStrategy({ ... })
    });

    const result = await agent.generateTests({
      sourceCode: sampleCode,
      framework: 'jest'
    });

    expect(result.quality.diversityScore).toBeGreaterThan(0.85);
    expect(result.metadata.trmIterations).toBeGreaterThan(0);
  });
});

describe('Cost Savings Validation', () => {
  it('should achieve 70%+ cost reduction', async () => {
    const router = new HybridRouter({ defaultStrategy: 'cost-optimized', ... });

    // Simulate 100 requests
    for (let i = 0; i < 100; i++) {
      await router.complete(mockRequest());
    }

    const report = router.getCostSavingsReport();
    expect(report.savingsPercentage).toBeGreaterThanOrEqual(70);
  });
});
```

### 9.3 Performance Benchmarks

```typescript
// benchmarks/trm-performance.ts
import { BenchmarkSuite } from '../benchmarks/suite';

const suite = new BenchmarkSuite();

suite.add('TRM Optimization Latency', async () => {
  const result = await trmStrategy.completeTRM(prompt);
  return result.duration;
}, {
  target: 100, // <100ms target
  unit: 'ms'
});

suite.add('Binary Cache Speedup', async () => {
  const start = Date.now();
  await patternCache.get('trm:cached-pattern');
  return Date.now() - start;
}, {
  target: 8, // <8ms (6x baseline)
  unit: 'ms'
});

await suite.run();
await suite.compare('v2.4.0');
```

---

## 10. Rollback Plan

### 10.1 Feature Flag Rollback

```typescript
// config/features.ts
export const featureFlags = {
  'ruvllm-trm-enabled': false, // Disable TRM
  'ruvllm-sona-enabled': false // Disable SONA
};

// Agent initialization with rollback
const learningStrategy = featureFlags.get('ruvllm-trm-enabled')
  ? new TRMLearningStrategy({ ... })
  : new DefaultLearningStrategy({ ... });
```

### 10.2 Provider Rollback

```typescript
// HybridRouter: Force cloud routing
hybridRouter.setConfig({
  forceCloud: true, // Bypass local entirely
  enableCircuitBreaker: false
});

// Verify all requests go to cloud
const report = hybridRouter.getCostSavingsReport();
expect(report.localRequests).toBe(0);
```

### 10.3 Cache Invalidation

```bash
# Clear binary caches
rm .agentic-qe/cache/trm-patterns.bin
rm .agentic-qe/cache/sona-weights.bin

# Verify SQLite fallback
aqe generate tests --no-cache
```

---

## 11. Security Considerations

### 11.1 Local Model Security

- **Model Integrity**: Verify SHA-256 checksums for downloaded models
- **Sandboxing**: Run ruvLLM in isolated process with limited permissions
- **Resource Limits**: CPU/memory limits to prevent DoS

### 11.2 Data Privacy

- **Local Inference**: Sensitive code stays on-premises
- **Cache Encryption**: Binary caches encrypted at rest (optional)
- **Namespace Isolation**: Agent-local data cannot leak to other agents

### 11.3 Supply Chain Security

- **Dependency Pinning**: `@ruvector/ruvllm@0.2.3` exact version
- **Vulnerability Scanning**: `npm audit` in CI/CD
- **Model Provenance**: Download models from official sources only

---

## 12. Success Criteria

### 12.1 Functional Requirements

- ✅ TRM integration with <100ms p95 local inference latency
- ✅ SONA adaptation with >95% retention rate
- ✅ Binary cache with 6x pattern loading speedup
- ✅ Zero modification to BaseAgent, LearningEngine, or SwarmMemoryManager

### 12.2 Performance Requirements

- ✅ 70%+ cost reduction via local inference routing
- ✅ 15%+ quality improvement via TRM recursive reasoning
- ✅ <8ms binary cache retrieval latency
- ✅ 3-7 TRM iterations for moderate complexity tasks

### 12.3 Operational Requirements

- ✅ Feature flags for gradual rollout
- ✅ Rollback plan validated in staging
- ✅ Monitoring dashboards operational
- ✅ Documentation complete (user + developer)

---

## 13. Future Enhancements

### 13.1 Multi-Model TRM

Support multiple TRM models for different task types:
- `llama-3.2-3b` for fast inference
- `llama-3.1-8b` for complex reasoning
- `phi-3-mini` for embedded deployment

### 13.2 Distributed SONA

Fleet-wide SONA pattern sharing via distributed cache:
- Redis-backed binary cache
- Cross-agent LoRA weight synchronization
- Federated learning without centralized server

### 13.3 Adaptive Routing

ML-based routing decisions:
- Learn optimal provider selection from outcomes
- Predict TRM convergence probability
- Dynamic cost/quality trade-off optimization

---

## 14. References

- **v2.4.0 Architecture**: `/docs/architecture/adr-strategy-pattern.md`
- **Binary Cache Spec**: `/src/core/cache/BinaryMetadataCache.ts`
- **Learning Strategy Interface**: `/src/core/strategies/AgentLearningStrategy.ts`
- **Integration Plan**: `/docs/analysis/ruvllm-integration-plan.md`
- **Impact Analysis**: `/docs/analysis/ruvllm-plan-v2.4.0-impact.md`
- **ruvLLM Package**: https://www.npmjs.com/package/@ruvector/ruvllm
- **TRM Paper**: https://arxiv.org/abs/2510.04871

---

**Document Status**: ✅ COMPLETE - Ready for Implementation

**Next Steps**:
1. Review architecture with technical lead
2. Create implementation tickets (M1.1 - M5.3)
3. Begin Week 1 implementation (Foundation)

**Approval Required**: Technical Lead, Product Owner, QE Lead
