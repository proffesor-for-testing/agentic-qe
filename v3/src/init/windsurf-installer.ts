/**
 * Windsurf Platform Installer
 * Generates MCP config (.windsurf/mcp_config.json) and behavioral rules
 * (.windsurfrules) for Windsurf IDE integration.
 *
 * Follows the OpenCode/Kiro installer pattern (ADR-025).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  createPlatformConfigGenerator,
  type PlatformConfigGenerator,
} from './platform-config-generator.js';

// ============================================================================
// Types
// ============================================================================

export interface WindsurfInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
}

export interface WindsurfInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  rulesInstalled: boolean;
  errors: string[];
  configPath: string;
  rulesPath: string;
}

// ============================================================================
// Windsurf Installer Class
// ============================================================================

export class WindsurfInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private generator: PlatformConfigGenerator;

  constructor(options: WindsurfInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<WindsurfInstallResult> {
    const result: WindsurfInstallResult = {
      success: true,
      mcpConfigured: false,
      rulesInstalled: false,
      errors: [],
      configPath: '',
      rulesPath: '',
    };

    try {
      // Generate MCP config (project-level .windsurf/mcp_config.json)
      const mcpConfig = this.generator.generateMcpConfig('windsurf');
      const configPath = join(this.projectRoot, mcpConfig.path);
      result.configPath = configPath;

      if (!existsSync(configPath) || this.overwrite) {
        const configDir = dirname(configPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        if (existsSync(configPath) && this.overwrite) {
          const merged = this.mergeExistingConfig(configPath, mcpConfig.content);
          writeFileSync(configPath, merged);
        } else {
          writeFileSync(configPath, mcpConfig.content);
        }
        result.mcpConfigured = true;
      }

      // Generate .windsurfrules behavioral rules
      const rules = this.generator.generateBehavioralRules('windsurf');
      const rulesPath = join(this.projectRoot, rules.path);
      result.rulesPath = rulesPath;

      if (!existsSync(rulesPath) || this.overwrite) {
        if (existsSync(rulesPath) && this.overwrite) {
          const merged = this.mergeExistingRules(rulesPath, rules.content);
          writeFileSync(rulesPath, merged);
        } else {
          writeFileSync(rulesPath, rules.content);
        }
        result.rulesInstalled = true;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Windsurf installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  private mergeExistingConfig(configPath: string, newContent: string): string {
    try {
      const existing = JSON.parse(readFileSync(configPath, 'utf-8'));
      const incoming = JSON.parse(newContent);

      if (!existing.mcpServers) {
        existing.mcpServers = {};
      }
      Object.assign(existing.mcpServers, incoming.mcpServers);

      return JSON.stringify(existing, null, 2) + '\n';
    } catch {
      return newContent;
    }
  }

  /**
   * Merge AQE rules into existing .windsurfrules.
   * Appends if AQE section not already present.
   */
  private mergeExistingRules(rulesPath: string, newContent: string): string {
    try {
      const existing = readFileSync(rulesPath, 'utf-8');

      if (existing.includes('Agentic QE') || existing.includes('fleet_init')) {
        return existing;
      }

      return existing.trimEnd() + '\n\n---\n\n' + newContent;
    } catch {
      return newContent;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWindsurfInstaller(options: WindsurfInstallerOptions): WindsurfInstaller {
  return new WindsurfInstaller(options);
}
