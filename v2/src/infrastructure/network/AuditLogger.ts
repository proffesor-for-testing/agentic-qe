/**
 * Audit Logger for Network Policy Enforcement
 *
 * Logs all network requests with configurable retention and querying.
 * Supports both in-memory and persistent storage.
 *
 * @module infrastructure/network/AuditLogger
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import { randomUUID } from 'crypto';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { AuditEntry, AuditAction, AuditQueryFilter, AuditStats } from './types.js';

/**
 * Audit logger configuration
 */
export interface AuditLoggerConfig {
  /** Maximum entries to keep in memory */
  maxEntries: number;

  /** Persist to file */
  persistToFile: boolean;

  /** File path for persistence */
  filePath?: string;

  /** Auto-save interval in ms (0 to disable) */
  autoSaveIntervalMs: number;

  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default audit logger configuration
 */
const DEFAULT_CONFIG: AuditLoggerConfig = {
  maxEntries: 10000,
  persistToFile: false,
  autoSaveIntervalMs: 0,
  debug: false,
};

/**
 * Audit logger for network requests
 *
 * Features:
 * - In-memory circular buffer
 * - Query by agent, domain, action, time range
 * - Statistics aggregation
 * - JSON export
 * - Optional file persistence
 */
export class AuditLogger {
  private entries: AuditEntry[];
  private config: AuditLoggerConfig;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  private dirty: boolean = false;

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entries = [];

    if (this.config.persistToFile && this.config.autoSaveIntervalMs > 0) {
      this.startAutoSave();
    }
  }

  /**
   * Log a network request
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    const fullEntry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    this.entries.push(fullEntry);
    this.dirty = true;

    // Evict oldest if over limit
    if (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
    }

    this.debug(`Logged: ${entry.action} ${entry.domain} for ${entry.agentType}`);

    return fullEntry;
  }

  /**
   * Log an allowed request
   */
  async logAllowed(
    agentId: string,
    agentType: string,
    domain: string,
    options: Partial<AuditEntry> = {}
  ): Promise<AuditEntry> {
    return this.log({
      agentId,
      agentType,
      domain,
      action: 'allowed',
      ...options,
    });
  }

  /**
   * Log a blocked request
   */
  async logBlocked(
    agentId: string,
    agentType: string,
    domain: string,
    reason: string,
    options: Partial<AuditEntry> = {}
  ): Promise<AuditEntry> {
    return this.log({
      agentId,
      agentType,
      domain,
      action: 'blocked',
      reason,
      ...options,
    });
  }

  /**
   * Log a rate-limited request
   */
  async logRateLimited(
    agentId: string,
    agentType: string,
    domain: string,
    options: Partial<AuditEntry> = {}
  ): Promise<AuditEntry> {
    return this.log({
      agentId,
      agentType,
      domain,
      action: 'rate_limited',
      reason: 'Rate limit exceeded',
      ...options,
    });
  }

  /**
   * Query audit entries
   */
  async query(filter: AuditQueryFilter): Promise<AuditEntry[]> {
    let results = [...this.entries];

    // Apply filters
    if (filter.agentId) {
      results = results.filter((e) => e.agentId === filter.agentId);
    }

    if (filter.agentType) {
      results = results.filter((e) => e.agentType === filter.agentType);
    }

    if (filter.domain) {
      results = results.filter((e) => e.domain === filter.domain);
    }

    if (filter.action) {
      results = results.filter((e) => e.action === filter.action);
    }

    if (filter.since) {
      results = results.filter((e) => e.timestamp >= filter.since!);
    }

    if (filter.until) {
      results = results.filter((e) => e.timestamp <= filter.until!);
    }

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset);
    }

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Get audit statistics
   */
  async getStats(since?: Date): Promise<AuditStats> {
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    const filtered = this.entries.filter((e) => e.timestamp >= sinceDate);

    const byDomain: Record<string, number> = {};
    const byAgentType: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    let allowedRequests = 0;
    let blockedRequests = 0;
    let rateLimitedRequests = 0;

    for (const entry of filtered) {
      // Count by domain
      byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1;

      // Count by agent type
      byAgentType[entry.agentType] = (byAgentType[entry.agentType] || 0) + 1;

      // Count by action
      switch (entry.action) {
        case 'allowed':
          allowedRequests++;
          break;
        case 'blocked':
          blockedRequests++;
          break;
        case 'rate_limited':
          rateLimitedRequests++;
          break;
      }

      // Sum response times
      if (entry.responseTimeMs !== undefined) {
        totalResponseTime += entry.responseTimeMs;
        responseTimeCount++;
      }
    }

    return {
      totalRequests: filtered.length,
      allowedRequests,
      blockedRequests,
      rateLimitedRequests,
      byDomain,
      byAgentType,
      avgResponseTimeMs: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
      since: sinceDate,
      timestamp: new Date(),
    };
  }

  /**
   * Export entries to JSON file
   */
  async exportToJson(filepath: string): Promise<void> {
    const data = JSON.stringify(this.entries, null, 2);
    await mkdir(dirname(filepath), { recursive: true });
    await writeFile(filepath, data, 'utf-8');
    this.debug(`Exported ${this.entries.length} entries to ${filepath}`);
  }

  /**
   * Import entries from JSON file
   */
  async importFromJson(filepath: string): Promise<number> {
    try {
      const data = await readFile(filepath, 'utf-8');
      const entries = JSON.parse(data) as AuditEntry[];

      // Convert timestamp strings to Date objects
      for (const entry of entries) {
        entry.timestamp = new Date(entry.timestamp);
      }

      this.entries = entries;
      this.dirty = false;
      this.debug(`Imported ${entries.length} entries from ${filepath}`);
      return entries.length;
    } catch (error) {
      this.debug(`Failed to import: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Save to configured file
   */
  async save(): Promise<void> {
    if (!this.config.persistToFile || !this.config.filePath) {
      return;
    }

    if (!this.dirty) {
      return;
    }

    await this.exportToJson(this.config.filePath);
    this.dirty = false;
  }

  /**
   * Load from configured file
   */
  async load(): Promise<void> {
    if (!this.config.persistToFile || !this.config.filePath) {
      return;
    }

    await this.importFromJson(this.config.filePath);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.dirty = true;
    this.debug('Cleared all entries');
  }

  /**
   * Get entry count
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Get recent entries
   */
  getRecent(count: number = 10): AuditEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    this.stopAutoSave();
    await this.save();
  }

  // ============================================
  // Private Methods
  // ============================================

  private startAutoSave(): void {
    if (this.saveInterval) return;

    this.saveInterval = setInterval(async () => {
      await this.save();
    }, this.config.autoSaveIntervalMs);
  }

  private stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  private debug(message: string): void {
    if (this.config.debug) {
      console.log(`[AuditLogger] ${message}`);
    }
  }
}
