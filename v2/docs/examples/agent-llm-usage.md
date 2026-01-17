# Agent LLM Usage Examples

Phase 1.2.3: Examples demonstrating how QE agents use the IAgentLLM abstraction for LLM independence.

## Overview

The `IAgentLLM` interface provides a simple, agent-friendly API that abstracts away LLM provider complexity. Agents can switch between RuvLLM (local), Claude API, OpenRouter, Ollama, or HybridRouter without code changes.

**Key Pattern**: Agents use `this.getAgentLLM()` which returns `IAgentLLM | undefined`. Always check for undefined before using.

## Basic Usage

### 1. Simple Completion (TestGeneratorAgent)

```typescript
import { BaseAgent } from '../agents/BaseAgent';

class TestGeneratorAgent extends BaseAgent {
  private async generateTestsWithLLM(prompt: string): Promise<string> {
    // Phase 1.2.3: Use getAgentLLM() for provider-independent LLM calls
    const llm = this.getAgentLLM();
    if (!llm) {
      throw new Error('LLM not available for test generation');
    }

    const testCode = await llm.complete(prompt, {
      complexity: 'moderate',
      maxTokens: 2048,
      temperature: 0.2,  // Lower temperature for code generation
    });

    return testCode;
  }
}
```

### 2. Optional LLM Enhancement (CoverageAnalyzerAgent)

```typescript
class CoverageAnalyzerAgent extends BaseAgent {
  /**
   * Generate AI-powered test suggestions (optional enhancement)
   * Falls back to defaults if LLM unavailable
   */
  private async generateTestSuggestions(prediction: any): Promise<string[]> {
    const llm = this.getAgentLLM();

    // Graceful fallback when LLM unavailable
    if (llm && prediction?.gap) {
      try {
        const prompt = `Suggest 3 specific test cases for coverage gap in "${prediction.gap}".
Output as JSON array of strings.`;

        const response = await llm.complete(prompt, {
          complexity: 'simple',
          maxTokens: 256,
          temperature: 0.3,
        });

        // Parse JSON array from response
        const match = response.match(/\[[\s\S]*?\]/);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch {
        // Fall through to default
      }
    }

    // Default suggestions when LLM unavailable
    return ['suggested-test-1', 'suggested-test-2'];
  }
}
```

### 3. Code Intelligence with LLM (CodeIntelligenceAgent)

```typescript
class CodeIntelligenceAgent extends BaseAgent {
  /**
   * Generate AI summary of search results
   * Returns undefined if LLM unavailable (non-blocking)
   */
  private async generateSearchSummary(query: string, result: QueryResult): Promise<string | undefined> {
    const llm = this.getAgentLLM();
    if (!llm || result.results.length === 0) {
      return undefined;
    }

    try {
      const topResults = result.results.slice(0, 5);
      const resultsContext = topResults
        .map((r, i) => `${i + 1}. ${r.entityName || r.filePath}:${r.startLine}-${r.endLine}`)
        .join('\n');

      const prompt = `Summarize these code search results for query "${query}" in 2-3 sentences:
${resultsContext}

Summary:`;

      const response = await llm.complete(prompt, {
        complexity: 'simple',
        maxTokens: 150,
        temperature: 0.3,
      });

      return response.trim();
    } catch (error) {
      // Log and continue without summary
      this.logger.debug(`LLM search summary failed: ${(error as Error).message}`);
      return undefined;
    }
  }
}
```

### 4. N8n Workflow Analysis (N8nBaseAgent)

```typescript
/**
 * N8nBaseAgent provides LLM methods that all 15 n8n testing agents inherit
 */
abstract class N8nBaseAgent extends BaseAgent {
  /**
   * Analyze workflow with LLM for insights
   * Child agents (N8nSecurityAuditor, N8nPerformanceTester, etc.) can call this
   */
  protected async analyzeWorkflowWithLLM(
    workflow: N8nWorkflow,
    analysisType: 'complexity' | 'optimization' | 'security' | 'general' = 'general'
  ): Promise<string | undefined> {
    const llm = this.getAgentLLM();
    if (!llm) {
      return undefined;
    }

    try {
      const nodeTypes = this.getNodeTypes(workflow);
      const triggers = this.getTriggerNodes(workflow);

      const workflowSummary = `
