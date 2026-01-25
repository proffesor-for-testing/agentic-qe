# Phase 1 Component Diagram

**Component Overview: Multi-Model Router + Streaming Integration**

---

## High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENTIC QE FLEET SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      FLEET MANAGEMENT LAYER                         │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                      FleetManager                            │  │   │
│  │  │  - Lifecycle management                                      │  │   │
│  │  │  - Agent spawning                                            │  │   │
│  │  │  - Task coordination                                         │  │   │
│  │  │  - Feature flag evaluation                                   │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                  │                                          │
│                    ┌─────────────┼─────────────┐                           │
│                    │             │             │                           │
│                    ▼             ▼             ▼                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ROUTING & STREAMING LAYER                        │   │
│  │                                                                     │   │
│  │  ┌────────────────────┐  ┌──────────────────┐  ┌────────────────┐ │   │
│  │  │   ModelRouter      │  │ StreamingMCPTool │  │  CostTracker   │ │   │
│  │  ├────────────────────┤  ├──────────────────┤  ├────────────────┤ │   │
│  │  │ - Select model     │  │ - Stream mgmt    │  │ - Track costs  │ │   │
│  │  │ - Complexity calc  │  │ - Buffer control │  │ - Budget check │ │   │
│  │  │ - Fallback logic   │  │ - Backpressure   │  │ - Alert mgmt   │ │   │
│  │  └────────────────────┘  └──────────────────┘  └────────────────┘ │   │
│  │           │                       │                      │         │   │
│  │           └───────────┬───────────┴──────────────────────┘         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       AGENT EXECUTION LAYER                         │   │
│  │                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │                      BaseAgent                               │  │   │
│  │  │  ┌────────────────────────────────────────────────────────┐  │  │   │
│  │  │  │  Lifecycle Hooks (AQE Native)                         │  │  │   │
│  │  │  │  - onPreTask()  - onPostTask()                        │  │  │   │
│  │  │  │  - onTaskError() - onPreTermination()                 │  │  │   │
│  │  │  └────────────────────────────────────────────────────────┘  │  │   │
│  │  │                                                              │  │   │
│  │  │  ┌────────────────────────────────────────────────────────┐  │  │   │
│  │  │  │  Agent Specializations                                 │  │  │   │
│  │  │  │  - TestGeneratorAgent                                  │  │  │   │
│  │  │  │  - TestExecutorAgent                                   │  │  │   │
│  │  │  │  - CoverageAnalyzerAgent                              │  │  │   │
│  │  │  │  - QualityGateAgent                                   │  │  │   │
│  │  │  └────────────────────────────────────────────────────────┘  │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     COORDINATION LAYER                              │   │
│  │                                                                     │   │
│  │  ┌────────────────────┐  ┌──────────────────┐  ┌────────────────┐ │   │
│  │  │   EventBus         │  │ SwarmMemoryMgr   │  │ VerificationHooks│ │   │
│  │  ├────────────────────┤  ├──────────────────┤  ├────────────────┤ │   │
│  │  │ - Event routing    │  │ - 12-table DB    │  │ - Pre-task     │ │   │
│  │  │ - Pub/Sub          │  │ - TTL policies   │  │ - Post-task    │ │   │
│  │  │ - Priority queues  │  │ - Access control │  │ - Validation   │ │   │
│  │  └────────────────────┘  └──────────────────┘  └────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     EXTERNAL INTEGRATION LAYER                      │   │
│  │                                                                     │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐ │   │
│  │  │ Anthropic API  │  │   OpenAI API   │  │    Google AI API     │ │   │
│  │  │ - Claude models│  │ - GPT models   │  │ - Gemini models      │ │   │
│  │  │ - Streaming    │  │ - Streaming    │  │ - Streaming          │ │   │
│  │  └────────────────┘  └────────────────┘  └──────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Interaction Matrix

| Component | Depends On | Used By | Key Interfaces |
|-----------|-----------|---------|---------------|
| FleetManager | EventBus, SwarmMemoryManager, Config | CLI, API | `initialize()`, `spawnAgent()`, `submitTask()` |
| ModelRouter | SwarmMemoryManager, ComplexityAnalyzer, CostTracker | FleetManager, BaseAgent | `selectModel()`, `trackCost()` |
| StreamingMCPTool | MCPTool, StreamManager, BufferManager | BaseAgent | `executeStreaming()`, `supportsStreaming()` |
| CostTracker | SwarmMemoryManager | ModelRouter | `track()`, `getCosts()`, `checkBudget()` |
| BaseAgent | EventBus, SwarmMemoryManager, ModelRouter, VerificationHookManager | FleetManager | `executeTask()`, `initialize()`, `terminate()` |
| SwarmMemoryManager | BetterSqlite3 | All components | `store()`, `retrieve()`, `query()` |
| EventBus | None | All components | `emit()`, `on()`, `off()` |

