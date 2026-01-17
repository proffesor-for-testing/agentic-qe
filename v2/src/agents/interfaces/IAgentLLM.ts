/**
 * Agent LLM Interface - Simplified API for QE Agents
 *
 * Phase 1.2.2: Provides a clean, agent-friendly abstraction over LLM providers
 * Agents should ONLY import this interface, never specific provider implementations.
 *
 * Benefits:
 * - Simple, focused API for agent needs
 * - LLM provider independence (swap providers without changing agent code)
 * - Automatic complexity-based routing
 * - Built-in usage tracking
 * - Cache-aware operations
 *
 * @module agents/interfaces/IAgentLLM
 */

/**
 * Agent completion options - simplified from LLMCompletionOptions
 */
export interface AgentCompletionOptions {
  /** Sampling temperature (0.0-1.0, default: 0.7) */
  temperature?: number;

  /** Maximum tokens to generate (default: provider-specific) */
  maxTokens?: number;

  /** System prompt to set context */
  systemPrompt?: string;

  /** Cache key for prompt caching (improves latency) */
  cacheKey?: string;

  /** Task complexity hint for intelligent routing */
  complexity?: 'simple' | 'moderate' | 'complex' | 'very_complex';

  /** Enable streaming for long responses */
  stream?: boolean;

  /** Additional metadata for tracking */
  metadata?: Record<string, any>;
}

/**
 * Agent usage statistics
 */
export interface AgentUsageStats {
  /** Total number of requests made */
  requestCount: number;

  /** Total tokens used (input + output) */
  tokensUsed: number;

  /** Estimated cost incurred (in dollars) */
  costIncurred: number;

  /** Average latency per request (in milliseconds) */
  averageLatency: number;

  /** Cache hit rate (0-1) */
  cacheHitRate?: number;

  /** Local vs cloud request breakdown */
  routingBreakdown?: {
    local: number;
    cloud: number;
    cache: number;
  };
}

/**
 * Model information
 */
export interface AgentModelInfo {
  /** Model identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Model provider (local, claude, openrouter, etc.) */
  provider: string;

  /** Model capabilities */
  capabilities: {
    maxTokens: number;
    streaming: boolean;
    vision: boolean;
    functionCalling: boolean;
  };

  /** Cost per million tokens (if applicable) */
  cost?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

/**
 * IAgentLLM - Simplified LLM interface for QE agents
 *
 * This interface provides a clean abstraction over complex LLM providers,
 * allowing agents to make LLM calls without coupling to specific implementations.
 *
 * @example
 * ```typescript
 * // Agent using IAgentLLM
 * class TestGeneratorAgent extends BaseAgent {
 *   async generateTests(sourceCode: string): Promise<string> {
 *     // Simple completion - provider abstracted away
 *     const tests = await this.llm.complete(
 *       `Generate Jest tests for:\n${sourceCode}`,
 *       { complexity: 'moderate', temperature: 0.2 }
 *     );
 *     return tests;
 *   }
 * }
 * ```
 */
export interface IAgentLLM {
  /**
   * Complete a prompt with the LLM
   *
   * This is the primary method agents should use for LLM interactions.
   * The underlying provider is automatically selected based on complexity
   * and availability.
   *
   * @param prompt - The prompt to complete
   * @param options - Optional completion parameters
   * @returns The completion text
   * @throws {Error} If no provider is available or request fails
   *
   * @example
   * ```typescript
   * const result = await llm.complete(
   *   "Explain this error: TypeError: undefined is not a function",
   *   { complexity: 'simple', maxTokens: 500 }
   * );
   * ```
   */
  complete(prompt: string, options?: AgentCompletionOptions): Promise<string>;

  /**
   * Stream a completion for long responses
   *
   * Useful for interactive scenarios where partial results are valuable.
   *
   * @param prompt - The prompt to complete
   * @param options - Optional completion parameters
   * @returns Async iterator yielding text chunks
   * @throws {Error} If streaming not supported or request fails
   *
   * @example
   * ```typescript
   * for await (const chunk of llm.streamComplete(prompt, { temperature: 0.7 })) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  streamComplete(
    prompt: string,
    options?: AgentCompletionOptions
  ): AsyncIterableIterator<string>;

  /**
   * Generate embeddings for semantic tasks
   *
   * Use this for similarity search, clustering, or semantic analysis.
   * Always uses local provider for privacy and cost efficiency.
   *
   * @param text - Text to embed
   * @returns Embedding vector (typically 384-1536 dimensions)
   * @throws {Error} If embeddings not supported
   *
   * @example
   * ```typescript
   * const embedding = await llm.embed("test pattern for login validation");
   * await patternStore.store(embedding, metadata);
   * ```
   */
  embed(text: string): Promise<number[]>;

  /**
   * Get list of available models
   *
   * Returns models that are currently accessible based on configured providers.
   *
   * @returns Array of available model information
   *
   * @example
   * ```typescript
   * const models = await llm.getAvailableModels();
   * console.log(`Available: ${models.map(m => m.name).join(', ')}`);
   * ```
   */
  getAvailableModels(): Promise<AgentModelInfo[]>;

  /**
   * Get currently selected model
   *
   * @returns Current model identifier
   *
   * @example
   * ```typescript
   * const current = llm.getCurrentModel();
   * console.log(`Using model: ${current}`);
   * ```
   */
  getCurrentModel(): string;

  /**
   * Switch to a different model
   *
   * Changes the active model for subsequent completions.
   *
   * @param model - Model identifier to switch to
   * @throws {Error} If model is not available
   *
   * @example
   * ```typescript
   * await llm.switchModel('claude-sonnet-4');
   * ```
   */
  switchModel(model: string): Promise<void>;

  /**
   * Health check for LLM availability
   *
   * Verifies that at least one LLM provider is operational.
   *
   * @returns True if LLM is available and healthy
   *
   * @example
   * ```typescript
   * if (await llm.isHealthy()) {
   *   // Proceed with LLM-based approach
   * } else {
   *   // Fallback to algorithmic approach
   * }
   * ```
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get usage statistics for this agent's LLM calls
   *
   * Provides insights into token usage, costs, and performance.
   *
   * @returns Aggregated usage statistics
   *
   * @example
   * ```typescript
   * const stats = llm.getUsageStats();
   * console.log(`Tokens used: ${stats.tokensUsed}`);
   * console.log(`Cost: $${stats.costIncurred.toFixed(4)}`);
   * console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
   * ```
   */
  getUsageStats(): AgentUsageStats;

  /**
   * Reset usage statistics
   *
   * Useful for per-task or per-session tracking.
   *
   * @example
   * ```typescript
   * llm.resetStats();
   * await performTask();
   * const taskStats = llm.getUsageStats();
   * ```
   */
  resetStats(): void;
}

/**
 * Error thrown by AgentLLM operations
 */
export class AgentLLMError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'REQUEST_FAILED' | 'UNSUPPORTED',
    public readonly retryable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AgentLLMError';
  }
}

/**
 * Type guard for AgentLLMError
 */
export function isAgentLLMError(error: unknown): error is AgentLLMError {
  return error instanceof AgentLLMError;
}
