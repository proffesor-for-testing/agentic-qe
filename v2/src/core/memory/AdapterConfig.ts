/**
 * Adapter Configuration - Explicit Adapter Selection
 *
 * Architecture Decision: Explicit configuration over runtime detection
 * - No silent fallbacks to mock adapters
 * - Fail-fast on misconfiguration
 * - Clear error messages for troubleshooting
 *
 * @module AdapterConfig
 * @version 1.0.0
 */

/**
 * Supported adapter types
 */
export enum AdapterType {
  /** Production AgentDB adapter (requires agentdb package) */
  REAL = 'real',

  /** Mock adapter for testing (in-memory only) */
  MOCK = 'mock',

  /** Auto-detect based on environment (DEPRECATED - use explicit types) */
  AUTO = 'auto'
}

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  /**
   * Adapter type to use
   * - 'real': Production AgentDB adapter (requires agentdb package)
   * - 'mock': Mock adapter for testing (in-memory only)
   * - 'auto': Auto-detect (DEPRECATED - will be removed in v2.0.0)
   */
  type: AdapterType;

  /**
   * Path to SQLite database file
   * Required for 'real' adapter, ignored for 'mock'
   */
  dbPath?: string;

  /**
   * Embedding dimension (default: 384)
   */
  dimension?: number;

  /**
   * Fail-fast on adapter initialization errors
   * If true (default), throws error immediately
   * If false, logs warning and continues (NOT RECOMMENDED for production)
   */
  failFast?: boolean;

  /**
   * Enable validation at startup
   * If true (default), validates adapter configuration before initialization
   */
  validateOnStartup?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Adapter Configuration Validator
 */
export class AdapterConfigValidator {
  /**
   * Validate adapter configuration
   */
  static validate(config: AdapterConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate adapter type
    if (!config.type) {
      errors.push('Adapter type is required');
    }

    if (!Object.values(AdapterType).includes(config.type)) {
      errors.push(`Invalid adapter type: ${config.type}. Must be one of: ${Object.values(AdapterType).join(', ')}`);
    }

    // Warn about deprecated 'auto' type
    if (config.type === AdapterType.AUTO) {
      warnings.push(
        'AdapterType.AUTO is deprecated and will be removed in v2.0.0. ' +
        'Please use explicit AdapterType.REAL or AdapterType.MOCK instead.'
      );
    }

    // Validate dbPath for real adapter
    if (config.type === AdapterType.REAL) {
      if (!config.dbPath) {
        errors.push('dbPath is required for AdapterType.REAL');
      } else if (config.dbPath.includes('\0')) {
        errors.push('Invalid dbPath: contains null byte');
      } else if (config.dbPath === ':memory:') {
        warnings.push(
          'Using :memory: database with AdapterType.REAL. ' +
          'Data will be lost when process terminates. ' +
          'Consider using AdapterType.MOCK for in-memory testing.'
        );
      }
    }

    // Validate dimension
    if (config.dimension !== undefined) {
      if (config.dimension <= 0) {
        errors.push('Dimension must be greater than 0');
      }
      if (config.dimension > 4096) {
        warnings.push(`Large dimension (${config.dimension}) may impact performance`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Throw error if configuration is invalid
   */
  static validateOrThrow(config: AdapterConfig): void {
    const result = this.validate(config);

    // Log warnings
    result.warnings.forEach(warning => {
      console.warn(`[AdapterConfig] WARNING: ${warning}`);
    });

    // Throw on errors
    if (!result.valid) {
      const errorMessage = [
        'Invalid adapter configuration:',
        ...result.errors.map(e => `  - ${e}`)
      ].join('\n');

      throw new AdapterConfigurationError(errorMessage, result.errors);
    }
  }
}

/**
 * Adapter configuration error
 */
export class AdapterConfigurationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(message);
    this.name = 'AdapterConfigurationError';
  }
}

/**
 * Environment-based adapter configuration helper
 */
export class AdapterConfigHelper {
  /**
   * Get adapter configuration from environment
   */
  static fromEnvironment(): AdapterConfig {
    const type = this.getAdapterTypeFromEnv();
    const dbPath = process.env.AGENTDB_PATH || '.agentic-qe/agentdb.db';
    const dimension = parseInt(process.env.AGENTDB_DIMENSION || '384', 10);

    const config: AdapterConfig = {
      type,
      dbPath: type === AdapterType.REAL ? dbPath : undefined,
      dimension,
      failFast: process.env.AGENTDB_FAIL_FAST !== 'false',
      validateOnStartup: process.env.AGENTDB_VALIDATE !== 'false'
    };

    return config;
  }

  /**
   * Get adapter type from environment variables
   */
  private static getAdapterTypeFromEnv(): AdapterType {
    // Explicit configuration via AQE_ADAPTER_TYPE
    const explicitType = process.env.AQE_ADAPTER_TYPE?.toLowerCase();
    if (explicitType === 'real') return AdapterType.REAL;
    if (explicitType === 'mock') return AdapterType.MOCK;

    // Legacy support: AQE_USE_MOCK_AGENTDB
    if (process.env.AQE_USE_MOCK_AGENTDB === 'true') {
      console.warn(
        '[AdapterConfig] AQE_USE_MOCK_AGENTDB is deprecated. ' +
        'Use AQE_ADAPTER_TYPE=mock instead.'
      );
      return AdapterType.MOCK;
    }

    // Test environment detection
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      return AdapterType.MOCK;
    }

    // Production default: REAL adapter
    return AdapterType.REAL;
  }

  /**
   * Create production configuration
   */
  static forProduction(dbPath: string, dimension: number = 384): AdapterConfig {
    return {
      type: AdapterType.REAL,
      dbPath,
      dimension,
      failFast: true,
      validateOnStartup: true
    };
  }

  /**
   * Create test configuration
   */
  static forTesting(dimension: number = 384): AdapterConfig {
    return {
      type: AdapterType.MOCK,
      dimension,
      failFast: false,
      validateOnStartup: true
    };
  }

  /**
   * Create development configuration
   */
  static forDevelopment(dbPath: string = '.agentic-qe/dev.db', dimension: number = 384): AdapterConfig {
    return {
      type: AdapterType.REAL,
      dbPath,
      dimension,
      failFast: true,
      validateOnStartup: true
    };
  }
}
