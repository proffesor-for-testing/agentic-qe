import { SecureRandom } from '../../utils/SecureRandom.js';

/**
 * ReasoningBank Test Adapter
 * Mock adapter for testing AgentDB with ReasoningBank
 */

export interface Pattern {
  id: string;
  type: string;
  data: any;
  embedding?: number[];
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface RetrievalOptions {
  topK?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

export interface RetrievalResult {
  memories?: Pattern[];
  patterns?: Pattern[];
  context?: any;
}

/**
 * Mock ReasoningBank Adapter for testing
 */
export class ReasoningBankAdapter {
  private patterns: Map<string, Pattern> = new Map();
  private isInitialized = false;

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * Store a pattern
   */
  async store(pattern: Pattern): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Adapter not initialized');
    }

    const id = pattern.id || this.generateId();
    this.patterns.set(id, { ...pattern, id });
    return id;
  }

  /**
   * Retrieve with reasoning
   */
  async retrieveWithReasoning(
    queryEmbedding: number[],
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    if (!this.isInitialized) {
      throw new Error('Adapter not initialized');
    }

    const patterns = Array.from(this.patterns.values());
    const topK = options.topK || 5;

    // Simple mock: return first topK patterns
    return {
      memories: patterns.slice(0, topK),
      patterns: patterns.slice(0, topK),
      context: {
        query: 'mock query',
        resultsCount: Math.min(patterns.length, topK)
      }
    };
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    this.isInitialized = false;
    this.patterns.clear();
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `pattern_${Date.now()}_${SecureRandom.generateId(5)}`;
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}

/**
 * Create a mock ReasoningBank adapter
 */
export function createMockReasoningBankAdapter(): ReasoningBankAdapter {
  return new ReasoningBankAdapter();
}
