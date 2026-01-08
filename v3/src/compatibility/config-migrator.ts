/**
 * Config Migrator - Migrates V2 configuration to V3 format
 */

import { V2Config, V3Config, ConfigMigrationResult } from './types';

/**
 * Default V3 configuration values
 */
const DEFAULT_V3_CONFIG: V3Config = {
  v3: {
    version: '3.0.0',
    domains: [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'code-intelligence',
      'requirements-validation',
      'security-compliance',
      'contract-testing',
      'visual-accessibility',
      'chaos-resilience',
      'learning-optimization',
    ],
    agents: {
      maxConcurrent: 15,
      timeout: 300000,
      retryOnFailure: true,
      maxRetries: 3,
    },
    memory: {
      backend: 'hybrid',
      sqlite: { path: '.agentic-qe/memory.db' },
      agentdb: { enabled: true },
      hnsw: {
        enabled: true,
        M: 16,
        efConstruction: 200,
        efSearch: 100,
      },
    },
    learning: {
      enabled: true,
      neuralLearning: true,
      patternRetention: 180,
      transferEnabled: true,
    },
    coverage: {
      algorithm: 'sublinear',
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80,
      },
      riskWeighted: true,
    },
    qualityGates: {
      coverage: { min: 80, blocking: true },
      complexity: { max: 15, blocking: false },
      vulnerabilities: { critical: 0, high: 0, blocking: true },
    },
  },
};

/**
 * Config Migrator class for V2 to V3 configuration migration
 */
export class ConfigMigrator {
  /**
   * Migrate a V2 configuration to V3 format
   */
  migrate(v2Config: V2Config): ConfigMigrationResult {
    const warnings: string[] = [];
    const unmappedKeys: string[] = [];

    // Start with defaults
    const v3Config: V3Config = JSON.parse(JSON.stringify(DEFAULT_V3_CONFIG));

    // Migrate version
    if (v2Config.version) {
      warnings.push(
        `V2 version "${v2Config.version}" detected. Migrating to v3.0.0`
      );
    }

    // Migrate memory backend
    if (v2Config.memory?.backend) {
      const backend = v2Config.memory.backend.toLowerCase();
      if (backend === 'sqlite') {
        v3Config.v3.memory.backend = 'sqlite';
        v3Config.v3.memory.agentdb = { enabled: false };
        warnings.push(
          'Memory backend "sqlite" preserved. Consider upgrading to "hybrid" for better performance.'
        );
      } else if (backend === 'agentdb') {
        v3Config.v3.memory.backend = 'agentdb';
      }
      // 'hybrid' is default
    }

    // Migrate memory path
    if (v2Config.memory?.path) {
      v3Config.v3.memory.sqlite = { path: v2Config.memory.path };
    }

    // Migrate learning settings
    if (v2Config.learning !== undefined) {
      if (typeof v2Config.learning === 'object') {
        if (v2Config.learning.enabled !== undefined) {
          v3Config.v3.learning.enabled = v2Config.learning.enabled;
        }
        if (v2Config.learning.patternRetention !== undefined) {
          v3Config.v3.learning.patternRetention =
            v2Config.learning.patternRetention;
        }
      }
    }

    // Migrate coverage threshold
    if (v2Config.coverage?.threshold) {
      const threshold = v2Config.coverage.threshold;
      v3Config.v3.coverage.thresholds = {
        statements: threshold,
        branches: Math.max(threshold - 5, 50),
        functions: threshold,
        lines: threshold,
      };
      v3Config.v3.qualityGates.coverage.min = threshold;
    }

    // Migrate agents list (convert to domains)
    if (v2Config.agents && Array.isArray(v2Config.agents)) {
      const domains = this.inferDomainsFromAgents(v2Config.agents);
      if (domains.length > 0) {
        v3Config.v3.domains = domains;
        warnings.push(
          `Inferred ${domains.length} domains from v2 agent list.`
        );
      }
    }

    // Check for unmapped keys
    const knownKeys = [
      'version',
      'agents',
      'memory',
      'learning',
      'coverage',
    ];
    for (const key of Object.keys(v2Config)) {
      if (!knownKeys.includes(key)) {
        unmappedKeys.push(key);
      }
    }

    if (unmappedKeys.length > 0) {
      warnings.push(
        `The following v2 config keys were not migrated: ${unmappedKeys.join(', ')}`
      );
    }

    return {
      success: true,
      v3Config,
      warnings,
      unmappedKeys,
    };
  }

