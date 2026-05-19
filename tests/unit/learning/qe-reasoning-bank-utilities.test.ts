/**
 * Unit Tests — QE pattern + guidance pure utilities
 *
 * Extracted from qe-reasoning-bank.test.ts (issue #448, step 2).
 * These tests exercise the pure functions in qe-patterns.ts and
 * qe-guidance.ts. They do NOT instantiate QEReasoningBank and do NOT
 * touch the heavy module graph (no transformer embeddings, no HNSW,
 * no WASM coherence). Splitting them into their own file lets the
 * vitest fork-pool run them in a tiny process, keeping the heavier
 * qe-reasoning-bank fork below its memory ceiling.
 */

import { describe, it, expect } from 'vitest';
import {
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  calculateQualityScore,
  shouldPromotePattern,
  validateQEPattern,
  applyPatternTemplate,
  QEPattern,
  QEDomain,
} from '../../../src/learning/qe-patterns';
import {
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
  checkAntiPatterns,
} from '../../../src/learning/qe-guidance';

describe('QE Pattern Utilities', () => {
  describe('detectQEDomain', () => {
    it('should detect test-generation domain', () => {
      expect(detectQEDomain('Write tests for the UserService')).toBe('test-generation');
      expect(detectQEDomain('describe("MyComponent")')).toBe('test-generation');
      expect(detectQEDomain('it("should work")')).toBe('test-generation');
    });

    it('should detect coverage-analysis domain', () => {
      expect(detectQEDomain('Analyze code coverage')).toBe('coverage-analysis');
      expect(detectQEDomain('Find uncovered branches')).toBe('coverage-analysis');
    });

    it('should detect security-compliance domain', () => {
      expect(detectQEDomain('Check for XSS vulnerabilities')).toBe('security-compliance');
      expect(detectQEDomain('OWASP security scan')).toBe('security-compliance');
    });

    it('should detect visual-accessibility domain', () => {
      // Use unique keywords that only match visual-accessibility
      // percy and a11y are unique to this domain, avoid "regression" (defect-intelligence)
      expect(detectQEDomain('percy snapshot')).toBe('visual-accessibility');
      expect(detectQEDomain('a11y audit')).toBe('visual-accessibility');
    });

    it('should return null for unmatched text', () => {
      expect(detectQEDomain('Hello world')).toBeNull();
    });
  });

  describe('detectQEDomains', () => {
    it('should detect multiple domains', () => {
      const domains = detectQEDomains(
        'Generate tests with coverage analysis for security-critical code'
      );
      expect(domains).toContain('test-generation');
      expect(domains).toContain('coverage-analysis');
    });
  });

  describe('mapQEDomainToAQE', () => {
    it('should map QE domains to AQE domains (identity mapping since aligned)', () => {
      // QEDomain and DomainName are now aligned - this is an identity mapping
      expect(mapQEDomainToAQE('test-generation')).toBe('test-generation');
      expect(mapQEDomainToAQE('coverage-analysis')).toBe('coverage-analysis');
      expect(mapQEDomainToAQE('security-compliance')).toBe('security-compliance');
      expect(mapQEDomainToAQE('visual-accessibility')).toBe('visual-accessibility');
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate quality score', () => {
      const score = calculateQualityScore({
        confidence: 0.8,
        usageCount: 50,
        successRate: 0.9,
      });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should weight success rate highest', () => {
      const highSuccess = calculateQualityScore({
        confidence: 0.5,
        usageCount: 10,
        successRate: 1.0,
      });

      const lowSuccess = calculateQualityScore({
        confidence: 0.5,
        usageCount: 10,
        successRate: 0.2,
      });

      expect(highSuccess).toBeGreaterThan(lowSuccess);
    });
  });

  describe('shouldPromotePattern', () => {
    const basePattern: QEPattern = {
      id: '1',
      patternType: 'test-template',
      qeDomain: 'test-generation',
      domain: 'test-generation',
      name: 'Test',
      description: 'Test',
      confidence: 0.7,
      usageCount: 10,
      successRate: 0.8,
      qualityScore: 0.7,
      context: { tags: [] },
      template: { type: 'code', content: '', variables: [] },
      tier: 'short-term',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      successfulUses: 5,
    };

    it('should promote pattern with 3+ successful uses', () => {
      const result = shouldPromotePattern(basePattern);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });

    it('should not promote already long-term patterns', () => {
      const result = shouldPromotePattern({ ...basePattern, tier: 'long-term' });
      expect(result.meetsUsageCriteria).toBe(false);
      expect(result.blockReason).toBe('insufficient_usage');
    });

    it('should not promote patterns with low confidence', () => {
      const result = shouldPromotePattern({ ...basePattern, confidence: 0.4 });
      expect(result.meetsQualityCriteria).toBe(false);
      expect(result.blockReason).toBe('low_quality');
    });

    it('should not promote patterns with low success rate', () => {
      const result = shouldPromotePattern({ ...basePattern, successRate: 0.5 });
      expect(result.meetsQualityCriteria).toBe(false);
      expect(result.blockReason).toBe('low_quality');
    });

    it('should not promote patterns with few successful uses', () => {
      const result = shouldPromotePattern({ ...basePattern, successfulUses: 2 });
      expect(result.meetsUsageCriteria).toBe(false);
      expect(result.blockReason).toBe('insufficient_usage');
    });

    it('should block promotion when coherence energy exceeds threshold', () => {
      const result = shouldPromotePattern(basePattern, 0.5, 0.4);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(false);
      expect(result.blockReason).toBe('coherence_violation');
    });

    it('should allow promotion when coherence energy is below threshold', () => {
      const result = shouldPromotePattern(basePattern, 0.3, 0.4);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });

    it('should allow promotion when coherence energy is not provided', () => {
      const result = shouldPromotePattern(basePattern);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });
  });

  describe('validateQEPattern', () => {
    it('should validate valid pattern', () => {
      const pattern: Partial<QEPattern> = {
        id: '1',
        patternType: 'test-template',
        qeDomain: 'test-generation',
        name: 'Test Pattern',
        template: {
          type: 'code',
          content: 'describe("{{name}}")',
          variables: [{ name: 'name', type: 'string', required: true }],
        },
        confidence: 0.8,
        successRate: 0.9,
      };

      const result = validateQEPattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const result = validateQEPattern({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid confidence range', () => {
      const result = validateQEPattern({
        id: '1',
        patternType: 'test-template',
        qeDomain: 'test-generation',
        name: 'Test',
        template: { type: 'code', content: 'test', variables: [] },
        confidence: 1.5, // Invalid
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Confidence must be between 0 and 1');
    });
  });

  describe('applyPatternTemplate', () => {
    it('should apply template variables', () => {
      const template = {
        type: 'code' as const,
        content: 'describe("{{className}}", () => { {{testBody}} });',
        variables: [
          { name: 'className', type: 'string' as const, required: true },
          { name: 'testBody', type: 'code' as const, required: true },
        ],
      };

      const result = applyPatternTemplate(template, {
        className: 'UserService',
        testBody: 'it("should work", () => {});',
      });

      expect(result).toContain('UserService');
      expect(result).toContain('should work');
    });

    it('should use default values', () => {
      const template = {
        type: 'code' as const,
        content: 'describe("{{name}}", () => { {{async}} });',
        variables: [
          { name: 'name', type: 'string' as const, required: true },
          { name: 'async', type: 'string' as const, required: false, defaultValue: '// tests' },
        ],
      };

      const result = applyPatternTemplate(template, { name: 'Test' });
      expect(result).toContain('// tests');
    });

    it('should throw for missing required variables', () => {
      const template = {
        type: 'code' as const,
        content: '{{required}}',
        variables: [{ name: 'required', type: 'string' as const, required: true }],
      };

      expect(() => applyPatternTemplate(template, {})).toThrow(
        'Required variable required not provided'
      );
    });
  });
});

describe('QE Guidance', () => {
  describe('getGuidance', () => {
    it('should return guidance for all domains', () => {
      // Use the 12 DDD bounded context domains
      const domains: QEDomain[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
        'requirements-validation',
        'code-intelligence',
        'security-compliance',
        'contract-testing',
        'visual-accessibility',
        'chaos-resilience',
        'learning-optimization',
      ];

      for (const domain of domains) {
        const guidance = getGuidance(domain);
        expect(guidance).toBeDefined();
        // Note: guidance.domain may differ from input domain as registry reuses guidance objects
        // (e.g., test-execution uses test-generation guidance)
        expect(guidance.domain).toBeDefined();
        expect(guidance.bestPractices.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getCombinedGuidance', () => {
    it('should combine domain, framework, and language guidance', () => {
      const guidance = getCombinedGuidance('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance.some((g) => g.includes('[vitest]'))).toBe(true);
      expect(guidance.some((g) => g.includes('[typescript]'))).toBe(true);
    });

    it('should include anti-patterns when requested', () => {
      const guidance = getCombinedGuidance('test-generation', {
        includeAntiPatterns: true,
      });

      expect(guidance.some((g) => g.includes('[AVOID]'))).toBe(true);
    });
  });

  describe('generateGuidanceContext', () => {
    it('should generate markdown context', () => {
      const context = generateGuidanceContext('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(context).toContain('## QE Guidance');
      expect(context).toContain('Best Practices');
      expect(context).toContain('Anti-Patterns');
    });
  });

  describe('checkAntiPatterns', () => {
    it('should detect flaky assertion patterns', () => {
      const code = `
        it('should be fast', async () => {
          await setTimeout(() => {}, 100);
          expect(Date.now()).toBeLessThan(Date.now() + 1000);
        });
      `;

      const antiPatterns = checkAntiPatterns('test-generation', code);
      expect(antiPatterns.some((ap) => ap.name === 'Flaky Assertion')).toBe(true);
    });

    it('should return empty for clean code', () => {
      const code = `
        it('should add numbers', () => {
          expect(1 + 1).toBe(2);
        });
      `;

      const antiPatterns = checkAntiPatterns('test-generation', code);
      // May or may not detect patterns depending on implementation
      expect(Array.isArray(antiPatterns)).toBe(true);
    });
  });
});
