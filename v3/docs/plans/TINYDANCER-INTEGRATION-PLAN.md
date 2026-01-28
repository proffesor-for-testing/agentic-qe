# TinyDancer Model Routing Integration - Implementation Plan

**Status**: Planning Complete
**Date**: 2026-01-26
**Author**: Claude Code (SPARC-GOAP Analysis)
**ADR References**: ADR-026 (Model Routing), ADR-051 (Agent Booster Integration)

---

## Executive Summary

TinyDancer routing is correctly DECIDING which tier to use, but the routing decisions are NOT being acted upon. This document provides a detailed implementation plan to complete the "last mile" of intelligent model routing in AQE v3.

### Current State Assessment

| Component | Status | Location |
|-----------|--------|----------|
| TinyDancer Router | IMPLEMENTED | `src/routing/tiny-dancer-router.ts` |
| Task Classifier | IMPLEMENTED | `src/routing/task-classifier.ts` |
| Model Router | IMPLEMENTED | `src/integrations/agentic-flow/model-router/` |
| Task Router Service | IMPLEMENTED | `src/mcp/services/task-router.ts` |
| LLM Provider System | IMPLEMENTED (7 providers) | `src/shared/llm/` |
| Agent Booster WASM | IMPLEMENTED | `src/integrations/agent-booster-wasm/` |
| Agent Booster Adapter | IMPLEMENTED | `src/integrations/agentic-flow/agent-booster/` |
| Domain Handlers | PASSING routingTier | `src/mcp/handlers/domain-handlers.ts` |
| Task Executor | IGNORING routingTier | `src/coordination/task-executor.ts` |
| Outcome Feedback | NOT WIRED | Gap identified |

### The Gap: What's Missing

1. **Task Executor ignores `routingTier`**: The `payload.routingTier` is passed but never read
2. **Domain services don't make LLM calls**: They're local analyzers, not LLM-enhanced
3. **Agent Booster not triggered for Tier 0**: WASM transforms available but not invoked
4. **No outcome feedback**: `recordOutcome()` exists but isn't called after task completion

---

## Phase 1: Wire routingTier to Execution (CRITICAL)

### 1.1 Current Flow Analysis

```
domain-handlers.ts → routeDomainTask() → TaskRouterService → routingTier in payload
                                                                    ↓
                                                           queen.submitTask()
                                                                    ↓
                                                           task-executor.ts
                                                                    ↓
                                                           handler(task, kernel)
                                                                    ↓
                                                           [routingTier IGNORED]
```

### 1.2 Required Changes

**File**: `src/coordination/task-executor.ts`

```typescript
// Add import for LLM system
import { HybridRouter, createQERouter } from '../shared/llm';
import type { AgentTier } from '../routing/routing-config';

// Add LLM router instance (lazy initialized)
let llmRouter: HybridRouter | null = null;

async function getLLMRouter(): Promise<HybridRouter> {
  if (!llmRouter) {
    llmRouter = await createQERouter();
  }
  return llmRouter;
}

// Add tier-to-model mapping
function getModelForTier(tier: number): string {
  switch (tier) {
    case 0: return 'agent-booster'; // Special case - WASM transforms
    case 1: return 'claude-3-5-haiku-20241022';
    case 2: return 'claude-sonnet-4-20250514';
    case 3: return 'claude-sonnet-4-20250514'; // Extended thinking
    case 4: return 'claude-opus-4-5-20251101';
    default: return 'claude-sonnet-4-20250514';
  }
}
```

**Modify `DomainTaskExecutor.execute()`**:

```typescript
async execute(task: QueenTask): Promise<TaskResult> {
  const startTime = Date.now();
  const domain = this.getTaskDomain(task.type);

  // Extract routing tier from payload
  const routingTier = (task.payload as any)?.routingTier ?? 2; // Default to Sonnet
  const useAgentBooster = (task.payload as any)?.useAgentBooster ?? false;

  // Special handling for Tier 0 (Agent Booster)
  if (routingTier === 0 && useAgentBooster) {
    return this.executeWithAgentBooster(task, startTime, domain);
  }

  // Get appropriate LLM client based on tier
  const modelId = getModelForTier(routingTier);

  // ... rest of execution with tier-aware model selection
}
```

