import { EventEmitter } from 'events';
import * as os from 'os';
import * as process from 'process';
import * as fs from 'fs-extra';

/**
 * Performance monitoring configuration
 */
export interface PerformanceMonitorConfig {
  interval?: number;
  enableCpuTracking?: boolean;
  enableMemoryTracking?: boolean;
  enableIoTracking?: boolean;
  enableNetworkTracking?: boolean;
  enableProcessHierarchy?: boolean;
  maxHistorySize?: number;
  alertThresholds?: AlertThresholds;
  persistMetrics?: boolean;
  persistPath?: string;
}

/**
 * Alert thresholds for performance metrics
 */
export interface AlertThresholds {
  cpuUsage?: number; // Percentage (0-100)
  memoryUsage?: number; // Percentage (0-100)
  heapUsage?: number; // Percentage (0-100)
  ioWaitTime?: number; // Milliseconds
  processCount?: number; // Number of processes
}

/**
 * System resource metrics
 */
export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number; // Percentage (0-100)
    loadAverage: number[];
    cores: number;
    model: string;
    speed: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercentage: number;
    heap: {
      total: number;
      used: number;
      external: number;
      arrayBuffers: number;
      usagePercentage: number;
    };
  };
  io: {
    readBytes: number;
    writeBytes: number;
    readOps: number;
    writeOps: number;
    waitTime: number;
  };
  network?: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
  uptime: number;
}

/**
 * Process metrics
 */
export interface ProcessMetrics {
  pid: number;
  ppid: number;
  name: string;
  cpu: number; // Percentage
  memory: number; // Bytes
  memoryPercentage: number; // Percentage
  startTime: Date;
  uptime: number; // Seconds
  status: string;
  threads?: number;
  children?: ProcessMetrics[];
}

/**
 * Performance baseline for comparison
 */
export interface PerformanceBaseline {
  cpu: {
    average: number;
    peak: number;
    low: number;
  };
  memory: {
    average: number;
    peak: number;
    low: number;
  };
  io: {
    avgReadBytes: number;
    avgWriteBytes: number;
    avgWaitTime: number;
  };
  timestamp: Date;
  duration: number; // Baseline collection duration in ms
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  type: 'cpu' | 'memory' | 'io' | 'process' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

/**
 * Performance monitor statistics
 */
export interface MonitorStats {
  totalSamples: number;
  alertsGenerated: number;
  averageCollectionTime: number;
  lastCollectionTime: Date;
  uptimeStart: Date;
  monitoringDuration: number;
}

/**
 * PerformanceMonitor for tracking resource usage, process hierarchy, and system-wide metrics
 * Provides real-time metrics collection with baseline comparison and alerting
 */
export class PerformanceMonitor extends EventEmitter {
  private readonly config: Required<PerformanceMonitorConfig>;
  private readonly metricsHistory: SystemMetrics[] = [];
  private readonly processHistory: Map<number, ProcessMetrics[]> = new Map();
  private readonly alerts: PerformanceAlert[] = [];
  private readonly stats: MonitorStats;

  private monitoringInterval?: NodeJS.Timeout;
  private baseline?: PerformanceBaseline;
  private isMonitoring = false;
  private lastCpuUsage?: NodeJS.CpuUsage;
  private lastIoStats?: any;
  private processTree: Map<number, ProcessMetrics> = new Map();

  constructor(config: PerformanceMonitorConfig = {}) {
    super();

    this.config = {
      interval: config.interval || 5000, // 5 seconds
      enableCpuTracking: config.enableCpuTracking ?? true,
      enableMemoryTracking: config.enableMemoryTracking ?? true,
      enableIoTracking: config.enableIoTracking ?? true,
      enableNetworkTracking: config.enableNetworkTracking ?? false,
      enableProcessHierarchy: config.enableProcessHierarchy ?? true,
      maxHistorySize: config.maxHistorySize || 1000,
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        heapUsage: 90,
        ioWaitTime: 1000,
        processCount: 100,
        ...config.alertThresholds
      },
      persistMetrics: config.persistMetrics ?? false,
      persistPath: config.persistPath || './performance-metrics.json'
    };

