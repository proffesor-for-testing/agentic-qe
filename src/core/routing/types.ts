/**
 * Multi-Model Router Types
 * Core interfaces and types for the adaptive model routing system
 */

/**
 * QE Task interface for routing
 */
export interface QETask {
  id: string;
  type: string;
  description?: string;
  data: any;
  priority: number;
  metadata?: Record<string, any>;
}

/**
 * Supported AI models with their capabilities and costs
 */
export enum AIModel {
  GPT_4 = 'gpt-4',
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  CLAUDE_SONNET_4_5 = 'claude-sonnet-4.5',
  CLAUDE_HAIKU = 'claude-haiku',
}

/**
 * Task complexity levels for model selection
 */
export enum TaskComplexity {
  SIMPLE = 'simple',       // Basic logic, unit tests
  MODERATE = 'moderate',   // Integration tests, standard patterns
  COMPLEX = 'complex',     // Property-based, edge cases, algorithm design
  CRITICAL = 'critical',   // Security, performance, mission-critical
}

/**
 * Model selection result with reasoning
 */
export interface ModelSelection {
  model: AIModel;
  complexity: TaskComplexity;
  reasoning: string;
  estimatedCost: number;
  fallbackModels: AIModel[];
  confidence: number;
}

/**
 * Cost tracking per model
 */
export interface ModelCost {
  modelId: AIModel;
  tokensUsed: number;
  estimatedCost: number;
  requestCount: number;
  avgTokensPerRequest: number;
  timestamp: number;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  enabled: boolean;
  defaultModel: AIModel;
  enableCostTracking: boolean;
  enableFallback: boolean;
  maxRetries: number;
  costThreshold: number; // Max cost per task in USD
}

/**
 * Model capability definition
 */
export interface ModelCapability {
  model: AIModel;
  maxTokens: number;
  costPerToken: number; // in USD
  strengths: string[];
  weaknesses: string[];
  rateLimitPerMin: number;
}

/**
 * Router statistics
 */
export interface RouterStats {
  totalRequests: number;
  totalCost: number;
  costSavings: number; // vs single model
  modelDistribution: Record<AIModel, number>;
  avgCostPerTask: number;
  avgCostPerTest: number;
}

/**
 * Model selection strategy interface
 */
export interface ModelSelectionStrategy {
  selectModel(task: QETask, complexity: TaskComplexity): AIModel;
  getName(): string;
}

/**
 * Core ModelRouter interface
 */
export interface ModelRouter {
  /**
   * Select the optimal model for a given task
   */
  selectModel(task: QETask): Promise<ModelSelection>;

  /**
   * Track cost for a model usage
   */
  trackCost(modelId: AIModel, tokens: number): Promise<void>;

  /**
   * Get fallback model when primary fails
   */
  getFallbackModel(failedModel: AIModel, task: QETask): AIModel;

  /**
   * Get router statistics
   */
  getStats(): Promise<RouterStats>;

  /**
   * Export cost dashboard data
   */
  exportCostDashboard(): Promise<any>;

  /**
   * Analyze task complexity
   */
  analyzeComplexity(task: QETask): Promise<TaskComplexity>;
}

/**
 * Task analysis result
 */
export interface TaskAnalysis {
  complexity: TaskComplexity;
  estimatedTokens: number;
  requiresReasoning: boolean;
  requiresSecurity: boolean;
  requiresPerformance: boolean;
  confidence: number;
}
