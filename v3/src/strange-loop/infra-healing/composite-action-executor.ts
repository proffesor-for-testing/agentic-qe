/**
 * Composite Action Executor
 * ADR-056: Infrastructure Self-Healing Extension
 *
 * Routes healing actions to the appropriate executor:
 * - Swarm actions (spawn_redundant_agent, add_connection, etc.) → original swarm executor
 * - Infrastructure actions (restart_service for infra-* agents) → InfraActionExecutor
 *
 * Implements the existing ActionExecutor interface so it's a drop-in replacement.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SwarmHealthObservation } from '../types.js';
import type { ActionExecutor } from '../healing-controller.js';
import type { InfraActionExecutor } from './infra-action-executor.js';

/**
 * Check if an agent ID represents a synthetic infrastructure agent.
 * Infrastructure agents are prefixed with 'infra-' by convention.
 */
function isInfraAgent(agentId: string | undefined): boolean {
  return agentId?.startsWith('infra-') ?? false;
}

// ============================================================================
// Composite Action Executor
// ============================================================================

/**
 * Composes a swarm ActionExecutor with an InfraActionExecutor.
 * Routes actions based on action type and target agent ID.
 *
 * For `restart_agent` actions targeting infra agents (infra-postgres, infra-redis),
 * the action is routed to InfraActionExecutor for playbook-driven recovery.
 */
export class CompositeActionExecutor implements ActionExecutor {
  private readonly swarmExecutor: ActionExecutor;
  private readonly infraExecutor: InfraActionExecutor;

  constructor(swarmExecutor: ActionExecutor, infraExecutor: InfraActionExecutor) {
    this.swarmExecutor = swarmExecutor;
    this.infraExecutor = infraExecutor;
  }

  // ============================================================================
  // ActionExecutor Interface (delegated to swarm executor)
  // ============================================================================

  async spawnAgent(agentId: string, config?: Record<string, unknown>): Promise<string> {
    return this.swarmExecutor.spawnAgent(agentId, config);
  }

  async terminateAgent(agentId: string): Promise<void> {
    return this.swarmExecutor.terminateAgent(agentId);
  }

  async addConnection(sourceId: string, targetId: string): Promise<void> {
    return this.swarmExecutor.addConnection(sourceId, targetId);
  }

  async removeConnection(sourceId: string, targetId: string): Promise<void> {
    return this.swarmExecutor.removeConnection(sourceId, targetId);
  }

  async redistributeLoad(agentId: string): Promise<void> {
    return this.swarmExecutor.redistributeLoad(agentId);
  }

  async restartAgent(agentId: string): Promise<void> {
    // Route infra agents to infrastructure recovery
    if (isInfraAgent(agentId)) {
      const serviceName = agentId.replace(/^infra-/, '');
      await this.infraExecutor.recoverService(serviceName, uuidv4());
      return;
    }
    return this.swarmExecutor.restartAgent(agentId);
  }

  async promoteToCoordinator(agentId: string): Promise<void> {
    return this.swarmExecutor.promoteToCoordinator(agentId);
  }

  async demoteCoordinator(agentId: string): Promise<void> {
    return this.swarmExecutor.demoteCoordinator(agentId);
  }

  async observe(): Promise<SwarmHealthObservation> {
    return this.swarmExecutor.observe();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function for creating a CompositeActionExecutor.
 */
export function createCompositeActionExecutor(
  swarmExecutor: ActionExecutor,
  infraExecutor: InfraActionExecutor,
): CompositeActionExecutor {
  return new CompositeActionExecutor(swarmExecutor, infraExecutor);
}
