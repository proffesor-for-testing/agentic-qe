/**
 * Manifest Generator for Dynamic Skill Loading
 * Scans skill directories and generates/updates skills-manifest.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillMetadata, SkillManifest, SkillCategory, SkillPriority } from './types.js';

/**
 * Configuration for manifest generation
 */
export interface ManifestGeneratorConfig {
  /** Path to skills directory */
  skillsDir: string;
  /** Output path for manifest */
  outputPath: string;
  /** Default priority for skills without explicit priority */
  defaultPriority: SkillPriority;
  /** Estimate tokens per line of content */
  tokensPerLine: number;
}

/**
 * Category detection rules based on skill name patterns
 */
const CATEGORY_PATTERNS: Record<string, SkillCategory> = {
  'agentic-quality': 'qe-core',
  'holistic-testing': 'qe-core',
  'tdd-': 'qe-methodology',
  'context-driven': 'qe-methodology',
  'exploratory': 'qe-methodology',
  'api-testing': 'qe-specialized',
  'performance-': 'qe-specialized',
  'security-': 'qe-specialized',
  'accessibility-': 'qe-specialized',
  'mobile-': 'qe-specialized',
  'mutation-': 'qe-advanced',
  'chaos-': 'qe-advanced',
  'contract-': 'qe-advanced',
  'github-': 'integration',
  'flow-nexus': 'integration',
  'hooks-': 'advanced',
  'swarm-': 'advanced',
  'hive-mind': 'advanced',
};

/**
 * Priority detection based on skill characteristics
 */
const PRIORITY_KEYWORDS: Record<SkillPriority, string[]> = {
  critical: ['agentic-quality-engineering', 'holistic-testing-pact'],
  high: ['tdd', 'context-driven', 'api-testing', 'security'],
  medium: ['performance', 'exploratory', 'regression', 'integration'],
  low: ['localization', 'compatibility', 'visual'],
};

/**
 * Manifest Generator for creating and updating skill manifests
 */
export class ManifestGenerator {
  private config: ManifestGeneratorConfig;

  constructor(config: Partial<ManifestGeneratorConfig> = {}) {
    this.config = {
      skillsDir: path.resolve(process.cwd(), '.claude/skills'),
      outputPath: path.resolve(process.cwd(), '.claude/skills/skills-manifest.json'),
      defaultPriority: 'medium',
      tokensPerLine: 4, // Approximate tokens per line
      ...config,
    };
  }

  /**
   * Generate manifest from skill directories
   */
  async generate(): Promise<SkillManifest> {
    const skills = await this.scanSkillDirectories();
    const categoryCounts = this.calculateCategoryCounts(skills);

    const manifest: SkillManifest = {
      version: '1.1.0',
      generatedAt: new Date().toISOString(),
      totalSkills: skills.length,
      categoryCounts,
      skills,
    };

    await this.writeManifest(manifest);
    return manifest;
  }

  /**
   * Update existing manifest with new/changed skills
   */
  async update(): Promise<SkillManifest> {
    let existingManifest: SkillManifest | null = null;

    try {
      const content = await fs.readFile(this.config.outputPath, 'utf-8');
      existingManifest = JSON.parse(content);
    } catch {
      // No existing manifest, generate from scratch
      return this.generate();
    }

    const currentSkills = await this.scanSkillDirectories();
    // TypeScript flow analysis: existingManifest is guaranteed non-null here
    // because catch block returns early via this.generate()
    const existingSkillMap = new Map(existingManifest!.skills.map(s => [s.id, s]));

    // Merge: keep existing metadata where possible, add new skills
    const mergedSkills: SkillMetadata[] = [];

    for (const skill of currentSkills) {
      const existing = existingSkillMap.get(skill.id);
      if (existing) {
        // Update only if file changed (check lastUpdated)
        const fileStats = await this.getFileStats(skill.id);
        if (fileStats && fileStats > new Date(existing.lastUpdated)) {
          mergedSkills.push(skill);
        } else {
          mergedSkills.push(existing);
        }
      } else {
        mergedSkills.push(skill);
      }
    }

    const manifest: SkillManifest = {
      version: '1.1.0',
      generatedAt: new Date().toISOString(),
      totalSkills: mergedSkills.length,
      categoryCounts: this.calculateCategoryCounts(mergedSkills),
      skills: mergedSkills,
    };

    await this.writeManifest(manifest);
    return manifest;
  }

