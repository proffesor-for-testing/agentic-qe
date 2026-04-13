/**
 * Advisor Circuit Breaker
 * ADR-092: hard per-session ceiling on advisor calls
 *
 * Three protection layers:
 *   1. per-task max_uses (enforced by caller)
 *   2. per-call budget_usd (enforced by caller)
 *   3. per-session hard ceiling (enforced here) — 10 advisor calls absolute max
 *
 * State persists to a JSON file at `.agentic-qe/advisor/circuit-breaker.json`
 * so the ceiling survives across CLI invocations within the same session.
 * Each CLI call to `aqe llm advise` is a fresh process — without file-based
 * persistence, each invocation would get a fresh counter.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface CircuitBreakerConfig {
  /** Max advisor calls per session (default: 10) */
  maxCallsPerSession: number;
  /** Path to persist state (default: .agentic-qe/advisor/circuit-breaker.json) */
  statePath?: string;
}

export interface CircuitBreakerState {
  sessionId: string;
  callCount: number;
  maxCalls: number;
  remaining: number;
  tripped: boolean;
}

interface PersistedState {
  sessions: Record<string, { count: number; lastUpdated: string }>;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxCallsPerSession: 10,
};

// Use home directory for stable path across CWDs and MCP contexts (M5 fix)
const DEFAULT_STATE_PATH = join(homedir(), '.agentic-qe', 'advisor', 'circuit-breaker.json');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AdvisorCircuitBreaker {
  private readonly maxCalls: number;
  private readonly statePath: string;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.maxCalls = config?.maxCallsPerSession ?? DEFAULT_CONFIG.maxCallsPerSession;
    this.statePath = config?.statePath ?? DEFAULT_STATE_PATH;
  }

  /**
   * Check whether another advisor call is allowed for this session.
   * If allowed, increments the counter and persists. Throws on trip.
   */
  acquire(sessionId: string): CircuitBreakerState {
    const state = this.load();
    const entry = state.sessions[sessionId];
    const current = entry?.count ?? 0;

    if (current >= this.maxCalls) {
      throw new AdvisorCircuitBreakerError(
        `Advisor circuit breaker tripped: ${current} calls in session "${sessionId}" ` +
        `(max: ${this.maxCalls}). Do not retry — continue without the advisor.`,
        sessionId,
        current,
        this.maxCalls,
      );
    }

    const next = current + 1;
    state.sessions[sessionId] = { count: next, lastUpdated: new Date().toISOString() };
    this.save(state);

    return {
      sessionId,
      callCount: next,
      maxCalls: this.maxCalls,
      remaining: this.maxCalls - next,
      tripped: false,
    };
  }

  /**
   * Get the current state without incrementing.
   */
  getState(sessionId: string): CircuitBreakerState {
    const state = this.load();
    const current = state.sessions[sessionId]?.count ?? 0;
    return {
      sessionId,
      callCount: current,
      maxCalls: this.maxCalls,
      remaining: this.maxCalls - current,
      tripped: current >= this.maxCalls,
    };
  }

  /**
   * Reset a specific session or all sessions.
   */
  reset(sessionId?: string): void {
    if (sessionId) {
      const state = this.load();
      delete state.sessions[sessionId];
      this.save(state);
    } else {
      this.save({ sessions: {} });
    }
  }

  private load(): PersistedState {
    try {
      const raw = readFileSync(this.statePath, 'utf-8');
      const state: PersistedState = JSON.parse(raw);
      this.evictStale(state);
      return state;
    } catch {
      return { sessions: {} };
    }
  }

  private save(state: PersistedState): void {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      // Atomic write via rename to prevent TOCTOU race when concurrent
      // CLI processes write simultaneously (H3 fix from devil's-advocate review)
      const tmpPath = this.statePath + '.tmp.' + process.pid;
      writeFileSync(tmpPath, JSON.stringify(state, null, 2));
      renameSync(tmpPath, this.statePath);
    } catch {
      // Best-effort — if we can't persist, fall back to in-memory-only
    }
  }

  private evictStale(state: PersistedState): void {
    const now = Date.now();
    for (const [sid, entry] of Object.entries(state.sessions)) {
      const age = now - new Date(entry.lastUpdated).getTime();
      if (age > SESSION_TTL_MS) {
        delete state.sessions[sid];
      }
    }
  }
}

export class AdvisorCircuitBreakerError extends Error {
  public readonly exitCode = 3;

  constructor(
    message: string,
    public readonly sessionId: string,
    public readonly callCount: number,
    public readonly maxCalls: number,
  ) {
    super(message);
    this.name = 'AdvisorCircuitBreakerError';
  }
}
