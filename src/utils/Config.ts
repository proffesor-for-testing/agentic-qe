/**
 * Config - Configuration management for the AQE Fleet
 *
 * Handles loading and validation of fleet configuration from multiple sources
 * including environment variables, config files, and defaults.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import yaml from 'yaml';
import dotenv from 'dotenv';

export interface AgentConfig {
  type: string;
  count: number;
  config: any;
}

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres' | 'mysql';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  filename?: string; // For SQLite
}

export interface FleetConfig {
  fleet: {
    id: string;
    name: string;
    maxAgents: number;
    heartbeatInterval: number;
    taskTimeout: number;
  };
  agents: AgentConfig[];
  database: DatabaseConfig;
  logging: {
    level: string;
    format: string;
    outputs: string[];
  };
  api: {
    port: number;
    host: string;
    cors: boolean;
    rateLimit: {
      windowMs: number;
      max: number;
    };
  };
  security: {
    apiKey?: string;
    jwtSecret?: string;
    encryption: {
      algorithm: string;
      keyLength: number;
    };
  };
}

export class Config {
  private static instance: Config | null = null;
  private config: FleetConfig;

  private constructor(config: FleetConfig) {
    this.config = config;
  }

  /**
   * Load configuration from multiple sources
   */
  public static async load(configPath?: string): Promise<FleetConfig> {
    // Load environment variables
    dotenv.config();

    // Default configuration
    const defaultConfig: FleetConfig = {
      fleet: {
        id: process.env.FLEET_ID || 'default-fleet',
        name: process.env.FLEET_NAME || 'AQE Fleet',
        maxAgents: parseInt(process.env.MAX_AGENTS || '10'),
        heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
        taskTimeout: parseInt(process.env.TASK_TIMEOUT || '300000')
      },
      agents: [
        {
          type: 'test-executor',
          count: parseInt(process.env.TEST_EXECUTOR_COUNT || '2'),
          config: {}
        },
        {
          type: 'quality-analyzer',
          count: parseInt(process.env.QUALITY_ANALYZER_COUNT || '2'),
          config: {}
        },
        {
          type: 'performance-tester',
          count: parseInt(process.env.PERFORMANCE_TESTER_COUNT || '1'),
          config: {}
        }
      ],
      database: {
        type: (process.env.DB_TYPE as 'sqlite' | 'postgres' | 'mysql') || 'sqlite',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'agentic_qe',
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        filename: process.env.DB_FILENAME || './data/fleet.db'
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        outputs: (process.env.LOG_OUTPUTS || 'console,file').split(',')
      },
      api: {
        port: parseInt(process.env.API_PORT || '3000'),
        host: process.env.API_HOST || '0.0.0.0',
        cors: process.env.API_CORS === 'true',
        rateLimit: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
          max: parseInt(process.env.RATE_LIMIT_MAX || '100')
        }
      },
      security: {
        apiKey: process.env.API_KEY,
        jwtSecret: process.env.JWT_SECRET,
        encryption: {
          algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
          keyLength: parseInt(process.env.ENCRYPTION_KEY_LENGTH || '32')
        }
      }
    };

    // Load from config file if provided or exists
    let fileConfig: Partial<FleetConfig> = {};
    const configFilePath = configPath ||
                          process.env.CONFIG_FILE ||
                          join(process.cwd(), 'config', 'fleet.yaml');

    try {
      await fs.access(configFilePath);
      try {
        const configFileContent = await fs.readFile(configFilePath, 'utf8');
        if (configFilePath.endsWith('.yaml') || configFilePath.endsWith('.yml')) {
          fileConfig = yaml.parse(configFileContent);
        } else if (configFilePath.endsWith('.json')) {
          fileConfig = JSON.parse(configFileContent);
        }
      } catch (error) {
        console.warn(`Failed to load config file ${configFilePath}:`, error);
      }
    } catch {
      // Config file doesn't exist, skip loading
    }

    // Merge configurations (file config overrides defaults, env vars override both)
    const mergedConfig = Config.mergeConfigs(defaultConfig, fileConfig);

    // Validate configuration
    Config.validateConfig(mergedConfig);

    // Create singleton instance
    Config.instance = new Config(mergedConfig);

    return mergedConfig;
  }

  /**
   * Get configuration instance
   */
  public static getInstance(): Config {
    if (!Config.instance) {
      throw new Error('Config not loaded. Call Config.load() first.');
    }
    return Config.instance;
  }

  /**
   * Get full configuration
   */
  public getConfig(): FleetConfig {
    return this.config;
  }

  /**
   * Get fleet configuration
   */
  public getFleetConfig() {
    return this.config.fleet;
  }

  /**
   * Get agents configuration
   */
  public getAgentsConfig(): AgentConfig[] {
    return this.config.agents;
  }

  /**
   * Get database configuration
   */
  public getDatabaseConfig(): DatabaseConfig {
    return this.config.database;
  }

  /**
   * Get logging configuration
   */
  public getLoggingConfig() {
    return this.config.logging;
  }

  /**
   * Get API configuration
   */
  public getApiConfig() {
    return this.config.api;
  }

  /**
   * Get security configuration
   */
  public getSecurityConfig() {
    return this.config.security;
  }

  /**
   * Deep merge configurations
   */
  private static mergeConfigs(base: FleetConfig, override: Partial<FleetConfig>): FleetConfig {
    const merged = { ...base };

    if (override.fleet) {
      merged.fleet = { ...merged.fleet, ...override.fleet };
    }

    if (override.agents) {
      merged.agents = override.agents;
    }

    if (override.database) {
      merged.database = { ...merged.database, ...override.database };
    }

    if (override.logging) {
      merged.logging = { ...merged.logging, ...override.logging };
    }

    if (override.api) {
      merged.api = { ...merged.api, ...override.api };
      if (override.api.rateLimit) {
        merged.api.rateLimit = { ...merged.api.rateLimit, ...override.api.rateLimit };
      }
    }

    if (override.security) {
      merged.security = { ...merged.security, ...override.security };
      if (override.security.encryption) {
        merged.security.encryption = { ...merged.security.encryption, ...override.security.encryption };
      }
    }

    return merged;
  }

  /**
   * Save configuration to file
   */
  public static async save(config: Partial<FleetConfig>, filePath: string): Promise<void> {
    const fsp = (await import('fs')).promises;
    try {
      await fsp.access(dirname(filePath));
    } catch {
      await fsp.mkdir(dirname(filePath), { recursive: true });
    }
    await fsp.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Validate configuration
   */
  private static validateConfig(config: FleetConfig): void {
    // Validate fleet config
    if (!config.fleet.id) {
      throw new Error('Fleet ID is required');
    }

    if (config.fleet.maxAgents <= 0) {
      throw new Error('Max agents must be greater than 0');
    }

    // Validate agents config
    if (!Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error('At least one agent configuration is required');
    }

    for (const agent of config.agents) {
      if (!agent.type) {
        throw new Error('Agent type is required');
      }
      if (agent.count <= 0) {
        throw new Error('Agent count must be greater than 0');
      }
    }

    // Validate database config
    if (!config.database.database) {
      throw new Error('Database name is required');
    }

    if (config.database.type === 'sqlite' && !config.database.filename) {
      throw new Error('SQLite filename is required');
    }

    // Validate API config
    if (config.api.port <= 0 || config.api.port > 65535) {
      throw new Error('API port must be between 1 and 65535');
    }
  }
}