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
import { writeFileIfChanged } from './idempotent-write.js';
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
  /**
   * Memory backend for this install. 'memory' => database-free: the MCP config
   * is written to run in-memory (AQE_MEMORY_BACKEND=memory, no AQE_MEMORY_PATH). (#533)
   */
  memoryBackend?: 'memory' | 'sqlite' | 'agentdb' | 'hybrid';
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
  private options: CopilotInstallerOptions;
  private generator: PlatformConfigGenerator;

  constructor(options: CopilotInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.options = options;
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
      const mcpConfig = this.generator.generateMcpConfig('copilot', { memoryBackend: this.options.memoryBackend });
      const configPath = join(this.projectRoot, mcpConfig.path);
      result.configPath = configPath;

      // AQE's own server entry is refreshed on every init, independent of
      // `overwrite` (#1269): its launch config is version-pinned, and a stale one
      // leaves VS Code serving tool schemas cached from an older server. Other
      // servers and top-level keys in the file are preserved.
      if (!existsSync(configPath)) {
        const configDir = dirname(configPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }
        writeFileSync(configPath, mcpConfig.content);
        result.mcpConfigured = true;
      } else {
        const merged = this.mergeExistingConfig(configPath, mcpConfig.content);
        if (merged === null) {
          result.errors.push(
            `${configPath} is not plain JSON (comments?) and was left unchanged; ` +
            `update its "agentic-qe" server entry by hand`
          );
        } else {
          writeFileIfChanged(configPath, merged);
          result.mcpConfigured = true;
        }
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

  /**
   * Replace AQE's server entry in an existing config, keeping everything else.
   * Returns null when the file cannot be merged safely (e.g. JSONC comments,
   * which VS Code accepts but JSON.parse does not) so the user's file is never
   * clobbered wholesale.
   */
  private mergeExistingConfig(configPath: string, newContent: string): string | null {
    let existing: unknown;
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      return null;
    }
    if (!isPlainObject(existing)) return null;
    if (existing.servers === undefined) existing.servers = {};
    if (!isPlainObject(existing.servers)) return null;

    const incoming = JSON.parse(newContent) as { servers: Record<string, unknown> };
    Object.assign(existing.servers, incoming.servers);

    return JSON.stringify(existing, null, 2) + '\n';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCopilotInstaller(options: CopilotInstallerOptions): CopilotInstaller {
  return new CopilotInstaller(options);
}
