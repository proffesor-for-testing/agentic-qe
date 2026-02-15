/**
 * Experience Capture Middleware
 *
 * Wraps domain task execution to automatically capture experiences
 * to the V3 database for cross-session learning.
 *
 * This middleware ensures ALL invocation paths (MCP, CLI, direct) capture learning:
 * - Starts experience tracking before execution
 * - Records steps during execution
 * - Persists outcome to V3 database after completion
 *
 * ADR-051: Unified learning capture across all execution paths
 */

import { v4 as uuidv4 } from 'uuid';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';
import type { QEDomain } from './qe-patterns.js';

// ============================================================================
// Types
// ============================================================================

export interface ExperienceContext {
  /** Unique experience ID */
  id: string;
  /** Task description */
  task: string;
  /** Executing agent */
  agent: string;
  /** QE domain */
  domain: QEDomain;
  /** Start timestamp */
  startedAt: Date;
  /** Model tier used */
  modelTier?: number;
  /** Routing decision */
  routing?: {
    tier: number;
    modelId: string;
    useAgentBooster: boolean;
    complexity: number;
  };
}

export interface ExperienceStep {
  action: string;
  result: 'success' | 'failure' | 'partial';
  quality: number;
  durationMs: number;
  data?: unknown;
}

export interface ExperienceOutcome {
  /** Experience ID */
  id: string;
  /** Whether task succeeded */
  success: boolean;
  /** Quality score 0-1 */
  quality: number;
  /** Execution duration */
  durationMs: number;
  /** Error if failed */
  error?: string;
  /** Steps taken */
  steps: ExperienceStep[];
  /** Result data */
  result?: unknown;
}

// ============================================================================
// Active Experience Tracking
// ============================================================================

/** Maximum time an experience can be active before cleanup (10 minutes) */
const EXPERIENCE_TIMEOUT_MS = 10 * 60 * 1000;

/** Interval for cleanup checks (2 minutes) */
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

/** Maximum size for JSON serialization (1MB) to prevent DoS via large payloads */
const MAX_JSON_SIZE_BYTES = 1024 * 1024;

/**
 * Safely stringify JSON with size limit to prevent memory exhaustion
 * Returns null if serialization fails or exceeds size limit
 */
function safeJsonStringify(value: unknown, maxSize: number = MAX_JSON_SIZE_BYTES): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    const json = JSON.stringify(value);
    if (json.length > maxSize) {
      console.warn(
        `[ExperienceCaptureMiddleware] JSON payload exceeds size limit ` +
        `(${json.length} > ${maxSize} bytes), truncating`
      );
      // Return truncated version with marker
      return JSON.stringify({
        _truncated: true,
        _originalSize: json.length,
        _preview: typeof value === 'object' ? Object.keys(value as object).slice(0, 10) : String(value).slice(0, 100),
      });
    }
    return json;
  } catch (error) {
    console.warn('[ExperienceCaptureMiddleware] Failed to serialize JSON:', error);
    return null;
  }
}

const activeExperiences = new Map<string, {
  context: ExperienceContext;
  steps: ExperienceStep[];
}>();

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Clean up stale experiences that have been active longer than EXPERIENCE_TIMEOUT_MS
 * This prevents memory leaks from experiences that were started but never completed.
 */