### 1.3 Success Criteria

- [ ] `routingTier` is read from task payload
- [ ] Tier 0 tasks route to Agent Booster
- [ ] Tier 1-4 tasks use appropriate Claude model
- [ ] Integration test validates tier selection

---

## Phase 2: LLM Integration for Domain Services

### 2.1 Current LLM System Assessment

**EXCELLENT NEWS**: v3 has a comprehensive multi-provider LLM system already!

**Existing Capabilities** (`src/shared/llm/`):
- 7 Providers: Claude, OpenAI, Ollama, OpenRouter, Gemini, Azure OpenAI, Bedrock
- HybridRouter with intelligent provider routing
- Cost tracking and budget management
- Circuit breakers and caching
- Model registry with tier mapping

**Key Exports**:
```typescript
// From src/shared/llm/index.ts
export { HybridRouter, createHybridRouter, createQERouter } from './router';
export { ClaudeProvider } from './providers';
export { getModelTier } from './model-mapping';
```

### 2.2 Domain Service Enhancement Pattern

Domain services need to accept an LLM client for enhanced operations. Example for test generation:

**File**: `src/domains/test-generation/services/test-generator.ts`

```typescript
import { HybridRouter } from '../../../shared/llm';

export interface TestGeneratorConfig {
  llmRouter?: HybridRouter;
  modelTier?: number;
  enableAIEnhancement?: boolean;
}

export class TestGeneratorService {
  private readonly llmRouter?: HybridRouter;

  constructor(memory: MemoryBackend, config?: TestGeneratorConfig) {
    this.llmRouter = config?.llmRouter;
    // ... existing initialization
  }

  async generateTests(options: GenerateOptions): Promise<Result<GeneratedTests, Error>> {
    // Existing AST-based generation
    const basicTests = this.generateBasicTests(options);

    // If LLM available and AI enhancement requested, enhance tests
    if (this.llmRouter && options.aiEnhancement) {
      return this.enhanceWithLLM(basicTests, options);
    }

    return ok(basicTests);
  }

  private async enhanceWithLLM(
    tests: GeneratedTests,
    options: GenerateOptions
  ): Promise<Result<GeneratedTests, Error>> {
    const response = await this.llmRouter!.chat({
      messages: [{
        role: 'user',
        content: this.buildTestEnhancementPrompt(tests, options)
      }],
      // Model selected by tier already configured in router
    });

    // Parse and merge enhanced tests
    return this.mergeEnhancedTests(tests, response);
  }
}
```

### 2.3 Domain Services to Enhance

| Domain | Service | LLM Enhancement Type |
|--------|---------|---------------------|
| test-generation | TestGeneratorService | Edge case generation, assertion improvement |
| coverage-analysis | CoverageAnalyzerService | Gap analysis recommendations |
| security-compliance | SecurityScannerService | Vulnerability explanation, remediation |
| quality-assessment | QualityAnalyzerService | Code quality suggestions |
| defect-intelligence | (New) DefectPredictorService | ML-powered defect prediction |

### 2.4 Success Criteria

- [ ] TestGeneratorService accepts HybridRouter
- [ ] LLM enhancement produces better test suggestions
- [ ] Tier selection affects model used in LLM calls
- [ ] Cost tracking captures domain service LLM usage

---

## Phase 3: Agent Booster Execution for Tier 0

### 3.1 Current Agent Booster Status

**FULLY IMPLEMENTED** in `src/integrations/agent-booster-wasm/` and `src/integrations/agentic-flow/agent-booster/adapter.ts`:

- WASM transforms: var-to-const, add-types, remove-console, promise-to-async, cjs-to-esm, func-to-arrow
- Performance: 0.02-0.35ms (WASM), 1-20ms (TypeScript fallback)
- Confidence scoring and LLM fallback support

