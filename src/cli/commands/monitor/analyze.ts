import * as fs from 'fs/promises';
import * as path from 'path';

export interface Statistics {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  variance: number;
}

export interface Trend {
  direction: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
  slope: number;
}

export interface Anomaly {
  index: number;
  value: number;
  zscore: number;
  severity: 'low' | 'medium' | 'high';
}

export interface AnalysisReport {
  summary: {
    dataPoints: number;
    timeRange: { start: number; end: number };
  };
  trends: Record<string, Trend>;
  anomalies: Record<string, Anomaly[]>;
  statistics: Record<string, Statistics>;
  recommendations: string[];
}

export class MonitorAnalyze {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async calculateStats(values: number[]): Promise<Statistics> {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = this.mean(values);
    const variance = this.variance(values, mean);

    return {
      mean,
      median: this.median(sorted),
      stddev: Math.sqrt(variance),
      min: Math.min(...values),
      max: Math.max(...values),
      variance,
    };
  }

  async detectTrend(values: number[]): Promise<Trend> {
    const { slope, rSquared } = this.linearRegression(values);

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < 0.1) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return {
      direction,
      confidence: rSquared,
      slope,
    };
  }

  async detectAnomalies(values: number[], threshold: number = 3): Promise<Anomaly[]> {
    const stats = await this.calculateStats(values);
    const anomalies: Anomaly[] = [];

    values.forEach((value, index) => {
      const zscore = Math.abs((value - stats.mean) / stats.stddev);

      if (zscore > threshold) {
        let severity: 'low' | 'medium' | 'high';
        if (zscore > 4) {
          severity = 'high';
        } else if (zscore > 3.5) {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        anomalies.push({ index, value, zscore, severity });
      }
    });

    return anomalies;
  }

  async forecast(values: number[], steps: number): Promise<number[]> {
    const { slope, intercept } = this.linearRegression(values);
    const forecast: number[] = [];
    const startX = values.length;

    for (let i = 0; i < steps; i++) {
      const x = startX + i;
      const y = slope * x + intercept;
      forecast.push(Math.max(0, y)); // Ensure non-negative
    }

    return forecast;
  }

  async correlate(x: number[], y: number[]): Promise<number> {
    if (x.length !== y.length) {
      throw new Error('Arrays must have equal length');
    }

    const n = x.length;
    const meanX = this.mean(x);
    const meanY = this.mean(y);

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    return numerator / Math.sqrt(denomX * denomY);
  }

  async generateReport(metrics: any): Promise<AnalysisReport> {
    const report: AnalysisReport = {
      summary: {
        dataPoints: 0,
        timeRange: { start: 0, end: 0 },
      },
      trends: {},
      anomalies: {},
      statistics: {},
      recommendations: [],
    };

    // Calculate for each metric
    for (const [key, values] of Object.entries(metrics)) {
      if (Array.isArray(values) && values.every(v => typeof v === 'number')) {
        report.statistics[key] = await this.calculateStats(values);
        report.trends[key] = await this.detectTrend(values);
        report.anomalies[key] = await this.detectAnomalies(values);
        report.summary.dataPoints = Math.max(report.summary.dataPoints, values.length);
      }
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  private generateRecommendations(report: AnalysisReport): string[] {
    const recommendations: string[] = [];

    // Check for increasing trends
    for (const [metric, trend] of Object.entries(report.trends)) {
      if (trend.direction === 'increasing' && trend.confidence > 0.7) {
        recommendations.push(
          `${metric} shows increasing trend with ${(trend.confidence * 100).toFixed(1)}% confidence. Consider scaling resources.`
        );
      }
    }

    // Check for anomalies
    for (const [metric, anomalies] of Object.entries(report.anomalies)) {
      const highSeverity = anomalies.filter(a => a.severity === 'high');
      if (highSeverity.length > 0) {
        recommendations.push(
          `${metric} has ${highSeverity.length} high-severity anomalies. Investigation recommended.`
        );
      }
    }

    // Check for high variance
    for (const [metric, stats] of Object.entries(report.statistics)) {
      if (stats.stddev / stats.mean > 0.3) {
        recommendations.push(
          `${metric} shows high variability (CV: ${((stats.stddev / stats.mean) * 100).toFixed(1)}%). Consider stabilizing workload.`
        );
      }
    }

    return recommendations;
  }

  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private median(sorted: number[]): number {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private variance(values: number[], mean: number): number {
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private linearRegression(values: number[]): { slope: number; intercept: number; rSquared: number } {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const meanX = this.mean(x);
    const meanY = this.mean(y);

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (y[i] - meanY);
      denominator += Math.pow(x[i] - meanX, 2);
    }

    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;

    // Calculate R²
    const yPred = x.map(xi => slope * xi + intercept);
    const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - yPred[i], 2), 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    return { slope, intercept, rSquared };
  }
}
