import { MonitorDashboard } from '../../src/cli/commands/monitor/dashboard';
import { MonitorAlerts } from '../../src/cli/commands/monitor/alerts';
import { MonitorExport } from '../../src/cli/commands/monitor/export';
import { MonitorAnalyze } from '../../src/cli/commands/monitor/analyze';
import { MonitorCompare } from '../../src/cli/commands/monitor/compare';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock data
const mockMetrics = {
  cpu: [65, 72, 68, 70, 75],
  memory: [80, 82, 85, 83, 81],
  network: [120, 135, 140, 130, 125],
  timestamp: Date.now(),
};

const mockAlerts = [
  {
    id: 'alert-1',
    type: 'cpu',
    severity: 'warning',
    message: 'CPU usage above 70%',
    timestamp: Date.now(),
    resolved: false,
  },
  {
    id: 'alert-2',
    type: 'memory',
    severity: 'critical',
    message: 'Memory usage above 90%',
    timestamp: Date.now() - 3600000,
    resolved: true,
  },
];

describe('Monitor Dashboard Command', () => {
  let dashboard: MonitorDashboard;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join('/tmp', `monitor-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    dashboard = new MonitorDashboard(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should initialize dashboard with default config', async () => {
    const result = await dashboard.initialize();
    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config.refreshInterval).toBe(1000);
  });

  it('should render real-time metrics dashboard', async () => {
    const output = await dashboard.render(mockMetrics);
    expect(output).toContain('CPU');
    expect(output).toContain('Memory');
    expect(output).toContain('Network');
    expect(output).toContain('%');
  });

  it('should support custom refresh intervals', async () => {
    dashboard = new MonitorDashboard(tempDir, { refreshInterval: 500 });
    const config = dashboard.getConfig();
    expect(config.refreshInterval).toBe(500);
  });

  it('should display metrics in multiple formats (table, graph, compact)', async () => {
    const tableOutput = await dashboard.render(mockMetrics, 'table');
    expect(tableOutput).toContain('│');

    const graphOutput = await dashboard.render(mockMetrics, 'graph');
    expect(graphOutput).toContain('█');

    const compactOutput = await dashboard.render(mockMetrics, 'compact');
    expect(compactOutput.length).toBeLessThan(tableOutput.length);
  });

  it('should handle metrics updates without memory leaks', async () => {
    const memBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      await dashboard.update({
        ...mockMetrics,
        timestamp: Date.now() + i * 1000,
      });
    }

    const memAfter = process.memoryUsage().heapUsed;
    const memIncrease = memAfter - memBefore;

    // Memory increase should be minimal (< 5MB)
    expect(memIncrease).toBeLessThan(5 * 1024 * 1024);
  });
});

describe('Monitor Alerts Command', () => {
  let alertManager: MonitorAlerts;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join('/tmp', `alerts-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    alertManager = new MonitorAlerts(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should list all active alerts', async () => {
    await alertManager.addAlert(mockAlerts[0]);
    const alerts = await alertManager.list({ status: 'active' });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].resolved).toBe(false);
  });

  it('should filter alerts by severity', async () => {
    await alertManager.addAlert(mockAlerts[0]);
    await alertManager.addAlert(mockAlerts[1]);

    const critical = await alertManager.list({ severity: 'critical' });
    expect(critical.every(a => a.severity === 'critical')).toBe(true);
  });

  it('should filter alerts by type', async () => {
    await alertManager.addAlert(mockAlerts[0]);
    await alertManager.addAlert(mockAlerts[1]);

    const cpuAlerts = await alertManager.list({ type: 'cpu' });
    expect(cpuAlerts.every(a => a.type === 'cpu')).toBe(true);
  });

  it('should resolve alerts by ID', async () => {
    await alertManager.addAlert(mockAlerts[0]);
    const result = await alertManager.resolve('alert-1');
    expect(result.success).toBe(true);

    const alert = await alertManager.getAlert('alert-1');
    expect(alert?.resolved).toBe(true);
  });

  it('should create alerts with custom rules', async () => {
    const rule = {
      metric: 'cpu',
      condition: 'above',
      threshold: 80,
      severity: 'warning' as const,
    };

    await alertManager.addRule(rule);
    const rules = await alertManager.getRules();
    expect(rules).toContainEqual(expect.objectContaining(rule));
  });

  it('should support alert acknowledgement', async () => {
    await alertManager.addAlert(mockAlerts[0]);
    await alertManager.acknowledge('alert-1', 'admin');

    const alert = await alertManager.getAlert('alert-1');
    expect(alert?.acknowledged).toBe(true);
    expect(alert?.acknowledgedBy).toBe('admin');
  });
});

