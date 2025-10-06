import * as fs from 'fs/promises';
import * as path from 'path';
import { Writable } from 'stream';

export interface Metrics {
  cpu: number[];
  memory: number[];
  network: number[];
  timestamp: number;
  [key: string]: number[] | number;
}

export type ExportFormat = 'prometheus' | 'influxdb' | 'json' | 'csv';

export class MonitorExport {
  private dataDir: string;
  private templates: Map<string, string> = new Map();
  private hostname: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.hostname = require('os').hostname();
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  registerTemplate(name: string, template: string): void {
    this.templates.set(name, template);
  }

  async export(metrics: Metrics, format: ExportFormat | string): Promise<string> {
    switch (format) {
      case 'prometheus':
        return this.exportPrometheus(metrics);
      case 'influxdb':
        return this.exportInfluxDB(metrics);
      case 'json':
        return this.exportJSON(metrics);
      case 'csv':
        return this.exportCSV(metrics);
      default:
        return this.exportCustom(metrics, format);
    }
  }

  private exportPrometheus(metrics: Metrics): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    // CPU metrics
    lines.push('# HELP cpu_usage_percent CPU usage percentage');
    lines.push('# TYPE cpu_usage_percent gauge');
    const cpuAvg = this.average(metrics.cpu);
    lines.push(`cpu_usage_percent{host="${this.hostname}"} ${cpuAvg.toFixed(2)} ${timestamp}`);

    // Memory metrics
    lines.push('# HELP memory_usage_percent Memory usage percentage');
    lines.push('# TYPE memory_usage_percent gauge');
    const memAvg = this.average(metrics.memory);
    lines.push(`memory_usage_percent{host="${this.hostname}"} ${memAvg.toFixed(2)} ${timestamp}`);

    // Network metrics
    lines.push('# HELP network_usage_mbps Network usage in Mbps');
    lines.push('# TYPE network_usage_mbps gauge');
    const netAvg = this.average(metrics.network);
    lines.push(`network_usage_mbps{host="${this.hostname}"} ${netAvg.toFixed(2)} ${timestamp}`);

    return lines.join('\n');
  }

  private exportInfluxDB(metrics: Metrics): string {
    const lines: string[] = [];
    const timestamp = Date.now() * 1000000; // InfluxDB uses nanoseconds

    const cpuAvg = this.average(metrics.cpu);
    lines.push(`cpu,host=${this.hostname} value=${cpuAvg.toFixed(2)} ${timestamp}`);

    const memAvg = this.average(metrics.memory);
    lines.push(`memory,host=${this.hostname} value=${memAvg.toFixed(2)} ${timestamp}`);

    const netAvg = this.average(metrics.network);
    lines.push(`network,host=${this.hostname} value=${netAvg.toFixed(2)} ${timestamp}`);

    return lines.join('\n');
  }

  private exportJSON(metrics: Metrics): string {
    return JSON.stringify(metrics, null, 2);
  }

  private exportCSV(metrics: Metrics): string {
    const lines: string[] = ['timestamp,metric,value'];
    const timestamp = metrics.timestamp;

    metrics.cpu.forEach((value, i) => {
      lines.push(`${timestamp + i * 1000},cpu,${value}`);
    });

    metrics.memory.forEach((value, i) => {
      lines.push(`${timestamp + i * 1000},memory,${value}`);
    });

    metrics.network.forEach((value, i) => {
      lines.push(`${timestamp + i * 1000},network,${value}`);
    });

    return lines.join('\n');
  }

  private exportCustom(metrics: Metrics, templateName: string): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    let output = template;
    output = output.replace('{cpu}', this.average(metrics.cpu).toFixed(1));
    output = output.replace('{memory}', this.average(metrics.memory).toFixed(1));
    output = output.replace('{network}', this.average(metrics.network).toFixed(1));
    output = output.replace('{timestamp}', metrics.timestamp.toString());

    return output;
  }

  async exportToFile(metrics: Metrics, filePath: string, format: ExportFormat): Promise<void> {
    const output = await this.export(metrics, format);
    await fs.writeFile(filePath, output, 'utf-8');
  }

  async createStream(format: ExportFormat): Promise<MetricsStream> {
    return new MetricsStream(this, format);
  }

  private average(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

export class MetricsStream {
  private exporter: MonitorExport;
  private format: ExportFormat;
  private buffer: string[] = [];
  public bytesWritten: number = 0;

  constructor(exporter: MonitorExport, format: ExportFormat) {
    this.exporter = exporter;
    this.format = format;
  }

  async write(metrics: Metrics): Promise<void> {
    const output = await this.exporter.export(metrics, this.format);
    this.buffer.push(output);
    this.bytesWritten += Buffer.byteLength(output, 'utf-8');
  }

  async end(): Promise<void> {
    // Finalize stream
    this.buffer = [];
  }

  getBuffer(): string[] {
    return [...this.buffer];
  }
}
