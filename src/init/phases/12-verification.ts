/**
 * Phase 12: Verification
 * Verifies the installation and writes version marker
 *
 * IMPORTANT: This phase preserves user customizations in config.yaml
 * when running init on an existing installation (Issue #206).
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import type { AQEInitConfig } from '../types.js';
import { openDatabase } from '../../shared/safe-db.js';

export interface VerificationResult {
  verified: boolean;
  versionWritten: boolean;
  configSaved: boolean;
  checks: {
    name: string;
    passed: boolean;
  }[];
}

/**
 * Verification phase - verifies installation and writes markers
 */
export class VerificationPhase extends BasePhase<VerificationResult> {
  readonly name = 'verification';
  readonly description = 'Verify installation';
  readonly order = 120;
  readonly critical = true;
  readonly requiresPhases = ['database', 'configuration'] as const;

  protected async run(context: InitContext): Promise<VerificationResult> {
    const config = context.config as AQEInitConfig;
    const { projectRoot } = context;

    const checks: { name: string; passed: boolean }[] = [];

    // Check database exists
    const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
    checks.push({
      name: 'Database exists',
      passed: existsSync(dbPath),
    });

    // Check .agentic-qe directory
    checks.push({
      name: '.agentic-qe directory',
      passed: existsSync(join(projectRoot, '.agentic-qe')),
    });

    // Check config (will be written below)
    const configPath = join(projectRoot, '.agentic-qe', 'config.yaml');

    // Save configuration
    await this.saveConfig(config, projectRoot);
    checks.push({
      name: 'Config saved',
      passed: existsSync(configPath),
    });

    // Write version marker
    const versionWritten = await this.writeVersionToDb(config.version, projectRoot);
    checks.push({
      name: 'Version marker',
      passed: versionWritten,
    });

    // Critical checks must pass; version marker is informational only
    // (may fail due to better-sqlite3 loading issues but init still succeeds)
    const criticalChecks = ['Database exists', '.agentic-qe directory', 'Config saved'];
    const allCriticalPassed = checks
      .filter(c => criticalChecks.includes(c.name))
      .every(c => c.passed);

    context.services.log('  Verification checks:');
    for (const check of checks) {
      const isCritical = criticalChecks.includes(check.name);
      // Use different icons: ✓ for passed, ✗ for critical failure, ⚠ for optional failure
      const icon = check.passed ? '✓' : (isCritical ? '✗' : '⚠');
      const suffix = !isCritical && !check.passed ? ' (optional)' : '';
      context.services.log(`    ${icon} ${check.name}${suffix}`);
    }

    return {
      verified: allCriticalPassed,
      versionWritten,
      configSaved: existsSync(configPath),
      checks,
    };
  }

