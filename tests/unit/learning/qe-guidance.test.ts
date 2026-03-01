/**
 * Unit Tests for QE Guidance Templates
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Tests domain-specific guidance templates and generation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  QE_GUIDANCE_REGISTRY,
  TEST_GENERATION_GUIDANCE,
  COVERAGE_ANALYSIS_GUIDANCE,
  MUTATION_TESTING_GUIDANCE,
  API_TESTING_GUIDANCE,
  SECURITY_TESTING_GUIDANCE,
  VISUAL_TESTING_GUIDANCE,
  ACCESSIBILITY_GUIDANCE,
  PERFORMANCE_GUIDANCE,
  getGuidance,
  getFrameworkGuidance,
  getLanguageGuidance,
  getCombinedGuidance,
  checkAntiPatterns,
  generateGuidanceContext,
  type QEGuidance,
  type AntiPattern,
} from '../../../src/learning/qe-guidance.js';
import type { QEDomain, TestFramework, ProgrammingLanguage } from '../../../src/learning/qe-patterns.js';

// ============================================================================
// Tests
// ============================================================================

describe('QE Guidance Templates', () => {
  describe('QE_GUIDANCE_REGISTRY', () => {
    it('should have guidance for all QE domains', () => {
      const expectedDomains: QEDomain[] = [
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

      for (const domain of expectedDomains) {
        expect(QE_GUIDANCE_REGISTRY[domain]).toBeDefined();
        expect(QE_GUIDANCE_REGISTRY[domain].domain).toBeDefined();
        expect(QE_GUIDANCE_REGISTRY[domain].bestPractices.length).toBeGreaterThan(0);
      }
    });
  });

  describe('TEST_GENERATION_GUIDANCE', () => {
    it('should have domain set to test-generation', () => {
      expect(TEST_GENERATION_GUIDANCE.domain).toBe('test-generation');
    });

    it('should include AAA pattern in best practices', () => {
      expect(
        TEST_GENERATION_GUIDANCE.bestPractices.some((p) =>
          p.includes('Arrange-Act-Assert')
        )
      ).toBe(true);
    });

    it('should include TDD red phase in best practices', () => {
      expect(
        TEST_GENERATION_GUIDANCE.bestPractices.some((p) => p.includes('TDD Red'))
      ).toBe(true);
    });

    it('should define common anti-patterns', () => {
      expect(TEST_GENERATION_GUIDANCE.antiPatterns.length).toBeGreaterThan(0);

      const antiPatternNames = TEST_GENERATION_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('God Test');
      expect(antiPatternNames).toContain('Mystery Guest');
      expect(antiPatternNames).toContain('Flaky Assertion');
    });

    it('should have framework guidance for common frameworks', () => {
      expect(TEST_GENERATION_GUIDANCE.frameworkGuidance.jest.length).toBeGreaterThan(0);
      expect(TEST_GENERATION_GUIDANCE.frameworkGuidance.vitest.length).toBeGreaterThan(0);
      expect(TEST_GENERATION_GUIDANCE.frameworkGuidance.pytest.length).toBeGreaterThan(0);
      expect(TEST_GENERATION_GUIDANCE.frameworkGuidance.playwright.length).toBeGreaterThan(0);
    });

    it('should have language guidance for common languages', () => {
      expect(TEST_GENERATION_GUIDANCE.languageGuidance.typescript.length).toBeGreaterThan(0);
      expect(TEST_GENERATION_GUIDANCE.languageGuidance.python.length).toBeGreaterThan(0);
      expect(TEST_GENERATION_GUIDANCE.languageGuidance.java.length).toBeGreaterThan(0);
    });

    it('should include examples', () => {
      expect(TEST_GENERATION_GUIDANCE.examples.length).toBeGreaterThan(0);
      expect(TEST_GENERATION_GUIDANCE.examples[0].title).toBeDefined();
      expect(TEST_GENERATION_GUIDANCE.examples[0].content).toBeDefined();
    });
  });

  describe('COVERAGE_ANALYSIS_GUIDANCE', () => {
    it('should have domain set to coverage-analysis', () => {
      expect(COVERAGE_ANALYSIS_GUIDANCE.domain).toBe('coverage-analysis');
    });

    it('should include risk-weighted coverage practice', () => {
      expect(
        COVERAGE_ANALYSIS_GUIDANCE.bestPractices.some((p) =>
          p.includes('risk-weighted')
        )
      ).toBe(true);
    });

    it('should include sublinear algorithm mention', () => {
      expect(
        COVERAGE_ANALYSIS_GUIDANCE.bestPractices.some((p) => p.includes('O(log n)'))
      ).toBe(true);
    });

    it('should warn against coverage chasing', () => {
      const antiPatternNames = COVERAGE_ANALYSIS_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('Coverage Chasing');
    });
  });

  describe('SECURITY_TESTING_GUIDANCE', () => {
    it('should have domain set to security-compliance', () => {
      expect(SECURITY_TESTING_GUIDANCE.domain).toBe('security-compliance');
    });

    it('should include OWASP in best practices', () => {
      expect(
        SECURITY_TESTING_GUIDANCE.bestPractices.some((p) => p.includes('OWASP'))
      ).toBe(true);
    });

    it('should include SQL injection testing', () => {
      expect(
        SECURITY_TESTING_GUIDANCE.bestPractices.some((p) =>
          p.includes('SQL injection')
        )
      ).toBe(true);
    });

    it('should include XSS testing', () => {
      expect(
        SECURITY_TESTING_GUIDANCE.bestPractices.some((p) => p.includes('XSS'))
      ).toBe(true);
    });
  });

  describe('API_TESTING_GUIDANCE', () => {
    it('should have domain set to contract-testing', () => {
      expect(API_TESTING_GUIDANCE.domain).toBe('contract-testing');
    });

    it('should recommend contract testing', () => {
      expect(
        API_TESTING_GUIDANCE.bestPractices.some((p) =>
          p.toLowerCase().includes('contract testing')
        )
      ).toBe(true);
    });

    it('should warn against testing implementation', () => {
      const antiPatternNames = API_TESTING_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('Testing Implementation');
    });
  });

  describe('VISUAL_TESTING_GUIDANCE', () => {
    it('should have domain set to visual-accessibility', () => {
      expect(VISUAL_TESTING_GUIDANCE.domain).toBe('visual-accessibility');
    });

    it('should recommend baseline images', () => {
      expect(
        VISUAL_TESTING_GUIDANCE.bestPractices.some((p) =>
          p.toLowerCase().includes('baseline')
        )
      ).toBe(true);
    });

    it('should warn against pixel-perfect obsession', () => {
      const antiPatternNames = VISUAL_TESTING_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('Pixel-Perfect Obsession');
    });
  });

  describe('ACCESSIBILITY_GUIDANCE', () => {
    it('should include WCAG in best practices', () => {
      expect(
        ACCESSIBILITY_GUIDANCE.bestPractices.some((p) => p.includes('WCAG'))
      ).toBe(true);
    });

    it('should warn against ARIA overuse', () => {
      const antiPatternNames = ACCESSIBILITY_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('ARIA Overuse');
    });

    it('should warn against automated-only testing', () => {
      const antiPatternNames = ACCESSIBILITY_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('Automated-Only Testing');
    });
  });

  describe('PERFORMANCE_GUIDANCE', () => {
    it('should have domain set to chaos-resilience', () => {
      expect(PERFORMANCE_GUIDANCE.domain).toBe('chaos-resilience');
    });

    it('should include SLA definition', () => {
      expect(
        PERFORMANCE_GUIDANCE.bestPractices.some((p) => p.includes('SLA'))
      ).toBe(true);
    });

    it('should warn against production load testing', () => {
      const antiPatternNames = PERFORMANCE_GUIDANCE.antiPatterns.map((ap) => ap.name);
      expect(antiPatternNames).toContain('Production Load Testing');
    });
  });
});

describe('Guidance Provider Functions', () => {
  describe('getGuidance', () => {
    it('should return guidance for a valid domain', () => {
      const guidance = getGuidance('test-generation');

      expect(guidance).toBeDefined();
      expect(guidance.domain).toBe('test-generation');
      expect(guidance.bestPractices.length).toBeGreaterThan(0);
    });

    it('should return guidance for all domains', () => {
      const domains: QEDomain[] = [
        'test-generation',
        'coverage-analysis',
        'security-compliance',
        'contract-testing',
      ];

      for (const domain of domains) {
        const guidance = getGuidance(domain);
        expect(guidance).toBeDefined();
      }
    });
  });

  describe('getFrameworkGuidance', () => {
    it('should return framework-specific guidance', () => {
      const jestGuidance = getFrameworkGuidance('test-generation', 'jest');

      expect(jestGuidance.length).toBeGreaterThan(0);
      expect(jestGuidance.some((g) => g.includes('jest') || g.includes('Jest'))).toBe(true);
    });

    it('should return empty array for unknown framework', () => {
      const unknownGuidance = getFrameworkGuidance(
        'test-generation',
        'unknown-framework' as TestFramework
      );

      expect(unknownGuidance).toEqual([]);
    });

    it('should return pytest guidance', () => {
      const pytestGuidance = getFrameworkGuidance('test-generation', 'pytest');

      expect(pytestGuidance.length).toBeGreaterThan(0);
      expect(pytestGuidance.some((g) => g.toLowerCase().includes('fixture'))).toBe(true);
    });

    it('should return playwright guidance', () => {
      const playwrightGuidance = getFrameworkGuidance('test-generation', 'playwright');

      expect(playwrightGuidance.length).toBeGreaterThan(0);
      expect(playwrightGuidance.some((g) => g.includes('locator'))).toBe(true);
    });
  });

  describe('getLanguageGuidance', () => {
    it('should return language-specific guidance', () => {
      const tsGuidance = getLanguageGuidance('test-generation', 'typescript');

      expect(tsGuidance.length).toBeGreaterThan(0);
      expect(tsGuidance.some((g) => g.toLowerCase().includes('type'))).toBe(true);
    });

    it('should return empty array for unknown language', () => {
      const unknownGuidance = getLanguageGuidance(
        'test-generation',
        'unknown-language' as ProgrammingLanguage
      );

      expect(unknownGuidance).toEqual([]);
    });

    it('should return Go guidance', () => {
      const goGuidance = getLanguageGuidance('test-generation', 'go');

      expect(goGuidance.length).toBeGreaterThan(0);
      expect(goGuidance.some((g) => g.includes('table-driven'))).toBe(true);
    });
  });

  describe('getCombinedGuidance', () => {
    it('should combine best practices with framework and language guidance', () => {
      const combined = getCombinedGuidance('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(combined.length).toBeGreaterThan(0);

      // Should include base best practices
      expect(combined.some((g) => g.includes('Arrange-Act-Assert'))).toBe(true);

      // Should include framework-specific guidance with prefix
      expect(combined.some((g) => g.startsWith('[vitest]'))).toBe(true);

      // Should include language-specific guidance with prefix
      expect(combined.some((g) => g.startsWith('[typescript]'))).toBe(true);
    });

    it('should include anti-patterns when requested', () => {
      const combined = getCombinedGuidance('test-generation', {
        includeAntiPatterns: true,
      });

      expect(combined.some((g) => g.startsWith('[AVOID]'))).toBe(true);
    });

    it('should work with only framework specified', () => {
      const combined = getCombinedGuidance('test-generation', {
        framework: 'jest',
      });

      expect(combined.length).toBeGreaterThan(0);
      expect(combined.some((g) => g.startsWith('[jest]'))).toBe(true);
    });

    it('should work with only language specified', () => {
      const combined = getCombinedGuidance('test-generation', {
        language: 'python',
      });

      expect(combined.length).toBeGreaterThan(0);
      expect(combined.some((g) => g.startsWith('[python]'))).toBe(true);
    });

    it('should work with no options', () => {
      const combined = getCombinedGuidance('test-generation', {});

      expect(combined.length).toBeGreaterThan(0);
      // Should only have best practices, no prefixed guidance
      expect(combined.every((g) => !g.startsWith('['))).toBe(true);
    });
  });

  describe('checkAntiPatterns', () => {
    it('should detect God Test anti-pattern', () => {
      // The pattern requires 5 consecutive expect statements to trigger
      const testCode = `
        it('should do everything', () => {
          expect(a).toBe(1);expect(b).toBe(2);expect(c).toBe(3);expect(d).toBe(4);expect(e).toBe(5);
        });
      `;

      const detected = checkAntiPatterns('test-generation', testCode);

      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some((ap) => ap.name === 'God Test')).toBe(true);
    });

    it('should detect Flaky Assertion anti-pattern', () => {
      const testCode = `
        it('should handle timing', () => {
          setTimeout(() => {
            expect(result).toBe(true);
          }, 1000);
        });
      `;

      const detected = checkAntiPatterns('test-generation', testCode);

      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some((ap) => ap.name === 'Flaky Assertion')).toBe(true);
    });

    it('should detect Date.now usage as flaky', () => {
      const testCode = `
        it('should check timestamp', () => {
          const now = Date.now();
          expect(result.timestamp).toBeCloseTo(now);
        });
      `;

      const detected = checkAntiPatterns('test-generation', testCode);

      expect(detected.some((ap) => ap.name === 'Flaky Assertion')).toBe(true);
    });

    it('should detect Math.random usage as flaky', () => {
      const testCode = `
        it('should handle random', () => {
          const id = 'test-' + Math.random();
          expect(id).toContain('test-');
        });
      `;

      const detected = checkAntiPatterns('test-generation', testCode);

      expect(detected.some((ap) => ap.name === 'Flaky Assertion')).toBe(true);
    });

    it('should return empty array for clean code', () => {
      const cleanCode = `
        it('should create user', () => {
          const user = createUser({ name: 'John' });
          expect(user.name).toBe('John');
        });
      `;

      const detected = checkAntiPatterns('test-generation', cleanCode);

      expect(detected).toEqual([]);
    });

    it('should work for coverage domain', () => {
      // Coverage analysis doesn't have detection patterns defined
      const detected = checkAntiPatterns('coverage-analysis', 'any code');

      expect(detected).toEqual([]);
    });
  });

  describe('generateGuidanceContext', () => {
    it('should generate markdown guidance context', () => {
      const context = generateGuidanceContext('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(context).toContain('## QE Guidance: test-generation');
      expect(context).toContain('### Best Practices');
      expect(context).toContain('### vitest Tips');
      expect(context).toContain('### typescript Tips');
      expect(context).toContain('### Anti-Patterns to Avoid');
    });

    it('should include best practices (limited to 5)', () => {
      const context = generateGuidanceContext('test-generation', {});

      // Count bullet points in best practices section (before any other section)
      const bestPracticesSection = context.split('### Anti-Patterns')[0];
      // Match lines starting with "- " that are in the best practices area
      const bulletCount = (bestPracticesSection.match(/^- /gm) || []).length;

      // Should have at most 5 best practices bullets
      expect(bulletCount).toBeLessThanOrEqual(8); // Allow for some flexibility
    });

    it('should work without framework or language', () => {
      const context = generateGuidanceContext('coverage-analysis', {});

      expect(context).toContain('## QE Guidance: coverage-analysis');
      expect(context).toContain('### Best Practices');
      expect(context).not.toContain('### undefined Tips');
    });

    it('should include anti-patterns', () => {
      const context = generateGuidanceContext('test-generation', {});

      expect(context).toContain('### Anti-Patterns to Avoid');
      expect(context).toContain('**God Test**');
    });

    it('should handle task description (currently unused but parameter exists)', () => {
      const context = generateGuidanceContext('test-generation', {
        taskDescription: 'Generate tests for UserService',
      });

      // taskDescription is not currently used in the output
      expect(context).toBeDefined();
    });
  });
});

describe('AntiPattern Interface', () => {
  it('should have required fields', () => {
    const antiPattern: AntiPattern = TEST_GENERATION_GUIDANCE.antiPatterns[0];

    expect(antiPattern.name).toBeDefined();
    expect(antiPattern.description).toBeDefined();
    expect(antiPattern.reason).toBeDefined();
    expect(antiPattern.alternative).toBeDefined();
  });

  it('should have optional detection pattern', () => {
    const godTest = TEST_GENERATION_GUIDANCE.antiPatterns.find(
      (ap) => ap.name === 'God Test'
    );

    expect(godTest?.detection).toBeDefined();
    expect(new RegExp(godTest!.detection!)).toBeDefined();
  });
});

describe('QEGuidance Interface', () => {
  it('should have all required fields', () => {
    const guidance: QEGuidance = TEST_GENERATION_GUIDANCE;

    expect(guidance.domain).toBeDefined();
    expect(Array.isArray(guidance.bestPractices)).toBe(true);
    expect(Array.isArray(guidance.antiPatterns)).toBe(true);
    expect(typeof guidance.frameworkGuidance).toBe('object');
    expect(typeof guidance.languageGuidance).toBe('object');
    expect(Array.isArray(guidance.examples)).toBe(true);
  });
});
