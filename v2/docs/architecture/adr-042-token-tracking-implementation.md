# ADR-042 Token Tracking Integration - Implementation Architecture

## Overview

This document specifies the file-by-file implementation architecture for ADR-042 Token Tracking Integration. The system enables:
- Tracking token usage across agents, tasks, and sessions
- Pattern-based token optimization via early exit decisions
- MCP tool exposure for token usage analysis

## Architecture Diagram (C4 Component Level)

```
+------------------------------------------------------------------+
|                     Agentic QE v3 Kernel                          |
+------------------------------------------------------------------+
       |                    |                      |
       v                    v                      v
+----------------+  +------------------+  +--------------------+
| TokenMetrics   |  | PatternStore     |  | EarlyExitToken     |
| Collector      |  | (Extended)       |  | Optimizer          |
| (learning/)    |  | (learning/)      |  | (optimization/)    |
+----------------+  +------------------+  +--------------------+
       |                    |                      |
       |                    v                      |
       |           +------------------+            |
       |           | HNSW Index       |            |
       |           | (Pattern Search) |            |
       |           +------------------+            |
       |                    |                      |
       +--------------------+----------------------+
                           |
                           v
                  +------------------+
                  | MCP Tool:        |
                  | token_usage      |
                  | (mcp/tools/)     |
                  +------------------+
```

## File Dependencies Graph

```
v3/src/shared/types/index.ts                    [EXTEND]
        ^
        |
v3/src/learning/token-tracker.ts                [NEW]
        ^
        |
v3/src/learning/qe-patterns.ts                  [EXTEND]
        ^
        |
v3/src/learning/pattern-store.ts                [EXTEND]
        ^
        |
v3/src/optimization/early-exit-token-optimizer.ts  [NEW]
        ^
        |
v3/src/mcp/tools/analysis/token-usage.ts        [NEW]
        ^
        |
v3/src/mcp/tools/registry.ts                    [EXTEND]
```

---

## 1. Token Tracking Module

**File:** `/workspaces/agentic-qe/v3/src/learning/token-tracker.ts`

**Status:** NEW

**Dependencies:**
- `../shared/types/index.ts` (DomainName, Result, ok, err)
- `../kernel/interfaces.ts` (MemoryBackend)
- `uuid` (v4)

### 1.1 Interfaces

```typescript
/**
 * Token usage for a single LLM call
 */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly model?: string;
  readonly timestamp: Date;
}

/**
 * Token metrics for a task execution
 */
export interface TaskTokenMetric {
  readonly taskId: string;
  readonly agentId: string;
  readonly domain: DomainName;
  readonly tokensUsed: TokenUsage;
  readonly latencyMs: number;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly patternId?: string;       // If pattern was reused
  readonly patternReused: boolean;   // Was a pattern reused?
  readonly tokensSaved?: number;     // Estimated tokens saved via reuse
  readonly success: boolean;
}

/**
 * Aggregated token metrics for an agent
 */
export interface AgentTokenMetrics {
  readonly agentId: string;
  readonly domain: DomainName;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly taskCount: number;
  readonly averageTokensPerTask: number;
  readonly averageLatencyMs: number;
  readonly patternReuseCount: number;
  readonly tokensSavedByReuse: number;
  readonly successRate: number;
  readonly startTime: Date;
  readonly lastActivityTime: Date;
}

/**
 * Session-level token summary
 */
export interface SessionTokenSummary {
  readonly sessionId: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly agentSummaries: AgentTokenMetrics[];
  readonly domainBreakdown: Map<DomainName, number>;
  readonly patternReuseStats: {
    readonly totalReuses: number;
    readonly estimatedTokensSaved: number;
    readonly reuseRate: number;  // reuses / total tasks
  };
  readonly peakUsage: {
    readonly timestamp: Date;
    readonly tokensPerMinute: number;
  };
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly duration: number;  // milliseconds
}

/**
 * Configuration for TokenMetricsCollector
 */
export interface TokenMetricsCollectorConfig {
  readonly namespace: string;
  readonly slidingWindowSize: number;      // Tasks to keep in memory
  readonly persistenceIntervalMs: number;  // How often to persist to memory
  readonly enableRealTimeTracking: boolean;
  readonly estimateTokenSavings: boolean;  // Calculate pattern reuse savings
}
```

