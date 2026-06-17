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
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
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
      // Configure the server via env BEFORE importing the entry — entry.ts
      // reads these at startup.
      process.env.AQE_HTTP_PORT = options.http || '0';
      if (options.verbose) {
        process.env.AQE_VERBOSE = 'true';
      }

      // Find the MCP entry point
      const entryPath = findMcpEntry();

      if (!entryPath) {
        console.error('Error: Could not find MCP server entry point');
        console.error('Make sure agentic-qe is properly installed');
        process.exit(1);
      }

      // Run the MCP server IN-PROCESS instead of spawning a child (issue #528).
      //
      // The old path spawned `node <entry>` with stdio:'inherit'. With a piped
      // stdin (any programmatic MCP client), the grandchild saw `stdin-eof`
      // immediately after answering `initialize` and the Issue #513 stdin-EOF
      // guard in entry.ts shut it down before it could serve `tools/list`.
      // Importing the entry runs its top-level `main()`, which starts the
      // server on THIS process's real stdio and installs its own
      // signal/stdin shutdown handlers. The dynamic import resolves as soon as
      // module evaluation kicks off `main()`; the server then keeps the
      // process alive on stdin. This matches the working `aqe-mcp` bin, which
      // runs the bundle directly.
      try {
        await import(pathToFileURL(entryPath).href);
      } catch (error) {
        console.error('Failed to start MCP server:', (error as Error).message);
        process.exit(1);
      }

      // entry.ts kicks off `main()` fire-and-forget, so the import above
      // resolves while the server's async init is still in flight. Keep this
      // action pending forever so the CLI wrapper doesn't return (and exit)
      // out from under the server. entry.ts owns shutdown — its signal and
      // stdin-EOF handlers call process.exit when the client disconnects.
      await new Promise<never>(() => { /* server owns the process lifecycle */ });
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
