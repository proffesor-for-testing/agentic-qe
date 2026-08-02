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
import { selectCodexSkills } from './codex-skill-manifest.js';
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
  /** Whether to install the AQE MCP server entry. Defaults to true. */
  installMcp?: boolean;
  /** Install the lightweight Ruflo orchestration skill when Ruflo is detected. */
  includeRufloSkill?: boolean;
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
  /** Per-component outcomes. Legacy booleans above remain supported. */
  components: {
    mcp: CodexComponentOutcome;
    rules: CodexComponentOutcome;
    hooks: CodexComponentOutcome;
    skills: CodexComponentOutcome;
  };
}

export interface CodexComponentOutcome {
  status: 'installed' | 'updated' | 'preserved' | 'skipped' | 'unavailable' | 'failed';
  error?: string;
}

// ============================================================================
// Codex Installer Class
// ============================================================================

export class CodexInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private options: CodexInstallerOptions;
  private generator: PlatformConfigGenerator;

  private static readonly AGENTS_START = '<!-- BEGIN AGENTIC-QE CODEX -->';
  private static readonly AGENTS_END = '<!-- END AGENTIC-QE CODEX -->';

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
      components: {
        mcp: { status: 'skipped' },
        rules: { status: 'skipped' },
        hooks: { status: 'unavailable' },
        skills: { status: 'unavailable' },
      },
    };

    try {
      const mcpConfig = this.generator.generateMcpConfig('codex', { memoryBackend: this.options.memoryBackend });
      const configPath = join(this.projectRoot, mcpConfig.path);
      result.configPath = configPath;

      // Generate TOML MCP config unless the caller explicitly requested a
      // platform-only install (rules, hooks, and skills remain useful).
      const configExists = existsSync(configPath);
      if (this.options.installMcp !== false && (!configExists || this.overwrite)) {
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
        result.components.mcp.status = configExists ? 'updated' : 'installed';
      } else if (this.options.installMcp !== false && configExists) {
        result.components.mcp.status = 'preserved';
      }
    } catch (error) {
      this.recordComponentFailure(result, 'mcp', error);
    }

    try {
      // Generate AGENTS.md behavioral rules
      const rules = this.generator.generateBehavioralRules('codex');
      const agentsMdPath = join(this.projectRoot, rules.path);
      result.agentsMdPath = agentsMdPath;

      const rulesExist = existsSync(agentsMdPath);
      if (!rulesExist || this.overwrite) {
        if (rulesExist && this.overwrite) {
          const merged = this.mergeExistingAgentsMd(agentsMdPath, rules.content);
          writeFileSync(agentsMdPath, merged);
        } else {
          writeFileSync(agentsMdPath, this.markAgentsSection(rules.content));
        }
        result.agentsMdInstalled = true;
        result.components.rules.status = rulesExist ? 'updated' : 'installed';
      } else {
        result.components.rules.status = 'preserved';
      }
    } catch (error) {
      this.recordComponentFailure(result, 'rules', error);
    }

    try {
      this.installCodexHooks(result);
      if (result.hooksConfigured) result.components.hooks.status = 'installed';
    } catch (error) {
      this.recordComponentFailure(result, 'hooks', error);
    }

    try {
      result.skillsInstalled = this.installCodexSkills();
      const sourceRoot = this.resolvePackageRoot();
      const assetsAvailable = sourceRoot
        && existsSync(join(sourceRoot, '.agents', 'skills'));
      result.components.skills.status = !assetsAvailable
        ? 'unavailable'
        : result.skillsInstalled > 0
          ? 'installed'
          : 'preserved';
    } catch (error) {
      this.recordComponentFailure(result, 'skills', error);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  private recordComponentFailure(
    result: CodexInstallResult,
    component: keyof CodexInstallResult['components'],
    error: unknown,
  ): void {
    const message = toErrorMessage(error);
    result.components[component] = { status: 'failed', error: message };
    result.errors.push(`Codex ${component} installation failed: ${message}`);
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
    for (const skill of selectCodexSkills({ includeRuflo: this.options.includeRufloSkill })) {
      const source = join(sourceSkills, skill.name);
      if (!existsSync(source) || !statSync(source).isDirectory()) continue;
      const target = join(targetSkills, skill.name);
      if (existsSync(target) && !this.overwrite) continue;
      if (skill.files) {
        mkdirSync(target, { recursive: true });
        for (const relativeFile of skill.files) {
          const from = join(source, relativeFile);
          if (!existsSync(from) || !statSync(from).isFile()) continue;
          const to = join(target, relativeFile);
          mkdirSync(dirname(to), { recursive: true });
          copyFileSync(from, to);
        }
      } else {
        this.copyDirectory(source, target);
      }
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
   * Replace only AQE-owned TOML tables, preserving every user-owned table and
   * setting. AQE owns the exact `mcp_servers.agentic-qe` table prefix.
   */
  private mergeExistingTomlConfig(configPath: string, newContent: string): string {
    try {
      const existing = readFileSync(configPath, 'utf-8');

      const aqeTable = /^\s*\[mcp_servers\.agentic-qe(?:\.[^\]]+)?\]\s*(?:#.*)?$/;
      const lines = existing.split(/\r?\n/);
      const kept: string[] = [];
      let inOwnedTable = false;
      for (const line of lines) {
        if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line)) {
          inOwnedTable = aqeTable.test(line);
        }
        if (!inOwnedTable) kept.push(line);
      }
      return kept.join('\n').trimEnd() + '\n\n' + newContent.trim() + '\n';
    } catch {
      return newContent;
    }
  }

  /**
   * Merge AQE section into existing AGENTS.md.
   * Replaces a previously marked AQE section or appends a new marked section.
   */
  private mergeExistingAgentsMd(agentsMdPath: string, newContent: string): string {
    try {
      const existing = readFileSync(agentsMdPath, 'utf-8');

      const marked = this.markAgentsSection(newContent);
      const start = CodexInstaller.AGENTS_START;
      const end = CodexInstaller.AGENTS_END;
      const startIndex = existing.indexOf(start);
      if (startIndex >= 0) {
        const endIndex = existing.indexOf(end, startIndex);
        if (endIndex >= 0) {
          return existing.slice(0, startIndex) + marked
            + existing.slice(endIndex + end.length);
        }
      }
      return existing.trimEnd() + '\n\n---\n\n' + marked;
    } catch {
      return newContent;
    }
  }

  private markAgentsSection(content: string): string {
    return `${CodexInstaller.AGENTS_START}\n${content.trim()}\n${CodexInstaller.AGENTS_END}\n`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCodexInstaller(options: CodexInstallerOptions): CodexInstaller {
  return new CodexInstaller(options);
}
