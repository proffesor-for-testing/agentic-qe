/**
 * Blackboard Post Handler
 *
 * Handles posting coordination hints to the blackboard pattern for agent coordination.
 * Implements the blackboard_post MCP tool.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface BlackboardPostParams {
  topic: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  metadata?: Record<string, any>;
  ttl?: number;
}

interface BlackboardHint {
  id: string;
  topic: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  metadata: Record<string, any>;
  timestamp: number;
  ttl: number;
}

/**
 * Handles blackboard post operations for QE agent coordination
 */
export class BlackboardPostHandler extends BaseHandler {
  private hintCounter: number = 0;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    private blackboard: Map<string, BlackboardHint[]>
  ) {
    super();
  }

  /**
   * Handle blackboard post request
   */
  async handle(args: BlackboardPostParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      // Validate required fields
      this.validateRequired(args, ['topic', 'message', 'priority', 'agentId']);

      const {
        topic,
        message,
        priority,
        agentId,
        metadata = {},
        ttl = 0
      } = args;

      // Create hint
      const hint: BlackboardHint = {
        id: `hint-${++this.hintCounter}`,
        topic,
        message,
        priority,
        agentId,
        metadata,
        timestamp: Date.now(),
        ttl
      };

      // Add to blackboard
      if (!this.blackboard.has(topic)) {
        this.blackboard.set(topic, []);
      }
      this.blackboard.get(topic)!.push(hint);

      // Set TTL if specified
      if (ttl > 0) {
        setTimeout(() => {
          this.removeHint(topic, hint.id);
        }, ttl * 1000);
      }

      // Execute notification hook
      await this.hookExecutor.notify({
        message: `Blackboard hint posted: ${topic} by ${agentId}`,
        level: priority === 'critical' ? 'error' : priority === 'high' ? 'warn' : 'info'
      });

      this.log('info', `Blackboard hint posted: ${topic}`, { priority, agentId });

      return this.createSuccessResponse({
        posted: true,
        hintId: hint.id,
        topic,
        priority,
        timestamp: hint.timestamp
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to post blackboard hint', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Remove hint from blackboard
   */
  private removeHint(topic: string, hintId: string): void {
    const hints = this.blackboard.get(topic);
    if (hints) {
      const filtered = hints.filter(h => h.id !== hintId);
      this.blackboard.set(topic, filtered);
      this.log('info', `Hint expired: ${hintId} from topic ${topic}`);
    }
  }
}
