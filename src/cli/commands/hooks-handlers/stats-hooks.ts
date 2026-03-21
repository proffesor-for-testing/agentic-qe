/**
 * Agentic QE v3 - Stats Hooks (stats, list, emit, learn, search)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles pattern management and statistics subcommands.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { QE_HOOK_EVENTS } from '../../../learning/qe-hooks.js';
import type { QEDomain } from '../../../learning/qe-patterns.js';
import { safeJsonParse } from '../../../shared/safe-json.js';
import {
  getHooksSystem,
  printJson,
  printSuccess,
  printError,
  printGuidance,
} from './hooks-shared.js';

/**
 * Register stats, list, emit, learn, and search subcommands on the hooks command.
 */
export function registerStatsHooks(hooks: Command): void {
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
        throw error;
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
        throw error;
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
        throw error;
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
        throw error;
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
        throw error;
      }
    });
}
