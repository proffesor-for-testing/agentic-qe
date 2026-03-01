/**
 * Unit tests for Wrapped Domain Handlers
 * Tests experience capture middleware integration (ADR-051)
 *
 * Note: These tests focus on the wrapper behavior, not duplicating
 * domain handler functionality (which is tested in domain-handlers.test.ts)
 *
 * OOM Prevention (Issue #294): Mocks task executor to avoid real execution.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock task executor at module level — prevents real task execution (Issue #294)
// ---------------------------------------------------------------------------
const mockExecute = vi.fn();

vi.mock('../../../../src/coordination/task-executor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/coordination/task-executor')>();
  return {
    ...actual,
    createTaskExecutor: vi.fn(() => ({
      execute: mockExecute,
      setQualityFeedbackLoop: vi.fn(),
    })),
  };
});

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
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';

// Default mock response for all domain handlers
const defaultMockResponse = {
  success: true,
  data: {
    total: 5,
    passed: 4,
    failed: 1,
    skipped: 0,
    coverage: 82.5,
    vulnerabilities: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    valid: true,
    score: 85,
    qualityScore: 88,
    riskScore: 15,
    testsGenerated: 3,
    lineCoverage: 85,
    branchCoverage: 78,
    functionCoverage: 92,
    filesIndexed: 10,
    symbolsExtracted: 50,
    relationsFound: 25,
    requirementsAnalyzed: 5,
    testable: 4,
    predictedDefects: [],
    recommendations: ['Improve test coverage'],
    breakingChanges: [],
    warnings: [],
    violations: [],
    gaps: [],
    results: [
      { id: 'test-1', name: 'sample test', status: 'passed', duration: 12 },
    ],
  },
  duration: 150,
  savedFiles: [],
};

// ============================================================================
// Tests
// ============================================================================

describe('Wrapped Domain Handlers', () => {
  // Initialize fleet ONCE (in-memory to avoid touching live DB and OOM)
  beforeAll(async () => {
    mockExecute.mockResolvedValue(defaultMockResponse);
    await handleFleetInit({ memoryBackend: 'memory' });
  });

  afterAll(async () => {
    resetTaskExecutor();
    await disposeFleet();
    resetUnifiedPersistence();
  });

  afterEach(() => {
    mockExecute.mockClear();
    mockExecute.mockResolvedValue(defaultMockResponse);
    resetTaskExecutor();
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
    }, 30000);

    it('should wrap handleCoverageAnalyze with experience capture', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.lineCoverage).toBeGreaterThanOrEqual(0);
    }, 30000);

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
    }, 30000);
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

      // Restore fleet for subsequent tests (beforeAll only inits once)
      await handleFleetInit({ memoryBackend: 'memory' });
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

      // Restore fleet for subsequent tests (beforeAll only inits once)
      await handleFleetInit({ memoryBackend: 'memory' });
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
    }, 30000);

    it('should preserve V2-compatible fields', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function multiply(a, b) { return a * b; }',
        aiEnhancement: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.tests).toBeDefined();
      expect(result.data!.aiInsights).toBeDefined();
      expect(result.data!.learning).toBeDefined();
    }, 30000);
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
    }, 30000);
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
