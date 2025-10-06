import * as fs from 'fs/promises';
import * as path from 'path';

export interface DashboardConfig {
  refreshInterval: number;
  maxDataPoints: number;
  displayFormat: 'table' | 'graph' | 'compact';
}

export interface Metrics {
  cpu: number[];
  memory: number[];
  network: number[];
  timestamp: number;
  [key: string]: number[] | number;
}

export class MonitorDashboard {
  private config: DashboardConfig;
  private dataDir: string;
  private metricsHistory: Metrics[] = [];

  constructor(
    dataDir: string,
    config?: Partial<DashboardConfig>
  ) {
    this.dataDir = dataDir;
    this.config = {
      refreshInterval: config?.refreshInterval ?? 1000,
      maxDataPoints: config?.maxDataPoints ?? 100,
      displayFormat: config?.displayFormat ?? 'table',
    };
  }

  async initialize(): Promise<{ success: boolean; config: DashboardConfig }> {
    await fs.mkdir(this.dataDir, { recursive: true });
    return { success: true, config: this.config };
  }

  getConfig(): DashboardConfig {
    return { ...this.config };
  }

  async update(metrics: Metrics): Promise<void> {
    this.metricsHistory.push(metrics);

    // Keep only maxDataPoints to prevent memory leaks
    if (this.metricsHistory.length > this.config.maxDataPoints) {
      this.metricsHistory = this.metricsHistory.slice(-this.config.maxDataPoints);
    }
  }

  async render(metrics: Metrics, format?: 'table' | 'graph' | 'compact'): Promise<string> {
    const displayFormat = format ?? this.config.displayFormat;

    switch (displayFormat) {
      case 'table':
        return this.renderTable(metrics);
      case 'graph':
        return this.renderGraph(metrics);
      case 'compact':
        return this.renderCompact(metrics);
      default:
        return this.renderTable(metrics);
    }
  }

  private renderTable(metrics: Metrics): string {
    const cpuAvg = this.average(metrics.cpu);
    const memAvg = this.average(metrics.memory);
    const netAvg = this.average(metrics.network);

    return `
╔════════════════════════════════════════╗
║         MONITORING DASHBOARD           ║
╠════════════════════════════════════════╣
║ Metric    │ Current │ Avg   │ Trend   ║
╟────────────┼─────────┼───────┼─────────╢
║ CPU       │ ${this.formatPercent(metrics.cpu[metrics.cpu.length - 1])} │ ${this.formatPercent(cpuAvg)} │ ${this.getTrendArrow(metrics.cpu)} ║
║ Memory    │ ${this.formatPercent(metrics.memory[metrics.memory.length - 1])} │ ${this.formatPercent(memAvg)} │ ${this.getTrendArrow(metrics.memory)} ║
║ Network   │ ${this.formatMbps(metrics.network[metrics.network.length - 1])} │ ${this.formatMbps(netAvg)} │ ${this.getTrendArrow(metrics.network)} ║
╚════════════════════════════════════════╝
Updated: ${new Date(metrics.timestamp).toLocaleString()}
    `.trim();
  }

  private renderGraph(metrics: Metrics): string {
    const cpuGraph = this.createSparkline(metrics.cpu, 20);
    const memGraph = this.createSparkline(metrics.memory, 20);
    const netGraph = this.createSparkline(metrics.network, 20);

    return `
MONITORING DASHBOARD - GRAPHICAL VIEW

CPU Usage:     ${cpuGraph} ${this.formatPercent(this.average(metrics.cpu))}
Memory Usage:  ${memGraph} ${this.formatPercent(this.average(metrics.memory))}
Network Usage: ${netGraph} ${this.formatMbps(this.average(metrics.network))}

Updated: ${new Date(metrics.timestamp).toLocaleString()}
    `.trim();
  }

  private renderCompact(metrics: Metrics): string {
    const cpuAvg = this.average(metrics.cpu);
    const memAvg = this.average(metrics.memory);
    const netAvg = this.average(metrics.network);

    return `CPU: ${this.formatPercent(cpuAvg)} | MEM: ${this.formatPercent(memAvg)} | NET: ${this.formatMbps(netAvg)}`;
  }

  private createSparkline(data: number[], width: number): string {
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    // Sample data to fit width
    const step = Math.max(1, Math.floor(data.length / width));
    const sampledData = [];
    for (let i = 0; i < data.length; i += step) {
      sampledData.push(data[i]);
    }

    return sampledData
      .map(value => {
        const normalized = (value - min) / range;
        const blockIndex = Math.floor(normalized * (blocks.length - 1));
        return blocks[blockIndex];
      })
      .join('');
  }

  private average(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private getTrendArrow(values: number[]): string {
    if (values.length < 2) return '→';
    const recent = values.slice(-3);
    const older = values.slice(-6, -3);

    if (older.length === 0) return '→';

    const recentAvg = this.average(recent);
    const olderAvg = this.average(older);

    if (recentAvg > olderAvg * 1.1) return '↑';
    if (recentAvg < olderAvg * 0.9) return '↓';
    return '→';
  }

  private formatPercent(value: number): string {
    return `${value.toFixed(1).padStart(5)}%`;
  }

  private formatMbps(value: number): string {
    return `${value.toFixed(0).padStart(4)}Mb`;
  }
}
