/**
 * MemoryManagerFactory - Singleton Pattern for Shared Memory Management
 *
 * Resolves the persistence issue where multiple SwarmMemoryManager instances
 * cause data fragmentation - data written to one instance is not visible to others.
 *
 * Key Issues Fixed:
 * 1. Multiple isolated instances (MCP server, AgentRegistry, Phase2Tools each created their own)
 * 2. sql.js persistence model requires explicit save()/close() calls
 * 3. Ensures all components share the same database connection
 *
 * @module MemoryManagerFactory
 * @version 1.0.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { SwarmMemoryManager } from './SwarmMemoryManager.js';

// Singleton instances
let sharedMemoryManager: SwarmMemoryManager | null = null;
let sharedMemoryManagerPath: string | null = null;
let initializationPromise: Promise<SwarmMemoryManager> | null = null;

/**
 * Resolve database path - ensures we use an absolute path in user's project
 *
 * Database should be in the USER'S project directory (process.cwd()),
 * NOT in the package installation directory.
 */
export function resolveDbPath(inputPath?: string): string {
  // If no path provided, use default in user's project
  if (!inputPath) {
    return path.join(process.cwd(), '.agentic-qe', 'memory.db');
  }

  // Special case: in-memory database
  if (inputPath === ':memory:') {
    return inputPath;
  }

  // Check environment variable override
  const envPath = process.env.AQE_DB_PATH;
  if (envPath) {
    // If absolute, use as-is
    if (path.isAbsolute(envPath)) {
      return envPath;
    }
    // If relative, resolve from cwd
    return path.join(process.cwd(), envPath);
  }

  // If already absolute, return as-is
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  // Convert relative path to absolute using cwd (user's project)
  return path.join(process.cwd(), inputPath);
}

/**
 * Ensure the database directory exists
 */
export function ensureDbDirectoryExists(dbPath: string): void {
  if (dbPath === ':memory:') {
    return;
  }

  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[MemoryManagerFactory] Created database directory: ${dbDir}`);
  }
}

/**
 * Get the shared SwarmMemoryManager singleton
 *
 * Ensures all components use the same database connection for consistent
 * persistence across MCP server, AgentRegistry, handlers, and agents.
 *
 * @param dbPath Optional database path (relative paths resolved from cwd)
 * @returns Shared SwarmMemoryManager instance
 */
export function getSharedMemoryManager(dbPath?: string): SwarmMemoryManager {
  const resolvedPath = resolveDbPath(dbPath);

  // If singleton exists with same path, return it
  if (sharedMemoryManager && sharedMemoryManagerPath === resolvedPath) {
    return sharedMemoryManager;
  }

  // If singleton exists with different path, warn but return existing
  // (prevents multiple database connections causing fragmentation)
  if (sharedMemoryManager && sharedMemoryManagerPath !== resolvedPath) {
    console.warn(
      `[MemoryManagerFactory] Memory manager already initialized with path: ${sharedMemoryManagerPath}. ` +
      `Ignoring new path: ${resolvedPath}. Use resetSharedMemoryManager() to change path.`
    );
    return sharedMemoryManager;
  }

  // Create new singleton
  ensureDbDirectoryExists(resolvedPath);

  console.log(`[MemoryManagerFactory] Creating shared memory manager at: ${resolvedPath}`);
  sharedMemoryManager = new SwarmMemoryManager(resolvedPath);
  sharedMemoryManagerPath = resolvedPath;

  return sharedMemoryManager;
}

/**
 * Initialize the shared memory manager asynchronously
 *
 * This method ensures only ONE initialization happens even if called multiple times.
 * All callers will receive the same initialized instance.
 *
 * @param dbPath Optional database path
 * @returns Promise that resolves to the initialized SwarmMemoryManager
 */
export async function initializeSharedMemoryManager(dbPath?: string): Promise<SwarmMemoryManager> {
  // If already initializing, return the existing promise
  if (initializationPromise) {
    return initializationPromise;
  }

  // If already initialized, return the instance
  if (sharedMemoryManager) {
    const resolvedPath = resolveDbPath(dbPath);
    if (sharedMemoryManagerPath === resolvedPath) {
      return sharedMemoryManager;
    }
  }

  // Start initialization
  initializationPromise = (async () => {
    const manager = getSharedMemoryManager(dbPath);
    await manager.initialize();
    console.log(`[MemoryManagerFactory] Shared memory manager initialized at: ${sharedMemoryManagerPath}`);
    return manager;
  })();

  try {
    const result = await initializationPromise;
    return result;
  } catch (error) {
    // Reset on failure so it can be retried
    initializationPromise = null;
    throw error;
  }
}

/**
 * Check if shared memory manager is initialized
 */
export function hasSharedMemoryManager(): boolean {
  return sharedMemoryManager !== null;
}

/**
 * Get the path of the current shared memory manager
 */
export function getSharedMemoryManagerPath(): string | null {
  return sharedMemoryManagerPath;
}

/**
 * Reset the shared memory manager singleton
 *
 * Use with caution - this should only be called during testing or
 * when explicitly changing database paths.
 */
export async function resetSharedMemoryManager(): Promise<void> {
  if (sharedMemoryManager) {
    try {
      await sharedMemoryManager.close();
    } catch (error) {
      console.warn('[MemoryManagerFactory] Error closing memory manager:', error);
    }
    sharedMemoryManager = null;
    sharedMemoryManagerPath = null;
    initializationPromise = null;
    console.log('[MemoryManagerFactory] Shared memory manager reset');
  }
}

/**
 * Get database path info for debugging
 */
export function getDbPathInfo(): {
  defaultPath: string;
  currentSharedPath: string | null;
  processCwd: string;
  envPath: string | undefined;
} {
  return {
    defaultPath: resolveDbPath(),
    currentSharedPath: sharedMemoryManagerPath,
    processCwd: process.cwd(),
    envPath: process.env.AQE_DB_PATH
  };
}

/**
 * Setup process exit handlers to ensure database is properly closed
 *
 * This is critical for sql.js which only persists to disk on close()
 */
export function setupExitHandlers(): void {
  const cleanup = async () => {
    if (sharedMemoryManager) {
      console.log('[MemoryManagerFactory] Closing database on process exit...');
      try {
        await sharedMemoryManager.close();
        console.log('[MemoryManagerFactory] Database closed successfully');
      } catch (error) {
        console.error('[MemoryManagerFactory] Error closing database:', error);
      }
    }
  };

  // Handle normal exit
  process.on('exit', () => {
    // Can't use async here, but close() should be synchronous for better-sqlite3
    if (sharedMemoryManager) {
      try {
        // SwarmMemoryManager.close() is async but better-sqlite3 close is sync
        (sharedMemoryManager as any).db?.close?.();
      } catch (error) {
        console.error('[MemoryManagerFactory] Error on exit:', error);
      }
    }
  });

  // Handle termination signals
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('[MemoryManagerFactory] Uncaught exception:', error);
    await cleanup();
    process.exit(1);
  });
}

// Setup exit handlers when module is loaded
setupExitHandlers();
