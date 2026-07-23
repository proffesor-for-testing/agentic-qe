/**
 * OpenAI Codex CLI Platform Installer
 * Generates MCP config (.codex/config.toml) and behavioral rules (AGENTS.md)
 * for OpenAI Codex CLI integration.
 *
 * Follows the OpenCode/Kiro installer pattern (ADR-025).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
  /**
   * Memory backend for this install. 'memory' => database-free: the MCP config
   * is written to run in-memory (AQE_MEMORY_BACKEND=memory, no AQE_MEMORY_PATH). (#533)
   */
  memoryBackend?: 'memory' | 'sqlite' | 'agentdb' | 'hybrid';
}

export interface CodexInstallResult {
  success: boolean;
  mcpConfigured: boolean;
  agentsMdInstalled: boolean;
  hooksConfigured: boolean;
  skillsInstalled: number;
  errors: string[];
  configPath: string;
  agentsMdPath: string;
  hooksPath: string;
  skillsPath: string;
}

// ============================================================================
// Codex Installer Class
// ============================================================================

export class CodexInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private options: CodexInstallerOptions;
  private generator: PlatformConfigGenerator;

  constructor(options: CodexInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.options = options;
    this.generator = createPlatformConfigGenerator();
  }

  async install(): Promise<CodexInstallResult> {
    const result: CodexInstallResult = {
      success: true,
      mcpConfigured: false,
      agentsMdInstalled: false,
      hooksConfigured: false,
      skillsInstalled: 0,
      errors: [],
      configPath: '',
      agentsMdPath: '',
      hooksPath: join(this.projectRoot, '.codex', 'hooks.json'),
      skillsPath: join(this.projectRoot, '.agents', 'skills'),
    };

    try {
      // Generate TOML MCP config
      const mcpConfig = this.generator.generateMcpConfig('codex', { memoryBackend: this.options.memoryBackend });
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

      this.installCodexHooks(result);
      result.skillsInstalled = this.installCodexSkills();
    } catch (error) {
      result.success = false;
      result.errors.push(`Codex installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Install Codex-native lifecycle adapters and merge AQE/ruflo hook groups
   * without removing user-defined hooks.
   */
  private installCodexHooks(result: CodexInstallResult): void {
    const sourceRoot = this.resolvePackageRoot();
    if (!sourceRoot) return;

    const sourceConfig = join(sourceRoot, '.codex', 'hooks.json');
    const sourceScripts = join(sourceRoot, '.codex', 'hooks');
    if (!existsSync(sourceConfig) || !existsSync(sourceScripts)) return;

    const targetCodexDir = join(this.projectRoot, '.codex');
    const targetScripts = join(targetCodexDir, 'hooks');
    mkdirSync(targetScripts, { recursive: true });

    for (const file of readdirSync(sourceScripts)) {
      const source = join(sourceScripts, file);
      if (!statSync(source).isFile()) continue;
      const target = join(targetScripts, file);
      if (!existsSync(target) || this.overwrite) {
        copyFileSync(source, target);
      }
    }
    const runtimes = [
      {
        source: join(sourceRoot, '.claude', 'hooks', 'aqe-hook.cjs'),
        target: join(targetScripts, 'aqe-runtime.cjs'),
      },
      {
        source: join(sourceRoot, '.claude', 'helpers', 'ruflo-hook.cjs'),
        target: join(targetScripts, 'ruflo-runtime.cjs'),
      },
    ];
    for (const runtime of runtimes) {
      if (existsSync(runtime.source) && (!existsSync(runtime.target) || this.overwrite)) {
        copyFileSync(runtime.source, runtime.target);
      }
    }

    const generated = JSON.parse(readFileSync(sourceConfig, 'utf-8')) as {
      description?: string;
      hooks?: Record<string, unknown[]>;
    };
    const targetConfig = join(targetCodexDir, 'hooks.json');

    if (!existsSync(targetConfig)) {
      writeFileSync(targetConfig, JSON.stringify(generated, null, 2) + '\n');
      result.hooksConfigured = true;
      return;
    }
    if (!this.overwrite) return;

    const existing = JSON.parse(readFileSync(targetConfig, 'utf-8')) as {
      description?: string;
      hooks?: Record<string, unknown[]>;
      [key: string]: unknown;
    };
    const owned = (value: unknown): boolean =>
      JSON.stringify(value).includes('/.codex/hooks/aqe-codex-hook.cjs')
      || JSON.stringify(value).includes('/.codex/hooks/ruflo-codex-hook.cjs');
    const mergedHooks: Record<string, unknown[]> = {};
    const events = new Set([
      ...Object.keys(existing.hooks || {}),
      ...Object.keys(generated.hooks || {}),
    ]);
    for (const event of events) {
      const userGroups = (existing.hooks?.[event] || []).filter((group) => !owned(group));
      mergedHooks[event] = [...userGroups, ...(generated.hooks?.[event] || [])];
    }
    writeFileSync(
      targetConfig,
      JSON.stringify({ ...existing, description: generated.description, hooks: mergedHooks }, null, 2) + '\n',
    );
    result.hooksConfigured = true;
  }

  /** Install the curated repo-scoped AQE skills Codex discovers automatically. */
  private installCodexSkills(): number {
    const sourceRoot = this.resolvePackageRoot();
    if (!sourceRoot) return 0;
    const sourceSkills = join(sourceRoot, '.agents', 'skills');
    if (!existsSync(sourceSkills)) return 0;

    const targetSkills = join(this.projectRoot, '.agents', 'skills');
    mkdirSync(targetSkills, { recursive: true });
    let installed = 0;
    for (const skill of readdirSync(sourceSkills)) {
      if (!skill.startsWith('aqe-')) continue;
      const source = join(sourceSkills, skill);
      if (!statSync(source).isDirectory()) continue;
      const target = join(targetSkills, skill);
      if (existsSync(target) && !this.overwrite) continue;
      this.copyDirectory(source, target);
      installed++;
    }
    return installed;
  }

  private copyDirectory(source: string, target: string): void {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      const from = join(source, entry);
      const to = join(target, entry);
      if (statSync(from).isDirectory()) {
        this.copyDirectory(from, to);
      } else {
        copyFileSync(from, to);
      }
    }
  }

  private resolvePackageRoot(): string | undefined {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(moduleDir, '..', '..'),
      // esbuild bundles this module into dist/cli/bundle.js, so import.meta.url
      // no longer identifies src/init/codex-installer.ts. Resolve from the
      // running CLI entrypoint as the authoritative packaged layout.
      join(dirname(process.argv[1] || ''), '..', '..'),
      join(this.projectRoot, 'node_modules', 'agentic-qe'),
    ];
    return candidates.find((candidate) =>
      existsSync(join(candidate, '.codex', 'hooks.json'))
      || existsSync(join(candidate, '.agents', 'skills')),
    );
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
