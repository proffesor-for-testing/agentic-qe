/**
 * Environment Configuration for Code Intelligence System
 *
 * Manages database connections, embedding providers, indexing settings,
 * and search configuration for the semantic code analysis system.
 */

export interface CodeIntelligenceConfig {
  // Database configuration
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };

  // Embeddings configuration
  embeddings: {
    provider: 'nomic' | 'ollama' | 'openai';
    model: string;
    dimensions: number;
    batchSize: number;
  };

  // Indexing configuration
  indexing: {
    watchEnabled: boolean;
    ignoredPatterns: string[];
    supportedLanguages: string[];
    maxFileSize: number;
  };

  // Search configuration
  search: {
    hybridEnabled: boolean;
    bm25Weight: number;
    vectorWeight: number;
    defaultLimit: number;
  };
}

export const defaultConfig: CodeIntelligenceConfig = {
  database: {
    host: process.env.RUVECTOR_HOST || 'localhost',
    port: parseInt(process.env.RUVECTOR_PORT || '5432'),
    database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
    user: process.env.RUVECTOR_USER || 'ruvector',
    password: process.env.RUVECTOR_PASSWORD || 'ruvector',
  },
  embeddings: {
    provider: 'nomic',
    model: 'nomic-embed-text',
    dimensions: 768,
    batchSize: 100,
  },
  indexing: {
    watchEnabled: false,
    ignoredPatterns: ['node_modules/**', 'dist/**', '.git/**', '*.d.ts'],
    supportedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust'],
    maxFileSize: 1024 * 1024, // 1MB
  },
  search: {
    hybridEnabled: true,
    bm25Weight: 0.5,
    vectorWeight: 0.5,
    defaultLimit: 10,
  },
};

/**
 * Get configuration with optional overrides
 * @param overrides Partial configuration to override defaults
 * @returns Complete configuration object
 */
export function getConfig(overrides?: Partial<CodeIntelligenceConfig>): CodeIntelligenceConfig {
  return { ...defaultConfig, ...overrides };
}

/**
 * Validate configuration
 * @param config Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: CodeIntelligenceConfig): void {
  // Validate database configuration
  if (!config.database.host) {
    throw new Error('Database host is required');
  }
  if (config.database.port < 1 || config.database.port > 65535) {
    throw new Error('Database port must be between 1 and 65535');
  }

  // Validate embeddings configuration
  if (!['nomic', 'ollama', 'openai'].includes(config.embeddings.provider)) {
    throw new Error('Invalid embeddings provider');
  }
  if (config.embeddings.dimensions < 1) {
    throw new Error('Embeddings dimensions must be positive');
  }
  if (config.embeddings.batchSize < 1) {
    throw new Error('Batch size must be positive');
  }

  // Validate search configuration
  const totalWeight = config.search.bm25Weight + config.search.vectorWeight;
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    throw new Error('BM25 and vector weights must sum to 1.0');
  }
}

/**
 * Get database connection string
 * @param config Configuration object
 * @returns PostgreSQL connection string
 */
export function getDatabaseConnectionString(config: CodeIntelligenceConfig): string {
  const { host, port, database, user, password } = config.database;
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}