### 1.2 TokenMetricsCollector Class

```typescript
/**
 * Singleton class for collecting and aggregating token metrics
 * Implements the collector pattern from metrics-collector.ts
 */
export class TokenMetricsCollector {
  private static instance: TokenMetricsCollector | null = null;

  // State
  private readonly taskMetrics: TaskTokenMetric[] = [];
  private readonly agentMetrics: Map<string, AgentTokenMetrics> = new Map();
  private readonly activeTasks: Map<string, { startTime: Date; agentId: string }> = new Map();
  private currentSessionId: string | null = null;
  private sessionStartTime: Date | null = null;

  // Configuration
  private config: TokenMetricsCollectorConfig;
  private memory: MemoryBackend | null = null;
  private persistenceInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  /**
   * Singleton pattern - get the instance
   */
  public static getInstance(): TokenMetricsCollector;

  /**
   * Initialize with memory backend and config
   */
  public async initialize(
    memory: MemoryBackend,
    config?: Partial<TokenMetricsCollectorConfig>
  ): Promise<void>;

  /**
   * Start a new session
   */
  public startSession(sessionId?: string): string;

  /**
   * End the current session and get summary
   */
  public endSession(): SessionTokenSummary | null;

  /**
   * Start tracking a task
   */
  public startTask(taskId: string, agentId: string, domain: DomainName): void;

  /**
   * Record token usage for a task
   */
  public recordTaskTokens(
    taskId: string,
    usage: TokenUsage,
    options?: {
      patternId?: string;
      patternReused?: boolean;
      tokensSaved?: number;
      success?: boolean;
    }
  ): TaskTokenMetric | null;

  /**
   * Get current agent metrics
   */
  public getAgentMetrics(agentId: string): AgentTokenMetrics | null;

  /**
   * Get all agent metrics
   */
  public getAllAgentMetrics(): AgentTokenMetrics[];

  /**
   * Get metrics by domain
   */
  public getMetricsByDomain(domain: DomainName): TaskTokenMetric[];

  /**
   * Get current session summary (without ending)
   */
  public getCurrentSessionSummary(): SessionTokenSummary | null;

  /**
   * Get token usage for a specific time range
   */
  public getTokenUsageInRange(startTime: Date, endTime: Date): TaskTokenMetric[];

  /**
   * Calculate estimated token savings for a pattern
   */
  public estimatePatternTokenSavings(
    patternId: string,
    averageTaskTokens: number
  ): number;

  /**
   * Reset all metrics
   */
  public reset(): void;

  /**
   * Shutdown the collector
   */
  public async shutdown(): Promise<void>;

  // Private methods
  private updateAgentMetrics(metric: TaskTokenMetric): void;
  private persistMetrics(): Promise<void>;
  private loadPersistedMetrics(): Promise<void>;
}
```

### 1.3 Default Configuration

```typescript
export const DEFAULT_TOKEN_METRICS_CONFIG: TokenMetricsCollectorConfig = {
  namespace: 'token-metrics',
  slidingWindowSize: 1000,
  persistenceIntervalMs: 30000,  // 30 seconds
  enableRealTimeTracking: true,
  estimateTokenSavings: true,
};
```

### 1.4 Factory Functions

```typescript
/**
 * Get the singleton TokenMetricsCollector instance
 */
export function getTokenMetricsCollector(): TokenMetricsCollector;

/**
 * Create a task token tracker helper
 */
export function createTaskTokenTracker(
  taskId: string,
  agentId: string,
  domain: DomainName
): {
  recordTokens: (usage: TokenUsage, options?: {...}) => TaskTokenMetric | null;
  cancel: () => void;
};
```

---

## 2. Pattern Store Extensions

