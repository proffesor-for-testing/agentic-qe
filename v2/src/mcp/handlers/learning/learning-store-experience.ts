/**
 * MCP Tool: learning_store_experience
 *
 * Stores a learning experience for an agent. This includes task execution
 * details, reward assessment, and outcome data.
 *
 * Part of Phase 1 implementation of Option C (Hybrid Approach) for
 * enabling learning persistence with Claude Code Task tool.
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import type { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import type { AgentRegistry } from '../../services/AgentRegistry';
import type { HookExecutor } from '../../services/HookExecutor';

export interface LearningExperience {
  agentId: string;
  taskType: string;
  reward: number; // 0-1 scale
  outcome: Record<string, any>;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export class LearningStoreExperienceHandler extends BaseHandler {
  constructor(
    private registry?: AgentRegistry,
    private hookExecutor?: HookExecutor,
    private memoryManager?: SwarmMemoryManager,
    private eventBus?: import('events').EventEmitter
  ) {
    super();
  }

  async handle(args: LearningExperience): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const { agentId, taskType, reward, outcome, timestamp = Date.now(), metadata = {} } = args;

      // Validate inputs
      this.validateRequired(args, ['agentId', 'taskType', 'reward', 'outcome']);

      if (typeof reward !== 'number' || reward < 0 || reward > 1) {
        throw new Error('reward must be a number between 0 and 1');
      }

      if (typeof outcome !== 'object') {
        throw new Error('outcome must be an object');
      }

      // Get memory manager
      if (!this.memoryManager) {
        throw new Error('SwarmMemoryManager not initialized');
      }

      // Store experience in learning_experiences table
      // Note: metadata and created_at columns added via migration
      const experienceData = {
        agent_id: agentId,
        task_id: `task-${Date.now()}`, // Generate task ID
        task_type: taskType,
        state: JSON.stringify({ type: taskType, timestamp }),
        action: JSON.stringify(outcome),
        reward,
        next_state: JSON.stringify({ completed: true, timestamp }),
        episode_id: null, // Optional episode grouping
        timestamp, // Uses existing timestamp column (DATETIME)
        metadata: JSON.stringify(metadata),
        created_at: timestamp
      };

      // Use direct database access
      const db = (this.memoryManager as any).db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const stmt = db.prepare(`
        INSERT INTO learning_experiences (
          agent_id, task_id, task_type, state, action, reward, next_state,
          episode_id, timestamp, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        experienceData.agent_id,
        experienceData.task_id,
        experienceData.task_type,
        experienceData.state,
        experienceData.action,
        experienceData.reward,
        experienceData.next_state,
        experienceData.episode_id,
        experienceData.timestamp,
        experienceData.metadata,
        experienceData.created_at
      );

      const experienceId = `exp-${result.lastInsertRowid}`;

      this.log('info', `Learning experience stored: ${experienceId}`, {
        agentId,
        taskType,
        reward
      });

      // Emit event to track explicit learning (prevents duplicate auto-storage)
      if (this.eventBus) {
        this.eventBus.emit('learning:experience:stored', {
          agentId,
          type: 'experience'
        });
      }

      return this.createSuccessResponse({
        experienceId,
        message: `Learning experience stored successfully for ${agentId}`
      }, requestId);
    });
  }
}
