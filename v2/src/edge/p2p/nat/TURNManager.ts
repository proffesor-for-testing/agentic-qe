/**
 * TURN Manager for @ruvector/edge P2P
 *
 * Manages TURN server credentials, handles credential refresh, selects optimal
 * TURN servers based on latency, and monitors server health.
 *
 * @module edge/p2p/nat/TURNManager
 * @version 1.0.0
 */

import { ICEServer } from '../webrtc/types';
import {
  TURNConfig,
  TURNCredentialConfig,
  TURNAllocation,
  TURNServerSelection,
  TURNManagerConfig,
  NATEventType,
  NATEvent,
  NATEventHandler,
  DEFAULT_TURN_MANAGER_CONFIG,
} from './types';

/**
 * TURN server health status
 */
interface TURNServerHealth {
  /** Server configuration */
  server: TURNConfig;
  /** Whether server is healthy */
  healthy: boolean;
  /** Last measured latency in ms */
  latencyMs: number;
  /** Last health check timestamp */
  lastCheckAt: number;
  /** Consecutive failure count */
  failureCount: number;
  /** Last error message */
  lastError?: string;
}

/**
 * Credential state tracking
 */
interface CredentialState {
  /** Current credentials */
  credentials: TURNConfig;
  /** Credential fetch timestamp */
  fetchedAt: number;
  /** Refresh timer */
  refreshTimer?: ReturnType<typeof setTimeout>;
  /** Whether refresh is in progress */
  refreshing: boolean;
}

/**
 * TURN Manager - Manages TURN server credentials and selection
 *
 * @example
 * ```typescript
 * const turnManager = new TURNManager({
 *   servers: [
 *     {
 *       urls: 'turn:turn1.example.com:3478',
 *       username: 'user',
 *       credential: 'pass',
 *       credentialType: 'password',
 *     },
 *   ],
 *   credentialConfig: {
 *     refreshUrl: 'https://api.example.com/turn/credentials',
 *     refreshBeforeExpiry: 300000, // 5 minutes
 *     maxRetries: 3,
 *     retryDelay: 1000,
 *   },
 * });
 *
 * // Get optimal TURN server
 * const selection = await turnManager.selectOptimalServer();
 * console.log('Selected server:', selection.server.urls);
 *
 * // Get ICE servers for RTCPeerConnection
 * const iceServers = turnManager.getICEServers();
 * ```
 */
export class TURNManager {
  private readonly config: TURNManagerConfig;
  private serverHealth: Map<string, TURNServerHealth> = new Map();
  private credentialStates: Map<string, CredentialState> = new Map();
  private eventHandlers: Map<NATEventType, Set<NATEventHandler>> = new Map();
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private isDestroyed: boolean = false;

