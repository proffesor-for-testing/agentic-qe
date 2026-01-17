# SONA Lifecycle Integration - Phase 2 Implementation

## Overview

Phase 2 of SONA integration wires SONA's self-organizing capabilities into the agent execution lifecycle. This enables continuous learning and adaptation as agents execute tasks in the QE fleet.

## Implementation Summary

### Files Created

1. **`src/agents/SONALifecycleManager.ts`** (NEW)
   - Core lifecycle manager for SONA integration
   - Manages per-agent SONA contexts
   - Coordinates lifecycle hooks and learning consolidation
   - **717 lines** of production code

2. **`tests/unit/agents/SONALifecycleManager.test.ts`** (NEW)
   - Comprehensive unit tests for lifecycle manager
   - **56 tests** covering all public methods and error cases
   - Tests for LoRA adapter mapping, consolidation logic, singleton pattern

3. **`tests/integration/pipelines/AgentRegistry-SONA-Router.test.ts`** (NEW)
   - Integration tests for full AgentRegistry → SONA → Router pipeline
   - **16 tests** covering end-to-end workflows

### Files Modified

1. **`src/mcp/services/AgentRegistry.ts`**
   - Added SONA lifecycle integration
   - Wired hooks into spawn, task execution, and termination
   - Added methods for SONA metrics and training
   - ~100 lines of changes

2. **`src/agents/index.ts`**
   - Exported SONALifecycleManager and related types
   - ~15 lines of changes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentRegistry                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  spawnAgent()                                         │  │
│  │    └─> onAgentSpawn() ──────────────────────┐       │  │
│  │                                               │       │  │
│  │  executeTask()                                │       │  │
│  │    └─> onTaskComplete() ─────────────┐       │       │  │
│  │                                       │       │       │  │
│  │  terminateAgent()                     │       │       │  │
│  │    └─> cleanupAgent() ────────┐      │       │       │  │
│  └────────────────────────────────┼──────┼───────┼───────┘  │
└─────────────────────────────────┼┼──────┼───────┼───────────┘
                                  ││      │       │
                                  ││      │       │
                           ┌──────▼▼──────▼───────▼──────────┐
                           │  SONALifecycleManager            │
                           │  ┌────────────────────────────┐  │
                           │  │ AgentSONAContext Map       │  │
                           │  │  - strategy                │  │
                           │  │  - feedbackLoop            │  │
                           │  │  - activeAdapter           │  │
                           │  │  - pendingPatterns         │  │
                           │  └────────────────────────────┘  │
                           │                                  │
                           │  Hooks:                          │
                           │  • onAgentSpawn()               │
                           │  • onTaskComplete()             │
                           │  • onFeedback()                 │
                           │  • cleanupAgent()               │
                           └──────────────────────────────────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   │                     │                     │
          ┌────────▼───────┐   ┌────────▼─────────┐  ┌───────▼──────┐
          │ SONALearning   │   │ SONAFeedback     │  │ LoRA Adapter │
          │ Strategy       │   │ Loop             │  │ Manager      │
          │  - MicroLoRA   │   │  - Analysis      │  │  - Activate  │
          │  - BaseLoRA    │   │  - Adaptation    │  │  - Switch    │
          │  - EWC++       │   │  - Consolidation │  │              │
          └────────────────┘   └──────────────────┘  └──────────────┘
```

## Key Features Implemented

### 1. Agent Spawn Hook - `onAgentSpawn()`

**Purpose**: Initialize SONA state when agent spawns

**Implementation**:
- Creates `SONALearningStrategy` with adaptive configuration
- Initializes `SONAFeedbackLoop` for continuous learning
- Activates relevant LoRA adapter based on agent type
- Creates `AgentSONAContext` to track agent's learning state

**LoRA Adapter Mapping**:
```typescript
TEST_GENERATOR → 'test-generation'
COVERAGE_ANALYZER → 'coverage-analysis'
PERFORMANCE_TESTER → 'performance-testing'
SECURITY_SCANNER → 'security-scanning'
... (20 agent types mapped)
```

### 2. Task Complete Hook - `onTaskComplete()`

**Purpose**: Collect feedback and trigger consolidation on successful patterns

**Implementation**:
- Records execution feedback via `SONAFeedbackLoop`
- Tracks success/failure metrics
- Checks consolidation triggers (every N successful tasks)
- Triggers EWC++ weight consolidation when threshold reached

**Consolidation Logic**:
```typescript
// Consolidate every 100 successful tasks (configurable)
if (context.successfulTasks % consolidationInterval === 0) {
  // Store pending patterns
  // Trigger training
  // Update EWC weights
}

