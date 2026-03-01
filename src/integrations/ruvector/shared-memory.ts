/**
 * Agentic QE v3 - Shared Memory Integration
 *
 * Provides shared memory functionality for cross-agent communication
 * using the RuVector server. This module integrates with fleet initialization
 * to enable shared vector memory when available.
 *
 * ## Current Status
 *
 * The RuVector server REST API for vector operations is "Coming Soon".
 * This module provides the integration point and will work automatically
 * once the server API is available.
 *
 * ## Usage with Fleet Initialization
 *
 * ```typescript
 * import { initializeSharedMemory, isSharedMemoryAvailable } from 'agentic-qe/integrations/ruvector';
 *
 * // Initialize shared memory (optional - system works without it)
 * const sharedMemory = await initializeSharedMemory({
 *   dataDir: '.agentic-qe/shared-vectors',
 *   autoStart: true,
 * });
 *
 * if (sharedMemory.isReady) {
 *   console.log('Shared memory enabled for cross-agent communication');
 * } else {
 *   console.log('Shared memory not available:', sharedMemory.unavailableReason);
 * }
 * ```
 *
 * @module integrations/ruvector/shared-memory
 */

import {
  RuVectorServerClient,
  createRuVectorServerClient,
  type RuVectorServerConfig,
} from './server-client.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for shared memory initialization
 */
export interface SharedMemoryConfig extends Partial<RuVectorServerConfig> {
  /** Whether to enable shared memory (default: true) */
  enabled?: boolean;
  /** Suppress warnings when shared memory is not available */
  suppressWarnings?: boolean;
}

/**
 * Default shared memory configuration
 */
export const DEFAULT_SHARED_MEMORY_CONFIG: SharedMemoryConfig = {
  enabled: true,
  suppressWarnings: false,
  httpPort: 8080,
  grpcPort: 50051,
  dataDir: '.agentic-qe/shared-vectors',
  autoStart: false, // Don't auto-start by default - let fleet decide
  cors: true,
  startTimeout: 10000,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of shared memory initialization
 */
export interface SharedMemoryResult {
  /** Whether shared memory is ready for use */
  isReady: boolean;
  /** The server client (if available) */
  client: RuVectorServerClient | null;
  /** Whether vector operations are supported */
  supportsVectorOperations: boolean;
  /** Reason if shared memory is not available */
  unavailableReason?: string;
  /** Initialization time in milliseconds */
  initTimeMs: number;
}

/**
 * Status of shared memory
 */
export interface SharedMemoryStatus {
  /** Whether shared memory is enabled */
  enabled: boolean;
  /** Whether the server is running */
  serverRunning: boolean;
  /** Whether vector operations are supported */
  vectorOperationsSupported: boolean;
  /** Server health status */
  health?: {
    status: string;
    responseTimeMs?: number;
  };
}

// ============================================================================
// Module State
// ============================================================================

let sharedClient: RuVectorServerClient | null = null;
let isInitialized = false;
let lastInitResult: SharedMemoryResult | null = null;

// ============================================================================
// Initialization Functions
// ============================================================================

/**
 * Initialize shared memory for fleet agents
 *
 * This should be called during fleet initialization. The shared memory
 * system is OPTIONAL - the fleet works without it.
 *
 * @example
 * ```typescript
 * // During fleet initialization
 * const sharedMemory = await initializeSharedMemory({
 *   dataDir: '.agentic-qe/shared-vectors',
 *   autoStart: true,
 * });
 *
 * if (sharedMemory.supportsVectorOperations) {
 *   // Cross-agent pattern sharing is available
 * }
 * ```
 */
export async function initializeSharedMemory(
  config?: SharedMemoryConfig
): Promise<SharedMemoryResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_SHARED_MEMORY_CONFIG, ...config };

  // If disabled, return early
  if (!mergedConfig.enabled) {
    const result: SharedMemoryResult = {
      isReady: false,
      client: null,
      supportsVectorOperations: false,
      unavailableReason: 'Shared memory is disabled by configuration',
      initTimeMs: Date.now() - startTime,
    };
    lastInitResult = result;
    return result;
  }

  try {
    // Create server client
    sharedClient = await createRuVectorServerClient({
      httpPort: mergedConfig.httpPort,
      grpcPort: mergedConfig.grpcPort,
      dataDir: mergedConfig.dataDir,
      autoStart: mergedConfig.autoStart,
      cors: mergedConfig.cors,
      startTimeout: mergedConfig.startTimeout,
    });

    // Check if it's ready
    const serverRunning = sharedClient.isServerRunning();
    const supportsVectorOps = sharedClient.supportsVectorOperations();

    isInitialized = true;

    const result: SharedMemoryResult = {
      isReady: serverRunning,
      client: sharedClient,
      supportsVectorOperations: supportsVectorOps,
      unavailableReason: !serverRunning
        ? 'RuVector server is not running'
        : !supportsVectorOps
          ? sharedClient.getVectorOperationsUnavailableReason()
          : undefined,
      initTimeMs: Date.now() - startTime,
    };

    lastInitResult = result;

    // Log status (unless suppressed)
    if (!mergedConfig.suppressWarnings) {
      if (serverRunning && supportsVectorOps) {
        console.log('[SharedMemory] Initialized with vector operations support');
      } else if (serverRunning) {
        console.log('[SharedMemory] Server running but vector operations not yet available');
        console.log('[SharedMemory] Pattern sharing will use local-only storage');
      } else {
        console.log('[SharedMemory] Server not running - using local-only storage');
      }
    }

    return result;
  } catch (error) {
    const result: SharedMemoryResult = {
      isReady: false,
      client: null,
      supportsVectorOperations: false,
      unavailableReason: error instanceof Error ? error.message : 'Unknown initialization error',
      initTimeMs: Date.now() - startTime,
    };

    lastInitResult = result;

    if (!mergedConfig.suppressWarnings) {
      console.warn('[SharedMemory] Initialization failed:', result.unavailableReason);
      console.warn('[SharedMemory] Continuing without shared memory support');
    }

    return result;
  }
}

