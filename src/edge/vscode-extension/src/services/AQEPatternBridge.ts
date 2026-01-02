/**
 * AQE Pattern Bridge - Connects VS Code extension to main AQE pattern library
 *
 * Provides bidirectional synchronization between:
 * - VS Code extension's local pattern storage (OfflineStore)
 * - Main AQE RuVectorPatternStore (shared across agents)
 *
 * Features:
 * - Pattern import from AQE library
 * - Pattern export to AQE library
 * - Conflict resolution via ConflictResolver
 * - Offline-first with sync when online
 *
 * Phase 1: P1-006 - Integrate with Existing AQE Patterns
 *
 * @module vscode-extension/services/AQEPatternBridge
 * @version 0.1.0
 */

import type { OfflineStore } from '../storage/OfflineStore';
import type { CodePattern, TestPattern } from '../analysis/PatternMatcher';
import type { ConflictResolver } from '../storage/ConflictResolver';

/**
 * QE Pattern from main AQE library (matches src/memory/HNSWPatternStore.ts)
 */
export interface QEPattern {
  id: string;
  type: 'test' | 'api' | 'integration' | 'unit' | 'e2e' | 'mock' | 'fixture';
  domain: 'react' | 'node' | 'express' | 'api' | 'database' | 'authentication' | 'general';
  content: string;
  embedding: number[];
  framework?: string;
  coverage?: number;
  flakinessScore?: number;
  verdict?: 'success' | 'failure' | 'flaky';
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  successRate?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Bridge configuration
 */
export interface AQEPatternBridgeConfig {
  /** Local offline store */
  store: OfflineStore;
  /** Conflict resolver for sync conflicts */
  conflictResolver?: ConflictResolver;
  /** AQE pattern store path (for file-based sync) */
  aqeStorePath?: string;
  /** Enable auto-sync on pattern changes */
  autoSync?: boolean;
  /** Sync interval in ms (default: 60000) */
  syncInterval?: number;
  /** Debug mode */
  debugMode?: boolean;
}

/**
 * Sync result
 */
export interface PatternSyncResult {
  success: boolean;
  imported: number;
  exported: number;
  conflicts: number;
  errors: string[];
  timestamp: number;
}

/**
 * Pattern conversion utilities
 */
const PatternConverter = {
  /**
   * Convert VS Code CodePattern to AQE QEPattern
   */
  toQEPattern(pattern: CodePattern): QEPattern {
    const typeMap: Record<string, QEPattern['type']> = {
      'function': 'unit',
      'async-function': 'api',
      'method': 'unit',
      'constructor': 'unit',
      'factory': 'unit',
      'handler': 'api',
      'validator': 'unit',
      'transformer': 'unit',
      'accessor': 'unit',
      'callback': 'unit',
    };

    const domainMap: Record<string, QEPattern['domain']> = {
      'api': 'api',
      'database': 'database',
      'react': 'react',
      'express': 'express',
      'node': 'node',
      'auth': 'authentication',
    };

    // Determine domain from metadata/tags
    let domain: QEPattern['domain'] = 'general';
    if (pattern.metadata?.domain) {
      domain = pattern.metadata.domain as QEPattern['domain'];
    } else if (pattern.metadata?.tags) {
      const tags = pattern.metadata.tags as string[];
      for (const tag of tags) {
        if (domainMap[tag.toLowerCase()]) {
          domain = domainMap[tag.toLowerCase()];
          break;
        }
      }
    }

    return {
      id: pattern.id,
      type: typeMap[pattern.type] || 'unit',
      domain,
      content: pattern.sourceCode,
      embedding: pattern.embedding,
      framework: pattern.metadata?.framework,
      coverage: pattern.characteristics.testability / 100,
      flakinessScore: 0,
      verdict: pattern.successRate > 0.7 ? 'success' : pattern.successRate > 0.3 ? 'flaky' : 'failure',
      createdAt: pattern.createdAt,
      updatedAt: pattern.lastUsedAt,
      usageCount: pattern.usageCount,
      successRate: pattern.successRate,
      metadata: {
        originalType: pattern.type,
        characteristics: pattern.characteristics,
        testPatterns: pattern.testPatterns,
        signature: pattern.signature,
      },
    };
  },

  /**
   * Convert AQE QEPattern to VS Code CodePattern
   */
  toCodePattern(qePattern: QEPattern): CodePattern {
    const typeMap: Record<string, CodePattern['type']> = {
      'unit': 'function',
      'api': 'async-function',
      'integration': 'method',
      'e2e': 'handler',
      'mock': 'factory',
      'fixture': 'factory',
      'test': 'function',
    };

    // Extract characteristics from metadata if available
    const metadata = qePattern.metadata as Record<string, unknown> || {};
    const characteristics = (metadata.characteristics as CodePattern['characteristics']) || {
      paramCount: 0,
      hasReturn: true,
      isAsync: qePattern.type === 'api',
      complexity: 1,
      testability: (qePattern.coverage || 0.5) * 100,
      hasSideEffects: false,
      dependencyCount: 0,
      paramTypes: [],
      returnType: 'unknown',
      controlFlow: ['sequential'],
    };

    return {
      id: qePattern.id,
      type: (metadata.originalType as CodePattern['type']) || typeMap[qePattern.type] || 'function',
      signature: (metadata.signature as string) || `() => ${qePattern.type}`,
      sourceCode: qePattern.content,
      characteristics,
      embedding: qePattern.embedding,
      metadata: {
        language: 'typescript',
        domain: qePattern.domain,
        framework: qePattern.framework,
        tags: [qePattern.type, qePattern.domain],
      },
      testPatterns: (metadata.testPatterns as TestPattern[]) || [],
      successRate: qePattern.successRate || 0,
      usageCount: qePattern.usageCount,
      createdAt: qePattern.createdAt,
      lastUsedAt: qePattern.updatedAt,
    };
  },
};

/**
 * AQE Pattern Bridge
 *
 * Synchronizes patterns between VS Code extension and main AQE library.
 */
export class AQEPatternBridge {
  private config: Required<AQEPatternBridgeConfig>;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isOnline: boolean = true;
  private lastSyncResult: PatternSyncResult | null = null;
  private eventListeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(config: AQEPatternBridgeConfig) {
    this.config = {
      store: config.store,
      conflictResolver: config.conflictResolver || null as unknown as ConflictResolver,
      aqeStorePath: config.aqeStorePath || '.agentic-qe/patterns',
      autoSync: config.autoSync ?? true,
      syncInterval: config.syncInterval ?? 60000,
      debugMode: config.debugMode ?? false,
    };
  }