---

## Data Flow Between Components

```
┌──────────┐
│   User   │
└─────┬────┘
      │
      │ 1. Submit Task
      ▼
┌─────────────────┐
│  FleetManager   │
└────┬────────────┘
     │
     │ 2. Check Features
     ▼
┌─────────────────────────────────────────┐
│  if (features.multiModelRouter)         │
│    ├─> ModelRouter.selectModel()        │
│    │     ├─> ComplexityAnalyzer         │
│    │     │     └─> Return ComplexityScore│
│    │     ├─> CostTracker.checkBudget()  │
│    │     │     └─> Return BudgetStatus   │
│    │     └─> Return ModelSelection      │
│    └─> Pass selection to Agent          │
│  else                                    │
│    └─> Use default model                │
└─────────────────────────────────────────┘
     │
     │ 3. Execute Task
     ▼
┌──────────────────────────────────────────┐
│           BaseAgent                      │
│  ┌────────────────────────────────────┐ │
│  │ if (streamingEnabled)              │ │
│  │   ├─> StreamingMCPTool.execute()  │ │
│  │   │     ├─> onStart callback      │ │
│  │   │     ├─> onChunk callbacks     │ │
│  │   │     └─> onComplete callback   │ │
│  │ else                               │ │
│  │   └─> MCPTool.execute()           │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
     │
     │ 4. Track Cost
     ▼
┌──────────────────────────────────────────┐
│         CostTracker                      │
│  - Calculate cost from token usage       │
│  - Store in SwarmMemoryManager           │
│  - Check budget thresholds               │
│  - Emit alert if needed                  │
└──────────────────────────────────────────┘
     │
     │ 5. Persist State
     ▼
┌──────────────────────────────────────────┐
│      SwarmMemoryManager                  │
│  Partitions:                             │
│  - routing/costs/*                       │
│  - routing/selections/*                  │
│  - streaming/sessions/*                  │
└──────────────────────────────────────────┘
     │
     │ 6. Return Result
     ▼
┌──────────┐
│   User   │
└──────────┘
```

---

## Component Responsibility Matrix

### ModelRouter

**Primary Responsibilities:**
- Analyze task complexity
- Select optimal model based on complexity + cost + availability
- Provide fallback models
- Interface with CostTracker

**Input:**
- `QETask` with metadata (type, description, context)

**Output:**
- `ModelSelection` with selected model, complexity score, reason

**Dependencies:**
- `ComplexityAnalyzer` (composition)
- `CostTracker` (composition)
- `SwarmMemoryManager` (injection)

**File Location:** `/src/core/routing/ModelRouter.ts`

---

### StreamingMCPTool

**Primary Responsibilities:**
- Wrap MCP tools with streaming capability
- Manage stream lifecycle (start, chunk, complete)
- Handle backpressure and buffer overflow
- Provide graceful degradation to sync mode

**Input:**
- MCP tool parameters
- Stream callbacks (optional)

**Output:**
- Stream of chunks (async iterator) OR complete result

**Dependencies:**
- `MCPTool` (wrapper target)
- `StreamManager` (composition)
- `BufferManager` (composition)

**File Location:** `/src/mcp/tools/StreamingMCPTool.ts`

---

### CostTracker

**Primary Responsibilities:**
- Track API costs per model
- Enforce budget limits
- Generate cost reports
- Alert on threshold breaches

**Input:**
- `ModelSelection` (model used)
- `TokenUsage` (input/output tokens)

**Output:**
- `CostEntry` (stored in memory)
- `BudgetStatus` (available budget)

**Dependencies:**
- `SwarmMemoryManager` (injection)

**File Location:** `/src/core/routing/CostTracker.ts`

---

### FleetManager

**Enhanced Responsibilities (v1.0.5):**
- Initialize ModelRouter if feature enabled
- Pass router to agents during spawn
- Manage feature flag evaluation
- Coordinate routing and streaming

**New Dependencies:**
- `ModelRouter` (optional, based on feature flag)
- `FeatureFlagManager` (composition)

**Modified Methods:**
- `constructor()` - Initialize router
- `spawnAgent()` - Pass router to agents

**File Location:** `/src/core/FleetManager.ts`