// Also consolidate if pending patterns >= threshold
if (context.pendingPatterns.length >= consolidationInterval) {
  consolidateWeights(context)
}
```

### 3. Feedback Hook - `onFeedback()`

**Purpose**: Generic feedback recording for any execution event

**Implementation**:
- Records `FeedbackEvent` via feedback loop or strategy
- Stores successful patterns for later consolidation
- Creates `LearnedPattern` objects from execution data
- Accumulates patterns in `pendingPatterns` queue

### 4. EWC Weight Consolidation

**Purpose**: Prevent catastrophic forgetting while learning new patterns

**Implementation**:
```typescript
async consolidateWeights(context: AgentSONAContext) {
  // 1. Check success rate threshold (default: 70%)
  if (successRate < minSuccessRateForConsolidation) {
    return; // Skip if performance is poor
  }

  // 2. Store all pending patterns
  for (const pattern of context.pendingPatterns) {
    await context.strategy.storePattern(pattern);
  }

  // 3. Trigger training (5 iterations)
  const result = await context.strategy.train(5);

  // 4. Update consolidation timestamp
  context.lastConsolidation = new Date();
  context.pendingPatterns = [];
}
```

### 5. LoRA Adapter Management

**Purpose**: Activate task-specific adapters for efficient learning

**Implementation**:
- Determines adapter based on agent type
- Activates adapter during agent spawn
- Future: Adaptive adapter switching based on performance

**Adapter Types**:
- **MicroLoRA** (rank 1-2): Instant adaptation for hot paths
- **BaseLoRA** (rank 4-16): Long-term pattern consolidation

## Configuration

```typescript
interface SONALifecycleConfig {
  /** Enable SONA lifecycle integration */
  enabled?: boolean; // default: true

  /** Enable automatic EWC consolidation */
  autoConsolidate?: boolean; // default: true

  /** Consolidation interval (successful tasks) */
  consolidationInterval?: number; // default: 100

  /** Enable LoRA adapter management */
  enableLoraAdapters?: boolean; // default: true

  /** SONA learning configuration */
  sonaConfig?: SONALearningConfig;

  /** Feedback loop configuration */
  feedbackConfig?: FeedbackLoopConfig;

  /** Minimum success rate for consolidation */
  minSuccessRateForConsolidation?: number; // default: 0.7

  /** Enable performance-based adapter selection */
  enableAdaptiveAdapters?: boolean; // default: true
}
```

## Usage

### Basic Setup

```typescript
import { AgentRegistry } from './mcp/services/AgentRegistry';

// Create registry with SONA lifecycle enabled
const registry = new AgentRegistry({
  enableSONALifecycle: true,
  sonaLifecycleConfig: {
    consolidationInterval: 100,
    minSuccessRateForConsolidation: 0.7,
  }
});

// Spawn agent (automatically initializes SONA)
const { id, agent } = await registry.spawnAgent('test-generator', {
  name: 'Test Generator 1',
});

// Execute task (automatically records feedback)
const result = await registry.executeTask(id, {
  taskType: 'generate-unit-tests',
  payload: { file: 'UserService.ts' }
});

// Get SONA metrics
const metrics = await registry.getSONAMetrics(id);
console.log(metrics);
// {
//   microLoraAdaptations: 45,
//   baseLoraConsolidations: 2,
//   ewcRetentionRate: 0.95,
//   trajectoriesRecorded: 100,
//   ...
// }
```

### Manual Feedback Recording

```typescript
import { FeedbackEvent } from './learning/SONAFeedbackLoop';

