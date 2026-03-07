/**
 * Trigger Optimizer
 * ADR-056: Analyzes skill descriptions and tags to detect false positive/negative
 * activation risks. Evaluates trigger precision and generates actionable suggestions.
 *
 * @module validation/trigger-optimizer
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('trigger-optimizer');

// ============================================================================
// Types
// ============================================================================

export interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
  category: string;
}

export interface TriggerAnalysisConfig {
  skillsDir: string;
  samplePromptsPerSkill: number;
  similarityThreshold: number;
}

export interface TriggerAnalysisResult {
  skillName: string;
  description: string;
  tags: string[];
  falsePositiveRisk: number;
  falseNegativeRisk: number;
  overallTriggerScore: number;
  suggestions: TriggerSuggestion[];
  confusableSkills: string[];
}

export interface TriggerSuggestion {
  type: 'add_keyword' | 'remove_keyword' | 'refine_description' | 'add_negative_pattern';
  target: 'description' | 'tags';
  current?: string;
  suggested: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
}

export interface TriggerOptimizationReport {
  timestamp: Date;
  skillsAnalyzed: number;
  avgTriggerScore: number;
  skillsNeedingAttention: TriggerAnalysisResult[];
  topSuggestions: TriggerSuggestion[];
  confusionMatrix: Record<string, string[]>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: TriggerAnalysisConfig = {
  skillsDir: '.claude/skills',
  samplePromptsPerSkill: 10,
  similarityThreshold: 0.6,
};

const ACTION_VERBS = new Set([
  'test', 'validate', 'check', 'scan', 'analyze', 'generate', 'create',
  'debug', 'review', 'audit', 'monitor', 'deploy', 'configure', 'optimize',
  'measure', 'assess', 'evaluate', 'inspect', 'verify', 'report', 'fix',
  'refactor', 'migrate', 'build', 'run', 'execute', 'implement',
]);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'because', 'if', 'when', 'while', 'this', 'that', 'these',
  'those', 'it', 'its', 'use', 'using',
]);

const GENERIC_TAGS = new Set([
  'testing', 'test', 'quality', 'code', 'development', 'software',
  'tool', 'tools', 'automation', 'general', 'utility', 'helper',
  'common', 'basic', 'standard', 'default', 'main', 'core',
  'app', 'application', 'system', 'service', 'module',
]);

const MIN_TAGS_FOR_GOOD_COVERAGE = 3;
const MIN_DESCRIPTION_WORDS = 8;
const WHEN_TO_USE_PATTERNS = [
  'use when', 'use for', 'when you need', 'ideal for', 'best for', 'designed for',
];

// ============================================================================
// Helpers
// ============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function parseSkillFrontmatter(skillMdContent: string): SkillMetadata | null {
  if (!skillMdContent.startsWith('---')) return null;
  const endIdx = skillMdContent.indexOf('\n---', 4);
  if (endIdx === -1) return null;
  const fmContent = skillMdContent.slice(4, endIdx).trim();
  if (!fmContent) return null;

  try {
    const parsed = yaml.parse(fmContent);
    if (!parsed || typeof parsed !== 'object' || !parsed.name) return null;

    return {
      name: String(parsed.name),
      description: String(parsed.description || ''),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      category: String(parsed.category || 'uncategorized'),
    };
  } catch (e) {
    logger.debug('Failed to parse skill frontmatter', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

// ============================================================================
// TriggerOptimizer
// ============================================================================

export class TriggerOptimizer {
  private readonly config: TriggerAnalysisConfig;

  constructor(config: Partial<TriggerAnalysisConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyzeSkill(skillName: string, allSkills: SkillMetadata[]): TriggerAnalysisResult {
    const skill = allSkills.find(s => s.name === skillName);
    if (!skill) {
      return {
        skillName, description: '', tags: [],
        falsePositiveRisk: 1, falseNegativeRisk: 1, overallTriggerScore: 0,
        suggestions: [], confusableSkills: [],
      };
    }

    const otherSkills = allSkills.filter(s => s.name !== skillName);
    const falsePositiveRisk = this.detectFalsePositiveRisk(skill, otherSkills);
    const falseNegativeRisk = this.detectFalseNegativeRisk(skill);
    const confusable = this.findConfusableSkills(skill, otherSkills);
    const suggestions = this.generateSuggestions(
      skill, falsePositiveRisk, falseNegativeRisk, confusable
    );
    const overallTriggerScore = Math.max(0, Math.min(1,
      1 - (falsePositiveRisk * 0.5 + falseNegativeRisk * 0.5)
    ));

    return {
      skillName: skill.name, description: skill.description, tags: skill.tags,
      falsePositiveRisk, falseNegativeRisk, overallTriggerScore,
      suggestions, confusableSkills: confusable,
    };
  }

  async analyzeAll(skillsDir?: string): Promise<TriggerOptimizationReport> {
    const dir = skillsDir || this.config.skillsDir;
    const allSkills = this.loadSkillsFromDir(dir);

    logger.info('Analyzing trigger quality', { count: allSkills.length, dir });

    const results: TriggerAnalysisResult[] = allSkills.map(skill =>
      this.analyzeSkill(skill.name, allSkills)
    );

    const avgTriggerScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.overallTriggerScore, 0) / results.length
      : 0;

    const skillsNeedingAttention = results
      .filter(r => r.overallTriggerScore < 0.7)
      .sort((a, b) => a.overallTriggerScore - b.overallTriggerScore);

    const topSuggestions = results
      .flatMap(r => r.suggestions)
      .filter(s => s.impact === 'high')
      .slice(0, 20);

    const confusionMatrix: Record<string, string[]> = {};
    for (const result of results) {
      if (result.confusableSkills.length > 0) {
        confusionMatrix[result.skillName] = result.confusableSkills;
      }
    }

    const report: TriggerOptimizationReport = {
      timestamp: new Date(),
      skillsAnalyzed: allSkills.length,
      avgTriggerScore,
      skillsNeedingAttention,
      topSuggestions,
      confusionMatrix,
    };

    logger.info('Trigger analysis complete', {
      analyzed: report.skillsAnalyzed,
      avgScore: report.avgTriggerScore.toFixed(3),
      needsAttention: report.skillsNeedingAttention.length,
    });

    return report;
  }

  calculateSimilarity(text1: string, text2: string): number {
    const tokens1 = uniqueTokens(text1);
    const tokens2 = uniqueTokens(text2);

    if (tokens1.size === 0 && tokens2.size === 0) return 1;
    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    let intersection = 0;
    for (const token of tokens1) {
      if (tokens2.has(token)) intersection++;
    }

    const union = new Set([...tokens1, ...tokens2]).size;
    return union === 0 ? 0 : intersection / union;
  }

  detectFalsePositiveRisk(skill: SkillMetadata, otherSkills: SkillMetadata[]): number {
    if (otherSkills.length === 0) return 0;

    const skillText = this.buildSkillText(skill);
    let maxCrossCategorySimilarity = 0;
    let totalCrossCategorySimilarity = 0;
    let crossCategoryCount = 0;

    for (const other of otherSkills) {
      const otherText = this.buildSkillText(other);
      const similarity = this.calculateSimilarity(skillText, otherText);

      if (other.category !== skill.category) {
        if (similarity > maxCrossCategorySimilarity) {
          maxCrossCategorySimilarity = similarity;
        }
        totalCrossCategorySimilarity += similarity;
        crossCategoryCount++;
      }
    }

    const avgCrossCategorySimilarity = crossCategoryCount > 0
      ? totalCrossCategorySimilarity / crossCategoryCount
      : 0;

    const risk = maxCrossCategorySimilarity * 0.6 + avgCrossCategorySimilarity * 0.4;
    const genericTagPenalty = this.calculateGenericTagPenalty(skill.tags);

    return Math.min(1, risk + genericTagPenalty * 0.2);
  }

  detectFalseNegativeRisk(skill: SkillMetadata): number {
    let risk = 0;
    const descWords = tokenize(skill.description);

    if (skill.tags.length === 0) risk += 0.35;
    else if (skill.tags.length < MIN_TAGS_FOR_GOOD_COVERAGE) risk += 0.15;

    if (descWords.length === 0) risk += 0.35;
    else if (descWords.length < MIN_DESCRIPTION_WORDS) risk += 0.15;

    const hasActionVerb = descWords.some(w => ACTION_VERBS.has(w));
    if (!hasActionVerb) risk += 0.1;

    const descLower = skill.description.toLowerCase();
    const hasWhenToUse = WHEN_TO_USE_PATTERNS.some(p => descLower.includes(p));
    if (!hasWhenToUse) risk += 0.1;

    if (!skill.category || skill.category === 'uncategorized') risk += 0.1;

    return Math.min(1, risk);
  }

  generateSuggestions(
    skill: SkillMetadata,
    falsePositiveRisk: number,
    falseNegativeRisk: number,
    confusable: string[]
  ): TriggerSuggestion[] {
    const suggestions: TriggerSuggestion[] = [];
    const descWords = tokenize(skill.description);

    if (skill.tags.length === 0) {
      const suggestedTags = descWords.filter(w => w.length > 2).slice(0, 5);
      if (suggestedTags.length > 0) {
        suggestions.push({
          type: 'add_keyword', target: 'tags',
          suggested: suggestedTags.join(', '),
          reason: 'Skill has no tags. Adding keywords from description improves discoverability.',
          impact: 'high',
        });
      }
    } else if (skill.tags.length < MIN_TAGS_FOR_GOOD_COVERAGE) {
      suggestions.push({
        type: 'add_keyword', target: 'tags',
        suggested: `Add ${MIN_TAGS_FOR_GOOD_COVERAGE - skill.tags.length} more relevant tags`,
        reason: `Only ${skill.tags.length} tag(s) present. More tags reduce false negative risk.`,
        impact: 'medium',
      });
    }

    if (descWords.length < MIN_DESCRIPTION_WORDS) {
      suggestions.push({
        type: 'refine_description', target: 'description',
        current: skill.description,
        suggested: `Expand description to include specific use cases and action verbs (currently ${descWords.length} meaningful words)`,
        reason: 'Description is too brief to reliably trigger on relevant prompts.',
        impact: falseNegativeRisk > 0.5 ? 'high' : 'medium',
      });
    }

    const hasActionVerb = descWords.some(w => ACTION_VERBS.has(w));
    if (!hasActionVerb && descWords.length > 0) {
      suggestions.push({
        type: 'refine_description', target: 'description',
        current: skill.description,
        suggested: `Add action verbs like: ${Array.from(ACTION_VERBS).slice(0, 5).join(', ')}`,
        reason: 'Description lacks action verbs that help match user intent.',
        impact: 'medium',
      });
    }

    const descLower = skill.description.toLowerCase();
    const hasWhenToUse = WHEN_TO_USE_PATTERNS.some(p => descLower.includes(p));
    if (!hasWhenToUse) {
      suggestions.push({
        type: 'refine_description', target: 'description',
        current: skill.description,
        suggested: 'Add a "Use when..." clause to clarify activation context',
        reason: 'Descriptions with explicit usage context trigger more accurately.',
        impact: 'medium',
      });
    }

    if (confusable.length > 0 && falsePositiveRisk > 0.4) {
      suggestions.push({
        type: 'add_negative_pattern', target: 'description',
        suggested: `Differentiate from: ${confusable.join(', ')}. Add distinguishing terms unique to this skill.`,
        reason: `High overlap with ${confusable.length} other skill(s) in different categories.`,
        impact: 'high',
      });
    }

    const genericTags = skill.tags.filter(t => GENERIC_TAGS.has(t.toLowerCase()));
    if (genericTags.length > 0 && falsePositiveRisk > 0.3) {
      suggestions.push({
        type: 'remove_keyword', target: 'tags',
        current: genericTags.join(', '),
        suggested: `Replace generic tags (${genericTags.join(', ')}) with more specific alternatives`,
        reason: 'Overly generic tags cause false positive triggers across unrelated skills.',
        impact: genericTags.length > 2 ? 'high' : 'medium',
      });
    }

    return suggestions;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private loadSkillsFromDir(dir: string): SkillMetadata[] {
    const skills: SkillMetadata[] = [];
    const resolvedDir = path.resolve(dir);

    if (!fs.existsSync(resolvedDir)) {
      logger.warn('Skills directory not found', { dir: resolvedDir });
      return skills;
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(resolvedDir);
    } catch (e) {
      logger.error('Failed to read skills directory',
        e instanceof Error ? e : new Error(String(e)));
      return skills;
    }

    for (const entry of entries) {
      const skillMdPath = path.join(resolvedDir, entry, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const metadata = parseSkillFrontmatter(content);
        if (metadata) skills.push(metadata);
      } catch (e) {
        logger.debug('Failed to read skill file', {
          path: skillMdPath,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logger.debug('Loaded skills', { dir: resolvedDir, count: skills.length });
    return skills;
  }

  private buildSkillText(skill: SkillMetadata): string {
    return [skill.description, ...skill.tags, skill.name].join(' ');
  }

  private findConfusableSkills(skill: SkillMetadata, otherSkills: SkillMetadata[]): string[] {
    const skillText = this.buildSkillText(skill);
    const confusable: string[] = [];

    for (const other of otherSkills) {
      const otherText = this.buildSkillText(other);
      const similarity = this.calculateSimilarity(skillText, otherText);
      if (similarity > this.config.similarityThreshold) {
        confusable.push(other.name);
      }
    }

    return confusable;
  }

  private calculateGenericTagPenalty(tags: string[]): number {
    if (tags.length === 0) return 0;
    const genericCount = tags.filter(t => GENERIC_TAGS.has(t.toLowerCase())).length;
    return genericCount / tags.length;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTriggerOptimizer(
  config?: Partial<TriggerAnalysisConfig>
): TriggerOptimizer {
  return new TriggerOptimizer(config);
}