export function cleanupStaleExperiences(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, experience] of activeExperiences) {
    const ageMs = now - experience.context.startedAt.getTime();
    if (ageMs > EXPERIENCE_TIMEOUT_MS) {
      console.warn(
        `[ExperienceCaptureMiddleware] Cleaning up stale experience: ${id} ` +
        `(age=${Math.round(ageMs / 1000)}s, domain=${experience.context.domain})`
      );
      activeExperiences.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[ExperienceCaptureMiddleware] Cleaned ${cleaned} stale experiences`);
  }

  return cleaned;
}

/**
 * Start periodic cleanup of stale experiences
 */
function startCleanupTimer(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    cleanupStaleExperiences();
  }, CLEANUP_INTERVAL_MS);

  // Don't keep the process alive just for cleanup
  cleanupTimer.unref();
}

/**
 * Stop the cleanup timer (for testing or shutdown)
 */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ============================================================================
// Middleware Implementation
// ============================================================================

let memoryManager: UnifiedMemoryManager | null = null;

// Promise-based lock to prevent initialization race conditions
let initPromise: Promise<void> | null = null;

/**
 * Initialize the experience capture middleware
 */
export async function initializeExperienceCapture(): Promise<void> {
  // Use promise-based lock to prevent concurrent initialization
  if (initPromise) {
    return initPromise;
  }

  initPromise = doInitialize();
  return initPromise;
}

async function doInitialize(): Promise<void> {
  try {
    memoryManager = getUnifiedMemory();
    await memoryManager.initialize();

    // Ensure experience tables exist with v3 schema
    const db = memoryManager.getDatabase();
    if (db) {
      let needsCreate = false;

      const tableExists = (db.prepare(
        "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='captured_experiences'"
      ).get() as { cnt: number }).cnt > 0;

      if (tableExists) {
        const columns = db.prepare('PRAGMA table_info(captured_experiences)').all() as Array<{ name: string }>;
        const colNames = new Set(columns.map(c => c.name));

        if (!colNames.has('success') || !colNames.has('task')) {
          // v2 schema — rename old table and recreate with v3 schema
          db.exec('ALTER TABLE captured_experiences RENAME TO captured_experiences_v2_backup');
          needsCreate = true;
        } else {
          // v3 schema — add any missing columns
          if (!colNames.has('domain')) {
            db.exec("ALTER TABLE captured_experiences ADD COLUMN domain TEXT NOT NULL DEFAULT ''");
          }
          if (!colNames.has('source')) {
            db.exec("ALTER TABLE captured_experiences ADD COLUMN source TEXT DEFAULT 'middleware'");
          }
        }
      } else {
        needsCreate = true;
      }

      if (needsCreate) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS captured_experiences (
            id TEXT PRIMARY KEY,
            task TEXT NOT NULL,
            agent TEXT NOT NULL,
            domain TEXT NOT NULL DEFAULT '',
            success INTEGER NOT NULL DEFAULT 0,
            quality REAL NOT NULL DEFAULT 0.5,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            model_tier INTEGER,
            routing_json TEXT,
            steps_json TEXT,
            result_json TEXT,
            error TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT NOT NULL DEFAULT (datetime('now')),
            source TEXT DEFAULT 'middleware'
          );
        `);
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_captured_exp_domain ON captured_experiences(domain);
        CREATE INDEX IF NOT EXISTS idx_captured_exp_success ON captured_experiences(success);
        CREATE INDEX IF NOT EXISTS idx_captured_exp_agent ON captured_experiences(agent);
        CREATE INDEX IF NOT EXISTS idx_captured_exp_completed ON captured_experiences(completed_at DESC);
      `);
    }

    // Start periodic cleanup of stale experiences
    startCleanupTimer();

    console.log('[ExperienceCaptureMiddleware] Initialized');
  } catch (error) {
    console.error('[ExperienceCaptureMiddleware] Failed to initialize:', error);
    // Reset promise to allow retry on next call
    initPromise = null;
    // Don't throw - allow system to continue without capture
  }
}

/**
 * Start capturing an experience
 */
export function startExperience(
  task: string,
  agent: string,
  domain: QEDomain,
  options?: {
    modelTier?: number;
    routing?: ExperienceContext['routing'];
  }
): string {
  const id = `exp-${uuidv4()}`;
  const context: ExperienceContext = {
    id,
    task,
    agent,
    domain,
    startedAt: new Date(),
    modelTier: options?.modelTier,
    routing: options?.routing,
  };

  activeExperiences.set(id, {
    context,
    steps: [],
  });

  return id;
}

/**
 * Record a step in an active experience
 */
export function recordExperienceStep(
  experienceId: string,
  step: ExperienceStep
): void {
  const experience = activeExperiences.get(experienceId);
  if (!experience) {
    console.warn(`[ExperienceCaptureMiddleware] Unknown experience: ${experienceId}`);
    return;
  }

  experience.steps.push(step);
}

/**
 * Complete an experience and persist to database
 */
export async function completeExperience(
  experienceId: string,
  success: boolean,
  result?: unknown,
  error?: string
): Promise<ExperienceOutcome | null> {
  const experience = activeExperiences.get(experienceId);
  if (!experience) {
    console.warn(`[ExperienceCaptureMiddleware] Unknown experience: ${experienceId}`);
    return null;
  }

  const { context, steps } = experience;
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - context.startedAt.getTime();

  // Calculate quality from steps or default
  const quality = steps.length > 0
    ? steps.reduce((sum, s) => sum + s.quality, 0) / steps.length
    : (success ? 0.7 : 0.3);

  const outcome: ExperienceOutcome = {
    id: experienceId,
    success,
    quality,
    durationMs,
    error,
    steps,
    result,
  };

  // Remove from active tracking
  activeExperiences.delete(experienceId);

  // Persist to database
  await persistExperience(context, outcome);

  // Also persist to sona_patterns for learning
  await persistToSonaPatterns(context, outcome);

  console.log(
    `[ExperienceCaptureMiddleware] Captured: ${context.domain}/${context.agent} ` +
    `success=${success} quality=${quality.toFixed(2)} duration=${durationMs}ms ` +
    `steps=${steps.length}`
  );

  return outcome;
}

/**
 * Persist experience to captured_experiences table
 */
async function persistExperience(
  context: ExperienceContext,
  outcome: ExperienceOutcome
): Promise<void> {
  // Ensure initialized (idempotent - returns immediately if already initialized)
  await initializeExperienceCapture();

  if (!memoryManager) {
    console.warn('[ExperienceCaptureMiddleware] Memory manager not available');
    return;
  }

  try {
    const db = memoryManager.getDatabase();
    if (!db) return;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO captured_experiences
      (id, task, agent, domain, success, quality, duration_ms, model_tier,
       routing_json, steps_json, result_json, error, started_at, completed_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    stmt.run(
      outcome.id,
      context.task,
      context.agent,
      context.domain,
      outcome.success ? 1 : 0,
      outcome.quality,
      outcome.durationMs,
      context.modelTier || null,
      safeJsonStringify(context.routing),
      safeJsonStringify(outcome.steps),
      safeJsonStringify(outcome.result),
      outcome.error || null,
      context.startedAt.toISOString(),
      'middleware'
    );
  } catch (error) {
    console.error('[ExperienceCaptureMiddleware] Failed to persist experience:', error);
  }
}

/**
 * Persist to sona_patterns for learning integration
 */
async function persistToSonaPatterns(
  context: ExperienceContext,
  outcome: ExperienceOutcome
): Promise<void> {
  if (!memoryManager) return;

  try {
    const db = memoryManager.getDatabase();
    if (!db) return;

    // Only store successful patterns with decent quality
    if (!outcome.success || outcome.quality < 0.5) return;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sona_patterns
      (id, type, domain, action_type, action_value,
       outcome_reward, outcome_success, outcome_quality,
       confidence, usage_count, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(
      `sona-${outcome.id}`,
      'task-execution',
      context.domain,
      context.agent,
      safeJsonStringify({ task: context.task.slice(0, 200) }),
      outcome.quality,
      1,
      outcome.quality,
      outcome.quality,
      1,
      safeJsonStringify({
        experienceId: outcome.id,
        durationMs: outcome.durationMs,
        stepsCount: outcome.steps.length,
        modelTier: context.modelTier,
      })
    );
  } catch (error) {
    // Log but don't fail - sona_patterns might not exist
    console.warn('[ExperienceCaptureMiddleware] Failed to persist to sona_patterns:', error);
  }
}

// ============================================================================
// Handler Wrapper
// ============================================================================

/**
 * Wrap an async handler function to capture experiences
 *
 * Usage:
 * ```typescript
 * const wrappedHandler = wrapWithExperienceCapture(
 *   handleTestGenerate,
 *   'test-generation',
 *   'test-generator'
 * );
 * ```
 */
export function wrapWithExperienceCapture<TParams, TResult>(
  handler: (params: TParams) => Promise<{ success: boolean; data?: TResult; error?: string }>,
  domain: QEDomain,
  agent: string
): (params: TParams) => Promise<{ success: boolean; data?: TResult; error?: string }> {
  return async (params: TParams) => {
    // Ensure initialized (idempotent - returns immediately if already initialized)
    await initializeExperienceCapture();

    // Extract task description from params if available
    const task = extractTaskDescription(params, domain);

    // Extract routing info if available
    const routing = extractRouting(params);

    // Start experience capture
    const expId = startExperience(task, agent, domain, {
      modelTier: routing?.tier,
      routing,
    });

    const startTime = Date.now();

    try {
      // Execute the handler
      const result = await handler(params);
      const durationMs = Date.now() - startTime;

      // Record execution step
      recordExperienceStep(expId, {
        action: `execute-${domain}`,
        result: result.success ? 'success' : 'failure',
        quality: result.success ? 0.8 : 0.2,
        durationMs,
        data: result.data ? { hasData: true } : undefined,
      });

      // Complete experience
      await completeExperience(
        expId,
        result.success,
        result.data,
        result.error
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Record failure step
      recordExperienceStep(expId, {
        action: `execute-${domain}`,
        result: 'failure',
        quality: 0.0,
        durationMs,
      });

      // Complete with error
      await completeExperience(
        expId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTaskDescription(params: unknown, domain: QEDomain): string {
  if (!params || typeof params !== 'object') {
    return `Execute ${domain} task`;
  }

  const p = params as Record<string, unknown>;

  // Try common task description fields
  if (typeof p.task === 'string') return p.task;
  if (typeof p.description === 'string') return p.description;
  if (typeof p.sourceCode === 'string') return `Generate tests for code (${p.sourceCode.length} chars)`;
  if (typeof p.target === 'string') return `Analyze ${p.target}`;
  if (typeof p.url === 'string') return `Test accessibility for ${p.url}`;
  if (Array.isArray(p.testFiles)) return `Execute ${p.testFiles.length} test files`;

  return `Execute ${domain} task`;
}

function extractRouting(params: unknown): ExperienceContext['routing'] | undefined {
  if (!params || typeof params !== 'object') return undefined;

  const p = params as Record<string, unknown>;
  const routing = p.routing as Record<string, unknown> | undefined;

  if (!routing) return undefined;

  return {
    tier: typeof routing.tier === 'number' ? routing.tier : 0,
    modelId: typeof routing.modelId === 'string' ? routing.modelId : 'unknown',
    useAgentBooster: !!routing.useAgentBooster,
    complexity: typeof routing.complexity === 'number' ? routing.complexity : 0,
  };
}

// ============================================================================
// Statistics
// ============================================================================

export interface CaptureStats {
  activeExperiences: number;
  totalCaptured: number;
  byDomain: Record<string, number>;
  bySuccess: { success: number; failure: number };
  avgQuality: number;
}

export async function getCaptureStats(): Promise<CaptureStats> {
  const stats: CaptureStats = {
    activeExperiences: activeExperiences.size,
    totalCaptured: 0,
    byDomain: {},
    bySuccess: { success: 0, failure: 0 },
    avgQuality: 0,
  };

  if (!memoryManager) return stats;

  try {
    const db = memoryManager.getDatabase();
    if (!db) return stats;

    // Total captured
    const total = db.prepare('SELECT COUNT(*) as count FROM captured_experiences').get() as { count: number } | undefined;
    stats.totalCaptured = total?.count || 0;

    // By domain
    const byDomain = db.prepare(
      'SELECT domain, COUNT(*) as count FROM captured_experiences GROUP BY domain'
    ).all() as Array<{ domain: string; count: number }>;
    for (const row of byDomain) {
      stats.byDomain[row.domain] = row.count;
    }

    // By success
    const bySuccess = db.prepare(
      'SELECT success, COUNT(*) as count FROM captured_experiences GROUP BY success'
    ).all() as Array<{ success: number; count: number }>;
    for (const row of bySuccess) {
      if (row.success === 1) stats.bySuccess.success = row.count;
      else stats.bySuccess.failure = row.count;
    }

    // Average quality
    const avgQuality = db.prepare(
      'SELECT AVG(quality) as avg FROM captured_experiences WHERE success = 1'
    ).get() as { avg: number | null } | undefined;
    stats.avgQuality = avgQuality?.avg || 0;
  } catch (error) {
    console.error('[ExperienceCaptureMiddleware] Failed to get stats:', error);
  }

  return stats;
}
