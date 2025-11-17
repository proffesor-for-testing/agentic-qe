/**
 * Unit Tests for Client-Side Data Filtering Layer (QW-1)
 *
 * Tests cover:
 * - Basic filtering functionality
 * - Priority calculation utilities
 * - Edge cases (empty data, invalid config)
 * - Metrics aggregation
 * - Performance characteristics
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect } from '@jest/globals';
import {
  filterLargeDataset,
  countByPriority,
  calculateMetrics,
  calculateCoveragePriority,
  calculatePerformancePriority,
  calculateQualityPriority,
  calculateSecurityPriority,
  calculateFlakyPriority,
  createFilterSummary,
  FilterConfig,
  PriorityLevel
} from '../../src/utils/filtering.js';

// Test data types
interface CoverageFile {
  file: string;
  coverage: number;
  lines: number;
}

interface PerformanceMetric {
  endpoint: string;
  responseTime: number;
  requests: number;
}

interface QualityIssue {
  file: string;
  score: number;
  severity: string;
}

describe('filterLargeDataset', () => {
  describe('basic filtering', () => {
    it('should filter and return top N items', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 },
        { file: 'b.ts', coverage: 92, lines: 150 },
        { file: 'c.ts', coverage: 67, lines: 200 },
        { file: 'd.ts', coverage: 23, lines: 80 },
        { file: 'e.ts', coverage: 88, lines: 120 }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 3, threshold: 80 },
        (file) => calculateCoveragePriority(file.coverage, 80),
        (a, b) => a.coverage - b.coverage, // Sort by worst first
        (file) => file.coverage
      );

      expect(result.summary.total).toBe(5);
      expect(result.summary.returned).toBe(3);
      expect(result.topItems).toHaveLength(3);
      expect(result.topItems[0].file).toBe('d.ts'); // Worst coverage first
      expect(result.summary.reductionPercent).toBeGreaterThan(0);
    });

    it('should filter by priority levels', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 }, // high (40 < 45 < 60, i.e., 80*0.5 < 45 < 80*0.75)
        { file: 'b.ts', coverage: 92, lines: 150 }, // low (>= 80)
        { file: 'c.ts', coverage: 30, lines: 200 }, // critical (< 40, i.e., < 80*0.5)
        { file: 'd.ts', coverage: 20, lines: 80 },  // critical (< 40, i.e., < 80*0.5)
        { file: 'e.ts', coverage: 88, lines: 120 }  // low (>= 80)
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10, priorities: ['critical', 'high'], threshold: 80 },
        (file) => calculateCoveragePriority(file.coverage, 80),
        (a, b) => a.coverage - b.coverage,
        (file) => file.coverage
      );

      expect(result.summary.total).toBe(5);
      expect(result.summary.filtered).toBe(3); // 2 critical + 1 high
      expect(result.topItems).toHaveLength(3);
      expect(result.topItems.every(item =>
        ['critical', 'high'].includes(calculateCoveragePriority(item.coverage, 80))
      )).toBe(true);
    });

    it('should use default priority-based sorting when no sortFn provided', () => {
      const data: QualityIssue[] = [
        { file: 'a.ts', score: 45, severity: 'medium' },
        { file: 'b.ts', score: 20, severity: 'critical' },
        { file: 'c.ts', score: 65, severity: 'high' },
        { file: 'd.ts', score: 30, severity: 'high' }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10 },
        (issue) => calculateSecurityPriority(issue.severity)
      );

      // Should be sorted by priority: critical first, then high, then medium
      expect(result.topItems[0].severity).toBe('critical');
      expect(result.topItems[1].severity).toBe('high');
      expect(result.topItems[2].severity).toBe('high');
      expect(result.topItems[3].severity).toBe('medium');
    });
  });

  describe('metrics aggregation', () => {
    it('should calculate priority distribution', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 }, // high (40 < 45 < 60)
        { file: 'b.ts', coverage: 92, lines: 150 }, // low (>= 80)
        { file: 'c.ts', coverage: 30, lines: 200 }, // critical (< 40)
        { file: 'd.ts', coverage: 20, lines: 80 },  // critical (< 40)
        { file: 'e.ts', coverage: 88, lines: 120 }  // low (>= 80)
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10, includeMetrics: true },
        (file) => calculateCoveragePriority(file.coverage, 80),
        undefined,
        (file) => file.coverage
      );

      expect(result.metrics.priorityDistribution.critical).toBe(2);
      expect(result.metrics.priorityDistribution.high).toBe(1);
      expect(result.metrics.priorityDistribution.medium).toBe(0);
      expect(result.metrics.priorityDistribution.low).toBe(2);
    });

    it('should calculate numeric statistics when valueFn provided', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 },
        { file: 'b.ts', coverage: 92, lines: 150 },
        { file: 'c.ts', coverage: 67, lines: 200 },
        { file: 'd.ts', coverage: 23, lines: 80 },
        { file: 'e.ts', coverage: 88, lines: 120 }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10, includeMetrics: true },
        (file) => calculateCoveragePriority(file.coverage, 80),
        undefined,
        (file) => file.coverage
      );

      const avgCoverage = (45 + 92 + 67 + 23 + 88) / 5; // 63
      expect(result.metrics.avgValue).toBeCloseTo(avgCoverage, 1);
      expect(result.metrics.min).toBe(23);
      expect(result.metrics.max).toBe(92);
      expect(result.metrics.stdDev).toBeGreaterThan(0);
    });

    it('should not calculate numeric stats when valueFn not provided', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10, includeMetrics: true },
        (file) => calculateCoveragePriority(file.coverage, 80)
        // No valueFn
      );

      expect(result.metrics.avgValue).toBeUndefined();
      expect(result.metrics.stdDev).toBeUndefined();
      expect(result.metrics.priorityDistribution).toBeDefined();
    });

    it('should disable metrics when includeMetrics is false', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10, includeMetrics: false },
        (file) => calculateCoveragePriority(file.coverage, 80),
        undefined,
        (file) => file.coverage
      );

      expect(result.metrics.avgValue).toBeUndefined();
      expect(result.metrics.stdDev).toBeUndefined();
      expect(result.metrics.priorityDistribution).toBeDefined(); // Always included
    });
  });

  describe('edge cases', () => {
    it('should handle empty dataset', () => {
      const result = filterLargeDataset(
        [],
        { topN: 10 },
        () => 'low' as PriorityLevel
      );

      expect(result.summary.total).toBe(0);
      expect(result.summary.filtered).toBe(0);
      expect(result.summary.returned).toBe(0);
      expect(result.topItems).toEqual([]);
      expect(result.metrics.priorityDistribution.low).toBe(0);
    });

    it('should handle dataset smaller than topN', () => {
      const data: CoverageFile[] = [
        { file: 'a.ts', coverage: 45, lines: 100 },
        { file: 'b.ts', coverage: 92, lines: 150 }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10 },
        (file) => calculateCoveragePriority(file.coverage, 80)
      );

      expect(result.summary.total).toBe(2);
      expect(result.summary.returned).toBe(2);
      expect(result.topItems).toHaveLength(2);
    });

    it('should throw error for invalid data type', () => {
      expect(() => {
        filterLargeDataset(
          'not an array' as any,
          { topN: 10 },
          () => 'low' as PriorityLevel
        );
      }).toThrow('Data must be an array');
    });

    it('should throw error for missing priorityFn', () => {
      expect(() => {
        filterLargeDataset(
          [],
          { topN: 10 },
          undefined as any
        );
      }).toThrow('priorityFn must be a function');
    });

    it('should use default topN value of 10', () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        file: `file-${i}.ts`,
        coverage: 50,
        lines: 100
      }));

      const result = filterLargeDataset(
        data,
        {}, // No topN specified
        () => 'low' as PriorityLevel
      );

      expect(result.summary.returned).toBe(10); // Default
    });

    it('should handle items with NaN or undefined values', () => {
      const data = [
        { file: 'a.ts', coverage: 45 },
        { file: 'b.ts', coverage: NaN },
        { file: 'c.ts', coverage: undefined as any },
        { file: 'd.ts', coverage: 67 }
      ];

      const result = filterLargeDataset(
        data,
        { topN: 10, includeMetrics: true },
        () => 'low' as PriorityLevel,
        undefined,
        (item) => item.coverage
      );

      // Should only calculate stats for valid numbers
      expect(result.metrics.avgValue).toBeCloseTo((45 + 67) / 2, 1);
    });
  });

  describe('reduction percentage calculation', () => {
    it('should calculate realistic token reduction', () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({
        file: `file-${i}.ts`,
        coverage: 50 + Math.random() * 40,
        lines: 100
      }));

      const result = filterLargeDataset(
        data,
        { topN: 10 },
        (file) => calculateCoveragePriority(file.coverage, 80)
      );

      // 1000 items * 500 tokens = 500,000 tokens
      // 10 items * 50 tokens + 200 = 700 tokens
      // Reduction: ~99.86%
      expect(result.summary.reductionPercent).toBeGreaterThan(98);
      expect(result.summary.reductionPercent).toBeLessThanOrEqual(100);
    });
  });
});

describe('countByPriority', () => {
  it('should count items by priority level', () => {
    const data: CoverageFile[] = [
      { file: 'a.ts', coverage: 45, lines: 100 }, // high (40 < 45 < 60)
      { file: 'b.ts', coverage: 92, lines: 150 }, // low (>= 80)
      { file: 'c.ts', coverage: 30, lines: 200 }, // critical (< 40)
      { file: 'd.ts', coverage: 20, lines: 80 },  // critical (< 40)
      { file: 'e.ts', coverage: 88, lines: 120 }  // low (>= 80)
    ];

    const distribution = countByPriority(
      data,
      (file) => calculateCoveragePriority(file.coverage, 80)
    );

    expect(distribution.critical).toBe(2);
    expect(distribution.high).toBe(1);
    expect(distribution.medium).toBe(0);
    expect(distribution.low).toBe(2);
  });

  it('should return zero counts for empty dataset', () => {
    const distribution = countByPriority([], () => 'low' as PriorityLevel);

    expect(distribution.critical).toBe(0);
    expect(distribution.high).toBe(0);
    expect(distribution.medium).toBe(0);
    expect(distribution.low).toBe(0);
  });
});

describe('calculateMetrics', () => {
  it('should calculate complete metrics with valueFn', () => {
    const data = [
      { value: 10 },
      { value: 20 },
      { value: 30 },
      { value: 40 },
      { value: 50 }
    ];

    const metrics = calculateMetrics(
      data,
      () => 'low' as PriorityLevel,
      (item) => item.value
    );

    expect(metrics.avgValue).toBe(30);
    expect(metrics.min).toBe(10);
    expect(metrics.max).toBe(50);
    expect(metrics.stdDev).toBeGreaterThan(0);
  });

  it('should handle empty values array gracefully', () => {
    const data = [
      { value: NaN },
      { value: undefined }
    ];

    const metrics = calculateMetrics(
      data,
      () => 'low' as PriorityLevel,
      (item) => item.value as number
    );

    expect(metrics.avgValue).toBeUndefined();
    expect(metrics.stdDev).toBeUndefined();
    expect(metrics.min).toBeUndefined();
    expect(metrics.max).toBeUndefined();
  });
});

describe('priority calculation utilities', () => {
  describe('calculateCoveragePriority', () => {
    it('should classify coverage correctly', () => {
      const threshold = 80;

      expect(calculateCoveragePriority(30, threshold)).toBe('critical'); // < 40
      expect(calculateCoveragePriority(50, threshold)).toBe('high');      // 40-60
      expect(calculateCoveragePriority(70, threshold)).toBe('medium');    // 60-80
      expect(calculateCoveragePriority(90, threshold)).toBe('low');       // >= 80
    });

    it('should use default threshold of 80', () => {
      expect(calculateCoveragePriority(30)).toBe('critical');
      expect(calculateCoveragePriority(50)).toBe('high');
      expect(calculateCoveragePriority(70)).toBe('medium');
      expect(calculateCoveragePriority(90)).toBe('low');
    });
  });

  describe('calculatePerformancePriority', () => {
    it('should classify response times correctly', () => {
      const threshold = 200;

      expect(calculatePerformancePriority(1200, threshold)).toBe('critical'); // > 1000 (5x)
      expect(calculatePerformancePriority(600, threshold)).toBe('high');      // 500-1000 (2.5x-5x)
      expect(calculatePerformancePriority(300, threshold)).toBe('medium');    // 200-500
      expect(calculatePerformancePriority(100, threshold)).toBe('low');       // < 200
    });

    it('should use default threshold of 200ms', () => {
      expect(calculatePerformancePriority(1200)).toBe('critical');
      expect(calculatePerformancePriority(600)).toBe('high');
      expect(calculatePerformancePriority(300)).toBe('medium');
      expect(calculatePerformancePriority(100)).toBe('low');
    });
  });

  describe('calculateQualityPriority', () => {
    it('should classify quality scores correctly', () => {
      const threshold = 70;

      expect(calculateQualityPriority(20, threshold)).toBe('critical'); // < 35
      expect(calculateQualityPriority(45, threshold)).toBe('high');     // 35-52.5
      expect(calculateQualityPriority(60, threshold)).toBe('medium');   // 52.5-70
      expect(calculateQualityPriority(85, threshold)).toBe('low');      // >= 70
    });

    it('should use default threshold of 70', () => {
      expect(calculateQualityPriority(20)).toBe('critical');
      expect(calculateQualityPriority(45)).toBe('high');
      expect(calculateQualityPriority(60)).toBe('medium');
      expect(calculateQualityPriority(85)).toBe('low');
    });
  });

  describe('calculateSecurityPriority', () => {
    it('should map severity to priority', () => {
      expect(calculateSecurityPriority('critical')).toBe('critical');
      expect(calculateSecurityPriority('high')).toBe('high');
      expect(calculateSecurityPriority('medium')).toBe('medium');
      expect(calculateSecurityPriority('low')).toBe('low');
    });

    it('should handle case insensitivity', () => {
      expect(calculateSecurityPriority('CRITICAL')).toBe('critical');
      expect(calculateSecurityPriority('High')).toBe('high');
      expect(calculateSecurityPriority('MeDiUm')).toBe('medium');
    });

    it('should default to low for unknown severities', () => {
      expect(calculateSecurityPriority('unknown')).toBe('low');
      expect(calculateSecurityPriority('')).toBe('low');
    });
  });

  describe('calculateFlakyPriority', () => {
    it('should classify flaky rates correctly', () => {
      expect(calculateFlakyPriority(60)).toBe('critical'); // > 50%
      expect(calculateFlakyPriority(35)).toBe('high');     // 25-50%
      expect(calculateFlakyPriority(15)).toBe('medium');   // 10-25%
      expect(calculateFlakyPriority(5)).toBe('low');       // < 10%
    });
  });
});

describe('createFilterSummary', () => {
  it('should generate human-readable summary', () => {
    const data: CoverageFile[] = [
      { file: 'a.ts', coverage: 45, lines: 100 },
      { file: 'b.ts', coverage: 92, lines: 150 },
      { file: 'c.ts', coverage: 67, lines: 200 },
      { file: 'd.ts', coverage: 23, lines: 80 },
      { file: 'e.ts', coverage: 88, lines: 120 }
    ];

    const result = filterLargeDataset(
      data,
      { topN: 3, priorities: ['critical', 'high', 'medium'] },
      (file) => calculateCoveragePriority(file.coverage, 80),
      (a, b) => a.coverage - b.coverage,
      (file) => file.coverage
    );

    const summary = createFilterSummary(result, 'files');

    expect(summary).toContain('Analyzed 5 files');
    expect(summary).toContain('Token reduction:');
    expect(summary).toContain('Priority distribution:');
    expect(summary).toContain('Average:');
  });

  it('should use default entity name', () => {
    const result = filterLargeDataset(
      [{ x: 1 }],
      { topN: 1 },
      () => 'low' as PriorityLevel
    );

    const summary = createFilterSummary(result); // No entity name

    expect(summary).toContain('items'); // Default
  });

  it('should handle empty priority distribution', () => {
    const result = filterLargeDataset(
      [],
      { topN: 10 },
      () => 'low' as PriorityLevel
    );

    const summary = createFilterSummary(result, 'tests');

    expect(summary).toContain('Analyzed 0 tests');
    expect(summary).not.toContain('Priority distribution:'); // Empty
  });
});

describe('performance characteristics', () => {
  it('should handle large datasets efficiently', () => {
    const startTime = Date.now();

    // 10,000 items
    const data = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      value: Math.random() * 100
    }));

    const result = filterLargeDataset(
      data,
      { topN: 10, includeMetrics: true },
      (item) => item.value < 25 ? 'critical' : item.value < 50 ? 'high' : item.value < 75 ? 'medium' : 'low',
      (a, b) => a.value - b.value,
      (item) => item.value
    );

    const duration = Date.now() - startTime;

    expect(result.summary.total).toBe(10000);
    expect(result.summary.returned).toBe(10);
    expect(duration).toBeLessThan(1000); // Should complete in < 1s
  });

  it('should demonstrate token reduction on realistic coverage data', () => {
    // Simulate realistic coverage report with 1000 files
    const data = Array.from({ length: 1000 }, (_, i) => ({
      file: `src/module-${Math.floor(i / 10)}/file-${i}.ts`,
      coverage: 30 + Math.random() * 60, // 30-90%
      lines: 50 + Math.floor(Math.random() * 200),
      functions: 5 + Math.floor(Math.random() * 20),
      branches: 10 + Math.floor(Math.random() * 30)
    }));

    const result = filterLargeDataset(
      data,
      { topN: 10, priorities: ['critical', 'high'], threshold: 80 },
      (file) => calculateCoveragePriority(file.coverage, 80),
      (a, b) => a.coverage - b.coverage,
      (file) => file.coverage
    );

    // Original: 1000 files * ~500 tokens = 500,000 tokens
    // Filtered: 10 files * ~50 tokens + summary = ~700 tokens
    // Reduction: 99.86%
    expect(result.summary.reductionPercent).toBeGreaterThan(98);
    expect(result.summary.returned).toBeLessThanOrEqual(10);
    expect(result.metrics.priorityDistribution.critical).toBeGreaterThanOrEqual(0);
  });
});
