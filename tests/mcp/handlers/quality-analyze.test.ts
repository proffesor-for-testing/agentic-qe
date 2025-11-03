/**
 * Quality Analyze Handler Test Suite
 *
 * Tests for comprehensive quality metrics analysis.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { QualityAnalyzeHandler } from '@mcp/handlers/quality-analyze';

describe('QualityAnalyzeHandler', () => {
  let handler: QualityAnalyzeHandler;

  beforeEach(() => {
    handler = new QualityAnalyzeHandler();
  });

  describe('Happy Path', () => {
    it('should analyze quality metrics successfully', async () => {
      const response = await handler.handle({
        params: {
          scope: 'all',
          metrics: ['coverage', 'complexity', 'maintainability']
        },
        dataSource: {}
      });

      expect(response.success).toBe(true);
    });

    it('should handle code-specific analysis', async () => {
      const response = await handler.handle({
        params: {
          scope: 'code',
          metrics: ['complexity']
        },
        dataSource: { codeMetrics: './metrics.json' }
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should reject missing params', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
    });
  });
});
