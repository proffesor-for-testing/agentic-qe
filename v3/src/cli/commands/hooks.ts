#!/usr/bin/env node

/**
 * Agentic QE v3 - Hooks Commands
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Self-learning hooks system for pattern recognition and guidance generation.
 * This module provides CLI commands for the QE hooks system.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import {
  QEReasoningBank,
  createQEReasoningBank,
  QERoutingRequest,
} from '../../learning/qe-reasoning-bank.js';
import {
  QEHookRegistry,
  QE_HOOK_EVENTS,
  setupQEHooks,
  QEHookResult,
} from '../../learning/qe-hooks.js';
import { QEDomain } from '../../learning/qe-patterns.js';
import { HybridMemoryBackend } from '../../kernel/hybrid-backend.js';
import type { MemoryBackend } from '../../kernel/interfaces.js';

// ============================================================================
// Hooks State Management
// ============================================================================

/**
 * Singleton state for hooks system
 */
interface HooksSystemState {
  reasoningBank: QEReasoningBank | null;
  hookRegistry: QEHookRegistry | null;
  sessionId: string | null;
  initialized: boolean;
  initializationPromise: Promise<void> | null;
}

const state: HooksSystemState = {
  reasoningBank: null,
  hookRegistry: null,
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
    // Create memory backend
    const cwd = process.cwd();
    const dataDir = path.join(cwd, '.agentic-qe');

    // Use hybrid backend with timeout protection
    const memoryBackend = await createHybridBackendWithTimeout(dataDir);

    // Create reasoning bank
    state.reasoningBank = createQEReasoningBank(memoryBackend, undefined, {
      enableLearning: true,
      enableGuidance: true,
      enableRouting: true,
      embeddingDimension: 128,
      useONNXEmbeddings: false, // Hash-based for ARM64 compatibility
    });

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
  aqe hooks pre-edit --file src/utils.ts --operation create
  aqe hooks post-edit --file src/utils.ts --success
  aqe hooks route --task "Generate tests for UserService"
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
          printJson({
            success: result.success,
            file: options.file,
            operation: options.operation,
            guidance: result.guidance || [],
            recommendedAgent: result.routing?.recommendedAgent,
            confidence: result.routing?.confidence,
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

        const results = await hookRegistry.emit(QE_HOOK_EVENTS.PostTestGeneration, {
          targetFile: options.file,
          success,
          patternId: options.patternId,
          generatedTests: null,
          testCount: 0,
        });

        const result = results[0] || { success: true, patternsLearned: 0 };

        if (options.json) {
          printJson({
            success: true,
            file: options.file,
            editSuccess: success,
            patternsLearned: result.patternsLearned || 0,
          });
        } else {
          printSuccess(`Recorded edit outcome for ${options.file}`);
          if (result.patternsLearned) {
            console.log(chalk.green(`  Patterns learned: ${result.patternsLearned}`));
          }
        }
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
          data = JSON.parse(options.data);
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