  /**
   * Create a new TURN Manager
   *
   * @param config - Manager configuration
   */
  constructor(config: TURNManagerConfig) {
    this.config = {
      ...DEFAULT_TURN_MANAGER_CONFIG,
      ...config,
    } as TURNManagerConfig;

    // Initialize server health tracking
    for (const server of this.config.servers) {
      const url = this.getServerUrl(server);
      this.serverHealth.set(url, {
        server,
        healthy: true, // Assume healthy until proven otherwise
        latencyMs: Infinity,
        lastCheckAt: 0,
        failureCount: 0,
      });
    }

    // Initialize credential states
    for (const server of this.config.servers) {
      if (server.expiresAt) {
        const url = this.getServerUrl(server);
        this.credentialStates.set(url, {
          credentials: server,
          fetchedAt: Date.now(),
          refreshing: false,
        });
        this.scheduleCredentialRefresh(server);
      }
    }

    // Start health monitoring if enabled
    if (this.config.enableHealthMonitoring) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Select optimal TURN server based on latency
   *
   * @returns Promise resolving to server selection with alternatives
   */
  public async selectOptimalServer(): Promise<TURNServerSelection> {
    const healthyServers = this.getHealthyServers();

    if (healthyServers.length === 0) {
      throw new Error('No healthy TURN servers available');
    }

    // Test latency to all healthy servers
    const latencyResults = await this.testServerLatencies(healthyServers);

    // Sort by latency
    latencyResults.sort((a, b) => a.latencyMs - b.latencyMs);

    const optimal = latencyResults[0];
    const alternatives = latencyResults.slice(1);

    return {
      server: optimal.server,
      latencyMs: optimal.latencyMs,
      selectedAt: Date.now(),
      alternatives,
    };
  }

  /**
   * Get ICE servers configuration for RTCPeerConnection
   *
   * @param includeUnhealthy - Include unhealthy servers (default: false)
   * @returns Array of ICE server configurations
   */
  public getICEServers(includeUnhealthy: boolean = false): ICEServer[] {
    const servers = includeUnhealthy
      ? this.config.servers
      : this.getHealthyServers();

    return servers.map((server) => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential,
      credentialType: server.credentialType,
    }));
  }

  /**
   * Get a specific server's current credentials
   *
   * @param serverUrl - Server URL to get credentials for
   * @returns Server configuration with current credentials or null
   */
  public getServerCredentials(serverUrl: string): TURNConfig | null {
    const state = this.credentialStates.get(serverUrl);
    return state?.credentials ?? null;
  }

  /**
   * Manually refresh credentials for a server
   *
   * @param serverUrl - Server URL to refresh credentials for
   * @returns Promise resolving to refreshed credentials
   */
  public async refreshCredentials(serverUrl: string): Promise<TURNConfig> {
    const state = this.credentialStates.get(serverUrl);
    if (!state) {
      throw new Error(`No credential state for server: ${serverUrl}`);
    }

    if (!this.config.credentialConfig) {
      throw new Error('No credential refresh configuration');
    }

    return this.fetchNewCredentials(serverUrl);
  }

  /**
   * Add a new TURN server to the manager
   *
   * @param server - Server configuration to add
   */
  public addServer(server: TURNConfig): void {
    const url = this.getServerUrl(server);

    if (this.serverHealth.has(url)) {
      throw new Error(`Server already exists: ${url}`);
    }

    this.config.servers.push(server);
    this.serverHealth.set(url, {
      server,
      healthy: true,
      latencyMs: Infinity,
      lastCheckAt: 0,
      failureCount: 0,
    });

    if (server.expiresAt) {
      this.credentialStates.set(url, {
        credentials: server,
        fetchedAt: Date.now(),
        refreshing: false,
      });
      this.scheduleCredentialRefresh(server);
    }
  }

  /**
   * Remove a TURN server from the manager
   *
   * @param serverUrl - Server URL to remove
   */
  public removeServer(serverUrl: string): void {
    const index = this.config.servers.findIndex(
      (s) => this.getServerUrl(s) === serverUrl
    );

    if (index !== -1) {
      this.config.servers.splice(index, 1);
    }

    this.serverHealth.delete(serverUrl);

    const state = this.credentialStates.get(serverUrl);
    if (state?.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }
    this.credentialStates.delete(serverUrl);
  }

  /**
   * Get server health status
   *
   * @param serverUrl - Server URL to check
   * @returns Health status or null if not found
   */
  public getServerHealth(serverUrl: string): TURNServerHealth | null {
    return this.serverHealth.get(serverUrl) ?? null;
  }

  /**
   * Get all server health statuses
   *
   * @returns Map of server URLs to health statuses
   */
  public getAllServerHealth(): Map<string, TURNServerHealth> {
    return new Map(this.serverHealth);
  }

  /**
   * Force health check for all servers
   */
  public async checkAllServersHealth(): Promise<void> {
    const servers = Array.from(this.serverHealth.keys());
    await Promise.all(servers.map((url) => this.checkServerHealth(url)));
  }

  /**
   * Register event handler
   *
   * @param type - Event type to handle
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  public on<T>(type: NATEventType, handler: NATEventHandler<T>): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler as NATEventHandler);
    return () => this.eventHandlers.get(type)?.delete(handler as NATEventHandler);
  }

  /**
   * Get current configuration
   */
  public getConfig(): TURNManagerConfig {
    return { ...this.config };
  }

  /**
   * Destroy the manager and cleanup resources
   */
  public destroy(): void {
    this.isDestroyed = true;

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Cancel all credential refresh timers
    this.credentialStates.forEach((state) => {
      if (state.refreshTimer) {
        clearTimeout(state.refreshTimer);
      }
    });

    this.credentialStates.clear();
    this.serverHealth.clear();
    this.eventHandlers.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private getServerUrl(server: TURNConfig): string {
    return Array.isArray(server.urls) ? server.urls[0] : server.urls;
  }

  private getHealthyServers(): TURNConfig[] {
    const healthy: TURNConfig[] = [];
    this.serverHealth.forEach((health) => {
      if (health.healthy) {
        healthy.push(health.server);
      }
    });
    return healthy;
  }

  private async testServerLatencies(
    servers: TURNConfig[]
  ): Promise<Array<{ server: TURNConfig; latencyMs: number }>> {
    const results = await Promise.all(
      servers.map(async (server) => {
        const latencyMs = await this.measureLatency(server);
        return { server, latencyMs };
      })
    );

    // Update health tracking with new latencies
    for (const result of results) {
      const url = this.getServerUrl(result.server);
      const health = this.serverHealth.get(url);
      if (health) {
        health.latencyMs = result.latencyMs;
        health.lastCheckAt = Date.now();
        if (result.latencyMs < Infinity) {
          health.failureCount = 0;
          health.healthy = true;
        }
      }
    }

    return results;
  }

  private async measureLatency(server: TURNConfig): Promise<number> {
    const startTime = performance.now();

    try {
      await this.testTurnConnectivity(server);
      return performance.now() - startTime;
    } catch {
      return Infinity;
    }
  }

  private async testTurnConnectivity(server: TURNConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof RTCPeerConnection === 'undefined') {
        reject(new Error('RTCPeerConnection not available'));
        return;
      }

      const iceServer: RTCIceServer = {
        urls: server.urls,
        username: server.username,
        credential: server.credential,
      };

      const pc = new RTCPeerConnection({
        iceServers: [iceServer],
        iceTransportPolicy: 'relay', // Force TURN usage
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.close();
          reject(new Error('TURN connectivity test timeout'));
        }
      }, this.config.latencyTestTimeout);

      pc.onicecandidate = (event) => {
        if (event.candidate && !resolved) {
          const candidate = event.candidate.candidate;

          // Look for relay candidate indicating TURN works
          if (candidate.includes('typ relay')) {
            resolved = true;
            clearTimeout(timeout);
            pc.close();
            resolve();
          }
        } else if (event.candidate === null && !resolved) {
          // Gathering complete without relay candidate
          resolved = true;
          clearTimeout(timeout);
          pc.close();
          reject(new Error('No relay candidate from TURN server'));
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete' && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          pc.close();
          reject(new Error('ICE gathering complete without relay'));
        }
      };

      // Create data channel to trigger ICE gathering
      pc.createDataChannel('turn-test');

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            pc.close();
            reject(error);
          }
        });
    });
  }

  private async checkServerHealth(serverUrl: string): Promise<void> {
    const health = this.serverHealth.get(serverUrl);
    if (!health) return;

    try {
      const latencyMs = await this.measureLatency(health.server);

      if (latencyMs < Infinity) {
        health.healthy = true;
        health.latencyMs = latencyMs;
        health.failureCount = 0;
        health.lastError = undefined;
      } else {
        throw new Error('Latency measurement failed');
      }
    } catch (error) {
      health.failureCount++;
      health.lastError = error instanceof Error ? error.message : 'Unknown error';

      // Mark as unhealthy after 3 consecutive failures
      if (health.failureCount >= 3) {
        health.healthy = false;
      }
    }

    health.lastCheckAt = Date.now();
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.checkAllServersHealth();
      }
    }, this.config.healthCheckInterval);
  }

  private scheduleCredentialRefresh(server: TURNConfig): void {
    if (!this.config.credentialConfig || !server.expiresAt) return;

    const url = this.getServerUrl(server);
    const state = this.credentialStates.get(url);
    if (!state) return;

    // Cancel existing timer
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }

    const expiresIn = server.expiresAt - Date.now();
    const refreshIn = Math.max(
      0,
      expiresIn - this.config.credentialConfig.refreshBeforeExpiry
    );

    state.refreshTimer = setTimeout(async () => {
      if (!this.isDestroyed) {
        try {
          await this.fetchNewCredentials(url);
        } catch (error) {
          console.error(`Failed to refresh credentials for ${url}:`, error);
        }
      }
    }, refreshIn);
  }

  private async fetchNewCredentials(serverUrl: string): Promise<TURNConfig> {
    if (!this.config.credentialConfig) {
      throw new Error('No credential refresh configuration');
    }

    const state = this.credentialStates.get(serverUrl);
    if (!state) {
      throw new Error(`No credential state for server: ${serverUrl}`);
    }

    if (state.refreshing) {
      // Wait for ongoing refresh
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (!state.refreshing) {
            clearInterval(checkInterval);
            resolve(state.credentials);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Credential refresh timeout'));
        }, 30000);
      });
    }

    state.refreshing = true;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.credentialConfig.maxRetries; attempt++) {
      try {
        const newCredentials = await this.doCredentialFetch(serverUrl);

        // Update state
        state.credentials = newCredentials;
        state.fetchedAt = Date.now();
        state.refreshing = false;

        // Update server in config
        const index = this.config.servers.findIndex(
          (s) => this.getServerUrl(s) === serverUrl
        );
        if (index !== -1) {
          this.config.servers[index] = newCredentials;
        }

        // Update health tracking
        const health = this.serverHealth.get(serverUrl);
        if (health) {
          health.server = newCredentials;
        }

        // Schedule next refresh
        this.scheduleCredentialRefresh(newCredentials);

        this.emitEvent(NATEventType.CredentialsRefreshed, {
          server: serverUrl,
          expiresAt: newCredentials.expiresAt,
        });

        return newCredentials;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.config.credentialConfig.maxRetries - 1) {
          await this.delay(this.config.credentialConfig.retryDelay);
        }
      }
    }

    state.refreshing = false;
    throw lastError ?? new Error('Credential refresh failed');
  }

  private async doCredentialFetch(serverUrl: string): Promise<TURNConfig> {
    if (!this.config.credentialConfig) {
      throw new Error('No credential configuration');
    }

    const { refreshUrl, authToken } = this.config.credentialConfig;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ server: serverUrl }),
    });

    if (!response.ok) {
      throw new Error(`Credential refresh failed: ${response.status}`);
    }

    const data = await response.json();

    // Validate response
    if (!data.urls || !data.username || !data.credential) {
      throw new Error('Invalid credential response format');
    }

    return {
      urls: data.urls,
      username: data.username,
      credential: data.credential,
      credentialType: data.credentialType || 'password',
      expiresAt: data.expiresAt,
      region: data.region,
      priority: data.priority,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitEvent<T>(type: NATEventType, data: T): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      const event: NATEvent<T> = {
        type,
        timestamp: Date.now(),
        data,
      };
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`TURN event handler error for ${type}:`, error);
        }
      });
    }
  }
}

export default TURNManager;
