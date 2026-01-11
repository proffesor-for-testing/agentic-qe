/**
 * Skills Installer
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Installs AQE skills (both v2 methodology and v3 domain skills) to user projects.
 * Skills are copied from the bundled skills directory to the project's .claude/skills/.
 */

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Types
// ============================================================================

export interface SkillInfo {
  name: string;
  type: 'v2-methodology' | 'v3-domain' | 'platform' | 'integration';
  description?: string;
  hasResources: boolean;
}

export interface SkillsInstallResult {
  installed: SkillInfo[];
  skipped: string[];
  errors: string[];
  totalCount: number;
  skillsDir: string;
}

export interface SkillsInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Install v2 methodology skills (default: true) */
  installV2Skills?: boolean;
  /** Install v3 domain skills (default: true) */
  installV3Skills?: boolean;
  /** Install platform-specific skills like n8n, agentdb, etc. (default: true) */
  installPlatformSkills?: boolean;
  /** Overwrite existing skills (default: false) */
  overwrite?: boolean;
  /** Skills to exclude by name pattern */
  exclude?: string[];
  /** Only install these skills (if specified) */
  include?: string[];
}

// ============================================================================
// Skill Categories
// ============================================================================

/**
 * V3 domain skills (12 skills for v3-specific features)
 */
const V3_DOMAIN_SKILLS = [
  'v3-qe-test-generation',
  'v3-qe-test-execution',
  'v3-qe-coverage-analysis',
  'v3-qe-quality-assessment',
  'v3-qe-defect-intelligence',
  'v3-qe-requirements-validation',
  'v3-qe-code-intelligence',
  'v3-qe-security-compliance',
  'v3-qe-contract-testing',
  'v3-qe-visual-accessibility',
  'v3-qe-chaos-resilience',
  'v3-qe-learning-optimization',
];

/**
 * Platform-specific skills (agentdb, n8n, github, flow-nexus, etc.)
 */
const PLATFORM_SKILLS = [
  'agentdb-advanced',
  'agentdb-learning',
  'agentdb-memory-patterns',
  'agentdb-optimization',
  'agentdb-vector-search',
  'n8n-expression-testing',
  'n8n-integration-testing-patterns',
  'n8n-security-testing',
  'n8n-trigger-testing-strategies',
  'n8n-workflow-testing-fundamentals',
  'github-code-review',
  'github-multi-repo',
  'github-project-management',
  'github-release-management',
  'github-workflow-automation',
  'flow-nexus-neural',
  'flow-nexus-platform',
  'flow-nexus-swarm',
  'reasoningbank-agentdb',
  'reasoningbank-intelligence',
];

/**
 * Integration/orchestration skills
 */
const INTEGRATION_SKILLS = [
  'swarm-orchestration',
  'swarm-advanced',
  'sparc-methodology',
  'hooks-automation',
  'hive-mind-advanced',
  'stream-chain',
  'agentic-jujutsu',
  'pair-programming',
];

/**
 * Internal development skills (should NOT be installed for users)
 */
const INTERNAL_SKILLS = [
  'v3-core-implementation',
  'v3-cli-modernization',
  'v3-ddd-architecture',
  'v3-integration-deep',
  'v3-mcp-optimization',
  'v3-memory-unification',
  'v3-performance-optimization',
  'v3-security-overhaul',
  'v3-swarm-coordination',
  'v3-qe-core-implementation',
  'v3-qe-ddd-architecture',
  'v3-qe-cli',
  'v3-qe-memory-system',
  'v3-qe-performance',
  'v3-qe-security',
  'v3-qe-mcp',
  'v3-qe-mcp-optimization',
  'v3-qe-memory-unification',
  'v3-qe-integration',
  'v3-qe-agentic-flow-integration',
  'v3-qe-fleet-coordination',
];

// ============================================================================
// Skills Installer Class
// ============================================================================

export class SkillsInstaller {
  private projectRoot: string;
  private options: SkillsInstallerOptions;
  private sourceSkillsDir: string;

  constructor(options: SkillsInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.options = {
      installV2Skills: true,
      installV3Skills: true,
      installPlatformSkills: true,
      overwrite: false,
      exclude: [],
      include: undefined,
      ...options,
    };

    // Find the bundled skills directory
    // In v3, skills are in the parent repo's .claude/skills/
    this.sourceSkillsDir = this.findSourceSkillsDir();
  }