    this.stats = {
      totalSamples: 0,
      alertsGenerated: 0,
      averageCollectionTime: 0,
      lastCollectionTime: new Date(),
      uptimeStart: new Date(),
      monitoringDuration: 0
    };

    // Initialize baseline CPU usage
    this.lastCpuUsage = process.cpuUsage();
  }

  /**
   * Start performance monitoring
   */
  public start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.stats.uptimeStart = new Date();

    // Start periodic collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        this.emit('error', error);
      });
    }, this.config.interval);

    // Collect initial metrics
    this.collectMetrics().catch(error => {
      this.emit('error', error);
    });

    this.emit('started');
  }

  /**
   * Stop performance monitoring
   */
  public stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.stats.monitoringDuration = Date.now() - this.stats.uptimeStart.getTime();

    // Persist metrics if enabled
    if (this.config.persistMetrics) {
      this.persistMetrics().catch(error => {
        this.emit('error', error);
      });
    }

    this.emit('stopped');
  }

  /**
   * Get current system metrics
   */
  public async getCurrentMetrics(): Promise<SystemMetrics> {
    return this.collectSystemMetrics();
  }

  /**
   * Get metrics history
   */
  public getMetricsHistory(count?: number): SystemMetrics[] {
    const history = [...this.metricsHistory];
    return count ? history.slice(-count) : history;
  }

  /**
   * Get process metrics
   */
  public async getProcessMetrics(pid?: number): Promise<ProcessMetrics | ProcessMetrics[]> {
    await this.collectProcessMetrics();

    if (pid) {
      const processMetrics = this.processTree.get(pid);
      if (!processMetrics) {
        throw new Error(`Process with PID ${pid} not found`);
      }
      return processMetrics;
    }

    return Array.from(this.processTree.values());
  }

  /**
   * Create performance baseline
   */
  public async createBaseline(duration: number = 60000): Promise<PerformanceBaseline> {
    const startTime = Date.now();
    const samples: SystemMetrics[] = [];

    // Collect samples for the specified duration
    while (Date.now() - startTime < duration) {
      const metrics = await this.collectSystemMetrics();
      samples.push(metrics);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Sample every second
    }

    if (samples.length === 0) {
      throw new Error('No samples collected for baseline');
    }

    // Calculate baseline statistics
    const cpuValues = samples.map(s => s.cpu.usage);
    const memoryValues = samples.map(s => s.memory.usagePercentage);
    const readBytes = samples.map(s => s.io.readBytes);
    const writeBytes = samples.map(s => s.io.writeBytes);
    const waitTimes = samples.map(s => s.io.waitTime);

    this.baseline = {
      cpu: {
        average: this.calculateAverage(cpuValues),
        peak: Math.max(...cpuValues),
        low: Math.min(...cpuValues)
      },
      memory: {
        average: this.calculateAverage(memoryValues),
        peak: Math.max(...memoryValues),
        low: Math.min(...memoryValues)
      },
      io: {
        avgReadBytes: this.calculateAverage(readBytes),
        avgWriteBytes: this.calculateAverage(writeBytes),
        avgWaitTime: this.calculateAverage(waitTimes)
      },
      timestamp: new Date(),
      duration: Date.now() - startTime
    };

    this.emit('baselineCreated', this.baseline);
    return this.baseline;
  }

  /**
   * Get performance baseline
   */
  public getBaseline(): PerformanceBaseline | undefined {
    return this.baseline;
  }

  /**
   * Get current alerts
   */
  public getAlerts(includeResolved: boolean = false): PerformanceAlert[] {
    return this.alerts.filter(alert => includeResolved || !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Get monitor statistics
   */
  public getStats(): MonitorStats {
    return {
      ...this.stats,
      monitoringDuration: this.isMonitoring ?
        Date.now() - this.stats.uptimeStart.getTime() :
        this.stats.monitoringDuration
    };
  }

  /**
   * Export metrics data
   */
  public exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'timestamp', 'cpu_usage', 'memory_usage', 'heap_usage',
        'io_read_bytes', 'io_write_bytes', 'io_wait_time'
      ];

      const rows = this.metricsHistory.map(metrics => [
        metrics.timestamp.toISOString(),
        metrics.cpu.usage.toFixed(2),
        metrics.memory.usagePercentage.toFixed(2),
        metrics.memory.heap.usagePercentage.toFixed(2),
        metrics.io.readBytes.toString(),
        metrics.io.writeBytes.toString(),
        metrics.io.waitTime.toString()
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify({
      metrics: this.metricsHistory,
      alerts: this.alerts,
      baseline: this.baseline,
      stats: this.getStats()
    }, null, 2);
  }

  /**
   * Clear metrics history
   */
  public clearHistory(olderThan?: Date): number {
    let cleared = 0;

    if (olderThan) {
      const originalLength = this.metricsHistory.length;
      for (let i = this.metricsHistory.length - 1; i >= 0; i--) {
        if (this.metricsHistory[i].timestamp < olderThan) {
          this.metricsHistory.splice(i, 1);
          cleared++;
        }
      }
    } else {
      cleared = this.metricsHistory.length;
      this.metricsHistory.length = 0;
    }

    this.emit('historyCleared', { cleared });
    return cleared;
  }

  /**
   * Collect current system metrics
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date();

    // CPU metrics
    const cpuUsage = this.calculateCpuUsage();
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Memory metrics
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercentage = (usedMemory / totalMemory) * 100;

    const memoryUsage = process.memoryUsage();
    const heapUsagePercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // I/O metrics
    const ioStats = await this.getIoStats();

    const metrics: SystemMetrics = {
      timestamp,
      cpu: {
        usage: cpuUsage,
        loadAverage,
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        speed: cpus[0]?.speed || 0
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        usagePercentage: memoryUsagePercentage,
        heap: {
          total: memoryUsage.heapTotal,
          used: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
          usagePercentage: heapUsagePercentage
        }
      },
      io: ioStats,
      uptime: os.uptime()
    };

    return metrics;
  }

  /**
   * Collect process metrics
   */
  private async collectProcessMetrics(): Promise<void> {
    try {
      // This is a simplified implementation
      // In a real-world scenario, you might use libraries like `pidusage` or `ps-tree`
      const currentProcess: ProcessMetrics = {
        pid: process.pid,
        ppid: process.ppid || 0,
        name: process.title,
        cpu: this.calculateCpuUsage(),
        memory: process.memoryUsage().rss,
        memoryPercentage: (process.memoryUsage().rss / os.totalmem()) * 100,
        startTime: new Date(Date.now() - process.uptime() * 1000),
        uptime: process.uptime(),
        status: 'running'
      };

      this.processTree.set(process.pid, currentProcess);

    } catch (error) {
      // Handle process collection errors gracefully
      this.emit('processCollectionError', error);
    }
  }

  /**
   * Collect all metrics
   */
  private async collectMetrics(): Promise<void> {
    const startTime = Date.now();

    try {
      // Collect system metrics
      const systemMetrics = await this.collectSystemMetrics();

      // Collect process metrics if enabled
      if (this.config.enableProcessHierarchy) {
        await this.collectProcessMetrics();
      }

      // Add to history
      this.metricsHistory.push(systemMetrics);

      // Trim history if needed
      if (this.metricsHistory.length > this.config.maxHistorySize) {
        this.metricsHistory.splice(0, this.metricsHistory.length - this.config.maxHistorySize);
      }

      // Check for alerts
      this.checkAlerts(systemMetrics);

      // Update statistics
      this.updateStats(Date.now() - startTime);

      this.emit('metricsCollected', systemMetrics);

    } catch (error) {
      this.emit('collectionError', error);
    }
  }

  /**
   * Calculate CPU usage
   */
  private calculateCpuUsage(): number {
    if (!this.lastCpuUsage) {
      this.lastCpuUsage = process.cpuUsage();
      return 0;
    }

    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const totalUsage = currentUsage.user + currentUsage.system;
    const percentage = (totalUsage / 1000000 / this.config.interval) * 100; // Convert microseconds to percentage

    this.lastCpuUsage = process.cpuUsage();

    return Math.min(percentage, 100); // Cap at 100%
  }

  /**
   * Get I/O statistics
   */
  private async getIoStats(): Promise<SystemMetrics['io']> {
    // This is a simplified implementation
    // In a real system, you would read from /proc/diskstats on Linux or use other OS-specific APIs

    const defaultStats = {
      readBytes: 0,
      writeBytes: 0,
      readOps: 0,
      writeOps: 0,
      waitTime: 0
    };

    try {
      // Try to read process I/O stats if available
      if (process.platform === 'linux') {
        // On Linux, we could read from /proc/[pid]/io
        // This is a placeholder implementation
        return defaultStats;
      }

      return defaultStats;
    } catch (error) {
      return defaultStats;
    }
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(metrics: SystemMetrics): void {
    const thresholds = this.config.alertThresholds;

    // CPU usage alert
    if (thresholds.cpuUsage && metrics.cpu.usage > thresholds.cpuUsage) {
      this.createAlert('cpu', 'high',
        `CPU usage (${metrics.cpu.usage.toFixed(1)}%) exceeds threshold (${thresholds.cpuUsage}%)`,
        metrics.cpu.usage, thresholds.cpuUsage);
    }

    // Memory usage alert
    if (thresholds.memoryUsage && metrics.memory.usagePercentage > thresholds.memoryUsage) {
      this.createAlert('memory', 'high',
        `Memory usage (${metrics.memory.usagePercentage.toFixed(1)}%) exceeds threshold (${thresholds.memoryUsage}%)`,
        metrics.memory.usagePercentage, thresholds.memoryUsage);
    }

    // Heap usage alert
    if (thresholds.heapUsage && metrics.memory.heap.usagePercentage > thresholds.heapUsage) {
      this.createAlert('memory', 'critical',
        `Heap usage (${metrics.memory.heap.usagePercentage.toFixed(1)}%) exceeds threshold (${thresholds.heapUsage}%)`,
        metrics.memory.heap.usagePercentage, thresholds.heapUsage);
    }

    // I/O wait time alert
    if (thresholds.ioWaitTime && metrics.io.waitTime > thresholds.ioWaitTime) {
      this.createAlert('io', 'medium',
        `I/O wait time (${metrics.io.waitTime}ms) exceeds threshold (${thresholds.ioWaitTime}ms)`,
        metrics.io.waitTime, thresholds.ioWaitTime);
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    value: number,
    threshold: number
  ): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: new Date()
    };

    this.alerts.push(alert);
    this.stats.alertsGenerated++;

    this.emit('alert', alert);
  }

  /**
   * Update statistics
   */
  private updateStats(collectionTime: number): void {
    this.stats.totalSamples++;
    this.stats.lastCollectionTime = new Date();

    // Update average collection time
    this.stats.averageCollectionTime =
      ((this.stats.averageCollectionTime * (this.stats.totalSamples - 1)) + collectionTime) /
      this.stats.totalSamples;
  }

  /**
   * Calculate average of array
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * Persist metrics to disk
   */
  private async persistMetrics(): Promise<void> {
    try {
      const data = {
        metrics: this.metricsHistory,
        alerts: this.alerts,
        baseline: this.baseline,
        stats: this.getStats(),
        timestamp: new Date()
      };

      await fs.writeJSON(this.config.persistPath, data, { spaces: 2 });
      this.emit('metricsPersisted', { path: this.config.persistPath });

    } catch (error) {
      this.emit('persistError', error);
    }
  }
}

export default PerformanceMonitor;