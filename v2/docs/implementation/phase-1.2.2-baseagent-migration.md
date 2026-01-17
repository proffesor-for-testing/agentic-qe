# Phase 1.2.2: BaseAgent Migration to IAgentLLM

**Status**: ✅ Complete
**Date**: 2025-12-24
**Migration**: BaseAgent.ts now uses IAgentLLM adapter

## Overview

This migration adds the new `IAgentLLM` interface to `BaseAgent`, providing a simplified, provider-independent API for agents to make LLM calls while maintaining full backward compatibility with the existing `ILLMProvider` interface.

## Changes Made

### 1. Added Imports
- Imported `IAgentLLM` and `AgentCompletionOptions` from `./interfaces/IAgentLLM`
- Imported `createAgentLLM` from `./adapters/AgentLLMAdapter`

**File**: `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`
**Lines**: 61-63

### 2. Added Property
- Added `protected agentLLM?: IAgentLLM` property alongside existing `llmProvider`
- This provides the simplified API while keeping advanced access via `llmProvider`

**File**: `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`
**Line**: 214

### 3. Updated `initializeLLMProvider()`
The method now creates an `agentLLM` wrapper after initializing any provider:

**Locations updated**:
1. **Injected provider** (lines 777-781)
2. **HybridRouter** (lines 811-815)
3. **RuvLLM provider** (lines 844-848)
4. **Factory providers** (lines 866-870)

All paths now execute:
```typescript
this.agentLLM = createAgentLLM(this.llmProvider, {
  agentId: this.agentId.id,
  defaultModel: this.llmConfig.ruvllm?.defaultModel,
});
```

### 4. Updated `hasLLM()`
Now checks for both interfaces:
```typescript
public hasLLM(): boolean {
  return this.llmProvider !== undefined || this.agentLLM !== undefined;
}
```

**File**: `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`
**Lines**: 991-993

### 5. Added `getAgentLLM()` Method
New public method to access the simplified interface:
```typescript
public getAgentLLM(): IAgentLLM | undefined {
  return this.agentLLM;
}
```

**File**: `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`
**Lines**: 1002-1017

### 6. Updated `llmComplete()` Documentation
Added note about using `agentLLM.complete()` for simpler API:
```typescript
/**
 * Make an LLM completion call
 * Uses RuvLLM's session management for 50% latency reduction on multi-turn
 *
 * NOTE: Phase 1.2.2 - Consider using this.agentLLM.complete() for a simpler API
 * that doesn't require manual message construction.
 * ...
 */
```

**File**: `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`
**Lines**: 1019-1031

### 7. Created Interface Exports
Created `/workspaces/agentic-qe-cf/src/agents/interfaces/index.ts` to export:
- `IAgentLLM` (type)
- `AgentCompletionOptions` (type)
- `AgentUsageStats` (type)
- `AgentModelInfo` (type)
- `AgentLLMError` (class)
- `isAgentLLMError` (function)

## Backward Compatibility

✅ **100% Backward Compatible**

1. **Existing code continues to work**: All existing `llmComplete()`, `llmEmbed()`, and `llmBatchComplete()` methods remain unchanged
2. **`getLLMProvider()` still available**: Advanced users can still access the raw provider
3. **`hasLLM()` enhanced**: Now returns true if either interface is available
4. **No breaking changes**: All method signatures preserved

## New Capabilities

Agents can now use the simpler `IAgentLLM` interface:

### Before (Complex - still works):
```typescript
const response = await this.llmProvider!.complete({
  model: 'llama-3.2-3b-instruct',
  messages: [{ role: 'user', content: prompt }],
  maxTokens: 2048,
  temperature: 0.7,
  metadata: { agentId: this.agentId.id }
});

const text = response.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('\n');
```

### After (Simple - recommended):
```typescript
const llm = this.getAgentLLM();
const text = await llm!.complete(prompt, {
  maxTokens: 2048,
  temperature: 0.7,
  complexity: 'moderate'
});
```

## Usage Examples

### Basic Completion
```typescript
protected async generateTests(sourceCode: string): Promise<string> {
  const llm = this.getAgentLLM();
  if (!llm) {
    throw new Error('LLM not available');
  }

  return await llm.complete(
    `Generate Jest tests for:\n${sourceCode}`,
    {
      complexity: 'moderate',
      temperature: 0.2,
      maxTokens: 2048
    }
  );
}
```

### With Streaming
```typescript
protected async *streamResponse(prompt: string): AsyncIterableIterator<string> {
  const llm = this.getAgentLLM();
  if (!llm) return;

  for await (const chunk of llm.streamComplete(prompt, { stream: true })) {
    yield chunk;
  }
}
```