**File:** `/workspaces/agentic-qe/v3/src/learning/qe-patterns.ts`

**Status:** EXTEND (add to existing QEPattern interface)

### 2.1 Extended QEPattern Interface

```typescript
/**
 * QE-specific pattern for learning and reuse
 * Extended with token tracking fields (ADR-042)
 */
export interface QEPattern {
  // ... existing fields ...

  // NEW: Token tracking fields (ADR-042)

  /** Total tokens used when this pattern was created */
  readonly tokensUsed?: number;

  /** Input tokens for pattern creation */
  readonly inputTokens?: number;

  /** Output tokens for pattern creation */
  readonly outputTokens?: number;

  /** Average latency when using this pattern (ms) */
  readonly latencyMs?: number;

  /** Whether this pattern can be reused to save tokens */
  readonly reusable: boolean;

  /** Number of times this pattern has been reused */
  readonly reuseCount: number;

  /** Average tokens saved per reuse */
  readonly averageTokenSavings?: number;

  /** Total tokens saved by reusing this pattern */
  readonly totalTokensSaved: number;
}
```

**File:** `/workspaces/agentic-qe/v3/src/learning/pattern-store.ts`

**Status:** EXTEND

### 2.2 Extended PatternSearchResult

```typescript
/**
 * Pattern search result with reuse information (ADR-042)
 */
export interface PatternSearchResult {
  pattern: QEPattern;
  score: number;
  matchType: 'vector' | 'exact' | 'context';

  // NEW: Token optimization fields (ADR-042)

  /** Whether this pattern can be reused for the current task */
  canReuse: boolean;

  /** Estimated tokens that would be saved by reusing */
  estimatedTokenSavings: number;

  /** Reuse confidence (0-1) */
  reuseConfidence: number;

  /** Reason if pattern cannot be reused */
  reuseBlocker?: string;
}
```

### 2.3 New Pattern Store Methods

```typescript
// Add to IPatternStore interface:

/**
 * Record pattern reuse and update token savings
 */
recordReuse(
  id: string,
  tokensSaved: number,
  success: boolean
): Promise<Result<void>>;

/**
 * Find reusable patterns for a task
 */
findReusablePatterns(
  taskDescription: string,
  context: Partial<QEPatternContext>,
  options?: {
    minReuseConfidence?: number;
    minTokenSavings?: number;
    limit?: number;
  }
): Promise<Result<PatternSearchResult[]>>;

/**
 * Get patterns ranked by token efficiency
 */
getTokenEfficientPatterns(
  domain: QEDomain,
  limit?: number
): Promise<PatternSearchResult[]>;
```

### 2.4 New Utility Functions

```typescript
/**
 * Calculate pattern reusability score (ADR-042)
 * Higher score = better for token optimization
 */
export function calculateReusabilityScore(pattern: QEPattern): number {
  // Factors:
  // - Success rate (50%)
  // - Reuse count / usage count (30%)
  // - Average token savings (20%)
  const reuseRate = pattern.usageCount > 0
    ? pattern.reuseCount / pattern.usageCount
    : 0;
  const normalizedSavings = Math.min(
    1,
    (pattern.averageTokenSavings || 0) / 1000
  );

  return (
    pattern.successRate * 0.5 +
    reuseRate * 0.3 +
    normalizedSavings * 0.2
  );
}

/**
 * Determine if pattern should be marked as reusable
 */
export function shouldMarkReusable(pattern: QEPattern): boolean {
  return (
    pattern.successRate >= 0.8 &&
    pattern.usageCount >= 2 &&
    pattern.confidence >= 0.7 &&
    (pattern.tokensUsed || 0) > 100  // Non-trivial token usage
  );
}
```

---

## 3. Early Exit Token Optimizer

**File:** `/workspaces/agentic-qe/v3/src/optimization/early-exit-token-optimizer.ts`

**Status:** NEW

