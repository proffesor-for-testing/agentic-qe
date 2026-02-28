/**
 * Cursor Platform Installer
 * Generates MCP config (.cursor/mcp.json) and behavioral rules (.cursorrules)
 * for Cursor IDE integration.
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

export interface CursorInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
}

export interface CursorInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  rulesInstalled: boolean;
  errors: string[];
  configPath: string;
  rulesPath: string;
}

// ============================================================================
// Cursor Installer Class
// ============================================================================

export class CursorInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private generator: PlatformConfigGenerator;

  constructor(options: CursorInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<CursorInstallResult> {
    const result: CursorInstallResult = {
      success: true,
      mcpConfigured: false,
      rulesInstalled: false,
      errors: [],
      configPath: '',
      rulesPath: '',
    };

    try {
      // Generate MCP config
      const mcpConfig = this.generator.generateMcpConfig('cursor');
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

      // Generate .cursorrules
      const rules = this.generator.generateBehavioralRules('cursor');
      const rulesPath = join(this.projectRoot, rules.path);
      result.rulesPath = rulesPath;

      if (!existsSync(rulesPath) || this.overwrite) {
        writeFileSync(rulesPath, rules.content);
        result.rulesInstalled = true;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Cursor installation failed: ${toErrorMessage(error)}`);
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
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCursorInstaller(options: CursorInstallerOptions): CursorInstaller {
  return new CursorInstaller(options);
}
