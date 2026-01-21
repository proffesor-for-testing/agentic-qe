# Trajectory Learning Guide

**Package:** `@agentic-qe/v3/adapters`
**Source:** `/v3/src/adapters/trajectory-adapter.ts`
**Integration:** QEReasoningBank with HNSW indexing

## Overview

The Trajectory Learning system captures browser automation sequences (trajectories) and feeds them into the QEReasoningBank for pattern learning and similarity matching. This enables the system to learn from successful test executions and suggest similar patterns for new scenarios.

---

## Concepts

### Trajectory

A **trajectory** is a sequence of browser actions with their results, timestamps, and outcome:

```typescript
interface BrowserTrajectory {
  trajectoryId: string;        // Unique identifier
  workflowType: string;        // e.g., "login-flow", "checkout"
  initialUrl: string;          // Starting URL
  steps: TrajectoryStep[];     // Sequence of actions
  outcome: 'success' | 'failure';
  duration: number;            // Total duration (ms)
  metadata?: {
    viewport?: Viewport;
    userAgent?: string;
    timestamp: number;
  };
}

interface TrajectoryStep {
  stepId: string;
  action: string;              // 'navigate', 'click', 'fill', etc.
  selector?: string;           // Target element
  value?: any;                 // Input value
  result: 'success' | 'failure';
  duration: number;            // Step duration (ms)
  screenshot?: string;         // Optional screenshot path
  error?: string;              // Error message if failed
}
```

### Pattern Types

Browser trajectories are stored as QE patterns with specialized types:

- **browser-trajectory**: Complete action sequence
- **visual-workflow**: Workflow with visual validation steps
- **security-scan**: Security-validated browsing pattern
- **viewport-strategy**: Multi-viewport testing pattern

---

## Class: TrajectoryAdapter

### Constructor

```typescript
class TrajectoryAdapter {
  constructor(
    private readonly reasoningBank: QEReasoningBank,
    private readonly config?: TrajectoryAdapterConfig
  );
}
```

**Configuration:**

```typescript
interface TrajectoryAdapterConfig {
  // Enable HNSW vector indexing
  enableHNSW?: boolean;        // Default: true

  // Maximum trajectories to store
  maxTrajectories?: number;    // Default: 10000

  // Retention period (days)
  ttlDays?: number;            // Default: 30

  // Similarity threshold (0-1)
  similarityThreshold?: number; // Default: 0.8

  // Vector embedding dimension
  embeddingDim?: number;       // Default: 384 (MiniLM)
}
```

---

### Methods

#### startTrajectory()

Begin tracking a new browser trajectory.

```typescript
async startTrajectory(
  context: BrowserContext
): Promise<string>
```

**Parameters:**

```typescript
interface BrowserContext {
  workflowType: string;        // Type of workflow
  initialUrl: string;          // Starting URL
  viewport?: Viewport;         // Viewport configuration
  userAgent?: string;          // Browser user agent
}
```

**Returns:** Trajectory ID (string)

**Example:**

```typescript
const adapter = new TrajectoryAdapter(reasoningBank);

const trajectoryId = await adapter.startTrajectory({
  workflowType: 'login-flow',
  initialUrl: 'https://example.com/login',
  viewport: { width: 1920, height: 1080 },
});

console.log('Started trajectory:', trajectoryId);
```

---

#### recordStep()

Record a step in the current trajectory.

```typescript
async recordStep(
  trajectoryId: string,
  step: TrajectoryStep
): Promise<void>
```

**Example:**

```typescript
await adapter.recordStep(trajectoryId, {
  stepId: 'step-1',
  action: 'fill',
  selector: '#username',
  value: 'user@example.com',
  result: 'success',
  duration: 150,
});

await adapter.recordStep(trajectoryId, {
  stepId: 'step-2',
  action: 'click',
  selector: 'button[type="submit"]',
  result: 'success',
  duration: 500,
});
```

---

#### completeTrajectory()

Complete a trajectory and store it in the ReasoningBank.

```typescript
async completeTrajectory(
  trajectoryId: string,
  outcome: TrajectoryOutcome
): Promise<Result<string, Error>>
```

**Parameters:**

```typescript
interface TrajectoryOutcome {
  success: boolean;            // Overall success
  error?: string;              // Error message if failed
  metrics?: {
    totalDuration: number;
    successfulSteps: number;
    failedSteps: number;
  };
}
```

