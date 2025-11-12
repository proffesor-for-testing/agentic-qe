/**
 * MCP Tool: learning_query
 *
 * Queries learning data (experiences, Q-values, patterns) for an agent.
 * Supports filtering by agent ID, task type, time range, and minimum reward.
 *
 * Part of Phase 1 implementation of Option C (Hybrid Approach) for
 * enabling learning persistence with Claude Code Task tool.
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import type { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import type { AgentRegistry } from '../../services/AgentRegistry';
import type { HookExecutor } from '../../services/HookExecutor';

export interface LearningQueryParams {
  agentId?: string;
  taskType?: string;
  minReward?: number;
  limit?: number;
  offset?: number;
  queryType?: 'experiences' | 'qvalues' | 'patterns' | 'all';
  timeRange?: {
    start?: number;
    end?: number;
  };
}

export class LearningQueryHandler extends BaseHandler {
  constructor(
    private registry?: AgentRegistry,
    private hookExecutor?: HookExecutor,
    private memoryManager?: SwarmMemoryManager
  ) {
    super();
  }

  async handle(args: LearningQueryParams): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const {
        agentId,
        taskType,
        minReward,
        limit = 50,
        offset = 0,
        queryType = 'all',
        timeRange
      } = args;

      // Get memory manager
      if (!this.memoryManager) {
        throw new Error('SwarmMemoryManager not initialized');
      }

      const db = (this.memoryManager as any).db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const data: any = {};

      // Query experiences
      if (queryType === 'experiences' || queryType === 'all') {
        let experienceQuery = 'SELECT * FROM learning_experiences WHERE 1=1';
        const experienceParams: any[] = [];

        if (agentId) {
          experienceQuery += ' AND agent_id = ?';
          experienceParams.push(agentId);
        }

        if (taskType) {
          experienceQuery += ' AND task_type = ?';
          experienceParams.push(taskType);
        }

        if (minReward !== undefined) {
          experienceQuery += ' AND reward >= ?';
          experienceParams.push(minReward);
        }

        if (timeRange?.start) {
          experienceQuery += ' AND created_at >= ?';
          experienceParams.push(timeRange.start);
        }

        if (timeRange?.end) {
          experienceQuery += ' AND created_at <= ?';
          experienceParams.push(timeRange.end);
        }

        experienceQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        experienceParams.push(limit, offset);

        const experiences = db.prepare(experienceQuery).all(...experienceParams);

        // Parse JSON fields
        data.experiences = experiences.map((exp: any) => ({
          ...exp,
          state: this.safeJsonParse(exp.state),
          action: this.safeJsonParse(exp.action),
          next_state: this.safeJsonParse(exp.next_state),
          metadata: this.safeJsonParse(exp.metadata)
        }));
      }

      // Query Q-values
      if (queryType === 'qvalues' || queryType === 'all') {
        let qvalueQuery = 'SELECT * FROM q_values WHERE 1=1';
        const qvalueParams: any[] = [];

        if (agentId) {
          qvalueQuery += ' AND agent_id = ?';
          qvalueParams.push(agentId);
        }

        qvalueQuery += ' ORDER BY last_updated DESC LIMIT ? OFFSET ?';
        qvalueParams.push(limit, offset);

        const qValues = db.prepare(qvalueQuery).all(...qvalueParams);

        data.qValues = qValues.map((qv: any) => ({
          ...qv,
          metadata: this.safeJsonParse(qv.metadata)
        }));
      }

      // Query patterns from patterns table
      // Note: patterns table may not have agent_id column (general patterns table)
      // But learning_store_pattern tries to store with agent_id, so we handle both cases
      if (queryType === 'patterns' || queryType === 'all') {
        try {
          // Check if patterns table has agent_id column
          const schema = db.prepare('PRAGMA table_info(patterns)').all() as Array<{ name: string }>;
          const hasAgentId = schema.some((col: { name: string }) => col.name === 'agent_id');

          let patternQuery = 'SELECT * FROM patterns WHERE 1=1';
          const patternParams: any[] = [];

          // Only filter by agent_id if the column exists AND agentId is provided
          if (hasAgentId && agentId) {
            patternQuery += ' AND agent_id = ?';
            patternParams.push(agentId);
          }

          patternQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
          patternParams.push(limit, offset);

          const patterns = db.prepare(patternQuery).all(...patternParams);

          data.patterns = patterns.map((p: any) => ({
            ...p,
            metadata: this.safeJsonParse(p.metadata)
          }));
        } catch (error) {
          // Query failed - log and return empty
          this.log('warn', 'Failed to query patterns', { error: (error as Error).message });
          data.patterns = [];
        }
      }

      // Calculate stats
      if (queryType === 'all') {
        let statsQuery = 'SELECT COUNT(*) as count, AVG(reward) as avg_reward FROM learning_experiences WHERE 1=1';
        const statsParams: any[] = [];

        if (agentId) {
          statsQuery += ' AND agent_id = ?';
          statsParams.push(agentId);
        }

        const stats = db.prepare(statsQuery).get(...statsParams) as { count: number; avg_reward: number };

        const qValueCount = agentId
          ? db.prepare('SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?').get(agentId)
          : db.prepare('SELECT COUNT(*) as count FROM q_values').get();

        data.stats = {
          totalExperiences: stats.count,
          totalQValues: qValueCount.count,
          averageReward: stats.avg_reward || 0
        };
      }

      this.log('info', 'Learning data queried', {
        agentId,
        taskType,
        queryType,
        experienceCount: data.experiences?.length || 0,
        qValueCount: data.qValues?.length || 0,
        patternCount: data.patterns?.length || 0
      });

      return this.createSuccessResponse(data, requestId);
    });
  }

  private safeJsonParse(jsonString: string | null | undefined): any {
    if (!jsonString) return null;
    try {
      return JSON.parse(jsonString);
    } catch {
      return jsonString;
    }
  }
}
