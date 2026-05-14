#!/usr/bin/env node

/**
 * Agentic QE v3 - Hooks Shared State & Utilities
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Shared state, initialization, dream scheduler, learning utils, and output helpers
 * used by all hooks handler modules.
 */

import chalk from 'chalk';
import path from 'node:path';
import {
  QEReasoningBank,
  createQEReasoningBank,
} from '../../../learning/qe-reasoning-bank.js';
import {
  QEHookRegistry,
  setupQEHooks,
} from '../../../learning/qe-hooks.js';
import { HybridMemoryBackend } from '../../../kernel/hybrid-backend.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import { findProjectRoot } from '../../../kernel/unified-memory.js';
import {
  wasmLoader,
  createCoherenceService,
  type ICoherenceService,
} from '../../../integrations/coherence/index.js';

// ============================================================================
// Hooks State Management
// ============================================================================

/**
 * Singleton state for hooks system
 */
export interface HooksSystemState {
  reasoningBank: QEReasoningBank | null;
  hookRegistry: QEHookRegistry | null;
  coherenceService: ICoherenceService | null;
  sessionId: string | null;
  initialized: boolean;
  initializationPromise: Promise<void> | null;
}

export const state: HooksSystemState = {
  reasoningBank: null,
  hookRegistry: null,
  coherenceService: null,
  sessionId: null,
  initialized: false,
  initializationPromise: null,
};

/**
 * Get or create the hooks system with proper initialization
 */
export async function getHooksSystem(): Promise<{
  reasoningBank: QEReasoningBank;
  hookRegistry: QEHookRegistry;
}> {
  // If already initializing, wait for it
  if (state.initializationPromise) {
    await state.initializationPromise;
  }

  // If already initialized, return
  if (state.initialized && state.reasoningBank && state.hookRegistry) {
    return {
      reasoningBank: state.reasoningBank,
      hookRegistry: state.hookRegistry,
    };
  }

  // Initialize with timeout protection
  state.initializationPromise = initializeHooksSystem();
  await state.initializationPromise;
  state.initializationPromise = null;

  if (!state.reasoningBank || !state.hookRegistry) {
    throw new Error('Failed to initialize hooks system');
  }

  return {
    reasoningBank: state.reasoningBank,
    hookRegistry: state.hookRegistry,
  };
}

/**
 * Initialize the hooks system
 */
