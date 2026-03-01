/**
 * OpenAI Codex CLI Platform Installer
 * Generates MCP config (.codex/config.toml) and behavioral rules (AGENTS.md)
 * for OpenAI Codex CLI integration.
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

export interface CodexInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
}

export interface CodexInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  agentsMdInstalled: boolean;
  errors: string[];
  configPath: string;
  agentsMdPath: string;
}

// ============================================================================
// Codex Installer Class
// ============================================================================

export class CodexInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private generator: PlatformConfigGenerator;

  constructor(options: CodexInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<CodexInstallResult> {
    const result: CodexInstallResult = {
      success: true,
      mcpConfigured: false,
      agentsMdInstalled: false,
      errors: [],
      configPath: '',
      agentsMdPath: '',
    };

    try {
      // Generate TOML MCP config
      const mcpConfig = this.generator.generateMcpConfig('codex');
      const configPath = join(this.projectRoot, mcpConfig.path);
      result.configPath = configPath;

      if (!existsSync(configPath) || this.overwrite) {
        const configDir = dirname(configPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        if (existsSync(configPath) && this.overwrite) {
          const merged = this.mergeExistingTomlConfig(configPath, mcpConfig.content);
          writeFileSync(configPath, merged);
        } else {
          writeFileSync(configPath, mcpConfig.content);
        }
        result.mcpConfigured = true;
      }

      // Generate AGENTS.md behavioral rules
      const rules = this.generator.generateBehavioralRules('codex');
      const agentsMdPath = join(this.projectRoot, rules.path);
      result.agentsMdPath = agentsMdPath;

      if (!existsSync(agentsMdPath) || this.overwrite) {
        if (existsSync(agentsMdPath) && this.overwrite) {
          const merged = this.mergeExistingAgentsMd(agentsMdPath, rules.content);
          writeFileSync(agentsMdPath, merged);
        } else {
          writeFileSync(agentsMdPath, rules.content);
        }
        result.agentsMdInstalled = true;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Codex installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Merge AQE MCP server config into existing TOML.
   * Simple approach: if [mcp_servers.agentic-qe] already exists, skip.
   * Otherwise, append the AQE block at the end.
   */
  private mergeExistingTomlConfig(configPath: string, newContent: string): string {
    try {
      const existing = readFileSync(configPath, 'utf-8');

      // If AQE server already configured, return as-is
      if (existing.includes('[mcp_servers.agentic-qe]')) {
        return existing;
      }

      // Append AQE config block
      return existing.trimEnd() + '\n\n' + newContent;
    } catch {
      return newContent;
    }
  }

  /**
   * Merge AQE section into existing AGENTS.md.
   * Appends the AQE section if not already present.
   */
  private mergeExistingAgentsMd(agentsMdPath: string, newContent: string): string {
    try {
      const existing = readFileSync(agentsMdPath, 'utf-8');

      // If AQE section already present, return as-is
      if (existing.includes('Agentic QE') || existing.includes('fleet_init')) {
        return existing;
      }

      // Append AQE section
      return existing.trimEnd() + '\n\n---\n\n' + newContent;
    } catch {
      return newContent;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCodexInstaller(options: CodexInstallerOptions): CodexInstaller {
  return new CodexInstaller(options);
}
