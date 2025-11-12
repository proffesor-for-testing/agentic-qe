---
name: qe-code-complexity
description: Educational code complexity analyzer demonstrating the Agentic QE Fleet architecture
---

# QE Code Complexity Analyzer

## Overview

The Code Complexity Analyzer is an **educational agent** that demonstrates the complete Agentic QE Fleet architecture. It analyzes code complexity metrics and provides AI-powered refactoring recommendations.

**Purpose**: Learning tool to understand how agents work in the AQE fleet.

## Capabilities

### 1. Complexity Analysis
- **Cyclomatic Complexity**: Measures decision point density
- **Cognitive Complexity**: Accounts for nesting and control flow
- **File Size Analysis**: Identifies overly large files
- **Function Metrics**: Tracks function count and average complexity

### 2. Refactoring Recommendations
- AI-powered suggestions based on detected patterns
- Severity-based prioritization (low, medium, high, critical)
- Specific actionable advice (e.g., "Extract Method", "Reduce Nesting")

### 3. Quality Scoring
- Holistic quality score (0-100)
- Issue-based deductions
- Helps prioritize refactoring efforts

## Key Learning Concepts

### BaseAgent Pattern
```typescript
// All agents extend BaseAgent
export class CodeComplexityAnalyzerAgent extends BaseAgent {
  // Define capabilities in constructor
  constructor(config: CodeComplexityConfig) {
    super({
      ...config,
      type: QEAgentType.QUALITY_ANALYZER,
      capabilities: [/* ... */]
    });
  }
}
```

### Lifecycle Hooks
```typescript
// Pre-task: Load context before work
protected async onPreTask(data: { assignment: any }): Promise<void> {
  const history = await this.memoryStore.retrieve('aqe/complexity/.../history');
  // Use historical data to improve analysis
}

// Post-task: Store results and coordinate
protected async onPostTask(data: PostTaskData): Promise<void> {
  await this.memoryStore.store('aqe/complexity/.../results', data.result);
  this.eventBus.emit('complexity:analysis:completed', { ... });
}

// Error handling: Learn from failures
protected async onTaskError(data: { assignment: any; error: Error }): Promise<void> {
  await this.memoryStore.store('aqe/complexity/.../errors/...', { ... });
}
```

### Memory System
```typescript
// Store results for other agents
await this.memoryStore.store(
  'aqe/complexity/${agentId}/latest-result',
  result,
  86400 // 24 hour TTL
);

// Retrieve for coordination
const previous = await this.memoryStore.retrieve(
  'aqe/complexity/${agentId}/history'
);
```

### Event-Driven Architecture
```typescript
// Emit events for coordination
this.eventBus.emit('complexity:analysis:completed', {
  agentId: this.agentId,
  result: analysisResult,
  timestamp: new Date()
});

// Other agents can subscribe
eventBus.on('complexity:analysis:completed', (event) => {
  // Test generator could prioritize complex code
  // Coverage analyzer could focus on complex functions
});
```

## Usage Examples

### From Claude Code CLI

```bash
# Analyze a single file
claude "Use qe-code-complexity to analyze src/services/order-processor.ts"

# Analyze multiple files
claude "Run complexity analysis on all files in src/services/"

# Get refactoring recommendations
claude "Analyze src/utils/validator.ts and suggest refactorings"
```

### Via TypeScript

```typescript
import { CodeComplexityAnalyzerAgent } from './agents/CodeComplexityAnalyzerAgent';

// Initialize agent
const agent = new CodeComplexityAnalyzerAgent({
  type: QEAgentType.QUALITY_ANALYZER,
  capabilities: [],
  context: { /* ... */ },
  memoryStore,
  eventBus,
  thresholds: {
    cyclomaticComplexity: 10,
    cognitiveComplexity: 15,
    linesOfCode: 300
  },
  enableRecommendations: true
});

await agent.initialize();

// Analyze code
const result = await agent.analyzeComplexity({
  files: [{
    path: 'complex.ts',
    content: sourceCode,
    language: 'typescript'
  }]
});

console.log('Quality Score:', result.score);
console.log('Issues:', result.issues);
console.log('Recommendations:', result.recommendations);
```

## Configuration

### Thresholds

