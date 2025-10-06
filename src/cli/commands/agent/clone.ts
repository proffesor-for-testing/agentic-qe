/**
 * Agent Clone Command
 * Clone an existing agent with optional config modifications
 */

import { FleetManager } from '../../../core/FleetManager';
import { Logger } from '../../../utils/Logger';

export interface CloneOptions {
  fleetManager: FleetManager;
  sourceAgentId: string;
  name?: string;
  configOverrides?: any;
}

export interface CloneResult {
  success: boolean;
  newAgentId?: string;
  configModified: boolean;
  cloneNumber: number;
  error?: string;
}

export async function clone(options: CloneOptions): Promise<CloneResult> {
  const logger = Logger.getInstance();

  try {
    // Get source agent
    const sourceAgent = options.fleetManager.getAgent(options.sourceAgentId);
    if (!sourceAgent) {
      throw new Error(`Agent ${options.sourceAgentId} not found`);
    }

    // Get source config
    const sourceConfig = (sourceAgent as any).config || {};

    // Merge with overrides
    const newConfig = options.configOverrides
      ? { ...sourceConfig, ...options.configOverrides }
      : sourceConfig;

    const configModified = options.configOverrides !== undefined;

    // Add clone metadata
    const cloneMetadata = {
      ...newConfig,
      clonedFrom: options.sourceAgentId,
      clonedAt: new Date().toISOString(),
      name: options.name || `${sourceAgent.getType()}-clone`
    };

    // Get clone counter
    const agents = options.fleetManager.getAllAgents();
    const clones = agents.filter(a => {
      const config = (a as any).config;
      return config?.clonedFrom === options.sourceAgentId;
    });
    const cloneNumber = clones.length + 1;

    // Spawn cloned agent
    const newAgent = await options.fleetManager.spawnAgent(
      sourceAgent.getType(),
      cloneMetadata
    );

    logger.info(`Agent cloned: ${options.sourceAgentId} -> ${newAgent.getId()}`);

    return {
      success: true,
      newAgentId: newAgent.getId(),
      configModified,
      cloneNumber
    };

  } catch (error) {
    logger.error('Failed to clone agent:', error);
    return {
      success: false,
      configModified: false,
      cloneNumber: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