  /**
   * Find the source skills directory
   * Looks in multiple locations to support different installation scenarios
   */
  private findSourceSkillsDir(): string {
    // Try relative to this module (development)
    const moduleDir = dirname(fileURLToPath(import.meta.url));

    // Possible locations for skills
    const possiblePaths = [
      // Development: relative to v3/src/init/ (3 levels up to agentic-qe root)
      join(moduleDir, '../../../.claude/skills'),
      // Development: relative to v3/dist/init/ (3 levels up to agentic-qe root)
      join(moduleDir, '../../../.claude/skills'),
      // Installed: in node_modules
      join(this.projectRoot, 'node_modules/@agentic-qe/v3/skills'),
      // Fallback: bundled skills in v3 package
      join(moduleDir, '../../skills'),
    ];

    for (const skillsPath of possiblePaths) {
      if (existsSync(skillsPath)) {
        return skillsPath;
      }
    }

    // If no skills found, return the first path (will fail gracefully)
    return possiblePaths[0];
  }

  /**
   * Install skills to the project
   */
  async install(): Promise<SkillsInstallResult> {
    const result: SkillsInstallResult = {
      installed: [],
      skipped: [],
      errors: [],
      totalCount: 0,
      skillsDir: join(this.projectRoot, '.claude', 'skills'),
    };

    // Check if source skills exist
    if (!existsSync(this.sourceSkillsDir)) {
      result.errors.push(`Source skills directory not found: ${this.sourceSkillsDir}`);
      return result;
    }

    // Create target skills directory
    const targetSkillsDir = join(this.projectRoot, '.claude', 'skills');
    if (!existsSync(targetSkillsDir)) {
      mkdirSync(targetSkillsDir, { recursive: true });
    }

    // Get list of available skills
    const availableSkills = this.getAvailableSkills();
    result.totalCount = availableSkills.length;

    // Filter skills based on options
    const skillsToInstall = this.filterSkills(availableSkills);

    // Install each skill
    for (const skillName of skillsToInstall) {
      try {
        const skillInfo = await this.installSkill(skillName, targetSkillsDir);
        if (skillInfo) {
          result.installed.push(skillInfo);
        } else {
          result.skipped.push(skillName);
        }
      } catch (error) {
        result.errors.push(`Failed to install ${skillName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Create skills index file
    await this.createSkillsIndex(targetSkillsDir, result.installed);

    return result;
  }

  /**
   * Get list of available skills from source directory
   */
  private getAvailableSkills(): string[] {
    try {
      const entries = readdirSync(this.sourceSkillsDir);
      return entries.filter(entry => {
        const fullPath = join(this.sourceSkillsDir, entry);
        // Must be a directory and not a hidden directory
        return statSync(fullPath).isDirectory() && !entry.startsWith('.');
      });
    } catch {
      return [];
    }
  }

  /**
   * Filter skills based on installation options
   */
  private filterSkills(availableSkills: string[]): string[] {
    let filtered = availableSkills;

    // Always exclude internal development skills
    filtered = filtered.filter(s => !INTERNAL_SKILLS.includes(s));

    // Apply include filter if specified
    if (this.options.include && this.options.include.length > 0) {
      filtered = filtered.filter(s => this.options.include!.includes(s));
    }

    // Apply exclude filter
    if (this.options.exclude && this.options.exclude.length > 0) {
      filtered = filtered.filter(s => !this.options.exclude!.some(pattern =>
        s.includes(pattern) || s.match(new RegExp(pattern))
      ));
    }

    // Filter by skill type
    if (!this.options.installV3Skills) {
      filtered = filtered.filter(s => !V3_DOMAIN_SKILLS.includes(s));
    }

    if (!this.options.installPlatformSkills) {
      filtered = filtered.filter(s => !PLATFORM_SKILLS.includes(s));
    }

    if (!this.options.installV2Skills) {
      // V2 skills are everything that's not v3, platform, integration, or internal
      filtered = filtered.filter(s =>
        V3_DOMAIN_SKILLS.includes(s) ||
        PLATFORM_SKILLS.includes(s) ||
        INTEGRATION_SKILLS.includes(s)
      );
    }

    return filtered;
  }

  /**
   * Install a single skill
   */
  private async installSkill(skillName: string, targetDir: string): Promise<SkillInfo | null> {
    const sourceDir = join(this.sourceSkillsDir, skillName);
    const targetSkillDir = join(targetDir, skillName);

    // Check if skill already exists and overwrite is disabled
    if (existsSync(targetSkillDir) && !this.options.overwrite) {
      return null; // Skip, will be added to skipped list
    }

    // Create skill directory
    if (!existsSync(targetSkillDir)) {
      mkdirSync(targetSkillDir, { recursive: true });
    }

    // Copy all files recursively
    this.copyDirectoryRecursive(sourceDir, targetSkillDir);

    // Determine skill type
    const skillType = this.getSkillType(skillName);

    // Get description from SKILL.md if available
    const description = this.getSkillDescription(targetSkillDir);

    // Check if skill has resources
    const hasResources = existsSync(join(targetSkillDir, 'resources'));

    return {
      name: skillName,
      type: skillType,
      description,
      hasResources,
    };
  }

  /**
   * Recursively copy a directory
   */
  private copyDirectoryRecursive(source: string, target: string): void {
    const entries = readdirSync(source);

    for (const entry of entries) {
      const sourcePath = join(source, entry);
      const targetPath = join(target, entry);
      const stat = statSync(sourcePath);

      if (stat.isDirectory()) {
        if (!existsSync(targetPath)) {
          mkdirSync(targetPath, { recursive: true });
        }
        this.copyDirectoryRecursive(sourcePath, targetPath);
      } else {
        copyFileSync(sourcePath, targetPath);
      }
    }
  }

  /**
   * Get the type of a skill based on its name
   */
  private getSkillType(skillName: string): 'v2-methodology' | 'v3-domain' | 'platform' | 'integration' {
    if (V3_DOMAIN_SKILLS.includes(skillName)) return 'v3-domain';
    if (PLATFORM_SKILLS.includes(skillName)) return 'platform';
    if (INTEGRATION_SKILLS.includes(skillName)) return 'integration';
    return 'v2-methodology';
  }

  /**
   * Extract description from SKILL.md file
   */
  private getSkillDescription(skillDir: string): string | undefined {
    const skillMdPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) return undefined;

    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      // Look for description in frontmatter or first paragraph
      const descMatch = content.match(/description:\s*["']?([^"'\n]+)["']?/i);
      if (descMatch) return descMatch[1].trim();

      // Try to get first non-header paragraph
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-') && !trimmed.startsWith('```')) {
          return trimmed.slice(0, 100) + (trimmed.length > 100 ? '...' : '');
        }
      }
    } catch {
      // Ignore read errors
    }

    return undefined;
  }