**Dependencies:**
- `../learning/pattern-store.ts` (PatternStore, PatternSearchResult)
- `../learning/qe-patterns.ts` (QEPattern, QEPatternContext)
- `../learning/token-tracker.ts` (TokenMetricsCollector)
- `../shared/types/index.ts` (Result, DomainName)

### 3.1 Interfaces

```typescript
/**
 * Decision result for early exit based on pattern reuse
 */
export interface TokenEarlyExitDecision {
  /** Should we exit early and reuse a pattern? */
  readonly shouldExit: boolean;

  /** Confidence in this decision (0-1) */
  readonly confidence: number;

  /** Pattern to reuse (if shouldExit is true) */
  readonly patternToReuse?: QEPattern;

  /** Estimated tokens saved by reusing */
  readonly estimatedTokenSavings: number;

  /** Reason for the decision */
  readonly reason: TokenExitReason;

  /** Detailed explanation */
  readonly explanation: string;

  /** Alternative patterns if primary is unavailable */
  readonly alternatives: PatternSearchResult[];

  /** Time taken to make decision (ms) */
  readonly decisionTimeMs: number;
}

/**
 * Reasons for token early exit decisions
 */
export type TokenExitReason =
  | 'high_confidence_match'    // Pattern matches with high confidence
  | 'significant_savings'      // Token savings justify reuse
  | 'no_suitable_pattern'      // No pattern available
  | 'low_confidence'           // Match confidence too low
  | 'context_mismatch'         // Context doesn't match well enough
  | 'pattern_outdated'         // Pattern may be stale
  | 'forced_execution';        // User/system forced full execution

/**
 * Configuration for the optimizer
 */
export interface TokenOptimizerConfig {
  /** Minimum confidence for pattern reuse (0-1) */
  readonly minReuseConfidence: number;

  /** Minimum token savings to justify early exit */
  readonly minTokenSavings: number;

  /** Maximum pattern age before considered outdated (ms) */
  readonly maxPatternAgeMs: number;

  /** Weight for HNSW similarity in reuse decision */
  readonly similarityWeight: number;

  /** Weight for historical success rate */
  readonly successRateWeight: number;

  /** Weight for token efficiency */
  readonly tokenEfficiencyWeight: number;

  /** Enable speculative pattern matching */
  readonly enableSpeculation: boolean;

  /** Number of alternative patterns to include */
  readonly alternativeCount: number;
}
```

### 3.2 EarlyExitTokenOptimizer Class

```typescript
/**
 * Optimizer that decides when to exit early and reuse patterns
 * to save tokens (ADR-042)
 */
export class EarlyExitTokenOptimizer {
  private readonly patternStore: PatternStore;
  private readonly tokenCollector: TokenMetricsCollector;
  private readonly config: TokenOptimizerConfig;

  constructor(
    patternStore: PatternStore,
    tokenCollector: TokenMetricsCollector,
    config?: Partial<TokenOptimizerConfig>
  );

  /**
   * Check if we should exit early and reuse a pattern
   * @param taskDescription - The task to perform
   * @param context - Current execution context
   * @param embedding - Pre-computed embedding (optional)
   */
  public async checkEarlyExit(
    taskDescription: string,
    context: Partial<QEPatternContext>,
    embedding?: number[]
  ): Promise<TokenEarlyExitDecision>;

  /**
   * Record the outcome of an early exit decision
   * Used to improve future decisions
   */
  public async recordOutcome(
    decision: TokenEarlyExitDecision,
    actualSuccess: boolean,
    actualTokensUsed?: number
  ): Promise<void>;

  /**
   * Get optimization statistics
   */
  public getStats(): TokenOptimizationStats;

  /**
   * Suggest patterns that could improve token efficiency
   */
  public async suggestOptimizations(
    domain: DomainName
  ): Promise<TokenOptimizationSuggestion[]>;

  // Private methods
  private calculateReuseScore(
    pattern: QEPattern,
    similarity: number,
    context: Partial<QEPatternContext>
  ): number;

  private isPatternFresh(pattern: QEPattern): boolean;

  private estimateSavings(
    pattern: QEPattern,
    context: Partial<QEPatternContext>
  ): number;
}

/**
 * Statistics for token optimization
 */
export interface TokenOptimizationStats {
  readonly totalDecisions: number;
  readonly earlyExits: number;
  readonly earlyExitRate: number;
  readonly totalTokensSaved: number;
  readonly averageTokensSavedPerExit: number;
  readonly decisionAccuracy: number;  // Correct early exit decisions
  readonly avgDecisionTimeMs: number;
}

/**
 * Suggestion for improving token efficiency
 */
export interface TokenOptimizationSuggestion {
  readonly type: 'create_pattern' | 'update_pattern' | 'consolidate_patterns';
  readonly description: string;
  readonly estimatedSavings: number;
  readonly priority: 'high' | 'medium' | 'low';
  readonly relatedPatterns?: string[];
}
```