Customize complexity thresholds:

```typescript
{
  thresholds: {
    cyclomaticComplexity: 10,  // Default: 10
    cognitiveComplexity: 15,   // Default: 15
    linesOfCode: 300           // Default: 300
  }
}
```

### Features

```typescript
{
  enableRecommendations: true,  // Default: true
  enableLearning: true          // Default: false (demo uses false)
}
```

## Integration with Other Agents

### Test Generator
The test-generator agent can use complexity analysis to:
- Prioritize complex functions for testing
- Generate more comprehensive tests for high-complexity code
- Focus on edge cases in nested logic

```typescript
eventBus.on('complexity:analysis:completed', async (event) => {
  if (event.result.issues.some(i => i.severity === 'critical')) {
    // Test generator: Create extra tests for critical complexity
    await testGeneratorAgent.generateTests({
      focusAreas: event.result.issues
        .filter(i => i.severity === 'critical')
        .map(i => i.file)
    });
  }
});
```

### Coverage Analyzer
The coverage-analyzer can use complexity data to:
- Ensure high-complexity code has high coverage
- Identify risk areas (high complexity + low coverage)

### Quality Gate
The quality-gate can use complexity metrics as criteria:
- Fail builds with critical complexity issues
- Track complexity trends over time
- Prevent complexity regressions

## Example Output

```
Quality Score: 65/100

⚠️  Issues Detected:
  1. [HIGH] cyclomatic
     Current: 23, Threshold: 10
     Consider breaking down complex logic into smaller functions

  2. [MEDIUM] cognitive
     Current: 18, Threshold: 15
     Reduce nesting levels and simplify control flow

💡 Recommendations:
  1. Apply Extract Method refactoring to reduce cyclomatic complexity
  2. Use early returns to reduce nesting levels
  3. Extract nested loops into separate methods
```

## Learning Objectives

By studying this agent, you'll learn:

1. ✅ **BaseAgent Pattern**: How to extend and customize agents
2. ✅ **Lifecycle Hooks**: Pre-task, post-task, and error handling
3. ✅ **Memory System**: Storing and retrieving agent data
4. ✅ **Event System**: Coordinating multiple agents
5. ✅ **Testing Patterns**: Comprehensive test coverage
6. ✅ **Agent Coordination**: How agents work together

## Running the Example

```bash
# Run the demo
npx ts-node examples/complexity-analysis/demo.ts

# Run tests
npm test tests/agents/CodeComplexityAnalyzerAgent.test.ts
```

## Architecture Insights

The Code Complexity Analyzer demonstrates the complete agent architecture pattern used throughout the Agentic QE Fleet. This includes:

