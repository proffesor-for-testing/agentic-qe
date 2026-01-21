/**
 * Agent Migrate Command
 * Migrate an agent from one fleet to another
 */

import { FleetManager } from '../../../core/FleetManager';
import { Logger } from '../../../utils/Logger';

export interface MigrateOptions {
  sourceFleetManager: FleetManager;
  targetFleetManager: FleetManager;
  agentId: string;
  preserveState?: boolean;
  conflictStrategy?: 'rename' | 'replace' | 'fail';
  validateCompatibility?: boolean;
}

export interface MigrateResult {
  success: boolean;
  migrated: boolean;
  statePreserved: boolean;
  compatible: boolean;
  conflicts?: string[];
  newAgentId?: string;
  error?: string;
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const logger = Logger.getInstance();
  const conflicts: string[] = [];

  try {
    // Get source agent
    const sourceAgent = options.sourceFleetManager.getAgent(options.agentId);
    if (!sourceAgent) {
      throw new Error(`Agent ${options.agentId} not found in source fleet`);
    }

    // Check compatibility
    let compatible = true;
    if (options.validateCompatibility) {
      const sourceStatus = options.sourceFleetManager.getStatus();
      const targetStatus = options.targetFleetManager.getStatus();

      // Simple compatibility check (in real implementation, check versions, configs, etc.)
      if (sourceStatus.status !== targetStatus.status) {
        conflicts.push('Fleet status mismatch');
      }

      compatible = conflicts.length === 0;
    }

    // Handle conflicts
    let newAgentId = options.agentId;
    const conflictStrategy = options.conflictStrategy || 'rename';

    const existingAgent = options.targetFleetManager.getAgent(options.agentId);
    if (existingAgent) {
      if (conflictStrategy === 'fail') {
        throw new Error(`Agent ${options.agentId} already exists in target fleet`);
      } else if (conflictStrategy === 'rename') {
        newAgentId = `${options.agentId}-migrated-${Date.now()}`;
        conflicts.push(`Agent renamed to ${newAgentId}`);
      } else if (conflictStrategy === 'replace') {
        await options.targetFleetManager.removeAgent(options.agentId);
        conflicts.push('Existing agent replaced');
      }
    }

    // Get agent state
    const agentConfig = (sourceAgent as any).config || {};
    const agentState = options.preserveState ? {
      ...agentConfig,
      status: sourceAgent.getStatus(),
      metrics: (sourceAgent as any).metrics || {}
    } : agentConfig;

    // Spawn in target fleet
    const newAgent = await options.targetFleetManager.spawnAgent(
      sourceAgent.getType(),
      agentState
    );

    // Remove from source if not same fleet
    if (options.sourceFleetManager !== options.targetFleetManager) {
      await options.sourceFleetManager.removeAgent(options.agentId);
    }

    logger.info(`Agent migrated: ${options.agentId} -> ${newAgent.getId()}`);

    return {
      success: true,
      migrated: true,
      statePreserved: options.preserveState || false,
      compatible,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      newAgentId: newAgent.getId()
    };

  } catch (error) {
    logger.error('Failed to migrate agent:', error);
    return {
      success: false,
      migrated: false,
      statePreserved: false,
      compatible: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
