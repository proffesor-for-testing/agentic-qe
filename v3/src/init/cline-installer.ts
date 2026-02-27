/**
 * Cline Platform Installer
 * Generates MCP config (.vscode/cline_mcp_settings.json) and custom QE mode
 * for Cline VS Code extension integration.
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

export interface ClineInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
}

export interface ClineInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  modeInstalled: boolean;
  errors: string[];
  configPath: string;
  modePath: string;
}

// ============================================================================
// Cline Installer Class
// ============================================================================

export class ClineInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private generator: PlatformConfigGenerator;

  constructor(options: ClineInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<ClineInstallResult> {
    const result: ClineInstallResult = {
      success: true,
      mcpConfigured: false,
      modeInstalled: false,
      errors: [],
      configPath: '',
      modePath: '',
    };

    try {
      // Generate MCP config
      const mcpConfig = this.generator.generateMcpConfig('cline');
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

      // Generate custom QE mode
      const rules = this.generator.generateBehavioralRules('cline');
      const modePath = join(this.projectRoot, rules.path);
      result.modePath = modePath;

      if (!existsSync(modePath) || this.overwrite) {
        const modeDir = dirname(modePath);
        if (!existsSync(modeDir)) {
          mkdirSync(modeDir, { recursive: true });
        }

        if (existsSync(modePath) && this.overwrite) {
          const merged = this.mergeExistingModes(modePath, rules.content);
          writeFileSync(modePath, merged);
        } else {
          writeFileSync(modePath, rules.content);
        }
        result.modeInstalled = true;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Cline installation failed: ${toErrorMessage(error)}`);
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

  private mergeExistingModes(modePath: string, newContent: string): string {
    try {
      const existing = JSON.parse(readFileSync(modePath, 'utf-8'));
      const incoming = JSON.parse(newContent);

      if (!Array.isArray(existing)) {
        return newContent;
      }

      // Remove existing qe-engineer mode, add new one
      const filtered = existing.filter(
        (m: { slug?: string }) => m.slug !== 'qe-engineer'
      );
      filtered.push(...incoming);

      return JSON.stringify(filtered, null, 2) + '\n';
    } catch {
      return newContent;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createClineInstaller(options: ClineInstallerOptions): ClineInstaller {
  return new ClineInstaller(options);
}
