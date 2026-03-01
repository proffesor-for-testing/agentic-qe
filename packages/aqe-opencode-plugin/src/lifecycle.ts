/**
 * Session Lifecycle Manager
 *
 * Tracks session state and manages AQE memory connection lifecycle.
 * Initializes on first hook call and persists metrics on session end.
 *
 * @module lifecycle
 */

import type { AQEPluginConfig } from './config.js';

// =============================================================================
// Types
// =============================================================================

export type SessionState = 'idle' | 'initializing' | 'active' | 'ending' | 'ended';

export interface SessionMetrics {
  /** Total tool calls in this session */
  toolCallCount: number;
  /** Successful tool calls */
  toolCallSuccesses: number;
  /** Failed tool calls */
  toolCallFailures: number;
  /** Total prompt turns */
  promptCount: number;
  /** Total input tokens consumed */
  inputTokens: number;
  /** Total output tokens consumed */
  outputTokens: number;
  /** Patterns matched and injected */
  patternsInjected: number;
  /** Patterns captured from tool results */
  patternsCaptured: number;
  /** Patterns promoted due to success */
  patternsPromoted: number;
  /** Dream consolidation items queued */
  dreamQueueSize: number;
  /** Session start timestamp */
  startedAt: number;
  /** Session end timestamp */
  endedAt: number | null;
}

export interface MemoryConnection {
  /** Store a key-value pair in AQE memory */
  store(key: string, value: unknown, namespace?: string): Promise<void>;
  /** Retrieve a value from AQE memory */
  retrieve(key: string, namespace?: string): Promise<unknown | null>;
  /** Query patterns by domain */
  queryPatterns(domain: string, query: string, limit?: number): Promise<PatternMatch[]>;
  /** Record a pattern outcome (success/failure) */
  recordOutcome(patternId: string, success: boolean): Promise<void>;
  /** Close the connection */
  close(): Promise<void>;
}

export interface PatternMatch {
  id: string;
  content: string;
  confidence: number;
  domain: string;
  usageCount: number;
  successRate: number;
}