// Record custom feedback
const event: FeedbackEvent = {
  task: myTask,
  success: true,
  duration: 1500,
  quality: 0.92,
  patternsUsed: ['pattern-123', 'pattern-456'],
  timestamp: new Date(),
};

await registry.recordFeedback(agentId, event);
```

### Manual Training

```typescript
// Trigger training manually
const result = await registry.trainAgent(agentId, 10);
console.log(result);
// {
//   iterations: 10,
//   improvement: 0.15,
//   patternsLearned: 23,
//   duration: 2345,
//   metrics: { accuracy: 0.89, loss: 0.11, ... }
// }
```

### Get Statistics

```typescript
// Get lifecycle statistics
const stats = registry.getSONAStatistics();
console.log(stats);
// {
//   enabled: true,
//   totalAgents: 15,
//   totalSuccessfulTasks: 1523,
//   totalFailedTasks: 47,
//   averageSuccessRate: 0.97,
//   totalConsolidations: 15,
//   ruvLLMAvailable: true
// }
```

## Fallback Mode

When ruvLLM is not available, SONA operates in fallback mode:
- Reduced LoRA ranks (MicroLoRA: 1, BaseLoRA: 4)
- More frequent consolidation (interval: 50 instead of 100)
- Lower pattern limit (5000 instead of 10000)
- Core pattern learning still functional

## Performance Characteristics

### Time Complexity
- `onAgentSpawn()`: O(1) - Initialization
- `onTaskComplete()`: O(1) amortized - Most calls just record
- `consolidateWeights()`: O(n) where n = pending patterns - Triggered periodically
- `onFeedback()`: O(1) - Fast recording

### Space Complexity
- Per-agent context: O(1) fixed overhead
- Pending patterns: O(n) where n = consolidation interval
- Total: O(agents * consolidation_interval)

### Consolidation Triggers
- Every N successful tasks (default: 100)
- When pending patterns >= threshold
- Manual via `trainAgent()` call
- Only when success rate >= threshold (default: 70%)

## Testing

### Unit Tests
- Test each lifecycle hook independently
- Mock SONA components
- Verify consolidation logic
- Test fallback mode

### Integration Tests
- Spawn agents and execute tasks
- Verify SONA contexts created
- Verify feedback recorded
- Verify consolidation triggered
- Verify metrics collected

## Future Enhancements

1. **Adaptive Adapter Selection**
   - Switch adapters based on performance
   - Monitor quality trends
   - Automatic adapter optimization

2. **Cross-Agent Learning**
   - Share successful patterns between agents
   - Collaborative learning
   - Fleet-wide consolidation

3. **Advanced Consolidation**
   - More sophisticated triggers
   - Multi-level consolidation
   - Hierarchical pattern storage

4. **Performance Monitoring**
   - Detailed metrics dashboard
   - Learning rate visualization
   - Adapter performance tracking

## Related Files

- **Core SONA**: `src/core/strategies/SONALearningStrategy.ts`
- **Feedback Loop**: `src/learning/SONAFeedbackLoop.ts`
- **Integration Helper**: `src/agents/SONAIntegration.ts`
- **Agent Registry**: `src/mcp/services/AgentRegistry.ts`
- **Base Agent**: `src/agents/BaseAgent.ts`

## References

- [SONA Learning Strategy Documentation](../src/core/strategies/SONALearningStrategy.ts)
- [Feedback Loop Documentation](../src/learning/SONAFeedbackLoop.ts)
- [Agent Registry Documentation](../src/mcp/services/AgentRegistry.ts)
- [GitHub Issue #144 - Phase 2](https://github.com/proffesor-for-testing/agentic-qe-cf/issues/144)

---

**Generated by**: Agentic QE Fleet v2.5.4
**Implementation Date**: 2025-12-15
**Author**: Claude Opus 4.5 (Code Implementation Agent)
