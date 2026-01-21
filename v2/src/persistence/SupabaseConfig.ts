/**
 * Supabase Configuration
 *
 * Configuration types and utilities for Supabase cloud persistence.
 * Supports environment variable loading and secure key management.
 *
 * @module persistence/SupabaseConfig
 */

import type { PrivacyLevel, SharingConfig } from './IPersistenceProvider.js';

// ============================================
// Environment Variable Names
// ============================================

/**
 * Environment variable names for Supabase configuration
 */
export const SUPABASE_ENV_VARS = {
  /** Supabase project URL */
  URL: 'SUPABASE_URL',
  /** Supabase anonymous key (public) */
  ANON_KEY: 'SUPABASE_ANON_KEY',
  /** Supabase service role key (admin, optional) */
  SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  /** AQE project ID */
  PROJECT_ID: 'AQE_PROJECT_ID',
  /** Persistence provider type */
  PROVIDER: 'AQE_PERSISTENCE_PROVIDER',
  /** Default privacy level */
  DEFAULT_PRIVACY: 'AQE_DEFAULT_PRIVACY',
  /** Auto-share enabled */
  AUTO_SHARE: 'AQE_AUTO_SHARE',
  /** Auto-import enabled */
  AUTO_IMPORT: 'AQE_AUTO_IMPORT',
  /** Sync interval (ms) */
  SYNC_INTERVAL: 'AQE_SYNC_INTERVAL',
} as const;

// ============================================
// Configuration Types
// ============================================

/**
 * Supabase connection configuration
 */
export interface SupabaseConnectionConfig {
  /** Supabase project URL (e.g., https://xxx.supabase.co) */
  url: string;
  /** Supabase anonymous key (safe to expose in client) */
  anonKey: string;
  /** Supabase service role key (admin operations only) */
  serviceRoleKey?: string;
}

/**
 * Project configuration for multi-tenant support
 */
export interface ProjectConfig {
  /** Project ID (auto-generated if not specified) */
  projectId?: string;
  /** Project name for display */
  projectName?: string;
  /** Owner user ID (from Supabase Auth) */
  ownerId?: string;
  /** Team member IDs with access */
  teamIds?: string[];
}

/**
 * Sync configuration for hybrid mode
 */
export interface SyncConfig {
  /** Sync interval in milliseconds (default: 60000 = 1 minute) */
  syncInterval: number;
  /** Conflict resolution strategy */
  conflictResolution: 'local' | 'remote' | 'newest';
  /** Maximum batch size for sync operations */
  batchSize: number;
  /** Retry attempts for failed syncs */
  retryAttempts: number;
  /** Retry delay in milliseconds */
  retryDelay: number;
  /** Enable background sync */
  backgroundSync: boolean;
}

/**
 * Full Supabase configuration
 */
export interface SupabaseConfig {
  /** Connection configuration */
  connection: SupabaseConnectionConfig;
  /** Project configuration */
  project: ProjectConfig;
  /** Sharing configuration */
  sharing: SharingConfig;
  /** Sync configuration (for hybrid mode) */
  sync: SyncConfig;
  /** Enable RuVector extension features */
  enableRuVector: boolean;
  /** Enable Row-Level Security enforcement */
  enableRLS: boolean;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default sharing configuration (private by default)
 */
export const DEFAULT_SHARING_CONFIG: SharingConfig = {
  defaultPrivacyLevel: 'private',
  autoShare: false,
  autoImport: false,
};

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  syncInterval: 60000, // 1 minute
  conflictResolution: 'newest',
  batchSize: 100,
  retryAttempts: 3,
  retryDelay: 1000,
  backgroundSync: true,
};

/**
 * Default Supabase configuration
 */
export const DEFAULT_SUPABASE_CONFIG: Partial<SupabaseConfig> = {
  project: {},
  sharing: DEFAULT_SHARING_CONFIG,
  sync: DEFAULT_SYNC_CONFIG,
  enableRuVector: true,
  enableRLS: true,
};

// ============================================
// Environment Loading
// ============================================

/**
 * Load Supabase configuration from environment variables
 *
 * @returns Partial configuration from environment
 * @throws Error if required variables are missing
 */
export function loadSupabaseConfigFromEnv(): Partial<SupabaseConfig> {
  const url = process.env[SUPABASE_ENV_VARS.URL];
  const anonKey = process.env[SUPABASE_ENV_VARS.ANON_KEY];
  const serviceRoleKey = process.env[SUPABASE_ENV_VARS.SERVICE_ROLE_KEY];
  const projectId = process.env[SUPABASE_ENV_VARS.PROJECT_ID];
  const defaultPrivacy = process.env[SUPABASE_ENV_VARS.DEFAULT_PRIVACY] as PrivacyLevel | undefined;
  const autoShare = process.env[SUPABASE_ENV_VARS.AUTO_SHARE];
  const autoImport = process.env[SUPABASE_ENV_VARS.AUTO_IMPORT];
  const syncInterval = process.env[SUPABASE_ENV_VARS.SYNC_INTERVAL];

  // Build config from environment
  const config: Partial<SupabaseConfig> = {};

  if (url && anonKey) {
    config.connection = {
      url,
      anonKey,
      serviceRoleKey,
    };
  }

  if (projectId) {
    config.project = { projectId };
  }

  // Override sharing defaults if specified
  const sharing: Partial<SharingConfig> = {};
  if (defaultPrivacy && ['private', 'team', 'public'].includes(defaultPrivacy)) {
    sharing.defaultPrivacyLevel = defaultPrivacy;
  }
  if (autoShare !== undefined) {
    sharing.autoShare = autoShare === 'true' || autoShare === '1';
  }
  if (autoImport !== undefined) {
    sharing.autoImport = autoImport === 'true' || autoImport === '1';
  }
  if (Object.keys(sharing).length > 0) {
    config.sharing = { ...DEFAULT_SHARING_CONFIG, ...sharing };
  }

  // Override sync defaults if specified
  if (syncInterval) {
    const interval = parseInt(syncInterval, 10);
    if (!isNaN(interval) && interval > 0) {
      config.sync = { ...DEFAULT_SYNC_CONFIG, syncInterval: interval };
    }
  }

  return config;
}

