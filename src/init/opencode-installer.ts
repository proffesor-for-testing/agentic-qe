/**
 * OpenCode Platform Installer
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Installs OpenCode agents and skills to user projects in OpenCode's NATIVE
 * on-disk format (validated against OpenCode CLI v1.17.x):
 *   - agents -> .opencode/agent/<name>.md   (markdown + YAML frontmatter; body = system prompt)
 *   - skills -> .opencode/skills/<name>/SKILL.md  (frontmatter name+description; body = instructions)
 *   - MCP    -> opencode.json (mcp.agentic-qe local server)
 *
 * The shipped source assets under <pkg>/.opencode/{agents,skills} use AQE's own
 * YAML schema (name/description/model/systemPrompt/tools/permissions). OpenCode
 * does NOT load that schema, so this installer CONVERTS them at install time.
 *
 * Tools are intentionally NOT installed: AQE's .opencode/tools/*.ts use a custom
 * `{name, parameters, execute}` shape and call ctx.callTool('mcp:agentic-qe:*'),
 * which is incompatible with OpenCode's `tool()` API and redundant once the MCP
 * server is connected (the underlying tools are exposed directly).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { toErrorMessage } from '../shared/error-utils.js';
import { findPackageRoot } from './find-package-root.js';

// ============================================================================
// Types
// ============================================================================

export interface OpenCodeInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Install OpenCode agent definitions (default: true) */
  installAgents?: boolean;
  /** Install OpenCode skill definitions (default: true) */
  installSkills?: boolean;
  /**
   * Install AQE tool wrappers. Default false — AQE's tool .ts files are not in
   * OpenCode's `tool()` format and are redundant with the MCP server. Kept as an
   * option only for backward compatibility; enabling it copies incompatible files.
   */
  installTools?: boolean;
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
  /**
   * Memory backend the generated opencode.json MCP server should use at runtime.
   * 'memory' => fully database-free install: AQE_MEMORY_BACKEND=memory and no
   * AQE_MEMORY_PATH, so the MCP server keeps everything in-memory and writes
   * nothing under .agentic-qe/. Default (undefined) preserves persistent SQLite.
   */
  memoryBackend?: 'memory' | 'sqlite' | 'agentdb' | 'hybrid';
}

export interface OpenCodeInstallResult {
  success: boolean;
  agentsInstalled: string[];
  skillsInstalled: string[];
  toolsInstalled: string[];
  permissionsInstalled: boolean;
  errors: string[];
  targetDir: string;
}

// OpenCode-valid per-agent permission keys. AQE keys outside this set are dropped
// or remapped (see PERM_KEY_MAP). In particular `mcp:agentic-qe:*` patterns are
// dropped — OpenCode does not interpret MCP tool patterns in the permission block.
const VALID_PERMISSION_KEYS = new Set([
  'read', 'edit', 'glob', 'grep', 'list', 'bash', 'task',
  'external_directory', 'todowrite', 'webfetch', 'websearch',
  'lsp', 'skill', 'question', 'doom_loop',
]);

// Remap AQE permission keys to OpenCode equivalents.
const PERM_KEY_MAP: Record<string, string> = {
  fetch: 'webfetch',
  write: 'edit', // OpenCode has no separate 'write' permission; file writes are 'edit'
};

// ============================================================================
// OpenCode Installer Class
// ============================================================================

export class OpenCodeInstaller {
  private projectRoot: string;
  private options: Required<Pick<OpenCodeInstallerOptions, 'installAgents' | 'installSkills' | 'installTools' | 'overwrite'>> & OpenCodeInstallerOptions;
  private sourceDir: string;

  constructor(options: OpenCodeInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.options = {
      installAgents: true,
      installSkills: true,
      installTools: false,
      overwrite: false,
      ...options,
    };
    this.sourceDir = this.findSourceDir();
  }

  // ==========================================================================
  // Source Directory Detection
  // ==========================================================================

  /**
   * Find the source .opencode/ directory containing agents/skills to install.
   * Resolves relative to the package installation directory (not CWD) so that
   * globally-installed and bundled CLI paths all work correctly (#361).
   */
  private findSourceDir(): string {
    const targetDir = join(this.projectRoot, '.opencode');
    const pkgRoot = findPackageRoot(import.meta.url);

    const possiblePaths: string[] = [];

    if (pkgRoot) {
      possiblePaths.push(join(pkgRoot, '.opencode'));
    }

    possiblePaths.push(
      join(this.projectRoot, 'node_modules/agentic-qe/.opencode'),
    );

    for (const path of possiblePaths) {
      if (path === targetDir) continue;
      if (this.isValidSourceDir(path)) {
        return path;
      }
    }

    return possiblePaths[0] ?? join(this.projectRoot, 'node_modules/agentic-qe/.opencode');
  }

