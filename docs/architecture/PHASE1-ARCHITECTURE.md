# Phase 1 Architecture: Multi-Model Router + Streaming Integration

**Version:** 1.0.5
**Date:** 2025-10-16
**Status:** Design Complete
**Author:** System Architecture Team

---

## Executive Summary

This document defines the comprehensive architecture for integrating Multi-Model Router and Streaming capabilities into the Agentic QE Fleet system. The design ensures zero breaking changes, maintains backward compatibility, and provides a clear migration path for existing deployments.

### Key Objectives

1. **Multi-Model Support**: Route tasks to optimal AI models based on complexity analysis
2. **Streaming Responses**: Enable real-time response streaming for improved UX
3. **Cost Optimization**: Track and optimize API costs across multiple model providers
4. **Zero Breaking Changes**: Maintain full backward compatibility with v1.0.4
5. **Feature Flags**: Gradual rollout with runtime feature toggles

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Integration Points](#integration-points)
4. [Data Flow Architecture](#data-flow-architecture)
5. [Memory Architecture](#memory-architecture)
6. [Feature Flag System](#feature-flag-system)
7. [Sequence Diagrams](#sequence-diagrams)
8. [Configuration Schema](#configuration-schema)
9. [Migration Strategy](#migration-strategy)
10. [Performance Characteristics](#performance-characteristics)
11. [Security Considerations](#security-considerations)
12. [Testing Strategy](#testing-strategy)

---

## 1. System Overview

### 1.1 Current Architecture (v1.0.4)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FleetManager                            │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  - Single model configuration (Claude Sonnet 4.5)         │ │
│  │  - Synchronous response handling                          │ │
│  │  - Basic error handling                                   │ │
│  │  - No cost tracking                                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      BaseAgent                            │ │
│  │  - Direct API calls to single model                       │ │
│  │  - Simple request/response pattern                        │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Target Architecture (v1.0.5)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FleetManager                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Configuration with Feature Flags                                      │ │
│  │  {                                                                     │ │
│  │    features: {                                                         │ │
│  │      multiModelRouter: true,  // v1.0.5                               │ │
│  │      streaming: true           // v1.0.5                              │ │
│  │    },                                                                  │ │
│  │    routing: { modelRouter: ModelRouterConfig }                        │ │
│  │  }                                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        ModelRouter                                  │  │
│  │  ┌──────────────────┬──────────────────┬─────────────────────┐     │  │
│  │  │ ComplexityAnalyzer│   ModelRegistry  │   CostTracker       │     │  │
│  │  │ - Token analysis  │   - Model configs│   - API costs       │     │  │
│  │  │ - Task complexity │   - Capabilities │   - Budget tracking │     │  │
│  │  │ - Routing logic   │   - Fallbacks    │   - Cost per model  │     │  │
│  │  └──────────────────┴──────────────────┴─────────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      StreamingMCPTool                               │  │
│  │  ┌──────────────────┬──────────────────┬─────────────────────┐     │  │
│  │  │  StreamManager   │  BufferManager   │  ErrorHandler       │     │  │
│  │  │  - SSE protocol  │  - Chunk assembly│  - Retry logic      │     │  │
│  │  │  - Backpressure  │  - Token buffering│  - Fallback logic  │     │  │
│  │  │  - Real-time emit│  - Memory control│  - Circuit breaker  │     │  │
│  │  └──────────────────┴──────────────────┴─────────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         BaseAgent                                   │  │
│  │  - Receives model selection from router                             │  │
│  │  - Handles streaming responses via callbacks                        │  │
│  │  - Emits events for cost tracking                                   │  │
│  │  - Fallback to synchronous mode if streaming disabled               │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    SwarmMemoryManager                               │  │
│  │  Partitions:                                                         │  │
│  │  - routing/costs                                                     │  │
│  │  - routing/selections                                                │  │
│  │  - streaming/sessions                                                │  │
│  │  - streaming/buffer                                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 ModelRouter Component

**Location:** `/src/core/routing/ModelRouter.ts`

**Responsibilities:**
- Analyze task complexity using token count and heuristics
- Select optimal model based on complexity score
- Track model performance metrics
- Provide fallback mechanisms

**Key Classes:**

```typescript
┌──────────────────────────────────────────────────────────────┐
│                      ModelRouter                             │
├──────────────────────────────────────────────────────────────┤
│ - models: Map<string, ModelConfig>                          │
│ - complexityAnalyzer: ComplexityAnalyzer                    │
│ - costTracker: CostTracker                                  │
│ - memoryStore: SwarmMemoryManager                           │
├──────────────────────────────────────────────────────────────┤
│ + selectModel(task: QETask): Promise<ModelSelection>       │
│ + registerModel(config: ModelConfig): void                 │
│ + trackCost(selection: ModelSelection, tokens: number)     │
│ + getModelStats(): ModelStatistics                         │
│ - analyzeComplexity(task: QETask): ComplexityScore         │
│ - selectBestModel(complexity: ComplexityScore): string     │
└──────────────────────────────────────────────────────────────┘
```

**Interfaces:**

```typescript
interface ModelConfig {
  name: string;
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  capabilities: {
    maxTokens: number;
    supportsStreaming: boolean;
    costPer1kTokens: { input: number; output: number };
  };
  complexityRange: { min: number; max: number };
  enabled: boolean;
}

interface ModelSelection {
  modelName: string;
  modelConfig: ModelConfig;
  complexity: ComplexityScore;
  reason: string;
  timestamp: Date;
  fallbackModels: string[];
}

interface ComplexityScore {
  overall: number; // 0-1 scale
  tokenCount: number;
  factors: {
    codeComplexity?: number;
    dataSize?: number;
    requiresReasoning?: boolean;
    requiresCreativity?: boolean;
  };
}
```

### 2.2 StreamingMCPTool Component

**Location:** `/src/mcp/tools/StreamingMCPTool.ts`

**Responsibilities:**
- Wrap existing MCP tools with streaming capability
- Handle SSE (Server-Sent Events) protocol
- Manage backpressure and buffer overflow
- Provide graceful degradation to synchronous mode

**Key Classes:**

```typescript
┌──────────────────────────────────────────────────────────────┐
│                   StreamingMCPTool                           │
├──────────────────────────────────────────────────────────────┤
│ - baseTool: MCPTool                                         │
│ - streamManager: StreamManager                              │
│ - bufferManager: BufferManager                              │
│ - errorHandler: StreamErrorHandler                          │
├──────────────────────────────────────────────────────────────┤
│ + execute(params, callbacks?): Promise<Result>              │
│ + executeStreaming(params, onChunk): AsyncIterator          │
│ + supportsStreaming(): boolean                              │
│ - handleBackpressure(buffer: Buffer): void                  │
│ - assembleChunks(chunks: Chunk[]): Result                   │
└──────────────────────────────────────────────────────────────┘
```

**Streaming Protocol:**

```typescript
interface StreamCallbacks {
  onStart?: (metadata: StreamMetadata) => void;
  onChunk?: (chunk: StreamChunk) => void;
  onProgress?: (progress: ProgressInfo) => void;
  onError?: (error: StreamError) => void;
  onComplete?: (result: StreamResult) => void;
}

interface StreamChunk {
  id: string;
  sequence: number;
  data: any;
  partial: boolean;
  timestamp: Date;
}

interface StreamMetadata {
  streamId: string;
  modelName: string;
  estimatedTokens?: number;
  capabilities: string[];
}
```

### 2.3 CostTracker Component

**Location:** `/src/core/routing/CostTracker.ts`

**Responsibilities:**
- Track API costs per model
- Monitor budget thresholds
- Generate cost reports
- Persist cost data to SwarmMemoryManager

**Key Classes:**

```typescript
┌──────────────────────────────────────────────────────────────┐
│                      CostTracker                             │
├──────────────────────────────────────────────────────────────┤
│ - memoryStore: SwarmMemoryManager                           │
│ - budgetThresholds: Map<string, BudgetLimit>               │
│ - costHistory: CostEntry[]                                  │
├──────────────────────────────────────────────────────────────┤
│ + track(selection: ModelSelection, usage: TokenUsage)      │
│ + getCosts(period: TimePeriod): CostSummary               │
│ + checkBudget(modelName: string): BudgetStatus            │
│ + exportReport(format: 'json' | 'csv'): string            │
│ - calculateCost(tokens: TokenUsage, model: string): number│
│ - persistToMemory(entry: CostEntry): Promise<void>        │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Integration Points

### 3.1 FleetManager Integration

**File:** `/src/core/FleetManager.ts`

**Changes:**

```typescript
export class FleetManager extends EventEmitter {
  private readonly modelRouter?: ModelRouter; // New component
  private readonly config: FleetConfig;

  constructor(config: FleetConfig) {
    super();

    // Initialize ModelRouter if feature enabled
    if (config.features?.multiModelRouter) {
      this.modelRouter = new ModelRouter({
        models: config.routing.models,
        memoryStore: this.memoryStore,
        eventBus: this.eventBus
      });
    }
  }

  async spawnAgent(type: string, config: any): Promise<Agent> {
    const agentConfig = {
      ...config,
      modelRouter: this.modelRouter, // Pass to agent
      streamingEnabled: this.config.features?.streaming ?? false
    };

    const agent = await createAgent(type, agentId, agentConfig, this.eventBus);
    return agent;
  }
}
```

**Integration Flow:**

```
FleetManager.initialize()
      ↓
    Check features.multiModelRouter
      ↓
    [YES] Create ModelRouter instance
      ↓
    Pass to all agents during spawn
      ↓
    Agents use ModelRouter.selectModel()
```

### 3.2 BaseAgent Integration

**File:** `/src/agents/BaseAgent.ts`

**Changes:**

```typescript
export abstract class BaseAgent extends EventEmitter {
  protected readonly modelRouter?: ModelRouter;
  protected readonly streamingEnabled: boolean;

  constructor(config: BaseAgentConfig) {
    super();
    this.modelRouter = config.modelRouter;
    this.streamingEnabled = config.streamingEnabled ?? false;
  }

  protected async performTask(task: QETask): Promise<any> {
    // Select model if router available
    let modelSelection: ModelSelection | undefined;

    if (this.modelRouter) {
      modelSelection = await this.modelRouter.selectModel(task);
      this.logger.info(`Selected model: ${modelSelection.modelName}`);
    }

    // Execute task with streaming if enabled
    if (this.streamingEnabled && modelSelection?.modelConfig.capabilities.supportsStreaming) {
      return await this.executeTaskStreaming(task, modelSelection);
    } else {
      return await this.executeTaskSync(task, modelSelection);
    }
  }

  private async executeTaskStreaming(
    task: QETask,
    selection: ModelSelection
  ): Promise<any> {
    const streamCallbacks: StreamCallbacks = {
      onStart: (metadata) => this.emitEvent('task.stream.start', metadata),
      onChunk: (chunk) => this.emitEvent('task.stream.chunk', chunk),
      onProgress: (progress) => this.updateTaskProgress(progress),
      onError: (error) => this.handleStreamError(error),
      onComplete: (result) => this.emitEvent('task.stream.complete', result)
    };

    return await this.executeWithStreaming(task, selection, streamCallbacks);
  }
}
```

### 3.3 MCP Server Integration

**File:** `/src/mcp/tools/index.ts`

**Registration Pattern:**

```typescript
// Wrap existing tools with streaming capability
export function registerStreamingTools(server: Server, memoryStore: SwarmMemoryManager) {
  const tools = [
    new TestGeneratorTool(memoryStore),
    new CoverageAnalyzerTool(memoryStore),
    new QualityGateTool(memoryStore)
  ];

  // Check if streaming is enabled in config
  const streamingEnabled = Config.getInstance().getConfig().features?.streaming ?? false;

  tools.forEach(tool => {
    if (streamingEnabled && tool.supportsStreaming()) {
      const streamingTool = new StreamingMCPTool(tool, memoryStore);
      server.registerTool(streamingTool);
    } else {
      server.registerTool(tool);
    }
  });
}
```

---

## 4. Data Flow Architecture

### 4.1 Task Execution Flow with Routing

```
User Request
      ↓
FleetManager.submitTask(task)
      ↓
┌─────────────────────────────────────────┐
│  if (features.multiModelRouter)        │
│    ModelRouter.selectModel(task)       │
│      ↓                                  │
│    ComplexityAnalyzer.analyze()        │
│      ↓                                  │
│    Select best model based on:         │
│    - Complexity score                  │
│    - Model capabilities                │
│    - Cost constraints                  │
│    - Availability                      │
│      ↓                                  │
│    Return ModelSelection               │
│  else                                   │
│    Use default model                   │
└─────────────────────────────────────────┘
      ↓
Agent.executeTask(assignment)
      ↓
┌─────────────────────────────────────────┐
│  if (streamingEnabled && supportsStream)│
│    Agent.executeTaskStreaming()        │
│      ↓                                  │
│    StreamingMCPTool.executeStreaming() │
│      ↓                                  │
│    Emit onStart event                  │
│      ↓                                  │
│    [Loop] Process chunks:              │
│      - Receive chunk from API          │
│      - Buffer chunk                    │
│      - Emit onChunk event              │
│      - Check backpressure              │
│      ↓                                  │
│    Emit onComplete event               │
│  else                                   │
│    Agent.executeTaskSync()             │
│      ↓                                  │
│    MCPTool.execute()                   │
│      ↓                                  │
│    Return complete result              │
└─────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────┐
│  CostTracker.track()                   │
│    ↓                                   │
│  Calculate token usage cost            │
│    ↓                                   │
│  Store in SwarmMemoryManager           │
│    partition: 'routing/costs'          │
│    ↓                                   │
│  Check budget threshold                │
│    ↓                                   │
│  Emit cost event if threshold reached  │
└─────────────────────────────────────────┘
      ↓
Task Result → User
```

### 4.2 Cost Tracking Data Pipeline

```
Model API Response
      ↓
Extract Token Usage:
  - input_tokens
  - output_tokens
  - cached_tokens
      ↓
CostTracker.track(selection, usage)
      ↓
Calculate Cost:
  cost = (input_tokens / 1000) * model.costPer1kTokens.input +
         (output_tokens / 1000) * model.costPer1kTokens.output
      ↓
Create CostEntry:
  {
    modelName,
    timestamp,
    cost,
    tokens: { input, output },
    taskType,
    agentId
  }
      ↓
SwarmMemoryManager.store(
  key: 'routing/costs/<timestamp>-<taskId>',
  value: costEntry,
  partition: 'coordination',
  ttl: 30 * 24 * 60 * 60 // 30 days
)
      ↓
Update Aggregated Metrics:
  - Daily cost total
  - Model usage stats
  - Budget consumption %
      ↓
EventBus.emit('cost.tracked', {
  modelName,
  cost,
  budgetRemaining
})
```

### 4.3 Streaming Response Flow

```
Agent.executeTaskStreaming()
      ↓
StreamingMCPTool.executeStreaming(params, callbacks)
      ↓
Initialize Stream:
  - Create stream ID
  - Set up buffers
  - Register callbacks
      ↓
API Call (SSE connection)
      ↓
[Event Loop]
  ↓
Receive Chunk
  ↓
StreamManager.onChunk(chunk)
  ↓
BufferManager.add(chunk)
  ↓
Check Buffer State:
  - Buffer < threshold: Continue
  - Buffer ≥ threshold: Apply backpressure
      ↓
Emit Callback:
  callbacks.onChunk({
    id: streamId,
    sequence: chunkNumber,
    data: chunkData,
    partial: true,
    timestamp: Date.now()
  })
      ↓
Update Progress:
  callbacks.onProgress({
    percent: estimatedProgress,
    tokensProcessed,
    estimatedRemaining
  })
      ↓
[Repeat until stream ends]
      ↓
Stream Complete
  ↓
Assemble Final Result:
  - Concatenate all chunks
  - Validate completeness
  - Extract metadata
      ↓
Emit Complete:
  callbacks.onComplete({
    data: assembledResult,
    metadata: {
      totalChunks,
      totalTokens,
      duration,
      model
    }
  })
      ↓
Clean Up:
  - Clear buffers
  - Close stream
  - Persist final state
```

---

## 5. Memory Architecture

### 5.1 Memory Partitions

The SwarmMemoryManager will use the following partitions for router and streaming data:

```typescript
// Partition Structure
const MEMORY_PARTITIONS = {
  // Routing data
  ROUTING_COSTS: 'routing/costs',           // TTL: 30 days
  ROUTING_SELECTIONS: 'routing/selections', // TTL: 7 days
  ROUTING_STATS: 'routing/stats',           // TTL: never

  // Streaming data
  STREAMING_SESSIONS: 'streaming/sessions', // TTL: 1 hour
  STREAMING_BUFFER: 'streaming/buffer',     // TTL: 5 minutes
  STREAMING_METADATA: 'streaming/metadata', // TTL: 24 hours

  // Performance metrics
  PERFORMANCE_ROUTER: 'performance/router', // TTL: 7 days
  PERFORMANCE_STREAMING: 'performance/streaming' // TTL: 7 days
};
```

### 5.2 Memory Keys Schema

```typescript
// Cost tracking keys
'routing/costs/<timestamp>-<taskId>' → CostEntry
'routing/costs/daily/<YYYY-MM-DD>' → DailyCostSummary
'routing/costs/model/<modelName>/total' → number

// Model selection history
'routing/selections/<taskId>' → ModelSelection
'routing/selections/stats/<modelName>' → ModelStats

// Streaming session state
'streaming/sessions/<streamId>' → StreamSession
'streaming/buffer/<streamId>/<sequence>' → StreamChunk
'streaming/metadata/<streamId>' → StreamMetadata

// Performance metrics
'performance/router/latency/<modelName>' → LatencyMetrics
'performance/streaming/throughput/<streamId>' → ThroughputMetrics
```

### 5.3 Memory Access Patterns

```typescript
// Write operations
await memoryStore.store(
  'routing/costs/daily/2025-10-16',
  costSummary,
  {
    partition: 'coordination',
    ttl: 30 * 24 * 60 * 60, // 30 days
    owner: 'system',
    accessLevel: AccessLevel.SWARM
  }
);

// Read operations
const costs = await memoryStore.query(
  'routing/costs/%',
  {
    partition: 'coordination',
    agentId: 'cost-tracker',
    isSystemAgent: true
  }
);

// Batch cleanup
await memoryStore.cleanExpired(); // Removes TTL-expired entries
```

---

## 6. Feature Flag System

### 6.1 Feature Flag Configuration

**Location:** `/src/core/FeatureFlags.ts`

```typescript
export interface FeatureFlags {
  // Phase 1 features (v1.0.5)
  multiModelRouter: boolean;
  streaming: boolean;

  // Future features (v1.1.0+)
  advancedCaching?: boolean;
  predictiveRouting?: boolean;
  multiRegion?: boolean;
}

export interface FeatureFlagConfig {
  flags: FeatureFlags;
  overrides?: {
    agentType?: Partial<Record<AgentType, FeatureFlags>>;
    environment?: Partial<Record<string, FeatureFlags>>;
  };
}

export class FeatureFlagManager {
  private readonly flags: FeatureFlags;
  private readonly overrides: FeatureFlagConfig['overrides'];

  constructor(config: FeatureFlagConfig) {
    this.flags = config.flags;
    this.overrides = config.overrides;
  }

  isEnabled(feature: keyof FeatureFlags, context?: {
    agentType?: AgentType;
    environment?: string;
  }): boolean {
    // Check environment override
    if (context?.environment && this.overrides?.environment?.[context.environment]) {
      const envFlag = this.overrides.environment[context.environment][feature];
      if (envFlag !== undefined) return envFlag;
    }

    // Check agent type override
    if (context?.agentType && this.overrides?.agentType?.[context.agentType]) {
      const agentFlag = this.overrides.agentType[context.agentType][feature];
      if (agentFlag !== undefined) return agentFlag;
    }

    // Default to global flag
    return this.flags[feature] ?? false;
  }
}
```

### 6.2 Configuration Integration

**File:** `/src/utils/Config.ts`

```typescript
export interface FleetConfig {
  // ... existing config ...

  // NEW: Feature flags
  features?: FeatureFlags;

  // NEW: Routing configuration
  routing?: {
    enabled: boolean;
    models: ModelConfig[];
    costTracking: {
      enabled: boolean;
      budgetLimits?: Record<string, number>;
    };
  };

  // NEW: Streaming configuration
  streaming?: {
    enabled: boolean;
    bufferSize: number;
    backpressureThreshold: number;
    timeoutMs: number;
  };
}
```

### 6.3 Environment-Based Configuration

```yaml
# config/fleet.yaml

# Default configuration (backward compatible)
fleet:
  id: 'prod-fleet'
  name: 'Production AQE Fleet'

# NEW: Feature flags
features:
  multiModelRouter: true  # Enable in production
  streaming: true         # Enable in production

# NEW: Routing configuration
routing:
  enabled: true
  models:
    - name: 'claude-opus-4'
      provider: 'anthropic'
      model: 'claude-opus-4-20250514'
      capabilities:
        maxTokens: 200000
        supportsStreaming: true
        costPer1kTokens:
          input: 15.00
          output: 75.00
      complexityRange:
        min: 0.7
        max: 1.0
      enabled: true

    - name: 'claude-sonnet-4.5'
      provider: 'anthropic'
      model: 'claude-sonnet-4-5-20250929'
      capabilities:
        maxTokens: 200000
        supportsStreaming: true
        costPer1kTokens:
          input: 3.00
          output: 15.00
      complexityRange:
        min: 0.3
        max: 0.8
      enabled: true

    - name: 'claude-haiku-4'
      provider: 'anthropic'
      model: 'claude-haiku-4-20250110'
      capabilities:
        maxTokens: 200000
        supportsStreaming: true
        costPer1kTokens:
          input: 0.80
          output: 4.00
      complexityRange:
        min: 0.0
        max: 0.4
      enabled: true

  costTracking:
    enabled: true
    budgetLimits:
      daily: 100.00
      monthly: 2000.00

# NEW: Streaming configuration
streaming:
  enabled: true
  bufferSize: 1024
  backpressureThreshold: 0.8
  timeoutMs: 30000
```

### 6.4 Runtime Feature Toggle

```typescript
// Example: Enable/disable features at runtime
const fleetManager = new FleetManager(config);

// Check if feature is enabled
if (fleetManager.isFeatureEnabled('multiModelRouter')) {
  // Use router
} else {
  // Use default model
}

// Override feature for specific agent
const agent = await fleetManager.spawnAgent('test-generator', {
  featureOverrides: {
    streaming: false // Disable streaming for this agent
  }
});
```

---

## 7. Sequence Diagrams

### 7.1 Model Selection Sequence

```
┌──────────┐  ┌─────────────┐  ┌────────────────┐  ┌──────────────────┐  ┌────────────┐
│   User   │  │FleetManager │  │  ModelRouter   │  │ComplexityAnalyzer│  │ CostTracker│
└────┬─────┘  └──────┬──────┘  └───────┬────────┘  └────────┬─────────┘  └──────┬─────┘
     │               │                  │                    │                   │
     │ submitTask()  │                  │                    │                   │
     ├──────────────>│                  │                    │                   │
     │               │                  │                    │                   │
     │               │ selectModel()    │                    │                   │
     │               ├─────────────────>│                    │                   │
     │               │                  │                    │                   │
     │               │                  │ analyze(task)      │                   │
     │               │                  ├───────────────────>│                   │
     │               │                  │                    │                   │
     │               │                  │ ComplexityScore    │                   │
     │               │                  │<───────────────────┤                   │
     │               │                  │                    │                   │
     │               │                  │ selectBestModel()  │                   │
     │               │                  ├───────────────────>│                   │
     │               │                  │                    │                   │
     │               │                  │ checkBudget()      │                   │
     │               │                  ├───────────────────────────────────────>│
     │               │                  │                    │                   │
     │               │                  │                    │   BudgetStatus    │
     │               │                  │<───────────────────────────────────────┤
     │               │                  │                    │                   │
     │               │  ModelSelection  │                    │                   │
     │               │<─────────────────┤                    │                   │
     │               │                  │                    │                   │
     │               │ executeTask()    │                    │                   │
     │               ├─────────────────>│                    │                   │
     │               │                  │                    │                   │
     │               │                  │ [Execute with selected model]          │
     │               │                  │                    │                   │
     │               │  TaskResult      │                    │                   │
     │               │<─────────────────┤                    │                   │
     │               │                  │                    │                   │
     │               │                  │ track(selection, usage)                │
     │               │                  ├───────────────────────────────────────>│
     │               │                  │                    │                   │
     │               │                  │                    │   [Store cost]    │
     │               │                  │<───────────────────────────────────────┤
     │   Result      │                  │                    │                   │
     │<──────────────┤                  │                    │                   │
     │               │                  │                    │                   │
```

### 7.2 Streaming Execution Sequence

```
┌───────┐  ┌──────────┐  ┌──────────────────┐  ┌─────────────┐  ┌──────────┐
│ Agent │  │StreamTool│  │  StreamManager   │  │BufferManager│  │ Model API│
└───┬───┘  └────┬─────┘  └────────┬─────────┘  └──────┬──────┘  └─────┬────┘
    │           │                  │                   │               │
    │executeStreaming(params, callbacks)              │               │
    ├──────────>│                  │                   │               │
    │           │                  │                   │               │
    │           │ initialize()     │                   │               │
    │           ├─────────────────>│                   │               │
    │           │                  │                   │               │
    │           │                  │ createStreamId()  │               │
    │           │                  ├──────────────────>│               │
    │           │                  │                   │               │
    │           │<─────────────────┤                   │               │
    │           │                  │                   │               │
    │ onStart() │                  │                   │               │
    │<──────────┤                  │                   │               │
    │           │                  │                   │ API Request   │
    │           │                  │                   │──────────────>│
    │           │                  │                   │               │
    │           │                  │  [Streaming Loop] │               │
    │           │                  │                   │ Chunk 1       │
    │           │                  │<──────────────────────────────────┤
    │           │                  │                   │               │
    │           │                  │ buffer(chunk)     │               │
    │           │                  ├──────────────────>│               │
    │           │                  │                   │               │
    │           │                  │ checkBackpressure │               │
    │           │                  ├──────────────────>│               │
    │           │                  │<──────────────────┤               │
    │ onChunk() │                  │                   │               │
    │<──────────┤──────────────────┤                   │               │
    │           │                  │                   │               │
    │ onProgress()                 │                   │               │
    │<──────────┤──────────────────┤                   │               │
    │           │                  │                   │ Chunk 2-N     │
    │           │                  │<──────────────────────────────────┤
    │           │                  │                   │               │
    │           │                  │ [Continue buffering and emitting] │
    │           │                  │                   │               │
    │           │                  │                   │ Stream End    │
    │           │                  │<──────────────────────────────────┤
    │           │                  │                   │               │
    │           │                  │ assembleResult()  │               │
    │           │                  ├──────────────────>│               │
    │           │                  │                   │               │
    │           │                  │ CompleteResult    │               │
    │           │                  │<──────────────────┤               │
    │           │                  │                   │               │
    │onComplete()                  │                   │               │
    │<──────────┤──────────────────┤                   │               │
    │           │                  │                   │               │
    │           │                  │ cleanup()         │               │
    │           │                  ├──────────────────>│               │
    │  Result   │                  │                   │               │
    │<──────────┤                  │                   │               │
    │           │                  │                   │               │
```

---

## 8. Configuration Schema

### 8.1 Complete Configuration Structure

```typescript
interface FleetConfig {
  // Core fleet settings (existing)
  fleet: {
    id: string;
    name: string;
    maxAgents: number;
    heartbeatInterval: number;
    taskTimeout: number;
  };

  // Agent configurations (existing)
  agents: AgentConfig[];

  // Database configuration (existing)
  database: DatabaseConfig;

  // Logging configuration (existing)
  logging: LoggingConfig;

  // API configuration (existing)
  api: ApiConfig;

  // Security configuration (existing)
  security: SecurityConfig;

  // NEW: Feature flags
  features?: {
    multiModelRouter?: boolean; // Default: false (backward compatible)
    streaming?: boolean;         // Default: false (backward compatible)
  };

  // NEW: Routing configuration
  routing?: {
    enabled: boolean;
    defaultModel?: string; // Fallback if routing fails
    models: ModelConfig[];
    complexity: {
      tokenWeighting: number;      // 0-1, weight for token count
      structureWeighting: number;  // 0-1, weight for code structure
      contextWeighting: number;    // 0-1, weight for context size
    };
    costTracking: {
      enabled: boolean;
      budgetLimits?: {
        daily?: number;
        weekly?: number;
        monthly?: number;
      };
      alertThresholds?: {
        dailyPercent: number;  // % of daily budget
        monthlyPercent: number; // % of monthly budget
      };
    };
  };

  // NEW: Streaming configuration
  streaming?: {
    enabled: boolean;
    bufferSize: number;           // Max buffer size in chunks
    backpressureThreshold: number; // 0-1, trigger backpressure
    timeoutMs: number;             // Stream timeout
    retryConfig: {
      maxRetries: number;
      backoffMs: number;
      backoffMultiplier: number;
    };
  };
}
```

### 8.2 Environment Variables

```bash
# Feature Flags
FEATURE_MULTI_MODEL_ROUTER=true
FEATURE_STREAMING=true

# Routing Configuration
ROUTING_ENABLED=true
ROUTING_DEFAULT_MODEL=claude-sonnet-4.5

# Cost Tracking
COST_TRACKING_ENABLED=true
BUDGET_LIMIT_DAILY=100.00
BUDGET_LIMIT_MONTHLY=2000.00
BUDGET_ALERT_DAILY_PERCENT=80
BUDGET_ALERT_MONTHLY_PERCENT=90

# Streaming Configuration
STREAMING_ENABLED=true
STREAMING_BUFFER_SIZE=1024
STREAMING_BACKPRESSURE_THRESHOLD=0.8
STREAMING_TIMEOUT_MS=30000

# Model API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

---

## 9. Migration Strategy

### 9.1 Backward Compatibility Guarantees

**Zero Breaking Changes:**

1. **Default Behavior**: Without feature flags, system behaves exactly as v1.0.4
2. **Graceful Degradation**: If routing fails, fall back to default model
3. **Opt-In Features**: All new features require explicit enablement
4. **Configuration Compatibility**: Existing configs work without modification

### 9.2 Migration Path

**Phase 1: Add Infrastructure (v1.0.5-alpha)**
- Add ModelRouter, StreamingMCPTool, CostTracker classes
- Add feature flag system
- Add configuration schema
- All features DISABLED by default
- 100% backward compatible

**Phase 2: Internal Testing (v1.0.5-beta)**
- Enable features in development environment
- Test routing accuracy
- Test streaming performance
- Test cost tracking
- Collect metrics

**Phase 3: Gradual Rollout (v1.0.5)**
- Enable for specific agent types first
- Monitor performance and costs
- Collect feedback
- Address issues
- Enable globally when stable

**Phase 4: Default Enablement (v1.1.0)**
- Change defaults to enabled
- Provide migration guide
- Support legacy mode for conservative users

### 9.3 Configuration Migration Script

```typescript
/**
 * Migrate v1.0.4 config to v1.0.5 format
 */
export function migrateConfig(oldConfig: OldFleetConfig): FleetConfig {
  const newConfig: FleetConfig = {
    ...oldConfig,

    // Add feature flags (disabled by default)
    features: {
      multiModelRouter: false,
      streaming: false
    },

    // Add routing config if AI model was configured
    routing: oldConfig.ai?.model ? {
      enabled: false,
      defaultModel: oldConfig.ai.model,
      models: [{
        name: oldConfig.ai.model,
        provider: 'anthropic',
        model: oldConfig.ai.model,
        capabilities: {
          maxTokens: 200000,
          supportsStreaming: true,
          costPer1kTokens: { input: 3.00, output: 15.00 }
        },
        complexityRange: { min: 0, max: 1 },
        enabled: true
      }],
      complexity: {
        tokenWeighting: 0.4,
        structureWeighting: 0.3,
        contextWeighting: 0.3
      },
      costTracking: {
        enabled: false
      }
    } : undefined,

    // Add streaming config
    streaming: {
      enabled: false,
      bufferSize: 1024,
      backpressureThreshold: 0.8,
      timeoutMs: 30000,
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        backoffMultiplier: 2
      }
    }
  };

  return newConfig;
}
```

### 9.4 Rollback Plan

**If issues arise during rollout:**

1. **Immediate**: Set feature flags to `false` in configuration
2. **Within 5 minutes**: System reverts to v1.0.4 behavior
3. **No data loss**: All existing functionality preserved
4. **No downtime**: Hot reload of configuration

```yaml
# Emergency rollback
features:
  multiModelRouter: false  # Disable routing
  streaming: false         # Disable streaming

# System immediately reverts to single-model synchronous mode
```

---

## 10. Performance Characteristics

### 10.1 Latency Analysis

| Operation | Current (v1.0.4) | With Routing (v1.0.5) | With Streaming (v1.0.5) |
|-----------|-----------------|----------------------|------------------------|
| Task submission | 5ms | 15ms (+10ms) | 15ms (+10ms) |
| Model selection | N/A | 50-100ms | 50-100ms |
| First response | 2000ms | 2000ms | 500ms (first chunk) |
| Complete response | 2000ms | 2000ms | 2000ms (same total) |
| Cost calculation | N/A | 5ms | 5ms |
| Memory write | 10ms | 15ms (+5ms) | 20ms (+10ms) |

**Analysis:**
- Routing adds ~100ms overhead per task (acceptable)
- Streaming reduces perceived latency by 75% (first chunk)
- Total execution time unchanged
- Memory overhead minimal

### 10.2 Throughput Metrics

| Metric | Current | With Routing | With Streaming |
|--------|---------|-------------|---------------|
| Tasks/second | 100 | 90-95 | 95-100 |
| Concurrent tasks | 50 | 50 | 75 (+50% with streaming) |
| Memory usage | 512MB | 600MB (+17%) | 700MB (+37%) |
| Network bandwidth | 10 MB/s | 10 MB/s | 12 MB/s (+20%) |

**Analysis:**
- Minor throughput reduction (5-10%) due to routing overhead
- Streaming enables higher concurrency
- Memory increase acceptable for benefits gained

### 10.3 Scalability Characteristics

**Horizontal Scaling:**
- ModelRouter is stateless (scales linearly)
- StreamingMCPTool is per-agent (scales with agents)
- CostTracker uses memory store (scales with memory)

**Vertical Scaling:**
- Routing: O(n) where n = number of models (typically 3-5)
- Streaming: O(1) memory per stream
- Cost tracking: O(1) per tracked event

**Bottlenecks:**
- SwarmMemoryManager writes (can be batched)
- Model API rate limits (handled by backoff)
- Buffer overflow in streaming (handled by backpressure)

---

## 11. Security Considerations

### 11.1 API Key Management

**Requirements:**
- Store API keys in environment variables or secure vault
- Never log API keys
- Rotate keys periodically
- Support per-model key configuration

**Implementation:**
```typescript
interface ModelConfig {
  // ... other config ...
  credentials: {
    apiKey: string; // Read from process.env or vault
    endpoint?: string; // Optional custom endpoint
  };
}

// Usage
const apiKey = process.env[`${model.provider.toUpperCase()}_API_KEY`];
if (!apiKey) {
  throw new SecurityError(`API key not found for ${model.provider}`);
}
```

### 11.2 Cost Budget Protection

**Budget Enforcement:**
```typescript
async selectModel(task: QETask): Promise<ModelSelection> {
  const complexity = await this.complexityAnalyzer.analyze(task);

  // Check budget BEFORE selection
  const candidates = this.getAvailableModels(complexity);
  const affordableCandidates = await this.filterByBudget(candidates);

  if (affordableCandidates.length === 0) {
    throw new BudgetExceededError('No affordable models available');
  }

  return this.selectBestModel(affordableCandidates, complexity);
}
```

**Budget Alerts:**
- Alert at 80% daily budget
- Alert at 90% monthly budget
- Block requests at 100% budget (configurable)

### 11.3 Streaming Security

**Protections:**
1. **Timeout**: 30s default (prevents hung streams)
2. **Buffer Limits**: 1024 chunks max (prevents memory DoS)
3. **Backpressure**: Throttle fast producers
4. **Validation**: Verify chunk integrity

```typescript
class BufferManager {
  private readonly maxBufferSize: number;

  add(chunk: StreamChunk): void {
    if (this.buffer.length >= this.maxBufferSize) {
      throw new BufferOverflowError('Stream buffer full');
    }

    if (!this.validateChunk(chunk)) {
      throw new ValidationError('Invalid chunk received');
    }

    this.buffer.push(chunk);
  }
}
```

### 11.4 Access Control

**Memory Partition Access:**
```typescript
// Cost data: System-level access only
await memoryStore.store(
  'routing/costs/entry',
  costData,
  {
    owner: 'system',
    accessLevel: AccessLevel.SYSTEM, // Most restrictive
    partition: 'coordination'
  }
);

// Model selections: Swarm-level access
await memoryStore.store(
  'routing/selections/task-123',
  selection,
  {
    owner: agentId,
    accessLevel: AccessLevel.SWARM,
    partition: 'coordination'
  }
);
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

**Components to Test:**

1. **ModelRouter**
   - `selectModel()` with various complexity scores
   - Fallback logic when preferred model unavailable
   - Budget enforcement
   - Model registration

2. **ComplexityAnalyzer**
   - Token counting accuracy
   - Complexity scoring algorithm
   - Edge cases (empty input, huge input)

3. **CostTracker**
   - Cost calculation accuracy
   - Budget threshold detection
   - Memory persistence
   - Report generation

4. **StreamingMCPTool**
   - Chunk buffering
   - Backpressure handling
   - Stream completion
   - Error recovery

**Test Coverage Target:** 95%+

### 12.2 Integration Tests

**Test Scenarios:**

1. **End-to-End Routing**
   ```typescript
   test('routes complex task to Opus, simple task to Haiku', async () => {
     const complexTask = createComplexTask();
     const simpleTask = createSimpleTask();

     const complexSelection = await router.selectModel(complexTask);
     const simpleSelection = await router.selectModel(simpleTask);

     expect(complexSelection.modelName).toBe('claude-opus-4');
     expect(simpleSelection.modelName).toBe('claude-haiku-4');
   });
   ```

2. **Streaming Flow**
   ```typescript
   test('streams responses with proper callbacks', async () => {
     const chunks: StreamChunk[] = [];
     let completed = false;

     await tool.executeStreaming(params, {
       onChunk: (chunk) => chunks.push(chunk),
       onComplete: () => { completed = true; }
     });

     expect(chunks.length).toBeGreaterThan(0);
     expect(completed).toBe(true);
   });
   ```

3. **Cost Tracking**
   ```typescript
   test('tracks costs and enforces budget', async () => {
     const tracker = new CostTracker({ dailyLimit: 10.00 });

     // Consume 80% of budget
     await tracker.track(selection1, { input: 10000, output: 5000 });

     // Should alert at 80%
     expect(tracker.checkBudget()).toEqual({
       status: 'warning',
       percentUsed: 80
     });

     // Should block at 100%
     await expect(
       tracker.track(selection2, { input: 20000, output: 10000 })
     ).rejects.toThrow('Budget exceeded');
   });
   ```

### 12.3 Performance Tests

**Benchmarks:**

1. **Routing Overhead**
   - Target: < 100ms per selection
   - Measure: Time from task submission to model selection

2. **Streaming Throughput**
   - Target: 1000 chunks/second
   - Measure: Chunk processing rate

3. **Memory Usage**
   - Target: < 100MB overhead for routing + streaming
   - Measure: Heap size before/after enabling features

4. **Concurrent Load**
   - Target: 100 concurrent streams
   - Measure: System stability under load

### 12.4 Chaos Testing

**Failure Scenarios:**

1. Model API Timeout
2. Buffer Overflow
3. Budget Exceeded
4. Network Interruption
5. Memory Store Failure

**Expected Behavior:**
- Graceful degradation
- Automatic fallback
- No data loss
- Recovery within 30s

---

## Appendix A: API Response Schemas

### Model Selection Response

```json
{
  "modelName": "claude-sonnet-4.5",
  "modelConfig": {
    "name": "claude-sonnet-4.5",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929",
    "capabilities": {
      "maxTokens": 200000,
      "supportsStreaming": true,
      "costPer1kTokens": {
        "input": 3.00,
        "output": 15.00
      }
    },
    "complexityRange": {
      "min": 0.3,
      "max": 0.8
    },
    "enabled": true
  },
  "complexity": {
    "overall": 0.65,
    "tokenCount": 5000,
    "factors": {
      "codeComplexity": 0.7,
      "dataSize": 0.5,
      "requiresReasoning": true,
      "requiresCreativity": false
    }
  },
  "reason": "Task complexity (0.65) fits Sonnet's range (0.3-0.8)",
  "timestamp": "2025-10-16T12:00:00Z",
  "fallbackModels": ["claude-opus-4", "claude-haiku-4"]
}
```

### Cost Tracking Response

```json
{
  "entryId": "cost-1729080000-abc123",
  "modelName": "claude-sonnet-4.5",
  "timestamp": "2025-10-16T12:00:00Z",
  "cost": 0.12,
  "tokens": {
    "input": 5000,
    "output": 3000,
    "cached": 0
  },
  "taskType": "test-generation",
  "agentId": "agent-qe-test-generator-001",
  "budgetStatus": {
    "daily": {
      "used": 12.50,
      "limit": 100.00,
      "percentUsed": 12.5
    },
    "monthly": {
      "used": 350.00,
      "limit": 2000.00,
      "percentUsed": 17.5
    }
  }
}
```

### Stream Metadata Response

```json
{
  "streamId": "stream-1729080000-xyz789",
  "modelName": "claude-sonnet-4.5",
  "estimatedTokens": 8000,
  "capabilities": [
    "streaming",
    "code-generation",
    "reasoning"
  ],
  "session": {
    "startTime": "2025-10-16T12:00:00Z",
    "bufferSize": 1024,
    "backpressureThreshold": 0.8,
    "timeoutMs": 30000
  }
}
```

---

## Appendix B: Error Codes

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| ROUTER_001 | ModelSelectionFailed | Unable to select suitable model | Use default model |
| ROUTER_002 | BudgetExceeded | Cost budget threshold reached | Block request or use cheaper model |
| ROUTER_003 | NoAffordableModel | No models within budget | Increase budget or simplify task |
| STREAM_001 | BufferOverflow | Stream buffer full | Apply backpressure |
| STREAM_002 | StreamTimeout | Stream exceeded timeout | Retry with synchronous mode |
| STREAM_003 | ChunkValidationFailed | Invalid chunk received | Discard chunk and continue |
| COST_001 | CostCalculationFailed | Unable to calculate cost | Use estimated cost |
| COST_002 | BudgetAlertTriggered | Budget threshold alert | Notify administrators |

---

## Appendix C: Monitoring Metrics

### Key Metrics to Track

1. **Routing Metrics**
   - Model selection latency (p50, p95, p99)
   - Model selection distribution (% per model)
   - Routing accuracy (correct model selected)
   - Fallback rate (% using fallback model)

2. **Cost Metrics**
   - Total cost per model
   - Cost per task type
   - Budget consumption rate
   - Cost savings vs. single-model

3. **Streaming Metrics**
   - Stream success rate
   - Average chunk count per stream
   - Buffer utilization (peak, average)
   - Backpressure events
   - Stream timeout rate

4. **Performance Metrics**
   - Time to first chunk (TTFC)
   - Total stream duration
   - Throughput (chunks/second)
   - Memory usage (per stream, total)

### Monitoring Tools

- **Prometheus**: Metric collection
- **Grafana**: Visualization dashboards
- **Alertmanager**: Budget and error alerts
- **SwarmMemoryManager**: Historical data storage

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-16 | Architecture Team | Initial architecture design |

---

## References

1. AQE Fleet v1.0.4 Implementation
2. Anthropic API Documentation
3. Server-Sent Events (SSE) Specification
4. SPARC Methodology Documentation
5. SwarmMemoryManager Design Document