---

### BaseAgent

**Enhanced Responsibilities (v1.0.5):**
- Accept ModelRouter in config
- Execute tasks with streaming if enabled
- Emit streaming events (start, chunk, complete)
- Handle streaming errors gracefully

**New Dependencies:**
- `ModelRouter` (optional injection)
- `StreamingMCPTool` (conditional use)

**Modified Methods:**
- `constructor()` - Accept router config
- `performTask()` - Route through router
- `executeTaskStreaming()` - New method for streaming

**File Location:** `/src/agents/BaseAgent.ts`

---

## Interface Contracts

### IModelRouter

```typescript
interface IModelRouter {
  selectModel(task: QETask): Promise<ModelSelection>;
  registerModel(config: ModelConfig): void;
  trackCost(selection: ModelSelection, usage: TokenUsage): Promise<void>;
  getModelStats(): Promise<ModelStatistics>;
}
```

### IStreamingTool

```typescript
interface IStreamingTool {
  execute(params: any, callbacks?: StreamCallbacks): Promise<any>;
  executeStreaming(params: any, onChunk: ChunkCallback): AsyncIterator<StreamChunk>;
  supportsStreaming(): boolean;
}
```

### ICostTracker

```typescript
interface ICostTracker {
  track(selection: ModelSelection, usage: TokenUsage): Promise<void>;
  getCosts(period: TimePeriod): Promise<CostSummary>;
  checkBudget(modelName?: string): Promise<BudgetStatus>;
  exportReport(format: 'json' | 'csv'): Promise<string>;
}
```

---

## Component Lifecycle States

### ModelRouter States

```
┌──────────────┐
│ Uninitialized│
└──────┬───────┘
       │ initialize()
       ▼
┌──────────────┐
│  Initialized │──────┐
└──────┬───────┘      │ registerModel()
       │              │
       │              ▼
       │      ┌──────────────┐
       │      │Models Loaded │
       │      └──────┬───────┘
       │             │
       ▼             ▼
┌──────────────────────┐
│       Ready          │◀───────┐
└──────┬───────────────┘        │
       │                        │ selectModel()
       │ selectModel()          │ (continues)
       ▼                        │
┌──────────────────────┐        │
│   Model Selected     │────────┘
└──────────────────────┘
```

### StreamingMCPTool States

```
┌──────────────┐
│     Idle     │
└──────┬───────┘
       │ executeStreaming()
       ▼
┌──────────────┐
│  Connecting  │
└──────┬───────┘
       │ API connection established
       ▼
┌──────────────┐
│  Streaming   │──────────┐
└──────┬───────┘          │ onChunk loop
       │                  │
       │                  ▼
       │          ┌──────────────┐
       │          │ Buffering    │
       │          └──────┬───────┘
       │                 │
       │                 ▼
       │          ┌──────────────┐
       │          │Backpressure? │
       │          └──────┬───────┘
       │                 │
       │         [YES]   │   [NO]
       │                 ▼
       ▼          ┌──────────────┐
┌──────────────┐  │ Throttling   │
│ Completing   │  └──────┬───────┘
└──────┬───────┘         │
       │                 │
       │                 └──────────┐
       │                            │
       ▼                            ▼
┌──────────────┐          ┌──────────────┐
│  Completed   │          │   Continue   │
└──────────────┘          └──────────────┘
```

---

## Error Handling Flow

```
┌──────────────────────────────────────────────────┐
│           Error Occurs in Component              │
└──────────────────────┬───────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌────────────────┐          ┌────────────────┐
│  Routing Error │          │ Streaming Error│
└────────┬───────┘          └────────┬───────┘
         │                           │
         ▼                           ▼
┌────────────────┐          ┌────────────────┐
│Use Fallback    │          │ Retry Stream   │
│Model           │          └────────┬───────┘
└────────┬───────┘                   │
         │                           │ [Max retries exceeded]
         │                           ▼
         │                  ┌────────────────┐
         │                  │Fallback to Sync│
         │                  └────────┬───────┘
         │                           │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Log Error to Memory  │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Emit Error Event      │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Continue Execution    │
         └───────────────────────┘
```

---

## Configuration Component

