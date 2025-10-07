import * as fs from 'fs/promises';
import * as path from 'path';

export interface ComparisonResult {
  [metric: string]: {
    baseline: number;
    current: number;
    change: number;
    percentChange: number;
    significant: boolean;
  };
}

export interface ComparisonOptions {
  threshold?: number;
  significanceLevel?: number;
}

export interface Period {
  name: string;
  metrics: Record<string, number[]>;
}

export interface MultiPeriodComparison {
  trend: 'increasing' | 'decreasing' | 'stable';
  periods: {
    name: string;
    average: Record<string, number>;
  }[];
  overallChange: Record<string, number>;
}

export class MonitorCompare {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async compare(
    baseline: Record<string, number[]>,
    current: Record<string, number[]>,
    options?: ComparisonOptions
  ): Promise<ComparisonResult> {
    const threshold = options?.threshold ?? 10;
    const result: ComparisonResult = {};

    // Get common metrics
    const metrics = Object.keys(baseline).filter(key => key in current);

    for (const metric of metrics) {
      const baselineAvg = this.average(baseline[metric]);
      const currentAvg = this.average(current[metric]);
      const change = currentAvg - baselineAvg;
      const percentChange = (change / baselineAvg) * 100;
      const significant = Math.abs(percentChange) >= threshold;

      result[metric] = {
        baseline: baselineAvg,
        current: currentAvg,
        change,
        percentChange,
        significant,
      };
    }

    return result;
  }

  async visualize(
    baseline: Record<string, number[]>,
    current: Record<string, number[]>
  ): Promise<string> {
    const comparison = await this.compare(baseline, current);
    const lines: string[] = [];

    lines.push('╔════════════════════════════════════════════════════╗');
    lines.push('║           METRIC COMPARISON REPORT                 ║');
    lines.push('╠════════════════════════════════════════════════════╣');

    for (const [metric, data] of Object.entries(comparison)) {
      lines.push(`║ ${metric.toUpperCase().padEnd(48)} ║`);
      lines.push('╟────────────────────────────────────────────────────╢');

      // Baseline bar
      const baselineBar = this.createBar(data.baseline, 100, 30, '█');
      lines.push(`║ Baseline: ${baselineBar} ${data.baseline.toFixed(1).padStart(6)} ║`);

      // Current bar
      const currentBar = this.createBar(data.current, 100, 30, '█');
      lines.push(`║ Current:  ${currentBar} ${data.current.toFixed(1).padStart(6)} ║`);

      // Change indicator
      const changeSign = data.change >= 0 ? '+' : '';
      const changeIndicator = data.significant ? ' ⚠️ ' : '   ';
      lines.push(`║ Change:   ${changeSign}${data.change.toFixed(1).padStart(5)} (${changeSign}${data.percentChange.toFixed(1)}%)${changeIndicator} ║`);
      lines.push('╟────────────────────────────────────────────────────╢');
    }

    lines.push('╚════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  async compareMultiple(periods: Period[]): Promise<MultiPeriodComparison> {
    if (periods.length < 2) {
      throw new Error('At least 2 periods required for comparison');
    }

    const result: MultiPeriodComparison = {
      trend: 'stable',
      periods: [],
      overallChange: {},
    };

    // Calculate averages for each period
    for (const period of periods) {
      const averages: Record<string, number> = {};

      for (const [metric, values] of Object.entries(period.metrics)) {
        if (Array.isArray(values)) {
          averages[metric] = this.average(values);
        }
      }

      result.periods.push({
        name: period.name,
        average: averages,
      });
    }

    // Determine overall trend
    const firstPeriod = result.periods[0];
    const lastPeriod = result.periods[result.periods.length - 1];

    // Calculate overall change for each metric
    for (const metric of Object.keys(firstPeriod.average)) {
      const first = firstPeriod.average[metric];
      const last = lastPeriod.average[metric];
      result.overallChange[metric] = ((last - first) / first) * 100;
    }

    // Determine predominant trend
    const avgChange = Object.values(result.overallChange).reduce((a, b) => a + b, 0) /
                      Object.values(result.overallChange).length;

    if (avgChange > 5) {
      result.trend = 'increasing';
    } else if (avgChange < -5) {
      result.trend = 'decreasing';
    } else {
      result.trend = 'stable';
    }

    return result;
  }

  private average(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private createBar(value: number, max: number, width: number, char: string): string {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    return char.repeat(filled) + '░'.repeat(empty);
  }

  async compareWithThreshold(
    baseline: Record<string, number[]>,
    current: Record<string, number[]>,
    thresholds: Record<string, number>
  ): Promise<Record<string, boolean>> {
    const comparison = await this.compare(baseline, current);
    const results: Record<string, boolean> = {};

    for (const [metric, data] of Object.entries(comparison)) {
      const threshold = thresholds[metric] ?? 10;
      results[metric] = Math.abs(data.percentChange) < threshold;
    }

    return results;
  }

  async generateComparisonReport(
    baseline: Record<string, number[]>,
    current: Record<string, number[]>
  ): Promise<string> {
    const comparison = await this.compare(baseline, current);
    const visualization = await this.visualize(baseline, current);

    const summary = [
      '# Monitoring Comparison Report',
      '',
      '## Summary',
      '',
    ];

    for (const [metric, data] of Object.entries(comparison)) {
      const status = data.significant ? '⚠️  SIGNIFICANT CHANGE' : '✓ Normal';
      summary.push(`- **${metric}**: ${status}`);
      summary.push(`  - Baseline: ${data.baseline.toFixed(2)}`);
      summary.push(`  - Current: ${data.current.toFixed(2)}`);
      summary.push(`  - Change: ${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.percentChange >= 0 ? '+' : ''}${data.percentChange.toFixed(1)}%)`);
      summary.push('');
    }

    summary.push('## Visualization');
    summary.push('```');
    summary.push(visualization);
    summary.push('```');

    return summary.join('\n');
  }
}
