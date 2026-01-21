/**
 * Fleet Configuration Module
 * Handles creation and persistence of fleet configuration
 */

import * as fs from 'fs-extra';
import { FleetConfig } from '../../types';

const PACKAGE_VERSION = require('../../../package.json').version;

/**
 * Create and write fleet configuration to disk
 * @param config - Fleet configuration object
 */
export async function createFleetConfig(config: FleetConfig): Promise<void> {
  // Sanitize config to remove undefined values
  const sanitizedConfig = sanitizeConfig(config);

  // Write main fleet configuration
  const configPath = '.agentic-qe/config/fleet.json';
  await fs.writeJson(configPath, sanitizedConfig, { spaces: 2 });

  // Create agent configurations
  const agentConfigs = sanitizeConfig(generateAgentConfigs(config));
  await fs.writeJson('.agentic-qe/config/agents.json', agentConfigs, { spaces: 2 });

  // Create environment configurations
  const envConfigs = sanitizeConfig(generateEnvironmentConfigs(config.environments || []));
  await fs.writeJson('.agentic-qe/config/environments.json', envConfigs, { spaces: 2 });

  // Create routing configuration
  await writeRoutingConfig(config);
}

/**
 * Sanitize config object by removing undefined values and ensuring all properties are serializable
 */
function sanitizeConfig(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeConfig(item)).filter(item => item !== null && item !== undefined);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined values
      if (value === undefined) {
        continue;
      }
      // Recursively sanitize nested objects
      const sanitizedValue = sanitizeConfig(value);
      if (sanitizedValue !== null && sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Generate agent configurations based on fleet config
 */
function generateAgentConfigs(fleetConfig: FleetConfig): any {
  const agentTypes = [
    'test-generator',
    'coverage-analyzer',
    'quality-gate',
    'performance-tester',
    'security-scanner'
  ];

  return {
    fleet: {
      topology: fleetConfig.topology,
      maxAgents: fleetConfig.maxAgents,
      agents: agentTypes.map(type => ({
        type,
        count: type === 'test-generator' ? 2 : 1,
        capabilities: getAgentCapabilities(type),
        resources: {
          memory: '100MB',
          cpu: '0.5'
        }
      }))
    }
  };
}

/**
 * Get capabilities for a specific agent type
 */
function getAgentCapabilities(agentType: string): string[] {
  const capabilities: Record<string, string[]> = {
    'test-generator': ['unit-tests', 'integration-tests', 'property-based-testing', 'test-data-synthesis'],
    'coverage-analyzer': ['coverage-analysis', 'gap-identification', 'trend-analysis'],
    'quality-gate': ['quality-metrics', 'threshold-enforcement', 'decision-making'],
    'performance-tester': ['load-testing', 'stress-testing', 'bottleneck-analysis'],
    'security-scanner': ['vulnerability-scanning', 'security-testing', 'compliance-checking']
  };
  return capabilities[agentType] || [];
}

/**
 * Generate environment-specific configurations
 */
function generateEnvironmentConfigs(environments: string[]): Record<string, any> {
  return environments.reduce((configs, env) => {
    configs[env] = {
      database: {
        type: env === 'production' ? 'postgresql' : 'sqlite',
        connectionString: env === 'production'
          ? '${DATABASE_URL}'
          : `.agentic-qe/data/${env}.db`
      },
      testing: {
        parallel: env !== 'production',
        timeout: env === 'production' ? 600 : 300,
        retries: env === 'production' ? 2 : 1
      },
      monitoring: {
        enabled: true,
        metrics: ['coverage', 'performance', 'quality'],
        alerts: env === 'production'
      }
    };
    return configs;
  }, {} as Record<string, any>);
}

/**
 * Write routing configuration for multi-model router and streaming
 */
async function writeRoutingConfig(config: FleetConfig): Promise<void> {
  const routingConfig = {
    multiModelRouter: {
      enabled: config.routing?.enabled || false,
      version: PACKAGE_VERSION,
      defaultModel: config.routing?.defaultModel || 'claude-sonnet-4.5',
      enableCostTracking: config.routing?.enableCostTracking !== false,
      enableFallback: config.routing?.enableFallback !== false,
      maxRetries: config.routing?.maxRetries || 3,
      costThreshold: config.routing?.costThreshold || 0.5,
      modelRules: {
        simple: {
          model: 'gpt-3.5-turbo',
          maxTokens: 2000,
          estimatedCost: 0.0004
        },
        moderate: {
          model: 'gpt-3.5-turbo',
          maxTokens: 4000,
          estimatedCost: 0.0008
        },
        complex: {
          model: 'gpt-4',
          maxTokens: 8000,
          estimatedCost: 0.0048
        },
        critical: {
          model: 'claude-sonnet-4.5',
          maxTokens: 8000,
          estimatedCost: 0.0065
        }
      },
      fallbackChains: {
        'gpt-4': ['gpt-3.5-turbo', 'claude-haiku'],
        'gpt-3.5-turbo': ['claude-haiku', 'gpt-4'],
        'claude-sonnet-4.5': ['claude-haiku', 'gpt-4'],
        'claude-haiku': ['gpt-3.5-turbo']
      }
    },
    streaming: {
      enabled: config.streaming?.enabled !== false,
      progressInterval: config.streaming?.progressInterval || 2000,
      bufferEvents: config.streaming?.bufferEvents || false,
      timeout: config.streaming?.timeout || 1800000
    }
  };

  await fs.writeJson('.agentic-qe/config/routing.json', routingConfig, { spaces: 2 });
}

/**
 * Validate fleet configuration
 * @param config - Fleet configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateFleetConfig(config: FleetConfig): void {
  if (!config.topology) {
    throw new Error('Fleet topology is required');
  }

  const validTopologies = ['hierarchical', 'mesh', 'ring', 'adaptive'];
  if (!validTopologies.includes(config.topology)) {
    throw new Error(`Invalid topology: ${config.topology}. Must be one of: ${validTopologies.join(', ')}`);
  }

  if (config.maxAgents && config.maxAgents < 1) {
    throw new Error('maxAgents must be at least 1');
  }

  if (config.maxAgents && config.maxAgents > 100) {
    throw new Error('maxAgents cannot exceed 100');
  }
}

/**
 * Check if fleet configuration already exists
 * @returns true if fleet.json exists
 */
export async function fleetConfigExists(): Promise<boolean> {
  return fs.pathExists('.agentic-qe/config/fleet.json');
}

/**
 * Load existing fleet configuration
 * @returns Existing fleet configuration or null if not found
 */
export async function loadFleetConfig(): Promise<FleetConfig | null> {
  const configPath = '.agentic-qe/config/fleet.json';
  if (await fs.pathExists(configPath)) {
    return fs.readJson(configPath);
  }
  return null;
}

/**
 * Merge new configuration with existing configuration
 * @param existing - Existing fleet configuration
 * @param newConfig - New fleet configuration
 * @returns Merged configuration
 */
export function mergeFleetConfig(existing: FleetConfig, newConfig: FleetConfig): FleetConfig {
  return {
    ...existing,
    ...newConfig,
    agents: newConfig.agents || existing.agents,
    routing: {
      ...existing.routing,
      ...newConfig.routing
    },
    streaming: {
      ...existing.streaming,
      ...newConfig.streaming
    }
  };
}
