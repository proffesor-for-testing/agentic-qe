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

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    stopCleanupTimer();
    await shutdownTokenTracking();
    if (httpServer) {
      await httpServer.stop();
    }
    if (server) {
      await server.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    stopCleanupTimer();
    await shutdownTokenTracking();
    if (httpServer) {
      await httpServer.stop();
    }
    if (server) {
      await server.stop();
    }
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
    // ADR-042: Initialize token tracking and optimization
    originalStderrWrite('[MCP] Initializing token tracking...\n');
    await bootstrapTokenTracking({
      enableOptimization: true,
      enablePersistence: true,
      verbose: process.env.AQE_VERBOSE === 'true',
    });

    // ADR-051: Initialize experience capture and unified memory BEFORE server starts.
    // This ensures all tool invocations (domain, memory, core) write to v3 memory.db
    // from the first request, rather than lazy-initializing on first domain tool call.
    originalStderrWrite('[MCP] Initializing experience capture...\n');
    await initializeExperienceCapture();

    // ADR-057: Initialize infrastructure self-healing
    originalStderrWrite('[MCP] Initializing infra-healing...\n');
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const playbookPath = resolve(__dirname, '../strange-loop/infra-healing/default-playbook.yaml');
      let playbookContent: string;
      try {
        playbookContent = readFileSync(playbookPath, 'utf-8');
      } catch {
        // Fallback for bundled environments where the YAML may not be at the resolved path
        playbookContent = '';
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
    } catch (infraError) {
      originalStderrWrite(`[MCP] WARNING: Infra-healing init failed: ${infraError}\n`);
      // Non-fatal — MCP server continues without infra-healing
    }

    // Auto-initialize fleet so tools work without requiring fleet_init call
    originalStderrWrite('[MCP] Auto-initializing fleet...\n');
    try {
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
    } catch (fleetError) {
      originalStderrWrite(`[MCP] WARNING: Fleet auto-init error: ${fleetError}\n`);
      // Non-fatal — tools will prompt user to call fleet_init manually
    }

    // Start the MCP server
    originalStderrWrite('[MCP] Starting server...\n');
    server = await quickStart({
      name: 'agentic-qe-v3',
      version,
    });
    originalStderrWrite('[MCP] Ready\n');

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
