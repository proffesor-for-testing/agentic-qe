/**
 * Auth State Manager
 * Domain service for authentication state persistence across test runs
 *
 * Uses agent-browser state save/load to persist cookies, localStorage,
 * sessionStorage, and other browser state to skip login flows in tests.
 */

import { mkdir, access, readdir, stat, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import type { AgentBrowserClient } from '../../../integrations/browser/agent-browser/client';
import { safeJsonParse } from '../../../shared/safe-json.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Auth state metadata
 */
export interface AuthStateMetadata {
  /** State name/identifier */
  name: string;
  /** When the state was created */
  createdAt: Date;
  /** When the state was last used */
  lastUsedAt: Date;
  /** User identifier (if known) */
  userId?: string;
  /** Roles/permissions (if known) */
  roles?: string[];
  /** Custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Auth state info
 */
export interface AuthStateInfo {
  /** File path where state is stored */
  path: string;
  /** State metadata */
  metadata: AuthStateMetadata;
  /** Whether the state file exists */
  exists: boolean;
  /** File size in bytes */
  sizeBytes?: number;
}

/**
 * Auth state manager configuration
 */
export interface AuthStateManagerConfig {
  /** Base directory for state files (default: .agentic-qe/browser-state) */
  stateDir?: string;
  /** Default state expiration in ms (default: 24 hours) */
  defaultMaxAgeMs?: number;
  /** Whether to auto-cleanup expired states (default: true) */
  autoCleanup?: boolean;
}

/**
 * Auth state manager errors
 */
export class AuthStateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AuthStateError';
  }
}

// ============================================================================
// AuthStateManager
// ============================================================================

/**
 * Auth State Manager
 *
 * Manages authentication state persistence for E2E tests.
 * Allows saving browser state after login and loading it in
 * subsequent tests to skip repetitive login flows.
 *
 * Features:
 * - Save/load browser state (cookies, storage)
 * - Automatic expiration handling
 * - Multiple named states (different users/roles)
 * - State validation before use
 *
 * Example:
 * ```typescript
 * const stateManager = new AuthStateManager();
 *
 * // First test run: login and save state
 * await client.navigate('https://app.example.com/login');
 * await client.fill('#email', 'user@example.com');
 * await client.fill('#password', 'password');
 * await client.click('#submit');
 * await stateManager.saveAuthState('admin-user', client, {
 *   userId: 'user-123',
 *   roles: ['admin']
 * });
 *
 * // Subsequent test runs: load state to skip login
 * const loaded = await stateManager.loadAuthState('admin-user', client);
 * if (loaded) {
 *   // Already logged in, navigate directly to app
 *   await client.navigate('https://app.example.com/dashboard');
 * } else {
 *   // State expired or doesn't exist, need to login
 * }
 * ```
 */
export class AuthStateManager {
  private readonly config: Required<AuthStateManagerConfig>;
  private readonly metadataCache: Map<string, AuthStateMetadata> = new Map();

