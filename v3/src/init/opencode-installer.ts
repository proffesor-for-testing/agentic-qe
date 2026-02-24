/**
 * OpenCode Platform Installer
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Installs OpenCode agents, skills, tools, and permissions to user projects
 * when --with-opencode flag is used. Follows the N8n installer pattern.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { toErrorMessage } from '../shared/error-utils.js';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  /** Install OpenCode tool wrappers (default: true) */
  installTools?: boolean;
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
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
      installTools: true,
      overwrite: false,
      ...options,
    };
    this.sourceDir = this.findSourceDir();
  }

  // ==========================================================================
  // Source Directory Detection
  // ==========================================================================

  /**
   * Find the source .opencode/ directory
   */
  private findSourceDir(): string {
    const possiblePaths = [
      // From v3/src/init/ context (development)
      join(__dirname, '../../../.opencode'),
      join(__dirname, '../../.opencode'),
      // From project root (CWD)
      join(process.cwd(), '.opencode'),
      // NPM package location
      join(__dirname, '../../assets/opencode'),
      // Monorepo location
      join(process.cwd(), '../.opencode'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Default to CWD location
    return join(process.cwd(), '.opencode');
  }

  // ==========================================================================
  // Installation
  // ==========================================================================

  /**
   * Install OpenCode agents, skills, tools, and permissions
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

      // Install agents
      if (this.options.installAgents) {
        const agentResult = this.installAgents(targetDir);
        result.agentsInstalled = agentResult.installed;
        result.errors.push(...agentResult.errors);
      }

      // Install skills
      if (this.options.installSkills) {
        const skillResult = this.installSkills(targetDir);
        result.skillsInstalled = skillResult.installed;
        result.errors.push(...skillResult.errors);
      }

      // Install tools
      if (this.options.installTools) {
        const toolResult = this.installTools(targetDir);
        result.toolsInstalled = toolResult.installed;
        result.errors.push(...toolResult.errors);
      }

      // Install permissions
      const permResult = this.installPermissions(targetDir);
      result.permissionsInstalled = permResult.installed;
      result.errors.push(...permResult.errors);

      // Generate opencode.json MCP config if not exists
      this.generateOpenCodeConfig();
    } catch (error) {
      result.success = false;
      result.errors.push(`Installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Install agent YAML files from .opencode/agents/
   */
  private installAgents(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const sourceAgentsDir = join(this.sourceDir, 'agents');
    const targetAgentsDir = join(targetDir, 'agents');

    if (!existsSync(sourceAgentsDir)) {
      errors.push(`Source agents directory not found: ${sourceAgentsDir}`);
      return { installed, errors };
    }

    if (!existsSync(targetAgentsDir)) {
      mkdirSync(targetAgentsDir, { recursive: true });
    }

    const files = readdirSync(sourceAgentsDir).filter(f => f.endsWith('.yaml'));

    for (const file of files) {
      const sourceFile = join(sourceAgentsDir, file);
      const targetFile = join(targetAgentsDir, file);

      if (existsSync(targetFile) && !this.options.overwrite) {
        continue;
      }

      try {
        copyFileSync(sourceFile, targetFile);
        installed.push(file.replace('.yaml', ''));
      } catch (error) {
        errors.push(`Failed to install agent ${file}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  /**
   * Install skill YAML files from .opencode/skills/
   */
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

    const files = readdirSync(sourceSkillsDir).filter(f => f.endsWith('.yaml'));

    for (const file of files) {
      const sourceFile = join(sourceSkillsDir, file);
      const targetFile = join(targetSkillsDir, file);

      if (existsSync(targetFile) && !this.options.overwrite) {
        continue;
      }

      try {
        copyFileSync(sourceFile, targetFile);
        installed.push(file.replace('.yaml', ''));
      } catch (error) {
        errors.push(`Failed to install skill ${file}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  /**
   * Install tool wrapper files from .opencode/tools/
   */
  private installTools(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const sourceToolsDir = join(this.sourceDir, 'tools');
    const targetToolsDir = join(targetDir, 'tools');

    if (!existsSync(sourceToolsDir)) {
      errors.push(`Source tools directory not found: ${sourceToolsDir}`);
      return { installed, errors };
    }

    if (!existsSync(targetToolsDir)) {
      mkdirSync(targetToolsDir, { recursive: true });
    }

    const files = readdirSync(sourceToolsDir).filter(f => f.endsWith('.ts'));

    for (const file of files) {
      const sourceFile = join(sourceToolsDir, file);
      const targetFile = join(targetToolsDir, file);

      if (existsSync(targetFile) && !this.options.overwrite) {
        continue;
      }

      try {
        copyFileSync(sourceFile, targetFile);
        installed.push(file.replace('.ts', ''));
      } catch (error) {
        errors.push(`Failed to install tool ${file}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  /**
   * Install permissions.yaml to target .opencode/ directory
   */
  private installPermissions(targetDir: string): { installed: boolean; errors: string[] } {
    const errors: string[] = [];
    const sourceFile = join(this.sourceDir, 'permissions.yaml');
    const targetFile = join(targetDir, 'permissions.yaml');

    if (!existsSync(sourceFile)) {
      return { installed: false, errors: [] };
    }

    if (existsSync(targetFile) && !this.options.overwrite) {
      return { installed: false, errors: [] };
    }

    try {
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }
      copyFileSync(sourceFile, targetFile);
      return { installed: true, errors: [] };
    } catch (error) {
      errors.push(`Failed to install permissions.yaml: ${toErrorMessage(error)}`);
      return { installed: false, errors };
    }
  }

  /**
   * Generate opencode.json MCP config if it does not already exist
   */
  private generateOpenCodeConfig(): void {
    const configPath = join(this.projectRoot, 'opencode.json');

    if (existsSync(configPath)) {
      return;
    }

    const config = {
      mcp: {
        'agentic-qe': {
          type: 'local',
          command: 'npx',
          args: ['agentic-qe', 'mcp'],
          env: {
            AQE_MEMORY_PATH: '.agentic-qe/memory.db',
            AQE_V3_MODE: 'true',
          },
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
