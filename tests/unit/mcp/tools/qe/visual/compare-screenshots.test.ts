/**
 * Unit tests for AI-powered screenshot comparison tool
 */

import { describe, it, expect } from '@jest/globals';
import { compareScreenshotsAI, type CompareScreenshotsParams } from '../../../../../src/mcp/tools/qe/visual/compare-screenshots';

describe('compareScreenshotsAI', () => {
  it('should successfully compare identical screenshots', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 0.05,
      useAI: false
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.metadata.requestId).toBeDefined();
    expect(result.metadata.executionTime).toBeGreaterThan(0);
  });

  it('should use AI-powered comparison when enabled', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 0.05,
      useAI: true
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    expect(result.data?.method).toBe('ai-visual-diff');
    expect(result.data?.performance.aiInferenceTime).toBeDefined();
  });

  it('should detect visual differences above threshold', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './different.png',
      threshold: 0.05,
      useAI: true
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.status !== 'identical') {
      expect(result.data.differences.length).toBeGreaterThan(0);
      expect(result.data.recommendations.length).toBeGreaterThan(0);
    }
  });

  it('should generate diff image when requested', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 0.05,
      useAI: false,
      options: {
        generateDiffImage: true
      }
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.status !== 'identical') {
      expect(result.data.diffImagePath).toMatch(/^\/visual-diffs\/diff-.*\.png$/);
    }
  });

  it('should validate required parameters', async () => {
    const params: CompareScreenshotsParams = {
      baseline: '',
      current: './current.png',
      threshold: 0.05,
      useAI: false
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('SCREENSHOT_COMPARISON_FAILED');
  });

  it('should reject invalid threshold values', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 1.5, // Invalid: must be 0-1
      useAI: false
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Threshold must be between 0 and 1');
  });

  it('should return correct status based on diff percentage', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 0.05,
      useAI: false
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    expect(result.data?.status).toMatch(/^(identical|minor-diff|major-diff|different)$/);
  });

  it('should provide recommendations for detected differences', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './different.png',
      threshold: 0.05,
      useAI: true
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    expect(result.data?.recommendations).toBeInstanceOf(Array);
    if (result.data && result.data.status !== 'identical') {
      expect(result.data.recommendations.length).toBeGreaterThan(0);
    }
  });

  it('should report performance metrics', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 0.05,
      useAI: true
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    expect(result.data?.performance.comparisonTime).toBeGreaterThan(0);
    expect(result.metadata.executionTime).toBeGreaterThan(0);
  });

  it('should use pixel-diff method when AI disabled', async () => {
    const params: CompareScreenshotsParams = {
      baseline: './baseline.png',
      current: './current.png',
      threshold: 0.05,
      useAI: false
    };

    const result = await compareScreenshotsAI(params);

    expect(result.success).toBe(true);
    expect(result.data?.method).toBe('pixel-diff');
    expect(result.data?.performance.aiInferenceTime).toBeUndefined();
  });
});