describe('Monitor Export Command', () => {
  let exporter: MonitorExport;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join('/tmp', `export-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    exporter = new MonitorExport(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should export metrics in Prometheus format', async () => {
    const output = await exporter.export(mockMetrics, 'prometheus');
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
    expect(output).toMatch(/cpu_usage_percent\{host="[^"]+"\} \d+/);
    expect(output).toMatch(/memory_usage_percent\{host="[^"]+"\} \d+/);
  });

  it('should export metrics in InfluxDB line protocol', async () => {
    const output = await exporter.export(mockMetrics, 'influxdb');
    expect(output).toMatch(/cpu,host=\w+ value=\d+/);
    expect(output).toMatch(/memory,host=\w+ value=\d+/);
  });

  it('should export metrics in JSON format', async () => {
    const output = await exporter.export(mockMetrics, 'json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('cpu');
    expect(parsed).toHaveProperty('memory');
    expect(parsed).toHaveProperty('timestamp');
  });

  it('should export metrics to file', async () => {
    const filePath = path.join(tempDir, 'metrics.json');
    await exporter.exportToFile(mockMetrics, filePath, 'json');

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toHaveProperty('cpu');
  });

  it('should support streaming export for large datasets', async () => {
    const stream = await exporter.createStream('json');

    for (let i = 0; i < 1000; i++) {
      await stream.write({
        ...mockMetrics,
        timestamp: Date.now() + i * 1000,
      });
    }

    await stream.end();
    expect(stream.bytesWritten).toBeGreaterThan(0);
  });

  it('should support custom export templates', async () => {
    const template = '{cpu}% CPU, {memory}% Memory at {timestamp}';
    exporter.registerTemplate('custom', template);

    const output = await exporter.export(mockMetrics, 'custom');
    expect(output).toMatch(/\d+\.\d+% CPU, \d+\.\d+% Memory at \d+/);
  });
});

describe('Monitor Analyze Command', () => {
  let analyzer: MonitorAnalyze;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join('/tmp', `analyze-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    analyzer = new MonitorAnalyze(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should calculate basic statistics (mean, median, stddev)', async () => {
    const stats = await analyzer.calculateStats(mockMetrics.cpu);
    expect(stats).toHaveProperty('mean');
    expect(stats).toHaveProperty('median');
    expect(stats).toHaveProperty('stddev');
    expect(stats.mean).toBeCloseTo(70, 0);
  });

  it('should detect trends (increasing, decreasing, stable)', async () => {
    const increasing = [10, 20, 30, 40, 50];
    const trend = await analyzer.detectTrend(increasing);
    expect(trend.direction).toBe('increasing');
    expect(trend.confidence).toBeGreaterThan(0.8);
  });

  it('should identify anomalies using statistical methods', async () => {
    const dataWithAnomaly = [70, 71, 69, 150, 70, 72]; // 150 is anomaly
    const anomalies = await analyzer.detectAnomalies(dataWithAnomaly, 2); // Lower threshold for test
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].index).toBe(3);
    expect(anomalies[0].value).toBe(150);
  });

  it('should forecast future values using linear regression', async () => {
    const forecast = await analyzer.forecast(mockMetrics.cpu, 5);
    expect(forecast.length).toBe(5);
    expect(forecast[0]).toBeGreaterThan(0);
  });

  it('should analyze correlation between metrics', async () => {
    const correlation = await analyzer.correlate(
      mockMetrics.cpu,
      mockMetrics.memory
    );
    expect(correlation).toBeGreaterThanOrEqual(-1);
    expect(correlation).toBeLessThanOrEqual(1);
  });

  it('should generate comprehensive analysis report', async () => {
    const report = await analyzer.generateReport(mockMetrics);
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('trends');
    expect(report).toHaveProperty('anomalies');
    expect(report).toHaveProperty('recommendations');
  });
});

describe('Monitor Compare Command', () => {
  let comparator: MonitorCompare;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join('/tmp', `compare-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    comparator = new MonitorCompare(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should compare metrics between two time periods', async () => {
    const baseline = { cpu: [60, 62, 61], memory: [70, 72, 71] };
    const current = { cpu: [80, 82, 81], memory: [90, 92, 91] };

    const comparison = await comparator.compare(baseline, current);
    expect(comparison.cpu.change).toBeGreaterThan(0);
    expect(comparison.memory.change).toBeGreaterThan(0);
  });

  it('should calculate percentage differences', async () => {
    const baseline = { cpu: [50, 50, 50] };
    const current = { cpu: [75, 75, 75] };

    const comparison = await comparator.compare(baseline, current);
    expect(comparison.cpu.percentChange).toBeCloseTo(50, 0);
  });

  it('should identify significant changes using thresholds', async () => {
    const baseline = { cpu: [60, 60, 60] };
    const current = { cpu: [85, 85, 85] };

    const comparison = await comparator.compare(baseline, current, {
      threshold: 20,
    });

    expect(comparison.cpu.significant).toBe(true);
  });

  it('should compare multiple metrics simultaneously', async () => {
    const baseline = {
      cpu: [60, 62, 61],
      memory: [70, 72, 71],
      network: [100, 105, 102],
    };
    const current = {
      cpu: [80, 82, 81],
      memory: [90, 92, 91],
      network: [150, 155, 152],
    };

    const comparison = await comparator.compare(baseline, current);
    expect(Object.keys(comparison)).toEqual(['cpu', 'memory', 'network']);
  });

  it('should generate visual comparison charts', async () => {
    const baseline = { cpu: [60, 62, 61] };
    const current = { cpu: [80, 82, 81] };

    const chart = await comparator.visualize(baseline, current);
    expect(chart).toContain('Baseline');
    expect(chart).toContain('Current');
    expect(chart).toContain('█'); // Bar chart character
  });

  it('should support historical comparisons across multiple periods', async () => {
    const periods = [
      { name: 'Week 1', metrics: { cpu: [60, 62, 61] } },
      { name: 'Week 2', metrics: { cpu: [70, 72, 71] } },
      { name: 'Week 3', metrics: { cpu: [80, 82, 81] } },
    ];

    const comparison = await comparator.compareMultiple(periods);
    expect(comparison.trend).toBe('increasing');
    expect(comparison.periods.length).toBe(3);
  });
});
