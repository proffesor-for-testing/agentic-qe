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
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface SkillInfo {
  name: string;
  type: 'v2-methodology' | 'v3-domain';
  description?: string;
  hasResources: boolean;
}

export interface SkillsInstallResult {
  installed: SkillInfo[];
  skipped: string[];
  errors: string[];
  totalCount: number;
  skillsDir: string;
  validationInstalled: boolean;
}

export interface SkillsInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Install v2 methodology skills (default: true) */
  installV2Skills?: boolean;
  /** Install v3 domain skills (default: true) */
  installV3Skills?: boolean;
  /** Overwrite existing skills (default: false) */
  overwrite?: boolean;
  /** Skills to exclude by name pattern */
  exclude?: string[];
  /** Only install these skills (if specified) */
  include?: string[];
}

// ============================================================================
// Skill Categories (QE Skills Only - Claude Flow skills are managed separately)
// ============================================================================

/**
 * V3 QE domain skills - 13 bounded contexts + migration/iteration utilities
 * These are QE-specific skills for v3's DDD architecture
 */
const V3_DOMAIN_SKILLS = [
  // 12 DDD bounded context skills
  'qe-test-generation',         // AI-powered test synthesis
  'qe-test-execution',          // Parallel execution, retry logic
  'qe-coverage-analysis',       // O(log n) sublinear coverage
  'qe-quality-assessment',      // Quality gates, deployment readiness
  'qe-defect-intelligence',     // ML defect prediction, root cause
  'qe-requirements-validation', // BDD scenarios, acceptance criteria
  'qe-code-intelligence',       // Knowledge graphs, 80% token reduction
  'qe-security-compliance',     // OWASP, CVE detection
  'pentest-validation',         // Graduated exploit validation (Shannon-inspired)
  'qe-contract-testing',        // Pact, schema validation
  'qe-visual-accessibility',    // Visual regression, WCAG
  'qe-chaos-resilience',        // Fault injection, resilience
  'qe-learning-optimization',   // Transfer learning, self-improvement
  // V3 utilities
  'aqe-v2-v3-migration',        // Migration guide from v2 to v3
  'qe-iterative-loop',          // QE iteration patterns
];

/**
 * Internal/excluded skills - NOT installed for end users
 * Includes:
 * - V3 internal development skills
 * - Claude Flow platform skills (managed by claude-flow package)
 */