export async function initializeHooksSystem(): Promise<void> {
  if (state.initialized) return;

  try {
    // Create memory backend — always resolve to project root DB
    const projectRoot = findProjectRoot();
    const dataDir = path.join(projectRoot, '.agentic-qe');

    // Use hybrid backend with timeout protection
    const memoryBackend = await createHybridBackendWithTimeout(dataDir);

    // Initialize CoherenceService (optional - falls back to TypeScript implementation)
    try {
      state.coherenceService = await createCoherenceService(wasmLoader);
      console.log(chalk.dim('[hooks] CoherenceService initialized with WASM engines'));
    } catch (error) {
      // WASM not available - will use fallback
      console.log(
        chalk.dim(`[hooks] CoherenceService WASM unavailable, using fallback: ${error instanceof Error ? error.message : 'unknown'}`)
      );
    }

    // Create reasoning bank with coherence service
    state.reasoningBank = createQEReasoningBank(memoryBackend, undefined, {
      enableLearning: true,
      enableGuidance: true,
      enableRouting: true,
      embeddingDimension: 384,
      useONNXEmbeddings: true, // Use real transformer embeddings (384-dim)
    }, state.coherenceService ?? undefined);

    // Initialize with cancellable timeout (issue #478).
    //
    // We can't use Promise.race() to bound initialize() because the loser
    // promise keeps running — and on a slow init the leaked promise would
    // continue appending to patterns.rvf indefinitely (downstream report:
    // 43.8 GB in 29 minutes). Instead, drive cancellation through an
    // AbortSignal that initialize() checks between every step, so the
    // work actually stops when the deadline fires.
    const initTimeout = 10000; // 10 seconds
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('ReasoningBank init timeout')),
      initTimeout
    );
    try {
      await state.reasoningBank.initialize({ signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    // Wire RVF dual-writer for vector replication (optional, best-effort)
    try {
      const { getSharedRvfDualWriter } = await import('../../../integrations/ruvector/shared-rvf-dual-writer.js');
      const dualWriter = await getSharedRvfDualWriter();
      if (dualWriter) state.reasoningBank!.setRvfDualWriter(dualWriter);
    } catch (e) {
      if (process.env.DEBUG) console.debug('[hooks] RVF wiring skipped:', e instanceof Error ? e.message : e);
    }

    // Setup hook registry
    state.hookRegistry = setupQEHooks(state.reasoningBank);
    state.initialized = true;

    console.log(chalk.dim('[hooks] System initialized'));
  } catch (error) {
    // Create minimal fallback state
    console.warn(
      chalk.yellow(`[hooks] Using fallback mode: ${error instanceof Error ? error.message : 'unknown error'}`)
    );

    // Create in-memory fallback backend
    // NOTE: RVF dual-writer is intentionally NOT wired here — the fallback
    // uses an in-memory backend with no disk access, so RVF replication
    // (which requires the unified memory DB) is not meaningful.
    const fallbackBackend = createInMemoryBackend();
    state.reasoningBank = createQEReasoningBank(fallbackBackend, undefined, {
      enableLearning: true,
      enableGuidance: true,
      enableRouting: true,
    });

    // Skip full initialization for fallback
    state.hookRegistry = new QEHookRegistry();
    state.hookRegistry.initialize(state.reasoningBank);
    state.initialized = true;
  }
}

/**
 * Hook-side busy_timeout (ADR-001 Option C / patch 260).
 *
 * Hooks fire from short-lived `npx aqe hooks ...` subprocesses. They open the
 * shared memory.db while MCP-daemon workers may be holding the WAL write-lock
 * for several seconds during dream-cycle / pattern-promotion. With the default
 * 5s busy_timeout, hooks fail under contention. With 60s, they wait patiently
 * — the hook subprocess exits as soon as it's done, so the longer timeout has
 * no broader cost.
 *
 * Workers in MCP still use the platform default (5s) so they fail fast and
 * retry on the next tick — they yield the lock to hooks under contention.
 *
 * This is per-connection: setting the pragma in a hook subprocess only affects
 * that subprocess's connection, not the MCP daemon's.
 */
export function applyHookBusyTimeout(db: { pragma: (s: string) => void }): void {
  try {
    db.pragma('busy_timeout = 60000');
  } catch {
    // No-op if pragma fails (mocked DBs in tests, etc.)
  }
}

/**
 * Create hybrid backend with timeout protection
 *
 * ADR-046: Uses unified memory.db path for consistency with all other components.
 * HybridMemoryBackend delegates to UnifiedMemoryManager singleton.
 */
export async function createHybridBackendWithTimeout(dataDir: string): Promise<MemoryBackend> {
  const timeoutMs = 5000;

  // ADR-046: Use unified memory.db path - same as all other components
  // HybridMemoryBackend is a facade over UnifiedMemoryManager.
  //
  // ADR-001 Option C / patch 260: hooks open with a 60s busy_timeout so they
  // wait patiently through worker bursts (dream-cycle / pattern-promotion
  // can hold the WAL write-lock for several seconds). Hooks fire from a
  // short-lived `npx aqe hooks ...` process — our 60s timeout here only
  // affects the hook process; the MCP daemon's worker connections inherit
  // the platform default (5s) so they fail fast and retry next tick,
  // yielding the lock to hooks under contention.
  const backend = new HybridMemoryBackend({
    sqlite: {
      path: path.join(dataDir, 'memory.db'), // ADR-046: Unified storage
      walMode: true,
      poolSize: 3,
      busyTimeout: 60000,
    },
    // agentdb.path is ignored - vectors stored in unified memory.db
    enableFallback: true,
    defaultNamespace: 'qe-patterns',
  });

  // HybridMemoryBackend.initialize() does not accept an AbortSignal yet
  // (separate refactor). Use Promise.race for the timeout, but if the
  // timeout wins, dispose the backend once init resolves so we don't leak
  // SQLite/WAL handles in the background (issue #478 family).
  let timedOut = false;
  const initPromise = backend.initialize();
  const timeoutPromise = new Promise<void>((_, reject) =>
    setTimeout(() => {
      timedOut = true;
      reject(new Error('Backend init timeout'));
    }, timeoutMs)
  );

  try {
    await Promise.race([initPromise, timeoutPromise]);
  } catch (err) {
    if (timedOut) {
      // Tear down the backend after the leaked init completes so its
      // SQLite connections, WAL handles, and pool entries are released.
      // .catch() prevents "unhandled rejection" if dispose itself throws.
      void initPromise
        .then(() => backend.dispose())
        .catch(() => undefined);
    }
    throw err;
  }
  return backend;
}

/**
 * Create in-memory fallback backend
 */
export function createInMemoryBackend(): MemoryBackend {
  const store = new Map<string, { value: unknown; metadata?: unknown }>();

  return {
    initialize: async () => {},
    dispose: async () => {
      store.clear();
    },
    get: async <T>(key: string): Promise<T | undefined> => {
      const entry = store.get(key);
      return entry ? (entry.value as T) : undefined;
    },
    set: async <T>(key: string, value: T, _options?: { namespace?: string; persist?: boolean }): Promise<void> => {
      store.set(key, { value });
    },
    delete: async (key: string): Promise<boolean> => {
      return store.delete(key);
    },
    has: async (key: string): Promise<boolean> => store.has(key),
    search: async (pattern: string, _limit?: number): Promise<string[]> => {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
    vectorSearch: async (_embedding: number[], _k: number) => {
      return [];
    },
    storeVector: async (_key: string, _embedding: number[], _metadata?: unknown): Promise<void> => {
      // No-op for in-memory fallback
    },
    count: async (namespace: string): Promise<number> => {
      let count = 0;
      const prefix = `${namespace}:`;
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          count++;
        }
      }
      return count;
    },
    hasCodeIntelligenceIndex: async (): Promise<boolean> => {
      const prefix = 'code-intelligence:kg:';
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          return true;
        }
      }
      return false;
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function printError(message: string): void {
  console.error(chalk.red('✗'), message);
}

export function printGuidance(guidance: string[]): void {
  if (guidance.length === 0) {
    console.log(chalk.dim('  No specific guidance'));
    return;
  }
  guidance.forEach((g, i) => {
    console.log(chalk.cyan(`  ${i + 1}.`), g);
  });
}

// ============================================================================
// Stdin Event Helpers
// ============================================================================

/**
 * Read piped stdin with a short timeout. Claude Code delivers
 * UserPromptSubmit / PostToolUse / PreToolUse events as JSON on stdin —
 * `$PROMPT`, `$TOOL_INPUT_file_path`, etc. are NOT exposed as env vars in
 * every hook surface, so reading stdin is the only reliable fallback when
 * the explicit CLI option resolves to an empty string.
 *
 * Returns '' when stdin is a TTY (interactive run) or no data arrives
 * before the timeout. Never throws — a hook must never crash the host.
 */
export async function readStdinJsonEvent(timeoutMs = 500): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise<string>((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.resume();
  });
}

