/**
 * MCP Command - Start the MCP Protocol Server
 *
 * This command starts the Agentic QE MCP server for integration with
 * Claude Code, Claude Desktop, and other MCP clients.
 *
 * Usage:
 *   aqe mcp              # Start MCP server on stdio
 *   aqe mcp --http 8080  # Also start HTTP server for AG-UI/A2A
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { findPackageRoot } from '../../init/find-package-root.js';

/**
 * Create the MCP command
 */
export function createMcpCommand(): Command {
  const cmd = new Command('mcp')
    .description('Start the MCP protocol server for Claude Code integration')
    .option('--http <port>', 'Also start HTTP server for AG-UI/A2A protocols', '0')
    .option('--verbose', 'Enable verbose logging')
    .action(async (options) => {
      // Set up environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        AQE_HTTP_PORT: options.http || '0',
      };

      if (options.verbose) {
        env.AQE_VERBOSE = 'true';
      }

      // Find the MCP entry point
      const entryPath = findMcpEntry();

      if (!entryPath) {
        console.error('Error: Could not find MCP server entry point');
        console.error('Make sure agentic-qe is properly installed');
        process.exit(1);
      }

      // Determine how to run the entry point
      const isBundle = entryPath.endsWith('.js');
      const command = 'node';
      const args = isBundle
        ? [entryPath]
        : ['--import', 'tsx', entryPath];

      // Spawn the MCP server, inheriting stdio for JSON-RPC communication
      const child = spawn(command, args, {
        env,
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      child.on('error', (error) => {
        console.error('Failed to start MCP server:', error.message);
        process.exit(1);
      });

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });

      // Forward signals to child
      process.on('SIGINT', () => child.kill('SIGINT'));
      process.on('SIGTERM', () => child.kill('SIGTERM'));
    });

  return cmd;
}

/**
 * Find the MCP entry point.
 *
 * Resolution order (fix/init-v3-9-3 Fix 4):
 *   1. Package root (found by walking up to the nearest package.json with
 *      name=agentic-qe) + dist/mcp/bundle.js. Survives esbuild code-splitting
 *      that places CLI chunks under dist/cli/chunks/ (3+ levels deep).
 *   2. Legacy sibling paths relative to this file (dev mode with tsx).
 *   3. Consumer's node_modules (when agentic-qe is a transitive dependency).
 *
 * The bug this fixes: v3.9.0 switched esbuild to code-splitting which broke
 * the fixed `__dirname + '..'` paths the CLI used to locate its own bundle.
 * On global installs the MCP command died with "Could not find MCP server
 * entry point" — a regression of the v3.7.10 fix.
 */
function findMcpEntry(): string | null {
  const candidates: string[] = [];

  // 1. Find the package root via walk-up. This is the canonical path
  //    and works regardless of bundle depth.
  const packageRoot = findPackageRoot(import.meta.url);
  if (packageRoot) {
    candidates.push(
      join(packageRoot, 'dist', 'mcp', 'bundle.js'),
      join(packageRoot, 'dist', 'mcp', 'entry.js'),
      join(packageRoot, 'src', 'mcp', 'entry.ts'), // dev with tsx
    );
  }

  // 2. Legacy sibling-path fallback (dev tree without a package.json walk hit).
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  candidates.push(
    join(__dirname, '..', 'mcp', 'bundle.js'),
    join(__dirname, '..', 'mcp', 'entry.js'),
    join(__dirname, '..', 'mcp', 'entry.ts'),
    // Extra hop for chunk-split layouts: dist/cli/chunks -> dist/mcp
    join(__dirname, '..', '..', 'mcp', 'bundle.js'),
  );

  // 3. Consumer's node_modules (transitive dependency scenarios).
  candidates.push(
    join(process.cwd(), 'node_modules', 'agentic-qe', 'dist', 'mcp', 'bundle.js'),
    join(process.cwd(), 'node_modules', 'agentic-qe', 'dist', 'mcp', 'entry.js'),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export default createMcpCommand;
