/**
 * Unit tests for WCAG accessibility validation tool
 */

import { describe, it, expect } from '@jest/globals';
import { validateAccessibilityWCAG, type ValidateAccessibilityParams, type WCAGLevel } from '../../../../../../src/mcp/tools/qe/visual/validate-accessibility';

describe('validateAccessibilityWCAG', () => {
  it('should successfully validate accessibility for WCAG AA', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.wcagLevel).toBe('AA');
    expect(result.metadata.requestId).toBeDefined();
  });

  it('should validate all WCAG levels (A, AA, AAA)', async () => {
    const levels: WCAGLevel[] = ['A', 'AA', 'AAA'];

    for (const level of levels) {
      const params: ValidateAccessibilityParams = {
        url: 'https://example.com',
        level,
        includeScreenshots: false
      };

      const result = await validateAccessibilityWCAG(params);

      expect(result.success).toBe(true);
      expect(result.data?.wcagLevel).toBe(level);
    }
  });

  it('should detect accessibility violations', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.violations).toBeInstanceOf(Array);
    expect(result.data?.summary.totalViolations).toBeGreaterThanOrEqual(0);
  });

  it('should calculate compliance score', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.complianceScore).toBeGreaterThanOrEqual(0);
    expect(result.data?.complianceScore).toBeLessThanOrEqual(100);
  });

  it('should categorize violations by severity', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    const summary = result.data?.summary;
    expect(summary).toBeDefined();
    expect(typeof summary?.critical).toBe('number');
    expect(typeof summary?.serious).toBe('number');
    expect(typeof summary?.moderate).toBe('number');
    expect(typeof summary?.minor).toBe('number');
  });

  it('should generate screenshots when requested', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: true
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.screenshots).toBeDefined();
    expect(result.data?.screenshots?.mainPage).toMatch(/^\/accessibility\/screenshots\/main-.*\.png$/);
    expect(result.data?.screenshots?.annotated).toMatch(/^\/accessibility\/screenshots\/annotated-.*\.png$/);
  });

  it('should perform color contrast analysis when enabled', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false,
      options: {
        colorContrastAnalysis: true
      }
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.colorContrast).toBeDefined();
    expect(result.data?.colorContrast?.status).toMatch(/^(pass|fail)$/);
    expect(result.data?.colorContrast?.minimumRatio).toBeGreaterThan(0);
  });

  it('should perform keyboard navigation test when enabled', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false,
      options: {
        keyboardNavigationTest: true
      }
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.keyboardNavigation).toBeDefined();
    expect(result.data?.keyboardNavigation?.status).toMatch(/^(pass|fail)$/);
    expect(typeof result.data?.keyboardNavigation?.tabOrderLogical).toBe('boolean');
  });

  it('should perform screen reader compatibility check when enabled', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false,
      options: {
        screenReaderCheck: true
      }
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.screenReaderCompatibility).toBeDefined();
    expect(result.data?.screenReaderCompatibility?.status).toMatch(/^(pass|fail)$/);
    expect(result.data?.screenReaderCompatibility?.altTextCoverage).toBeGreaterThanOrEqual(0);
    expect(result.data?.screenReaderCompatibility?.altTextCoverage).toBeLessThanOrEqual(1);
  });

  it('should generate recommendations for violations', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.recommendations).toBeInstanceOf(Array);
  });

  it('should validate required URL parameter', async () => {
    const params: ValidateAccessibilityParams = {
      url: '',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('ACCESSIBILITY_VALIDATION_FAILED');
  });

  it('should reject invalid WCAG levels', async () => {
    const params = {
      url: 'https://example.com',
      level: 'INVALID' as WCAGLevel,
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('WCAG level must be A, AA, or AAA');
  });

  it('should report performance metrics', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.performance.validationTime).toBeGreaterThan(0);
    expect(result.data?.performance.elementsScanned).toBeGreaterThan(0);
    expect(result.metadata.executionTime).toBeGreaterThan(0);
  });

  it('should determine compliance status correctly', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    expect(result.data?.status).toMatch(/^(compliant|partially-compliant|non-compliant)$/);
  });

  it('should provide WCAG criterion references for violations', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.violations.length > 0) {
      const violation = result.data.violations[0];
      expect(violation.criterion).toContain('WCAG');
      expect(violation.wcagUrl).toContain('w3.org');
    }
  });

  it('should provide actionable recommendations', async () => {
    const params: ValidateAccessibilityParams = {
      url: 'https://example.com',
      level: 'AA',
      includeScreenshots: false
    };

    const result = await validateAccessibilityWCAG(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.recommendations.length > 0) {
      const recommendation = result.data.recommendations[0];
      expect(recommendation.actions).toBeInstanceOf(Array);
      expect(recommendation.actions.length).toBeGreaterThan(0);
      expect(recommendation.estimatedEffort).toBeGreaterThan(0);
    }
  });
});