**Returns:** Pattern ID in ReasoningBank

**Example:**

```typescript
const result = await adapter.completeTrajectory(trajectoryId, {
  success: true,
  metrics: {
    totalDuration: 5000,
    successfulSteps: 5,
    failedSteps: 0,
  },
});

if (result.ok) {
  console.log('Trajectory stored as pattern:', result.value);
}
```

---

#### findSimilarSuccessful()

Find similar successful trajectories for a given context.

```typescript
async findSimilarSuccessful(
  context: BrowserContext,
  options?: SimilaritySearchOptions
): Promise<BrowserTrajectory[]>
```

**Parameters:**

```typescript
interface SimilaritySearchOptions {
  topK?: number;               // Number of results (default: 5)
  minSimilarity?: number;      // Minimum similarity (default: 0.8)
  workflowType?: string;       // Filter by workflow type
  timeWindow?: number;         // Only recent trajectories (days)
}
```

**Returns:** Array of similar successful trajectories, sorted by similarity

**Example:**

```typescript
const similar = await adapter.findSimilarSuccessful({
  workflowType: 'login-flow',
  initialUrl: 'https://example.com/login',
}, {
  topK: 3,
  minSimilarity: 0.85,
  timeWindow: 7, // Last 7 days
});

for (const trajectory of similar) {
  console.log('Similar trajectory:', trajectory.trajectoryId);
  console.log('Success rate:', trajectory.metadata.successRate);
  console.log('Steps:', trajectory.steps.map(s => s.action));
}
```

---

#### extractActionSequences()

Extract reusable action sequences from multiple trajectories.

```typescript
async extractActionSequences(
  trajectories: BrowserTrajectory[]
): Promise<ActionSequence[]>
```

**Returns:**

```typescript
interface ActionSequence {
  pattern: string;             // Action pattern (e.g., "fill -> click -> wait")
  frequency: number;           // How often it appears
  successRate: number;         // Success rate (0-1)
  examples: TrajectoryStep[][];// Example step sequences
}
```

**Example:**

```typescript
const trajectories = await adapter.getAllTrajectories({
  workflowType: 'login-flow',
  successOnly: true,
});

const sequences = await adapter.extractActionSequences(trajectories);

for (const seq of sequences) {
  console.log('Pattern:', seq.pattern);
  console.log('Frequency:', seq.frequency);
  console.log('Success rate:', seq.successRate);
}

// Output:
// Pattern: "fill -> fill -> click"
// Frequency: 15
// Success rate: 0.93
```

---

#### getTrajectoryStats()

Get statistics about stored trajectories.

```typescript
async getTrajectoryStats(): Promise<TrajectoryStats>
```

**Returns:**

```typescript
interface TrajectoryStats {
  total: number;
  successful: number;
  failed: number;
  byWorkflowType: Record<string, number>;
  avgDuration: number;
  avgStepsPerTrajectory: number;
  storageSize: number;         // Bytes
}
```

**Example:**

```typescript
const stats = await adapter.getTrajectoryStats();

console.log('Total trajectories:', stats.total);
console.log('Success rate:', stats.successful / stats.total);
console.log('Avg duration:', stats.avgDuration, 'ms');
console.log('Storage:', (stats.storageSize / 1024 / 1024).toFixed(2), 'MB');
```

---

## Integration with QEReasoningBank

### Pattern Storage

Trajectories are converted to QE patterns and stored with HNSW vector indexing:

```typescript
// Internal conversion (handled by TrajectoryAdapter)
const pattern: CreateQEPatternOptions = {
  patternType: 'browser-trajectory',
  name: `${trajectory.workflowType}-${trajectory.trajectoryId}`,
  description: `Browser trajectory for ${trajectory.workflowType}`,
  template: {
    type: 'trajectory',
    content: JSON.stringify(trajectory.steps),
    variables: [],
  },
  context: {
    tags: ['browser', 'trajectory', trajectory.workflowType],
    browserContext: {
      initialUrl: trajectory.initialUrl,
      workflowType: trajectory.workflowType,
    },
    metrics: {
      successRate: trajectory.outcome === 'success' ? 1.0 : 0.0,
      usageCount: 1,
      avgDuration: trajectory.duration,
    },
  },
};

await reasoningBank.storePattern(pattern);
```

