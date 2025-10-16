# Phase 1 Integration Specification

**Multi-Model Router + Streaming MCP Tools**
**Version:** 1.0.5
**Date:** 2025-10-16

---

## Table of Contents

1. [Integration Overview](#integration-overview)
2. [FleetManager Integration](#fleetmanager-integration)
3. [BaseAgent Integration](#baseagent-integration)
4. [MCP Server Integration](#mcp-server-integration)
5. [Configuration Integration](#configuration-integration)
6. [Memory Integration](#memory-integration)
7. [Event Integration](#event-integration)
8. [Error Handling Integration](#error-handling-integration)
9. [Testing Integration](#testing-integration)
10. [Deployment Integration](#deployment-integration)

---

## 1. Integration Overview

### 1.1 Integration Goals

1. **Seamless Integration**: New components integrate without breaking existing functionality
2. **Feature Toggle**: All new features controlled by feature flags
3. **Backward Compatibility**: System works identically when features disabled
4. **Minimal Changes**: Leverage existing patterns and infrastructure
5. **Type Safety**: Maintain full TypeScript type checking

### 1.2 Integration Points Summary

```
Existing System          Integration Layer         New Components
───────────────          ─────────────────         ──────────────
FleetManager      ──────> Feature Check   ──────> ModelRouter
     │                         │
     ├─> Config          ─────┤
     │                         │
     └─> spawnAgent()    ──────> Pass Router ────> BaseAgent
                                     │
                                     └─────────────> StreamingMCPTool
```

### 1.3 Integration Dependencies

| Integration Point | Depends On | Affects | Risk Level |
|------------------|-----------|---------|-----------|
| FleetManager | Config, FeatureFlags | All agents | Low |
| BaseAgent | ModelRouter (optional) | Task execution | Low |
| MCP Server | StreamingMCPTool | Tool execution | Medium |
| Config | None | System-wide | Low |
| Memory | Existing SwarmMemoryManager | Storage | Low |

---

## 2. FleetManager Integration

### 2.1 Constructor Changes

**File:** `/src/core/FleetManager.ts`

**Before (v1.0.4):**

```typescript
export class FleetManager extends EventEmitter {
  private readonly id: string;
  private readonly agents: Map<string, Agent>;
  private readonly tasks: Map<string, Task>;
  private readonly eventBus: EventBus;
  private readonly database: Database;
  private readonly logger: Logger;
  private readonly config: FleetConfig;

  constructor(config: FleetConfig) {
    super();
    this.id = uuidv4();
    this.agents = new Map();
    this.tasks = new Map();
    this.eventBus = new EventBus();
    this.database = new Database();
    this.logger = Logger.getInstance();
    this.config = config;

    this.setupEventHandlers();
  }
}
```

**After (v1.0.5):**

```typescript
export class FleetManager extends EventEmitter {
  private readonly id: string;
  private readonly agents: Map<string, Agent>;
  private readonly tasks: Map<string, Task>;
  private readonly eventBus: EventBus;
  private readonly database: Database;
  private readonly logger: Logger;
  private readonly config: FleetConfig;

  // NEW: Optional model router
  private readonly modelRouter?: ModelRouter;

  // NEW: Feature flag manager
  private readonly featureFlags: FeatureFlagManager;

  constructor(config: FleetConfig) {
    super();
    this.id = uuidv4();
    this.agents = new Map();
    this.tasks = new Map();
    this.eventBus = new EventBus();
    this.database = new Database();
    this.logger = Logger.getInstance();
    this.config = config;

    // NEW: Initialize feature flags
    this.featureFlags = new FeatureFlagManager({
      flags: config.features || { multiModelRouter: false, streaming: false }
    });

    // NEW: Initialize ModelRouter if feature enabled
    if (this.featureFlags.isEnabled('multiModelRouter')) {
      this.modelRouter = new ModelRouter({
        models: config.routing?.models || [],
        memoryStore: this.memoryStore,
        eventBus: this.eventBus,
        logger: this.logger
      });

      this.logger.info('ModelRouter initialized', {
        modelCount: config.routing?.models?.length || 0
      });
    }

    this.setupEventHandlers();
  }
}
```

**Changes:**
- Added `modelRouter?: ModelRouter` property
- Added `featureFlags: FeatureFlagManager` property
- Conditional router initialization based on feature flag
- Added logging for router initialization

**Backward Compatibility:**
- If `config.features` is undefined, defaults to all features disabled
- If feature disabled, router is not created (undefined)
- No changes to existing functionality

### 2.2 Agent Spawning Changes

**Method:** `spawnAgent()`

**Before (v1.0.4):**

```typescript
async spawnAgent(type: string, config: any = {}): Promise<Agent> {
  const agentId = uuidv4();

  // Import agent factory and create agent
  const { createAgent } = await import('../agents');
  const agent = await createAgent(type, agentId, config, this.eventBus);

  this.agents.set(agentId, agent as any);
  await agent.initialize();

  this.logger.info(`Agent spawned: ${type} (${agentId})`);
  this.emit('agent:spawned', { agentId, type });

  return agent as any;
}
```

**After (v1.0.5):**

```typescript
async spawnAgent(type: string, config: any = {}): Promise<Agent> {
  const agentId = uuidv4();

  // NEW: Enhance config with router and feature flags
  const enhancedConfig = {
    ...config,
    // Pass router if available
    modelRouter: this.modelRouter,
    // Pass streaming flag
    streamingEnabled: this.featureFlags.isEnabled('streaming'),
    // Pass feature flags for agent-specific overrides
    features: this.config.features
  };

  // Import agent factory and create agent
  const { createAgent } = await import('../agents');
  const agent = await createAgent(type, agentId, enhancedConfig, this.eventBus);

  this.agents.set(agentId, agent as any);
  await agent.initialize();

  this.logger.info(`Agent spawned: ${type} (${agentId})`, {
    hasRouter: !!this.modelRouter,
    streamingEnabled: enhancedConfig.streamingEnabled
  });
  this.emit('agent:spawned', { agentId, type, config: enhancedConfig });

  return agent as any;
}
```

**Changes:**
- Config enhanced with `modelRouter`, `streamingEnabled`, `features`
- Enhanced logging with router and streaming status
- Event payload includes enhanced config

**Backward Compatibility:**
- Existing agents receive router as `undefined` if feature disabled
- Agents can check `config.modelRouter` before using
- No changes required in existing agent code

### 2.3 New Helper Methods

```typescript
/**
 * Check if a feature is enabled
 */
public isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return this.featureFlags.isEnabled(feature);
}

/**
 * Get current model router (if enabled)
 */
public getModelRouter(): ModelRouter | undefined {
  return this.modelRouter;
}

/**
 * Get routing statistics (if routing enabled)
 */
public async getRoutingStats(): Promise<ModelStatistics | null> {
  if (!this.modelRouter) {
    return null;
  }
  return await this.modelRouter.getModelStats();
}

/**
 * Get cost tracking data (if cost tracking enabled)
 */
public async getCostSummary(period: TimePeriod): Promise<CostSummary | null> {
  if (!this.modelRouter) {
    return null;
  }
  return await this.modelRouter.getCostTracker().getCosts(period);
}
```

---

## 3. BaseAgent Integration

### 3.1 Constructor Changes

**File:** `/src/agents/BaseAgent.ts`

**Before (v1.0.4):**

```typescript
export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
}

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected status: AgentStatus = AgentStatus.INITIALIZING;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context: AgentContext;
  protected readonly memoryStore: MemoryStore;
  protected readonly eventBus: EventEmitter;

  constructor(config: BaseAgentConfig) {
    super();

    this.agentId = {
      id: config.id || this.generateAgentId(config.type),
      type: config.type,
      created: new Date()
    };

    this.capabilities = new Map(
      config.capabilities.map(cap => [cap.name, cap])
    );

    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;

    this.setupEventHandlers();
    this.setupLifecycleHooks();
  }
}
```

**After (v1.0.5):**

```typescript
export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;

  // NEW: Optional router and feature flags
  modelRouter?: ModelRouter;
  streamingEnabled?: boolean;
  features?: FeatureFlags;
}

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected status: AgentStatus = AgentStatus.INITIALIZING;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context: AgentContext;
  protected readonly memoryStore: MemoryStore;
  protected readonly eventBus: EventEmitter;

  // NEW: Optional routing and streaming
  protected readonly modelRouter?: ModelRouter;
  protected readonly streamingEnabled: boolean;
  protected readonly features: FeatureFlags;

  constructor(config: BaseAgentConfig) {
    super();

    this.agentId = {
      id: config.id || this.generateAgentId(config.type),
      type: config.type,
      created: new Date()
    };

    this.capabilities = new Map(
      config.capabilities.map(cap => [cap.name, cap])
    );

    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;

    // NEW: Initialize router and feature flags
    this.modelRouter = config.modelRouter;
    this.streamingEnabled = config.streamingEnabled ?? false;
    this.features = config.features || {
      multiModelRouter: false,
      streaming: false
    };

    this.setupEventHandlers();
    this.setupLifecycleHooks();
  }
}
```

**Changes:**
- Added optional `modelRouter`, `streamingEnabled`, `features` to config
- Added corresponding properties to class
- Default streaming to `false` for backward compatibility

### 3.2 Task Execution Changes

**Method:** `performTask()`

**Before (v1.0.4):**

```typescript
protected abstract performTask(task: QETask): Promise<any>;
```

**After (v1.0.5):**

```typescript
/**
 * Perform the actual task work with optional routing and streaming
 *
 * @param task - The task to execute
 * @returns Promise<any> - Task result
 */
protected async performTask(task: QETask): Promise<any> {
  // NEW: Select model if router available
  let modelSelection: ModelSelection | undefined;

  if (this.modelRouter) {
    try {
      modelSelection = await this.modelRouter.selectModel(task);

      this.logger.info('Model selected by router', {
        agentId: this.agentId.id,
        taskType: task.type,
        selectedModel: modelSelection.modelName,
        complexity: modelSelection.complexity.overall,
        reason: modelSelection.reason
      });

      // Emit selection event
      this.emitEvent('model.selected', {
        agentId: this.agentId,
        taskId: task.id,
        selection: modelSelection
      });

    } catch (error) {
      this.logger.error('Model selection failed, using default', {
        agentId: this.agentId.id,
        error: error.message
      });

      // Use default model on failure
      modelSelection = this.getDefaultModelSelection();
    }
  }

  // NEW: Execute with streaming if enabled and supported
  if (this.streamingEnabled &&
      modelSelection?.modelConfig.capabilities.supportsStreaming) {

    return await this.executeTaskStreaming(task, modelSelection);

  } else {
    // Use synchronous execution (existing behavior)
    return await this.executeTaskSync(task, modelSelection);
  }
}

/**
 * Execute task with streaming
 */
private async executeTaskStreaming(
  task: QETask,
  selection: ModelSelection
): Promise<any> {
  const streamCallbacks: StreamCallbacks = {
    onStart: (metadata: StreamMetadata) => {
      this.emitEvent('task.stream.start', {
        agentId: this.agentId,
        taskId: task.id,
        metadata
      });
    },

    onChunk: (chunk: StreamChunk) => {
      this.emitEvent('task.stream.chunk', {
        agentId: this.agentId,
        taskId: task.id,
        chunk
      });
    },

    onProgress: (progress: ProgressInfo) => {
      this.updateTaskProgress(task.id, progress);
    },

    onError: (error: StreamError) => {
      this.handleStreamError(task.id, error);
    },

    onComplete: (result: StreamResult) => {
      this.emitEvent('task.stream.complete', {
        agentId: this.agentId,
        taskId: task.id,
        result
      });
    }
  };

  // Execute via streaming tool
  return await this.executeWithStreaming(task, selection, streamCallbacks);
}

/**
 * Execute task synchronously (existing behavior)
 */
private async executeTaskSync(
  task: QETask,
  selection?: ModelSelection
): Promise<any> {
  // Delegate to subclass implementation
  return await this.performTaskImpl(task, selection);
}

/**
 * Subclasses implement this instead of performTask
 */
protected abstract performTaskImpl(
  task: QETask,
  selection?: ModelSelection
): Promise<any>;
```

**Changes:**
- Added model selection logic
- Added streaming execution path
- Split into `executeTaskStreaming()` and `executeTaskSync()`
- Subclasses now implement `performTaskImpl()` instead of `performTask()`

**Migration for Existing Agents:**

```typescript
// Before (v1.0.4)
class TestGeneratorAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    // Implementation
  }
}

// After (v1.0.5)
class TestGeneratorAgent extends BaseAgent {
  // Rename method (backward compatible)
  protected async performTaskImpl(
    task: QETask,
    selection?: ModelSelection
  ): Promise<any> {
    // Same implementation, now with optional model selection
    // Can check selection.modelName if needed
  }
}
```

---

## 4. MCP Server Integration

### 4.1 Tool Registration

**File:** `/src/mcp/server.ts`

**Before (v1.0.4):**

```typescript
export async function createMCPServer(
  memoryStore: SwarmMemoryManager
): Promise<Server> {
  const server = new Server(
    {
      name: 'agentic-qe-mcp',
      version: '1.0.4',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools
  registerTestGeneratorTool(server, memoryStore);
  registerCoverageAnalyzerTool(server, memoryStore);
  registerQualityGateTool(server, memoryStore);

  return server;
}
```

**After (v1.0.5):**

```typescript
export async function createMCPServer(
  memoryStore: SwarmMemoryManager,
  config?: FleetConfig
): Promise<Server> {
  const server = new Server(
    {
      name: 'agentic-qe-mcp',
      version: '1.0.5',
    },
    {
      capabilities: {
        tools: {},
        // NEW: Declare streaming support
        streaming: config?.features?.streaming ?? false
      },
    }
  );

  // NEW: Check if streaming is enabled
  const streamingEnabled = config?.features?.streaming ?? false;

  // Register tools with optional streaming wrapper
  if (streamingEnabled) {
    registerStreamingTools(server, memoryStore);
  } else {
    // Use standard tools (existing behavior)
    registerStandardTools(server, memoryStore);
  }

  return server;
}

/**
 * Register tools with streaming capability
 */
function registerStreamingTools(
  server: Server,
  memoryStore: SwarmMemoryManager
): void {
  const tools = [
    new TestGeneratorTool(memoryStore),
    new CoverageAnalyzerTool(memoryStore),
    new QualityGateTool(memoryStore)
  ];

  tools.forEach(tool => {
    // Wrap with streaming capability if tool supports it
    if (tool.supportsStreaming && tool.supportsStreaming()) {
      const streamingTool = new StreamingMCPTool(tool, memoryStore);
      server.setRequestHandler(ListToolsRequestSchema, streamingTool);
    } else {
      // Register as standard tool
      server.setRequestHandler(ListToolsRequestSchema, tool);
    }
  });
}

/**
 * Register standard tools (existing behavior)
 */
function registerStandardTools(
  server: Server,
  memoryStore: SwarmMemoryManager
): void {
  registerTestGeneratorTool(server, memoryStore);
  registerCoverageAnalyzerTool(server, memoryStore);
  registerQualityGateTool(server, memoryStore);
}
```

**Changes:**
- Added optional `config` parameter to `createMCPServer()`
- Conditional tool registration based on streaming feature flag
- Wrapped tools with `StreamingMCPTool` when streaming enabled

### 4.2 Tool Interface Extension

**File:** `/src/mcp/tools/BaseMCPTool.ts`

```typescript
export abstract class BaseMCPTool {
  protected readonly memoryStore: SwarmMemoryManager;
  protected readonly logger: Logger;

  constructor(memoryStore: SwarmMemoryManager) {
    this.memoryStore = memoryStore;
    this.logger = Logger.getInstance();
  }

  abstract execute(params: any): Promise<any>;

  // NEW: Optional streaming support
  supportsStreaming?(): boolean {
    return false; // Default: no streaming support
  }

  // NEW: Optional streaming execution
  async executeStreaming?(
    params: any,
    callbacks: StreamCallbacks
  ): Promise<any> {
    throw new Error('Streaming not supported by this tool');
  }
}
```

**Backward Compatibility:**
- `supportsStreaming()` is optional, defaults to `false`
- `executeStreaming()` is optional, throws error if not implemented
- Existing tools work without modification

---

## 5. Configuration Integration

### 5.1 Configuration Schema Extension

**File:** `/src/utils/Config.ts`

```typescript
export interface FleetConfig {
  // ... existing config ...

  // NEW: Feature flags
  features?: {
    multiModelRouter?: boolean; // Default: false
    streaming?: boolean;         // Default: false
  };

  // NEW: Routing configuration
  routing?: {
    enabled: boolean;
    defaultModel?: string;
    models: ModelConfig[];
    complexity: {
      tokenWeighting: number;
      structureWeighting: number;
      contextWeighting: number;
    };
    costTracking: {
      enabled: boolean;
      budgetLimits?: {
        daily?: number;
        weekly?: number;
        monthly?: number;
      };
      alertThresholds?: {
        dailyPercent: number;
        monthlyPercent: number;
      };
    };
  };

  // NEW: Streaming configuration
  streaming?: {
    enabled: boolean;
    bufferSize: number;
    backpressureThreshold: number;
    timeoutMs: number;
    retryConfig: {
      maxRetries: number;
      backoffMs: number;
      backoffMultiplier: number;
    };
  };
}
```

### 5.2 Configuration Loading

**Existing Method:** `Config.load()`

```typescript
public static async load(configPath?: string): Promise<FleetConfig> {
  // ... existing logic ...

  // NEW: Add defaults for new config sections
  const defaultConfig: FleetConfig = {
    // ... existing defaults ...

    // NEW: Feature flags default to disabled
    features: {
      multiModelRouter: process.env.FEATURE_MULTI_MODEL_ROUTER === 'true',
      streaming: process.env.FEATURE_STREAMING === 'true'
    },

    // NEW: Routing config (only if feature enabled)
    routing: process.env.FEATURE_MULTI_MODEL_ROUTER === 'true' ? {
      enabled: true,
      defaultModel: process.env.ROUTING_DEFAULT_MODEL || 'claude-sonnet-4.5',
      models: [], // Load from file
      complexity: {
        tokenWeighting: parseFloat(process.env.COMPLEXITY_TOKEN_WEIGHT || '0.4'),
        structureWeighting: parseFloat(process.env.COMPLEXITY_STRUCTURE_WEIGHT || '0.3'),
        contextWeighting: parseFloat(process.env.COMPLEXITY_CONTEXT_WEIGHT || '0.3')
      },
      costTracking: {
        enabled: process.env.COST_TRACKING_ENABLED === 'true',
        budgetLimits: {
          daily: parseFloat(process.env.BUDGET_LIMIT_DAILY || '0'),
          monthly: parseFloat(process.env.BUDGET_LIMIT_MONTHLY || '0')
        }
      }
    } : undefined,

    // NEW: Streaming config (only if feature enabled)
    streaming: process.env.FEATURE_STREAMING === 'true' ? {
      enabled: true,
      bufferSize: parseInt(process.env.STREAMING_BUFFER_SIZE || '1024'),
      backpressureThreshold: parseFloat(process.env.STREAMING_BACKPRESSURE || '0.8'),
      timeoutMs: parseInt(process.env.STREAMING_TIMEOUT_MS || '30000'),
      retryConfig: {
        maxRetries: parseInt(process.env.STREAMING_MAX_RETRIES || '3'),
        backoffMs: parseInt(process.env.STREAMING_BACKOFF_MS || '1000'),
        backoffMultiplier: parseFloat(process.env.STREAMING_BACKOFF_MULT || '2')
      }
    } : undefined
  };

  // ... rest of loading logic ...
}
```

**Backward Compatibility:**
- All new config sections are optional
- Features default to `false` (disabled)
- Existing configs work without modification
- Environment variables provide override capability

---

## 6. Memory Integration

### 6.1 Memory Partition Setup

**New Partitions:**

```typescript
// Add to SwarmMemoryManager initialization
const ROUTING_PARTITIONS = {
  COSTS: 'routing/costs',
  SELECTIONS: 'routing/selections',
  STATS: 'routing/stats'
};

const STREAMING_PARTITIONS = {
  SESSIONS: 'streaming/sessions',
  BUFFER: 'streaming/buffer',
  METADATA: 'streaming/metadata'
};
```

### 6.2 Cost Tracking Storage

**CostTracker Integration:**

```typescript
export class CostTracker {
  async track(
    selection: ModelSelection,
    usage: TokenUsage
  ): Promise<void> {
    const cost = this.calculateCost(usage, selection.modelConfig);

    const entry: CostEntry = {
      id: `cost-${Date.now()}-${uuidv4()}`,
      modelName: selection.modelName,
      timestamp: new Date(),
      cost,
      tokens: usage,
      taskType: selection.task?.type,
      agentId: selection.agentId
    };

    // Store in memory with proper partition and TTL
    await this.memoryStore.store(
      `routing/costs/${entry.id}`,
      entry,
      {
        partition: 'coordination',
        ttl: 30 * 24 * 60 * 60, // 30 days
        owner: 'system',
        accessLevel: AccessLevel.SYSTEM
      }
    );

    // Update daily aggregate
    const dailyKey = `routing/costs/daily/${this.formatDate(new Date())}`;
    const dailyTotal = await this.memoryStore.retrieve(dailyKey) || 0;

    await this.memoryStore.store(
      dailyKey,
      dailyTotal + cost,
      {
        partition: 'coordination',
        ttl: 30 * 24 * 60 * 60,
        owner: 'system',
        accessLevel: AccessLevel.SWARM
      }
    );

    // Emit cost event
    this.eventBus.emit('cost.tracked', {
      entry,
      dailyTotal: dailyTotal + cost
    });
  }
}
```

### 6.3 Streaming Session Storage

**StreamManager Integration:**

```typescript
export class StreamManager {
  async startStream(
    streamId: string,
    metadata: StreamMetadata
  ): Promise<void> {
    // Store session metadata
    await this.memoryStore.store(
      `streaming/sessions/${streamId}`,
      {
        id: streamId,
        startTime: Date.now(),
        metadata,
        status: 'active'
      },
      {
        partition: 'coordination',
        ttl: 3600, // 1 hour
        owner: metadata.agentId,
        accessLevel: AccessLevel.PRIVATE
      }
    );
  }

  async storeChunk(
    streamId: string,
    chunk: StreamChunk
  ): Promise<void> {
    // Store chunk with short TTL
    await this.memoryStore.store(
      `streaming/buffer/${streamId}/${chunk.sequence}`,
      chunk,
      {
        partition: 'coordination',
        ttl: 300, // 5 minutes
        owner: chunk.agentId,
        accessLevel: AccessLevel.PRIVATE
      }
    );
  }
}
```

---

## 7. Event Integration

### 7.1 New Event Types

```typescript
// Add to EventBus types
export type QEEventType =
  | 'agent.initialized'
  | 'agent.error'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  // NEW: Routing events
  | 'model.selected'
  | 'model.fallback'
  | 'routing.error'
  // NEW: Cost events
  | 'cost.tracked'
  | 'cost.budget.warning'
  | 'cost.budget.exceeded'
  // NEW: Streaming events
  | 'stream.start'
  | 'stream.chunk'
  | 'stream.progress'
  | 'stream.error'
  | 'stream.complete';
```

### 7.2 Event Payloads

```typescript
// Routing Events
interface ModelSelectedEvent {
  type: 'model.selected';
  data: {
    agentId: AgentId;
    taskId: string;
    selection: ModelSelection;
  };
}

// Cost Events
interface CostTrackedEvent {
  type: 'cost.tracked';
  data: {
    entry: CostEntry;
    dailyTotal: number;
    budgetStatus: BudgetStatus;
  };
}

// Streaming Events
interface StreamChunkEvent {
  type: 'stream.chunk';
  data: {
    agentId: AgentId;
    streamId: string;
    chunk: StreamChunk;
  };
}
```

### 7.3 Event Handler Registration

```typescript
// In FleetManager or BaseAgent
this.registerEventHandler({
  eventType: 'model.selected',
  handler: async (event: ModelSelectedEvent) => {
    this.logger.info('Model selected', event.data);
    // Optional: Update agent metrics
  }
});

this.registerEventHandler({
  eventType: 'cost.budget.warning',
  handler: async (event: CostBudgetWarningEvent) => {
    this.logger.warn('Budget threshold reached', event.data);
    // Optional: Send alert
  },
  priority: 'high'
});

this.registerEventHandler({
  eventType: 'stream.error',
  handler: async (event: StreamErrorEvent) => {
    this.logger.error('Stream error', event.data);
    // Optional: Trigger fallback
  },
  priority: 'critical'
});
```

---

## 8. Error Handling Integration

### 8.1 Error Hierarchy

```typescript
// New error types
export class RoutingError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RoutingError';
  }
}

export class ModelSelectionError extends RoutingError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ModelSelectionError';
  }
}

export class BudgetExceededError extends RoutingError {
  constructor(
    message: string,
    public readonly budgetType: 'daily' | 'monthly',
    public readonly current: number,
    public readonly limit: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class StreamingError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'StreamingError';
  }
}

export class BufferOverflowError extends StreamingError {
  constructor(message: string) {
    super(message);
    this.name = 'BufferOverflowError';
  }
}
```

### 8.2 Error Recovery Strategies

```typescript
// In ModelRouter
async selectModel(task: QETask): Promise<ModelSelection> {
  try {
    const complexity = await this.complexityAnalyzer.analyze(task);
    return await this.selectBestModel(complexity);

  } catch (error) {
    this.logger.error('Model selection failed', { error, task });

    // Fallback strategy
    if (error instanceof BudgetExceededError) {
      // Use cheapest model
      return this.selectCheapestModel(task);
    } else {
      // Use default model
      return this.getDefaultModelSelection(task);
    }
  }
}

// In StreamingMCPTool
async executeStreaming(
  params: any,
  callbacks: StreamCallbacks
): Promise<any> {
  let retries = 0;
  const maxRetries = this.config.retryConfig.maxRetries;

  while (retries <= maxRetries) {
    try {
      return await this.executeStreamingAttempt(params, callbacks);

    } catch (error) {
      retries++;

      if (error instanceof BufferOverflowError) {
        // Apply backpressure and retry
        await this.applyBackpressure();
        continue;
      }

      if (error instanceof StreamTimeoutError && retries <= maxRetries) {
        // Exponential backoff
        const backoff = this.config.retryConfig.backoffMs *
                       Math.pow(this.config.retryConfig.backoffMultiplier, retries);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      // Max retries exceeded or unrecoverable error
      this.logger.error('Streaming failed, falling back to sync', { error });

      // Fallback to synchronous execution
      return await this.executeSync(params);
    }
  }
}
```

---

## 9. Testing Integration

### 9.1 Test Configuration

```typescript
// Create test config with features enabled
export function createTestConfig(overrides?: Partial<FleetConfig>): FleetConfig {
  return {
    fleet: {
      id: 'test-fleet',
      name: 'Test Fleet',
      maxAgents: 10,
      heartbeatInterval: 30000,
      taskTimeout: 300000
    },
    agents: [],
    database: {
      type: 'sqlite',
      database: ':memory:',
      filename: ':memory:'
    },
    logging: {
      level: 'error',
      format: 'json',
      outputs: ['console']
    },
    api: {
      port: 3000,
      host: 'localhost',
      cors: false,
      rateLimit: { windowMs: 900000, max: 100 }
    },
    security: {
      encryption: { algorithm: 'aes-256-gcm', keyLength: 32 }
    },
    // NEW: Enable features for testing
    features: {
      multiModelRouter: true,
      streaming: true,
      ...overrides?.features
    },
    // NEW: Routing config
    routing: {
      enabled: true,
      defaultModel: 'claude-sonnet-4.5',
      models: createTestModels(),
      complexity: {
        tokenWeighting: 0.4,
        structureWeighting: 0.3,
        contextWeighting: 0.3
      },
      costTracking: {
        enabled: true,
        budgetLimits: {
          daily: 100.00,
          monthly: 2000.00
        },
        alertThresholds: {
          dailyPercent: 0.8,
          monthlyPercent: 0.9
        }
      },
      ...overrides?.routing
    },
    // NEW: Streaming config
    streaming: {
      enabled: true,
      bufferSize: 1024,
      backpressureThreshold: 0.8,
      timeoutMs: 5000, // Lower for tests
      retryConfig: {
        maxRetries: 2, // Lower for tests
        backoffMs: 100, // Lower for tests
        backoffMultiplier: 2
      },
      ...overrides?.streaming
    },
    ...overrides
  };
}
```

### 9.2 Integration Test Example

```typescript
describe('FleetManager with Routing', () => {
  let fleetManager: FleetManager;
  let memoryStore: SwarmMemoryManager;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    const config = createTestConfig({
      features: {
        multiModelRouter: true,
        streaming: false // Test routing separately
      }
    });

    fleetManager = new FleetManager(config);
    await fleetManager.initialize();
  });

  afterEach(async () => {
    await fleetManager.stop();
    await memoryStore.close();
  });

  it('should use model router when enabled', async () => {
    const agent = await fleetManager.spawnAgent('test-generator');
    expect(agent.modelRouter).toBeDefined();
  });

  it('should select appropriate model based on complexity', async () => {
    const agent = await fleetManager.spawnAgent('test-generator');

    const complexTask = createComplexTask();
    const selection = await agent.modelRouter!.selectModel(complexTask);

    expect(selection.modelName).toBe('claude-opus-4');
    expect(selection.complexity.overall).toBeGreaterThan(0.7);
  });
});
```

---

## 10. Deployment Integration

### 10.1 Deployment Checklist

**Pre-Deployment:**
- [ ] Run full test suite with features enabled
- [ ] Verify backward compatibility tests pass
- [ ] Load test with routing enabled
- [ ] Verify cost tracking accuracy
- [ ] Test streaming with various network conditions
- [ ] Review configuration migration script
- [ ] Update documentation

**Deployment:**
- [ ] Deploy with features DISABLED initially
- [ ] Verify existing functionality unchanged
- [ ] Enable routing for specific agent types
- [ ] Monitor performance and costs
- [ ] Enable streaming for low-risk tasks
- [ ] Gradually increase rollout
- [ ] Monitor error rates and fallback frequency

**Post-Deployment:**
- [ ] Collect metrics on model selection accuracy
- [ ] Analyze cost savings vs. single model
- [ ] Review streaming performance improvements
- [ ] Gather user feedback on perceived latency
- [ ] Identify optimization opportunities

### 10.2 Rollback Procedure

**Immediate Rollback (if critical issues):**

```yaml
# Update config file or env vars
features:
  multiModelRouter: false
  streaming: false

# System automatically reverts to v1.0.4 behavior
# No restart required (hot reload)
```

**Graceful Rollback (if minor issues):**

1. Disable feature for new agents only
2. Allow existing agents to complete current tasks
3. Monitor for stabilization
4. Investigate and fix issues
5. Re-enable feature

### 10.3 Monitoring Setup

**Key Metrics to Track:**

```typescript
// Prometheus metrics
const routingMetrics = {
  model_selection_duration: new Histogram({
    name: 'model_selection_duration_seconds',
    help: 'Time to select model',
    labelNames: ['agent_type', 'task_type']
  }),

  model_usage_total: new Counter({
    name: 'model_usage_total',
    help: 'Total model usage count',
    labelNames: ['model_name']
  }),

  cost_per_task: new Histogram({
    name: 'cost_per_task_dollars',
    help: 'Cost per task in dollars',
    labelNames: ['model_name', 'task_type']
  }),

  streaming_chunk_rate: new Gauge({
    name: 'streaming_chunk_rate_per_second',
    help: 'Chunks processed per second',
    labelNames: ['agent_id']
  }),

  buffer_utilization: new Gauge({
    name: 'streaming_buffer_utilization_percent',
    help: 'Buffer usage percentage',
    labelNames: ['agent_id', 'stream_id']
  })
};
```

---

## Document Version

Version: 1.0
Date: 2025-10-16
Author: System Architecture Team
