/**
 * Blackboard Read Handler
 *
 * Handles reading coordination hints from the blackboard pattern.
 * Implements the blackboard_read MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface BlackboardReadParams {
  topic: string;
  agentId: string;
  minPriority?: 'low' | 'medium' | 'high' | 'critical';
  since?: number;
  limit?: number;
}

/**
 * Handles blackboard read operations for QE agent coordination
 */
export class BlackboardReadHandler extends BaseHandler {
  private blackboard: Map<string, any[]>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    blackboard: Map<string, any[]>
  ) {
    super();
    this.blackboard = blackboard;
  }

  /**
   * Handle blackboard read request
   */
  async handle(args: BlackboardReadParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      // Validate required fields
      this.validateRequired(args, ['topic', 'agentId']);

      const {
        topic,
        agentId,
        minPriority,
        since,
        limit = 50
      } = args;

      // Get hints for topic
      let hints = this.blackboard.get(topic) || [];

      // Filter by priority
      if (minPriority) {
        const priorityLevels: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
        const minLevel = priorityLevels[minPriority];
        hints = hints.filter((h: any) => priorityLevels[h.priority] >= minLevel);
      }

      // Filter by time
      if (since) {
        hints = hints.filter(h => h.timestamp >= since);
      }

      // Sort by priority and timestamp
      hints.sort((a: any, b: any) => {
        const priorityLevels: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
        const priorityDiff = priorityLevels[b.priority] - priorityLevels[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.timestamp - a.timestamp;
      });

      // Apply limit
      hints = hints.slice(0, limit);

      this.log('info', `Blackboard read by ${agentId}`, {
        topic,
        hintsFound: hints.length,
        minPriority,
        since
      });

      return this.createSuccessResponse({
        topic,
        hints: hints.map(h => ({
          id: h.id,
          message: h.message,
          priority: h.priority,
          agentId: h.agentId,
          timestamp: h.timestamp,
          metadata: h.metadata
        })),
        count: hints.length
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to read blackboard', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }
}