### Similarity Matching

The adapter uses HNSW indexing for fast similarity search (<100ms p95):

```typescript
// Generate embedding for current context
const contextEmbedding = await embedder.embed(
  `${context.workflowType} ${context.initialUrl}`
);

// Search for similar patterns
const similar = await reasoningBank.searchPatterns({
  embedding: contextEmbedding,
  topK: 5,
  threshold: 0.8,
  filters: {
    patternType: 'browser-trajectory',
    'context.browserContext.workflowType': context.workflowType,
  },
});
```

---

## Practical Examples

### Example 1: Learning from Login Flows

```typescript
import { TrajectoryAdapter } from '@agentic-qe/v3/adapters';
import { QEReasoningBank } from '@agentic-qe/v3/learning-optimization';

const bank = new QEReasoningBank();
const adapter = new TrajectoryAdapter(bank);

// Test different login implementations
const sites = [
  'https://example1.com/login',
  'https://example2.com/login',
  'https://example3.com/signin',
];

for (const site of sites) {
  const trajId = await adapter.startTrajectory({
    workflowType: 'login-flow',
    initialUrl: site,
  });

  // Execute login steps
  await adapter.recordStep(trajId, {
    stepId: '1',
    action: 'fill',
    selector: 'input[name="email"]',
    value: 'user@example.com',
    result: 'success',
    duration: 100,
  });

  await adapter.recordStep(trajId, {
    stepId: '2',
    action: 'fill',
    selector: 'input[name="password"]',
    value: 'password',
    result: 'success',
    duration: 80,
  });

  await adapter.recordStep(trajId, {
    stepId: '3',
    action: 'click',
    selector: 'button[type="submit"]',
    result: 'success',
    duration: 500,
  });

  await adapter.completeTrajectory(trajId, { success: true });
}

// Now find similar patterns for a new site
const suggestions = await adapter.findSimilarSuccessful({
  workflowType: 'login-flow',
  initialUrl: 'https://newsite.com/login',
}, {
  topK: 3,
});

console.log('Suggested approach based on similar sites:');
for (const traj of suggestions) {
  console.log('Steps:', traj.steps.map(s => `${s.action}(${s.selector})`));
}
```

---

### Example 2: Detecting Common Patterns

```typescript
// Collect many trajectories
const trajectories = await adapter.getAllTrajectories({
  workflowType: 'checkout-flow',
  successOnly: true,
  limit: 100,
});

// Extract common sequences
const sequences = await adapter.extractActionSequences(trajectories);

// Identify most reliable patterns
const reliable = sequences.filter(seq => seq.successRate > 0.95);

console.log('Highly reliable patterns:');
for (const pattern of reliable) {
  console.log(`${pattern.pattern} - ${pattern.frequency} times, ${(pattern.successRate * 100).toFixed(1)}% success`);
}

// Output:
// fill -> fill -> click - 87 times, 97.2% success
// navigate -> waitFor -> fill - 65 times, 95.8% success
```

---

### Example 3: Adaptive Test Generation

```typescript
async function generateAdaptiveTest(url: string, workflowType: string) {
  const adapter = new TrajectoryAdapter(bank);

  // Find similar successful trajectories
  const similar = await adapter.findSimilarSuccessful({
    workflowType,
    initialUrl: url,
  }, {
    topK: 5,
    minSimilarity: 0.85,
  });

  if (similar.length === 0) {
    console.log('No similar trajectories found, using default approach');
    return defaultTest(url, workflowType);
  }

  // Use most successful trajectory as template
  const best = similar.sort((a, b) =>
    b.metadata.successRate - a.metadata.successRate
  )[0];

  console.log(`Using trajectory ${best.trajectoryId} as template (${(best.metadata.successRate * 100).toFixed(1)}% success rate)`);

  // Generate test based on trajectory steps
  const test = {
    name: `${workflowType} test for ${url}`,
    steps: best.steps.map(step => ({
      action: step.action,
      selector: step.selector,
      value: step.value,
    })),
  };

  return test;
}

// Usage
const test = await generateAdaptiveTest(
  'https://newapp.com/checkout',
  'checkout-flow'
);
```

---

## Performance Considerations

### Memory Usage

