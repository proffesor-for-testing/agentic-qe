/**
 * GitHub Copilot Platform Installer
 * Generates MCP config (.vscode/mcp.json) and behavioral rules
 * (.github/copilot-instructions.md) for GitHub Copilot Agent Mode.
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

export interface CopilotInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
}

export interface CopilotInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  rulesInstalled: boolean;
  errors: string[];
  configPath: string;
  rulesPath: string;
}

// ============================================================================
// Copilot Installer Class
// ============================================================================

export class CopilotInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private generator: PlatformConfigGenerator;

  constructor(options: CopilotInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<CopilotInstallResult> {
    const result: CopilotInstallResult = {
      success: true,
      mcpConfigured: false,
      rulesInstalled: false,
      errors: [],
      configPath: '',
      rulesPath: '',
    };

    try {
      // Generate MCP config
      const mcpConfig = this.generator.generateMcpConfig('copilot');
      const configPath = join(this.projectRoot, mcpConfig.path);
      result.configPath = configPath;

      if (!existsSync(configPath) || this.overwrite) {
        const configDir = dirname(configPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        // Merge with existing if present
        if (existsSync(configPath) && this.overwrite) {
          const merged = this.mergeExistingConfig(configPath, mcpConfig.content);
          writeFileSync(configPath, merged);
        } else {
          writeFileSync(configPath, mcpConfig.content);
        }
        result.mcpConfigured = true;
      }

      // Generate behavioral rules
      const rules = this.generator.generateBehavioralRules('copilot');
      const rulesPath = join(this.projectRoot, rules.path);
      result.rulesPath = rulesPath;

      if (!existsSync(rulesPath) || this.overwrite) {
        const rulesDir = dirname(rulesPath);
        if (!existsSync(rulesDir)) {
          mkdirSync(rulesDir, { recursive: true });
        }
        writeFileSync(rulesPath, rules.content);
        result.rulesInstalled = true;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Copilot installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  private mergeExistingConfig(configPath: string, newContent: string): string {
    try {
      const existing = JSON.parse(readFileSync(configPath, 'utf-8'));
      const incoming = JSON.parse(newContent);

      // Merge servers
      if (!existing.servers) {
        existing.servers = {};
      }
      Object.assign(existing.servers, incoming.servers);

      return JSON.stringify(existing, null, 2) + '\n';
    } catch {
      // If existing config is invalid, overwrite
      return newContent;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCopilotInstaller(options: CopilotInstallerOptions): CopilotInstaller {
  return new CopilotInstaller(options);
}