### Embeddings
```typescript
protected async findSimilarPatterns(query: string): Promise<any[]> {
  const llm = this.getAgentLLM();
  if (!llm) return [];

  const embedding = await llm.embed(query);
  return await this.searchQEPatterns(embedding, 10);
}
```

### Model Management
```typescript
protected async ensureBestModel(): Promise<void> {
  const llm = this.getAgentLLM();
  if (!llm) return;

  const models = await llm.getAvailableModels();
  const bestModel = models.find(m => m.id.includes('sonnet'));

  if (bestModel) {
    await llm.switchModel(bestModel.id);
  }
}
```

### Usage Tracking
```typescript
protected async analyzePerformance(): Promise<void> {
  const llm = this.getAgentLLM();
  if (!llm) return;

  const stats = llm.getUsageStats();
  console.log(`Requests: ${stats.requestCount}`);
  console.log(`Tokens: ${stats.tokensUsed}`);
  console.log(`Cost: $${stats.costIncurred.toFixed(4)}`);
  console.log(`Avg Latency: ${stats.averageLatency.toFixed(2)}ms`);
  console.log(`Cache Hit Rate: ${((stats.cacheHitRate || 0) * 100).toFixed(1)}%`);
}
```

## Testing

Created comprehensive test suite: `/workspaces/agentic-qe-cf/tests/unit/agents/BaseAgent.agentLLM.test.ts`

**Test Results**: ✅ 11/11 passed

### Test Coverage
1. **Initialization**
   - Creates agentLLM when provider is injected
   - Skips agentLLM when LLM is disabled
   - Exposes both getLLMProvider() and getAgentLLM()

2. **API Usage**
   - Simple completions via `complete()`
   - Usage statistics tracking
   - Embedding generation
   - Health checks
   - Model listing
   - Current model retrieval

3. **Backward Compatibility**
   - `hasLLM()` works with both interfaces
   - `getLLMProvider()` still accessible for advanced usage

## Build Verification

✅ TypeScript compilation passes with no errors:
```bash
npm run build
# Success - no errors
```

## Migration Path for Agents

### Recommended Approach
1. **New agents**: Use `getAgentLLM()` exclusively for simpler code
2. **Existing agents**: Can migrate incrementally by replacing `llmComplete()` calls with `agentLLM.complete()`
3. **Advanced usage**: Keep using `getLLMProvider()` when needed (e.g., batch operations, sessions)

### Example Migration
```typescript
// Old approach (still works)
protected async oldMethod(prompt: string): Promise<string> {
  if (!this.llmProvider) throw new Error('LLM not available');
  const response = await this.llmProvider.complete({
    model: 'llama-3.2-3b-instruct',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
  });
  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

// New approach (recommended)
protected async newMethod(prompt: string): Promise<string> {
  const llm = this.getAgentLLM();
  if (!llm) throw new Error('LLM not available');
  return await llm.complete(prompt, { maxTokens: 2048 });
}
```

## Benefits

1. **Simpler API**: No manual message construction or text extraction
2. **Provider Independence**: Agents don't need to know about specific providers
3. **Automatic Routing**: HybridRouter complexity routing works transparently
4. **Usage Tracking**: Built-in statistics per agent
5. **Type Safety**: Full TypeScript support with clear interfaces
6. **Backward Compatible**: Existing code continues to work unchanged

## Next Steps

1. ✅ BaseAgent migrated (this document)
2. 🔄 Update specialized agents to use `getAgentLLM()` (optional, can be done incrementally)
3. 🔄 Update documentation to recommend `getAgentLLM()` for new agents
4. 🔄 Consider deprecation timeline for `llmComplete()` in favor of `agentLLM.complete()` (v3.0.0)

## Related Files

- `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts` - Main implementation
- `/workspaces/agentic-qe-cf/src/agents/interfaces/IAgentLLM.ts` - Interface definition
- `/workspaces/agentic-qe-cf/src/agents/adapters/AgentLLMAdapter.ts` - Adapter implementation
- `/workspaces/agentic-qe-cf/src/agents/interfaces/index.ts` - Interface exports
- `/workspaces/agentic-qe-cf/tests/unit/agents/BaseAgent.agentLLM.test.ts` - Test suite

## References

- **Phase 1.2.2 Plan**: `/workspaces/agentic-qe-cf/docs/phase-1.2.2-agent-llm-abstraction.md`
- **LLM Providers Guide**: `/workspaces/agentic-qe-cf/docs/guides/llm-providers-guide.md`
- **Configuration Guide**: `/workspaces/agentic-qe-cf/docs/guides/configuration-guide.md`