/**
 * Extract a file path from a Claude Code PostToolUse / PreToolUse hook event.
 * Edit / Write / MultiEdit / NotebookEdit tools all put the target path in
 * `tool_input.file_path` (snake_case from Claude Code) — older transports
 * use `toolInput.file_path`. Returns '' when no recognized field is present.
 *
 * Exported for unit testing.
 */
export function extractFilePathFromEvent(raw: string): string {
  if (!raw.trim()) return '';
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return '';
  }
  const toolInputSnake = event.tool_input as Record<string, unknown> | undefined;
  const toolInputCamel = event.toolInput as Record<string, unknown> | undefined;
  const candidates = [
    toolInputSnake?.file_path,
    toolInputSnake?.filePath,
    toolInputCamel?.file_path,
    toolInputCamel?.filePath,
    event.file_path,
    event.filePath,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return '';
}

// ============================================================================
// Dream Scheduler & Learning — re-exported from hooks-dream-learning.ts
// ============================================================================
export {
  DREAM_STATE_KEY,
  DREAM_INTERVAL_MS,
  DREAM_EXPERIENCE_THRESHOLD,
  DREAM_MIN_GAP_MS,
  type DreamHookState,
  type TaskBridgePayload,
  type TaskOutcomeResult,
  checkAndTriggerDream,
  incrementDreamExperience,
  persistCommandExperience,
  persistTaskOutcome,
  updateHookRouterQValue,
  updateRoutingOutcomeQuality,
  consolidateExperiencesToPatterns,
} from './hooks-dream-learning.js';
