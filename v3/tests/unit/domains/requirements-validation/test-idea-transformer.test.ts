/**
 * Agentic QE v3 - Test Idea Transformer Service Unit Tests
 *
 * Tests the rule-based transformation of "Verify X" patterns to action verbs.
 * This service CAN be tested programmatically (no LLM required).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TestIdeaTransformerService,
  createTestIdeaTransformerService,
} from '../../../../src/domains/requirements-validation/index';

describe('TestIdeaTransformerService', () => {
  let service: TestIdeaTransformerService;

  beforeEach(() => {
    service = createTestIdeaTransformerService();
  });

  describe('transform - API patterns', () => {
    it('should transform "Verify API returns 200"', () => {
      const result = service.transform('Verify API returns 200');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('200');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform "Verify the API responds with data"', () => {
      const result = service.transform('Verify the API responds with data');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - Error handling patterns', () => {
    it('should transform "Verify error message displays"', () => {
      const result = service.transform('Verify error message displays');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('error');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform "Verify validation error"', () => {
      const result = service.transform('Verify validation error shows');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - Data persistence patterns', () => {
    it('should transform "Verify data persists"', () => {
      const result = service.transform('Verify data persists after refresh');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('data');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform "Verify the data is saved"', () => {
      const result = service.transform('Verify the data is saved');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - UI interaction patterns', () => {
    it('should transform "Verify sorting functionality"', () => {
      const result = service.transform('Verify sorting functionality');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('column');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform "Verify filtering works"', () => {
      const result = service.transform('Verify filtering works');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform "Verify pagination"', () => {
      const result = service.transform('Verify pagination works correctly');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('page');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - Performance patterns', () => {
    it('should transform "Verify performance meets SLA"', () => {
      const result = service.transform('Verify performance meets SLA');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('latency');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform "Verify response time"', () => {
      const result = service.transform('Verify response time is acceptable');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - Accessibility patterns', () => {
    it('should transform "Verify accessibility"', () => {
      const result = service.transform('Verify accessibility compliance');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).toContain('keyboard');
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - Generic patterns', () => {
    it('should transform generic "Verify X is displayed"', () => {
      const result = service.transform('Verify that the dashboard is displayed');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform generic "Verify X works"', () => {
      const result = service.transform('Verify that the button works');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });

    it('should transform catch-all "Verify X"', () => {
      const result = service.transform('Verify something completely random');

      expect(result.wasTransformed).toBe(true);
      expect(result.transformed).not.toMatch(/^Verify/i);
    });
  });

  describe('transform - Non-Verify patterns', () => {
    it('should NOT transform text that does not start with "Verify"', () => {
      const result = service.transform('Click the button and check the result');

      expect(result.wasTransformed).toBe(false);
      expect(result.transformed).toBe('Click the button and check the result');
      expect(result.ruleApplied).toBe('none');
    });

    it('should NOT transform action-based test ideas', () => {
      const original = 'Send POST request; confirm 201 response';
      const result = service.transform(original);

      expect(result.wasTransformed).toBe(false);
      expect(result.transformed).toBe(original);
    });
  });

  describe('transformHTML', () => {
    it('should transform Verify patterns in HTML table cells', () => {
      const html = `
        <table>
          <tr>
            <td>TC-001</td>
            <td>Verify API returns 200</td>
            <td>P1</td>
          </tr>
          <tr>
            <td>TC-002</td>
            <td>Click button and check result</td>
            <td>P2</td>
          </tr>
        </table>
      `;

      const result = service.transformHTML(html);

      expect(result.verifyPatternCount).toBe(0);
      expect(result.successfulTransformations).toBe(1);
      expect(result.html).not.toContain('<td>Verify ');
    });

    it('should preserve non-Verify content unchanged', () => {
      const html = `
        <tr>
          <td>TC-001</td>
          <td>Click button and check result</td>
        </tr>
      `;

      const result = service.transformHTML(html);

      expect(result.verifyPatternCount).toBe(0);
      expect(result.successfulTransformations).toBe(0);
      expect(result.html).toContain('Click button and check result');
    });

    it('should transform multiple Verify patterns', () => {
      const html = `
        <td>Verify sorting works</td>
        <td>Verify filtering works</td>
        <td>Verify pagination works</td>
      `;

      const result = service.transformHTML(html);

      expect(result.verifyPatternCount).toBe(0);
      expect(result.successfulTransformations).toBe(3);
    });

    it('should track all transformations', () => {
      const html = `
        <td>Verify API returns 200</td>
        <td>Verify data persists</td>
      `;

      const result = service.transformHTML(html);

      expect(result.transformations).toHaveLength(2);
      expect(result.transformations[0].wasTransformed).toBe(true);
      expect(result.transformations[1].wasTransformed).toBe(true);
    });
  });

  describe('countVerifyPatterns', () => {
    it('should count Verify patterns in HTML', () => {
      const html = `
        <td>Verify sorting works</td>
        <td>Verify filtering works</td>
        <td>Click and confirm</td>
      `;

      const count = service.countVerifyPatterns(html);

      expect(count).toBe(2);
    });

    it('should return 0 for no Verify patterns', () => {
      const html = '<td>Click and confirm</td>';

      const count = service.countVerifyPatterns(html);

      expect(count).toBe(0);
    });
  });

  describe('getRules', () => {
    it('should return all transformation rules', () => {
      const rules = service.getRules();

      expect(rules.length).toBeGreaterThan(10);
      expect(rules[0]).toHaveProperty('pattern');
      expect(rules[0]).toHaveProperty('transform');
      expect(rules[0]).toHaveProperty('description');
    });
  });
});

describe('Factory Function', () => {
  it('should create service with default config', () => {
    const service = createTestIdeaTransformerService();
    expect(service).toBeInstanceOf(TestIdeaTransformerService);
  });

  it('should create service with custom rules', () => {
    const customRule = {
      pattern: /^Verify custom pattern$/i,
      transform: () => 'Custom transformed',
      description: 'Custom rule',
    };

    const service = createTestIdeaTransformerService({
      customRules: [customRule],
    });

    const result = service.transform('Verify custom pattern');
    expect(result.transformed).toBe('Custom transformed');
  });
});