```
┌────────────────────────────────────────────────┐
│               Config System                    │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │        Config.load()                     │ │
│  │  1. Load environment variables           │ │
│  │  2. Load config file (YAML/JSON)         │ │
│  │  3. Merge with defaults                  │ │
│  │  4. Validate schema                      │ │
│  └──────────────────────────────────────────┘ │
│                     │                          │
│                     ▼                          │
│  ┌──────────────────────────────────────────┐ │
│  │         FleetConfig                      │ │
│  │  - fleet: { id, name, maxAgents, ... }  │ │
│  │  - features: FeatureFlags                │ │
│  │  - routing: RoutingConfig                │ │
│  │  - streaming: StreamingConfig            │ │
│  └──────────────────────────────────────────┘ │
│                     │                          │
│        ┌────────────┼────────────┐             │
│        │            │            │             │
│        ▼            ▼            ▼             │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Fleet   │ │  Router  │ │Streaming │       │
│  │ Manager │ │  Config  │ │  Config  │       │
│  └─────────┘ └──────────┘ └──────────┘       │
└────────────────────────────────────────────────┘
```

---

## Memory Component Integration

```
┌──────────────────────────────────────────────────────┐
│          SwarmMemoryManager Integration              │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │         Memory Partitions                      │ │
│  │                                                │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  │ │
│  │  │ routing/costs    │  │routing/selections│  │ │
│  │  │ TTL: 30 days     │  │ TTL: 7 days      │  │ │
│  │  └──────────────────┘  └──────────────────┘  │ │
│  │                                                │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  │ │
│  │  │streaming/sessions│  │streaming/buffer  │  │ │
│  │  │ TTL: 1 hour      │  │ TTL: 5 minutes   │  │ │
│  │  └──────────────────┘  └──────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │          Access Control Levels                 │ │
│  │                                                │ │
│  │  ┌──────────────────────────────────────────┐ │ │
│  │  │ PRIVATE  - Agent-only access             │ │ │
│  │  │ TEAM     - Team-level sharing            │ │ │
│  │  │ SWARM    - Fleet-wide sharing            │ │ │
│  │  │ PUBLIC   - Public access                 │ │ │
│  │  │ SYSTEM   - System-level (cost data)      │ │ │
│  │  └──────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │           Operations                           │ │
│  │                                                │ │
│  │  store(key, value, options)                   │ │
│  │  retrieve(key, options)                       │ │
│  │  query(pattern, options)                      │ │
│  │  delete(key, partition, options)              │ │
│  │  cleanExpired()                               │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## Component Size and Complexity

| Component | LoC (Est.) | Complexity | Test Coverage Target |
|-----------|-----------|-----------|---------------------|
| ModelRouter | 500 | Medium | 95% |
| ComplexityAnalyzer | 300 | Low | 98% |
| CostTracker | 400 | Low | 98% |
| StreamingMCPTool | 600 | High | 90% |
| StreamManager | 400 | High | 90% |
| BufferManager | 300 | Medium | 95% |
| FleetManager (changes) | +100 | Low | 95% |
| BaseAgent (changes) | +200 | Medium | 95% |
| FeatureFlagManager | 200 | Low | 98% |
| **Total New Code** | **3000** | - | **95%** |

---

## Deployment Dependencies

```
┌─────────────────────────────────────────┐
│    External Dependencies (Runtime)      │
├─────────────────────────────────────────┤
│ - @anthropic-ai/sdk (existing)          │
│ - better-sqlite3 (existing)             │
│ - ws (existing)                         │
│ - No NEW dependencies required          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│   Internal Dependencies (Existing)      │
├─────────────────────────────────────────┤
│ - SwarmMemoryManager                    │
│ - EventBus                              │
│ - VerificationHookManager               │
│ - Logger                                │
│ - Config                                │
└─────────────────────────────────────────┘
```

---

## Backward Compatibility Layer

```
┌──────────────────────────────────────────────┐
│      Compatibility Wrapper                   │
├──────────────────────────────────────────────┤
│                                              │
│  if (features.multiModelRouter) {            │
│    // Use new routing system                 │
│    selection = await router.selectModel(task)│
│  } else {                                    │
│    // Use legacy single-model approach       │
│    selection = {                             │
│      modelName: 'claude-sonnet-4.5',        │
│      modelConfig: defaultModelConfig,        │
│      complexity: null,                       │
│      reason: 'Feature disabled'              │
│    }                                         │
│  }                                           │
│                                              │
│  if (features.streaming &&                   │
│      selection.modelConfig.supportsStreaming)│
│    // Use streaming execution                │
│    return executeStreaming(task, selection)  │
│  } else {                                    │
│    // Use synchronous execution              │
│    return executeSync(task, selection)       │
│  }                                           │
└──────────────────────────────────────────────┘
```

---

## Document Version

Version: 1.0
Date: 2025-10-16
Author: System Architecture Team