Workflow: ${workflow.name || workflow.id}
Nodes: ${workflow.nodes.length} (types: ${nodeTypes.slice(0, 5).join(', ')})
Triggers: ${triggers.map(t => t.type).join(', ') || 'none'}
Active: ${workflow.active}`;

      const prompts: Record<string, string> = {
        complexity: `Assess the complexity of this n8n workflow in 2-3 sentences:\n${workflowSummary}`,
        optimization: `Suggest 2-3 optimizations for this n8n workflow:\n${workflowSummary}`,
        security: `Identify potential security concerns (2-3 points):\n${workflowSummary}`,
        general: `Summarize this n8n workflow's purpose in 2-3 sentences:\n${workflowSummary}`,
      };

      const response = await llm.complete(prompts[analysisType], {
        complexity: 'simple',
        maxTokens: 200,
        temperature: 0.3,
      });

      return response.trim();
    } catch {
      return undefined;
    }
  }
}
```

## Advanced Usage

### 5. Streaming for Long Responses

```typescript
class DocumentationAgent extends BaseAgent {
  async generateDocumentation(codebase: string): Promise<void> {
    const llm = this.getAgentLLM();
    if (!llm) {
      throw new Error('LLM required for documentation generation');
    }

    const prompt = `Generate comprehensive API documentation:\n\n${codebase}`;

    let documentation = '';

    // Stream response for better UX with long outputs
    for await (const chunk of llm.streamComplete(prompt, {
      complexity: 'very_complex',
      maxTokens: 8000,
    })) {
      documentation += chunk;
      process.stdout.write(chunk); // Real-time output
    }

    await this.saveDocumentation(documentation);
  }
}
```

### 6. Error Handling with Graceful Degradation

```typescript
import { AgentLLMError, isAgentLLMError } from '../agents/interfaces/IAgentLLM';

class RobustAgent extends BaseAgent {
  async performTask(input: string): Promise<string> {
    const llm = this.getAgentLLM();

    // Check if LLM is available
    if (!llm) {
      return this.algorithmicFallback(input);
    }

    try {
      if (await llm.isHealthy()) {
        return await llm.complete(input, { complexity: 'simple' });
      }
    } catch (error) {
      if (isAgentLLMError(error)) {
        console.warn(`LLM failed (${error.code}): ${error.message}`);

        if (error.retryable) {
          // Retry if transient error
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await llm.complete(input);
        }
      }
    }

    // Fallback to algorithmic approach
    return this.algorithmicFallback(input);
  }
}
```

### 7. Model Selection

```typescript
class MultiModelAgent extends BaseAgent {
  async initialize(): Promise<void> {
    await super.initialize();

    const llm = this.getAgentLLM();
    if (!llm) return;

    // Check available models
    const models = await llm.getAvailableModels();
    console.log('Available models:', models.map(m => m.name));

    // Switch to most appropriate model for task
    const best = models.find(m =>
      m.capabilities.maxTokens >= 8000 &&
      m.provider === 'local' // Prefer local for privacy
    );

    if (best) {
      await llm.switchModel(best.id);
      console.log(`Using model: ${best.name}`);
    }
  }
}
```

### 8. Usage Statistics Tracking

```typescript
class MetricsAwareAgent extends BaseAgent {
  async performBatch(tasks: string[]): Promise<void> {
    const llm = this.getAgentLLM();
    if (!llm) {
      throw new Error('LLM required for batch processing');
    }

    // Reset stats for this batch
    llm.resetStats();

    for (const task of tasks) {
      await llm.complete(task, { complexity: 'moderate' });
    }

    // Report usage
    const stats = llm.getUsageStats();
    console.log(`Batch completed:
      - Requests: ${stats.requestCount}
      - Tokens: ${stats.tokensUsed}
      - Cost: $${stats.costIncurred.toFixed(4)}
      - Avg Latency: ${stats.averageLatency.toFixed(0)}ms
      - Cache Hit Rate: ${((stats.cacheHitRate ?? 0) * 100).toFixed(1)}%
    `);
  }
}
```

## Provider Configuration

### 8. Injecting Custom Provider

```typescript
import { HybridRouter } from '../providers/HybridRouter';