| Storage Size | Trajectories | Memory Usage |
|-------------|--------------|--------------|
| 1K | 100 | ~50 MB |
| 10K (default) | 1,000 | ~500 MB |
| 100K | 10,000 | ~5 GB |

**Recommendation:** For long-running systems, configure retention:

```typescript
const adapter = new TrajectoryAdapter(bank, {
  maxTrajectories: 5000,
  ttlDays: 7,  // Only keep last 7 days
});
```

### Search Performance

| Operation | Latency (p95) | Method |
|-----------|---------------|--------|
| Start trajectory | <5ms | In-memory |
| Record step | <10ms | In-memory |
| Complete trajectory | <50ms | Write to DB |
| Find similar (HNSW) | <100ms | Vector search |
| Find similar (linear) | <250ms | Brute-force |

**Optimization:** HNSW indexing provides 2.5x speedup for similarity search.

---

## Learning Feedback

### Recording Outcome

```typescript
// After executing a test based on trajectory suggestion
const suggested = await adapter.findSimilarSuccessful(context);
const trajectoryId = suggested[0].trajectoryId;

// Test succeeded - positive feedback
await adapter.recordFeedback(trajectoryId, {
  useful: true,
  context,
  outcome: 'success',
});

// Test failed - negative feedback
await adapter.recordFeedback(trajectoryId, {
  useful: false,
  context,
  outcome: 'failure',
  reason: 'Selector changed, pattern outdated',
});
```

### Adaptive Scoring

The system adjusts pattern scores based on feedback:

```typescript
interface FeedbackMetrics {
  totalSuggestions: number;    // How many times suggested
  successfulUses: number;      // How many times worked
  failedUses: number;          // How many times failed
  confidenceScore: number;     // Current confidence (0-1)
  lastUpdated: number;         // Timestamp
}

// Score decays over time for unused patterns
// Score increases with successful reuse
// Score decreases with failed reuse
```

---

## Debugging

### Trajectory Visualization

```typescript
// Get detailed trajectory information
const trajectory = await adapter.getTrajectory(trajectoryId);

console.log('Trajectory:', trajectory.trajectoryId);
console.log('Workflow:', trajectory.workflowType);
console.log('Duration:', trajectory.duration, 'ms');
console.log('Steps:');

for (const step of trajectory.steps) {
  const icon = step.result === 'success' ? '✓' : '✗';
  console.log(`  ${icon} ${step.action} ${step.selector} (${step.duration}ms)`);
}
```

### Pattern Analysis

```typescript
// Analyze pattern effectiveness
const analysis = await adapter.analyzePattern(patternId);

console.log('Pattern effectiveness:');
console.log('  Total uses:', analysis.totalUses);
console.log('  Success rate:', (analysis.successRate * 100).toFixed(1), '%');
console.log('  Avg duration:', analysis.avgDuration, 'ms');
console.log('  Confidence:', (analysis.confidence * 100).toFixed(1), '%');
console.log('  Similar patterns:', analysis.similarPatterns.length);
```

---

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { TrajectoryAdapter } from './trajectory-adapter';
import { QEReasoningBank } from '../learning-optimization';

describe('TrajectoryAdapter', () => {
  it('should store and retrieve trajectories', async () => {
    const bank = new QEReasoningBank();
    const adapter = new TrajectoryAdapter(bank);

    const trajId = await adapter.startTrajectory({
      workflowType: 'test-flow',
      initialUrl: 'https://example.com',
    });

    await adapter.recordStep(trajId, {
      stepId: '1',
      action: 'click',
      selector: '#button',
      result: 'success',
      duration: 100,
    });

    const result = await adapter.completeTrajectory(trajId, {
      success: true,
    });

    expect(result.ok).toBe(true);

    const similar = await adapter.findSimilarSuccessful({
      workflowType: 'test-flow',
      initialUrl: 'https://example.com',
    });

    expect(similar).toHaveLength(1);
    expect(similar[0].trajectoryId).toBe(trajId);
  });
});
```

---

## See Also

- [Main Integration Guide](../integration/claude-flow-browser.md)
- [QEReasoningBank Documentation](../learning/reasoning-bank.md)
- [Workflow Templates](./workflow-templates.md)
- [Pattern Learning Guide](../guides/pattern-learning.md)
