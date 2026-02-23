#!/usr/bin/env node

/**
 * Agentic QE v3 - Hooks Commands
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Self-learning hooks system for pattern recognition and guidance generation.
 * This module provides CLI commands for the QE hooks system.
 */

import { randomUUID } from 'crypto';
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import {
  QEReasoningBank,
  createQEReasoningBank,
  QERoutingRequest,
} from '../../learning/qe-reasoning-bank.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import {
  QEHookRegistry,
  QE_HOOK_EVENTS,
  setupQEHooks,
  QEHookResult,
} from '../../learning/qe-hooks.js';
import { QEDomain } from '../../learning/qe-patterns.js';
import { HybridMemoryBackend } from '../../kernel/hybrid-backend.js';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import { findProjectRoot } from '../../kernel/unified-memory.js';
import {
  wasmLoader,
  createCoherenceService,
  type ICoherenceService,
} from '../../integrations/coherence/index.js';

// ============================================================================
// Hooks State Management
// ============================================================================

/**
 * Singleton state for hooks system
 */
interface HooksSystemState {
  reasoningBank: QEReasoningBank | null;
  hookRegistry: QEHookRegistry | null;
  coherenceService: ICoherenceService | null;
  sessionId: string | null;
  initialized: boolean;
  initializationPromise: Promise<void> | null;
}

const state: HooksSystemState = {
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
async function getHooksSystem(): Promise<{
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
async function initializeHooksSystem(): Promise<void> {
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

    // Initialize with timeout
    const initTimeout = 10000; // 10 seconds
    const initPromise = state.reasoningBank.initialize();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('ReasoningBank init timeout')), initTimeout)
    );

    await Promise.race([initPromise, timeoutPromise]);

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
 * Create hybrid backend with timeout protection
 *
 * ADR-046: Uses unified memory.db path for consistency with all other components.
 * HybridMemoryBackend delegates to UnifiedMemoryManager singleton.
 */
async function createHybridBackendWithTimeout(dataDir: string): Promise<MemoryBackend> {
  const timeoutMs = 5000;

  // ADR-046: Use unified memory.db path - same as all other components
  // HybridMemoryBackend is a facade over UnifiedMemoryManager
  const backend = new HybridMemoryBackend({
    sqlite: {
      path: path.join(dataDir, 'memory.db'), // ADR-046: Unified storage
      walMode: true,
      poolSize: 3,
      busyTimeout: 5000,
    },
    // agentdb.path is ignored - vectors stored in unified memory.db
    enableFallback: true,
    defaultNamespace: 'qe-patterns',
  });

  const initPromise = backend.initialize();
  const timeoutPromise = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('Backend init timeout')), timeoutMs)
  );

  await Promise.race([initPromise, timeoutPromise]);
  return backend;
}

/**
 * Create in-memory fallback backend
 */
