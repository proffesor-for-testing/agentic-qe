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


## Code Execution Workflows

Analyze code complexity and generate refactoring recommendations.

### Code Complexity Analysis

```typescript
/**
 * Phase 3 Code Complexity Analysis Tools
 *
 * IMPORTANT: Phase 3 domain-specific tools are coming soon!
 * These examples show the REAL API that will be available.
 *
 * Import path: 'agentic-qe/tools/qe/utils'
 * Type definitions: 'agentic-qe/tools/qe/shared/types'
 */

import type {
  QEToolResponse
} from 'agentic-qe/tools/qe/shared/types';

// Phase 3 complexity analysis tools (coming soon)
// import {
//   analyzeCodeComplexity,
//   generateRefactoringRecommendations,
//   detectComplexPatterns
// } from 'agentic-qe/tools/qe/utils';

// Example: Analyze code complexity and get refactoring suggestions
const complexityParams = {
  sourceFiles: ['./src/**/*.ts'],
  metrics: ['cyclomatic', 'cognitive', 'maintainability'],
  generateRecommendations: true,
  includePatternDetection: true
};

// const analysis: QEToolResponse<any> =
//   await analyzeCodeComplexity(complexityParams);
//
// if (analysis.success && analysis.data) {
//   console.log('Code Complexity Analysis:');
//   console.log(`  Average Cyclomatic: ${analysis.data.avgCyclomatic.toFixed(2)}`);
//   console.log(`  Cognitive Complexity: ${analysis.data.cognitiveComplexity.toFixed(2)}`);
//   console.log(`  Recommendations: ${analysis.data.recommendations.length}`);
// }

console.log('✅ Code complexity analysis complete');
```

### Phase 3 Tool Discovery

```bash
# Once Phase 3 is implemented, tools will be at:
# /workspaces/agentic-qe-cf/src/mcp/tools/qe/utils/

# List available complexity tools (Phase 3)
ls node_modules/agentic-qe/dist/mcp/tools/qe/utils/
```

### Using Complexity Tools via MCP (Phase 3)

```typescript
// Phase 3 MCP integration (coming soon)
// Via CLI
// aqe complexity analyze --files ./src/**/*.ts --metrics all
// aqe complexity refactor --target ./src/complex-file.ts
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