  /**
   * Validate existing manifest against actual skill files
   */
  async validate(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    let manifest: SkillManifest;
    try {
      const content = await fs.readFile(this.config.outputPath, 'utf-8');
      manifest = JSON.parse(content);
    } catch (error) {
      return {
        valid: false,
        errors: [`Cannot read manifest: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
      };
    }

    // Check each skill exists
    for (const skill of manifest.skills) {
      const skillPath = path.join(this.config.skillsDir, skill.path);
      try {
        await fs.access(skillPath);
      } catch {
        errors.push(`Skill file missing: ${skill.id} (${skill.path})`);
      }
    }

    // Check for orphan skills (files without manifest entries)
    const manifestIds = new Set(manifest.skills.map(s => s.id));
    const actualSkills = await this.getSkillDirectories();

    for (const skillId of actualSkills) {
      if (!manifestIds.has(skillId)) {
        warnings.push(`Skill not in manifest: ${skillId}`);
      }
    }

    // Validate category counts
    const actualCounts = this.calculateCategoryCounts(manifest.skills);
    for (const [category, count] of Object.entries(manifest.categoryCounts)) {
      if (actualCounts[category as SkillCategory] !== count) {
        warnings.push(`Category count mismatch for ${category}: manifest=${count}, actual=${actualCounts[category as SkillCategory] || 0}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Scan skill directories and extract metadata
   */
  private async scanSkillDirectories(): Promise<SkillMetadata[]> {
    const skillDirs = await this.getSkillDirectories();
    const skills: SkillMetadata[] = [];

    for (const skillId of skillDirs) {
      try {
        const metadata = await this.extractMetadata(skillId);
        if (metadata) {
          skills.push(metadata);
        }
      } catch (error) {
        console.warn(`Failed to extract metadata for ${skillId}: ${error}`);
      }
    }

    // Sort by priority then name
    return skills.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : a.name.localeCompare(b.name);
    });
  }

  /**
   * Get list of skill directories
   */
  private async getSkillDirectories(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.config.skillsDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Extract metadata from a skill directory
   */
  private async extractMetadata(skillId: string): Promise<SkillMetadata | null> {
    const skillDir = path.join(this.config.skillsDir, skillId);
    const skillFile = path.join(skillDir, 'SKILL.md');

    try {
      const content = await fs.readFile(skillFile, 'utf-8');
      const frontmatter = this.parseFrontmatter(content);
      const stats = await fs.stat(skillFile);

      return {
        id: skillId,
        name: frontmatter.name || this.formatName(skillId),
        category: this.detectCategory(skillId, frontmatter),
        description: frontmatter.description || this.extractDescription(content),
        keywords: this.extractKeywords(frontmatter, content),
        dependencies: frontmatter.dependencies?.split(',').map((d: string) => d.trim()) || [],
        estimatedTokens: this.estimateTokens(content),
        priority: this.detectPriority(skillId, frontmatter),
        path: `${skillId}/SKILL.md`,
        lastUpdated: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse YAML frontmatter from markdown
   */
  private parseFrontmatter(content: string): Record<string, any> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter: Record<string, any> = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Handle arrays in YAML
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
        frontmatter[key] = value.split(',').map(v => v.trim().replace(/['"]/g, ''));
      } else {
        frontmatter[key] = value.replace(/['"]/g, '');
      }
    }

    return frontmatter;
  }

  /**
   * Detect category based on skill ID and frontmatter
   */
  private detectCategory(skillId: string, frontmatter: Record<string, any>): SkillCategory {
    // Prefer explicit category from frontmatter
    if (frontmatter.category && this.isValidCategory(frontmatter.category)) {
      return frontmatter.category as SkillCategory;
    }

    // Pattern matching
    for (const [pattern, category] of Object.entries(CATEGORY_PATTERNS)) {
      if (skillId.includes(pattern)) {
        return category;
      }
    }

    // Default based on skill characteristics
    if (skillId.includes('testing') || skillId.includes('test')) {
      return 'qe-specialized';
    }

    return 'qe-methodology';
  }

  /**
   * Check if category is valid
   */
  private isValidCategory(category: string): boolean {
    const validCategories: SkillCategory[] = [
      'qe-core', 'qe-methodology', 'qe-specialized', 'qe-advanced', 'advanced', 'integration'
    ];
    return validCategories.includes(category as SkillCategory);
  }

  /**
   * Detect priority based on skill ID and frontmatter
   */
  private detectPriority(skillId: string, frontmatter: Record<string, any>): SkillPriority {
    // Prefer explicit priority from frontmatter
    if (frontmatter.priority && ['critical', 'high', 'medium', 'low'].includes(frontmatter.priority)) {
      return frontmatter.priority as SkillPriority;
    }

    // Keyword matching
    for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (skillId.includes(keyword)) {
          return priority as SkillPriority;
        }
      }
    }

    return this.config.defaultPriority;
  }

  /**
   * Extract description from content (first paragraph after frontmatter)
   */
  private extractDescription(content: string): string {
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const lines = withoutFrontmatter.split('\n').filter(l => l.trim() && !l.startsWith('#'));

    if (lines.length > 0) {
      return lines[0].trim().substring(0, 100);
    }

    return 'No description available';
  }

  /**
   * Extract keywords from frontmatter and content
   */
  private extractKeywords(frontmatter: Record<string, any>, content: string): string[] {
    const keywords: Set<string> = new Set();

    // From frontmatter tags
    if (Array.isArray(frontmatter.tags)) {
      frontmatter.tags.forEach((tag: string) => keywords.add(tag.toLowerCase()));
    }

    // From frontmatter keywords
    if (Array.isArray(frontmatter.keywords)) {
      frontmatter.keywords.forEach((kw: string) => keywords.add(kw.toLowerCase()));
    }

    // Extract from headers
    const headers = content.match(/^#+\s+(.+)$/gm) || [];
    headers.forEach(h => {
      const text = h.replace(/^#+\s+/, '').toLowerCase();
      if (text.length <= 30) {
        keywords.add(text);
      }
    });

    return Array.from(keywords).slice(0, 10);
  }

  /**
   * Estimate token count for content
   */
  private estimateTokens(content: string): number {
    const lines = content.split('\n').length;
    return Math.ceil(lines * this.config.tokensPerLine);
  }

  /**
   * Format skill ID as human-readable name
   */
  private formatName(skillId: string): string {
    return skillId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate category counts
   */
  private calculateCategoryCounts(skills: SkillMetadata[]): Record<SkillCategory, number> {
    const counts: Record<SkillCategory, number> = {
      'qe-core': 0,
      'qe-methodology': 0,
      'qe-specialized': 0,
      'qe-advanced': 0,
      'advanced': 0,
      'integration': 0,
    };

    for (const skill of skills) {
      counts[skill.category]++;
    }

    return counts;
  }

  /**
   * Get file modification time
   */
  private async getFileStats(skillId: string): Promise<Date | null> {
    try {
      const skillPath = path.join(this.config.skillsDir, skillId, 'SKILL.md');
      const stats = await fs.stat(skillPath);
      return stats.mtime;
    } catch {
      return null;
    }
  }

  /**
   * Write manifest to file
   */
  private async writeManifest(manifest: SkillManifest): Promise<void> {
    const content = JSON.stringify(manifest, null, 2);
    await fs.writeFile(this.config.outputPath, content, 'utf-8');
  }
}

/**
 * CLI entry point for manifest generation
 */
export async function generateManifest(options: Partial<ManifestGeneratorConfig> = {}): Promise<SkillManifest> {
  const generator = new ManifestGenerator(options);
  return generator.generate();
}

/**
 * CLI entry point for manifest update
 */
export async function updateManifest(options: Partial<ManifestGeneratorConfig> = {}): Promise<SkillManifest> {
  const generator = new ManifestGenerator(options);
  return generator.update();
}

/**
 * CLI entry point for manifest validation
 */
export async function validateManifest(options: Partial<ManifestGeneratorConfig> = {}): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const generator = new ManifestGenerator(options);
  return generator.validate();
}