  /**
   * Write AQE version to memory.db
   */
  private async writeVersionToDb(version: string, projectRoot: string): Promise<boolean> {
    const memoryDbPath = join(projectRoot, '.agentic-qe', 'memory.db');

    try {
      const dir = dirname(memoryDbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const db = openDatabase(memoryDbPath);

      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT NOT NULL,
            namespace TEXT NOT NULL,
            value TEXT NOT NULL,
            expires_at INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            PRIMARY KEY (namespace, key)
          );
        `);

        const now = Date.now();
        db.prepare(`
          INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
          VALUES (?, '_system', ?, ?)
        `).run('aqe_version', JSON.stringify(version), now);

        db.prepare(`
          INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
          VALUES (?, '_system', ?, ?)
        `).run('init_timestamp', JSON.stringify(new Date().toISOString()), now);

        db.close();
        return true;
      } catch (err) {
        db.close();
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Save configuration to YAML file
   * Preserves user customizations from existing config (Issue #206)
   */
  private async saveConfig(config: AQEInitConfig, projectRoot: string): Promise<void> {
    const configDir = join(projectRoot, '.agentic-qe');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const configPath = join(configDir, 'config.yaml');

    // Preserve user customizations if config already exists
    if (existsSync(configPath)) {
      const existingConfig = this.loadExistingConfig(configPath);
      if (existingConfig) {
        config = this.mergeConfigs(config, existingConfig);
      }
    }

    const yaml = this.configToYAML(config);
    writeFileSync(configPath, yaml, 'utf-8');
  }

  /**
   * Load existing config.yaml and parse it
   * Returns null if parsing fails
   */
  private loadExistingConfig(configPath: string): Partial<AQEInitConfig> | null {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return this.parseYAML(content);
    } catch {
      return null;
    }
  }

  /**
   * Simple YAML parser for our config format
   * Handles the specific structure we generate
   */
  private parseYAML(content: string): Partial<AQEInitConfig> | null {
    try {
      const result: Record<string, unknown> = {};
      const lines = content.split('\n');

      let currentSection = '';
      let currentSubSection = '';

      for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || line.trim() === '') {
          continue;
        }

        // Top-level key (no indentation)
        const topMatch = line.match(/^(\w+):\s*(.*)$/);
        if (topMatch) {
          currentSection = topMatch[1];
          currentSubSection = '';
          const value = topMatch[2].trim();

          if (value && !value.startsWith('"')) {
            // Simple value
            result[currentSection] = this.parseValue(value);
          } else if (value) {
            result[currentSection] = this.parseValue(value);
          } else {
            result[currentSection] = {};
          }
          continue;
        }

        // Second-level key (2-space indent)
        const subMatch = line.match(/^  (\w+):\s*(.*)$/);
        if (subMatch && currentSection) {
          currentSubSection = subMatch[1];
          const value = subMatch[2].trim();

          if (!result[currentSection]) {
            result[currentSection] = {};
          }

          if (value) {
            (result[currentSection] as Record<string, unknown>)[currentSubSection] = this.parseValue(value);
          } else {
            (result[currentSection] as Record<string, unknown>)[currentSubSection] = {};
          }
          continue;
        }

        // Third-level key (4-space indent)
        // Use [\w-]+ to match hyphenated keys like "pattern-consolidator"
        const thirdMatch = line.match(/^    ([\w-]+):\s*(.*)$/);
        if (thirdMatch && currentSection && currentSubSection) {
          const key = thirdMatch[1];
          const value = thirdMatch[2].trim();

          const section = result[currentSection] as Record<string, Record<string, unknown>>;
          if (!section[currentSubSection]) {
            section[currentSubSection] = {};
          }
          if (typeof section[currentSubSection] === 'object' && !Array.isArray(section[currentSubSection])) {
            (section[currentSubSection] as Record<string, unknown>)[key] = this.parseValue(value);
          }
          continue;
        }

        // Array item (4-space indent with dash)
        const arrayMatch = line.match(/^    - "?([^"]*)"?$/);
        if (arrayMatch && currentSection && currentSubSection) {
          const section = result[currentSection] as Record<string, unknown>;
          if (!Array.isArray(section[currentSubSection])) {
            section[currentSubSection] = [];
          }
          (section[currentSubSection] as string[]).push(arrayMatch[1]);
        }
      }

      // Normalize known array fields that the parser may have set to {}
      const arrayFields: [string, string][] = [
        ['domains', 'enabled'],
        ['domains', 'disabled'],
        ['workers', 'enabled'],
      ];
      for (const [section, field] of arrayFields) {
        const sec = result[section] as Record<string, unknown> | undefined;
        if (sec && field in sec && !Array.isArray(sec[field])) {
          sec[field] = [];
        }
      }

      return result as Partial<AQEInitConfig>;
    } catch {
      return null;
    }
  }

  /**
   * Parse a YAML value
   */
  private parseValue(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }
    return value;
  }

  /**
   * Merge new config with existing user customizations
   * Preserves: domains.enabled, domains.disabled, and other user settings
   */
  private mergeConfigs(newConfig: AQEInitConfig, existing: Partial<AQEInitConfig>): AQEInitConfig {
    // Fields to preserve from existing config (user customizations)
    // These are settings users commonly customize manually

    // Preserve custom domains (Issue #206: visual-accessibility example)
    if (existing.domains?.enabled && Array.isArray(existing.domains.enabled)) {
      // Merge: keep all existing enabled domains + any new defaults not already present
      const existingDomains = new Set(existing.domains.enabled);
      const newDomains = new Set(newConfig.domains.enabled);

      // Add any new default domains that weren't in existing
      for (const domain of newDomains) {
        existingDomains.add(domain);
      }

      // Remove any domains that were explicitly disabled
      const disabledDomains = new Set(
        Array.isArray(existing.domains?.disabled) ? existing.domains.disabled : []
      );
      newConfig.domains.enabled = Array.from(existingDomains).filter(d => !disabledDomains.has(d));
    }

    if (existing.domains?.disabled && Array.isArray(existing.domains.disabled)) {
      newConfig.domains.disabled = existing.domains.disabled;
    }

    // Preserve user's learning preferences
    if (existing.learning?.enabled !== undefined) {
      newConfig.learning.enabled = existing.learning.enabled;
    }

    // Preserve user's hook preferences
    if (existing.hooks?.claudeCode !== undefined) {
      newConfig.hooks.claudeCode = existing.hooks.claudeCode;
    }
    if (existing.hooks?.preCommit !== undefined) {
      newConfig.hooks.preCommit = existing.hooks.preCommit;
    }
    if (existing.hooks?.ciIntegration !== undefined) {
      newConfig.hooks.ciIntegration = existing.hooks.ciIntegration;
    }

    // Preserve worker preferences
    if (existing.workers?.enabled && Array.isArray(existing.workers.enabled)) {
      newConfig.workers.enabled = existing.workers.enabled;
    }
    if (existing.workers?.daemonAutoStart !== undefined) {
      newConfig.workers.daemonAutoStart = existing.workers.daemonAutoStart;
    }

    // Preserve agent limits
    if (existing.agents?.maxConcurrent !== undefined) {
      newConfig.agents.maxConcurrent = existing.agents.maxConcurrent;
    }
    if (existing.agents?.defaultTimeout !== undefined) {
      newConfig.agents.defaultTimeout = existing.agents.defaultTimeout;
    }

    return newConfig;
  }

  /**
   * Convert config to YAML
   */
  private configToYAML(config: AQEInitConfig): string {
    const lines: string[] = [
      '# Agentic QE v3 Configuration',
      '# Generated by aqe init',
      `# ${new Date().toISOString()}`,
      '#',
      '# NOTE: Your customizations are PRESERVED when you run "aqe init" again.',
      '# You do NOT need to re-run "aqe init" after editing this file - changes',
      '# take effect immediately. The following settings are merged on reinstall:',
      '#   - domains.enabled (custom domains like visual-accessibility)',
      '#   - domains.disabled',
      '#   - learning.enabled',
      '#   - hooks.* preferences',
      '#   - workers.enabled',
      '#   - agents.maxConcurrent and defaultTimeout',
      '',
      `version: "${config.version}"`,
      '',
      'project:',
      `  name: "${config.project.name}"`,
      `  root: "${config.project.root}"`,
      `  type: "${config.project.type}"`,
      '',
      'learning:',
      `  enabled: ${config.learning.enabled}`,
      `  embeddingModel: "${config.learning.embeddingModel}"`,
      '  hnswConfig:',
      `    M: ${config.learning.hnswConfig.M}`,
      `    efConstruction: ${config.learning.hnswConfig.efConstruction}`,
      `    efSearch: ${config.learning.hnswConfig.efSearch}`,
      `  qualityThreshold: ${config.learning.qualityThreshold}`,
      `  promotionThreshold: ${config.learning.promotionThreshold}`,
      `  pretrainedPatterns: ${config.learning.pretrainedPatterns}`,
      '',
      'routing:',
      `  mode: "${config.routing.mode}"`,
      `  confidenceThreshold: ${config.routing.confidenceThreshold}`,
      `  feedbackEnabled: ${config.routing.feedbackEnabled}`,
      '',
      'workers:',
      '  enabled:',
      ...config.workers.enabled.map(w => `    - "${w}"`),
      '  intervals:',
      ...Object.entries(config.workers.intervals).map(([k, v]) => `    ${k}: ${v}`),
      `  maxConcurrent: ${config.workers.maxConcurrent}`,
      `  daemonAutoStart: ${config.workers.daemonAutoStart}`,
      '',
      'hooks:',
      `  claudeCode: ${config.hooks.claudeCode}`,
      `  preCommit: ${config.hooks.preCommit}`,
      `  ciIntegration: ${config.hooks.ciIntegration}`,
      '',
      'skills:',
      `  install: ${config.skills.install}`,
      `  installV2: ${config.skills.installV2}`,
      `  installV3: ${config.skills.installV3}`,
      `  overwrite: ${config.skills.overwrite}`,
      '',
      'domains:',
      '  enabled:',
      ...config.domains.enabled.map(d => `    - "${d}"`),
      '  disabled:',
      ...config.domains.disabled.map(d => `    - "${d}"`),
      '',
      'agents:',
      `  maxConcurrent: ${config.agents.maxConcurrent}`,
      `  defaultTimeout: ${config.agents.defaultTimeout}`,
      '',
    ];

    return lines.join('\n');
  }
}

// Instance exported from index.ts