### 3.3 Default Configuration

```typescript
export const DEFAULT_TOKEN_OPTIMIZER_CONFIG: TokenOptimizerConfig = {
  minReuseConfidence: 0.75,
  minTokenSavings: 100,
  maxPatternAgeMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
  similarityWeight: 0.4,
  successRateWeight: 0.35,
  tokenEfficiencyWeight: 0.25,
  enableSpeculation: true,
  alternativeCount: 3,
};
```

### 3.4 Factory Function

```typescript
/**
 * Create an EarlyExitTokenOptimizer instance
 */
export function createEarlyExitTokenOptimizer(
  patternStore: PatternStore,
  config?: Partial<TokenOptimizerConfig>
): EarlyExitTokenOptimizer;
```

---

## 4. MCP Tool: token_usage

**File:** `/workspaces/agentic-qe/v3/src/mcp/tools/analysis/token-usage.ts`

**Status:** NEW

**Dependencies:**
- `../base.ts` (MCPToolBase, MCPToolConfig, MCPToolContext, ToolResult)
- `../../learning/token-tracker.ts` (TokenMetricsCollector, SessionTokenSummary)
- `../../shared/types/index.ts` (DomainName)

### 4.1 Tool Schema

```typescript
export const TOKEN_USAGE_TOOL_CONFIG: MCPToolConfig = {
  name: 'qe/analysis/token_usage',
  description: 'Analyze token usage across agents, domains, tasks, and sessions. Provides insights for optimizing LLM token consumption.',
  domain: 'learning-optimization',
  schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: 'The operation to perform',
        enum: ['session', 'agent', 'domain', 'task', 'summary', 'optimize'],
      },
      sessionId: {
        type: 'string',
        description: 'Session ID to query (for session operation)',
      },
      agentId: {
        type: 'string',
        description: 'Agent ID to query (for agent operation)',
      },
      domain: {
        type: 'string',
        description: 'Domain name to query (for domain operation)',
        enum: [
          'test-generation', 'test-execution', 'coverage-analysis',
          'quality-assessment', 'defect-intelligence', 'requirements-validation',
          'code-intelligence', 'security-compliance', 'contract-testing',
          'visual-accessibility', 'chaos-resilience', 'learning-optimization'
        ],
      },
      taskId: {
        type: 'string',
        description: 'Task ID to query (for task operation)',
      },
      timeRange: {
        type: 'object',
        description: 'Time range for filtering',
        properties: {
          start: { type: 'string', description: 'ISO timestamp' },
          end: { type: 'string', description: 'ISO timestamp' },
        },
      },
      includePatternStats: {
        type: 'boolean',
        description: 'Include pattern reuse statistics',
        default: true,
      },
      format: {
        type: 'string',
        description: 'Output format',
        enum: ['json', 'summary', 'detailed'],
        default: 'summary',
      },
    },
    required: ['operation'],
  },
  streaming: false,
  timeout: 30000,
};
```

### 4.2 Tool Implementation

