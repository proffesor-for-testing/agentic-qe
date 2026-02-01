/**
 * Unit tests for Wrapped Domain Handlers
 * Tests experience capture middleware integration (ADR-051)
 *
 * Note: These tests focus on the wrapper behavior, not duplicating
 * domain handler functionality (which is tested in domain-handlers.test.ts)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import wrapped handlers from the wrapped module
import {
  handleTestGenerate,
  handleTestExecute,
  handleCoverageAnalyze,
  handleQualityAssess,
  handleSecurityScan,
  handleContractValidate,
  handleAccessibilityTest,
  handleChaosTest,
  handleDefectPredict,
  handleRequirementsValidate,
  handleCodeIndex,
  resetTaskExecutor,
} from '../../../../src/mcp/handlers/wrapped-domain-handlers';

import {
  handleFleetInit,
  disposeFleet,
  isFleetInitialized,
} from '../../../../src/mcp/handlers/core-handlers';

// ============================================================================
// Tests
// ============================================================================

describe('Wrapped Domain Handlers', () => {
  // Initialize fleet once before all tests
  beforeEach(async () => {
    if (!isFleetInitialized()) {
      await handleFleetInit({});
    }
  });

  // Clean up after each test
  afterEach(async () => {
    resetTaskExecutor();
    await disposeFleet();
  });

  // --------------------------------------------------------------------------
  // Experience Capture Integration
  // --------------------------------------------------------------------------

  describe('Experience Capture Integration', () => {
    it('should wrap handleTestGenerate with experience capture', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function test() { return 1; }',
      });

      expect(result.success).toBe(true);
      // The wrapper should not change the result structure
      expect(result.data).toBeDefined();
      expect(result.data!.testsGenerated).toBeGreaterThan(0);
    });

    it('should wrap handleCoverageAnalyze with experience capture', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.lineCoverage).toBeGreaterThanOrEqual(0);
    });

    it('should wrap handleQualityAssess with experience capture', async () => {
      const result = await handleQualityAssess({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.qualityScore).toBeDefined();
    }, 30000);

    it('should wrap handleSecurityScan with experience capture', async () => {
      const result = await handleSecurityScan({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.vulnerabilities).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling with Wrappers
  // --------------------------------------------------------------------------

  describe('Error Handling with Wrappers', () => {
    it('should return fleet not initialized error through wrapper', async () => {
      await disposeFleet();

      const result = await handleTestGenerate({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should handle errors gracefully in multiple wrapped handlers', async () => {
      await disposeFleet();

      const results = await Promise.all([
        handleTestGenerate({}),
        handleCoverageAnalyze({}),
        handleQualityAssess({}),
      ]);

      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Wrapper Function Behavior
  // --------------------------------------------------------------------------

  describe('Wrapper Function Behavior', () => {
    it('should preserve original handler functionality', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'const add = (a, b) => a + b;',
        language: 'typescript',
        testType: 'unit',
      });

      expect(result.success).toBe(true);
      expect(result.data!.language).toBe('typescript');
    });

    it('should preserve V2-compatible fields', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function multiply(a, b) { return a * b; }',
        aiEnhancement: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.tests).toBeDefined();
      expect(result.data!.aiInsights).toBeDefined();
      expect(result.data!.learning).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // resetTaskExecutor
  // --------------------------------------------------------------------------

  describe('resetTaskExecutor (re-exported)', () => {
    it('should be exported from wrapped handlers', () => {
      expect(typeof resetTaskExecutor).toBe('function');
    });

    it('should work correctly when called', () => {
      expect(() => resetTaskExecutor()).not.toThrow();
    });

    it('should allow handlers to work after reset', async () => {
      resetTaskExecutor();

      const result = await handleTestGenerate({
        sourceCode: 'function test() {}',
      });

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // All Handler Types Are Exported
  // --------------------------------------------------------------------------

  describe('All Handler Types Are Exported', () => {
    it('should export handleTestGenerate', () => {
      expect(typeof handleTestGenerate).toBe('function');
    });

    it('should export handleTestExecute', () => {
      expect(typeof handleTestExecute).toBe('function');
    });

    it('should export handleCoverageAnalyze', () => {
      expect(typeof handleCoverageAnalyze).toBe('function');
    });

    it('should export handleQualityAssess', () => {
      expect(typeof handleQualityAssess).toBe('function');
    });

    it('should export handleSecurityScan', () => {
      expect(typeof handleSecurityScan).toBe('function');
    });

    it('should export handleContractValidate', () => {
      expect(typeof handleContractValidate).toBe('function');
    });

    it('should export handleAccessibilityTest', () => {
      expect(typeof handleAccessibilityTest).toBe('function');
    });

    it('should export handleChaosTest', () => {
      expect(typeof handleChaosTest).toBe('function');
    });

    it('should export handleDefectPredict', () => {
      expect(typeof handleDefectPredict).toBe('function');
    });

    it('should export handleRequirementsValidate', () => {
      expect(typeof handleRequirementsValidate).toBe('function');
    });

    it('should export handleCodeIndex', () => {
      expect(typeof handleCodeIndex).toBe('function');
    });
  });
});
