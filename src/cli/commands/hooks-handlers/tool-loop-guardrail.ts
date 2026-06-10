/**
 * Agentic QE v3 - Tool-Loop Circuit Breaker (ADR-100)
 *
 * Detects consecutive failures of the same Bash command across hook
 * invocations and breaks runaway retry loops: WARN at 3, BLOCK at 5.
 * Advisory by default (the block is a strongly-worded recommendation in
 * the hook output); `AQE_STRICT_TOOL_LOOP=1` upgrades the block to a
 * PreToolUse deny.
 *
 * Mirrors the closed → open → half-open semantics of
 * `src/coordination/circuit-breaker/domain-circuit-breaker.ts` (ADR-064),
 * but persists state in a small JSON sidecar instead of process memory:
 * every hook call is a fresh CLI process, so in-process state cannot see
 * the previous invocation, and opening memory.db from pre-command would
 * add DB-init latency to every Bash command. The sidecar is ephemeral
 * guardrail state — safe to delete at any time, not a data store.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ToolLoopVerdict = 'allow' | 'warn' | 'block';

export interface ToolLoopCheck {
  verdict: ToolLoopVerdict;
  consecutiveFailures: number;
  /** True when an open breaker is being given a probe attempt (half-open) */
  halfOpen: boolean;
  /** Human-readable guidance for warn/block verdicts */
  hint?: string;
}

interface BreakerEntry {
  consecutiveFailures: number;
  lastFailureAt: number;
}

type ToolLoopState = Record<string, BreakerEntry>;

export interface ToolLoopGuardrailOptions {
  /** Path of the JSON state sidecar */
  statePath: string;
  /** Consecutive failures before warning (default 3) */
  warnThreshold?: number;
  /** Consecutive failures before blocking (default 5) */
  blockThreshold?: number;
  /** An open breaker allows one probe attempt after this long (default 2 min) */
  halfOpenAfterMs?: number;
  /** Entries idle longer than this are pruned (default 30 min) */
  staleAfterMs?: number;
}

export class ToolLoopGuardrail {
  private readonly statePath: string;
  private readonly warnThreshold: number;
  private readonly blockThreshold: number;
  private readonly halfOpenAfterMs: number;
  private readonly staleAfterMs: number;

  constructor(options: ToolLoopGuardrailOptions) {
    this.statePath = options.statePath;
    this.warnThreshold = options.warnThreshold ?? 3;
    this.blockThreshold = options.blockThreshold ?? 5;
    this.halfOpenAfterMs = options.halfOpenAfterMs ?? 120_000;
    this.staleAfterMs = options.staleAfterMs ?? 30 * 60_000;
  }

  /**
   * Normalize a command into a breaker key: whitespace-collapsed and
   * length-capped so cosmetic differences don't split the failure count.
   */
  static signature(command: string): string {
    return command.trim().replace(/\s+/g, ' ').slice(0, 200);
  }

  /**
   * Consult the breaker before a command runs (pre-command hook).
   * Fail-open: any state-read problem yields 'allow'.
   */
  check(command: string, now: number = Date.now()): ToolLoopCheck {
    const sig = ToolLoopGuardrail.signature(command);
    if (!sig) {
      return { verdict: 'allow', consecutiveFailures: 0, halfOpen: false };
    }

    const entry = this.readState()[sig];
    if (!entry || entry.consecutiveFailures < this.warnThreshold) {
      return { verdict: 'allow', consecutiveFailures: entry?.consecutiveFailures ?? 0, halfOpen: false };
    }

    const failures = entry.consecutiveFailures;

    if (failures >= this.blockThreshold) {
      // Open breaker: allow a single probe once the half-open window elapses
      if (now - entry.lastFailureAt >= this.halfOpenAfterMs) {
        return {
          verdict: 'warn',
          consecutiveFailures: failures,
          halfOpen: true,
          hint:
            `This command has failed ${failures}x consecutively; allowing one probe attempt. ` +
            `If it fails again it will be flagged immediately.`,
        };
      }
      return {
        verdict: 'block',
        consecutiveFailures: failures,
        halfOpen: false,
        hint:
          `The same command failed ${failures}x consecutively. Re-running it unchanged is ` +
          `unlikely to succeed — inspect the error output, change the approach, or fix the ` +
          `underlying problem first. (A successful run resets this breaker.)`,
      };
    }

    return {
      verdict: 'warn',
      consecutiveFailures: failures,
      halfOpen: false,
      hint: `This command has failed ${failures}x consecutively — consider changing approach before retrying.`,
    };
  }

  /**
   * Record a command outcome (post-command hook). Success resets the
   * breaker for that command; failure increments it. Fail-open on errors.
   */
  record(command: string, success: boolean, now: number = Date.now()): void {
    const sig = ToolLoopGuardrail.signature(command);
    if (!sig) return;

    try {
      const state = this.readState();

      if (success) {
        if (state[sig]) {
          delete state[sig];
          this.writeState(state, now);
        }
        return;
      }

      const entry = state[sig] ?? { consecutiveFailures: 0, lastFailureAt: now };
      entry.consecutiveFailures += 1;
      entry.lastFailureAt = now;
      state[sig] = entry;
      this.writeState(state, now);
    } catch {
      /* fail-open: guardrail must never break the hook */
    }
  }

  /** Whether strict mode upgrades the advisory block to a hook deny. */
  static isStrict(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.AQE_STRICT_TOOL_LOOP === '1' || env.AQE_STRICT_TOOL_LOOP === 'true';
  }

  private readState(): ToolLoopState {
    try {
      const raw = fs.readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as ToolLoopState;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {}; // missing or corrupt sidecar → clean slate
    }
  }

  private writeState(state: ToolLoopState, now: number): void {
    // Prune stale entries so the sidecar stays small
    for (const [key, entry] of Object.entries(state)) {
      if (now - entry.lastFailureAt > this.staleAfterMs) {
        delete state[key];
      }
    }
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state));
  }
}

/**
 * Guardrail bound to the project's `.agentic-qe/` directory — the shared
 * instance used by the pre-command/post-command hooks.
 */
export function createProjectToolLoopGuardrail(projectRoot: string): ToolLoopGuardrail {
  return new ToolLoopGuardrail({
    statePath: path.join(projectRoot, '.agentic-qe', 'tool-loop-state.json'),
  });
}
