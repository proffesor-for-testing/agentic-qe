/**
 * Health Check Command
 * Performs system health checks with export capabilities
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface HealthCheckOptions {
  comprehensive?: boolean;
  export?: 'json' | 'yaml';
  outputDir?: string;
  includeRemediation?: boolean;
  measurePerformance?: boolean;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  metrics?: any;
  remediation?: string[];
}

export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
}

export interface HealthCheckResult {
  success: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: ComponentHealth[];
  unhealthyComponents?: string[];
  remediation?: Record<string, string[]>;
  performanceMetrics?: PerformanceMetrics;
  reportPath?: string;
  timestamp: number;
}

/**
 * Perform system health check
 */
export async function healthCheck(options: HealthCheckOptions): Promise<HealthCheckResult> {
  const components: ComponentHealth[] = [];
  const startTime = Date.now();

  try {
    // Check core components
    components.push(await checkMemoryHealth(options));
    components.push(await checkCPUHealth(options));
    components.push(await checkDiskHealth(options));

    if (options.comprehensive) {
      components.push(await checkAgentHealth(options));
      components.push(await checkNetworkHealth(options));
      components.push(await checkDependencyHealth(options));
      components.push(await checkDatabaseHealth(options));
    }

    // Determine overall status
    const hasUnhealthy = components.some(c => c.status === 'unhealthy');
    const hasDegraded = components.some(c => c.status === 'degraded');

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
      hasUnhealthy ? 'unhealthy' :
      hasDegraded ? 'degraded' :
      'healthy';

    const unhealthyComponents = components
      .filter(c => c.status !== 'healthy')
      .map(c => c.name);

    // Collect remediation suggestions
    let remediation: Record<string, string[]> | undefined;
    if (options.includeRemediation && unhealthyComponents.length > 0) {
      remediation = {};
      for (const component of components) {
        if (component.status !== 'healthy' && component.remediation) {
          remediation[component.name] = component.remediation;
        }
      }
    }

    // Measure performance if requested
    let performanceMetrics: PerformanceMetrics | undefined;
    if (options.measurePerformance) {
      const responseTime = Math.max(Date.now() - startTime, 1); // Ensure at least 1ms
      performanceMetrics = {
        responseTime,
        throughput: components.length / (responseTime / 1000),
        errorRate: unhealthyComponents.length / components.length,
      };
    }

    // Export report if requested
    let reportPath: string | undefined;
    if (options.export) {
      const outputDir = options.outputDir || path.join(process.cwd(), '.swarm', 'reports');
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const report = {
        timestamp: Date.now(),
        status: overallStatus,
        components,
        unhealthyComponents,
        remediation,
        performanceMetrics,
      };

      if (options.export === 'json') {
        reportPath = path.join(outputDir, `health-check-${timestamp}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      } else if (options.export === 'yaml') {
        const yaml = await import('yaml');
        reportPath = path.join(outputDir, `health-check-${timestamp}.yaml`);
        await fs.writeFile(reportPath, yaml.stringify(report));
      }
    }

    return {
      success: true,
      status: overallStatus,
      components,
      unhealthyComponents: unhealthyComponents.length > 0 ? unhealthyComponents : undefined,
      remediation,
      performanceMetrics,
      reportPath,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    return {
      success: false,
      status: 'unhealthy',
      components,
      timestamp: Date.now(),
    };
  }
}

async function checkMemoryHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

  let status: 'healthy' | 'degraded' | 'unhealthy';
  let remediation: string[] | undefined;

  if (usedPercent > 95) {
    status = 'unhealthy';
    remediation = [
      'Memory usage critical (>95%)',
      'Restart the application',
      'Increase system memory',
      'Check for memory leaks',
    ];
  } else if (usedPercent > 85) {
    status = 'degraded';
    remediation = [
      'Memory usage high (>85%)',
      'Monitor memory consumption',
      'Consider restarting soon',
    ];
  } else {
    status = 'healthy';
  }

  return {
    name: 'memory',
    status,
    message: `Memory usage: ${usedPercent.toFixed(2)}%`,
    metrics: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      usedPercent,
    },
    remediation: options.includeRemediation ? remediation : undefined,
  };
}

async function checkCPUHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const avgLoad = loadAvg[0] / cpus.length;

  let status: 'healthy' | 'degraded' | 'unhealthy';
  let remediation: string[] | undefined;

  if (avgLoad > 0.95) {
    status = 'unhealthy';
    remediation = [
      'CPU load critical (>95%)',
      'Identify CPU-intensive processes',
      'Scale horizontally',
      'Optimize code performance',
    ];
  } else if (avgLoad > 0.80) {
    status = 'degraded';
    remediation = [
      'CPU load high (>80%)',
      'Monitor CPU usage',
      'Profile application performance',
    ];
  } else {
    status = 'healthy';
  }

  return {
    name: 'cpu',
    status,
    message: `CPU load: ${(avgLoad * 100).toFixed(2)}%`,
    metrics: {
      loadAverage: loadAvg,
      cpuCount: cpus.length,
      avgLoad,
    },
    remediation: options.includeRemediation ? remediation : undefined,
  };
}

async function checkDiskHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  const tmpDir = os.tmpdir();
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const metrics: any = {};

  try {
    // Try to write a test file
    const testFile = path.join(tmpDir, 'health-check-test');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);

    metrics.writable = true;
    status = 'healthy';
  } catch (error) {
    metrics.writable = false;
    status = 'unhealthy';
  }

  return {
    name: 'disk',
    status,
    message: status === 'healthy' ? 'Disk accessible' : 'Disk write failed',
    metrics,
    remediation: status !== 'healthy' ? [
      'Disk write failed',
      'Check disk permissions',
      'Check disk space',
      'Verify mount points',
    ] : undefined,
  };
}

async function checkAgentHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  const agentDir = path.join(process.cwd(), '.claude', 'agents');

  // Check if agents directory exists (async)
  let agentDirExists = false;
  try {
    await fs.access(agentDir);
    agentDirExists = true;
  } catch {
    agentDirExists = false;
  }

  if (!agentDirExists) {
    return {
      name: 'agents',
      status: 'degraded',
      message: 'No agents configured',
      remediation: ['Initialize agent fleet with: aqe init'],
    };
  }

  const agents = (await fs.readdir(agentDir)).filter(f => f.endsWith('.json'));

  return {
    name: 'agents',
    status: agents.length > 0 ? 'healthy' : 'degraded',
    message: `${agents.length} agent(s) configured`,
    metrics: { agentCount: agents.length },
  };
}

async function checkNetworkHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  const interfaces = os.networkInterfaces();
  const hasActive = Object.values(interfaces).some(addrs =>
    addrs?.some(addr => !addr.internal && addr.family === 'IPv4')
  );

  return {
    name: 'network',
    status: hasActive ? 'healthy' : 'unhealthy',
    message: hasActive ? 'Network available' : 'No network connectivity',
    remediation: !hasActive ? [
      'No network connectivity detected',
      'Check network cables',
      'Verify network configuration',
      'Restart network service',
    ] : undefined,
  };
}

async function checkDependencyHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  const packageJsonPath = path.join(process.cwd(), 'package.json');

  // Check if package.json exists (async)
  let packageJsonExists = false;
  try {
    await fs.access(packageJsonPath);
    packageJsonExists = true;
  } catch {
    packageJsonExists = false;
  }

  if (!packageJsonExists) {
    return {
      name: 'dependencies',
      status: 'degraded',
      message: 'No package.json found',
    };
  }

  const nodeModules = path.join(process.cwd(), 'node_modules');

  // Check if node_modules exists (async)
  let hasNodeModules = false;
  try {
    await fs.access(nodeModules);
    hasNodeModules = true;
  } catch {
    hasNodeModules = false;
  }

  return {
    name: 'dependencies',
    status: hasNodeModules ? 'healthy' : 'degraded',
    message: hasNodeModules ? 'Dependencies installed' : 'Dependencies not installed',
    remediation: !hasNodeModules ? ['Run: npm install'] : undefined,
  };
}

async function checkDatabaseHealth(options: HealthCheckOptions): Promise<ComponentHealth> {
  // Check both .agentic-qe (primary) and .swarm (legacy) database locations
  const aqeDbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
  const swarmDbPath = path.join(process.cwd(), '.swarm', 'memory.db');

  // Check if databases exist (async)
  let aqeDbExists = false;
  let swarmDbExists = false;
  try {
    await fs.access(aqeDbPath);
    aqeDbExists = true;
  } catch {
    aqeDbExists = false;
  }
  try {
    await fs.access(swarmDbPath);
    swarmDbExists = true;
  } catch {
    swarmDbExists = false;
  }

  // Use .agentic-qe as primary, .swarm as fallback for legacy compatibility
  const dbPath = aqeDbExists ? aqeDbPath : swarmDbPath;
  const dbExists = aqeDbExists || swarmDbExists;

  if (!dbExists) {
    return {
      name: 'database',
      status: 'degraded',
      message: 'Database not initialized',
      remediation: ['Initialize database with: aqe init'],
    };
  }

  try {
    const stats = await fs.stat(dbPath);
    return {
      name: 'database',
      status: 'healthy',
      message: 'Database accessible',
      metrics: {
        size: stats.size,
        modified: stats.mtime,
      },
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      message: 'Database access failed',
      remediation: [
        'Database file exists but cannot be accessed',
        'Check file permissions',
        'Verify database is not corrupted',
      ],
    };
  }
}
