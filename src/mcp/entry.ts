/**
 * Agentic QE v3 - MCP Server Entry Point
 *
 * Starts the MCP protocol server for stdio communication.
 * Also starts an HTTP server for AG-UI/A2A/A2UI protocols if AQE_HTTP_PORT is set.
 * Based on claude-flow's MCP pattern.
 *
 * Usage:
 *   npm run mcp
 *   npx tsx src/mcp/entry.ts
 *
 * Environment Variables:
 *   AQE_HTTP_PORT: Port for HTTP server (0 = disabled, default: 0)
 *   AQE_VERBOSE: Enable verbose logging
 */

import { quickStart, MCPProtocolServer } from './protocol-server';
import { createHTTPServer, type HTTPServer } from './http-server.js';
import { createRequire } from 'module';
import { bootstrapTokenTracking, shutdownTokenTracking } from '../init/token-bootstrap.js';
import { initializeExperienceCapture, stopCleanupTimer } from '../learning/experience-capture-middleware.js';
import { createInfraHealingOrchestratorSync, ShellCommandRunner } from '../strange-loop/infra-healing/index.js';
import { setInfraHealingOrchestrator, handleFleetInit } from './handlers/index.js';
import { parallelPrefetch } from '../boot/parallel-prefetch.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

let server: MCPProtocolServer | null = null;
let httpServer: HTTPServer | null = null;

