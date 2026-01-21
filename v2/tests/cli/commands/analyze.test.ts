/**
 * Tests for Analyze Command - CLI Module
 * Complete coverage for analysis functionality and edge cases
 */

import { AnalyzeCommand } from '@cli/commands/analyze';
import { AnalyzeOptions } from '@types';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('chalk', () => ({
  blue: { bold: (str: string) => str },
  green: (str: string) => str,
  red: (str: string) => str,
  yellow: (str: string) => str,
  gray: (str: string) => str
}));

jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: ''
  }))
}));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('AnalyzeCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(true);
    mockedFs.readdir.mockResolvedValue(['execution-2023-01-01.json', 'coverage-2023-01-01.json']);
    mockedFs.readJson.mockResolvedValue({
      timestamp: '2023-01-01T12:00:00Z',
      summary: { total: 100, passed: 95, failed: 5, duration: 5000 },
      coverage: { overall: 85, details: { 'file1.js': 90, 'file2.js': 80 } },
      errors: []
    });
    mockedFs.ensureDir.mockResolvedValue();
    mockedFs.writeJson.mockResolvedValue();
    mockedFs.writeFile.mockResolvedValue();
    mockedFs.chmod.mockResolvedValue();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('Input Validation', () => {
    it('should validate analysis target', async () => {
      const options: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('invalid-target', options);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Analysis failed:'),
        expect.stringContaining('Invalid target')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should validate output format', async () => {
      const options: AnalyzeOptions = {
        format: 'invalid-format' as any,
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', options);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Analysis failed:'),
        expect.stringContaining('Invalid format')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should validate threshold range', async () => {
      const options: AnalyzeOptions = {
        format: 'json',
        threshold: '150',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', options);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Analysis failed:'),
        expect.stringContaining('Threshold must be between 0 and 100')
      );
    });

    it('should handle negative threshold', async () => {
      const options: AnalyzeOptions = {
        format: 'json',
        threshold: '-10',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', options);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should check for reports directory existence', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      const options: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', options);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Analysis failed:'),
        expect.stringContaining('No test execution reports found')
      );
    });
  });

  describe('Coverage Analysis', () => {
    const validOptions: AnalyzeOptions = {
      format: 'json',
      threshold: '80',
      period: '7d',
      gaps: false,
      verbose: false
    };

    beforeEach(() => {
      mockedFs.readJson.mockResolvedValue({
        timestamp: '2023-01-01T12:00:00Z',
        summary: { total: 100, passed: 95, failed: 5, duration: 5000 },
        coverage: { overall: 85, details: { 'file1.js': 90, 'file2.js': 70 } },
        errors: []
      });
    });

    it('should perform coverage analysis successfully', async () => {
      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockedFs.readdir).toHaveBeenCalledWith('.agentic-qe/reports');
      expect(mockedFs.readJson).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📊 Analysis Summary:')
      );
    });

    it('should calculate coverage trends with historical data', async () => {
      // Mock multiple historical files
      mockedFs.readdir.mockResolvedValue([
        'execution-2023-01-03.json',
        'execution-2023-01-02.json',
        'execution-2023-01-01.json'
      ]);

      const historicalData = [
        { coverage: { overall: 87 }, summary: { total: 100, passed: 96, failed: 4 } },
        { coverage: { overall: 85 }, summary: { total: 100, passed: 95, failed: 5 } },
        { coverage: { overall: 83 }, summary: { total: 100, passed: 94, failed: 6 } }
      ];

      mockedFs.readJson
        .mockResolvedValueOnce(historicalData[0])
        .mockResolvedValueOnce(historicalData[0])
        .mockResolvedValueOnce(historicalData[1])
        .mockResolvedValueOnce(historicalData[2]);

      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Trend: improving')
      );
    });

    it('should identify low coverage files when gaps enabled', async () => {
      const optionsWithGaps: AnalyzeOptions = { ...validOptions, gaps: true };

      await AnalyzeCommand.execute('coverage', optionsWithGaps);

      expect(mockedFs.pathExists).toHaveBeenCalledWith('tests/unit');
      expect(mockedFs.pathExists).toHaveBeenCalledWith('tests/integration');
      expect(mockedFs.pathExists).toHaveBeenCalledWith('tests/e2e');
    });

    it('should generate recommendations for low coverage', async () => {
      mockedFs.readJson.mockResolvedValue({
        coverage: { overall: 65 }, // Below threshold
        summary: { total: 100, passed: 95, failed: 5 }
      });

      await AnalyzeCommand.execute('coverage', { ...validOptions, threshold: '80' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('💡 Top Recommendations:')
      );
    });
  });

  describe('Quality Analysis', () => {
    const validOptions: AnalyzeOptions = {
      format: 'json',
      threshold: '80',
      period: '7d',
      gaps: false,
      verbose: false
    };

    it('should perform quality analysis successfully', async () => {
      await AnalyzeCommand.execute('quality', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📊 Analysis Summary:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Pass Rate:')
      );
    });

    it('should calculate test reliability from historical data', async () => {
      const historicalData = Array(10).fill(0).map((_, i) => ({
        summary: { total: 100, passed: 95 + (i % 3), failed: 5 - (i % 3) }
      }));

      mockedFs.readdir.mockResolvedValue(
        historicalData.map((_, i) => `execution-${i}.json`)
      );

      historicalData.forEach(data => {
        mockedFs.readJson.mockResolvedValueOnce(data);
      });

      await AnalyzeCommand.execute('quality', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Quality Score:')
      );
    });

    it('should identify flaky tests', async () => {
      // Mock data with high variance in pass rates
      const flakyData = [
        { summary: { total: 100, passed: 100, failed: 0 } },
        { summary: { total: 100, passed: 85, failed: 15 } },
        { summary: { total: 100, passed: 95, failed: 5 } },
        { summary: { total: 100, passed: 80, failed: 20 } }
      ];

      mockedFs.readdir.mockResolvedValue(
        flakyData.map((_, i) => `execution-${i}.json`)
      );

      flakyData.forEach(data => {
        mockedFs.readJson.mockResolvedValueOnce(data);
      });

      await AnalyzeCommand.execute('quality', validOptions);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should detect critical quality issues', async () => {
      mockedFs.readJson.mockResolvedValue({
        summary: { total: 100, passed: 70, failed: 30 }, // Low pass rate
        errors: ['Error 1', 'Error 2', 'Error 3']
      });

      await AnalyzeCommand.execute('quality', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Critical Issues:')
      );
    });
  });

  describe('Trends Analysis', () => {
    const validOptions: AnalyzeOptions = {
      format: 'json',
      threshold: '80',
      period: '30d',
      gaps: false,
      verbose: false
    };

    it('should analyze trends over time', async () => {
      const trendData = Array(20).fill(0).map((_, i) => ({
        timestamp: new Date(2023, 0, i + 1).toISOString(),
        coverage: { overall: 80 + i },
        summary: { total: 100, passed: 95, failed: 5, duration: 5000 + i * 100 }
      }));

      mockedFs.readdir.mockResolvedValue(
        trendData.map((_, i) => `execution-${i}.json`)
      );

      trendData.forEach(data => {
        mockedFs.readJson.mockResolvedValueOnce(data);
      });

      await AnalyzeCommand.execute('trends', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📊 Analysis Summary:')
      );
    });

    it('should generate insights from trend data', async () => {
      const improvingTrends = Array(10).fill(0).map((_, i) => ({
        timestamp: new Date(2023, 0, i + 1).toISOString(),
        coverage: { overall: 70 + i * 2 }, // Improving coverage
        summary: { total: 100, passed: 90 + i, failed: 10 - i, duration: 5000 }
      }));

      mockedFs.readdir.mockResolvedValue(
        improvingTrends.map((_, i) => `execution-${i}.json`)
      );

      improvingTrends.forEach(data => {
        mockedFs.readJson.mockResolvedValueOnce(data);
      });

      await AnalyzeCommand.execute('trends', validOptions);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should make predictions based on trends', async () => {
      await AnalyzeCommand.execute('trends', validOptions);

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('analysis-trends-'),
        expect.objectContaining({
          analysis: expect.objectContaining({
            predictions: expect.any(Array)
          })
        }),
        { spaces: 2 }
      );
    });
  });

  describe('Gap Analysis', () => {
    const validOptions: AnalyzeOptions = {
      format: 'json',
      threshold: '80',
      period: '7d',
      gaps: true,
      verbose: false
    };

    it('should identify missing test types', async () => {
      mockedFs.pathExists
        .mockResolvedValueOnce(true)  // reports dir exists
        .mockResolvedValueOnce(true)  // unit tests exist
        .mockResolvedValueOnce(false) // integration tests missing
        .mockResolvedValueOnce(false) // e2e tests missing
        .mockResolvedValueOnce(false) // performance tests missing
        .mockResolvedValueOnce(false); // security tests missing

      await AnalyzeCommand.execute('gaps', validOptions);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should identify configuration gaps', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path === '.agentic-qe/reports') return Promise.resolve(true);
        if (path.includes('jest.config')) return Promise.resolve(false);
        if (path.includes('cypress.json')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await AnalyzeCommand.execute('gaps', validOptions);

      expect(mockedFs.pathExists).toHaveBeenCalledWith('jest.config.js');
      expect(mockedFs.pathExists).toHaveBeenCalledWith('cypress.json');
    });

    it('should identify quality gaps from test data', async () => {
      mockedFs.readJson.mockResolvedValue({
        summary: { total: 100, passed: 85, failed: 15 },
        errors: ['Timeout error', 'Network error'],
        coverage: { overall: 75 }
      });

      await AnalyzeCommand.execute('gaps', validOptions);

      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe('Comprehensive Analysis', () => {
    const validOptions: AnalyzeOptions = {
      format: 'json',
      threshold: '85',
      period: '14d',
      gaps: true,
      verbose: false
    };

    it('should perform comprehensive analysis with all components', async () => {
      await AnalyzeCommand.execute('all', validOptions);

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('analysis-comprehensive-'),
        expect.objectContaining({
          analysis: expect.objectContaining({
            type: 'comprehensive',
            coverage: expect.any(Object),
            quality: expect.any(Object),
            trends: expect.any(Object),
            gaps: expect.any(Object),
            summary: expect.objectContaining({
              overallScore: expect.any(Number),
              criticalIssues: expect.any(Array),
              topRecommendations: expect.any(Array)
            })
          })
        }),
        { spaces: 2 }
      );
    });

    it('should prioritize recommendations by severity', async () => {
      mockedFs.readJson.mockResolvedValue({
        summary: { total: 100, passed: 60, failed: 40 }, // Critical quality issue
        coverage: { overall: 45 }, // Critical coverage issue
        errors: ['Critical error 1', 'Critical error 2']
      });

      await AnalyzeCommand.execute('all', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Critical Issues:')
      );
    });
  });

  describe('Report Generation', () => {
    const validOptions: AnalyzeOptions = {
      format: 'html',
      threshold: '80',
      period: '7d',
      gaps: false,
      verbose: false
    };

    it('should generate HTML reports', async () => {
      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.html'),
        expect.stringContaining('<!DOCTYPE html>')
      );
    });

    it('should generate CSV reports for trends', async () => {
      await AnalyzeCommand.execute('trends', { ...validOptions, format: 'csv' });

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('trends-'),
        expect.stringContaining('Timestamp,Coverage,PassRate')
      );
    });

    it('should handle all format types', async () => {
      const formats: Array<AnalyzeOptions['format']> = ['json', 'html', 'csv'];

      for (const format of formats) {
        jest.clearAllMocks();
        await AnalyzeCommand.execute('coverage', { ...validOptions, format });

        if (format === 'json' || format === 'all') {
          expect(mockedFs.writeJson).toHaveBeenCalled();
        }
        if (format === 'html' || format === 'all') {
          expect(mockedFs.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('.html'),
            expect.any(String)
          );
        }
      }
    });
  });

  describe('Coordination Integration', () => {
    it('should store analysis results in coordination memory', async () => {
      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        '.agentic-qe/scripts/store-analysis-results.sh',
        expect.stringContaining('npx claude-flow@alpha memory store')
      );
      expect(mockedFs.chmod).toHaveBeenCalledWith(
        '.agentic-qe/scripts/store-analysis-results.sh',
        '755'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Analysis failed:'),
        'Permission denied'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should show stack trace in verbose mode', async () => {
      mockedFs.readJson.mockRejectedValue(new Error('JSON parse error'));

      const verboseOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: true
      };

      await AnalyzeCommand.execute('coverage', verboseOptions);

      expect(mockConsoleError).toHaveBeenCalledTimes(2); // Error message + stack trace
    });

    it('should handle empty reports directory', async () => {
      mockedFs.readdir.mockResolvedValue([]);

      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Analysis failed:'),
        'No test execution reports found'
      );
    });

    it('should handle corrupted JSON files', async () => {
      mockedFs.readJson.mockRejectedValue(new Error('Unexpected end of JSON input'));

      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero test results', async () => {
      mockedFs.readJson.mockResolvedValue({
        summary: { total: 0, passed: 0, failed: 0, duration: 0 },
        coverage: { overall: 0, details: {} },
        errors: []
      });

      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('quality', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Pass Rate: 0.0%')
      );
    });

    it('should handle missing coverage data', async () => {
      mockedFs.readJson.mockResolvedValue({
        summary: { total: 100, passed: 95, failed: 5 },
        // Missing coverage field
        errors: []
      });

      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      await AnalyzeCommand.execute('coverage', validOptions);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Coverage: 0.0%')
      );
    });

    it('should handle very large datasets efficiently', async () => {
      const largeDataset = Array(1000).fill(0).map((_, i) => `execution-${i}.json`);
      mockedFs.readdir.mockResolvedValue(largeDataset);

      const validOptions: AnalyzeOptions = {
        format: 'json',
        threshold: '80',
        period: '7d',
        gaps: false,
        verbose: false
      };

      const startTime = Date.now();
      await AnalyzeCommand.execute('trends', validOptions);
      const endTime = Date.now();

      // Should process within reasonable time even with large datasets
      expect(endTime - startTime).toBeLessThan(5000);
      // Should limit to 30 most recent files
      expect(mockedFs.readJson).toHaveBeenCalledTimes(30);
    });
  });
});