  /**
   * Check if a directory is a valid source for OpenCode assets
   * (must exist and contain at least an agents/ or skills/ subdirectory)
   */
  private isValidSourceDir(dir: string): boolean {
    if (!existsSync(dir)) return false;
    return existsSync(join(dir, 'agents')) || existsSync(join(dir, 'skills'));
  }

  // ==========================================================================
  // Installation
  // ==========================================================================

  /**
   * Install OpenCode agents, skills, and MCP config (native OpenCode format).
   */
  async install(): Promise<OpenCodeInstallResult> {
    const targetDir = join(this.projectRoot, '.opencode');
    const result: OpenCodeInstallResult = {
      success: true,
      agentsInstalled: [],
      skillsInstalled: [],
      toolsInstalled: [],
      permissionsInstalled: false,
      errors: [],
      targetDir,
    };

    try {
      if (!existsSync(this.sourceDir)) {
        result.errors.push(`Source .opencode directory not found: ${this.sourceDir}`);
        result.success = false;
        return result;
      }

      // Per-agent permission overrides shipped in permissions.yaml (defaults +
      // per-agent). Merged with each agent's own `permissions` field.
      const permissionsYaml = this.loadPermissionsYaml();

      if (this.options.installAgents) {
        const agentResult = this.installAgents(targetDir, permissionsYaml);
        result.agentsInstalled = agentResult.installed;
        result.errors.push(...agentResult.errors);
        // Per-agent permissions are folded into each agent's frontmatter.
        result.permissionsInstalled = result.agentsInstalled.length > 0;
      }

      if (this.options.installSkills) {
        const skillResult = this.installSkills(targetDir);
        result.skillsInstalled = skillResult.installed;
        result.errors.push(...skillResult.errors);
      }

      // Generate opencode.json MCP config if not present.
      this.generateOpenCodeConfig();
    } catch (error) {
      result.success = false;
      result.errors.push(`Installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  // ==========================================================================
  // Permission helpers
  // ==========================================================================

  /**
   * Load the shipped permissions.yaml (defaults + per-agent overrides). Returns
   * { defaults, agents } or empty maps if the file is missing/unparseable.
   */
  private loadPermissionsYaml(): { defaults: Record<string, unknown>; agents: Record<string, Record<string, unknown>> } {
    const empty = { defaults: {}, agents: {} };
    const file = join(this.sourceDir, 'permissions.yaml');
    if (!existsSync(file)) return empty;
    try {
      const parsed = parseYaml(readFileSync(file, 'utf-8')) as { defaults?: Record<string, unknown>; agents?: Record<string, Record<string, unknown>> };
      return { defaults: parsed?.defaults ?? {}, agents: parsed?.agents ?? {} };
    } catch {
      return empty;
    }
  }

  /**
   * Build an OpenCode-valid `permission` frontmatter object by merging
   * defaults -> agent.permissions (from agent yaml) -> permissions.yaml override,
   * remapping keys and dropping anything OpenCode does not understand.
   */
  private buildPermission(
    agentName: string,
    agentPerms: Record<string, unknown> | undefined,
    permissionsYaml: { defaults: Record<string, unknown>; agents: Record<string, Record<string, unknown>> },
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      ...permissionsYaml.defaults,
      ...(agentPerms ?? {}),
      ...(permissionsYaml.agents[agentName] ?? {}),
    };

    const out: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(merged)) {
      // Drop MCP tool patterns and any other unsupported key.
      if (rawKey.includes(':')) continue;
      const key = PERM_KEY_MAP[rawKey] ?? rawKey;
      if (!VALID_PERMISSION_KEYS.has(key)) continue;
      // 'allow' | 'ask' | 'deny' (string) or object map for bash etc.
      out[key] = value;
    }
    return out;
  }

  // ==========================================================================
  // Agents: <name>.yaml -> .opencode/agent/<name>.md
  // ==========================================================================

  private installAgents(
    targetDir: string,
    permissionsYaml: { defaults: Record<string, unknown>; agents: Record<string, Record<string, unknown>> },
  ): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const sourceAgentsDir = join(this.sourceDir, 'agents');
    const targetAgentsDir = join(targetDir, 'agent'); // OpenCode native: singular 'agent'

    if (!existsSync(sourceAgentsDir)) {
      errors.push(`Source agents directory not found: ${sourceAgentsDir}`);
      return { installed, errors };
    }
    if (!existsSync(targetAgentsDir)) {
      mkdirSync(targetAgentsDir, { recursive: true });
    }

    for (const file of readdirSync(sourceAgentsDir).filter(f => f.endsWith('.yaml'))) {
      try {
        const data = parseYaml(readFileSync(join(sourceAgentsDir, file), 'utf-8')) as {
          name?: string;
          description?: string;
          systemPrompt?: string;
          permissions?: Record<string, unknown>;
        };
        const name = data.name || file.replace(/\.yaml$/, '');
        const targetFile = join(targetAgentsDir, `${name}.md`);
        if (existsSync(targetFile) && !this.options.overwrite) continue;

        const frontmatter: Record<string, unknown> = {
          description: (data.description || name).replace(/\s+/g, ' ').trim(),
          mode: 'subagent',
        };
        // NOTE: `model` is intentionally omitted so agents inherit the user's
        // default OpenCode model. AQE ships model "claude-sonnet-4-6" which may
        // not resolve in OpenCode's provider registry; inheriting avoids
        // hard-failing the agent at invocation time.
        const permission = this.buildPermission(name, data.permissions, permissionsYaml);
        if (Object.keys(permission).length > 0) frontmatter.permission = permission;

        const body = (data.systemPrompt || '').trimEnd() + '\n';
        writeFileSync(targetFile, this.renderFrontmatter(frontmatter) + '\n' + body);
        installed.push(name);
      } catch (error) {
        errors.push(`Failed to convert agent ${file}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  // ==========================================================================
  // Skills: <name>.yaml -> .opencode/skills/<name>/SKILL.md
  // ==========================================================================

  private installSkills(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const sourceSkillsDir = join(this.sourceDir, 'skills');
    const targetSkillsDir = join(targetDir, 'skills');

    if (!existsSync(sourceSkillsDir)) {
      errors.push(`Source skills directory not found: ${sourceSkillsDir}`);
      return { installed, errors };
    }
    if (!existsSync(targetSkillsDir)) {
      mkdirSync(targetSkillsDir, { recursive: true });
    }

    for (const file of readdirSync(sourceSkillsDir).filter(f => f.endsWith('.yaml'))) {
      try {
        const data = parseYaml(readFileSync(join(sourceSkillsDir, file), 'utf-8')) as {
          name?: string;
          description?: string;
          steps?: Array<{ name?: string; description?: string; prompt?: string }>;
        };
        const name = (data.name || file.replace(/\.yaml$/, '')).toLowerCase();
        // OpenCode requires: ^[a-z0-9]+(-[a-z0-9]+)*$ and name === directory.
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
          errors.push(`Skipped skill with non-conforming name: ${name}`);
          continue;
        }
        const skillDir = join(targetSkillsDir, name);
        const targetFile = join(skillDir, 'SKILL.md');
        if (existsSync(targetFile) && !this.options.overwrite) continue;
        if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });

        let description = (data.description || name).replace(/\s+/g, ' ').trim();
        if (description.length > 1024) description = description.slice(0, 1021) + '...';

        let body = '';
        for (const step of data.steps ?? []) {
          body += `## ${step.name || 'step'}\n\n`;
          const text = (step.prompt || step.description || '').trimEnd();
          if (text) body += `${text}\n\n`;
        }
        if (!body.trim()) body = `${data.description || name}\n`;

        writeFileSync(
          targetFile,
          this.renderFrontmatter({ name, description }) + '\n' + body.trimEnd() + '\n',
        );
        installed.push(name);
      } catch (error) {
        errors.push(`Failed to convert skill ${file}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  // ==========================================================================
  // Frontmatter rendering
  // ==========================================================================

  /** Render a frontmatter object as a `---`-delimited YAML block. */
  private renderFrontmatter(obj: Record<string, unknown>): string {
    return `---\n${stringifyYaml(obj).trimEnd()}\n---\n`;
  }

  // ==========================================================================
  // opencode.json MCP config
  // ==========================================================================

  /**
   * Generate opencode.json MCP config if it does not already exist.
   */
  private generateOpenCodeConfig(): void {
    const configPath = join(this.projectRoot, 'opencode.json');
    if (existsSync(configPath)) return;

    // Database-free install: in-memory backend => no AQE_MEMORY_PATH, set
    // AQE_MEMORY_BACKEND=memory so the MCP server writes nothing to disk.
    // Otherwise preserve the historical persistent SQLite path.
    const environment: Record<string, string> =
      this.options.memoryBackend === 'memory'
        ? { AQE_MEMORY_BACKEND: 'memory', AQE_V3_MODE: 'true' }
        : { AQE_MEMORY_PATH: '.agentic-qe/memory.db', AQE_V3_MODE: 'true' };

    const config = {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        'agentic-qe': {
          type: 'local',
          // Use the dedicated `aqe-mcp` bin, which runs the MCP server bundle
          // directly. The `agentic-qe mcp` subcommand instead double-spawns the
          // server (stdio:'inherit'), which corrupts stdin delivery and makes
          // OpenCode's client fail with "Failed to get tools". A higher timeout
          // accommodates the server's subsystem boot.
          command: ['aqe-mcp'],
          environment,
          enabled: true,
          timeout: 60000,
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new OpenCode Installer instance
 */
export function createOpenCodeInstaller(options: OpenCodeInstallerOptions): OpenCodeInstaller {
  return new OpenCodeInstaller(options);
}