export interface DreamQueueItem {
  type: 'tool-experience' | 'prompt-outcome' | 'pattern-promotion';
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// Session Manager
// =============================================================================

export class SessionManager {
  private state: SessionState = 'idle';
  private metrics: SessionMetrics;
  private memory: MemoryConnection | null = null;
  private dreamQueue: DreamQueueItem[] = [];
  private config: AQEPluginConfig;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(config: AQEPluginConfig) {
    this.config = config;
    this.metrics = this.createEmptyMetrics();
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  getState(): SessionState {
    return this.state;
  }

  getMetrics(): Readonly<SessionMetrics> {
    return { ...this.metrics };
  }

  isActive(): boolean {
    return this.state === 'active';
  }

  // ---------------------------------------------------------------------------
  // Initialization (lazy — called on first hook invocation)
  // ---------------------------------------------------------------------------

  async ensureInitialized(): Promise<void> {
    if (this.state === 'active') {
      this.resetInactivityTimer();
      return;
    }

    if (this.state === 'initializing') {
      // Wait for initialization to complete (simple spin)
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (this.state === 'active' || this.state === 'ended') {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
      return;
    }

    this.state = 'initializing';

    try {
      this.memory = await this.createMemoryConnection(this.config);
      this.metrics = this.createEmptyMetrics();
      this.metrics.startedAt = Date.now();
      this.state = 'active';
      this.resetInactivityTimer();
    } catch (error) {
      console.error('[AQE Plugin] Failed to initialize session:', error);
      // Degrade gracefully — allow hooks to run without memory
      this.state = 'active';
      this.metrics.startedAt = Date.now();
    }
  }

  // ---------------------------------------------------------------------------
  // Memory Access
  // ---------------------------------------------------------------------------

  getMemory(): MemoryConnection | null {
    return this.memory;
  }

  // ---------------------------------------------------------------------------
  // Metrics Tracking
  // ---------------------------------------------------------------------------

  recordToolCall(success: boolean, durationMs: number): void {
    this.metrics.toolCallCount++;
    if (success) {
      this.metrics.toolCallSuccesses++;
    } else {
      this.metrics.toolCallFailures++;
    }
  }

  recordPrompt(inputTokens: number, outputTokens: number): void {
    this.metrics.promptCount++;
    this.metrics.inputTokens += inputTokens;
    this.metrics.outputTokens += outputTokens;
  }

  recordPatternInjected(): void {
    this.metrics.patternsInjected++;
  }

  recordPatternCaptured(): void {
    this.metrics.patternsCaptured++;
  }

  recordPatternPromoted(): void {
    this.metrics.patternsPromoted++;
  }

  // ---------------------------------------------------------------------------
  // Dream Queue
  // ---------------------------------------------------------------------------

  addToDreamQueue(item: DreamQueueItem): void {
    this.dreamQueue.push(item);
    this.metrics.dreamQueueSize = this.dreamQueue.length;
  }

  getDreamQueue(): readonly DreamQueueItem[] {
    return this.dreamQueue;
  }

  // ---------------------------------------------------------------------------
  // Session End
  // ---------------------------------------------------------------------------

  async endSession(): Promise<void> {
    if (this.state === 'ending' || this.state === 'ended') {
      return;
    }

    this.state = 'ending';

    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    this.metrics.endedAt = Date.now();

    try {
      // Persist session metrics
      if (this.memory) {
        const sessionId = `session-${this.metrics.startedAt}`;
        await this.memory.store(
          `opencode/sessions/${sessionId}/metrics`,
          this.metrics,
          'opencode'
        );

        // Persist dream queue for consolidation
        if (this.dreamQueue.length > 0) {
          await this.memory.store(
            `opencode/dream-queue/${sessionId}`,
            this.dreamQueue,
            'opencode'
          );
        }

        await this.memory.close();
      }
    } catch (error) {
      console.error('[AQE Plugin] Error during session end:', error);
    } finally {
      this.memory = null;
      this.state = 'ended';
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private createEmptyMetrics(): SessionMetrics {
    return {
      toolCallCount: 0,
      toolCallSuccesses: 0,
      toolCallFailures: 0,
      promptCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      patternsInjected: 0,
      patternsCaptured: 0,
      patternsPromoted: 0,
      dreamQueueSize: 0,
      startedAt: 0,
      endedAt: null,
    };
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = setTimeout(() => {
      console.log('[AQE Plugin] Session inactivity timeout — ending session');
      void this.endSession();
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  /**
   * Create a memory connection to AQE's SQLite backend.
   * This is a lightweight adapter — the real implementation
   * would use better-sqlite3 or the AQE memory SDK.
   * For now, we provide a no-op stub that logs operations.
   */
  private async createMemoryConnection(config: AQEPluginConfig): Promise<MemoryConnection> {
    // In production, this would open a connection to config.memory.dbPath
    // using better-sqlite3 and the AQE unified memory layer.
    // For the plugin package, we provide an interface that consumers wire up.
    return new StubMemoryConnection(config.memory.dbPath);
  }
}

// =============================================================================
// Stub Memory Connection
// =============================================================================

/**
 * Stub implementation for environments where the full AQE memory
 * backend is not available. Logs operations and returns empty results.
 * In production, replace with the real better-sqlite3 backed connection.
 */
class StubMemoryConnection implements MemoryConnection {
  private store_: Map<string, unknown> = new Map();

  constructor(private readonly dbPath: string) {
    console.log(`[AQE Plugin] Memory stub initialized (dbPath: ${dbPath})`);
  }

  async store(key: string, value: unknown, _namespace?: string): Promise<void> {
    this.store_.set(key, value);
  }

  async retrieve(key: string, _namespace?: string): Promise<unknown | null> {
    return this.store_.get(key) ?? null;
  }

  async queryPatterns(_domain: string, _query: string, _limit?: number): Promise<PatternMatch[]> {
    return [];
  }

  async recordOutcome(_patternId: string, _success: boolean): Promise<void> {
    // No-op in stub
  }

  async close(): Promise<void> {
    this.store_.clear();
  }
}

// =============================================================================
// Singleton Factory
// =============================================================================

let sessionManager: SessionManager | null = null;

export function getSessionManager(config: AQEPluginConfig): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager(config);
  }
  return sessionManager;
}

export function resetSessionManager(): void {
  sessionManager = null;
}
