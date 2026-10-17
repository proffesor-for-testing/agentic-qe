/**
 * Phase 10: Workers
 * Configures background workers for continuous monitoring
 */

import { existsSync, mkdirSync } from 'fs';
import { writeFileIfChanged, writeJsonIfChanged } from '../idempotent-write.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import type { AQEInitConfig } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface WorkerRegistration {
  name: string;
  enabled: boolean;
  interval: number;
  lastRun: string | null;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface WorkersResult {
  workersDir: string;
  workersConfigured: number;
  registryPath: string;
  daemonStarted: boolean;
  daemonPid: number | null;
  daemonError?: string;
}

/**
 * Workers phase - configures background workers
 */
export class WorkersPhase extends BasePhase<WorkersResult> {
  readonly name = 'workers';
  readonly description = 'Configure background workers';
  readonly order = 100;
  readonly critical = false;
  readonly requiresPhases = ['configuration'] as const;

  async shouldRun(context: InitContext): Promise<boolean> {
    // Background workers persist to the SQLite DB, which is absent in
    // database-free mode.
    if (context.options.memoryBackend === 'memory') return false;
    const config = context.config as AQEInitConfig;
    return config?.workers?.daemonAutoStart && (config?.workers?.enabled?.length ?? 0) > 0;
  }