**Missing**: Integration with task executor for automatic Tier 0 dispatch.

### 3.2 Task Executor Agent Booster Integration

**File**: `src/coordination/task-executor.ts`

```typescript
import { createAgentBoosterAdapter, AgentBoosterAdapter } from '../integrations/agentic-flow/agent-booster';
import type { TransformType } from '../integrations/agentic-flow/agent-booster/types';

// Lazy-initialized Agent Booster
let agentBooster: AgentBoosterAdapter | null = null;

async function getAgentBooster(): Promise<AgentBoosterAdapter> {
  if (!agentBooster) {
    agentBooster = await createAgentBoosterAdapter({
      enabled: true,
      fallbackToLLM: true,
      confidenceThreshold: 0.7,
    });
  }
  return agentBooster;
}

// Map task types to transform types
function mapTaskToTransform(task: QueenTask): TransformType | null {
  const codeContext = (task.payload as any)?.codeContext || '';

  // Detect transform opportunities
  if (codeContext.includes('var ')) return 'var-to-const';
  if (codeContext.includes('function') && !codeContext.includes(': ')) return 'add-types';
  if (codeContext.includes('console.')) return 'remove-console';
  if (codeContext.includes('.then(')) return 'promise-to-async';
  if (codeContext.includes('require(')) return 'cjs-to-esm';

  return null; // No applicable transform
}

async function executeWithAgentBooster(
  task: QueenTask,
  startTime: number,
  domain: DomainName
): Promise<TaskResult> {
  const booster = await getAgentBooster();
  const transformType = mapTaskToTransform(task);

  if (!transformType) {
    // No applicable transform - fall back to Tier 1 (Haiku)
    return this.executeWithTier(task, 1, startTime, domain);
  }

  const codeContext = (task.payload as any)?.codeContext || '';
  const result = await booster.transform(codeContext, transformType);

  if (result.success && result.confidence >= 0.7) {
    return {
      taskId: task.id,
      success: true,
      data: {
        transformed: true,
        transformType,
        originalCode: result.originalCode,
        transformedCode: result.transformedCode,
        confidence: result.confidence,
        implementationUsed: result.implementationUsed,
        durationMs: result.durationMs,
      },
      duration: Date.now() - startTime,
      domain,
    };
  }

  // Low confidence - fall back to Tier 1
  return this.executeWithTier(task, 1, startTime, domain);
}
```

### 3.3 Success Criteria

- [ ] Tier 0 tasks automatically route to Agent Booster
- [ ] Transform type detected from task context
- [ ] Low-confidence results fall back to Tier 1 (Haiku)
- [ ] Metrics track Agent Booster usage and success rate

---

## Phase 4: Outcome Feedback to TinyDancer

### 4.1 Current Feedback Gap

`TinyDancerRouter.recordOutcome()` exists but is never called. The task executor completes tasks without reporting outcomes.

### 4.2 Wiring Outcome Recording

**File**: `src/coordination/task-executor.ts`

```typescript
import { getTaskRouter, type TaskRouterService } from '../mcp/services/task-router';

// In DomainTaskExecutor class:
private taskRouter: TaskRouterService | null = null;

async getTaskRouter(): Promise<TaskRouterService> {
  if (!this.taskRouter) {
    this.taskRouter = await getTaskRouter();
  }
  return this.taskRouter;
}

async execute(task: QueenTask): Promise<TaskResult> {
  const startTime = Date.now();
  const domain = this.getTaskDomain(task.type);
  const routingTier = (task.payload as any)?.routingTier ?? 2;

  try {
    // ... execution logic ...

    const result = await handler(task, this.kernel);

    // Record successful outcome
    await this.recordOutcome(task, routingTier, true, Date.now() - startTime);

    return {
      taskId: task.id,
      success: true,
      data: result.value,
      duration: Date.now() - startTime,
      domain,
    };
  } catch (error) {
    // Record failed outcome
    await this.recordOutcome(task, routingTier, false, Date.now() - startTime);

    return {
      taskId: task.id,
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
      domain,
    };
  }
}

private async recordOutcome(
  task: QueenTask,
  tier: number,
  success: boolean,
  durationMs: number
): Promise<void> {
  try {
    const router = await this.getTaskRouter();
    const metrics = router.getMetrics();

    // Record in router metrics
    // This enables the learning loop for routing improvement
    console.debug(`[TaskExecutor] Outcome recorded: tier=${tier}, success=${success}, duration=${durationMs}ms`);
  } catch (error) {
    // Don't fail task execution if metrics recording fails
    console.warn('[TaskExecutor] Failed to record outcome:', error);
  }
}
```

