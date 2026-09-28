import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';

/**
 * Build the readiness check for `aqe memory` subcommands.
 *
 * Memory operations only need the project memory backend, so this opens
 * .agentic-qe/memory.db directly instead of booting the full v3 system
 * (kernel, Queen Coordinator, every domain coordinator, SONA engines,
 * DreamScheduler). If a fleet is already running in this process, its kernel
 * memory is used as before.
 */
export function createEnsureMemoryBackend(context: CLIContext): () => Promise<boolean> {
  let ready: Promise<boolean> | null = null;

  const open = async (): Promise<boolean> => {
    try {
      const [{ findProjectRoot }, { createKernelMemoryBackend }, { setStandaloneMemoryBackend }] =
        await Promise.all([
          import('../../kernel/project-root.js'),
          import('../../kernel/hybrid-backend.js'),
          import('../../mcp/handlers/memory-handlers.js'),
        ]);

      // Same data directory the kernel resolves when auto-initializing.
      const dataDir = path.join(findProjectRoot(), '.agentic-qe');
      fs.mkdirSync(dataDir, { recursive: true });

      const backend = createKernelMemoryBackend(dataDir);
      await backend.initialize();
      setStandaloneMemoryBackend(backend);
      return true;
    } catch (error) {
      console.error(chalk.red(`  Failed to open memory store: ${toErrorMessage(error)}`));
      return false;
    }
  };

  return () => {
    if (context.initialized) return Promise.resolve(true);
    ready ??= open();
    return ready;
  };
}
