/**
 * V2 Config Migrator
 * Migrates v2 config files to v3 YAML format
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAQEVersion } from '../types.js';

/**
 * V2 Config Migrator
 */
export class V2ConfigMigrator {
  constructor(private projectRoot: string) {}

  /**
   * Migrate v2 config to v3 format
   */
  async migrate(): Promise<{ success: boolean; configPath?: string }> {
    const v2ConfigDir = join(this.projectRoot, '.agentic-qe', 'config');
    const v3ConfigPath = join(this.projectRoot, '.agentic-qe', 'config.yaml');

    // Skip if v3 config exists
    if (existsSync(v3ConfigPath)) {
      return { success: true, configPath: v3ConfigPath };
    }

    // Skip if no v2 config
    if (!existsSync(v2ConfigDir)) {
      return { success: false };
    }

    try {
      // Read v2 config files
      const learningConfig = this.readJsonSafe(join(v2ConfigDir, 'learning.json'));
      const improvementConfig = this.readJsonSafe(join(v2ConfigDir, 'improvement.json'));
      const codeIntelConfig = this.readJsonSafe(join(v2ConfigDir, 'code-intelligence.json'));

      // Build v3 config
      const v3Config = this.buildV3Config(learningConfig, improvementConfig, codeIntelConfig);

      // Write as YAML
      const yaml = await import('yaml');
      const yamlContent = `# Agentic QE v3 Configuration
# Migrated from v2 on ${new Date().toISOString()}

${yaml.stringify(v3Config)}`;

      writeFileSync(v3ConfigPath, yamlContent, 'utf-8');

      return { success: true, configPath: v3ConfigPath };
    } catch {
      return { success: false };
    }
  }

  /**
   * Read JSON file safely
   */
  private readJsonSafe(path: string): Record<string, unknown> | null {
    try {
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Build v3 config from v2 configs
   */
  private buildV3Config(
    learningConfig: Record<string, unknown> | null,
    improvementConfig: Record<string, unknown> | null,
    codeIntelConfig: Record<string, unknown> | null
  ): Record<string, unknown> {
    return {
      version: getAQEVersion(),
      migratedFrom: '2.x.x',
      migratedAt: new Date().toISOString(),
      project: {
        name: 'migrated-project',
        root: this.projectRoot,
        type: 'unknown',
      },
      learning: {
        enabled: learningConfig?.enabled ?? true,
        embeddingModel: 'transformer',
        hnswConfig: {
          M: 8,
          efConstruction: 100,
          efSearch: 50,
        },
        qualityThreshold: (learningConfig?.qualityThreshold as number) ?? 0.5,
        promotionThreshold: 2,
        pretrainedPatterns: true,
      },
      routing: {
        mode: 'ml',
        confidenceThreshold: 0.7,
        feedbackEnabled: true,
      },
      workers: {
        enabled: ['pattern-consolidator'],
        intervals: {
          'pattern-consolidator': 1800000,
        },
        maxConcurrent: 2,
        daemonAutoStart: true,
      },
      hooks: {
        claudeCode: true,
        preCommit: false,
        ciIntegration: (codeIntelConfig?.ciIntegration as boolean) ?? false,
      },
      skills: {
        install: true,
        installV2: true,
        installV3: true,
        overwrite: false,
      },
      domains: {
        // Enable ALL domains - limiting causes "No factory registered" errors
        enabled: [
          'test-generation',
          'test-execution',
          'coverage-analysis',
          'quality-assessment',
          'defect-intelligence',
          'requirements-validation',
          'code-intelligence',
          'security-compliance',
          'contract-testing',
          'visual-accessibility',
          'chaos-resilience',
          'learning-optimization',
        ],
        disabled: [],
      },
      agents: {
        maxConcurrent: 5,
        defaultTimeout: 60000,
      },
      _v2Backup: {
        learning: learningConfig,
        improvement: improvementConfig,
        codeIntelligence: codeIntelConfig,
      },
    };
  }
}

/**
 * Create V2 config migrator
 */
export function createV2ConfigMigrator(projectRoot: string): V2ConfigMigrator {
  return new V2ConfigMigrator(projectRoot);
}