  /**
   * Create a skills index file for easy reference
   */
  private async createSkillsIndex(skillsDir: string, installed: SkillInfo[]): Promise<void> {
    const v2Skills = installed.filter(s => s.type === 'v2-methodology');
    const v3Skills = installed.filter(s => s.type === 'v3-domain');
    const platformSkills = installed.filter(s => s.type === 'platform');
    const integrationSkills = installed.filter(s => s.type === 'integration');

    const indexContent = `# AQE Skills Index

This directory contains skills installed by \`aqe-v3 init\`.

## Summary

- **Total Skills**: ${installed.length}
- **V2 Methodology Skills**: ${v2Skills.length}
- **V3 Domain Skills**: ${v3Skills.length}
- **Platform Skills**: ${platformSkills.length}
- **Integration Skills**: ${integrationSkills.length}

## V2 Methodology Skills (${v2Skills.length})

Version-agnostic quality engineering best practices.

${v2Skills.map(s => `- **${s.name}**${s.description ? `: ${s.description}` : ''}`).join('\n')}

## V3 Domain Skills (${v3Skills.length})

V3-specific implementation guides for the 12 bounded contexts.

${v3Skills.map(s => `- **${s.name}**${s.description ? `: ${s.description}` : ''}`).join('\n')}

## Platform Skills (${platformSkills.length})

Platform-specific testing patterns (AgentDB, n8n, GitHub, etc.).

${platformSkills.map(s => `- **${s.name}**${s.description ? `: ${s.description}` : ''}`).join('\n')}

## Integration Skills (${integrationSkills.length})

Swarm orchestration and integration patterns.

${integrationSkills.map(s => `- **${s.name}**${s.description ? `: ${s.description}` : ''}`).join('\n')}

---

*Generated by AQE v3 init on ${new Date().toISOString()}*
`;

    writeFileSync(join(skillsDir, 'README.md'), indexContent, 'utf-8');
  }
}

/**
 * Factory function to create a skills installer
 */
export function createSkillsInstaller(options: SkillsInstallerOptions): SkillsInstaller {
  return new SkillsInstaller(options);
}

/**
 * Quick function to install all skills with defaults
 */
export async function installSkills(projectRoot: string): Promise<SkillsInstallResult> {
  const installer = createSkillsInstaller({ projectRoot });
  return await installer.install();
}