### 4.3 TinyDancer Learning Enhancement

**File**: `src/routing/tiny-dancer-router.ts`

The `recordOutcome()` method is already implemented. We need to ensure it's called with proper data:

```typescript
// Called from task executor after completion
recordOutcome(
  task: ClassifiableTask,
  routeResult: RouteResult,
  success: boolean,
  qualityScore: number, // 0.0-1.0
  actualModelUsed: ClaudeModel,
  durationMs: number
): void
```

### 4.4 Success Criteria

- [ ] All task completions call `recordOutcome()`
- [ ] Success/failure tracked per model tier
- [ ] Duration tracked for latency analysis
- [ ] Learning data persists across sessions (optional Phase 5)

---

## Implementation Order (Dependency Graph)

```
Phase 1: Wire routingTier ─────┬──────────────────┐
         (CRITICAL)            │                  │
              ↓                ↓                  ↓
Phase 2: LLM Integration   Phase 3: Agent      Phase 4: Outcome
         (Can parallel)    Booster (Can        Feedback
                           parallel)           (Depends on 1)
              │                │                  │
              └────────────────┴──────────────────┘
                               ↓
                     Phase 5: Integration Testing
```

### Recommended Order

1. **Phase 1** (1-2 days): Wire routingTier - unblocks all other phases
2. **Phase 4** (1 day): Outcome feedback - quick win, enables learning
3. **Phase 3** (1-2 days): Agent Booster execution - Tier 0 capability
4. **Phase 2** (2-3 days): LLM integration - requires careful design
5. **Integration Testing** (1-2 days): End-to-end validation

**Total Estimated Effort**: 6-10 days

---

## Integration Test Strategy

### Test 1: Tier Selection Validation

```typescript
// tests/integration/model-routing.test.ts
describe('TinyDancer Model Routing Integration', () => {
  it('should route trivial tasks to Agent Booster (Tier 0)', async () => {
    const result = await handleTestGenerate({
      sourceCode: 'var x = 1;', // Trivial transform
      testType: 'unit',
    });

    expect(result.data.tier).toBe(0);
    expect(result.data.implementationUsed).toBe('agent-booster');
  });

  it('should route simple tasks to Haiku (Tier 1)', async () => {
    const result = await handleTestGenerate({
      sourceCode: 'function add(a, b) { return a + b; }',
      testType: 'unit',
    });

    expect(result.data.tier).toBe(1);
    expect(result.data.model).toContain('haiku');
  });

  it('should route complex security tasks to Opus (Tier 4)', async () => {
    const result = await handleSecurityScan({
      target: 'src/',
      sast: true,
      compliance: ['OWASP'],
    });

    expect(result.data.tier).toBe(4);
    expect(result.data.model).toContain('opus');
  });
});
```

### Test 2: Outcome Feedback Loop

```typescript
describe('Outcome Feedback Learning', () => {
  it('should record outcomes and improve routing', async () => {
    const router = await getTaskRouter();
    const initialStats = router.getRoutingStats();

    // Execute several tasks
    await executeTasksWithVariousTiers();

    const finalStats = router.getRoutingStats();
    expect(finalStats.totalRouted).toBeGreaterThan(initialStats.totalRouted);
    expect(finalStats.avgDecisionTimeMs).toBeLessThan(10); // Fast decisions
  });
});
```

### Test 3: Agent Booster Fallback