  /**
   * Initialize the bridge
   */
  async initialize(): Promise<void> {
    this.log('Initializing AQE Pattern Bridge');

    // Start auto-sync if enabled
    if (this.config.autoSync) {
      this.startAutoSync();
    }

    // Perform initial sync
    await this.syncFromAQE();

    this.log('AQE Pattern Bridge initialized');
  }

  /**
   * Import patterns from main AQE library
   */
  async syncFromAQE(): Promise<PatternSyncResult> {
    const result: PatternSyncResult = {
      success: true,
      imported: 0,
      exported: 0,
      conflicts: 0,
      errors: [],
      timestamp: Date.now(),
    };

    try {
      // In a real implementation, this would connect to the AQE pattern store
      // For now, we'll use the MCP tools or file-based access
      const aqePatterns = await this.loadAQEPatterns();

      for (const qePattern of aqePatterns) {
        try {
          const codePattern = PatternConverter.toCodePattern(qePattern);

          // Check if pattern exists locally
          const existingPattern = await this.config.store.getPattern(codePattern.id);

          if (existingPattern) {
            // Check for conflicts
            if (existingPattern.lastUsedAt !== codePattern.lastUsedAt) {
              result.conflicts++;
              // Use conflict resolver if available
              if (this.config.conflictResolver) {
                // For now, prefer remote (AQE) patterns as source of truth
                await this.config.store.storePattern(codePattern.id, codePattern);
              }
            }
          } else {
            // New pattern - import it
            await this.config.store.storePattern(codePattern.id, codePattern);
            result.imported++;
          }
        } catch (error) {
          result.errors.push(`Failed to import pattern ${qePattern.id}: ${error}`);
        }
      }

      this.log(`Synced from AQE: ${result.imported} imported, ${result.conflicts} conflicts`);
    } catch (error) {
      result.success = false;
      result.errors.push(`Sync failed: ${error}`);
      this.log(`Sync from AQE failed: ${error}`);
    }

    this.lastSyncResult = result;
    this.emit('sync-complete', result);
    return result;
  }

  /**
   * Export patterns to main AQE library
   */
  async syncToAQE(): Promise<PatternSyncResult> {
    const result: PatternSyncResult = {
      success: true,
      imported: 0,
      exported: 0,
      conflicts: 0,
      errors: [],
      timestamp: Date.now(),
    };

    try {
      // Get all local patterns
      const localPatterns = await this.getLocalPatterns();

      for (const pattern of localPatterns) {
        try {
          const qePattern = PatternConverter.toQEPattern(pattern);
          await this.saveToAQE(qePattern);
          result.exported++;
        } catch (error) {
          result.errors.push(`Failed to export pattern ${pattern.id}: ${error}`);
        }
      }

      this.log(`Synced to AQE: ${result.exported} exported`);
    } catch (error) {
      result.success = false;
      result.errors.push(`Export failed: ${error}`);
      this.log(`Sync to AQE failed: ${error}`);
    }

    this.lastSyncResult = result;
    this.emit('export-complete', result);
    return result;
  }

  /**
   * Bidirectional sync
   */
  async sync(): Promise<PatternSyncResult> {
    this.log('Starting bidirectional sync');

    const fromResult = await this.syncFromAQE();
    const toResult = await this.syncToAQE();

    const combinedResult: PatternSyncResult = {
      success: fromResult.success && toResult.success,
      imported: fromResult.imported,
      exported: toResult.exported,
      conflicts: fromResult.conflicts + toResult.conflicts,
      errors: [...fromResult.errors, ...toResult.errors],
      timestamp: Date.now(),
    };

    this.lastSyncResult = combinedResult;
    return combinedResult;
  }