```typescript
/**
 * Result types for each operation
 */
export interface TokenUsageSessionResult {
  sessionId: string;
  summary: SessionTokenSummary;
  topAgents: Array<{ agentId: string; tokens: number }>;
  topDomains: Array<{ domain: DomainName; tokens: number }>;
  patternReuseStats: {
    totalReuses: number;
    tokensSaved: number;
    reuseRate: number;
  };
}

export interface TokenUsageAgentResult {
  agentId: string;
  metrics: AgentTokenMetrics;
  recentTasks: TaskTokenMetric[];
  recommendations: string[];
}

export interface TokenUsageDomainResult {
  domain: DomainName;
  totalTokens: number;
  agentCount: number;
  taskCount: number;
  averageTokensPerTask: number;
  patternReuseRate: number;
  efficiency: 'high' | 'medium' | 'low';
}

export interface TokenUsageOptimizeResult {
  suggestions: TokenOptimizationSuggestion[];
  potentialSavings: number;
  priorityActions: string[];
}

/**
 * MCP Tool for token usage analysis (ADR-042)
 */
export class TokenUsageTool extends MCPToolBase<
  TokenUsageParams,
  TokenUsageResult
> {
  readonly config = TOKEN_USAGE_TOOL_CONFIG;

  private tokenCollector: TokenMetricsCollector;
  private tokenOptimizer?: EarlyExitTokenOptimizer;

  constructor(
    tokenCollector?: TokenMetricsCollector,
    tokenOptimizer?: EarlyExitTokenOptimizer
  );

  async execute(
    params: TokenUsageParams,
    context: MCPToolContext
  ): Promise<ToolResult<TokenUsageResult>>;

  // Private operation handlers
  private async handleSessionOperation(params: TokenUsageParams): Promise<TokenUsageSessionResult>;
  private async handleAgentOperation(params: TokenUsageParams): Promise<TokenUsageAgentResult>;
  private async handleDomainOperation(params: TokenUsageParams): Promise<TokenUsageDomainResult>;
  private async handleTaskOperation(params: TokenUsageParams): Promise<TaskTokenMetric | null>;
  private async handleSummaryOperation(params: TokenUsageParams): Promise<SessionTokenSummary>;
  private async handleOptimizeOperation(params: TokenUsageParams): Promise<TokenUsageOptimizeResult>;

  // Formatting helpers
  private formatResult(
    result: unknown,
    format: 'json' | 'summary' | 'detailed'
  ): unknown;
}
```

---

## 5. Registry Extension

**File:** `/workspaces/agentic-qe/v3/src/mcp/tools/registry.ts`

**Status:** EXTEND

### 5.1 Add Tool Import and Registration

```typescript
// Add import
import { TokenUsageTool } from './analysis/token-usage';

// Add to QE_TOOL_NAMES
export const QE_TOOL_NAMES = {
  // ... existing ...

  // Analysis Tools (ADR-042)
  TOKEN_USAGE: 'qe/analysis/token_usage',
} as const;

// Add to QE_TOOLS array
export const QE_TOOLS: MCPToolBase[] = [
  // ... existing tools ...

  // Analysis Tools (ADR-042)
  new TokenUsageTool(),
];
```

---

## 6. Learning Module Index Extension

**File:** `/workspaces/agentic-qe/v3/src/learning/index.ts`

**Status:** EXTEND

```typescript
// Add exports for token tracking (ADR-042)
export {
  TokenMetricsCollector,
  getTokenMetricsCollector,
  createTaskTokenTracker,
  DEFAULT_TOKEN_METRICS_CONFIG,
} from './token-tracker.js';

export type {
  TokenUsage,
  TaskTokenMetric,
  AgentTokenMetrics,
  SessionTokenSummary,
  TokenMetricsCollectorConfig,
} from './token-tracker.js';
```

---

## 7. Optimization Module Index Extension

**File:** `/workspaces/agentic-qe/v3/src/optimization/index.ts`

**Status:** EXTEND

