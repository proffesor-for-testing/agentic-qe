/**
 * Agentic QE v3 - RuVector Server Client
 *
 * Client for starting and communicating with the ruvector server
 * for shared vector memory across agents.
 *
 * ## Current Status: Vector Operations Not Yet Available
 *
 * The ruvector server REST API is currently "Coming Soon" (see `npx ruvector server --info`).
 * This implementation provides:
 *
 * - Server lifecycle management (start/stop via CLI) - WORKING
 * - Health check endpoint - WORKING (when server is running)
 * - Vector operations (store/search/delete) - STUBBED (API not yet available)
 *
 * ### Checking Vector Operation Support
 *
 * ```typescript
 * const client = await createRuVectorServerClient();
 *
 * if (client.supportsVectorOperations()) {
 *   // Use real vector operations
 *   await client.storeVector('namespace', 'id', vector);
 * } else {
 *   // Fall back to local storage
 *   console.log('Server vector API not available, using local storage');
 * }
 * ```
 *
 * ### When Server API Becomes Available
 *
 * 1. Update `supportsVectorOperations()` to return true
 * 2. Uncomment the HTTP calls in storeVector/searchSimilar/deleteVector/getServerStats
 * 3. Update tests to verify real API behavior
 *
 * Track progress: https://github.com/ruvnet/ruvector/issues/20
 *
 * @example
 * ```typescript
 * import { createRuVectorServerClient } from '@agentic-qe/v3/integrations/ruvector';
 *
 * const client = await createRuVectorServerClient({
 *   httpPort: 8080,
 *   autoStart: true,
 * });
 *
 * await client.ensureServerRunning();
 * const health = await client.healthCheck();
 * console.log('Server status:', health.status);
 *
 * // Check if vector operations are supported
 * if (client.supportsVectorOperations()) {
 *   await client.storeVector('patterns', 'p1', embedding);
 * }
 * ```
 *
 * @module integrations/ruvector/server-client
 */

import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type { QESONAPattern } from './sona-wrapper.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('ruvector-server-client');

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for RuVector server client
 */
export interface RuVectorServerConfig {
  /** HTTP port for REST API (default: 8080) */
  httpPort?: number;
  /** gRPC port for high-performance interface (default: 50051) */
  grpcPort?: number;
  /** Data directory for vector storage (default: .agentic-qe/vector-data) */
  dataDir?: string;
  /** Auto-start server if not running (default: true) */
  autoStart?: boolean;
  /** Enable CORS for all origins (default: true) */
  cors?: boolean;
  /** Timeout for server start in milliseconds (default: 10000) */
  startTimeout?: number;
  /** Health check interval in milliseconds (default: 5000) */
  healthCheckInterval?: number;
  /** Maximum retries for health check (default: 3) */
  healthCheckRetries?: number;
  /** Retry delay for health check in milliseconds (default: 1000) */
  healthCheckRetryDelay?: number;
}

/**
 * Default server configuration
 */