/**
 * Check if Supabase is configured via environment variables
 *
 * @returns True if Supabase URL and key are set
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env[SUPABASE_ENV_VARS.URL];
  const anonKey = process.env[SUPABASE_ENV_VARS.ANON_KEY];
  return Boolean(url && anonKey);
}

/**
 * Get the configured persistence provider type from environment
 *
 * @returns Provider type or 'sqlite' as default
 */
export function getConfiguredProvider(): 'sqlite' | 'supabase' | 'hybrid' {
  const provider = process.env[SUPABASE_ENV_VARS.PROVIDER];
  if (provider === 'supabase' || provider === 'hybrid') {
    return provider;
  }
  return 'sqlite';
}

// ============================================
// Configuration Validation
// ============================================

/**
 * Validation result for configuration
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Supabase configuration
 *
 * @param config Configuration to validate
 * @returns Validation result
 */
export function validateSupabaseConfig(config: Partial<SupabaseConfig>): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check connection config
  if (!config.connection) {
    errors.push('Missing connection configuration');
  } else {
    if (!config.connection.url) {
      errors.push('Missing Supabase URL');
    } else if (!config.connection.url.startsWith('https://')) {
      errors.push('Supabase URL must use HTTPS');
    }

    if (!config.connection.anonKey) {
      errors.push('Missing Supabase anonymous key');
    }

    if (!config.connection.serviceRoleKey) {
      warnings.push('No service role key configured - admin operations will be limited');
    }
  }

  // Check project config
  if (!config.project?.projectId) {
    warnings.push('No project ID configured - a new project will be auto-created');
  }

  // Check sharing config
  if (config.sharing?.autoShare && config.sharing?.defaultPrivacyLevel === 'private') {
    warnings.push('autoShare is enabled but defaultPrivacyLevel is private - experiences will not be shared');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// Configuration Builder
// ============================================

/**
 * Build a complete Supabase configuration
 *
 * @param overrides Configuration overrides
 * @returns Complete configuration with defaults applied
 * @throws Error if required configuration is missing
 */
export function buildSupabaseConfig(
  overrides: Partial<SupabaseConfig> = {}
): SupabaseConfig {
  // Load from environment first
  const envConfig = loadSupabaseConfigFromEnv();

  // Merge with overrides (overrides take precedence)
  const merged: Partial<SupabaseConfig> = {
    ...DEFAULT_SUPABASE_CONFIG,
    ...envConfig,
    ...overrides,
    // Deep merge for nested objects
    connection: {
      ...envConfig.connection,
      ...overrides.connection,
    } as SupabaseConnectionConfig,
    project: {
      ...envConfig.project,
      ...overrides.project,
    },
    sharing: {
      ...DEFAULT_SHARING_CONFIG,
      ...envConfig.sharing,
      ...overrides.sharing,
    },
    sync: {
      ...DEFAULT_SYNC_CONFIG,
      ...envConfig.sync,
      ...overrides.sync,
    },
  };

  // Validate
  const validation = validateSupabaseConfig(merged);
  if (!validation.valid) {
    throw new Error(`Invalid Supabase configuration: ${validation.errors.join(', ')}`);
  }

  // Log warnings
  for (const warning of validation.warnings) {
    console.warn(`[SupabaseConfig] Warning: ${warning}`);
  }

  return merged as SupabaseConfig;
}

// ============================================
// Table Names
// ============================================

/**
 * Supabase table names for AQE data
 */
export const SUPABASE_TABLES = {
  /** Projects/tenants table */
  PROJECTS: 'qe_projects',
  /** Learning experiences */
  EXPERIENCES: 'qe_learning_experiences',
  /** Test patterns */
  PATTERNS: 'qe_patterns',
  /** Nervous system state */
  NERVOUS_SYSTEM: 'qe_nervous_system_state',
  /** Aggregated metrics */
  METRICS: 'qe_aggregate_metrics',
  /** Sync queue for hybrid mode */
  SYNC_QUEUE: 'qe_sync_queue',
  /** Memory entries (SwarmMemory sync) */
  MEMORY_ENTRIES: 'qe_memory_entries',
  /** Telemetry events */
  EVENTS: 'qe_events',
  /** Code chunks (code intelligence sync) */
  CODE_CHUNKS: 'qe_code_chunks',
} as const;

/**
 * Get table name with optional schema prefix
 *
 * @param table Table constant
 * @param schema Optional schema name
 * @returns Full table name
 */
export function getTableName(
  table: (typeof SUPABASE_TABLES)[keyof typeof SUPABASE_TABLES],
  schema?: string
): string {
  return schema ? `${schema}.${table}` : table;
}