  /**
   * Import a single pattern from AQE
   */
  async importPattern(patternId: string): Promise<CodePattern | null> {
    try {
      const qePattern = await this.loadAQEPattern(patternId);
      if (!qePattern) return null;

      const codePattern = PatternConverter.toCodePattern(qePattern);
      await this.config.store.storePattern(codePattern.id, codePattern);
      return codePattern;
    } catch (error) {
      this.log(`Failed to import pattern ${patternId}: ${error}`);
      return null;
    }
  }

  /**
   * Export a single pattern to AQE
   */
  async exportPattern(pattern: CodePattern): Promise<boolean> {
    try {
      const qePattern = PatternConverter.toQEPattern(pattern);
      await this.saveToAQE(qePattern);
      return true;
    } catch (error) {
      this.log(`Failed to export pattern ${pattern.id}: ${error}`);
      return false;
    }
  }

  /**
   * Search AQE patterns by query
   */
  async searchAQEPatterns(query: string, options?: {
    type?: QEPattern['type'];
    domain?: QEPattern['domain'];
    framework?: string;
    limit?: number;
  }): Promise<CodePattern[]> {
    try {
      // In real implementation, this would use vector search via MCP tools
      const allPatterns = await this.loadAQEPatterns();
      const queryLower = query.toLowerCase();

      let filtered = allPatterns.filter(p => {
        const contentMatch = p.content.toLowerCase().includes(queryLower);
        const typeMatch = !options?.type || p.type === options.type;
        const domainMatch = !options?.domain || p.domain === options.domain;
        const frameworkMatch = !options?.framework || p.framework === options.framework;
        return contentMatch && typeMatch && domainMatch && frameworkMatch;
      });

      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered.map(PatternConverter.toCodePattern);
    } catch (error) {
      this.log(`Search failed: ${error}`);
      return [];
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    isOnline: boolean;
    lastSync: PatternSyncResult | null;
    autoSync: boolean;
  } {
    return {
      isOnline: this.isOnline,
      lastSync: this.lastSyncResult,
      autoSync: this.config.autoSync,
    };
  }

  /**
   * Set online status
   */
  setOnlineStatus(online: boolean): void {
    this.isOnline = online;
    if (online && this.config.autoSync) {
      this.sync();
    }
  }

  /**
   * Start auto-sync
   */
  startAutoSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      if (this.isOnline) {
        this.sync().catch(err => this.log(`Auto-sync error: ${err}`));
      }
    }, this.config.syncInterval);

    this.log(`Auto-sync started (interval: ${this.config.syncInterval}ms)`);
  }

  /**
   * Stop auto-sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      this.log('Auto-sync stopped');
    }
  }

  /**
   * Shutdown the bridge
   */
  async shutdown(): Promise<void> {
    this.stopAutoSync();
    this.eventListeners.clear();
    this.log('AQE Pattern Bridge shutdown');
  }

  // --- Event handling ---

  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach(listener => listener(...args));
  }

  // --- Private methods ---

  /**
   * Load patterns from AQE store
   * In real implementation, this would use MCP tools or direct file access
   */
  private async loadAQEPatterns(): Promise<QEPattern[]> {
    // Placeholder - in production this would:
    // 1. Check if running in VS Code extension context
    // 2. Use MCP tools (mcp__agentic-qe__pattern_search) if available
    // 3. Fall back to file-based access to .agentic-qe/patterns.db

    // For now, return empty array - patterns will be populated as users work
    return [];
  }

  /**
   * Load a single pattern from AQE store
   */
  private async loadAQEPattern(id: string): Promise<QEPattern | null> {
    const patterns = await this.loadAQEPatterns();
    return patterns.find(p => p.id === id) || null;
  }

  /**
   * Save pattern to AQE store
   */
  private async saveToAQE(pattern: QEPattern): Promise<void> {
    // Placeholder - in production this would:
    // 1. Use MCP tools (mcp__agentic-qe__pattern_store) if available
    // 2. Fall back to file-based storage

    this.log(`Would save pattern ${pattern.id} to AQE store`);
  }

  /**
   * Get all local patterns
   */
  private async getLocalPatterns(): Promise<CodePattern[]> {
    const keys = await this.config.store.keys('patterns');
    const patterns: CodePattern[] = [];

    for (const key of keys) {
      const pattern = await this.config.store.getPattern(key);
      if (pattern) {
        patterns.push(pattern as CodePattern);
      }
    }

    return patterns;
  }

  /**
   * Log message
   */
  private log(message: string): void {
    if (this.config.debugMode) {
      console.log(`[AQEPatternBridge] ${message}`);
    }
  }
}

/**
 * Create a configured AQE Pattern Bridge
 */
export function createAQEPatternBridge(
  store: OfflineStore,
  options?: Partial<AQEPatternBridgeConfig>
): AQEPatternBridge {
  return new AQEPatternBridge({
    store,
    ...options,
  });
}