  constructor(config: AuthStateManagerConfig = {}) {
    this.config = {
      stateDir: config.stateDir ?? '.agentic-qe/browser-state',
      defaultMaxAgeMs: config.defaultMaxAgeMs ?? 24 * 60 * 60 * 1000, // 24 hours
      autoCleanup: config.autoCleanup ?? true,
    };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Save authenticated browser state
   *
   * @param name - State identifier (e.g., 'admin-user', 'guest')
   * @param client - Browser client with authenticated session
   * @param metadata - Optional metadata about the state
   */
  async saveAuthState(
    name: string,
    client: AgentBrowserClient,
    metadata?: Partial<Pick<AuthStateMetadata, 'userId' | 'roles' | 'custom'>>
  ): Promise<void> {
    // Ensure state directory exists
    const stateDir = this.config.stateDir;
    await this.ensureDirectory(stateDir);

    // Build state file path
    const statePath = this.getStatePath(name);

    // Save browser state via client
    const result = await client.saveState(statePath);

    if (!result.success) {
      throw new AuthStateError(
        `Failed to save auth state "${name}": ${result.error?.message ?? 'Unknown error'}`,
        'SAVE_STATE_FAILED',
        result.error
      );
    }

    // Save metadata
    const stateMetadata: AuthStateMetadata = {
      name,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      userId: metadata?.userId,
      roles: metadata?.roles,
      custom: metadata?.custom,
    };

    await this.saveMetadata(name, stateMetadata);
    this.metadataCache.set(name, stateMetadata);
  }

  /**
   * Load previously saved browser state
   *
   * @param name - State identifier
   * @param client - Browser client to load state into
   * @returns true if state was loaded, false if not available/expired
   */
  async loadAuthState(name: string, client: AgentBrowserClient): Promise<boolean> {
    // Check if state exists and is valid
    const isValid = await this.hasValidState(name);
    if (!isValid) {
      return false;
    }

    // Load browser state via client
    const statePath = this.getStatePath(name);
    const result = await client.loadState(statePath);

    if (!result.success) {
      // State file might be corrupted, remove it
      await this.removeState(name);
      return false;
    }

    // Update last used timestamp
    const metadata = await this.getMetadata(name);
    if (metadata) {
      metadata.lastUsedAt = new Date();
      await this.saveMetadata(name, metadata);
      this.metadataCache.set(name, metadata);
    }

    return true;
  }

  /**
   * Check if a valid state exists
   *
   * @param name - State identifier
   * @param maxAgeMs - Max age in ms (default from config)
   * @returns true if state exists and is not expired
   */
  async hasValidState(name: string, maxAgeMs?: number): Promise<boolean> {
    const statePath = this.getStatePath(name);

    // Check if file exists
    try {
      await access(statePath);
    } catch {
      return false;
    }

    // Check expiration
    const metadata = await this.getMetadata(name);
    if (!metadata) {
      // No metadata, state might be from old format - consider invalid
      return false;
    }

    const age = Date.now() - metadata.createdAt.getTime();
    const maxAge = maxAgeMs ?? this.config.defaultMaxAgeMs;

    if (age > maxAge) {
      // State expired, clean up if auto-cleanup enabled
      if (this.config.autoCleanup) {
        await this.removeState(name);
      }
      return false;
    }

    return true;
  }

  /**
   * Get state info
   */
  async getStateInfo(name: string): Promise<AuthStateInfo | null> {
    const statePath = this.getStatePath(name);
    const metadata = await this.getMetadata(name);

    if (!metadata) {
      return null;
    }

    let exists = false;
    let sizeBytes: number | undefined;

    try {
      const stats = await stat(statePath);
      exists = true;
      sizeBytes = stats.size;
    } catch {
      exists = false;
    }

    return {
      path: statePath,
      metadata,
      exists,
      sizeBytes,
    };
  }

  /**
   * List all saved states
   */
  async listStates(): Promise<AuthStateInfo[]> {
    const stateDir = this.config.stateDir;

    try {
      await access(stateDir);
    } catch {
      return [];
    }

    const files = await readdir(stateDir);
    const stateFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.meta.json'));

    const states: AuthStateInfo[] = [];
    for (const file of stateFiles) {
      const name = file.replace('.json', '');
      const info = await this.getStateInfo(name);
      if (info) {
        states.push(info);
      }
    }

    return states;
  }

  /**
   * Remove a specific state
   */
  async removeState(name: string): Promise<void> {
    const statePath = this.getStatePath(name);
    const metaPath = this.getMetadataPath(name);

    // Remove state file
    try {
      await unlink(statePath);
    } catch (error) {
      // Non-critical: file may not exist
      console.debug('[AuthStateManager] State file removal skipped:', error instanceof Error ? error.message : error);
    }

    // Remove metadata file
    try {
      await unlink(metaPath);
    } catch (error) {
      // Non-critical: file may not exist
      console.debug('[AuthStateManager] Metadata file removal skipped:', error instanceof Error ? error.message : error);
    }

    // Clear cache
    this.metadataCache.delete(name);
  }

  /**
   * Clean up expired states
   *
   * @param maxAgeMs - Max age in ms (default from config)
   * @returns Number of states cleaned up
   */
  async cleanupExpiredStates(maxAgeMs?: number): Promise<number> {
    const states = await this.listStates();
    const maxAge = maxAgeMs ?? this.config.defaultMaxAgeMs;
    let cleanedCount = 0;

    for (const state of states) {
      const age = Date.now() - state.metadata.createdAt.getTime();
      if (age > maxAge) {
        await this.removeState(state.metadata.name);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Clear all states
   */
  async clearAllStates(): Promise<void> {
    const states = await this.listStates();

    for (const state of states) {
      await this.removeState(state.metadata.name);
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getStatePath(name: string): string {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.config.stateDir, `${sanitizedName}.json`);
  }

  private getMetadataPath(name: string): string {
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.config.stateDir, `${sanitizedName}.meta.json`);
  }

  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      // Ignore EEXIST errors
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private async saveMetadata(name: string, metadata: AuthStateMetadata): Promise<void> {
    const { writeFile } = await import('fs/promises');
    const metaPath = this.getMetadataPath(name);
    await this.ensureDirectory(dirname(metaPath));

    const serialized = JSON.stringify({
      ...metadata,
      createdAt: metadata.createdAt.toISOString(),
      lastUsedAt: metadata.lastUsedAt.toISOString(),
    }, null, 2);

    await writeFile(metaPath, serialized, 'utf-8');
  }

  private async getMetadata(name: string): Promise<AuthStateMetadata | null> {
    // Check cache first
    const cached = this.metadataCache.get(name);
    if (cached) {
      return cached;
    }

    // Load from file
    const metaPath = this.getMetadataPath(name);

    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(metaPath, 'utf-8');
      const parsed = safeJsonParse(content);

      const metadata: AuthStateMetadata = {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        lastUsedAt: new Date(parsed.lastUsedAt),
      };

      this.metadataCache.set(name, metadata);
      return metadata;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an AuthStateManager instance
 */
export function createAuthStateManager(config?: AuthStateManagerConfig): AuthStateManager {
  return new AuthStateManager(config);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Login and save state for reuse
 *
 * @param client - Browser client
 * @param loginFn - Async function that performs login
 * @param stateName - Name for the saved state
 * @param stateManager - State manager instance (optional)
 */
export async function loginAndSaveState(
  client: AgentBrowserClient,
  loginFn: () => Promise<void>,
  stateName: string,
  stateManager?: AuthStateManager
): Promise<void> {
  const manager = stateManager ?? new AuthStateManager();

  // Perform login
  await loginFn();

  // Save state
  await manager.saveAuthState(stateName, client);
}

/**
 * Load state or perform login
 *
 * @param client - Browser client
 * @param stateName - Name of the saved state
 * @param loginFn - Async function that performs login if state not available
 * @param stateManager - State manager instance (optional)
 * @returns true if state was loaded, false if login was performed
 */
export async function loadStateOrLogin(
  client: AgentBrowserClient,
  stateName: string,
  loginFn: () => Promise<void>,
  stateManager?: AuthStateManager
): Promise<boolean> {
  const manager = stateManager ?? new AuthStateManager();

  // Try to load existing state
  const loaded = await manager.loadAuthState(stateName, client);
  if (loaded) {
    return true;
  }

  // State not available, perform login
  await loginFn();

  // Save for next time
  await manager.saveAuthState(stateName, client);

  return false;
}
