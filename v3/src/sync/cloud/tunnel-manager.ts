/**
 * IAP Tunnel Manager
 *
 * Manages Google Cloud IAP tunnels for secure database connections.
 * Uses gcloud CLI to create tunnels to Cloud SQL instances.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createConnection, type Socket } from 'net';
import type { TunnelConnection, CloudConfig } from '../interfaces.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('tunnel-manager');

/**
 * Redact the password portion of a PostgreSQL connection string.
 * Replaces the password between `://user:` and `@host` with `***`.
 * Safe to call on strings that have no password or are not URLs.
 */
export function redactConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch (e) {
    // Not a valid URL — mask anything that looks like a password in a connection string
    logger.debug('URL parse failed during redaction, using regex fallback', { error: e instanceof Error ? e.message : String(e) });
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

/**
 * Tunnel manager interface
 */
export interface TunnelManager {
  /** Start the IAP tunnel */
  start(): Promise<TunnelConnection>;

  /** Stop the tunnel */
  stop(): Promise<void>;

  /** Check if tunnel is active */
  isActive(): boolean;

  /** Get connection info */
  getConnection(): TunnelConnection | null;
}

/**
 * IAP tunnel manager implementation
 */
export class IAPTunnelManager implements TunnelManager {
  private process: ChildProcess | null = null;
  private connection: TunnelConnection | null = null;
  private readonly config: CloudConfig;

  constructor(config: CloudConfig) {
    this.config = config;
  }

  /**
   * Check if a port is accepting connections
   */
  private checkPort(host: string, port: number, timeout: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket: Socket = createConnection({ host, port });

      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Start the IAP tunnel
   */
  async start(): Promise<TunnelConnection> {
    if (this.process && this.connection) {
      console.log('[TunnelManager] Tunnel already running');
      return this.connection;
    }

    // Check if an external tunnel is already listening on the port
    const alreadyListening = await this.checkPort('localhost', this.config.tunnelPort);
    if (alreadyListening) {
      console.log(`[TunnelManager] External tunnel detected on port ${this.config.tunnelPort}, reusing`);
      this.connection = {
        host: 'localhost',
        port: this.config.tunnelPort,
        startedAt: new Date(),
      };
      return this.connection;
    }

    return new Promise((resolve, reject) => {
      const args = [
        'compute',
        'start-iap-tunnel',
        this.config.instance,
        '5432', // PostgreSQL port
        `--local-host-port=localhost:${this.config.tunnelPort}`,
        `--zone=${this.config.zone}`,
        `--project=${this.config.project}`,
      ];

      console.log(`[TunnelManager] Starting IAP tunnel: gcloud ${args.join(' ')}`);

      this.process = spawn('gcloud', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let started = false;
      let errorOutput = '';
      let checkingPort = false;

      // Listen for tunnel ready message
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString();
        console.log(`[TunnelManager] ${message.trim()}`);

        // Check for various tunnel ready indicators
        const readyIndicators = [
          'Listening on port',
          'tunnel is running',
          'Testing if tunnel connection works',  // gcloud IAP message
        ];

        const isReady = readyIndicators.some(indicator => message.includes(indicator));

        if (isReady && !started && !checkingPort) {
          checkingPort = true;
          // Wait a moment then verify port is actually accepting connections
          setTimeout(async () => {
            const maxRetries = 10;
            for (let i = 0; i < maxRetries; i++) {
              console.log(`[TunnelManager] Checking port connectivity (attempt ${i + 1}/${maxRetries})...`);
              const connected = await this.checkPort('localhost', this.config.tunnelPort);
              if (connected) {
                started = true;
                this.connection = {
                  host: 'localhost',
                  port: this.config.tunnelPort,
                  pid: this.process?.pid,
                  startedAt: new Date(),
                };
                console.log(`[TunnelManager] Tunnel ready on port ${this.config.tunnelPort}`);
                resolve(this.connection);
                return;
              }
              // Wait before next retry
              await new Promise(r => setTimeout(r, 1000));
            }
            checkingPort = false;
          }, 2000);
        }

        errorOutput += message;
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const message = data.toString();
        console.log(`[TunnelManager] ${message.trim()}`);
      });

      this.process.on('error', (error) => {
        console.error(`[TunnelManager] Process error: ${error.message}`);
        if (!started) {
          reject(new Error(`Failed to start tunnel: ${error.message}`));
        }
      });

      this.process.on('close', (code) => {
        console.log(`[TunnelManager] Process closed with code ${code}`);
        this.process = null;
        this.connection = null;
        if (!started) {
          reject(new Error(`Tunnel process exited with code ${code}: ${errorOutput}`));
        }
      });

      // Timeout after 60 seconds (increased for IAP tunnel startup)
      setTimeout(() => {
        if (!started) {
          this.stop();
          reject(new Error('Tunnel connection timeout'));
        }
      }, 60000);
    });
  }

  /**
   * Stop the tunnel
   */
  async stop(): Promise<void> {
    if (this.process) {
      console.log('[TunnelManager] Stopping tunnel');
      this.process.kill('SIGTERM');

      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (this.process) {
        this.process.kill('SIGKILL');
      }

      this.process = null;
      this.connection = null;
    }
  }

  /**
   * Check if tunnel is active
   */
  isActive(): boolean {
    return this.process !== null && this.connection !== null;
  }

  /**
   * Get connection info
   */
  getConnection(): TunnelConnection | null {
    return this.connection;
  }

  /**
   * Get connection string for PostgreSQL.
   * WARNING: Contains real credentials — never log this value directly.
   * Use getRedactedConnectionString() for logging purposes.
   */
  getConnectionString(): string {
    if (!this.connection) {
      throw new Error('Tunnel not active');
    }

    const { database, user } = this.config;
    const password = process.env.PGPASSWORD || '';
    const host = this.connection.host;
    const port = this.connection.port;

    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }

  /**
   * Get a redacted connection string safe for logging.
   */
  getRedactedConnectionString(): string {
    return redactConnectionString(this.getConnectionString());
  }
}

/**
 * Create a tunnel manager
 */
export function createTunnelManager(config: CloudConfig): IAPTunnelManager {
  return new IAPTunnelManager(config);
}

/**
 * Direct connection (no tunnel) for local development or direct access
 */
export class DirectConnectionManager implements TunnelManager {
  private connection: TunnelConnection | null = null;
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async start(): Promise<TunnelConnection> {
    // Parse connection string to extract host and port
    const url = new URL(this.connectionString);
    this.connection = {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      startedAt: new Date(),
    };
    return this.connection;
  }

  async stop(): Promise<void> {
    this.connection = null;
  }

  isActive(): boolean {
    return this.connection !== null;
  }

  getConnection(): TunnelConnection | null {
    return this.connection;
  }

  getConnectionString(): string {
    return this.connectionString;
  }

  /**
   * Get a redacted connection string safe for logging.
   */
  getRedactedConnectionString(): string {
    return redactConnectionString(this.connectionString);
  }
}

/**
 * Create appropriate connection manager based on config
 */
export function createConnectionManager(config: CloudConfig): TunnelManager {
  if (config.connectionString) {
    return new DirectConnectionManager(config.connectionString);
  }
  return new IAPTunnelManager(config);
}