// Create fleet with hybrid routing
const hybridRouter = new HybridRouter({
  ruvllm: { /* config */ },
  claude: { /* config */ },
  ruvector: { enabled: true },
  defaultStrategy: 'cost_optimized',
});

await hybridRouter.initialize();

// Inject into agent
const agent = await fleetManager.spawnAgent('qe-test-generator', {
  llm: {
    enabled: true,
    provider: hybridRouter,  // Use hybrid router directly
  },
});
```

### 9. Agent Factory Pattern

```typescript
import { createAgentLLM } from '../agents/adapters/AgentLLMAdapter';
import { RuvllmProvider } from '../providers/RuvllmProvider';

// Factory for creating LLM-enabled agents
async function createLLMAgent(
  agentType: string,
  useLocal: boolean = true
): Promise<BaseAgent> {
  // Create provider
  const provider = useLocal
    ? new RuvllmProvider({ enableTRM: true })
    : await getClaudeProvider();

  await provider.initialize();

  // Create LLM adapter
  const llm = createAgentLLM(provider, {
    agentId: `${agentType}-${Date.now()}`,
    defaultModel: useLocal ? 'llama-3.2-3b-instruct' : 'claude-sonnet-4',
    defaultTemperature: 0.3,
  });

  // Create agent with LLM
  return await factory.createAgent(agentType, {
    llm: { enabled: true, provider },
  });
}
```

## Testing with Mock LLM

### 10. Unit Testing Agents

```typescript
import { jest } from '@jest/globals';
import type { IAgentLLM } from '../agents/interfaces/IAgentLLM';

describe('TestGeneratorAgent', () => {
  let mockLLM: IAgentLLM;
  let agent: TestGeneratorAgent;

  beforeEach(() => {
    // Create mock LLM
    mockLLM = {
      complete: jest.fn().mockResolvedValue('mock test code'),
      streamComplete: jest.fn(),
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      getAvailableModels: jest.fn().mockResolvedValue([]),
      getCurrentModel: jest.fn().mockReturnValue('mock-model'),
      switchModel: jest.fn().mockResolvedValue(undefined),
      isHealthy: jest.fn().mockResolvedValue(true),
      getUsageStats: jest.fn().mockReturnValue({
        requestCount: 0,
        tokensUsed: 0,
        costIncurred: 0,
        averageLatency: 0,
      }),
      resetStats: jest.fn(),
    };

    // Inject mock
    agent = new TestGeneratorAgent({
      type: 'qe-test-generator',
      memoryStore: mockMemory,
    });

    // Replace with mock
    (agent as any).llm = mockLLM;
  });

  it('should generate tests using LLM', async () => {
    const result = await agent.generateTests('function add(a, b) { return a + b; }');

    expect(result).toBe('mock test code');
    expect(mockLLM.complete).toHaveBeenCalledWith(
      expect.stringContaining('function add'),
      expect.objectContaining({ complexity: 'moderate' })
    );
  });
});
```

## Best Practices

### 1. **Always Check Health**
```typescript
if (await this.llm.isHealthy()) {
  // Use LLM
} else {
  // Fallback to algorithmic approach
}
```

### 2. **Use Appropriate Complexity**
```typescript
// Simple: Pattern matching, Q&A
await this.llm.complete(prompt, { complexity: 'simple' });

// Moderate: Standard reasoning, test generation
await this.llm.complete(prompt, { complexity: 'moderate' });

// Complex: Deep reasoning, code refactoring
await this.llm.complete(prompt, { complexity: 'complex' });