export const DEFAULT_SERVER_CONFIG: Required<RuVectorServerConfig> = {
  httpPort: 8080,
  grpcPort: 50051,
  dataDir: '.agentic-qe/vector-data',
  autoStart: true,
  cors: true,
  startTimeout: 10000,
  healthCheckInterval: 5000,
  healthCheckRetries: 3,
  healthCheckRetryDelay: 1000,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Server health check result
 */
export interface ServerHealthResult {
  /** Whether the server is healthy */
  healthy: boolean;
  /** Server status */
  status: 'running' | 'starting' | 'stopped' | 'error' | 'unavailable';
  /** Server version (if available) */
  version?: string;
  /** HTTP endpoint */
  httpEndpoint?: string;
  /** gRPC endpoint */
  grpcEndpoint?: string;
  /** Last check timestamp */
  lastChecked: Date;
  /** Error message if unhealthy */
  error?: string;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Available features */
  features?: string[];
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /** Vector ID */
  id: string;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
  /** Original vector */
  vector?: number[];
  /** Associated metadata */
  metadata?: Record<string, unknown>;
  /** Distance from query vector */
  distance?: number;
}

/**
 * Server statistics
 */
export interface ServerStats {
  /** Total vectors stored */
  totalVectors: number;
  /** Vectors by namespace */
  vectorsByNamespace: Record<string, number>;
  /** Server uptime in seconds */
  uptimeSeconds: number;
  /** Total queries processed */
  totalQueries: number;
  /** Average query latency in milliseconds */
  avgQueryLatencyMs: number;
  /** Memory usage in bytes */
  memoryUsageBytes?: number;
  /** Whether stats are mocked (server API not available) */
  isMocked: boolean;
}

// ============================================================================
// RuVector Server Client Implementation
// ============================================================================

/**
 * Client for managing and communicating with the ruvector server.
 *
 * Provides server lifecycle management (start/stop) and vector operations
 * for shared memory across agents.
 *
 * NOTE: REST API operations are currently stubbed as the server API
 * is marked as "Coming Soon". See TODO comments for implementation
 * points when the API becomes available.
 */
export class RuVectorServerClient {
  private readonly config: Required<RuVectorServerConfig>;
  private serverProcess: ChildProcess | null = null;
  private isRunning = false;
  private startPromise: Promise<void> | null = null;
  private lastHealthCheck: ServerHealthResult | null = null;

  constructor(config?: RuVectorServerConfig) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
  }

  // ==========================================================================
  // Server Lifecycle
  // ==========================================================================

  /**
   * Ensure the server is running, starting it if necessary
   *
   * @throws Error if server fails to start within timeout
   */
  async ensureServerRunning(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const health = await this.healthCheck();
    if (health.healthy) {
      this.isRunning = true;
      return;
    }

    if (this.config.autoStart) {
      await this.startServer();
    } else {
      throw new Error(
        'RuVector server is not running and autoStart is disabled. ' +
        `Start manually with: npx ruvector server --port ${this.config.httpPort}`
      );
    }
  }

  /**
   * Start the ruvector server as a background process
   *
   * @throws Error if server fails to start
   */
  async startServer(): Promise<void> {
    if (this.isRunning) {
      console.log('[RuVectorServerClient] Server already running');
      return;
    }

    // Prevent concurrent start attempts
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this._doStartServer();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Internal server start implementation
   */
  private async _doStartServer(): Promise<void> {
    console.log('[RuVectorServerClient] Starting ruvector server...');

    const args = [
      'ruvector',
      'server',
      '--port', String(this.config.httpPort),
      '--grpc-port', String(this.config.grpcPort),
      '--data-dir', this.config.dataDir,
    ];

    if (this.config.cors) {
      args.push('--cors');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopServer().catch(() => {});
        reject(new Error(`Server failed to start within ${this.config.startTimeout}ms`));
      }, this.config.startTimeout);

      try {
        this.serverProcess = spawn('npx', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          env: { ...process.env },
        });

        let startOutput = '';

        this.serverProcess.stdout?.on('data', (data: Buffer) => {
          const output = data.toString();
          startOutput += output;
          console.log('[RuVectorServer]', output.trim());

          // Check for startup indicators
          if (output.includes('listening') || output.includes('started') || output.includes('ready')) {
            clearTimeout(timeout);
            this.isRunning = true;
            resolve();
          }
        });

        this.serverProcess.stderr?.on('data', (data: Buffer) => {
          const output = data.toString();
          startOutput += output;
          console.error('[RuVectorServer:stderr]', output.trim());
        });

        this.serverProcess.on('error', (err) => {
          clearTimeout(timeout);
          this.isRunning = false;
          this.serverProcess = null;
          reject(new Error(`Failed to start ruvector server: ${err.message}`));
        });

        this.serverProcess.on('exit', (code) => {
          clearTimeout(timeout);
          this.isRunning = false;
          this.serverProcess = null;

          if (code !== 0 && code !== null) {
            reject(new Error(`RuVector server exited with code ${code}: ${startOutput}`));
          }
        });

        // Also poll for health as a backup
        this.pollForHealth(timeout, resolve, reject);
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn ruvector server: ${toErrorMessage(err)}`));
      }
    });
  }

  /**
   * Poll for server health during startup
   */
  private pollForHealth(
    timeout: ReturnType<typeof setTimeout>,
    resolve: () => void,
    _reject: (err: Error) => void
  ): void {
    const pollInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.healthy) {
          clearTimeout(timeout);
          clearInterval(pollInterval);
          this.isRunning = true;
          resolve();
        }
      } catch (e) {
        // Continue polling
        logger.debug('Server health check poll failed, retrying', { error: e instanceof Error ? e.message : String(e) });
      }
    }, 500);

    // Clear poll interval when timeout fires
    setTimeout(() => clearInterval(pollInterval), this.config.startTimeout);
  }

  /**
   * Stop the ruvector server
   */
  async stopServer(): Promise<void> {
    if (!this.serverProcess) {
      this.isRunning = false;
      return;
    }

    console.log('[RuVectorServerClient] Stopping ruvector server...');

    return new Promise((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (this.serverProcess) {
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);

      this.serverProcess?.on('exit', () => {
        clearTimeout(forceKillTimeout);
        this.serverProcess = null;
        this.isRunning = false;
        console.log('[RuVectorServerClient] Server stopped');
        resolve();
      });

      // Try graceful shutdown first
      this.serverProcess?.kill('SIGTERM');
    });
  }

  /**
   * Check server health
   */
  async healthCheck(): Promise<ServerHealthResult> {
    const startTime = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `http://localhost:${this.config.httpPort}/health`,
        { method: 'GET' },
        this.config.healthCheckRetryDelay
      );

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        // TODO: Parse actual health response when API is available
        this.lastHealthCheck = {
          healthy: true,
          status: 'running',
          httpEndpoint: `http://localhost:${this.config.httpPort}`,
          grpcEndpoint: `localhost:${this.config.grpcPort}`,
          lastChecked: new Date(),
          responseTimeMs,
          features: ['vector-store', 'similarity-search'],
        };
      } else {
        this.lastHealthCheck = {
          healthy: false,
          status: 'error',
          lastChecked: new Date(),
          responseTimeMs,
          error: `Health check returned status ${response.status}`,
        };
      }
    } catch (err) {
      this.lastHealthCheck = {
        healthy: false,
        status: this.serverProcess ? 'starting' : 'stopped',
        lastChecked: new Date(),
        responseTimeMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }

    return this.lastHealthCheck;
  }

  // ==========================================================================
  // Vector Operations Capability
  // ==========================================================================

  /**
   * Check if vector operations are supported by the server.
   *
   * The ruvector server REST API is currently "Coming Soon".
   * This method returns false until the API is available.
   *
   * When implementing with the real API, this should check the health endpoint
   * for supported features.
   *
   * @returns true if vector operations (store/search/delete) are supported
   */
  supportsVectorOperations(): boolean {
    // TODO: When server API becomes available, check health response for features
    // return this.lastHealthCheck?.features?.includes('vector-store') ?? false;

    // Currently the server REST API is "Coming Soon"
    // See: npx ruvector server --info
    return false;
  }

  /**
   * Get a human-readable reason why vector operations are not supported
   */
  getVectorOperationsUnavailableReason(): string {
    if (!this.isRunning) {
      return 'RuVector server is not running';
    }
    // When API becomes available, check for specific feature support
    return 'RuVector server REST API for vector operations is not yet available. ' +
           'See: https://github.com/ruvnet/ruvector/issues/20';
  }

  // ==========================================================================
  // Vector Operations (Stubbed - API Coming Soon)
  // ==========================================================================

  /**
   * Store a vector in the server
   *
   * **Note:** This operation is currently stubbed as the server REST API
   * is not yet available. Check `supportsVectorOperations()` before calling.
   *
   * @param namespace - Namespace for vector organization
   * @param id - Unique vector ID
   * @param vector - Vector data (float array)
   * @param metadata - Optional metadata to associate with vector
   * @throws Error if vector operations are not supported and strictMode is enabled
   */
  async storeVector(
    namespace: string,
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.ensureServerRunning();

    if (!this.supportsVectorOperations()) {
      // Log warning but don't throw - allows graceful degradation
      if (process.env.RUVECTOR_DEBUG === 'true') {
        console.warn(
          `[RuVectorServerClient] storeVector stubbed: ${this.getVectorOperationsUnavailableReason()}`
        );
      }
      // Store operation details for debugging
      console.log(
        `[RuVectorServerClient] STUB: storeVector(namespace=${namespace}, id=${id}, dim=${vector.length})`,
        metadata ? `metadata keys: [${Object.keys(metadata).join(', ')}]` : ''
      );
      return;
    }

    // When API is available, uncomment and implement:
    /*
    const response = await this.fetchWithTimeout(
      `http://localhost:${this.config.httpPort}/api/v1/vectors/${namespace}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, vector, metadata }),
      },
      5000
    );

    if (!response.ok) {
      throw new Error(`Failed to store vector: ${response.status} ${response.statusText}`);
    }
    */
  }

  /**
   * Search for similar vectors
   *
   * **Note:** This operation is currently stubbed as the server REST API
   * is not yet available. Check `supportsVectorOperations()` before calling.
   *
   * @param namespace - Namespace to search in
   * @param query - Query vector
   * @param topK - Number of results to return (default: 10)
   * @returns Array of similar vectors with scores (empty array when stubbed)
   */
  async searchSimilar(
    namespace: string,
    query: number[],
    topK = 10
  ): Promise<VectorSearchResult[]> {
    await this.ensureServerRunning();

    if (!this.supportsVectorOperations()) {
      if (process.env.RUVECTOR_DEBUG === 'true') {
        console.warn(
          `[RuVectorServerClient] searchSimilar stubbed: ${this.getVectorOperationsUnavailableReason()}`
        );
      }
      console.log(
        `[RuVectorServerClient] STUB: searchSimilar(namespace=${namespace}, dim=${query.length}, topK=${topK})`
      );
      // Return empty results - callers should use local search as fallback
      return [];
    }

    // When API is available, uncomment and implement:
    /*
    const response = await this.fetchWithTimeout(
      `http://localhost:${this.config.httpPort}/api/v1/vectors/${namespace}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK }),
      },
      5000
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.results;
    */

    return [];
  }

  /**
   * Delete a vector from the server
   *
   * **Note:** This operation is currently stubbed as the server REST API
   * is not yet available. Check `supportsVectorOperations()` before calling.
   *
   * @param namespace - Namespace containing the vector
   * @param id - Vector ID to delete
   */
  async deleteVector(namespace: string, id: string): Promise<void> {
    await this.ensureServerRunning();

    if (!this.supportsVectorOperations()) {
      if (process.env.RUVECTOR_DEBUG === 'true') {
        console.warn(
          `[RuVectorServerClient] deleteVector stubbed: ${this.getVectorOperationsUnavailableReason()}`
        );
      }
      console.log(`[RuVectorServerClient] STUB: deleteVector(namespace=${namespace}, id=${id})`);
      return;
    }

    // When API is available, uncomment and implement:
    /*
    const response = await this.fetchWithTimeout(
      `http://localhost:${this.config.httpPort}/api/v1/vectors/${namespace}/${id}`,
      { method: 'DELETE' },
      5000
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete vector: ${response.status} ${response.statusText}`);
    }
    */
  }

  // ==========================================================================
  // Pattern Sharing (Built on Vector Operations)
  // ==========================================================================

  /**
   * Share a SONA pattern via the vector server
   *
   * Converts the pattern to a vector representation and stores it
   * for cross-agent discovery.
   *
   * **Note:** This operation is currently stubbed as the server REST API
   * is not yet available. When vector operations become available, patterns
   * will be shared across processes for cross-agent discovery.
   *
   * @param pattern - SONA pattern to share
   * @returns true if pattern was shared (or would be when API is available)
   */
  async sharePattern(pattern: QESONAPattern): Promise<boolean> {
    if (!pattern.stateEmbedding || pattern.stateEmbedding.length === 0) {
      console.warn('[RuVectorServerClient] Pattern has no embedding, skipping share');
      return false;
    }

    // Check if sharing is actually supported
    if (!this.supportsVectorOperations()) {
      if (process.env.RUVECTOR_DEBUG === 'true') {
        console.log(
          `[RuVectorServerClient] Pattern sharing not available: ${this.getVectorOperationsUnavailableReason()}`
        );
      }
      // Still call storeVector for logging purposes (it will stub gracefully)
    }

    const metadata = {
      type: pattern.type,
      domain: pattern.domain,
      confidence: pattern.confidence,
      usageCount: pattern.usageCount,
      createdAt: pattern.createdAt?.toISOString(),
      actionType: pattern.action?.type,
      outcomeReward: pattern.outcome?.reward,
      outcomeSuccess: pattern.outcome?.success,
    };

    await this.storeVector(
      `sona-patterns-${pattern.domain}`,
      pattern.id,
      pattern.stateEmbedding,
      metadata
    );

    return this.supportsVectorOperations();
  }

  /**
   * Find similar patterns to a given pattern
   *
   * **Note:** This operation is currently stubbed as the server REST API
   * is not yet available. Returns empty array when stubbed.
   *
   * @param pattern - Pattern to find similarities for
   * @param topK - Number of results to return
   * @returns Array of similar patterns (empty when stubbed)
   */
  async findSimilarPatterns(
    pattern: QESONAPattern,
    topK = 10
  ): Promise<QESONAPattern[]> {
    if (!pattern.stateEmbedding || pattern.stateEmbedding.length === 0) {
      return [];
    }

    const results = await this.searchSimilar(
      `sona-patterns-${pattern.domain}`,
      pattern.stateEmbedding,
      topK
    );

    // If no results (which is expected when stubbed), return empty
    if (results.length === 0) {
      return [];
    }

    // Convert search results back to patterns
    // Note: This is a partial reconstruction - full pattern data should be
    // fetched from the persistence layer using the IDs
    return results.map((result): QESONAPattern => ({
      id: result.id,
      type: ((result.metadata?.type as string) || 'test-generation') as QESONAPattern['type'],
      domain: ((result.metadata?.domain as string) || pattern.domain) as QESONAPattern['domain'],
      stateEmbedding: result.vector || [],
      action: {
        type: (result.metadata?.actionType as string) || 'unknown',
        value: (result.metadata?.actionValue as string | number | object) ?? '',
      },
      outcome: {
        reward: (result.metadata?.outcomeReward as number) || 0,
        success: (result.metadata?.outcomeSuccess as boolean) || false,
        quality: 0,
      },
      confidence: (result.metadata?.confidence as number) || result.score,
      usageCount: (result.metadata?.usageCount as number) || 0,
      createdAt: result.metadata?.createdAt
        ? new Date(result.metadata.createdAt as string)
        : new Date(),
    }));
  }

  // ==========================================================================
  // Server Statistics
  // ==========================================================================

  /**
   * Get server statistics
   *
   * **Note:** This operation returns mocked data as the server REST API
   * is not yet available. The `isMocked` field indicates whether real stats
   * were returned.
   */
  async getServerStats(): Promise<ServerStats> {
    const health = await this.healthCheck();

    if (!health.healthy) {
      return {
        totalVectors: 0,
        vectorsByNamespace: {},
        uptimeSeconds: 0,
        totalQueries: 0,
        avgQueryLatencyMs: 0,
        isMocked: true,
      };
    }

    if (!this.supportsVectorOperations()) {
      if (process.env.RUVECTOR_DEBUG === 'true') {
        console.warn(
          `[RuVectorServerClient] getServerStats stubbed: ${this.getVectorOperationsUnavailableReason()}`
        );
      }
      console.log('[RuVectorServerClient] STUB: getServerStats()');

      // Return stats indicating server is up but vector API is not available
      return {
        totalVectors: 0,
        vectorsByNamespace: {},
        uptimeSeconds: Math.floor((Date.now() - (this.lastHealthCheck?.lastChecked?.getTime() ?? Date.now())) / 1000),
        totalQueries: 0,
        avgQueryLatencyMs: health.responseTimeMs ?? 0,
        isMocked: true,
      };
    }

    // When API is available, uncomment and implement:
    /*
    const response = await this.fetchWithTimeout(
      `http://localhost:${this.config.httpPort}/api/v1/stats`,
      { method: 'GET' },
      5000
    );

    if (response.ok) {
      const data = await response.json();
      return { ...data, isMocked: false };
    }
    */

    return {
      totalVectors: 0,
      vectorsByNamespace: {},
      uptimeSeconds: 0,
      totalQueries: 0,
      avgQueryLatencyMs: 0,
      isMocked: true,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig(): Required<RuVectorServerConfig> {
    return { ...this.config };
  }

  /**
   * Check if server is currently running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): ServerHealthResult | null {
    return this.lastHealthCheck;
  }

  /**
   * Get HTTP endpoint URL
   */
  getHttpEndpoint(): string {
    return `http://localhost:${this.config.httpPort}`;
  }

  /**
   * Get gRPC endpoint
   */
  getGrpcEndpoint(): string {
    return `localhost:${this.config.grpcPort}`;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.stopServer();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a RuVector server client and optionally start the server
 *
 * @example
 * ```typescript
 * // Auto-start server
 * const client = await createRuVectorServerClient({ autoStart: true });
 *
 * // Manual start
 * const client = await createRuVectorServerClient({ autoStart: false });
 * await client.startServer();
 * ```
 */
export async function createRuVectorServerClient(
  config?: RuVectorServerConfig
): Promise<RuVectorServerClient> {
  const client = new RuVectorServerClient(config);

  if (config?.autoStart !== false) {
    try {
      await client.ensureServerRunning();
    } catch (error) {
      // Log warning but don't fail - server is optional
      console.warn(
        '[RuVectorServerClient] Failed to start server:',
        toErrorMessage(error)
      );
      console.warn(
        '[RuVectorServerClient] Server operations will not be available. ' +
        'Start manually with: npx ruvector server'
      );
    }
  }

  return client;
}

/**
 * Create a RuVector server client synchronously (server not started)
 *
 * Call ensureServerRunning() or startServer() to start the server.
 */
export function createRuVectorServerClientSync(
  config?: RuVectorServerConfig
): RuVectorServerClient {
  return new RuVectorServerClient(config);
}

// ============================================================================
// Singleton Instance (Optional)
// ============================================================================

let sharedInstance: RuVectorServerClient | null = null;

/**
 * Get or create a shared server client instance
 *
 * Useful for ensuring only one server process is managed.
 */
export async function getSharedServerClient(
  config?: RuVectorServerConfig
): Promise<RuVectorServerClient> {
  if (!sharedInstance) {
    sharedInstance = await createRuVectorServerClient(config);
  }
  return sharedInstance;
}

/**
 * Reset the shared server client (for testing)
 */
export async function resetSharedServerClient(): Promise<void> {
  if (sharedInstance) {
    await sharedInstance.dispose();
    sharedInstance = null;
  }
}