function createInMemoryBackend(): MemoryBackend {
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
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
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

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

function printError(message: string): void {
  console.error(chalk.red('✗'), message);
}

// ============================================================================
// Dream Scheduler State (persisted in kv_store between hook invocations)
// ============================================================================

const DREAM_STATE_KEY = 'dream-scheduler:hook-state';
const DREAM_INTERVAL_MS = 3600000; // 1 hour between auto-dreams
const DREAM_EXPERIENCE_THRESHOLD = 20; // experiences before triggering
const DREAM_MIN_GAP_MS = 300000; // 5 minutes minimum between dreams

interface DreamHookState {
  lastDreamTime: string | null;
  experienceCount: number;
  sessionStartTime: string;
  totalDreamsThisSession: number;
}

/**
 * Check if a dream cycle should be triggered and run it if so.
 * Called from post-task hook after recording each experience.
 *
 * Trigger conditions (any of):
 * 1. Time-based: >1hr since last dream
 * 2. Experience-based: >20 experiences since last dream
 *
 * Guard: minimum 5 minutes between dreams
 */
async function checkAndTriggerDream(memoryBackend: MemoryBackend): Promise<{
  triggered: boolean;
  reason?: string;
  insightsGenerated?: number;
}> {
  try {
    // Load persisted dream state
    const dreamState = await memoryBackend.get<DreamHookState>(DREAM_STATE_KEY);
    if (!dreamState) {
      return { triggered: false, reason: 'no-state' };
    }

    const now = Date.now();
    const lastDreamTime = dreamState.lastDreamTime ? new Date(dreamState.lastDreamTime).getTime() : 0;
    const timeSinceLastDream = now - lastDreamTime;

    // Guard: minimum gap
    if (timeSinceLastDream < DREAM_MIN_GAP_MS) {
      return { triggered: false, reason: 'too-soon' };
    }

    // Check triggers
    const timeTriggered = timeSinceLastDream >= DREAM_INTERVAL_MS;
    const experienceTriggered = dreamState.experienceCount >= DREAM_EXPERIENCE_THRESHOLD;

    if (!timeTriggered && !experienceTriggered) {
      return { triggered: false, reason: 'conditions-not-met' };
    }

    const reason = timeTriggered ? 'time-interval' : 'experience-threshold';
    console.log(chalk.dim(`[hooks] Dream trigger: ${reason} (${dreamState.experienceCount} experiences, ${Math.round(timeSinceLastDream / 60000)}min since last dream)`));

    // Run a quick dream cycle
    const { createDreamEngine } = await import('../../learning/dream/index.js');
    const { createQEReasoningBank: createRB } = await import('../../learning/qe-reasoning-bank.js');

    const engine = createDreamEngine({
      maxDurationMs: 10000, // 10s for hook-triggered dreams
      minConceptsRequired: 3,
    });
    await engine.initialize();

    // Load patterns from ReasoningBank
    const rb = createRB(memoryBackend, undefined, {
      enableLearning: true,
      enableGuidance: false,
      enableRouting: false,
      embeddingDimension: 384,
      useONNXEmbeddings: true,
    });
    await rb.initialize();

    const patternsResult = await rb.searchPatterns('', { limit: 100, minConfidence: 0.3 });
    if (patternsResult.success && patternsResult.value.length > 0) {
      const importPatterns = patternsResult.value.map(r => ({
        id: r.pattern.id,
        name: r.pattern.name,
        description: r.pattern.description || `${r.pattern.patternType} pattern`,
        domain: r.pattern.qeDomain || 'learning-optimization',
        patternType: r.pattern.patternType,
        confidence: r.pattern.confidence,
        successRate: r.pattern.successRate || 0.5,
      }));
      await engine.loadPatternsAsConcepts(importPatterns);
    }

    const result = await engine.dream(10000);

    // Update state
    dreamState.lastDreamTime = new Date().toISOString();
    dreamState.experienceCount = 0;
    dreamState.totalDreamsThisSession++;
    await memoryBackend.set(DREAM_STATE_KEY, dreamState);

    await engine.close();

    return {
      triggered: true,
      reason,
      insightsGenerated: result.insights.length,
    };
  } catch (error) {
    console.error(chalk.dim(`[hooks] Dream trigger failed: ${error instanceof Error ? error.message : 'unknown'}`));
    return { triggered: false, reason: 'error' };
  }
}

/**
 * Increment the experience counter in dream state.
 * Called from post-task hook.
 */
async function incrementDreamExperience(memoryBackend: MemoryBackend): Promise<number> {
  try {
    let dreamState = await memoryBackend.get<DreamHookState>(DREAM_STATE_KEY);
    if (!dreamState) {
      dreamState = {
        lastDreamTime: null,
        experienceCount: 0,
        sessionStartTime: new Date().toISOString(),
        totalDreamsThisSession: 0,
      };
    }
    dreamState.experienceCount++;
    await memoryBackend.set(DREAM_STATE_KEY, dreamState);
    return dreamState.experienceCount;
  } catch {
    return 0;
  }
}

/**
 * Persist a command/edit experience directly to the captured_experiences table.
 * CLI hooks cannot use the MCP middleware wrapper, so they write directly.
 */
async function persistCommandExperience(opts: {
  task: string;
  agent: string;
  domain: string;
  success: boolean;
  durationMs?: number;
  source: string;
}): Promise<void> {
  try {
    const { getUnifiedMemory } = await import('../../kernel/unified-memory.js');
    const um = getUnifiedMemory();
    if (!um.isInitialized()) {
      await um.initialize();
    }
    const db = um.getDatabase();
    const id = `cli-${Date.now()}-${randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT OR REPLACE INTO captured_experiences
        (id, task, agent, domain, success, quality, duration_ms,
         started_at, completed_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    `).run(
      id,
      opts.task.slice(0, 500),
      opts.agent,
      opts.domain,
      opts.success ? 1 : 0,
      opts.success ? 0.7 : 0.3,
      opts.durationMs || 0,
      opts.source
    );
  } catch (error) {
    // Best-effort — don't fail the hook
    console.error(chalk.dim(`[hooks] persistCommandExperience: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}

function printGuidance(guidance: string[]): void {
  if (guidance.length === 0) {
    console.log(chalk.dim('  No specific guidance'));
    return;
  }
  guidance.forEach((g, i) => {
    console.log(chalk.cyan(`  ${i + 1}.`), g);
  });
}

// ============================================================================
// Hooks Command Creation
// ============================================================================

/**
 * Create the hooks command with all subcommands
 */
export function createHooksCommand(): Command {
  const hooks = new Command('hooks')
    .description('Self-learning QE hooks for pattern recognition and guidance')
    .addHelpText('after', `
Examples:
  # File editing hooks (learning from edits)
  aqe hooks pre-edit --file src/utils.ts --operation create
  aqe hooks post-edit --file src/utils.ts --success

  # Task routing and guidance
  aqe hooks route --task "Generate tests for UserService"
  aqe hooks pre-task --description "Generate tests" --json
  aqe hooks post-task --task-id "task-123" --success true

  # Bash command hooks
  aqe hooks pre-command --command "npm test" --json
  aqe hooks post-command --command "npm test" --success true

  # Session lifecycle (Stop hook)
  aqe hooks session-start --session-id "session-123"
  aqe hooks session-end --save-state --json

  # Pattern management
  aqe hooks learn --name "test-pattern" --description "A test pattern"
  aqe hooks search --query "authentication"
  aqe hooks stats
  aqe hooks list
    `);

  // -------------------------------------------------------------------------
  // pre-edit: Get guidance before editing a file
  // -------------------------------------------------------------------------
  hooks
    .command('pre-edit')
    .description('Get context and guidance before editing a file')
    .requiredOption('-f, --file <path>', 'File path to edit')
    .option('-o, --operation <type>', 'Operation type: create, update, delete, refactor', 'update')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { hookRegistry } = await getHooksSystem();

        const results = await hookRegistry.emit(QE_HOOK_EVENTS.PreTestGeneration, {
          targetFile: options.file,
          testType: 'unit',
          operation: options.operation,
        });

        const result = results[0] || { success: true, guidance: [], routing: null };

        if (options.json) {
          // Build additionalContext for Claude from guidance
          const guidanceLines = result.guidance || [];
          const agentHint = result.routing?.recommendedAgent
            ? `Recommended agent: ${result.routing.recommendedAgent} (${(result.routing.confidence * 100).toFixed(0)}% confidence).`
            : '';
          const contextStr = [
            agentHint,
            ...guidanceLines.map((g: string) => g),
          ].filter(Boolean).join(' ');

          printJson({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              additionalContext: contextStr || undefined,
            },
            file: options.file,
            operation: options.operation,
            patterns: result.routing?.patterns?.length || 0,
          });
        } else {
          console.log(chalk.bold('\n📝 Pre-Edit Analysis'));
          console.log(chalk.dim(`  File: ${options.file}`));
          console.log(chalk.dim(`  Operation: ${options.operation}`));

          if (result.routing) {
            console.log(chalk.bold('\n🎯 Recommended Agent:'), chalk.cyan(result.routing.recommendedAgent));
            console.log(chalk.dim(`  Confidence: ${(result.routing.confidence * 100).toFixed(1)}%`));
          }

          console.log(chalk.bold('\n💡 Guidance:'));
          printGuidance(result.guidance || []);
        }
        process.exit(0);
      } catch (error) {
        printError(`pre-edit failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // post-edit: Record editing outcome for learning
  // -------------------------------------------------------------------------
  hooks
    .command('post-edit')
    .description('Record editing outcome for pattern learning')
    .requiredOption('-f, --file <path>', 'File path that was edited')
    .option('--success', 'Edit was successful')
    .option('--failure', 'Edit failed')
    .option('--pattern-id <id>', 'Pattern ID that was applied')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { hookRegistry } = await getHooksSystem();

        const success = options.success || !options.failure;

        // Generate synthetic patternId from file path if none provided
        const filePath = options.file || '';
        const fileName = filePath.split('/').pop() || 'unknown';
        const isTestFile = /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(fileName);
        const domain = isTestFile ? 'test-generation' : 'code-intelligence';
        const syntheticPatternId = options.patternId || `edit:${domain}:${fileName}`;

        const results = await hookRegistry.emit(QE_HOOK_EVENTS.PostTestGeneration, {
          targetFile: options.file,
          success,
          patternId: syntheticPatternId,
          generatedTests: null,
          testCount: 0,
        });

        const result = results[0] || { success: true, patternsLearned: 0 };

        // Also explicitly call recordOutcome so qe_pattern_usage gets a row
        try {
          const { reasoningBank } = await getHooksSystem();
          await reasoningBank.recordOutcome({
            patternId: syntheticPatternId,
            success,
            metrics: { executionTimeMs: 0 },
            feedback: `Edit ${success ? 'succeeded' : 'failed'}: ${filePath}`,
          });
        } catch {
          // best-effort
        }

        // Persist as captured experience
        try {
          await persistCommandExperience({
            task: `edit: ${filePath}`,
            agent: 'cli-hook',
            domain,
            success,
            source: 'cli-hook-post-edit',
          });
        } catch {
          // best-effort
        }

        // Record experience for dream scheduler
        let dreamTriggered = false;
        try {
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          await incrementDreamExperience(memoryBackend);
        } catch {
          // best-effort
        }

        if (options.json) {
          printJson({
            success: true,
            file: options.file,
            editSuccess: success,
            patternsLearned: result.patternsLearned || 0,
            dreamTriggered,
          });
        } else {
          printSuccess(`Recorded edit outcome for ${options.file}`);
          if (result.patternsLearned) {
            console.log(chalk.green(`  Patterns learned: ${result.patternsLearned}`));
          }
        }
        process.exit(0);
      } catch (error) {
        printError(`post-edit failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // route: Route task to optimal agent
  // -------------------------------------------------------------------------
  hooks
    .command('route')
    .description('Route a task to the optimal QE agent')
    .requiredOption('-t, --task <description>', 'Task description')
    .option('-d, --domain <domain>', 'Target QE domain hint')
    .option('-c, --capabilities <caps...>', 'Required capabilities')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();

        const request: QERoutingRequest = {
          task: options.task,
          domain: options.domain as QEDomain,
          capabilities: options.capabilities,
        };

        const result = await reasoningBank.routeTask(request);

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const routing = result.value;

        if (options.json) {
          printJson({
            recommendedAgent: routing.recommendedAgent,
            confidence: routing.confidence,
            alternatives: routing.alternatives,
            domains: routing.domains,
            patternCount: routing.patterns.length,
            guidance: routing.guidance,
            reasoning: routing.reasoning,
          });
        } else {
          console.log(chalk.bold('\n🎯 Task Routing Result'));
          console.log(chalk.dim(`  Task: "${options.task}"`));

          console.log(chalk.bold('\n👤 Recommended Agent:'), chalk.cyan(routing.recommendedAgent));
          console.log(chalk.dim(`  Confidence: ${(routing.confidence * 100).toFixed(1)}%`));

          if (routing.alternatives.length > 0) {
            console.log(chalk.bold('\n🔄 Alternatives:'));
            routing.alternatives.forEach((alt) => {
              console.log(
                chalk.dim(`  - ${alt.agent}: ${(alt.score * 100).toFixed(1)}%`)
              );
            });
          }

          console.log(chalk.bold('\n📂 Detected Domains:'), routing.domains.join(', '));

          console.log(chalk.bold('\n💡 Guidance:'));
          printGuidance(routing.guidance);

          console.log(chalk.bold('\n📖 Reasoning:'), chalk.dim(routing.reasoning));
        }

        // Persist routing decision for learning
        try {
          const { getUnifiedMemory } = await import('../../kernel/unified-memory.js');
          const um = getUnifiedMemory();
          if (!um.isInitialized()) {
            await um.initialize();
          }
          const db = um.getDatabase();
          const outcomeId = `route-${Date.now()}-${randomUUID().slice(0, 8)}`;
          db.prepare(`
            INSERT OR REPLACE INTO routing_outcomes (
              id, task_json, decision_json, used_agent,
              followed_recommendation, success, quality_score,
              duration_ms, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            outcomeId,
            JSON.stringify({ description: options.task, domain: options.domain }),
            JSON.stringify({
              recommended: routing.recommendedAgent,
              confidence: routing.confidence,
              alternatives: routing.alternatives,
            }),
            routing.recommendedAgent,
            1, // followed_recommendation = true (recommendation stage)
            1, // success = true (routing itself succeeded)
            routing.confidence,
            0, // duration not tracked at routing stage
            null
          );

          // Increment dream experience counter
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          await incrementDreamExperience(memoryBackend);
        } catch (persistError) {
          // Best-effort — don't fail the hook
          console.error(chalk.dim(`[hooks] route persist: ${persistError instanceof Error ? persistError.message : 'unknown'}`));
        }

        // Exit cleanly after successful routing (prevents hanging on db cleanup)
        process.exit(0);
      } catch (error) {
        printError(`route failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // stats: Get hooks system statistics
  // -------------------------------------------------------------------------
  hooks
    .command('stats')
    .description('Display hooks system statistics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();
        const stats = await reasoningBank.getStats();

        if (options.json) {
          printJson(stats);
        } else {
          console.log(chalk.bold('\n📊 Hooks System Statistics\n'));

          console.log(chalk.bold('Patterns:'));
          console.log(`  Total: ${chalk.cyan(stats.totalPatterns)}`);
          console.log(`  Short-term: ${stats.patternStoreStats.byTier.shortTerm}`);
          console.log(`  Long-term: ${stats.patternStoreStats.byTier.longTerm}`);

          console.log(chalk.bold('\nBy Domain:'));
          for (const [domain, count] of Object.entries(stats.byDomain)) {
            if (count > 0) {
              console.log(`  ${domain}: ${count}`);
            }
          }

          console.log(chalk.bold('\nRouting:'));
          console.log(`  Requests: ${stats.routingRequests}`);
          console.log(`  Avg Confidence: ${(stats.avgRoutingConfidence * 100).toFixed(1)}%`);

          console.log(chalk.bold('\nLearning:'));
          console.log(`  Outcomes: ${stats.learningOutcomes}`);
          console.log(`  Success Rate: ${(stats.patternSuccessRate * 100).toFixed(1)}%`);

          console.log(chalk.bold('\nSearch Performance:'));
          console.log(`  Operations: ${stats.patternStoreStats.searchOperations}`);
          console.log(
            `  Avg Latency: ${stats.patternStoreStats.avgSearchLatencyMs.toFixed(2)}ms`
          );
          console.log(
            `  HNSW Native: ${stats.patternStoreStats.hnswStats.nativeAvailable ? '✓' : '✗'}`
          );
        }
      } catch (error) {
        printError(`stats failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // list: List registered hook events
  // -------------------------------------------------------------------------
  hooks
    .command('list')
    .description('List all registered QE hook events')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { hookRegistry } = await getHooksSystem();
        const events = hookRegistry.getRegisteredEvents();

        if (options.json) {
          printJson({
            events,
            totalEvents: Object.keys(QE_HOOK_EVENTS).length,
            registeredEvents: events.length,
          });
        } else {
          console.log(chalk.bold('\n📋 Registered QE Hook Events\n'));

          console.log(chalk.bold('All Available Events:'));
          for (const [name, event] of Object.entries(QE_HOOK_EVENTS)) {
            const isRegistered = events.includes(event);
            const status = isRegistered ? chalk.green('✓') : chalk.dim('○');
            console.log(`  ${status} ${name}: ${chalk.dim(event)}`);
          }

          console.log(
            chalk.dim(`\nRegistered: ${events.length}/${Object.keys(QE_HOOK_EVENTS).length}`)
          );
        }
      } catch (error) {
        printError(`list failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // emit: Emit a hook event (for testing/integration)
  // -------------------------------------------------------------------------
  hooks
    .command('emit')
    .description('Emit a QE hook event')
    .requiredOption('-e, --event <name>', 'Event name (e.g., qe:pattern-applied)')
    .option('-d, --data <json>', 'Event data as JSON', '{}')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { hookRegistry } = await getHooksSystem();

        let data: Record<string, unknown>;
        try {
          data = safeJsonParse<Record<string, unknown>>(options.data);
        } catch {
          throw new Error(`Invalid JSON data: ${options.data}`);
        }

        const results = await hookRegistry.emit(options.event, data);

        if (options.json) {
          printJson({
            event: options.event,
            results,
          });
        } else {
          console.log(chalk.bold('\n📡 Hook Event Emitted'));
          console.log(chalk.dim(`  Event: ${options.event}`));
          console.log(chalk.dim(`  Handlers: ${results.length}`));

          results.forEach((result, i) => {
            const status = result.success ? chalk.green('✓') : chalk.red('✗');
            console.log(`  ${status} Handler ${i + 1}: ${result.success ? 'success' : result.error}`);
            if (result.patternsLearned) {
              console.log(chalk.green(`    Patterns learned: ${result.patternsLearned}`));
            }
          });
        }
      } catch (error) {
        printError(`emit failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // learn: Store a new pattern for learning
  // -------------------------------------------------------------------------
  hooks
    .command('learn')
    .description('Store a new pattern in the reasoning bank')
    .requiredOption('-n, --name <name>', 'Pattern name')
    .requiredOption('-d, --description <desc>', 'Pattern description')
    .option('-t, --type <type>', 'Pattern type', 'test-template')
    .option('--domain <domain>', 'QE domain')
    .option('--tags <tags...>', 'Pattern tags')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();

        const result = await reasoningBank.storePattern({
          patternType: options.type,
          name: options.name,
          description: options.description,
          template: {
            type: 'prompt',
            content: options.description,
            variables: [],
          },
          context: {
            tags: options.tags || [],
          },
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const pattern = result.value;

        if (options.json) {
          printJson({
            success: true,
            pattern: {
              id: pattern.id,
              name: pattern.name,
              type: pattern.patternType,
              domain: pattern.qeDomain,
            },
          });
        } else {
          printSuccess(`Pattern stored: ${pattern.name}`);
          console.log(chalk.dim(`  ID: ${pattern.id}`));
          console.log(chalk.dim(`  Domain: ${pattern.qeDomain}`));
          console.log(chalk.dim(`  Tier: ${pattern.tier}`));
        }
      } catch (error) {
        printError(`learn failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // search: Search for patterns
  // -------------------------------------------------------------------------
  hooks
    .command('search')
    .description('Search for patterns in the reasoning bank')
    .requiredOption('-q, --query <query>', 'Search query')
    .option('-l, --limit <n>', 'Maximum results', '10')
    .option('-d, --domain <domain>', 'Filter by domain')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();

        const result = await reasoningBank.searchPatterns(options.query, {
          limit: parseInt(options.limit, 10),
          domain: options.domain as QEDomain,
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const patterns = result.value;

        if (options.json) {
          printJson({
            query: options.query,
            total: patterns.length,
            patterns: patterns.map((p) => ({
              id: p.pattern.id,
              name: p.pattern.name,
              score: p.score,
              domain: p.pattern.qeDomain,
              matchType: p.matchType,
            })),
          });
        } else {
          console.log(chalk.bold(`\n🔍 Search Results for "${options.query}"\n`));

          if (patterns.length === 0) {
            console.log(chalk.dim('  No patterns found'));
          } else {
            patterns.forEach((p, i) => {
              console.log(
                `${chalk.cyan(`${i + 1}.`)} ${p.pattern.name} ${chalk.dim(`(${(p.score * 100).toFixed(1)}%)`)}`
              );
              console.log(chalk.dim(`   Domain: ${p.pattern.qeDomain}`));
              console.log(chalk.dim(`   Match: ${p.matchType}`));
              console.log(chalk.dim(`   ID: ${p.pattern.id}`));
              console.log();
            });
          }

          console.log(chalk.dim(`Found ${patterns.length} pattern(s)`));
        }
      } catch (error) {
        printError(`search failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // session-start: Initialize session state (called by SessionStart hook)
  // -------------------------------------------------------------------------
  hooks
    .command('session-start')
    .description('Initialize session state when Claude Code session starts')
    .option('-s, --session-id <id>', 'Session ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const sessionId = options.sessionId || `session-${Date.now()}`;
        state.sessionId = sessionId;

        // Initialize hooks system (lazy)
        const { reasoningBank } = await getHooksSystem();

        // Get initial stats for context
        const stats = await reasoningBank.getStats();

        // Initialize dream scheduler state for this session
        const projectRoot = findProjectRoot();
        const dataDir = path.join(projectRoot, '.agentic-qe');
        const memoryBackend = await createHybridBackendWithTimeout(dataDir);

        // Load existing dream state or create fresh one
        let dreamState = await memoryBackend.get<DreamHookState>(DREAM_STATE_KEY);
        const isNewSession = !dreamState || !dreamState.sessionStartTime;

        if (!dreamState) {
          dreamState = {
            lastDreamTime: null,
            experienceCount: 0,
            sessionStartTime: new Date().toISOString(),
            totalDreamsThisSession: 0,
          };
        } else {
          // Reset session counters but preserve lastDreamTime across sessions
          dreamState.sessionStartTime = new Date().toISOString();
          dreamState.totalDreamsThisSession = 0;
          // Don't reset experienceCount — carry over unfulfilled experiences
        }

        await memoryBackend.set(DREAM_STATE_KEY, dreamState);

        // Build context injection for Claude
        const contextParts: string[] = [];
        contextParts.push(`AQE Learning: ${stats.totalPatterns} patterns loaded`);

        // Top domains by pattern count
        const domainEntries = Object.entries(stats.byDomain)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);
        if (domainEntries.length > 0) {
          contextParts.push(`Top domains: ${domainEntries.map(([d, c]) => `${d}(${c})`).join(', ')}`);
        }

        if (stats.patternSuccessRate > 0) {
          contextParts.push(`Pattern success rate: ${(stats.patternSuccessRate * 100).toFixed(0)}%`);
        }
        if (stats.routingRequests > 0) {
          contextParts.push(`Routing confidence: ${(stats.avgRoutingConfidence * 100).toFixed(0)}% across ${stats.routingRequests} requests`);
        }

        const additionalContext = contextParts.join('. ') + '.';

        if (options.json) {
          printJson({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext,
            },
            sessionId,
            initialized: true,
            patternsLoaded: stats.totalPatterns,
            dreamScheduler: {
              enabled: true,
              lastDreamTime: dreamState.lastDreamTime,
              pendingExperiences: dreamState.experienceCount,
            },
          });
        } else {
          printSuccess(`Session started: ${sessionId}`);
          console.log(chalk.dim(`  Patterns loaded: ${stats.totalPatterns}`));
          console.log(chalk.dim(`  Dream scheduler: enabled (${dreamState.experienceCount} pending experiences)`));
        }

        process.exit(0);
      } catch (error) {
        // Don't fail the hook - just log and exit cleanly
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        process.exit(0); // Exit cleanly even on error (continueOnError)
      }
    });

  // -------------------------------------------------------------------------
  // session-end: Save session state (called by Stop hook)
  // -------------------------------------------------------------------------
  hooks
    .command('session-end')
    .description('Save session state when Claude Code session ends')
    .option('--save-state', 'Save learning state to disk')
    .option('--export-metrics', 'Export session metrics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const sessionId = state.sessionId || 'unknown';

        // Get final stats if system is already initialized (don't init just for shutdown)
        let stats = null;
        if (state.initialized && state.reasoningBank) {
          try {
            stats = await state.reasoningBank.getStats();
          } catch {
            // Ignore - system may not be available during shutdown
          }
        }

        if (options.json) {
          const summary = stats
            ? `Session complete: ${stats.totalPatterns} patterns, ${stats.routingRequests} routings, ${(stats.patternSuccessRate * 100).toFixed(0)}% success rate`
            : 'Session complete';

          // Stop hooks don't support hookSpecificOutput — only simple fields
          printJson({
            continue: true,
            sessionId,
            stateSaved: options.saveState || false,
            metricsExported: options.exportMetrics || false,
            finalStats: stats ? {
              patternsLearned: stats.totalPatterns,
              routingRequests: stats.routingRequests,
              successRate: stats.patternSuccessRate,
            } : null,
          });
        } else {
          printSuccess(`Session ended: ${sessionId}`);
          if (stats) {
            console.log(chalk.dim(`  Patterns: ${stats.totalPatterns}`));
            console.log(chalk.dim(`  Routing requests: ${stats.routingRequests}`));
          }
        }

        process.exit(0);
      } catch (error) {
        // Don't fail the hook - just exit cleanly
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        process.exit(0);
      }
    });

  // -------------------------------------------------------------------------
  // pre-task: Get guidance before spawning a Task (called by PreToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('pre-task')
    .description('Get context and guidance before spawning a Task agent')
    .option('--task-id <id>', 'Task identifier')
    .option('-d, --description <desc>', 'Task description')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { reasoningBank } = await getHooksSystem();

        // Route the task to get agent recommendation
        let routing = null;
        if (options.description) {
          const result = await reasoningBank.routeTask({
            task: options.description,
          });
          if (result.success) {
            routing = result.value;
          }
        }

        if (options.json) {
          printJson({
            success: true,
            taskId: options.taskId,
            description: options.description,
            recommendedAgent: routing?.recommendedAgent,
            confidence: routing?.confidence,
            guidance: routing?.guidance || [],
          });
        } else {
          console.log(chalk.bold('\n🚀 Pre-Task Analysis'));
          console.log(chalk.dim(`  Task ID: ${options.taskId || 'N/A'}`));
          if (routing) {
            console.log(chalk.bold('\n🎯 Recommended:'), chalk.cyan(routing.recommendedAgent));
            console.log(chalk.dim(`  Confidence: ${(routing.confidence * 100).toFixed(1)}%`));
          }
        }

        process.exit(0);
      } catch (error) {
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        process.exit(0);
      }
    });

  // -------------------------------------------------------------------------
  // post-task: Record task outcome for learning (called by PostToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('post-task')
    .description('Record task outcome for pattern learning')
    .option('--task-id <id>', 'Task identifier')
    .option('--success <bool>', 'Whether task succeeded', 'true')
    .option('--agent <name>', 'Agent that executed the task')
    .option('--duration <ms>', 'Task duration in milliseconds')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const success = options.success === 'true' || options.success === true;

        // Initialize hooks system and record learning outcome
        // BUG FIX: Must call getHooksSystem() FIRST to initialize, not check state.initialized
        let patternsLearned = 0;
        let dreamResult: { triggered: boolean; reason?: string; insightsGenerated?: number } = { triggered: false };

        try {
          // Initialize system (creates ReasoningBank and HookRegistry)
          const { hookRegistry, reasoningBank } = await getHooksSystem();

          // Emit learning event for task completion
          const results = await hookRegistry.emit(QE_HOOK_EVENTS.QEAgentCompletion, {
            taskId: options.taskId,
            success,
            agent: options.agent,
            duration: options.duration ? parseInt(options.duration, 10) : undefined,
            timestamp: Date.now(),
          });
          patternsLearned = results.reduce((sum, r) => sum + (r.patternsLearned || 0), 0);

          // Record as learning experience for every post-task invocation
          if (options.taskId) {
            const agent = options.agent || 'unknown';
            await reasoningBank.recordOutcome({
              patternId: `task:${agent}:${options.taskId}`,
              success,
              metrics: {
                executionTimeMs: options.duration ? parseInt(options.duration, 10) : 0,
              },
              feedback: `Agent: ${agent}, Task: ${options.taskId}`,
            });
          }

          // Record experience for dream scheduler and check if dream should trigger
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          const expCount = await incrementDreamExperience(memoryBackend);

          // Check if dream cycle should be triggered
          // Always check — time-based triggers need every invocation, and the
          // check itself is lightweight (just reads state + compares timestamps)
          dreamResult = await checkAndTriggerDream(memoryBackend);
        } catch (initError) {
          // Log but don't fail - learning is best-effort
          console.error(chalk.dim(`[hooks] Learning init: ${initError instanceof Error ? initError.message : 'unknown'}`));
        }

        if (options.json) {
          printJson({
            success: true,
            taskId: options.taskId,
            taskSuccess: success,
            patternsLearned,
            dreamTriggered: dreamResult.triggered,
            dreamReason: dreamResult.reason,
            dreamInsights: dreamResult.insightsGenerated,
          });
        } else {
          printSuccess(`Task completed: ${options.taskId || 'unknown'}`);
          console.log(chalk.dim(`  Success: ${success}`));
          if (patternsLearned > 0) {
            console.log(chalk.green(`  Patterns learned: ${patternsLearned}`));
          }
          if (dreamResult.triggered) {
            console.log(chalk.blue(`  🌙 Dream cycle triggered (${dreamResult.reason}): ${dreamResult.insightsGenerated} insights`));
          }
        }

        process.exit(0);
      } catch (error) {
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        process.exit(0);
      }
    });

  // -------------------------------------------------------------------------
  // guard: File guardian - block edits to protected files (PreToolUse)
  // -------------------------------------------------------------------------
  hooks
    .command('guard')
    .description('File guardian - block edits to protected files')
    .requiredOption('-f, --file <path>', 'File path to check')
    .option('--json', 'Output as JSON (required for hook API)')
    .action(async (options) => {
      try {
        const filePath = options.file || '';
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Protected file patterns
        const protectedPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /^\.env($|\.)/, reason: 'Environment file contains secrets' },
          { pattern: /\.env\.[a-zA-Z]+$/, reason: 'Environment file contains secrets' },
          { pattern: /\.lock$/, reason: 'Lock files are auto-generated' },
          { pattern: /(^|\/)node_modules\//, reason: 'node_modules is managed by package manager' },
          { pattern: /(^|\/)\.agentic-qe\/memory\.db/, reason: 'AQE memory database must not be directly edited' },
          { pattern: /(^|\/)\.agentic-qe\/memory\.db-wal$/, reason: 'AQE WAL file must not be directly edited' },
          { pattern: /(^|\/)\.agentic-qe\/memory\.db-shm$/, reason: 'AQE shared memory file must not be directly edited' },
        ];

        const match = protectedPatterns.find(p => p.pattern.test(normalizedPath));

        if (match) {
          // Deny - use Claude Code hookSpecificOutput API format
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: `Protected file: ${match.reason} (${filePath})`,
              },
            });
          } else {
            printError(`Blocked: ${match.reason} (${filePath})`);
          }
        } else {
          // Allow
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
              },
            });
          } else {
            printSuccess(`Allowed: ${filePath}`);
          }
        }

        process.exit(0);
      } catch (error) {
        // On error, allow (fail-open for non-critical guard)
        if (options.json) {
          printJson({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow',
            },
          });
        }
        process.exit(0);
      }
    });

  // -------------------------------------------------------------------------
  // pre-command: Get guidance before Bash command (called by PreToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('pre-command')
    .description('Get context before executing a Bash command')
    .option('-c, --command <cmd>', 'Command to be executed')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const command = options.command || '';

        // Dangerous command patterns that should be BLOCKED
        const dangerousPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?-[a-zA-Z]*r[a-zA-Z]*\s+\/(?!\w)/, reason: 'Recursive delete of root filesystem' },
          { pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?-[a-zA-Z]*f[a-zA-Z]*\s+\/(?!\w)/, reason: 'Recursive delete of root filesystem' },
          { pattern: /rm\s+-rf\s+~/, reason: 'Recursive delete of home directory' },
          { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i, reason: 'Destructive SQL operation' },
          { pattern: /git\s+push\s+.*--force(?!-)/, reason: 'Force push can overwrite remote history' },
          { pattern: /git\s+reset\s+--hard/, reason: 'Hard reset discards uncommitted changes' },
          { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Direct write to block device' },
          { pattern: /dd\s+if=.*of=\/dev\/sd/, reason: 'Direct disk write via dd' },
          { pattern: /chmod\s+777\s/, reason: 'World-writable permissions are a security risk' },
          { pattern: /:\(\)\s*\{\s*:\|\s*:&\s*\}\s*;?\s*:/, reason: 'Fork bomb detected' },
          { pattern: /mkfs\./, reason: 'Filesystem format operation' },
          { pattern: />\s*\/dev\/null\s*2>&1\s*&\s*disown/, reason: 'Stealth background process' },
        ];

        // Warning patterns (inform but don't block)
        const warningPatterns: Array<{ pattern: RegExp; reason: string }> = [
          { pattern: /\.agentic-qe.*rm/, reason: 'Deleting AQE data files' },
          { pattern: /rm\s+-rf\s/, reason: 'Recursive force delete' },
          { pattern: /git\s+clean\s+-[a-zA-Z]*f/, reason: 'Force cleaning untracked files' },
        ];

        const dangerMatch = dangerousPatterns.find(p => p.pattern.test(command));
        const warnings = warningPatterns
          .filter(p => p.pattern.test(command))
          .map(p => p.reason);

        if (dangerMatch) {
          // BLOCK the command
          if (options.json) {
            printJson({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: `Dangerous command blocked: ${dangerMatch.reason}`,
              },
            });
          } else {
            printError(`Blocked: ${dangerMatch.reason}`);
          }
        } else {
          // Allow (with optional warnings as context)
          if (options.json) {
            const result: Record<string, unknown> = {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
              },
            };
            if (warnings.length > 0) {
              (result.hookSpecificOutput as Record<string, unknown>).additionalContext =
                `Warnings: ${warnings.join('; ')}`;
            }
            printJson(result);
          } else if (warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Command Warnings:'));
            warnings.forEach(w => console.log(chalk.yellow(`  - ${w}`)));
          }
        }

        process.exit(0);
      } catch (error) {
        // Fail-open on error
        if (options.json) {
          printJson({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow',
            },
          });
        }
        process.exit(0);
      }
    });

  // -------------------------------------------------------------------------
  // post-command: Record command outcome (called by PostToolUse hook)
  // -------------------------------------------------------------------------
  hooks
    .command('post-command')
    .description('Record Bash command outcome')
    .option('-c, --command <cmd>', 'Command that was executed')
    .option('--success <bool>', 'Whether command succeeded', 'true')
    .option('--exit-code <code>', 'Command exit code')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const success = options.success === 'true' || options.success === true;
        const exitCode = options.exitCode ? parseInt(options.exitCode, 10) : (success ? 0 : 1);
        const command = (options.command || '').substring(0, 200);

        // Determine if this is a test/build/lint command for richer learning
        const isTestCmd = /\b(test|vitest|jest|pytest|mocha)\b/i.test(command);
        const isBuildCmd = /\b(build|compile|tsc)\b/i.test(command);
        const isLintCmd = /\b(lint|eslint|prettier)\b/i.test(command);

        let patternsLearned = 0;
        let experienceRecorded = false;

        try {
          const { reasoningBank } = await getHooksSystem();

          // For test commands, emit TestExecutionResult for pattern learning
          if (isTestCmd) {
            const { hookRegistry } = await getHooksSystem();
            await hookRegistry.emit(QE_HOOK_EVENTS.TestExecutionResult, {
              runId: `cmd-${Date.now()}`,
              patternId: `cmd:test:${command.split(/\s+/).slice(0, 3).join('-')}`,
              passed: success ? 1 : 0,
              failed: success ? 0 : 1,
              duration: 0,
              flaky: false,
            });
          }

          // Record outcome for all commands
          const cmdSlug = command.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 80);
          const domain = isTestCmd ? 'test-execution' : isBuildCmd ? 'code-intelligence' : isLintCmd ? 'quality-assessment' : 'code-intelligence';
          await reasoningBank.recordOutcome({
            patternId: `cmd:${cmdSlug}`,
            success,
            metrics: { executionTimeMs: 0 },
            feedback: `Command: ${command}, exit: ${exitCode}`,
          });
          patternsLearned = 1;

          // Persist as captured experience
          await persistCommandExperience({
            task: `bash: ${command}`,
            agent: 'cli-hook',
            domain,
            success,
            source: 'cli-hook-post-command',
          });
          experienceRecorded = true;

          // Increment dream experience counter
          const projectRoot = findProjectRoot();
          const dataDir = path.join(projectRoot, '.agentic-qe');
          const memoryBackend = await createHybridBackendWithTimeout(dataDir);
          await incrementDreamExperience(memoryBackend);
        } catch (initError) {
          console.error(chalk.dim(`[hooks] post-command learning: ${initError instanceof Error ? initError.message : 'unknown'}`));
        }

        if (options.json) {
          printJson({
            success: true,
            command: command.substring(0, 100),
            commandSuccess: success,
            exitCode,
            patternsLearned,
            experienceRecorded,
          });
        }
        // Silent in non-JSON mode to avoid cluttering output

        process.exit(0);
      } catch (error) {
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        process.exit(0);
      }
    });

  return hooks;
}

// ============================================================================
// Exports
// ============================================================================

export {
  getHooksSystem,
  state as hooksState,
  QE_HOOK_EVENTS,
  type HooksSystemState,
};