```typescript
describe('Agent Booster with Fallback', () => {
  it('should fall back to Haiku when transform not applicable', async () => {
    const result = await executeTask({
      type: 'generate-tests',
      payload: {
        sourceCode: 'class Complex { /* 500 lines */ }',
        routingTier: 0, // Request Tier 0
      },
    });

    // Should have fallen back since no simple transform
    expect(result.data.actualTier).toBe(1);
    expect(result.data.fallbackReason).toBe('no-applicable-transform');
  });
});
```

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `src/coordination/task-executor.ts` | Read routingTier, dispatch to tier-appropriate execution | P0 |
| `src/coordination/task-executor.ts` | Add Agent Booster integration | P1 |
| `src/coordination/task-executor.ts` | Add outcome recording | P1 |
| `src/domains/test-generation/services/test-generator.ts` | Accept LLM router | P2 |
| `src/domains/coverage-analysis/services/coverage-analyzer.ts` | Accept LLM router | P2 |
| `src/domains/security-compliance/services/security-scanner.ts` | Accept LLM router | P2 |
| `src/mcp/handlers/domain-handlers.ts` | Pass LLM router to services | P2 |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/coordination/tier-executor.ts` | Tier-specific execution logic |
| `tests/integration/model-routing.test.ts` | Integration tests |
| `docs/adr/ADR-052-tinydancer-integration.md` | Architecture decision record |

---

## Risk Mitigation

### Risk 1: LLM API Costs
**Mitigation**: Use existing cost tracking in `src/shared/llm/cost-tracker.ts`. Set daily limits via `ROUTING_COST_DAILY_LIMIT` environment variable.

### Risk 2: Agent Booster WASM Not Available
**Mitigation**: Graceful fallback to TypeScript transforms, then to Tier 1 (Haiku).

### Risk 3: Breaking Existing Domain Services
**Mitigation**: LLM integration is opt-in via config. Existing services continue working without LLM.

### Risk 4: Outcome Recording Performance Impact
**Mitigation**: Async recording with fire-and-forget pattern. Don't block task completion.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tier 0 usage rate | 15-25% of simple tasks | Agent Booster metrics |
| Tier routing accuracy | 85%+ tasks use appropriate tier | Outcome success rate by tier |
| Cost reduction | 30%+ vs all-Sonnet baseline | Cost tracker comparison |
| Latency (Tier 0) | <1ms for transforms | Agent Booster metrics |
| Outcome recording | 100% coverage | Router stats |

---

## Appendix: Key Code References

### Existing LLM System
```typescript
// src/shared/llm/index.ts
export { HybridRouter, createHybridRouter, createQERouter } from './router';
export { ClaudeProvider } from './providers';
export { getModelTier, mapModelId } from './model-mapping';
export { CostTracker, getGlobalCostTracker } from './cost-tracker';
```

### Existing Agent Booster
```typescript
// src/integrations/agentic-flow/agent-booster/adapter.ts
export class AgentBoosterAdapter implements IAgentBoosterAdapter {
  async transform(code: string, type: TransformType): Promise<TransformResult>;
  async detectTransformOpportunities(code: string): Promise<OpportunityDetectionResult>;
  getHealth(): AgentBoosterHealth;
}
```

### Existing Task Router
```typescript
// src/mcp/services/task-router.ts
export class TaskRouterService {
  async routeTask(input: TaskRoutingInput): Promise<TaskRoutingResult>;
  getMetrics(): RouterMetrics;
  getRoutingStats(): RoutingStats;
}
```

### Existing TinyDancer
```typescript
// src/routing/tiny-dancer-router.ts
export class TinyDancerRouter {
  async route(task: ClassifiableTask): Promise<RouteResult>;
  recordOutcome(task, routeResult, success, qualityScore, actualModel, duration): void;
  getStats(): RouterStats;
}
```

---

## Next Steps

1. Review and approve this plan
2. Create GitHub issues for each phase
3. Assign to claude-flow swarm for parallel execution
4. Run integration tests after each phase
5. Update ADR documentation

**Ready for Implementation**: This plan is executable by claude-flow swarm and QE agents.
