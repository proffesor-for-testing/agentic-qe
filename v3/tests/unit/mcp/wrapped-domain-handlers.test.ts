/**
 * Wrapped Domain Handlers Tests
 * ADR-051: Tests for domain handlers with experience capture
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the experience capture middleware before importing handlers
vi.mock('../../../src/learning/experience-capture-middleware.js', () => ({
  wrapWithExperienceCapture: vi.fn(
    <TParams, TResult>(
      handler: (params: TParams) => Promise<{ success: boolean; data?: TResult; error?: string }>,
      _domain: string,
      _agent: string
    ) => {
      // Return a passthrough wrapper that mimics the real behavior
      return async (params: TParams) => {
        const result = await handler(params);
        return result;
      };
    }
  ),
  initializeExperienceCapture: vi.fn().mockResolvedValue(undefined),
}));

// Mock the original domain handlers
vi.mock('../../../src/mcp/handlers/domain-handlers.js', () => ({
  handleTestGenerate: vi.fn(),
  handleTestExecute: vi.fn(),
  handleCoverageAnalyze: vi.fn(),
  handleQualityAssess: vi.fn(),
  handleSecurityScan: vi.fn(),
  handleContractValidate: vi.fn(),
  handleAccessibilityTest: vi.fn(),
  handleChaosTest: vi.fn(),
  handleDefectPredict: vi.fn(),
  handleRequirementsValidate: vi.fn(),
  handleCodeIndex: vi.fn(),
  resetTaskExecutor: vi.fn(),
}));

// Import after mocks are set up
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
} from '../../../src/mcp/handlers/wrapped-domain-handlers.js';

import {
  handleTestGenerate as originalTestGenerate,
  handleTestExecute as originalTestExecute,
  handleCoverageAnalyze as originalCoverageAnalyze,
  handleQualityAssess as originalQualityAssess,
  handleSecurityScan as originalSecurityScan,
  handleContractValidate as originalContractValidate,
  handleAccessibilityTest as originalAccessibilityTest,
  handleChaosTest as originalChaosTest,
  handleDefectPredict as originalDefectPredict,
  handleRequirementsValidate as originalRequirementsValidate,
  handleCodeIndex as originalCodeIndex,
} from '../../../src/mcp/handlers/domain-handlers.js';

import { wrapWithExperienceCapture } from '../../../src/learning/experience-capture-middleware.js';

describe('WrappedDomainHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Handler Exports', () => {
    it('should export all domain handlers', () => {
      // Verify all handlers are exported and are functions
      expect(typeof handleTestGenerate).toBe('function');
      expect(typeof handleTestExecute).toBe('function');
      expect(typeof handleCoverageAnalyze).toBe('function');
      expect(typeof handleQualityAssess).toBe('function');
      expect(typeof handleSecurityScan).toBe('function');
      expect(typeof handleContractValidate).toBe('function');
      expect(typeof handleAccessibilityTest).toBe('function');
      expect(typeof handleChaosTest).toBe('function');
      expect(typeof handleDefectPredict).toBe('function');
      expect(typeof handleRequirementsValidate).toBe('function');
      expect(typeof handleCodeIndex).toBe('function');
    });

    it('should export resetTaskExecutor utility', () => {
      expect(typeof resetTaskExecutor).toBe('function');
    });

    it('should cover all 11 QE domain handlers', () => {
      // The wrapped handlers module should export exactly 11 domain handlers + 1 utility
      const handlerExports = [
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
      ];

      expect(handlerExports.length).toBe(11);
      handlerExports.forEach((handler) => {
        expect(typeof handler).toBe('function');
      });
    });
  });

  describe('handleTestGenerate', () => {
    it('should call original handler and return ToolResult format', async () => {
      vi.mocked(originalTestGenerate).mockResolvedValue({
        success: true,
        data: { tests: ['test1.ts'], coverage: 85 },
      });

      const result = await handleTestGenerate({
        sourceCode: 'function add(a, b) { return a + b; }',
        testType: 'unit',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('tests');
    });

    it('should handle failure correctly', async () => {
      vi.mocked(originalTestGenerate).mockResolvedValue({
        success: false,
        error: 'Failed to generate tests',
      });

      const result = await handleTestGenerate({
        sourceCode: '',
        testType: 'unit',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to generate tests');
    });
  });

  describe('handleTestExecute', () => {
    it('should call original handler for test execution', async () => {
      vi.mocked(originalTestExecute).mockResolvedValue({
        success: true,
        data: { passed: 10, failed: 0, duration: 1500 },
      });

      const result = await handleTestExecute({
        testFiles: ['tests/unit/**/*.test.ts'],
        parallel: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('passed');
    });
  });

  describe('handleCoverageAnalyze', () => {
    it('should call original handler for coverage analysis', async () => {
      vi.mocked(originalCoverageAnalyze).mockResolvedValue({
        success: true,
        data: { lines: 85, branches: 75, functions: 90 },
      });

      const result = await handleCoverageAnalyze({
        target: 'src/',
        detectGaps: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('lines');
    });
  });

  describe('handleQualityAssess', () => {
    it('should call original handler for quality assessment', async () => {
      vi.mocked(originalQualityAssess).mockResolvedValue({
        success: true,
        data: { score: 85, passed: true, metrics: {} },
      });

      const result = await handleQualityAssess({
        target: 'src/',
        strict: false,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('score');
    });
  });

  describe('handleSecurityScan', () => {
    it('should call original handler for security scanning', async () => {
      vi.mocked(originalSecurityScan).mockResolvedValue({
        success: true,
        data: { vulnerabilities: [], score: 95 },
      });

      const result = await handleSecurityScan({
        target: 'src/',
        sast: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('vulnerabilities');
    });
  });

  describe('handleContractValidate', () => {
    it('should call original handler for contract validation', async () => {
      vi.mocked(originalContractValidate).mockResolvedValue({
        success: true,
        data: { valid: true, contracts: [] },
      });

      const result = await handleContractValidate({
        provider: 'service-a',
        consumer: 'service-b',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('valid');
    });
  });

  describe('handleAccessibilityTest', () => {
    it('should call original handler for accessibility testing', async () => {
      vi.mocked(originalAccessibilityTest).mockResolvedValue({
        success: true,
        data: { violations: [], passes: 50, wcagLevel: 'AA' },
      });

      const result = await handleAccessibilityTest({
        url: 'https://example.com',
        standard: 'wcag21',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('violations');
    });
  });

  describe('handleChaosTest', () => {
    it('should call original handler for chaos testing', async () => {
      vi.mocked(originalChaosTest).mockResolvedValue({
        success: true,
        data: { resilient: true, experiments: [] },
      });

      const result = await handleChaosTest({
        target: 'service-a',
        faultTypes: ['latency', 'failure'],
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('resilient');
    });
  });

  describe('handleDefectPredict', () => {
    it('should call original handler for defect prediction', async () => {
      vi.mocked(originalDefectPredict).mockResolvedValue({
        success: true,
        data: { predictions: [], riskScore: 0.3 },
      });

      const result = await handleDefectPredict({
        target: 'src/utils.ts',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('predictions');
    });
  });

  describe('handleRequirementsValidate', () => {
    it('should call original handler for requirements validation', async () => {
      vi.mocked(originalRequirementsValidate).mockResolvedValue({
        success: true,
        data: { valid: true, coverage: 90 },
      });

      const result = await handleRequirementsValidate({
        requirements: 'User should be able to login',
        testFiles: ['tests/auth.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('valid');
    });
  });

  describe('handleCodeIndex', () => {
    it('should call original handler for code indexing', async () => {
      vi.mocked(originalCodeIndex).mockResolvedValue({
        success: true,
        data: { indexed: 100, duration: 500 },
      });

      const result = await handleCodeIndex({
        target: 'src/',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('indexed');
    });
  });

  describe('Error Handling', () => {
    it('should handle success with undefined data', async () => {
      vi.mocked(originalTestGenerate).mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await handleTestGenerate({
        sourceCode: 'function test() {}',
        testType: 'unit',
      });

      // Should still be successful even with undefined data
      expect(result.success).toBe(true);
    });

    it('should provide default error message when error is undefined', async () => {
      vi.mocked(originalSecurityScan).mockResolvedValue({
        success: false,
        error: undefined,
      });

      const result = await handleSecurityScan({
        target: 'src/',
        sast: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('resetTaskExecutor', () => {
    it('should re-export resetTaskExecutor', () => {
      expect(resetTaskExecutor).toBeDefined();
      expect(typeof resetTaskExecutor).toBe('function');
    });
  });
});