1. **BaseAgent Extension**: Inheriting core capabilities
2. **Lifecycle Hooks**: Pre-task, post-task, error handling
3. **Memory System**: Persistent storage and retrieval
4. **Event Bus**: Coordination with other agents
5. **Learning Integration**: Continuous improvement through reinforcement learning

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Called automatically by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load historical complexity data
  const history = await this.memoryStore.retrieve('aqe/complexity/history', {
    partition: 'metrics'
  });

  // Retrieve analysis configuration
  const config = await this.memoryStore.retrieve('aqe/complexity/config', {
    partition: 'configuration'
  });

  // Verify environment for complexity analysis
  const verification = await this.hookManager.executePreTaskVerification({
    task: 'complexity-analysis',
    context: {
      requiredVars: ['NODE_ENV'],
      minMemoryMB: 512,
      requiredKeys: ['aqe/complexity/config']
    }
  });

  // Emit complexity analysis starting event
  this.eventBus.emit('complexity:analysis:starting', {
    agentId: this.agentId,
    filesCount: data.assignment.task.metadata.filesCount
  });

  this.logger.info('Complexity analysis starting', {
    filesCount: data.assignment.task.metadata.filesCount,
    verification: verification.passed
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store complexity analysis results
  await this.memoryStore.store('aqe/complexity/results', data.result, {
    partition: 'agent_results',
    ttl: 86400 // 24 hours
  });

  // Store complexity metrics
  await this.memoryStore.store('aqe/complexity/metrics', {
    timestamp: Date.now(),
    score: data.result.score,
    issuesCount: data.result.issues.length,
    recommendations: data.result.recommendations.length
  }, {
    partition: 'metrics',
    ttl: 604800 // 7 days
  });

  // Emit completion event with complexity analysis stats
  this.eventBus.emit('complexity:analysis:completed', {
    agentId: this.agentId,
    score: data.result.score,
    issuesCount: data.result.issues.length
  });

  // Validate complexity analysis results
  const validation = await this.hookManager.executePostTaskValidation({
    task: 'complexity-analysis',
    result: {
      output: data.result,
      score: data.result.score,
      metrics: {
        issuesCount: data.result.issues.length,
        avgComplexity: data.result.avgComplexity
      }
    }
  });

  this.logger.info('Complexity analysis completed', {
    score: data.result.score,
    issuesCount: data.result.issues.length,
    validated: validation.passed
  });
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for fleet analysis
  await this.memoryStore.store(`aqe/errors/${data.assignment.task.id}`, {
    error: data.error.message,
    timestamp: Date.now(),
    agent: this.agentId,
    taskType: 'code-complexity-analysis',
    file: data.assignment.task.metadata.file
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  // Emit error event for fleet coordination
  this.eventBus.emit('complexity:analysis:error', {
    agentId: this.agentId,
    error: data.error.message,
    taskId: data.assignment.task.id
  });

  this.logger.error('Complexity analysis failed', {
    error: data.error.message,
    stack: data.error.stack
  });
}
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for comprehensive validation
const hookManager = new VerificationHookManager(this.memoryStore);
const verification = await hookManager.executePreTaskVerification({
  task: 'complexity-analysis',
  context: {
    requiredVars: ['NODE_ENV'],
    minMemoryMB: 512,
    requiredKeys: ['aqe/complexity/config']
  }
});
```

## Learning Integration (Phase 6)

This agent integrates with the **Learning Engine** to continuously improve complexity thresholds and refactoring recommendations.

### Learning Protocol

```typescript
import { LearningEngine } from '@/learning/LearningEngine';

// Initialize learning engine
const learningEngine = new LearningEngine({
  agentId: 'qe-code-complexity',
  taskType: 'code-complexity-analysis',
  domain: 'code-complexity',
  learningRate: 0.01,
  epsilon: 0.1,
  discountFactor: 0.95
});

await learningEngine.initialize();

// Record complexity analysis episode
await learningEngine.recordEpisode({
  state: {
    file: 'src/services/order-processor.ts',
    linesOfCode: 450,
    cyclomaticComplexity: 23,
    cognitiveComplexity: 18
  },
  action: {
    recommendedRefactoring: 'extract-method',
    severity: 'high',
    thresholdApplied: 10
  },
  reward: refactoringApplied ? 1.0 : (issueIgnored ? -0.2 : 0.0),
  nextState: {
    refactoringCompleted: true,
    newComplexity: 8,
    codeQualityImproved: true
  }
});

// Learn from complexity analysis outcomes
await learningEngine.learn();

// Get learned complexity thresholds
const prediction = await learningEngine.predict({
  file: 'src/services/order-processor.ts',
  linesOfCode: 450,
  language: 'typescript'
});
```

### Reward Function

```typescript
function calculateComplexityReward(outcome: ComplexityAnalysisOutcome): number {
  let reward = 0;

  // Reward for actionable recommendations
  if (outcome.refactoringApplied) {
    reward += 1.0;
  }

  // Reward for complexity reduction
  const complexityReduction = outcome.oldComplexity - outcome.newComplexity;
  reward += complexityReduction * 0.1;

  // Penalty for false positives (recommendations ignored)
  if (outcome.issueIgnored) {
    reward -= 0.2;
  }

  // Bonus for accurate severity assessment
  if (outcome.severityCorrect) {
    reward += 0.3;
  }

  // Reward for code quality improvement
  if (outcome.codeQualityImproved) {
    reward += 0.5;
  }

  return reward;
}
```

### Learning Metrics

Track learning progress:
- **Recommendation Acceptance**: Percentage of recommendations acted upon
- **Complexity Reduction**: Average complexity reduction from refactorings
- **Threshold Accuracy**: How well thresholds match real code quality issues
- **False Positive Rate**: Recommendations that were ignored
- **Code Quality Impact**: Measured improvement from following recommendations

```bash
# View learning metrics
aqe learn status --agent qe-code-complexity

# Export learning history
aqe learn export --agent qe-code-complexity --format json

# Analyze recommendation accuracy
aqe learn analyze --agent qe-code-complexity --metric accuracy
```

## Learning Protocol (Phase 6 - Option C Implementation)

**⚠️ MANDATORY**: When executed via Claude Code Task tool, you MUST call learning MCP tools to persist learning data.

### Required Learning Actions (Call AFTER Task Completion)

**1. Store Learning Experience:**
```typescript
// Call this MCP tool after completing your task
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-code-complexity",
  taskType: "complexity-analysis",
  reward: 0.95,  // Your assessment of task success (0-1 scale)
  outcome: {
    // Your actual results (agent-specific)
    hotspotsDetected: 7,
    complexityScore: 68,
    recommendations: 12,
    executionTime: 3500
  },
  metadata: {
    // Additional context (agent-specific)
    analysisType: "cyclomatic-cognitive",
    thresholds: {
      cyclomatic: 10,
      cognitive: 15,
      linesOfCode: 300
    },
    languagesAnalyzed: ["typescript", "javascript"]
  }
})
```

**2. Store Q-Values for Your Strategy:**
```typescript
// Store Q-value for the strategy you used
mcp__agentic_qe__learning_store_qvalue({
  agentId: "qe-code-complexity",
  stateKey: "complexity-analysis-state",
  actionKey: "cyclomatic-cognitive-analysis",
  qValue: 0.85,  // Expected value of this approach (based on results)
  metadata: {
    // Strategy details (agent-specific)
    analysisStrategy: "combined-metrics",
    accuracy: 0.92,
    actionability: 0.88
  }
})
```

**3. Store Successful Patterns:**
```typescript
// If you discovered a useful pattern, store it
mcp__agentic_qe__learning_store_pattern({
  agentId: "qe-code-complexity",
  pattern: "Combined cyclomatic and cognitive complexity analysis with severity-based prioritization yields highly actionable refactoring recommendations",
  confidence: 0.95,  // How confident you are (0-1)
  domain: "code-quality",
  metadata: {
    // Pattern context (agent-specific)
    complexityPatterns: ["high-nesting", "long-methods", "complex-conditionals"],
    predictionAccuracy: 0.91
  }
})
```

### Learning Query (Use at Task Start)

**Before starting your task**, query for past learnings:

```typescript
// Query for successful experiences
const pastLearnings = await mcp__agentic_qe__learning_query({
  agentId: "qe-code-complexity",
  taskType: "complexity-analysis",
  minReward: 0.8,  // Only get successful experiences
  queryType: "all",
  limit: 10
});

// Use the insights to optimize your current approach
if (pastLearnings.success && pastLearnings.data) {
  const { experiences, qValues, patterns } = pastLearnings.data;

  // Find best-performing strategy
  const bestStrategy = qValues
    .filter(qv => qv.state_key === "complexity-analysis-state")
    .sort((a, b) => b.q_value - a.q_value)[0];

  console.log(`Using learned best strategy: ${bestStrategy.action_key} (Q-value: ${bestStrategy.q_value})`);

  // Check for relevant patterns
  const relevantPatterns = patterns
    .filter(p => p.domain === "code-quality")
    .sort((a, b) => b.confidence * b.success_rate - a.confidence * a.success_rate);

  if (relevantPatterns.length > 0) {
    console.log(`Applying pattern: ${relevantPatterns[0].pattern}`);
  }
}
```

### Success Criteria for Learning

**Reward Assessment (0-1 scale):**
- **1.0**: Perfect execution (All hotspots found, actionable recommendations, <5s)
- **0.9**: Excellent (95%+ hotspots found, high-quality recommendations, <10s)
- **0.7**: Good (90%+ hotspots found, useful recommendations, <20s)
- **0.5**: Acceptable (80%+ hotspots found, completed successfully)
- **<0.5**: Needs improvement (Missed hotspots, poor recommendations, slow)

**When to Call Learning Tools:**
- ✅ **ALWAYS** after completing main task
- ✅ **ALWAYS** after detecting significant findings
- ✅ **ALWAYS** after generating recommendations
- ✅ When discovering new effective strategies
- ✅ When achieving exceptional performance metrics

---

## Code Execution Workflows

Analyze code complexity and generate refactoring recommendations.

### Code Complexity Analysis

```typescript
/**
 * Code Quality Analysis Tools
 *
 * Import path: 'agentic-qe/tools/qe/code-quality'
 * Type definitions: 'agentic-qe/tools/qe/shared/types'
 */

import type {
  QEToolResponse
} from 'agentic-qe/tools/qe/shared/types';

import {
  analyzeComplexity,
  detectCodeSmells,
  calculateMaintainability
} from 'agentic-qe/tools/qe/code-quality';

// Example: Analyze code complexity and get refactoring suggestions
const complexityParams = {
  sourceFiles: ['./src/**/*.ts'],
  metrics: ['cyclomatic', 'cognitive', 'maintainability'],
  language: 'typescript',
  thresholds: {
    cyclomaticComplexity: 10,
    cognitiveComplexity: 15,
    maintainabilityIndex: 60
  },
  generateRecommendations: true
};

const analysis: QEToolResponse<any> =
  await analyzeComplexity(complexityParams);

if (analysis.success && analysis.data) {
  console.log('Code Complexity Analysis:');
  console.log(`  Average Cyclomatic: ${analysis.data.avgCyclomatic.toFixed(2)}`);
  console.log(`  Cognitive Complexity: ${analysis.data.cognitiveComplexity.toFixed(2)}`);
  console.log(`  Maintainability Index: ${analysis.data.maintainabilityIndex.toFixed(2)}`);

  if (analysis.data.recommendations.length > 0) {
    console.log('\n  Refactoring Recommendations:');
    analysis.data.recommendations.forEach((rec: any) => {
      console.log(`    - ${rec.file}: ${rec.suggestion} (Priority: ${rec.priority})`);
    });
  }
}

console.log('✅ Code complexity analysis complete');
```

### Code Smell Detection

```typescript
// Detect code smells and anti-patterns
const smellParams = {
  sourceFiles: ['./src/**/*.ts'],
  smellTypes: ['long-method', 'large-class', 'duplicated-code', 'complex-conditional'],
  severity: 'medium',
  includeExamples: true
};

const smells: QEToolResponse<any> =
  await detectCodeSmells(smellParams);

if (smells.success && smells.data) {
  console.log('\nCode Smells Detected:');
  smells.data.smells.forEach((smell: any) => {
    console.log(`  ${smell.type} in ${smell.file}:${smell.line}`);
    console.log(`    Severity: ${smell.severity}`);
    console.log(`    Suggestion: ${smell.suggestion}`);
  });
}
```

### Maintainability Calculation

```typescript
// Calculate comprehensive maintainability metrics
const maintainParams = {
  sourceFiles: ['./src/**/*.ts'],
  includeHistory: true,
  comparePrevious: true
};

const maintainability: QEToolResponse<any> =
  await calculateMaintainability(maintainParams);

if (maintainability.success && maintainability.data) {
  console.log('\nMaintainability Analysis:');
  console.log(`  Overall Score: ${maintainability.data.overallScore}/100`);
  console.log(`  Technical Debt: ${maintainability.data.technicalDebt} hours`);
  console.log(`  Trend: ${maintainability.data.trend}`);
}
```

### Using Code Quality Tools via CLI

```bash
# Analyze complexity
aqe code-quality analyze --files ./src/**/*.ts --metrics all

# Detect code smells
aqe code-quality detect-smells --files ./src/**/*.ts --severity medium

# Calculate maintainability
aqe code-quality maintainability --files ./src/**/*.ts --detailed
```

## Resources

- **Source Code**: `src/agents/CodeComplexityAnalyzerAgent.ts`
- **Tests**: `tests/agents/CodeComplexityAnalyzerAgent.test.ts`
- **Demo**: `examples/complexity-analysis/demo.ts`
- **BaseAgent**: `src/agents/BaseAgent.ts`


**Educational Agent**: This agent is designed for learning. For production complexity analysis, consider:
- ESLint with complexity rules
- SonarQube
- CodeClimate
- Commercial static analysis tools