  protected async run(context: InitContext): Promise<WorkersResult> {
    const config = context.config as AQEInitConfig;
    const { projectRoot } = context;

    if (!config.workers.daemonAutoStart || config.workers.enabled.length === 0) {
      return {
        workersDir: '',
        workersConfigured: 0,
        registryPath: '',
        daemonStarted: false,
        daemonPid: null,
      };
    }

    // Create workers directory
    const workersDir = join(projectRoot, '.agentic-qe', 'workers');
    if (!existsSync(workersDir)) {
      mkdirSync(workersDir, { recursive: true });
    }

    // Default intervals for all 11 workers (ADR-014)
    const defaultIntervals: Record<string, number> = {
      // Learning & Pattern Workers
      'learning-consolidation': 1800000, // 30 min - Pattern consolidation, dream cycles
      'pattern-consolidator': 1800000,   // Alias for learning-consolidation

      // Test Quality Workers
      'test-health': 300000,             // 5 min - Test suite health
      'coverage-tracker': 600000,        // 10 min - Coverage trends
      'coverage-gap-scanner': 600000,    // Alias for coverage-tracker
      'flaky-detector': 900000,          // 15 min - Flaky test detection
      'flaky-test-detector': 900000,     // Alias for flaky-detector

      // Security & Quality Workers
      'security-scan': 1800000,          // 30 min - Vulnerability scanning
      'quality-gate': 300000,            // 5 min - Gate evaluation
      'compliance-checker': 1800000,     // 30 min - ADR/DDD compliance

      // ML & Prediction Workers
      'defect-predictor': 900000,        // 15 min - ML defect prediction
      'regression-monitor': 600000,      // 10 min - Regression watching
      'routing-accuracy-monitor': 900000,// 15 min - Routing accuracy

      // Performance Workers
      'performance-baseline': 3600000,   // 1 hour - Performance tracking

      // Sync Workers
      'cloud-sync': 300000,              // 5 min - Cloud synchronization
    };

    // Build worker registry
    const workerRegistry: Record<string, WorkerRegistration> = {};

    for (const workerName of config.workers.enabled) {
      workerRegistry[workerName] = {
        name: workerName,
        enabled: true,
        interval: config.workers.intervals[workerName] || defaultIntervals[workerName] || 60000,
        lastRun: null,
        status: 'pending',
      };
    }

    // Write registry
    const registryPath = join(workersDir, 'registry.json');
    const registryData = {
      version: config.version,
      maxConcurrent: config.workers.maxConcurrent,
      workers: workerRegistry,
      createdAt: new Date().toISOString(),
      daemonPid: null,
    };
    // #778: an unchanged registry keeps its bytes and original createdAt.
    writeJsonIfChanged(registryPath, registryData, [['createdAt']]);

    // Write individual worker configs
    for (const workerName of config.workers.enabled) {
      const workerConfigPath = join(workersDir, `${workerName}.json`);
      const workerConfig = {
        name: workerName,
        enabled: true,
        interval: config.workers.intervals[workerName] || defaultIntervals[workerName] || 60000,
        projectRoot,
        dataDir: join(projectRoot, '.agentic-qe', 'data'),
        createdAt: new Date().toISOString(),
      };
      writeJsonIfChanged(workerConfigPath, workerConfig, [['createdAt']]);
    }

    // Write cross-platform daemon startup script
    const daemonScriptPath = join(workersDir, 'start-daemon.cjs');
    const daemonScript = `#!/usr/bin/env node
// AQE v3 Worker Daemon Startup Script (cross-platform)
// Generated by aqe init
// Starts the MCP server with background workers enabled

const fs = require('fs');
const { existsSync, readFileSync } = fs;
const { join, dirname } = require('path');
const { spawn } = require('child_process');

const projectRoot = join(__dirname, '..', '..');
const workersDir = join(projectRoot, '.agentic-qe', 'workers');
const pidFile = join(workersDir, 'daemon.pid');
const logFile = join(workersDir, 'daemon.log');

// A repository can commit .agentic-qe, workers/ or a file in it as a symlink.
// Never write through one (#970): real directories only, appends only to a
// regular file (lstat + O_NOFOLLOW where the platform has it), and the pid file
// is replaced by rename instead of being written in place.
function isRealDir(d) { try { const s = fs.lstatSync(d); return s.isDirectory() && !s.isSymbolicLink(); } catch { return false; } }
function isRegularOrAbsent(f) { try { return fs.lstatSync(f).isFile(); } catch (e) { return !!e && e.code === 'ENOENT'; } }
if (!isRealDir(join(projectRoot, '.agentic-qe')) || !isRealDir(workersDir)) {
  console.error('AQE v3 Worker Daemon not started: .agentic-qe/workers must be a real directory, not a symlink');
  process.exit(1);
}
function appendFileSync(file, data) {
  if (!isRegularOrAbsent(file)) return;
  const c = fs.constants;
  let fd;
  try {
    fd = fs.openSync(file, c.O_APPEND | c.O_CREAT | c.O_WRONLY | (c.O_NOFOLLOW || 0), 0o644);
    fs.writeSync(fd, data);
  } catch {} finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch {} } }
}
function writeFileSync(file, data) {
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  try { fs.writeFileSync(tmp, data, { flag: 'wx' }); fs.renameSync(tmp, file); }
  catch { try { fs.unlinkSync(tmp); } catch {} }
}

// Check if already running (only trust a regular pid file, never a link target)
if (existsSync(pidFile) && isRegularOrAbsent(pidFile)) {
  const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
  try { process.kill(pid, 0); console.log('Daemon already running (PID: ' + pid + ')'); process.exit(0); } catch {}
}

const ts = new Date().toISOString();
appendFileSync(logFile, '[' + ts + '] Starting AQE v3 Worker Daemon...\\n');

// Find the best way to run aqe-mcp.
//
// #488 B.1: candidate ordering matters for the pidfile contract. When we
// spawn the real MCP binary directly, child.pid is the long-lived process
// — \`process.kill(pid, 0)\` against the pidfile correctly reports liveness.
// When we fall back to \`npx --yes agentic-qe mcp\`, child.pid is the npx
// wrapper PID, which exits as soon as it has forked the real bundle. The
// pidfile then points at a dead process and idempotency checks misbehave.
//
// We try in order: local .bin → local node_modules bundle → global install
// via require.resolve → npx wrapper (last resort, with the caveat above).
const candidates = [
  join(projectRoot, 'node_modules', '.bin', 'aqe-mcp'),
  join(projectRoot, 'node_modules', 'agentic-qe', 'dist', 'mcp', 'bundle.js'),
];

// Probe globally-installed agentic-qe (npm install -g) via require.resolve.
// This is the case the npx fallback used to silently cover with a bad PID.
try {
  candidates.push(require.resolve('agentic-qe/dist/mcp/bundle.js'));
} catch {
  // Not globally installed — fall through to npx fallback below.
}

let mcpCmd, mcpArgs;
const binCandidate = candidates.find(c => existsSync(c));

if (binCandidate && binCandidate.endsWith('bundle.js')) {
  mcpCmd = process.execPath;
  mcpArgs = [binCandidate];
} else if (binCandidate) {
  mcpCmd = binCandidate;
  mcpArgs = [];
} else {
  // Windows (#872): npx is npx.cmd, which spawn() refuses to start without a
  // shell (EINVAL since CVE-2024-27980). Run npm's bundled npx CLI via node.
  const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (process.platform === 'win32' && !existsSync(npxCli)) {
    appendFileSync(logFile, '[' + ts + '] ERROR: no AQE MCP bundle found and npx-cli.js is missing next to node.exe; install agentic-qe locally (npm install -D agentic-qe).\\n');
    console.error('AQE v3 Worker Daemon not started: agentic-qe MCP bundle not found (see ' + logFile + ')');
    process.exit(1);
  }
  mcpCmd = process.platform === 'win32' ? process.execPath : 'npx';
  mcpArgs = process.platform === 'win32'
    ? [npxCli, '--yes', 'agentic-qe', 'mcp']
    : ['--yes', 'agentic-qe', 'mcp'];
  appendFileSync(logFile, '[' + ts + '] WARNING: using npx fallback — daemon.pid will point at the npx wrapper, not the MCP server. \`aqe daemon status\` may misreport liveness after the wrapper exits.\\n');
}

appendFileSync(logFile, '[' + ts + '] Using: ' + mcpCmd + ' ' + mcpArgs.join(' ') + '\\n');

// #1066: keep a user's AQE_WORKERS_ENABLED (for example false) instead of forcing it on.
const env = { ...process.env, AQE_STORAGE_PATH: '.agentic-qe', AQE_LEARNING_ENABLED: 'true', AQE_WORKERS_ENABLED: process.env.AQE_WORKERS_ENABLED ?? 'true', AQE_HTTP_PORT: '0' };
const child = spawn(mcpCmd, mcpArgs, { cwd: projectRoot, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', d => appendFileSync(logFile, d));
child.stderr.on('data', d => appendFileSync(logFile, d));
child.unref();

writeFileSync(pidFile, String(child.pid));
appendFileSync(logFile, '[' + ts + '] Daemon started with PID: ' + child.pid + '\\n');
console.log('AQE v3 Worker Daemon started (PID: ' + child.pid + ')');
console.log('Log file: ' + logFile);
console.log('To stop: node ' + join(workersDir, 'stop-daemon.cjs'));
`;
    writeFileIfChanged(daemonScriptPath, daemonScript);

    // Also write a cross-platform stop script
    const stopScriptPath = join(workersDir, 'stop-daemon.cjs');
    const stopScript = `#!/usr/bin/env node
// AQE v3 Worker Daemon Stop Script (cross-platform)
// Generated by aqe init

const { existsSync, readFileSync, unlinkSync } = require('fs');
const { join } = require('path');

const workersDir = join(__dirname);
const pidFile = join(workersDir, 'daemon.pid');

if (!existsSync(pidFile)) { console.log('No PID file found - daemon may not be running'); process.exit(0); }

const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
try {
  process.kill(pid, 0); // Check if alive
  console.log('Stopping daemon (PID: ' + pid + ')...');
  process.kill(pid, 'SIGTERM');
  try { unlinkSync(pidFile); } catch {}
  console.log('Daemon stopped');
} catch {
  console.log('Daemon not running (stale PID file)');
  try { unlinkSync(pidFile); } catch {}
}
`;
    writeFileIfChanged(stopScriptPath, stopScript);

    context.services.log(`  Workers dir: ${workersDir}`);
    context.services.log(`  Workers: ${config.workers.enabled.join(', ')}`);
    context.services.log(`  Registry: ${registryPath}`);

    // MCP daemon startup is Claude Code's job, not init's.
    //
    // fix/init-v3-9-3 Fix 3: Previously this phase spawned `aqe mcp` as
    // a detached child to pre-warm the MCP server. That spawn raced the
    // init process for the same RVF / native HNSW file locks, producing
    // the cascade of errors seen in v3.9.1 and v3.9.2:
    //   • RVF error 0x0303: FsyncFailed (child couldn't open patterns.rvf)
    //   • VectorDb creation failed: Database already open
    //     (the @ruvector/router lock is gone post #399 / ADR-090, but
    //     the RVF lock still exists)
    //   • Error: Could not find MCP server entry point
    //
    // The canonical path is .mcp.json (written by phase 08). Claude Code
    // reads it and starts `aqe mcp` on demand when a user actually opens
    // the project. Users who want to run the daemon manually can use the
    // generated `.agentic-qe/workers/start-daemon.cjs` helper script or
    // the `aqe daemon` subcommand.
    return {
      workersDir,
      workersConfigured: config.workers.enabled.length,
      registryPath,
      daemonStarted: false,
      daemonPid: null,
    };
  }

}

// Instance exported from index.ts
