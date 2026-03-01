/**
 * Task Classifier Tests - TD-002
 * ADR-026: Intelligent Model Routing
 *
 * Tests for the task classifier which analyzes task complexity
 * and recommends the optimal Claude model.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTask,
  isSimpleTask,
  requiresOpus,
  getRecommendedModel,
  getComplexityScore,
  COMPLEX_DOMAINS,
  MODERATE_DOMAINS,
  COMPLEX_CAPABILITIES,
  COMPLEXITY_THRESHOLDS,
  COMPLEXITY_TO_MODEL,
  type ClassifiableTask,
  type ClassificationResult,
  type TaskComplexity,
  type ClaudeModel,
} from '../../../src/routing/task-classifier.js';

describe('Task Classifier', () => {
  // Helper to create mock tasks
  const createMockTask = (
    description: string,
    overrides: Partial<ClassifiableTask> = {}
  ): ClassifiableTask => ({
    description,
    ...overrides,
  });

  describe('classifyTask', () => {
    describe('Simple Task Classification', () => {
      it('should classify task with no complexity factors as simple', () => {
        const task = createMockTask('Fix typo in README');
        const result = classifyTask(task);

        expect(result.complexity).toBe('simple');
        expect(result.recommendedModel).toBe('haiku');
        expect(result.score).toBeLessThan(COMPLEXITY_THRESHOLDS.moderate);
      });

      it('should classify minimal task as simple', () => {
        const task = createMockTask('Add console.log');
        const result = classifyTask(task);

        expect(result.complexity).toBe('simple');
        expect(result.score).toBe(0);
        expect(result.factors).toHaveLength(0);
      });

      it('should have timestamp in result', () => {
        const before = new Date();
        const task = createMockTask('Simple task');
        const result = classifyTask(task);
        const after = new Date();

        expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });

    describe('File Count Factor', () => {
      it('should add 10 points for 6-10 files (moderate-file-count)', () => {
        const task = createMockTask('Refactor', { fileCount: 7 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'moderate-file-count');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(10);
      });

      it('should add 20 points for 11-20 files (high-file-count)', () => {
        const task = createMockTask('Large refactor', { fileCount: 15 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'high-file-count');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(20);
      });

      it('should add 25 points for >20 files (very-high-file-count)', () => {
        const task = createMockTask('Massive refactor', { fileCount: 25 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'very-high-file-count');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(25);
      });

      it('should not add file count factor for <= 5 files', () => {
        const task = createMockTask('Small change', { fileCount: 3 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name.includes('file-count'));
        expect(factor).toBeUndefined();
      });

      it('should include file count in factor description', () => {
        const task = createMockTask('Task', { fileCount: 12 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'high-file-count');
        expect(factor?.description).toContain('12');
      });
    });

    describe('Domain Complexity Factor', () => {
      it('should add 30 points for security-compliance domain', () => {
        const task = createMockTask('Security scan', { domain: 'security-compliance' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-domain');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(30);
      });

      it('should add 30 points for chaos-resilience domain', () => {
        const task = createMockTask('Chaos test', { domain: 'chaos-resilience' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-domain');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(30);
      });

      it('should add 30 points for defect-intelligence domain', () => {
        const task = createMockTask('Defect prediction', { domain: 'defect-intelligence' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-domain');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(30);
      });

      it('should add 15 points for code-intelligence domain', () => {
        const task = createMockTask('Code analysis', { domain: 'code-intelligence' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'moderate-domain');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(15);
      });

      it('should add 15 points for contract-testing domain', () => {
        const task = createMockTask('Contract test', { domain: 'contract-testing' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'moderate-domain');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(15);
      });

      it('should add 15 points for quality-assessment domain', () => {
        const task = createMockTask('Quality check', { domain: 'quality-assessment' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'moderate-domain');
        expect(factor).toBeDefined();
      });

      it('should add 15 points for learning-optimization domain', () => {
        const task = createMockTask('Learning task', { domain: 'learning-optimization' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'moderate-domain');
        expect(factor).toBeDefined();
      });

      it('should not add domain factor for simple domains', () => {
        const task = createMockTask('Test generation', { domain: 'test-generation' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name.includes('domain'));
        expect(factor).toBeUndefined();
      });

      it('should include domain name in factor description', () => {
        const task = createMockTask('Task', { domain: 'security-compliance' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-domain');
        expect(factor?.description).toContain('security-compliance');
      });
    });

    describe('Cross-Component Factor', () => {
      it('should add 25 points for cross-component tasks', () => {
        const task = createMockTask('Cross-service change', { crossComponent: true });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'cross-component');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(25);
      });

      it('should not add cross-component factor when false', () => {
        const task = createMockTask('Single component', { crossComponent: false });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'cross-component');
        expect(factor).toBeUndefined();
      });

      it('should not add cross-component factor when undefined', () => {
        const task = createMockTask('Task without cross-component');
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'cross-component');
        expect(factor).toBeUndefined();
      });
    });

    describe('Priority Factor', () => {
      it('should add 25 points for critical priority', () => {
        const task = createMockTask('Critical fix', { priority: 'critical' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'critical-priority');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(25);
      });

      it('should add 15 points for high priority', () => {
        const task = createMockTask('High priority fix', { priority: 'high' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'high-priority');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(15);
      });

      it('should not add priority factor for normal priority', () => {
        const task = createMockTask('Normal task', { priority: 'normal' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name.includes('priority'));
        expect(factor).toBeUndefined();
      });

      it('should not add priority factor for low priority', () => {
        const task = createMockTask('Low priority task', { priority: 'low' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name.includes('priority'));
        expect(factor).toBeUndefined();
      });
    });

    describe('Complex Capabilities Factor', () => {
      it('should add 10 points for one complex capability', () => {
        const task = createMockTask('SAST scan', { requiredCapabilities: ['sast'] });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-capabilities');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(10);
      });

      it('should add 20 points for two complex capabilities', () => {
        const task = createMockTask('Security scan', {
          requiredCapabilities: ['sast', 'dast'],
        });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-capabilities');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(20);
      });

      it('should cap at 20 points for many complex capabilities', () => {
        const task = createMockTask('Full security audit', {
          requiredCapabilities: ['sast', 'dast', 'vulnerability', 'owasp', 'chaos-testing'],
        });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-capabilities');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(20); // Capped at 20
      });

      it('should not add capability factor for simple capabilities', () => {
        const task = createMockTask('Unit test', {
          requiredCapabilities: ['test-generation', 'unit-test'],
        });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-capabilities');
        expect(factor).toBeUndefined();
      });

      it('should count only complex capabilities in the weight', () => {
        const task = createMockTask('Mixed capabilities', {
          requiredCapabilities: ['sast', 'unit-test', 'vulnerability'],
        });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-capabilities');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(20); // 2 complex caps * 10 = 20
      });

      it('should include capability count in factor description', () => {
        const task = createMockTask('Scan', {
          requiredCapabilities: ['sast', 'dast'],
        });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'complex-capabilities');
        expect(factor?.description).toContain('2');
      });
    });

    describe('External APIs Factor', () => {
      it('should add 10 points for tasks requiring external APIs', () => {
        const task = createMockTask('API integration', { requiresExternalApis: true });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'external-apis');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(10);
      });

      it('should not add external APIs factor when false', () => {
        const task = createMockTask('Internal task', { requiresExternalApis: false });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'external-apis');
        expect(factor).toBeUndefined();
      });
    });

    describe('Database Operations Factor', () => {
      it('should add 10 points for tasks involving database ops', () => {
        const task = createMockTask('Database migration', { involvesDatabaseOps: true });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'database-ops');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(10);
      });

      it('should not add database factor when false', () => {
        const task = createMockTask('Non-DB task', { involvesDatabaseOps: false });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'database-ops');
        expect(factor).toBeUndefined();
      });
    });

    describe('Time Sensitivity Factor', () => {
      it('should add 5 points for time-sensitive tasks', () => {
        const task = createMockTask('Urgent fix', { timeSensitive: true });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'time-sensitive');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(5);
      });

      it('should not add time-sensitive factor when false', () => {
        const task = createMockTask('Routine task', { timeSensitive: false });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'time-sensitive');
        expect(factor).toBeUndefined();
      });
    });

    describe('Estimated Lines Affected Factor', () => {
      it('should add 15 points for >500 lines affected', () => {
        const task = createMockTask('Large change', { estimatedLinesAffected: 600 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'large-change');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(15);
      });

      it('should add 10 points for 201-500 lines affected', () => {
        const task = createMockTask('Medium change', { estimatedLinesAffected: 300 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'medium-change');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(10);
      });

      it('should not add lines factor for <= 200 lines', () => {
        const task = createMockTask('Small change', { estimatedLinesAffected: 100 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name.includes('change'));
        expect(factor).toBeUndefined();
      });

      it('should include line count in factor description', () => {
        const task = createMockTask('Change', { estimatedLinesAffected: 750 });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'large-change');
        expect(factor?.description).toContain('750');
      });
    });

    describe('Security Task Type Factor', () => {
      it('should add 20 points for security-scan type', () => {
        const task = createMockTask('Security scan', { type: 'security-scan' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'security-task');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(20);
      });

      it('should add 20 points for vulnerability-assessment type', () => {
        const task = createMockTask('Vulnerability check', { type: 'vulnerability-assessment' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'security-task');
        expect(factor).toBeDefined();
        expect(factor?.weight).toBe(20);
      });

      it('should not add security factor for other task types', () => {
        const task = createMockTask('Unit test', { type: 'unit-test' });
        const result = classifyTask(task);

        const factor = result.factors.find(f => f.name === 'security-task');
        expect(factor).toBeUndefined();
      });
    });

    describe('Complexity Level Determination', () => {
      it('should classify as simple when score < 20', () => {
        const task = createMockTask('Simple task', { fileCount: 2 });
        const result = classifyTask(task);

        expect(result.complexity).toBe('simple');
        expect(result.score).toBeLessThan(COMPLEXITY_THRESHOLDS.moderate);
      });

      it('should classify as moderate when score >= 20 and < 45', () => {
        const task = createMockTask('Moderate task', { crossComponent: true });
        const result = classifyTask(task);

        // crossComponent adds 25, which is >= 20 and < 45
        expect(result.complexity).toBe('moderate');
      });

      it('should classify as complex when score >= 45 and < 70', () => {
        const task = createMockTask('Complex task', {
          crossComponent: true,  // 25
          fileCount: 12,         // 20
        });
        const result = classifyTask(task);

        // Total: 45, which is >= 45 and < 70
        expect(result.complexity).toBe('complex');
      });

      it('should classify as critical when score >= 70', () => {
        const task = createMockTask('Critical task', {
          domain: 'security-compliance', // 30
          crossComponent: true,           // 25
          priority: 'high',               // 15
        });
        const result = classifyTask(task);

        // Total: 70, which is >= 70
        expect(result.complexity).toBe('critical');
      });
    });

    describe('Model Recommendation', () => {
      it('should recommend haiku for simple tasks', () => {
        const task = createMockTask('Simple task');
        const result = classifyTask(task);

        expect(result.recommendedModel).toBe('haiku');
      });

      it('should recommend sonnet for moderate tasks', () => {
        const task = createMockTask('Moderate task', { crossComponent: true });
        const result = classifyTask(task);

        expect(result.recommendedModel).toBe('sonnet');
      });

      it('should recommend sonnet for complex tasks', () => {
        const task = createMockTask('Complex task', {
          crossComponent: true,
          fileCount: 12,
        });
        const result = classifyTask(task);

        expect(result.recommendedModel).toBe('sonnet');
      });

      it('should recommend opus for critical tasks', () => {
        const task = createMockTask('Critical task', {
          domain: 'security-compliance',
          crossComponent: true,
          priority: 'critical',
        });
        const result = classifyTask(task);

        expect(result.recommendedModel).toBe('opus');
      });
    });

    describe('Cumulative Scoring', () => {
      it('should accumulate multiple factors', () => {
        const task = createMockTask('Multi-factor task', {
          fileCount: 15,           // 20
          crossComponent: true,    // 25
          priority: 'high',        // 15
        });
        const result = classifyTask(task);

        expect(result.score).toBe(60); // 20 + 25 + 15
        expect(result.factors.length).toBe(3);
      });

      it('should handle maximum complexity scenario', () => {
        const task = createMockTask('Maximum complexity task', {
          fileCount: 50,                              // 25 (very-high)
          domain: 'security-compliance',              // 30
          crossComponent: true,                       // 25
          priority: 'critical',                       // 25
          requiredCapabilities: ['sast', 'dast', 'vulnerability'], // 20 (capped)
          requiresExternalApis: true,                 // 10
          involvesDatabaseOps: true,                  // 10
          timeSensitive: true,                        // 5
          estimatedLinesAffected: 1000,               // 15
          type: 'security-scan',                      // 20
        });
        const result = classifyTask(task);

        // Total should be sum of all factors
        expect(result.score).toBeGreaterThanOrEqual(70); // Critical threshold
        expect(result.complexity).toBe('critical');
        expect(result.recommendedModel).toBe('opus');
      });
    });
  });

  describe('isSimpleTask', () => {
    it('should return true for tasks with score < 20', () => {
      const task = createMockTask('Simple task');
      expect(isSimpleTask(task)).toBe(true);
    });

    it('should return false for tasks with score >= 20', () => {
      const task = createMockTask('Complex task', { crossComponent: true });
      expect(isSimpleTask(task)).toBe(false);
    });
  });

  describe('requiresOpus', () => {
    it('should return true for critical tasks (score >= 70)', () => {
      const task = createMockTask('Critical task', {
        domain: 'security-compliance',
        crossComponent: true,
        priority: 'high',
      });
      expect(requiresOpus(task)).toBe(true);
    });

    it('should return false for non-critical tasks', () => {
      const task = createMockTask('Simple task');
      expect(requiresOpus(task)).toBe(false);
    });

    it('should return false for complex but non-critical tasks', () => {
      const task = createMockTask('Complex task', {
        crossComponent: true,
        fileCount: 12,
      });
      expect(requiresOpus(task)).toBe(false);
    });
  });

  describe('getRecommendedModel', () => {
    it('should return haiku for simple tasks', () => {
      const task = createMockTask('Simple');
      expect(getRecommendedModel(task)).toBe('haiku');
    });

    it('should return sonnet for moderate/complex tasks', () => {
      const task = createMockTask('Moderate', { crossComponent: true });
      expect(getRecommendedModel(task)).toBe('sonnet');
    });

    it('should return opus for critical tasks', () => {
      const task = createMockTask('Critical', {
        domain: 'security-compliance',
        crossComponent: true,
        priority: 'critical',
      });
      expect(getRecommendedModel(task)).toBe('opus');
    });
  });

  describe('getComplexityScore', () => {
    it('should return 0 for minimal tasks', () => {
      const task = createMockTask('Minimal');
      expect(getComplexityScore(task)).toBe(0);
    });

    it('should return correct cumulative score', () => {
      const task = createMockTask('Scored task', {
        crossComponent: true,  // 25
        priority: 'high',      // 15
      });
      expect(getComplexityScore(task)).toBe(40);
    });
  });

  describe('Exported Constants', () => {
    describe('COMPLEX_DOMAINS', () => {
      it('should include security-compliance', () => {
        expect(COMPLEX_DOMAINS).toContain('security-compliance');
      });

      it('should include chaos-resilience', () => {
        expect(COMPLEX_DOMAINS).toContain('chaos-resilience');
      });

      it('should include defect-intelligence', () => {
        expect(COMPLEX_DOMAINS).toContain('defect-intelligence');
      });

      it('should be typed as readonly array', () => {
        // TypeScript enforces readonly at compile time via 'as const'
        // At runtime, we verify it's an array with expected length
        expect(Array.isArray(COMPLEX_DOMAINS)).toBe(true);
        expect(COMPLEX_DOMAINS.length).toBe(3);
      });
    });

    describe('MODERATE_DOMAINS', () => {
      it('should include code-intelligence', () => {
        expect(MODERATE_DOMAINS).toContain('code-intelligence');
      });

      it('should include contract-testing', () => {
        expect(MODERATE_DOMAINS).toContain('contract-testing');
      });

      it('should include quality-assessment', () => {
        expect(MODERATE_DOMAINS).toContain('quality-assessment');
      });

      it('should include learning-optimization', () => {
        expect(MODERATE_DOMAINS).toContain('learning-optimization');
      });

      it('should be typed as readonly array', () => {
        // TypeScript enforces readonly at compile time via 'as const'
        expect(Array.isArray(MODERATE_DOMAINS)).toBe(true);
        expect(MODERATE_DOMAINS.length).toBe(4);
      });
    });

    describe('COMPLEX_CAPABILITIES', () => {
      it('should include sast', () => {
        expect(COMPLEX_CAPABILITIES).toContain('sast');
      });

      it('should include dast', () => {
        expect(COMPLEX_CAPABILITIES).toContain('dast');
      });

      it('should include vulnerability', () => {
        expect(COMPLEX_CAPABILITIES).toContain('vulnerability');
      });

      it('should include owasp', () => {
        expect(COMPLEX_CAPABILITIES).toContain('owasp');
      });

      it('should include chaos-testing', () => {
        expect(COMPLEX_CAPABILITIES).toContain('chaos-testing');
      });

      it('should include resilience', () => {
        expect(COMPLEX_CAPABILITIES).toContain('resilience');
      });

      it('should include fault-injection', () => {
        expect(COMPLEX_CAPABILITIES).toContain('fault-injection');
      });

      it('should include mutation-testing', () => {
        expect(COMPLEX_CAPABILITIES).toContain('mutation-testing');
      });

      it('should be typed as readonly array', () => {
        // TypeScript enforces readonly at compile time via 'as const'
        expect(Array.isArray(COMPLEX_CAPABILITIES)).toBe(true);
        expect(COMPLEX_CAPABILITIES.length).toBe(8);
      });
    });

    describe('COMPLEXITY_THRESHOLDS', () => {
      it('should have critical threshold at 70', () => {
        expect(COMPLEXITY_THRESHOLDS.critical).toBe(70);
      });

      it('should have complex threshold at 45', () => {
        expect(COMPLEXITY_THRESHOLDS.complex).toBe(45);
      });

      it('should have moderate threshold at 20', () => {
        expect(COMPLEXITY_THRESHOLDS.moderate).toBe(20);
      });

      it('should have all expected threshold keys', () => {
        // TypeScript enforces readonly at compile time via 'as const'
        expect(Object.keys(COMPLEXITY_THRESHOLDS)).toEqual(['critical', 'complex', 'moderate']);
      });
    });

    describe('COMPLEXITY_TO_MODEL', () => {
      it('should map critical to opus', () => {
        expect(COMPLEXITY_TO_MODEL.critical).toBe('opus');
      });

      it('should map complex to sonnet', () => {
        expect(COMPLEXITY_TO_MODEL.complex).toBe('sonnet');
      });

      it('should map moderate to sonnet', () => {
        expect(COMPLEXITY_TO_MODEL.moderate).toBe('sonnet');
      });

      it('should map simple to haiku', () => {
        expect(COMPLEXITY_TO_MODEL.simple).toBe('haiku');
      });

      it('should have all expected complexity keys', () => {
        // TypeScript enforces readonly at compile time via 'as const'
        expect(Object.keys(COMPLEXITY_TO_MODEL)).toEqual(['critical', 'complex', 'moderate', 'simple']);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined optional fields gracefully', () => {
      const task: ClassifiableTask = {
        description: 'Minimal task',
      };
      const result = classifyTask(task);

      expect(result.score).toBe(0);
      expect(result.complexity).toBe('simple');
    });

    it('should handle empty description', () => {
      const task = createMockTask('');
      const result = classifyTask(task);

      expect(result).toBeDefined();
      expect(result.complexity).toBe('simple');
    });

    it('should handle empty capabilities array', () => {
      const task = createMockTask('Task', { requiredCapabilities: [] });
      const result = classifyTask(task);

      const factor = result.factors.find(f => f.name === 'complex-capabilities');
      expect(factor).toBeUndefined();
    });

    it('should handle fileCount of 0', () => {
      const task = createMockTask('Task', { fileCount: 0 });
      const result = classifyTask(task);

      const factor = result.factors.find(f => f.name.includes('file-count'));
      expect(factor).toBeUndefined();
    });

    it('should handle negative fileCount (treat as no factor)', () => {
      const task = createMockTask('Task', { fileCount: -1 });
      const result = classifyTask(task);

      const factor = result.factors.find(f => f.name.includes('file-count'));
      expect(factor).toBeUndefined();
    });

    it('should handle estimatedLinesAffected of 0', () => {
      const task = createMockTask('Task', { estimatedLinesAffected: 0 });
      const result = classifyTask(task);

      const factor = result.factors.find(f => f.name.includes('change'));
      expect(factor).toBeUndefined();
    });

    it('should handle unknown domain (no factor added)', () => {
      const task = createMockTask('Task', { domain: 'unknown-domain' as any });
      const result = classifyTask(task);

      const factor = result.factors.find(f => f.name.includes('domain'));
      expect(factor).toBeUndefined();
    });

    it('should handle unknown task type (no security factor)', () => {
      const task = createMockTask('Task', { type: 'unknown-type' });
      const result = classifyTask(task);

      const factor = result.factors.find(f => f.name === 'security-task');
      expect(factor).toBeUndefined();
    });
  });

  describe('Type Safety', () => {
    it('should return ClassificationResult type', () => {
      const task = createMockTask('Task');
      const result: ClassificationResult = classifyTask(task);

      expect(result.complexity).toBeDefined();
      expect(result.recommendedModel).toBeDefined();
      expect(result.factors).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should return TaskComplexity enum values', () => {
      const validComplexities: TaskComplexity[] = ['simple', 'moderate', 'complex', 'critical'];

      const simpleTask = createMockTask('Simple');
      const result = classifyTask(simpleTask);

      expect(validComplexities).toContain(result.complexity);
    });

    it('should return ClaudeModel enum values', () => {
      const validModels: ClaudeModel[] = ['haiku', 'sonnet', 'opus'];

      const task = createMockTask('Task');
      const result = classifyTask(task);

      expect(validModels).toContain(result.recommendedModel);
    });
  });
});
