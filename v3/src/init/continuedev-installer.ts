/**
 * Continue.dev Platform Installer
 * Generates MCP config (.continue/config.yaml) and QE rules
 * (.continue/rules/aqe-qe-standards.yaml) for Continue.dev IDE extension.
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

export interface ContinueDevInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
}

export interface ContinueDevInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  rulesInstalled: boolean;
  errors: string[];
  configPath: string;
  rulesPath: string;
}

// ============================================================================
// Continue.dev Installer Class
// ============================================================================

export class ContinueDevInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private generator: PlatformConfigGenerator;

  constructor(options: ContinueDevInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<ContinueDevInstallResult> {
    const result: ContinueDevInstallResult = {
      success: true,
      mcpConfigured: false,
      rulesInstalled: false,
      errors: [],
      configPath: '',
      rulesPath: '',
    };

    try {
      // Generate YAML MCP config
      const mcpConfig = this.generator.generateMcpConfig('continuedev');
      const configPath = join(this.projectRoot, mcpConfig.path);
      result.configPath = configPath;

      if (!existsSync(configPath) || this.overwrite) {
        const configDir = dirname(configPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        if (existsSync(configPath) && this.overwrite) {
          const merged = this.mergeExistingYamlConfig(configPath, mcpConfig.content);
          writeFileSync(configPath, merged);
        } else {
          writeFileSync(configPath, mcpConfig.content);
        }
        result.mcpConfigured = true;
      }

      // Generate QE rules YAML
      const rules = this.generator.generateBehavioralRules('continuedev');
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
      result.errors.push(`Continue.dev installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Merge AQE MCP server into existing Continue config.yaml.
   * If existing config already has mcpServers, appends just the server entry.
   * Otherwise appends the full mcpServers block.
   */
  private mergeExistingYamlConfig(configPath: string, newContent: string): string {
    try {
      const existing = readFileSync(configPath, 'utf-8');

      // If AQE server already configured, return as-is
      if (existing.includes('agentic-qe')) {
        return existing;
      }

      // If existing config already has mcpServers key, append just the server entry
      // to avoid duplicate mcpServers keys (which produces invalid YAML)
      if (existing.includes('mcpServers:')) {
        const serverEntry = `  - name: agentic-qe
    command: npx
    args:
      - "-y"
      - agentic-qe@latest
      - mcp
    env:
      AQE_MEMORY_PATH: .agentic-qe/memory.db
      AQE_V3_MODE: "true"`;
        return existing.trimEnd() + '\n' + serverEntry + '\n';
      }

      // No existing mcpServers — append the full block
      return existing.trimEnd() + '\n\n' + newContent;
    } catch {
      return newContent;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createContinueDevInstaller(options: ContinueDevInstallerOptions): ContinueDevInstaller {
  return new ContinueDevInstaller(options);
}