const EXCLUDED_SKILLS = [
  // V3 internal development skills
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
  // Claude Flow platform skills (not QE skills)
  'agentdb-advanced',
  'agentdb-learning',
  'agentdb-memory-patterns',
  'agentdb-optimization',
  'agentdb-vector-search',
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
  'swarm-orchestration',
  'swarm-advanced',
  'sparc-methodology',
  'hooks-automation',
  'hive-mind-advanced',
  'stream-chain',
  'agentic-jujutsu',
  'iterative-loop',
  'performance-analysis',
  'skill-builder',
  // Claude Flow integration skill (not pure QE)
  'qe-agentic-flow-integration',
  // Internal release workflow skill
  'release',
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
      // Development: relative to src/init/ or dist/init/ (2 levels up to project root)
      join(moduleDir, '../../.claude/skills'),
      // NPM package: assets directory at package root (dist/init -> dist -> package root)
      join(moduleDir, '../../assets/skills'),
      // Local install: in node_modules
      join(this.projectRoot, 'node_modules/agentic-qe/assets/skills'),
      join(this.projectRoot, 'node_modules/@agentic-qe/v3/assets/skills'),
    ];

    // For global npm installs, add common global node_modules paths
    // Note: We use platform-based heuristics instead of npm prefix lookup
    // to avoid dynamic require issues in ESM bundles
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: npm global is typically in AppData
      const appData = process.env.APPDATA || join(homeDir, 'AppData', 'Roaming');
      possiblePaths.push(
        join(appData, 'npm/node_modules/agentic-qe/assets/skills'),
        join(appData, 'npm/node_modules/agentic-qe/.claude/skills'),
      );
    } else {
      // Unix/Linux/macOS: common global prefixes
      const globalPrefixes = [
        '/usr/local',
        '/usr',
        join(homeDir, '.npm-global'),
        join(homeDir, '.nvm/versions/node', process.version),
      ];

      for (const prefix of globalPrefixes) {
        possiblePaths.push(
          join(prefix, 'lib/node_modules/agentic-qe/assets/skills'),
          join(prefix, 'lib/node_modules/agentic-qe/.claude/skills'),
          join(prefix, 'node_modules/agentic-qe/assets/skills'),
          join(prefix, 'node_modules/agentic-qe/.claude/skills'),
        );
      }
    }

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
      validationInstalled: false,
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
        result.errors.push(`Failed to install ${skillName}: ${toErrorMessage(error)}`);
      }
    }

    // Install validation infrastructure (ADR-056)
    result.validationInstalled = this.installValidationInfrastructure(targetSkillsDir);

    // Create skills index file
    await this.createSkillsIndex(targetSkillsDir, result.installed);

    return result;
  }

  /**
   * Install validation infrastructure to the project
   * ADR-056: Deterministic Skill Validation System
   */
  private installValidationInfrastructure(targetSkillsDir: string): boolean {
    const sourceValidationDir = join(this.sourceSkillsDir, '.validation');
    const targetValidationDir = join(targetSkillsDir, '.validation');

    // Check if source validation directory exists
    if (!existsSync(sourceValidationDir)) {
      console.debug('[SkillsInstaller] Validation infrastructure not found in source');
      return false;
    }

    // Check if already exists and overwrite is disabled
    if (existsSync(targetValidationDir) && !this.options.overwrite) {
      console.debug('[SkillsInstaller] Validation infrastructure already exists, skipping');
      return true; // Already installed
    }

    try {
      // Create target directory
      if (!existsSync(targetValidationDir)) {
        mkdirSync(targetValidationDir, { recursive: true });
      }

      // Copy validation infrastructure recursively
      this.copyDirectoryRecursive(sourceValidationDir, targetValidationDir);
      console.debug('[SkillsInstaller] Validation infrastructure installed successfully');
      return true;
    } catch (error) {
      console.error('[SkillsInstaller] Failed to install validation infrastructure:',
        error instanceof Error ? error.message : error);
      return false;
    }
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
   * Only installs QE skills - Claude Flow skills are excluded
   */
  private filterSkills(availableSkills: string[]): string[] {
    let filtered = availableSkills;

    // Always exclude internal and Claude Flow skills
    filtered = filtered.filter(s => !EXCLUDED_SKILLS.includes(s));

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

    if (!this.options.installV2Skills) {
      // V2 skills are everything that's not v3-domain
      filtered = filtered.filter(s => V3_DOMAIN_SKILLS.includes(s));
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
  private getSkillType(skillName: string): 'v2-methodology' | 'v3-domain' {
    if (V3_DOMAIN_SKILLS.includes(skillName)) return 'v3-domain';
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
    } catch (error) {
      // Non-critical: skill description extraction is optional
      console.debug('[SkillsInstaller] Failed to read skill description:', error instanceof Error ? error.message : error);
    }

    return undefined;
  }

  /**
   * Create a skills index file for easy reference
   * Scans the actual directory to reflect ALL skills present (not just newly installed)
   */
  private async createSkillsIndex(skillsDir: string, _installed: SkillInfo[]): Promise<void> {
    // Scan the actual directory for all skills (not just newly installed)
    const allSkills = this.scanSkillsDirectory(skillsDir);
    const qeSkills = allSkills.filter(s => !EXCLUDED_SKILLS.includes(s.name));
    const v2Skills = qeSkills.filter(s => s.type === 'v2-methodology');
    const v3Skills = qeSkills.filter(s => s.type === 'v3-domain');
    const platformSkills = allSkills.filter(s => EXCLUDED_SKILLS.includes(s.name));
    const hasValidation = existsSync(join(skillsDir, '.validation'));

    const indexContent = `# AQE Skills Index

This directory contains Quality Engineering skills managed by Agentic QE.

## Summary

- **Total QE Skills**: ${qeSkills.length}
- **V2 Methodology Skills**: ${v2Skills.length}
- **V3 Domain Skills**: ${v3Skills.length}
- **Platform Skills**: ${platformSkills.length} (Claude Flow managed)
- **Validation Infrastructure**: ${hasValidation ? '✅ Installed' : '❌ Not installed'}

> **Note**: Platform skills (agentdb, github, flow-nexus, etc.) are managed by claude-flow.
> Only QE-specific skills are installed/updated by \`aqe init\`.

## V2 Methodology Skills (${v2Skills.length})

Version-agnostic quality engineering best practices from the QE community.

${v2Skills.length > 0 ? v2Skills.map(s => `- **${s.name}**${s.description ? `: ${s.description}` : ''}`).join('\n') : '*None installed*'}

## V3 Domain Skills (${v3Skills.length})

V3-specific implementation guides for the 12 DDD bounded contexts.

${v3Skills.length > 0 ? v3Skills.map(s => `- **${s.name}**${s.description ? `: ${s.description}` : ''}`).join('\n') : '*None installed*'}

## Platform Skills (${platformSkills.length})

Claude Flow platform skills (managed separately).

${platformSkills.length > 0 ? platformSkills.map(s => `- ${s.name}`).join('\n') : '*None present*'}
${hasValidation ? `
## Validation Infrastructure

The \`.validation/\` directory contains the skill validation infrastructure (ADR-056):

- **schemas/**: JSON Schema definitions for validating skill outputs
- **templates/**: Validator script templates for creating skill validators
- **examples/**: Example skill outputs that validate against schemas
- **test-data/**: Test data for validator self-testing

See \`.validation/README.md\` for usage instructions.
` : ''}
---

*Generated by AQE v3 init on ${new Date().toISOString()}*
`;

    writeFileSync(join(skillsDir, 'README.md'), indexContent, 'utf-8');
  }

  /**
   * Scan the skills directory to get all present skills
   */
  private scanSkillsDirectory(skillsDir: string): SkillInfo[] {
    const skills: SkillInfo[] = [];

    try {
      const entries = readdirSync(skillsDir);
      for (const entry of entries) {
        // Skip hidden directories and files
        if (entry.startsWith('.')) continue;

        const fullPath = join(skillsDir, entry);
        if (!statSync(fullPath).isDirectory()) continue;

        // Check for SKILL.md to confirm it's a valid skill
        const skillMdPath = join(fullPath, 'SKILL.md');
        if (!existsSync(skillMdPath)) continue;

        const skillType = this.getSkillType(entry);
        const description = this.getSkillDescription(fullPath);
        const hasResources = existsSync(join(fullPath, 'resources'));

        skills.push({
          name: entry,
          type: skillType,
          description,
          hasResources,
        });
      }
    } catch (error) {
      console.debug('[SkillsInstaller] Failed to scan skills directory:', error instanceof Error ? error.message : error);
    }

    // Sort alphabetically
    return skills.sort((a, b) => a.name.localeCompare(b.name));
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
