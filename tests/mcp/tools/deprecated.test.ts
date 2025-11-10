/**
 * Tests for deprecated MCP tools (Phase 3 backward compatibility)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  test_coverage_detailed,
  test_coverage_gaps,
  flaky_test_detect,
  flaky_test_patterns,
  flaky_test_stabilize,
  performance_benchmark_run,
  performance_monitor_realtime,
  security_scan_comprehensive,
  visual_test_regression,
  getDeprecationInfo,
  listDeprecatedTools
} from '../../../src/mcp/tools/deprecated.js';

describe('Deprecated Tools - Phase 3 Backward Compatibility', () => {
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Coverage Domain', () => {
    it('test_coverage_detailed should emit deprecation warning', async () => {
      // Mock the handler to avoid actual execution
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      test_coverage_detailed.handler = mockHandler;

      await test_coverage_detailed.handler({
        source_dirs: ['src'],
        framework: 'jest'
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  DEPRECATION WARNING')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('test_coverage_detailed')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('analyzeCoverageWithRiskScoring')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('v3.0.0 (February 2026)')
      );
    });

    it('test_coverage_gaps should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      test_coverage_gaps.handler = mockHandler;

      await test_coverage_gaps.handler({
        source_dirs: ['src'],
        coverage_threshold: 80
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('test_coverage_gaps')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('identifyUncoveredRiskAreas')
      );
    });
  });

  describe('Flaky Detection Domain', () => {
    it('flaky_test_detect should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      flaky_test_detect.handler = mockHandler;

      await flaky_test_detect.handler({
        test_results_dir: './test-results',
        runs_threshold: 10
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('flaky_test_detect')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('detectFlakyTestsStatistical')
      );
    });

    it('flaky_test_patterns should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      flaky_test_patterns.handler = mockHandler;

      await flaky_test_patterns.handler({
        test_results_dir: './test-results'
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('flaky_test_patterns')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('analyzeFlakyTestPatterns')
      );
    });

    it('flaky_test_stabilize should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      flaky_test_stabilize.handler = mockHandler;

      await flaky_test_stabilize.handler({
        test_file: './test.spec.ts',
        flaky_test_name: 'test',
        stabilization_strategy: 'auto'
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('flaky_test_stabilize')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('stabilizeFlakyTestAuto')
      );
    });
  });

  describe('Performance Domain', () => {
    it('performance_benchmark_run should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      performance_benchmark_run.handler = mockHandler;

      await performance_benchmark_run.handler({
        target: 'http://localhost:3000',
        duration: 60
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('performance_benchmark_run')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('runPerformanceBenchmark')
      );
    });

    it('performance_monitor_realtime should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      performance_monitor_realtime.handler = mockHandler;

      await performance_monitor_realtime.handler({
        target: 'http://localhost:3000',
        interval: 1000
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('performance_monitor_realtime')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('monitorRealtimePerformance')
      );
    });
  });

  describe('Security Domain', () => {
    it('security_scan_comprehensive should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      security_scan_comprehensive.handler = mockHandler;

      await security_scan_comprehensive.handler({
        target_dirs: ['src'],
        scan_types: ['sast']
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('security_scan_comprehensive')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('scanSecurityComprehensive')
      );
    });
  });

  describe('Visual Domain', () => {
    it('visual_test_regression should emit deprecation warning', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      visual_test_regression.handler = mockHandler;

      await visual_test_regression.handler({
        baseline_dir: './baseline',
        current_dir: './current'
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('visual_test_regression')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('detectVisualRegression')
      );
    });
  });

  describe('Deprecation Info API', () => {
    it('getDeprecationInfo should return correct info for deprecated tools', () => {
      const info = getDeprecationInfo('test_coverage_detailed');

      expect(info.isDeprecated).toBe(true);
      expect(info.newName).toBe('analyzeCoverageWithRiskScoring');
      expect(info.domain).toBe('coverage');
      expect(info.removalVersion).toBe('v3.0.0 (February 2026)');
    });

    it('getDeprecationInfo should return not deprecated for unknown tools', () => {
      const info = getDeprecationInfo('unknown_tool');

      expect(info.isDeprecated).toBe(false);
      expect(info.newName).toBeUndefined();
      expect(info.domain).toBeUndefined();
      expect(info.removalVersion).toBeUndefined();
    });

    it('listDeprecatedTools should return all 9 deprecated tools', () => {
      const tools = listDeprecatedTools();

      expect(tools).toHaveLength(9);
      expect(tools[0]).toMatchObject({
        oldName: 'test_coverage_detailed',
        newName: 'analyzeCoverageWithRiskScoring',
        domain: 'coverage',
        removalVersion: 'v3.0.0 (February 2026)'
      });
    });
  });

  describe('Tool Metadata', () => {
    it('all deprecated tools should have [DEPRECATED] prefix in description', () => {
      expect(test_coverage_detailed.description).toContain('[DEPRECATED]');
      expect(test_coverage_gaps.description).toContain('[DEPRECATED]');
      expect(flaky_test_detect.description).toContain('[DEPRECATED]');
      expect(flaky_test_patterns.description).toContain('[DEPRECATED]');
      expect(flaky_test_stabilize.description).toContain('[DEPRECATED]');
      expect(performance_benchmark_run.description).toContain('[DEPRECATED]');
      expect(performance_monitor_realtime.description).toContain('[DEPRECATED]');
      expect(security_scan_comprehensive.description).toContain('[DEPRECATED]');
      expect(visual_test_regression.description).toContain('[DEPRECATED]');
    });

    it('all deprecated tools should have correct names', () => {
      expect(test_coverage_detailed.name).toBe('test_coverage_detailed');
      expect(test_coverage_gaps.name).toBe('test_coverage_gaps');
      expect(flaky_test_detect.name).toBe('flaky_test_detect');
      expect(flaky_test_patterns.name).toBe('flaky_test_patterns');
      expect(flaky_test_stabilize.name).toBe('flaky_test_stabilize');
      expect(performance_benchmark_run.name).toBe('performance_benchmark_run');
      expect(performance_monitor_realtime.name).toBe('performance_monitor_realtime');
      expect(security_scan_comprehensive.name).toBe('security_scan_comprehensive');
      expect(visual_test_regression.name).toBe('visual_test_regression');
    });

    it('all deprecated tools should have Zod schemas', () => {
      expect(test_coverage_detailed.schema).toBeDefined();
      expect(test_coverage_gaps.schema).toBeDefined();
      expect(flaky_test_detect.schema).toBeDefined();
      expect(flaky_test_patterns.schema).toBeDefined();
      expect(flaky_test_stabilize.schema).toBeDefined();
      expect(performance_benchmark_run.schema).toBeDefined();
      expect(performance_monitor_realtime.schema).toBeDefined();
      expect(security_scan_comprehensive.schema).toBeDefined();
      expect(visual_test_regression.schema).toBeDefined();
    });
  });

  describe('Parameter Forwarding', () => {
    it('should forward parameters correctly to new tools', async () => {
      const params = {
        source_dirs: ['src', 'lib'],
        test_dirs: ['tests'],
        framework: 'jest' as const,
        risk_threshold: 0.7
      };

      const mockHandler = vi.fn().mockResolvedValue({ status: 'success' });
      test_coverage_detailed.handler = mockHandler;

      await test_coverage_detailed.handler(params);

      expect(mockHandler).toHaveBeenCalledWith(params);
    });
  });
});
