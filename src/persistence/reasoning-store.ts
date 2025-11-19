/**
 * @fileoverview Reasoning chain store for capturing agent reasoning processes
 * @module persistence/reasoning-store
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  ReasoningChain,
  ReasoningStep,
  ReasoningChainWithSteps,
  StartChainInput,
  AddStepInput,
  ChainStatus,
  ThoughtType,
  PersistenceConfig,
  DEFAULT_PERSISTENCE_CONFIG,
  createDatabase,
  closeDatabase,
} from './schema';

/**
 * Query options for reasoning chains
 */
export interface ChainQueryOptions {
  limit?: number;
  offset?: number;
  status?: ChainStatus;
  includeSteps?: boolean;
}

/**
 * ReasoningStore captures and persists agent reasoning processes
 *
 * @example
 * ```typescript
 * const store = new ReasoningStore({ dbPath: './data/reasoning.db' });
 *
 * // Start a reasoning chain
 * const chain = store.startChain({
 *   session_id: 'session-123',
 *   agent_id: 'test-generator',
 *   context: { task: 'Generate unit tests' }
 * });
 *
 * // Add reasoning steps
 * store.addStep({
 *   chain_id: chain.id,
 *   thought_type: 'observation',
 *   content: 'Analyzing source code structure...',
 *   confidence: 0.9,
 *   token_count: 150
 * });
 *
 * // Complete the chain
 * store.completeChain(chain.id, 'completed');
 * ```
 */
export class ReasoningStore {
  private db: Database.Database;
  private config: PersistenceConfig;
  private statements: {
    insertChain: Database.Statement;
    insertStep: Database.Statement;
    updateChainStatus: Database.Statement;
    getChainById: Database.Statement;
    getStepsByChain: Database.Statement;
    getChainsBySession: Database.Statement;
    getChainsByAgent: Database.Statement;
    getStepCount: Database.Statement;
    getMaxStepOrder: Database.Statement;
  };

