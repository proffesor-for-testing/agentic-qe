/**
 * Predict Defects Handler Test Suite
 *
 * Tests for AI/ML-based defect prediction.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PredictDefectsHandler } from '@mcp/handlers/predict-defects';

describe('PredictDefectsHandler', () => {
  let handler: PredictDefectsHandler;

  beforeEach(() => {
    handler = new PredictDefectsHandler();
  });

  describe('Happy Path', () => {
    it('should predict defects successfully', async () => {
      const response = await handler.handle({
        codeChanges: { repository: 'test/repo', files: ['src/test.ts'] },
        scope: { analysisType: 'file', modelType: 'neural' }
      });

      expect(response.success).toBe(true);
    });

    it('should handle function-level analysis', async () => {
      const response = await handler.handle({
        codeChanges: { repository: 'test/repo', files: ['src/test.ts'] },
        scope: { analysisType: 'function', modelType: 'statistical' }
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should reject missing scope', async () => {
      const response = await handler.handle({
        codeChanges: { repository: 'test/repo' }
      } as any);

      expect(response.success).toBe(false);
    });
  });
});
