/**
 * Adapter Factory - Strict Adapter Creation
 *
 * Architecture Decision: Fail-fast on misconfiguration
 * - No silent fallbacks
 * - Explicit error messages
 * - Type-safe adapter creation
 *
 * @module AdapterFactory
 * @version 1.0.0
 */

import {
  AdapterConfig,
  AdapterType,
  AdapterConfigValidator,
  AdapterConfigurationError
} from './AdapterConfig';
import { RealAgentDBAdapter } from './RealAgentDBAdapter';
import { ReasoningBankAdapter } from './ReasoningBankAdapter';

/**
 * Adapter interface (common methods across all adapters)
 */
export interface IAdapter {
  initialize(): Promise<void>;
  store(pattern: any): Promise<string>;
  insertPattern(pattern: any): Promise<string>;
  retrieveWithReasoning(queryEmbedding: number[], options: any): Promise<any>;
  getStats(): Promise<any>;
  query?(sql: string, params?: any[]): Promise<any[]>;
  train?(data: any): Promise<{ loss: number; valLoss: number; duration: number; epochs: number }>;
  close(): Promise<void>;
  readonly initialized: boolean;
}

/**
 * Adapter creation result
 */
export interface AdapterCreationResult {
  adapter: IAdapter;
  type: AdapterType;
  config: AdapterConfig;
}

/**
 * Adapter Factory
 */
export class AdapterFactory {
  /**
   * Create adapter from configuration
   *
   * @throws {AdapterConfigurationError} If configuration is invalid
   * @throws {Error} If adapter creation fails
   */
  static async create(config: AdapterConfig): Promise<AdapterCreationResult> {
    // Validate configuration
    if (config.validateOnStartup !== false) {
      AdapterConfigValidator.validateOrThrow(config);
    }

    // Create adapter based on type
    const adapter = await this.createAdapter(config);

    return {
      adapter,
      type: config.type,
      config
    };
  }

  /**
   * Create adapter instance
   */
  private static async createAdapter(config: AdapterConfig): Promise<IAdapter> {
    switch (config.type) {
      case AdapterType.REAL:
        return this.createRealAdapter(config);

      case AdapterType.MOCK:
        return this.createMockAdapter(config);

      case AdapterType.AUTO:
        return this.createAutoAdapter(config);

      default:
        throw new AdapterConfigurationError(
          `Unknown adapter type: ${config.type}`,
          [`Unsupported adapter type: ${config.type}`]
        );
    }
  }

  /**
   * Create real AgentDB adapter
   */
  private static async createRealAdapter(config: AdapterConfig): Promise<IAdapter> {
    if (!config.dbPath) {
      throw new AdapterConfigurationError(
        'dbPath is required for AdapterType.REAL',
        ['dbPath must be specified for real adapter']
      );
    }

    try {
      const adapter = new RealAgentDBAdapter({
        dbPath: config.dbPath,
        dimension: config.dimension || 384
      });

      await adapter.initialize();

      console.log('[AdapterFactory] Created REAL adapter', {
        dbPath: config.dbPath,
        dimension: config.dimension || 384
      });

      return adapter;
    } catch (error: any) {
      const errorMessage = [
        'Failed to create real AgentDB adapter:',
        `  Reason: ${error.message}`,
        '',
        'Common causes:',
        '  1. agentdb package not installed: npm install agentdb',
        '  2. Database file path not writable',
        '  3. Insufficient disk space',
        '',
        'To use mock adapter for testing, set AQE_ADAPTER_TYPE=mock'
      ].join('\n');

      if (config.failFast !== false) {
        throw new Error(errorMessage);
      } else {
        console.error(`[AdapterFactory] ${errorMessage}`);
        throw error;
      }
    }
  }

  /**
   * Create mock adapter (for testing)
   */
  private static async createMockAdapter(config: AdapterConfig): Promise<IAdapter> {
    const adapter = new ReasoningBankAdapter();
    await adapter.initialize();

    console.log('[AdapterFactory] Created MOCK adapter (in-memory only)', {
      dimension: config.dimension || 384
    });

    return adapter;
  }

  /**
   * Create adapter with auto-detection (DEPRECATED)
   */
  private static async createAutoAdapter(config: AdapterConfig): Promise<IAdapter> {
    console.warn(
      '[AdapterFactory] AUTO adapter detection is deprecated. ' +
      'Please use explicit AdapterType.REAL or AdapterType.MOCK.'
    );

    // Try real adapter first
    try {
      const realConfig = { ...config, type: AdapterType.REAL };
      return await this.createRealAdapter(realConfig);
    } catch (error) {
      console.warn('[AdapterFactory] Real adapter failed, falling back to mock:', error);

      // Fallback to mock
      const mockConfig = { ...config, type: AdapterType.MOCK };
      return await this.createMockAdapter(mockConfig);
    }
  }

  /**
   * Validate adapter at runtime
   */
  static async validate(adapter: IAdapter): Promise<void> {
    if (!adapter) {
      throw new Error('Adapter is null or undefined');
    }

    if (!adapter.initialized) {
      throw new Error('Adapter is not initialized');
    }

    // Check required methods
    const requiredMethods = ['store', 'retrieveWithReasoning', 'getStats', 'query', 'close'];
    for (const method of requiredMethods) {
      if (typeof (adapter as any)[method] !== 'function') {
        throw new Error(`Adapter missing required method: ${method}`);
      }
    }

    // Test adapter with basic operation
    try {
      await adapter.getStats();
    } catch (error: any) {
      throw new Error(`Adapter validation failed: ${error.message}`);
    }
  }
}
