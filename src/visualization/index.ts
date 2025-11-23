/**
 * @fileoverview Visualization API module entry point
 * @module visualization
 */

export * from './types';
export { DataTransformer } from './core/DataTransformer';
export { WebSocketServer, WebSocketServerConfig } from './api/WebSocketServer';
export { RestApiServer, RestApiConfig } from './api/RestEndpoints';

import { EventStore } from '../persistence/event-store';
import { ReasoningStore } from '../persistence/reasoning-store';
import { DataTransformer } from './core/DataTransformer';
import { WebSocketServer, WebSocketServerConfig } from './api/WebSocketServer';
import { RestApiServer, RestApiConfig } from './api/RestEndpoints';

/**
 * Visualization service configuration
 */
export interface VisualizationServiceConfig {
  /** Event store instance */
  eventStore: EventStore;
  /** Reasoning store instance */
  reasoningStore: ReasoningStore;
  /** REST API configuration */
  restApi?: RestApiConfig;
  /** WebSocket server configuration */
  webSocket?: WebSocketServerConfig;
  /** Enable REST API */
  enableRestApi?: boolean;
  /** Enable WebSocket server */
  enableWebSocket?: boolean;
}

/**
 * Integrated visualization service
 *
 * Provides unified access to visualization data through both REST and WebSocket APIs
 *
 * @example
 * ```typescript
 * const service = new VisualizationService({
 *   eventStore,
 *   reasoningStore,
 *   enableRestApi: true,
 *   enableWebSocket: true,
 *   restApi: { port: 3000 },
 *   webSocket: { port: 8080 }
 * });
 *
 * await service.start();
 * ```
 */
export class VisualizationService {
  private eventStore: EventStore;
  private reasoningStore: ReasoningStore;
  private transformer: DataTransformer;
  private restApi?: RestApiServer;
  private webSocket?: WebSocketServer;
  private config: VisualizationServiceConfig;

  constructor(config: VisualizationServiceConfig) {
    this.config = config;
    this.eventStore = config.eventStore;
    this.reasoningStore = config.reasoningStore;
    this.transformer = new DataTransformer(this.eventStore, this.reasoningStore);

    // Initialize REST API if enabled
    if (config.enableRestApi !== false) {
      this.restApi = new RestApiServer(
        this.eventStore,
        this.reasoningStore,
        config.restApi
      );
    }

    // Initialize WebSocket server if enabled
    if (config.enableWebSocket !== false) {
      this.webSocket = new WebSocketServer(
        this.eventStore,
        this.reasoningStore,
        config.webSocket
      );
    }
  }

  /**
   * Start visualization services
   */
  async start(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.restApi) {
      promises.push(this.restApi.start());
    }

    if (this.webSocket) {
      promises.push(this.webSocket.start());
    }

    await Promise.all(promises);
  }

  /**
   * Stop visualization services
   */
  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.restApi) {
      promises.push(this.restApi.stop());
    }

    if (this.webSocket) {
      promises.push(this.webSocket.stop());
    }

    await Promise.all(promises);
  }

  /**
   * Get data transformer
   */
  getTransformer(): DataTransformer {
    return this.transformer;
  }

  /**
   * Get REST API server
   */
  getRestApi(): RestApiServer | undefined {
    return this.restApi;
  }

  /**
   * Get WebSocket server
   */
  getWebSocket(): WebSocketServer | undefined {
    return this.webSocket;
  }

  /**
   * Get service status
   */
  getStatus(): {
    restApi?: { isRunning: boolean; port: number };
    webSocket?: { isRunning: boolean; connectedClients: number };
  } {
    return {
      restApi: this.restApi?.getStatus(),
      webSocket: this.webSocket?.getStatistics(),
    };
  }
}