  /**
   * Infer domains from v2 agent list
   */
  private inferDomainsFromAgents(agents: string[]): string[] {
    const domainSet = new Set<string>();

    const agentToDomain: Record<string, string> = {
      'qe-test-generator': 'test-generation',
      'qe-test-executor': 'test-execution',
      'qe-coverage-analyzer': 'coverage-analysis',
      'qe-quality-gate': 'quality-assessment',
      'qe-quality-analyzer': 'quality-assessment',
      'qe-regression-risk-analyzer': 'defect-intelligence',
      'qe-code-intelligence': 'code-intelligence',
      'qe-requirements-validator': 'requirements-validation',
      'qe-security-scanner': 'security-compliance',
      'qe-api-contract-validator': 'contract-testing',
      'qe-visual-tester': 'visual-accessibility',
      'qe-a11y-ally': 'visual-accessibility',
      'qe-chaos-engineer': 'chaos-resilience',
      'qe-performance-tester': 'chaos-resilience',
      'qe-production-intelligence': 'learning-optimization',
    };

    for (const agent of agents) {
      const domain = agentToDomain[agent.toLowerCase()];
      if (domain) {
        domainSet.add(domain);
      }
    }

    // If domains were detected, ensure we have the full set
    if (domainSet.size > 0) {
      return DEFAULT_V3_CONFIG.v3.domains;
    }

    return [];
  }

  /**
   * Validate a V3 configuration
   */
  validate(config: V3Config): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.v3) {
      errors.push('Missing "v3" root key');
      return { valid: false, errors };
    }

    if (!config.v3.version) {
      errors.push('Missing version');
    }

    if (
      !config.v3.domains ||
      !Array.isArray(config.v3.domains) ||
      config.v3.domains.length === 0
    ) {
      errors.push('Missing or empty domains array');
    }

    if (!config.v3.agents?.maxConcurrent) {
      errors.push('Missing agents.maxConcurrent');
    } else if (
      config.v3.agents.maxConcurrent < 1 ||
      config.v3.agents.maxConcurrent > 50
    ) {
      errors.push('agents.maxConcurrent must be between 1 and 50');
    }

    if (!config.v3.memory?.backend) {
      errors.push('Missing memory.backend');
    } else if (
      !['sqlite', 'agentdb', 'hybrid'].includes(config.v3.memory.backend)
    ) {
      errors.push(
        'memory.backend must be one of: sqlite, agentdb, hybrid'
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate a default V3 configuration
   */
  generateDefault(): V3Config {
    return JSON.parse(JSON.stringify(DEFAULT_V3_CONFIG));
  }

  /**
   * Merge a partial config with defaults
   */
  mergeWithDefaults(partial: Partial<V3Config>): V3Config {
    const defaults = this.generateDefault();
    return this.deepMerge(defaults, partial) as V3Config;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(
          (target[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Generate YAML representation of V3 config
   */
  toYAML(config: V3Config): string {
    // Simple YAML generation (in production, use a proper YAML library)
    return this.objectToYAML(config, 0);
  }

  private objectToYAML(obj: unknown, indent: number): string {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object') {
          yaml += `${spaces}-\n${this.objectToYAML(item, indent + 1)}`;
        } else {
          yaml += `${spaces}- ${item}\n`;
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          yaml += `${spaces}${key}:\n${this.objectToYAML(value, indent + 1)}`;
        } else {
          yaml += `${spaces}${key}: ${value}\n`;
        }
      }
    }

    return yaml;
  }
}