```typescript
// Add exports for token optimization (ADR-042)
export {
  EarlyExitTokenOptimizer,
  createEarlyExitTokenOptimizer,
  DEFAULT_TOKEN_OPTIMIZER_CONFIG,
} from './early-exit-token-optimizer.js';

export type {
  TokenEarlyExitDecision,
  TokenExitReason,
  TokenOptimizerConfig,
  TokenOptimizationStats,
  TokenOptimizationSuggestion,
} from './early-exit-token-optimizer.js';
```

---

## 8. Integration Points

### 8.1 Agent Lifecycle Integration

The TokenMetricsCollector should be integrated with agent spawn/stop:

```typescript
// In coordination/agent-coordinator.ts or similar

async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
  // ... existing spawn logic ...

  // Initialize token tracking for this agent
  const collector = getTokenMetricsCollector();
  // Agent will call collector.startTask() / recordTaskTokens() during execution
}
```

### 8.2 MCP Tool Invocation Integration

Token tracking should wrap MCP tool executions:

```typescript
// In mcp/protocol-server.ts or tool execution layer

async executeToolWithTokenTracking(
  tool: MCPToolBase,
  params: unknown,
  context: MCPToolContext
): Promise<ToolResult<unknown>> {
  const collector = getTokenMetricsCollector();
  const taskId = context.requestId;
  const agentId = context.agentId || 'unknown';

  collector.startTask(taskId, agentId, tool.domain);

  try {
    const result = await tool.invoke(params, context);

    // Extract token usage from result metadata if available
    if (result.metadata?.tokenUsage) {
      collector.recordTaskTokens(taskId, result.metadata.tokenUsage, {
        success: result.success,
      });
    }

    return result;
  } catch (error) {
    collector.recordTaskTokens(taskId, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, {
      success: false,
    });
    throw error;
  }
}
```

### 8.3 Pattern Store Integration

When creating/updating patterns, token info should be captured:

```typescript
// In pattern-store.ts create() method

async create(options: CreateQEPatternOptions & {
  tokenUsage?: TokenUsage;
}): Promise<Result<QEPattern>> {
  const pattern: QEPattern = {
    // ... existing fields ...

    // Token tracking (ADR-042)
    tokensUsed: options.tokenUsage?.totalTokens,
    inputTokens: options.tokenUsage?.inputTokens,
    outputTokens: options.tokenUsage?.outputTokens,
    reusable: false,  // Will be updated after successful uses
    reuseCount: 0,
    totalTokensSaved: 0,
  };

  // ... rest of create logic ...
}
```

---

## 9. Test Files Required

```
v3/tests/learning/token-tracker.test.ts
v3/tests/optimization/early-exit-token-optimizer.test.ts
v3/tests/mcp/tools/analysis/token-usage.test.ts
v3/tests/learning/pattern-store-token-extension.test.ts
```

---

## 10. Implementation Order

| Phase | File | Priority | Effort |
|-------|------|----------|--------|
| 1 | `v3/src/learning/token-tracker.ts` | High | Medium |
| 2 | `v3/src/learning/qe-patterns.ts` (extend) | High | Low |
| 3 | `v3/src/learning/pattern-store.ts` (extend) | High | Medium |
| 4 | `v3/src/optimization/early-exit-token-optimizer.ts` | Medium | High |
| 5 | `v3/src/mcp/tools/analysis/token-usage.ts` | Medium | Medium |
| 6 | `v3/src/mcp/tools/registry.ts` (extend) | Low | Low |
| 7 | Index file updates | Low | Low |
| 8 | Tests | High | High |

---

## 11. Success Criteria

1. **Token Tracking**: All agent tasks have token usage captured
2. **Pattern Reuse**: Patterns track reuse count and token savings
3. **Early Exit**: Optimizer can decide to reuse patterns with >75% accuracy
4. **MCP Tool**: All 6 operations work correctly
5. **Performance**: Decision time <50ms for early exit checks
6. **Persistence**: Token metrics survive session restarts
7. **Test Coverage**: >80% coverage for new code

---

## 12. Future Enhancements (Out of Scope)

- Token budget enforcement
- Cost calculation (USD per token)
- Multi-model token normalization
- Real-time token usage alerts
- Token usage prediction models