  /**
   * Create a new ReasoningStore instance
   * @param config - Persistence configuration
   */
  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.db = createDatabase(this.config);
    this.statements = this.prepareStatements();
  }

  /**
   * Prepare SQL statements for performance
   */
  private prepareStatements() {
    return {
      insertChain: this.db.prepare(`
        INSERT INTO reasoning_chains (id, session_id, agent_id, created_at, status, context)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      insertStep: this.db.prepare(`
        INSERT INTO reasoning_steps (id, chain_id, step_order, thought_type, content, confidence, token_count, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateChainStatus: this.db.prepare(`
        UPDATE reasoning_chains
        SET status = ?, completed_at = ?
        WHERE id = ?
      `),

      getChainById: this.db.prepare(`
        SELECT * FROM reasoning_chains WHERE id = ?
      `),

      getStepsByChain: this.db.prepare(`
        SELECT * FROM reasoning_steps
        WHERE chain_id = ?
        ORDER BY step_order ASC
      `),

      getChainsBySession: this.db.prepare(`
        SELECT * FROM reasoning_chains
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `),

      getChainsByAgent: this.db.prepare(`
        SELECT * FROM reasoning_chains
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `),

      getStepCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM reasoning_steps WHERE chain_id = ?
      `),

      getMaxStepOrder: this.db.prepare(`
        SELECT COALESCE(MAX(step_order), 0) as max_order
        FROM reasoning_steps
        WHERE chain_id = ?
      `),
    };
  }

  /**
   * Deserialize chain record from database row
   */
  private deserializeChain(row: Record<string, unknown>): ReasoningChain {
    return {
      id: row.id as string,
      session_id: row.session_id as string,
      agent_id: row.agent_id as string,
      created_at: row.created_at as string,
      completed_at: row.completed_at as string | null,
      status: row.status as ChainStatus,
      context: JSON.parse(row.context as string),
    };
  }

  /**
   * Deserialize step record from database row
   */
  private deserializeStep(row: Record<string, unknown>): ReasoningStep {
    return {
      id: row.id as string,
      chain_id: row.chain_id as string,
      step_order: row.step_order as number,
      thought_type: row.thought_type as ThoughtType,
      content: row.content as string,
      confidence: row.confidence as number,
      token_count: row.token_count as number,
      created_at: row.created_at as string,
      metadata: JSON.parse(row.metadata as string),
    };
  }

  /**
   * Start a new reasoning chain
   * @param input - Chain creation input
   * @returns Created chain record
   */
  startChain(input: StartChainInput): ReasoningChain {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const context = JSON.stringify(input.context || {});

    let retries = this.config.maxRetries || 3;
    while (retries > 0) {
      try {
        this.statements.insertChain.run(
          id,
          input.session_id,
          input.agent_id,
          created_at,
          'in_progress',
          context
        );
        break;
      } catch (error: unknown) {
        retries--;
        if (retries === 0) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to start chain after retries: ${errorMessage}`);
        }
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait for synchronous retry
        }
      }
    }

    return {
      id,
      session_id: input.session_id,
      agent_id: input.agent_id,
      created_at,
      completed_at: null,
      status: 'in_progress',
      context: input.context || {},
    };
  }

  /**
   * Add a reasoning step to a chain
   * @param input - Step creation input
   * @returns Created step record
   */
  addStep(input: AddStepInput): ReasoningStep {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const metadata = JSON.stringify(input.metadata || {});

    // Get next step order
    const maxOrderResult = this.statements.getMaxStepOrder.get(input.chain_id) as { max_order: number };
    const step_order = maxOrderResult.max_order + 1;

    let retries = this.config.maxRetries || 3;
    while (retries > 0) {
      try {
        this.statements.insertStep.run(
          id,
          input.chain_id,
          step_order,
          input.thought_type,
          input.content,
          input.confidence,
          input.token_count,
          created_at,
          metadata
        );
        break;
      } catch (error: unknown) {
        retries--;
        if (retries === 0) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to add step after retries: ${errorMessage}`);
        }
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait for synchronous retry
        }
      }
    }

    return {
      id,
      chain_id: input.chain_id,
      step_order,
      thought_type: input.thought_type,
      content: input.content,
      confidence: input.confidence,
      token_count: input.token_count,
      created_at,
      metadata: input.metadata || {},
    };
  }

  /**
   * Complete a reasoning chain
   * @param chainId - Chain identifier
   * @param status - Final status (completed, failed, abandoned)
   * @returns Updated chain record
   */
  completeChain(chainId: string, status: ChainStatus = 'completed'): ReasoningChain | null {
    const completed_at = new Date().toISOString();

    this.statements.updateChainStatus.run(status, completed_at, chainId);

    return this.getChainById(chainId);
  }

  /**
   * Get chain by ID
   * @param chainId - Chain identifier
   * @returns Chain record or null
   */
  getChainById(chainId: string): ReasoningChain | null {
    const row = this.statements.getChainById.get(chainId) as Record<string, unknown> | undefined;
    return row ? this.deserializeChain(row) : null;
  }

  /**
   * Get chain with all steps
   * @param chainId - Chain identifier
   * @returns Chain with steps or null
   */
  getChainWithSteps(chainId: string): ReasoningChainWithSteps | null {
    const chain = this.getChainById(chainId);
    if (!chain) return null;

    const stepRows = this.statements.getStepsByChain.all(chainId) as Record<string, unknown>[];
    const steps = stepRows.map(row => this.deserializeStep(row));

    return { ...chain, steps };
  }

  /**
   * Get chains by session ID
   * @param sessionId - Session identifier
   * @param options - Query options
   * @returns Array of chains
   */
  getChainsBySession(sessionId: string, options: ChainQueryOptions = {}): ReasoningChain[] | ReasoningChainWithSteps[] {
    const { limit = 100, offset = 0, includeSteps = false } = options;

    const rows = this.statements.getChainsBySession.all(sessionId, limit, offset) as Record<string, unknown>[];
    const chains = rows.map(row => this.deserializeChain(row));

    if (includeSteps) {
      return chains.map(chain => {
        const stepRows = this.statements.getStepsByChain.all(chain.id) as Record<string, unknown>[];
        const steps = stepRows.map(row => this.deserializeStep(row));
        return { ...chain, steps };
      });
    }

    return chains;
  }

  /**
   * Get chains by agent ID
   * @param agentId - Agent identifier
   * @param options - Query options
   * @returns Array of chains
   */
  getChainsByAgent(agentId: string, options: ChainQueryOptions = {}): ReasoningChain[] {
    const { limit = 100, offset = 0 } = options;

    const rows = this.statements.getChainsByAgent.all(agentId, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.deserializeChain(row));
  }

  /**
   * Get chains by status
   * @param status - Chain status
   * @param limit - Maximum results
   * @returns Array of chains
   */
  getChainsByStatus(status: ChainStatus, limit: number = 100): ReasoningChain[] {
    const rows = this.db.prepare(`
      SELECT * FROM reasoning_chains
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(status, limit) as Record<string, unknown>[];

    return rows.map(row => this.deserializeChain(row));
  }

  /**
   * Get step count for a chain
   * @param chainId - Chain identifier
   * @returns Number of steps
   */
  getStepCount(chainId: string): number {
    const result = this.statements.getStepCount.get(chainId) as { count: number };
    return result.count;
  }

  /**
   * Get total token count for a chain
   * @param chainId - Chain identifier
   * @returns Total tokens used
   */
  getTotalTokens(chainId: string): number {
    const result = this.db.prepare(`
      SELECT COALESCE(SUM(token_count), 0) as total
      FROM reasoning_steps
      WHERE chain_id = ?
    `).get(chainId) as { total: number };

    return result.total;
  }

  /**
   * Get average confidence for a chain
   * @param chainId - Chain identifier
   * @returns Average confidence score
   */
  getAverageConfidence(chainId: string): number {
    const result = this.db.prepare(`
      SELECT COALESCE(AVG(confidence), 0) as avg_confidence
      FROM reasoning_steps
      WHERE chain_id = ?
    `).get(chainId) as { avg_confidence: number };

    return result.avg_confidence;
  }

  /**
   * Get steps by thought type
   * @param thoughtType - Type of thought
   * @param limit - Maximum results
   * @returns Array of steps
   */
  getStepsByType(thoughtType: ThoughtType, limit: number = 100): ReasoningStep[] {
    const rows = this.db.prepare(`
      SELECT * FROM reasoning_steps
      WHERE thought_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(thoughtType, limit) as Record<string, unknown>[];

    return rows.map(row => this.deserializeStep(row));
  }

  /**
   * Search chains by context
   * @param key - Context key to search
   * @param value - Value to match
   * @param limit - Maximum results
   * @returns Matching chains
   */
  searchByContext(key: string, value: string, limit: number = 100): ReasoningChain[] {
    const pattern = `%"${key}":${JSON.stringify(value)}%`;
    const rows = this.db.prepare(`
      SELECT * FROM reasoning_chains
      WHERE context LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(pattern, limit) as Record<string, unknown>[];

    return rows.map(row => this.deserializeChain(row));
  }

  /**
   * Get reasoning chain statistics
   * @returns Statistics about stored chains
   */
  getStatistics(): {
    totalChains: number;
    totalSteps: number;
    completedChains: number;
    failedChains: number;
    avgStepsPerChain: number;
    avgTokensPerChain: number;
    avgConfidence: number;
  } {
    const chainStats = this.db.prepare(`
      SELECT
        COUNT(*) as totalChains,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedChains,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedChains
      FROM reasoning_chains
    `).get() as { totalChains: number; completedChains: number; failedChains: number };

    const stepStats = this.db.prepare(`
      SELECT
        COUNT(*) as totalSteps,
        AVG(token_count) as avgTokens,
        AVG(confidence) as avgConfidence
      FROM reasoning_steps
    `).get() as { totalSteps: number; avgTokens: number; avgConfidence: number };

    return {
      totalChains: chainStats.totalChains,
      totalSteps: stepStats.totalSteps,
      completedChains: chainStats.completedChains,
      failedChains: chainStats.failedChains,
      avgStepsPerChain: chainStats.totalChains > 0
        ? stepStats.totalSteps / chainStats.totalChains
        : 0,
      avgTokensPerChain: chainStats.totalChains > 0
        ? (stepStats.avgTokens * stepStats.totalSteps) / chainStats.totalChains
        : 0,
      avgConfidence: stepStats.avgConfidence || 0,
    };
  }

  /**
   * Delete completed chains older than specified date
   * @param olderThan - ISO timestamp cutoff
   * @returns Number of deleted chains
   */
  deleteOldChains(olderThan: string): number {
    // Delete steps first due to foreign key
    this.db.prepare(`
      DELETE FROM reasoning_steps
      WHERE chain_id IN (
        SELECT id FROM reasoning_chains
        WHERE created_at < ? AND status IN ('completed', 'failed', 'abandoned')
      )
    `).run(olderThan);

    const result = this.db.prepare(`
      DELETE FROM reasoning_chains
      WHERE created_at < ? AND status IN ('completed', 'failed', 'abandoned')
    `).run(olderThan);

    return result.changes;
  }

  /**
   * Export chain as JSON for analysis
   * @param chainId - Chain identifier
   * @returns JSON-serializable chain data
   */
  exportChain(chainId: string): Record<string, unknown> | null {
    const chain = this.getChainWithSteps(chainId);
    if (!chain) return null;

    return {
      id: chain.id,
      session_id: chain.session_id,
      agent_id: chain.agent_id,
      created_at: chain.created_at,
      completed_at: chain.completed_at,
      status: chain.status,
      context: chain.context,
      total_tokens: this.getTotalTokens(chainId),
      avg_confidence: this.getAverageConfidence(chainId),
      steps: chain.steps.map(step => ({
        order: step.step_order,
        type: step.thought_type,
        content: step.content,
        confidence: step.confidence,
        tokens: step.token_count,
        timestamp: step.created_at,
        metadata: step.metadata,
      })),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    closeDatabase(this.db);
  }
}
