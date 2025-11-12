/**
 * MCP Tool: learning_store_qvalue
 *
 * Stores or updates a Q-value for a state-action pair. Q-values represent
 * the expected reward for taking a specific action in a given state.
 *
 * Part of Phase 1 implementation of Option C (Hybrid Approach) for
 * enabling learning persistence with Claude Code Task tool.
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import type { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import type { AgentRegistry } from '../../services/AgentRegistry';
import type { HookExecutor } from '../../services/HookExecutor';

export interface QValueData {
  agentId: string;
  stateKey: string;
  actionKey: string;
  qValue: number;
  updateCount?: number;
  metadata?: Record<string, any>;
}

export class LearningStoreQValueHandler extends BaseHandler {
  constructor(
    private registry?: AgentRegistry,
    private hookExecutor?: HookExecutor,
    private memoryManager?: SwarmMemoryManager,
    private eventBus?: import('events').EventEmitter
  ) {
    super();
  }

  async handle(args: QValueData): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const {
        agentId,
        stateKey,
        actionKey,
        qValue,
        updateCount = 1,
        metadata = {}
      } = args;

      // Validate inputs
      this.validateRequired(args, ['agentId', 'stateKey', 'actionKey', 'qValue']);

      if (typeof qValue !== 'number') {
        throw new Error('qValue must be a number');
      }

      // Get memory manager
      if (!this.memoryManager) {
        throw new Error('SwarmMemoryManager not initialized');
      }

      const db = (this.memoryManager as any).db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Check if Q-value already exists
      const existing = db.prepare(`
        SELECT id, q_value, update_count FROM q_values
        WHERE agent_id = ? AND state_key = ? AND action_key = ?
      `).get(agentId, stateKey, actionKey) as { id: number; q_value: number; update_count: number } | undefined;

      let qValueId: string;

      if (existing) {
        // Update existing Q-value (weighted average)
        const newUpdateCount = existing.update_count + updateCount;
        const weightedQValue = (existing.q_value * existing.update_count + qValue * updateCount) / newUpdateCount;

        // Note: Schema uses last_updated (DATETIME), not updated_at
        // Note: metadata column added via migration
        db.prepare(`
          UPDATE q_values
          SET q_value = ?, update_count = ?, metadata = ?, last_updated = datetime('now')
          WHERE id = ?
        `).run(
          weightedQValue,
          newUpdateCount,
          JSON.stringify(metadata),
          existing.id
        );

        qValueId = `qval-${existing.id}`;

        this.log('info', `Q-value updated: ${qValueId}`, {
          agentId,
          stateKey,
          actionKey,
          oldValue: existing.q_value,
          newValue: weightedQValue,
          updateCount: newUpdateCount
        });

      } else {
        // Insert new Q-value
        // Note: Schema uses created_at and last_updated (DATETIME)
        // Note: metadata column added via migration
        const result = db.prepare(`
          INSERT INTO q_values (
            agent_id, state_key, action_key, q_value, update_count,
            metadata, created_at, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          agentId,
          stateKey,
          actionKey,
          qValue,
          updateCount,
          JSON.stringify(metadata)
        );

        qValueId = `qval-${result.lastInsertRowid}`;

        this.log('info', `Q-value stored: ${qValueId}`, {
          agentId,
          stateKey,
          actionKey,
          qValue,
          updateCount
        });
      }

      // Emit event to track explicit learning (prevents duplicate auto-storage)
      if (this.eventBus) {
        this.eventBus.emit('learning:qvalue:stored', {
          agentId,
          type: 'qvalue'
        });
      }

      return this.createSuccessResponse({
        qValueId,
        message: `Q-value ${existing ? 'updated' : 'stored'} successfully for ${agentId}`
      }, requestId);
    });
  }
}