async function main(): Promise<void> {
  // Output startup message BEFORE suppressing stderr (Claude Code health check needs this)
  const version = pkg.version;
  process.stderr.write(`[agentic-qe-v3] MCP server starting v${version}\n`);

  // Handle graceful shutdown (includes QualityDaemon)
  const shutdownDaemon = async () => {
    try {
      const { getDaemon } = await import('../workers/daemon.js');
      const daemon = getDaemon();
      // Stop quality daemon first (if started)
      try { const qd = daemon.getQualityDaemon(); await qd.stop(); } catch { /* not started */ }
      await daemon.stop();
    } catch { /* ignore */ }
  };

  process.on('SIGINT', async () => {
    stopCleanupTimer();
    await shutdownTokenTracking();
    await shutdownDaemon();
    if (httpServer) {
      await httpServer.stop();
    }
    if (server) {
      await server.stop();
    }
    // Close data stores AFTER server has drained connections
    try { const { resetSharedRvfDualWriter } = await import('../integrations/ruvector/shared-rvf-dual-writer.js'); resetSharedRvfDualWriter(); } catch { /* ignore */ }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    stopCleanupTimer();
    await shutdownTokenTracking();
    await shutdownDaemon();
    if (httpServer) {
      await httpServer.stop();
    }
    if (server) {
      await server.stop();
    }
    // Close data stores AFTER server has drained connections
    try { const { resetSharedRvfDualWriter } = await import('../integrations/ruvector/shared-rvf-dual-writer.js'); resetSharedRvfDualWriter(); } catch { /* ignore */ }
    process.exit(0);
  });

  // Catch unhandled exceptions/rejections to prevent MCP connection drops
  process.on('uncaughtException', (error) => {
    process.stderr.write(`[AQE] FATAL uncaught exception: ${error.message}\n`);
    // Don't exit — keep MCP connection alive
  });
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`[AQE] WARN unhandled rejection: ${reason}\n`);
  });

  // Suppress stderr output in MCP mode (stdio expects clean JSON-RPC)
  // This must come AFTER the startup message for Claude Code health checks
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  // Allow more message types through for better debugging
  const allowedPatterns = ['FATAL', '[MCP]', 'ERROR', 'WARN', '[AQE]', 'Deprecation'];
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    // Only write to stderr if it matches allowed patterns
    if (typeof chunk === 'string') {
      if (allowedPatterns.some(pattern => chunk.includes(pattern))) {
        return originalStderrWrite(chunk);
      }
    }
    return true;
  }) as typeof process.stderr.write;

  try {
    // IMP-06: Run independent init tasks in parallel via parallelPrefetch.
    // Token tracking, experience capture, infra-healing, and fleet init are
    // all independent — total startup time is bounded by the slowest task
    // rather than the sum of all tasks.
    originalStderrWrite('[MCP] Initializing subsystems in parallel...\n');
    const prefetchResult = await parallelPrefetch([
      {
        // ADR-042: Initialize token tracking and optimization
        name: 'token-tracking',
        fn: async () => {
          await bootstrapTokenTracking({
            enableOptimization: true,
            enablePersistence: true,
            verbose: process.env.AQE_VERBOSE === 'true',
          });
        },
      },
      {
        // ADR-051: Initialize experience capture and unified memory BEFORE server starts.
        // This ensures all tool invocations (domain, memory, core) write to v3 memory.db
        // from the first request, rather than lazy-initializing on first domain tool call.
        name: 'experience-capture',
        fn: async () => {
          await initializeExperienceCapture();
        },
      },
      {
        // ADR-057: Initialize infrastructure self-healing
        name: 'infra-healing',
        fn: async () => {
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          const playbookPath = resolve(__dirname, '../strange-loop/infra-healing/default-playbook.yaml');
          let playbookContent: string;
          try {
            playbookContent = readFileSync(playbookPath, 'utf-8');
          } catch {
            // Fallback for bundled environments where the YAML may not be at the resolved path
            playbookContent = [
              'services:',
              '  postgres:',
              '    healthCheck: "pg_isready -h localhost -p 5432"',
              '    recover: "echo postgres-recovery-placeholder"',
              '    verify: "pg_isready -h localhost -p 5432"',
              '  redis:',
              '    healthCheck: "redis-cli ping"',
              '    recover: "echo redis-recovery-placeholder"',
              '    verify: "redis-cli ping"',
              '  node:',
              '    healthCheck: "node --version"',
              '    recover: "echo node-recovery-placeholder"',
              '    verify: "node --version"',
            ].join('\n');
          }

          if (playbookContent) {
            const infraOrchestrator = createInfraHealingOrchestratorSync({
              commandRunner: new ShellCommandRunner(),
              playbook: playbookContent,
            });
            setInfraHealingOrchestrator(infraOrchestrator);
            originalStderrWrite(`[MCP] Infra-healing ready (${infraOrchestrator.getPlaybook().listServices().length} services)\n`);
          } else {
            originalStderrWrite('[MCP] Infra-healing skipped: no playbook found\n');
          }
        },
      },
      {
        // Auto-initialize fleet so tools work without requiring fleet_init call
        name: 'fleet-init',
        fn: async () => {
          const fleetResult = await handleFleetInit({
            topology: 'hierarchical',
            maxAgents: 15,
            memoryBackend: 'hybrid',
            lazyLoading: true,
          });
          if (fleetResult.success) {
            originalStderrWrite(`[MCP] Fleet ready: ${fleetResult.data?.fleetId}\n`);
          } else {
            originalStderrWrite(`[MCP] WARNING: Fleet auto-init failed: ${fleetResult.error}\n`);
          }
        },
      },
    ]);

    // Log prefetch results
    if (prefetchResult.completedTasks.length > 0) {
      originalStderrWrite(`[MCP] Initialized: ${prefetchResult.completedTasks.join(', ')} (${prefetchResult.totalTimeMs.toFixed(0)}ms)\n`);
    }
    for (const failed of prefetchResult.failedTasks) {
      originalStderrWrite(`[MCP] WARNING: ${failed.name} init failed: ${failed.error}\n`);
    }

    // Start the MCP server
    originalStderrWrite('[MCP] Starting server...\n');
    server = await quickStart({
      name: 'agentic-qe-v3',
      version,
    });
    originalStderrWrite('[MCP] Ready\n');

    // IMP-10: Start background workers (heartbeat scheduler, etc.)
    try {
      const { getDaemon } = await import('../workers/daemon.js');
      const daemon = getDaemon({ autoStart: false });
      await daemon.start();
      const status = daemon.getStatus();
      originalStderrWrite(`[MCP] Background workers started (${status.workerManager.totalWorkers} workers)\n`);

      // IMP-10: Start QualityDaemon with persistent memory (Finding 1 & 2 resolution)
      try {
        const { UnifiedMemoryManager } = await import('../kernel/unified-memory.js');
        const { PersistentWorkerMemory } = await import('../workers/quality-daemon/persistent-memory.js');
        const { isPrivateIp } = await import('../hooks/security/ssrf-guard.js');
        const unifiedMemory = await UnifiedMemoryManager.getInstanceAsync();
        const persistentMemory = new PersistentWorkerMemory(unifiedMemory);
        const qualityDaemon = daemon.getQualityDaemon({
          notifications: {
            // IMP-07 SSRF guard: block private IPs in webhook URLs (Finding 5)
            urlValidator: (url: string) => {
              try {
                const parsed = new URL(url);
                const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
                return !isPrivateIp(hostname);
              } catch {
                return false;
              }
            },
          },
        });
        await qualityDaemon.start(persistentMemory);
        originalStderrWrite(`[MCP] Quality daemon started\n`);
      } catch (qdError) {
        originalStderrWrite(`[MCP] WARNING: Quality daemon failed to start: ${qdError}\n`);
        // Non-fatal — MCP continues without quality daemon
      }
    } catch (daemonError) {
      originalStderrWrite(`[MCP] WARNING: Background workers failed to start: ${daemonError}\n`);
      // Non-fatal — MCP server continues without background workers
    }

    // Start HTTP server for AG-UI/A2A/A2UI if port is specified
    const httpPort = parseInt(process.env.AQE_HTTP_PORT || '0', 10);
    if (httpPort > 0) {
      try {
        originalStderrWrite(`[AQE] Starting HTTP server on port ${httpPort}...\n`);
        httpServer = createHTTPServer({
          // Share event adapter with MCP server for event streaming
          eventAdapter: server.getEventAdapter(),
        });
        await httpServer.start(httpPort);
        originalStderrWrite(`[AQE] HTTP server ready on port ${httpPort}\n`);
        originalStderrWrite(`[AQE] Protocols: AG-UI (SSE), A2A (Discovery), A2UI (Surfaces)\n`);
        originalStderrWrite(`[AQE] Endpoints:\n`);
        originalStderrWrite(`[AQE]   GET  /.well-known/agent.json - Platform discovery\n`);
        originalStderrWrite(`[AQE]   POST /agent/stream          - AG-UI SSE streaming\n`);
        originalStderrWrite(`[AQE]   POST /a2a/tasks             - Task submission\n`);
        originalStderrWrite(`[AQE]   GET  /health                - Health check\n`);
      } catch (httpError) {
        originalStderrWrite(`[AQE] WARNING: HTTP server failed to start: ${httpError}\n`);
        // Don't fail startup, MCP server is primary
      }
    }

    // Keep the process alive - the server listens on stdin
    // The process will exit when stdin closes or SIGINT/SIGTERM is received
  } catch (error) {
    // Write error to stderr for debugging (won't interfere with JSON-RPC)
    originalStderrWrite(`[MCP Entry] Fatal error: ${error}\n`);
    process.exit(1);
  }
}

main();
