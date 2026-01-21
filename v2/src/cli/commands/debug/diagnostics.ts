/**
 * Diagnostics Command
 * Runs comprehensive system diagnostics
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface DiagnosticsOptions {
  checks?: string[];
  export?: 'json' | 'yaml' | 'html';
  outputDir?: string;
}

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  data?: any;
  timestamp: number;
}

export interface DiagnosticsResult {
  success: boolean;
  checks: DiagnosticCheck[];
  reportPath?: string;
  error?: string;
}

/**
 * Run comprehensive system diagnostics
 */
export async function runDiagnostics(options: DiagnosticsOptions): Promise<DiagnosticsResult> {
  const checks: DiagnosticCheck[] = [];
  const checksToRun = options.checks || ['memory', 'cpu', 'disk', 'network', 'dependencies', 'agents', 'performance'];

  try {
    for (const checkName of checksToRun) {
      let check: DiagnosticCheck;

      switch (checkName) {
        case 'memory':
          check = await checkMemory();
          break;
        case 'cpu':
          check = await checkCPU();
          break;
        case 'disk':
          check = await checkDisk();
          break;
        case 'network':
          check = await checkNetwork();
          break;
        case 'dependencies':
          check = await checkDependencies();
          break;
        case 'agents':
          check = await checkAgents();
          break;
        case 'performance':
          check = await checkPerformance();
          break;
        default:
          check = {
            name: checkName,
            status: 'fail',
            message: `Unknown check: ${checkName}`,
            timestamp: Date.now(),
          };
      }

      checks.push(check);
    }

    // Export report if requested
    let reportPath: string | undefined;
    if (options.export) {
      const outputDir = options.outputDir || path.join(process.cwd(), '.swarm', 'reports');
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const report = {
        timestamp: Date.now(),
        checks,
        summary: {
          total: checks.length,
          passed: checks.filter(c => c.status === 'pass').length,
          failed: checks.filter(c => c.status === 'fail').length,
          warnings: checks.filter(c => c.status === 'warning').length,
        },
      };

      if (options.export === 'json') {
        reportPath = path.join(outputDir, `diagnostics-${timestamp}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      } else if (options.export === 'yaml') {
        const yaml = await import('yaml');
        reportPath = path.join(outputDir, `diagnostics-${timestamp}.yaml`);
        await fs.writeFile(reportPath, yaml.stringify(report));
      } else if (options.export === 'html') {
        reportPath = path.join(outputDir, `diagnostics-${timestamp}.html`);
        const html = generateHTMLReport(report);
        await fs.writeFile(reportPath, html);
      }
    }

    return {
      success: true,
      checks,
      reportPath,
    };
  } catch (error: any) {
    return {
      success: false,
      checks,
      error: error.message,
    };
  }
}

async function checkMemory(): Promise<DiagnosticCheck> {
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

  return {
    name: 'memory',
    status: usedPercent > 90 ? 'warning' : 'pass',
    message: `Memory usage: ${usedPercent.toFixed(2)}%`,
    data: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      totalMem,
      freeMem,
      usedPercent,
    },
    timestamp: Date.now(),
  };
}

async function checkCPU(): Promise<DiagnosticCheck> {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const avgLoad = loadAvg[0] / cpus.length;

  return {
    name: 'cpu',
    status: avgLoad > 0.8 ? 'warning' : 'pass',
    message: `CPU load: ${(avgLoad * 100).toFixed(2)}%`,
    data: {
      loadAverage: loadAvg,
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model,
      cpuSpeed: cpus[0]?.speed,
      avgLoad,
    },
    timestamp: Date.now(),
  };
}

async function checkDisk(): Promise<DiagnosticCheck> {
  try {
    // Get disk usage using df command on Linux/Mac or wmic on Windows
    let diskInfo: any = {};

    if (process.platform === 'win32') {
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8' });
      diskInfo = { raw: output };
    } else {
      const output = execSync('df -h /', { encoding: 'utf-8' });
      const lines = output.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        diskInfo = {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usePercent: parts[4],
        };
      }
    }

    return {
      name: 'disk',
      status: 'pass',
      message: 'Disk space check completed',
      data: {
        ...diskInfo,
        total: os.totalmem(),
        available: os.freemem(),
      },
      timestamp: Date.now(),
    };
  } catch (error: any) {
    return {
      name: 'disk',
      status: 'warning',
      message: `Disk check failed: ${error.message}`,
      timestamp: Date.now(),
    };
  }
}

async function checkNetwork(): Promise<DiagnosticCheck> {
  const interfaces = os.networkInterfaces();
  const activeInterfaces = Object.entries(interfaces)
    .filter(([_, addrs]) => addrs && addrs.length > 0)
    .map(([name, addrs]) => ({
      name,
      addresses: addrs?.map(addr => ({
        address: addr.address,
        family: addr.family,
        internal: addr.internal,
      })),
    }));

  return {
    name: 'network',
    status: activeInterfaces.length > 0 ? 'pass' : 'fail',
    message: `Found ${activeInterfaces.length} network interface(s)`,
    data: {
      interfaces: activeInterfaces,
      hostname: os.hostname(),
    },
    timestamp: Date.now(),
  };
}

async function checkDependencies(): Promise<DiagnosticCheck> {
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
      status: 'warning',
      message: 'No package.json found',
      timestamp: Date.now(),
    };
  }

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const nodeModules = path.join(process.cwd(), 'node_modules');

  // Check if node_modules exists (async)
  let nodeModulesExists = false;
  try {
    await fs.access(nodeModules);
    nodeModulesExists = true;
  } catch {
    nodeModulesExists = false;
  }

  const installed = nodeModulesExists
    ? (await fs.readdir(nodeModules)).filter(d => !d.startsWith('.'))
    : [];

  const missing = Object.keys(deps).filter(dep => !installed.includes(dep));

  return {
    name: 'dependencies',
    status: missing.length === 0 ? 'pass' : 'warning',
    message: missing.length === 0 ? 'All dependencies installed' : `${missing.length} missing dependencies`,
    data: {
      total: Object.keys(deps).length,
      installed: installed.length,
      missing,
    },
    timestamp: Date.now(),
  };
}

async function checkAgents(): Promise<DiagnosticCheck> {
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
      status: 'warning',
      message: 'No agents directory found',
      data: { active: 0, idle: 0 },
      timestamp: Date.now(),
    };
  }

  const agents = (await fs.readdir(agentDir)).filter(f => f.endsWith('.json'));

  return {
    name: 'agents',
    status: 'pass',
    message: `Found ${agents.length} agent(s)`,
    data: {
      active: agents.length,
      idle: 0,
      agents: agents.map(a => a.replace('.json', '')),
    },
    timestamp: Date.now(),
  };
}

async function checkPerformance(): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  // Simulate some work
  for (let i = 0; i < 1000000; i++) {
    Math.sqrt(i);
  }

  const duration = Date.now() - startTime;
  const memUsage = process.memoryUsage();

  // Detect bottlenecks
  const bottlenecks: string[] = [];
  if (memUsage.heapUsed > memUsage.heapTotal * 0.8) {
    bottlenecks.push('High memory usage');
  }
  if (os.loadavg()[0] / os.cpus().length > 0.8) {
    bottlenecks.push('High CPU load');
  }

  return {
    name: 'performance',
    status: bottlenecks.length === 0 ? 'pass' : 'warning',
    message: bottlenecks.length === 0 ? 'Performance OK' : `Found ${bottlenecks.length} bottleneck(s)`,
    data: {
      testDuration: duration,
      memory: memUsage,
      bottlenecks,
    },
    timestamp: Date.now(),
  };
}

function generateHTMLReport(report: any): string {
  const statusColor = (status: string) => {
    switch (status) {
      case 'pass': return '#4ade80';
      case 'warning': return '#fbbf24';
      case 'fail': return '#f87171';
      default: return '#6b7280';
    }
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diagnostics Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; background: #f9fafb; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { margin-top: 0; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .summary-card { padding: 20px; border-radius: 4px; background: #f3f4f6; }
    .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #6b7280; }
    .summary-card .value { font-size: 32px; font-weight: bold; }
    .checks { margin-top: 30px; }
    .check { padding: 15px; margin: 10px 0; border-left: 4px solid; border-radius: 4px; background: #f9fafb; }
    .check h3 { margin: 0 0 5px 0; }
    .check p { margin: 5px 0; color: #6b7280; }
    .timestamp { color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Diagnostics Report</h1>
    <p class="timestamp">Generated: ${new Date(report.timestamp).toLocaleString()}</p>

    <div class="summary">
      <div class="summary-card">
        <h3>Total Checks</h3>
        <div class="value">${report.summary.total}</div>
      </div>
      <div class="summary-card">
        <h3>Passed</h3>
        <div class="value" style="color: #4ade80;">${report.summary.passed}</div>
      </div>
      <div class="summary-card">
        <h3>Warnings</h3>
        <div class="value" style="color: #fbbf24;">${report.summary.warnings}</div>
      </div>
      <div class="summary-card">
        <h3>Failed</h3>
        <div class="value" style="color: #f87171;">${report.summary.failed}</div>
      </div>
    </div>

    <div class="checks">
      <h2>Diagnostic Checks</h2>
      ${report.checks.map((check: DiagnosticCheck) => `
        <div class="check" style="border-color: ${statusColor(check.status)};">
          <h3>${check.name}</h3>
          <p><strong>Status:</strong> ${check.status.toUpperCase()}</p>
          <p>${check.message}</p>
          ${check.data ? `<details><summary>View Details</summary><pre>${JSON.stringify(check.data, null, 2)}</pre></details>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
}