/**
 * Get the shared server client instance
 *
 * Returns null if shared memory is not initialized or not available.
 */
export function getSharedServerClient(): RuVectorServerClient | null {
  return sharedClient;
}

/**
 * Set the shared server client instance (for dependency injection)
 *
 * @param client - Server client instance to use
 */
export function setSharedServerClient(client: RuVectorServerClient | null): void {
  sharedClient = client;
  isInitialized = client !== null;
}

/**
 * Check if shared memory is available
 *
 * Returns true only if:
 * 1. Shared memory is initialized
 * 2. Server is running
 * 3. Vector operations are supported
 */
export function isSharedMemoryAvailable(): boolean {
  if (!isInitialized || !sharedClient) {
    return false;
  }
  return sharedClient.isServerRunning() && sharedClient.supportsVectorOperations();
}

/**
 * Get shared memory status
 */
export async function getSharedMemoryStatus(): Promise<SharedMemoryStatus> {
  if (!sharedClient) {
    return {
      enabled: false,
      serverRunning: false,
      vectorOperationsSupported: false,
    };
  }

  const health = await sharedClient.healthCheck();

  return {
    enabled: true,
    serverRunning: sharedClient.isServerRunning(),
    vectorOperationsSupported: sharedClient.supportsVectorOperations(),
    health: {
      status: health.status,
      responseTimeMs: health.responseTimeMs,
    },
  };
}

/**
 * Get last initialization result
 */
export function getLastInitResult(): SharedMemoryResult | null {
  return lastInitResult;
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Shutdown shared memory
 *
 * Should be called during fleet shutdown.
 */
export async function shutdownSharedMemory(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.dispose();
    } catch (error) {
      console.warn('[SharedMemory] Error during shutdown:', error);
    }
    sharedClient = null;
  }
  isInitialized = false;
  lastInitResult = null;
}

/**
 * Reset shared memory state (for testing)
 */
export function resetSharedMemoryState(): void {
  sharedClient = null;
  isInitialized = false;
  lastInitResult = null;
}

// ============================================================================
// Fleet Integration Helper
// ============================================================================

/**
 * Integrate shared memory with fleet initialization
 *
 * This is a convenience function that:
 * 1. Initializes shared memory
 * 2. Returns the client if available
 * 3. Logs appropriate status messages
 *
 * @example
 * ```typescript
 * // In fleet initialization code
 * const { client, status } = await integrateWithFleet({
 *   dataDir: '.agentic-qe/fleet-vectors',
 * });
 *
 * if (status === 'ready') {
 *   // Enable cross-agent pattern sharing
 * }
 * ```
 */
export async function integrateWithFleet(
  config?: SharedMemoryConfig
): Promise<{
  client: RuVectorServerClient | null;
  status: 'ready' | 'server-only' | 'unavailable' | 'disabled';
  message: string;
}> {
  const result = await initializeSharedMemory(config);

  if (!result.client) {
    if (config?.enabled === false) {
      return {
        client: null,
        status: 'disabled',
        message: 'Shared memory disabled by configuration',
      };
    }
    return {
      client: null,
      status: 'unavailable',
      message: result.unavailableReason || 'Shared memory unavailable',
    };
  }

  if (result.supportsVectorOperations) {
    return {
      client: result.client,
      status: 'ready',
      message: 'Cross-agent pattern sharing enabled',
    };
  }

  return {
    client: result.client,
    status: 'server-only',
    message: 'Server running but vector API not available - using local storage',
  };
}
