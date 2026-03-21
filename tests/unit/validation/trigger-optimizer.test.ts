/**
 * Trigger Optimizer Tests
 * ADR-056: Unit tests for skill trigger analysis, similarity detection,
 * false positive/negative risk scoring, and suggestion generation.
 */

import { describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
  TriggerOptimizer,
  createTriggerOptimizer,
  parseSkillFrontmatter,
  type SkillMetadata,
  type TriggerAnalysisResult,
} from '../../../src/validation/trigger-optimizer.js';

// ============================================================================
// Helpers
// ============================================================================

function makeSkill(overrides: Partial<SkillMetadata> = {}): SkillMetadata {
  return {
    name: overrides.name ?? 'test-skill',
    description: overrides.description ?? 'Analyze and validate test coverage for code quality. Use when you need to check test completeness.',
    tags: overrides.tags ?? ['coverage', 'validation', 'metrics'],
    category: overrides.category ?? 'testing',
  };
}

function makeFrontmatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`;
    }
    return `${key}: ${value}`;
  });
  return `---\n${lines.join('\n')}\n---\n\n# Skill Content`;
}

// ============================================================================
// Tests
// ============================================================================

describe('TriggerOptimizer', () => {
  let optimizer: TriggerOptimizer;

  beforeEach(() => {
    optimizer = createTriggerOptimizer({ similarityThreshold: 0.6 });
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  // ==========================================================================
  // parseSkillFrontmatter
  // ==========================================================================

  describe('parseSkillFrontmatter', () => {
    it('should parse valid YAML frontmatter from SKILL.md content', () => {
      const content = makeFrontmatter({
        name: 'security-scan',
        description: 'Run security scans on codebase',
        tags: ['security', 'scanning', 'vulnerabilities'],
        category: 'security',
      });

      const result = parseSkillFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('security-scan');
      expect(result!.description).toBe('Run security scans on codebase');
      expect(result!.tags).toEqual(['security', 'scanning', 'vulnerabilities']);
      expect(result!.category).toBe('security');
    });

    it('should return null for content without frontmatter', () => {
      const content = '# Just a Heading\n\nSome body text without any YAML block.';

      const result = parseSkillFrontmatter(content);

      expect(result).toBeNull();
    });

    it('should return null for invalid YAML', () => {
      const content = '---\n: : : invalid yaml {{{\n---\n';

      const result = parseSkillFrontmatter(content);

      expect(result).toBeNull();
    });

    it('should handle missing optional fields gracefully', () => {
      const content = makeFrontmatter({ name: 'minimal-skill' });

      const result = parseSkillFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('minimal-skill');
      expect(result!.description).toBe('');
      expect(result!.tags).toEqual([]);
      expect(result!.category).toBe('uncategorized');
    });
  });

  // ==========================================================================
  // calculateSimilarity
  // ==========================================================================

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      const text = 'validate security vulnerabilities in production code';

      const score = optimizer.calculateSimilarity(text, text);

      expect(score).toBe(1.0);
    });

    it('should return 0 for completely different strings', () => {
      const text1 = 'kubernetes cluster orchestration';
      const text2 = 'watercolor painting techniques';

      const score = optimizer.calculateSimilarity(text1, text2);

      expect(score).toBe(0);
    });

    it('should return value between 0 and 1 for partial overlap', () => {
      const text1 = 'validate security vulnerabilities';
      const text2 = 'validate performance benchmarks';

      const score = optimizer.calculateSimilarity(text1, text2);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should be case-insensitive', () => {
      const text1 = 'Validate Security Checks';
      const text2 = 'validate security checks';

      const score = optimizer.calculateSimilarity(text1, text2);

      expect(score).toBe(1.0);
    });

    it('should filter stop words', () => {
      // "the" and "a" are stop words; meaningful tokens are the same
      const text1 = 'validate the security checks';
      const text2 = 'validate a security checks';

      const score = optimizer.calculateSimilarity(text1, text2);

      expect(score).toBe(1.0);
    });
  });

  // ==========================================================================
  // detectFalsePositiveRisk
  // ==========================================================================

  describe('detectFalsePositiveRisk', () => {
    it('should return low risk for skill with unique description and tags', () => {
      const skill = makeSkill({
        name: 'kubernetes-deploy',
        description: 'Deploy containerized microservices to Kubernetes clusters',
        tags: ['kubernetes', 'containers', 'deployment', 'k8s'],
        category: 'infrastructure',
      });

      const otherSkills = [
        makeSkill({
          name: 'sql-lint',
          description: 'Lint SQL queries for syntax errors and performance issues',
          tags: ['sql', 'linting', 'database'],
          category: 'database',
        }),
      ];

      const risk = optimizer.detectFalsePositiveRisk(skill, otherSkills);

      expect(risk).toBeLessThan(0.4);
    });

    it('should return high risk for skill with high overlap with different-category skills', () => {
      const skill = makeSkill({
        name: 'code-review',
        description: 'Review code quality and validate test coverage',
        tags: ['review', 'quality', 'testing', 'code'],
        category: 'review',
      });

      const otherSkills = [
        makeSkill({
          name: 'test-validator',
          description: 'Validate test coverage and review code quality metrics',
          tags: ['validation', 'quality', 'testing', 'code'],
          category: 'testing',
        }),
      ];

      const risk = optimizer.detectFalsePositiveRisk(skill, otherSkills);

      expect(risk).toBeGreaterThan(0.3);
    });

    it('should return low risk when overlapping skills are in same category', () => {
      const skill = makeSkill({
        name: 'unit-test-gen',
        description: 'Generate unit tests for JavaScript functions',
        tags: ['unit-test', 'generation', 'javascript'],
        category: 'testing',
      });

      const otherSkills = [
        makeSkill({
          name: 'integration-test-gen',
          description: 'Generate integration tests for JavaScript APIs',
          tags: ['integration-test', 'generation', 'javascript'],
          category: 'testing',
        }),
      ];

      // Same category means cross-category similarity is 0
      const risk = optimizer.detectFalsePositiveRisk(skill, otherSkills);

      expect(risk).toBeLessThan(0.3);
    });
  });

  // ==========================================================================
  // detectFalseNegativeRisk
  // ==========================================================================

  describe('detectFalseNegativeRisk', () => {
    it('should return low risk for skill with long description, many tags, and action verbs', () => {
      const skill = makeSkill({
        description: 'Analyze and validate security vulnerabilities in production code. Use when you need comprehensive security assessment.',
        tags: ['security', 'vulnerability', 'scanning', 'analysis'],
        category: 'security',
      });

      const risk = optimizer.detectFalseNegativeRisk(skill);

      expect(risk).toBeLessThan(0.3);
    });

    it('should return high risk for skill with short description and few tags', () => {
      const skill = makeSkill({
        description: 'Quick helper',
        tags: [],
        category: 'uncategorized',
      });

      const risk = optimizer.detectFalseNegativeRisk(skill);

      expect(risk).toBeGreaterThan(0.5);
    });

    it('should penalize descriptions missing "use when" patterns', () => {
      const skillWithPattern = makeSkill({
        description: 'Analyze test coverage metrics across modules. Use when you need detailed coverage reports.',
        tags: ['coverage', 'metrics', 'analysis'],
        category: 'testing',
      });

      const skillWithoutPattern = makeSkill({
        description: 'Analyze test coverage metrics across modules for detailed coverage reports.',
        tags: ['coverage', 'metrics', 'analysis'],
        category: 'testing',
      });

      const riskWith = optimizer.detectFalseNegativeRisk(skillWithPattern);
      const riskWithout = optimizer.detectFalseNegativeRisk(skillWithoutPattern);

      expect(riskWithout).toBeGreaterThan(riskWith);
    });
  });

  // ==========================================================================
  // analyzeSkill
  // ==========================================================================

  describe('analyzeSkill', () => {
    it('should produce a complete TriggerAnalysisResult with all fields', () => {
      const allSkills = [
        makeSkill({ name: 'skill-a', category: 'cat-a' }),
        makeSkill({ name: 'skill-b', category: 'cat-b', description: 'Completely unrelated blockchain ledger reconciliation' }),
      ];

      const result = optimizer.analyzeSkill('skill-a', allSkills);

      expect(result.skillName).toBe('skill-a');
      expect(result.description).toBeDefined();
      expect(result.tags).toBeDefined();
      expect(typeof result.falsePositiveRisk).toBe('number');
      expect(typeof result.falseNegativeRisk).toBe('number');
      expect(typeof result.overallTriggerScore).toBe('number');
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.confusableSkills)).toBe(true);
    });

    it('should identify confusable skills correctly', () => {
      const allSkills = [
        makeSkill({
          name: 'skill-x',
          description: 'Validate security audit results and review compliance reports',
          tags: ['security', 'audit', 'compliance', 'review', 'validate'],
          category: 'security',
        }),
        makeSkill({
          name: 'skill-y',
          description: 'Validate security audit results and review compliance reports thoroughly',
          tags: ['security', 'audit', 'compliance', 'review', 'validate'],
          category: 'compliance',
        }),
      ];

      const result = optimizer.analyzeSkill('skill-x', allSkills);

      expect(result.confusableSkills).toContain('skill-y');
    });

    it('should set overallTriggerScore between 0 and 1', () => {
      const allSkills = [makeSkill({ name: 'lonely-skill' })];

      const result = optimizer.analyzeSkill('lonely-skill', allSkills);

      expect(result.overallTriggerScore).toBeGreaterThanOrEqual(0);
      expect(result.overallTriggerScore).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // generateSuggestions
  // ==========================================================================

  describe('generateSuggestions', () => {
    it('should suggest adding keywords when FN risk is high', () => {
      const skill = makeSkill({
        description: 'Helper',
        tags: [],
        category: 'uncategorized',
      });

      const suggestions = optimizer.generateSuggestions(skill, 0.1, 0.8, []);

      const addKeywordSuggestion = suggestions.find(s => s.type === 'add_keyword');
      expect(addKeywordSuggestion).toBeDefined();
    });

    it('should suggest refining description when FP risk is high', () => {
      const skill = makeSkill({
        description: 'Validate and review security audit results across the entire system. Use when checking compliance.',
        tags: ['security', 'audit', 'review', 'compliance'],
        category: 'security',
      });

      const suggestions = optimizer.generateSuggestions(
        skill, 0.8, 0.1, ['confusable-skill']
      );

      const hasRefineSuggestion = suggestions.some(
        s => s.type === 'add_negative_pattern' || s.type === 'refine_description'
      );
      expect(hasRefineSuggestion).toBe(true);
    });

    it('should return empty array when both risks are low', () => {
      const skill = makeSkill({
        description: 'Analyze and validate Kubernetes cluster health metrics in production environments. Use when you need infrastructure diagnostics.',
        tags: ['kubernetes', 'health', 'metrics', 'infrastructure'],
        category: 'infrastructure',
      });

      const suggestions = optimizer.generateSuggestions(skill, 0.0, 0.0, []);

      expect(suggestions).toEqual([]);
    });
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createTriggerOptimizer', () => {
    it('should create a TriggerOptimizer instance', () => {
      const instance = createTriggerOptimizer();

      expect(instance).toBeInstanceOf(TriggerOptimizer);
    });

    it('should accept partial configuration', () => {
      const instance = createTriggerOptimizer({
        similarityThreshold: 0.8,
        samplePromptsPerSkill: 20,
      });

      expect(instance).toBeInstanceOf(TriggerOptimizer);
    });
  });
});