// Very Complex: Architectural design, complex debugging
await this.llm.complete(prompt, { complexity: 'very_complex' });
```

### 3. **Enable Caching for Repeated Queries**
```typescript
// Cache by file path
const cacheKey = `analysis-${filePath}`;
await this.llm.complete(prompt, { cacheKey });
```

### 4. **Track and Report Usage**
```typescript
// Per-task tracking
this.llm.resetStats();
await performTask();
const stats = this.llm.getUsageStats();
await reportMetrics(stats);
```

### 5. **Provide Context via System Prompts**
```typescript
await this.llm.complete(userPrompt, {
  systemPrompt: `You are a ${this.agentId.type} agent.
    Your role: ${this.getRole()}
    Capabilities: ${this.getCapabilities().join(', ')}
    Current context: ${this.getContext()}`
});
```

## Migration Guide (Phase 1.2.3)

### Before (Direct Provider Usage - Pre-1.2.3)
```typescript
class OldAgent extends BaseAgent {
  async generateTests(code: string): Promise<string> {
    // Coupled to specific provider
    const response = await this.llmProvider?.complete({
      model: 'llama-3.2-3b-instruct',
      messages: [{ role: 'user', content: `Generate tests for: ${code}` }],
      maxTokens: 2000,
    });

    return response?.content[0]?.text || '';
  }
}
```

### After (IAgentLLM Abstraction - Phase 1.2.3)
```typescript
class NewAgent extends BaseAgent {
  async generateTests(code: string): Promise<string> {
    // Provider-independent via getAgentLLM()
    const llm = this.getAgentLLM();
    if (!llm) {
      throw new Error('LLM not available');
    }

    return await llm.complete(`Generate tests for: ${code}`, {
      complexity: 'moderate',
      maxTokens: 2000,
    });
  }
}
```

### Migration Patterns

**Pattern 1: Required LLM (throw if unavailable)**
```typescript
const llm = this.getAgentLLM();
if (!llm) {
  throw new Error('LLM required for this operation');
}
return await llm.complete(prompt, { complexity: 'moderate' });
```

**Pattern 2: Optional LLM (graceful degradation)**
```typescript
const llm = this.getAgentLLM();
if (llm) {
  try {
    return await llm.complete(prompt, { complexity: 'simple' });
  } catch {
    // Fall through to default
  }
}
return this.defaultFallback();
```

**Pattern 3: LLM as enhancement (return undefined)**
```typescript
const llm = this.getAgentLLM();
if (!llm) {
  return undefined;  // Caller handles missing enhancement
}
return await llm.complete(prompt, { complexity: 'simple' });
```

## Benefits Summary

1. **LLM Independence**: Switch providers (Claude, OpenRouter, Ollama, RuvLLM) without code changes
2. **Simplified API**: Clean, agent-focused interface via `getAgentLLM()`
3. **Graceful Degradation**: Agents work without LLM, enhanced when available
4. **Built-in Caching**: RuVector GNN cache integration
5. **Usage Tracking**: Per-agent statistics
6. **Error Handling**: Clear, retryable error types
7. **Testability**: Easy to mock for unit tests
8. **Performance**: Automatic optimization (sessions, batching, caching)

## Agent LLM Integration Status (Phase 1.2.3)

### LLM-Active Agents (4 agents)

| Agent | LLM Usage | Pattern |
|-------|-----------|---------|
| TestGeneratorAgent | Required | Throws if unavailable |
| CoverageAnalyzerAgent | Optional | Graceful degradation |
| CodeIntelligenceAgent | Optional | Returns undefined |
| N8nBaseAgent (15 child agents) | Optional | Helper methods for children |

### Algorithmic Agents (17 agents - No LLM Required)

These agents are designed to work without LLM, using rule-based, metric-based, or pattern-based logic:

| Agent | Design Pattern |
|-------|---------------|
| SecurityScannerAgent | OWASP rules, static patterns |
| RegressionRiskAnalyzerAgent | Git diff analysis, risk scoring |
| QualityGateAgent | Decision tree, threshold logic |
| PerformanceTesterAgent | Metric-based measurements |
| FlakyTestHunterAgent | Statistical patterns |
| TestExecutorAgent | Test execution orchestration |
| FleetCommanderAgent | Agent coordination logic |
| AccessibilityAllyAgent | WCAG rule validation |
| ApiContractValidatorAgent | Schema validation |
| CodeComplexityAnalyzerAgent | Cyclomatic complexity |
| And 7 others... | Various algorithmic approaches |

> **Note**: These agents intentionally don't use LLM. They have access to `getAgentLLM()`
> via BaseAgent inheritance but are designed to be deterministic and fast.

## Next Steps

- ✅ Migrate existing agents to use `IAgentLLM` (Phase 1.2.3) - COMPLETED
- Add provider-specific optimizations (Phase 1.2.4)
- Implement advanced routing strategies (Phase 1.3)
- Add multi-modal support (Phase 2.0)
