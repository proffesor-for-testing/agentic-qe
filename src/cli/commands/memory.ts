/**
 * Agentic QE v3 - Memory CLI Commands
 *
 * CLI interface for memory store/get/search/delete/share operations.
 * Provides CLI parity with MCP memory_store, memory_retrieve, memory_query,
 * memory_delete, and memory_share tools to reduce MCP dependency in agents/skills.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';

export function createMemoryCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const memory = new Command('memory')
    .description('Memory store, retrieve, search, and delete operations')
    .addHelpText('after', `
Examples:
  # Store a value
  aqe memory store --key "auth-pattern" --value "JWT with refresh tokens" --namespace patterns

  # Retrieve a value
  aqe memory get --key "auth-pattern" --namespace patterns

  # Search by pattern (glob)
  aqe memory search --pattern "auth*" --namespace patterns

  # Search semantically (natural language)
  aqe memory search --query "authentication patterns" --semantic

  # List all entries in a namespace
  aqe memory list --namespace patterns --limit 20

  # Delete a key
  aqe memory delete --key "auth-pattern" --namespace patterns

  # Share knowledge between agents
  aqe memory share --from agent-1 --to agent-2,agent-3 --domain testing --content '{"finding": "flaky"}'

  # Show usage stats
  aqe memory usage
`);

  // ── store ──────────────────────────────────────────────────────────────
  memory
    .command('store')
    .description('Store a key-value pair in memory')
    .requiredOption('--key <key>', 'Memory key')
    .requiredOption('--value <value>', 'Value to store (string or JSON)')
    .option('--namespace <ns>', 'Namespace for grouping', 'default')
    .option('--ttl <seconds>', 'Time-to-live in seconds')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryStore } = await import('../../mcp/handlers/memory-handlers.js');

        // Try to parse value as JSON, otherwise store as string
        let value: unknown = options.value;
        try { value = JSON.parse(options.value); } catch { /* keep as string */ }

        const result = await handleMemoryStore({
          key: options.key,
          value,
          namespace: options.namespace,
          ttl: options.ttl ? parseInt(options.ttl, 10) : undefined,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success) {
          console.log(chalk.green(`  ✓ Stored "${options.key}" in namespace "${options.namespace}"`));
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────
  memory
    .command('get')
    .description('Retrieve a value by key')
    .requiredOption('--key <key>', 'Memory key to retrieve')
    .option('--namespace <ns>', 'Namespace', 'default')
    .option('--include-metadata', 'Include metadata in response')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryRetrieve } = await import('../../mcp/handlers/memory-handlers.js');

        const result = await handleMemoryRetrieve({
          key: options.key,
          namespace: options.namespace,
          includeMetadata: options.includeMetadata,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.data) {
          if (result.data.found) {
            const val = typeof result.data.value === 'string'
              ? result.data.value
              : JSON.stringify(result.data.value, null, 2);
            console.log(chalk.green(`  ${options.key}`) + chalk.gray(` [${options.namespace}]`));
            console.log(`  ${val}`);
          } else {
            console.log(chalk.yellow(`  Key "${options.key}" not found in namespace "${options.namespace}"`));
          }
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  // ── search ──────────────────────────────────────────────────────────────
  memory
    .command('search')
    .description('Search memory by pattern (glob) or semantic query')
    .option('--pattern <glob>', 'Glob pattern to match keys (e.g., "auth*")')
    .option('--query <text>', 'Natural language query (implies --semantic)')
    .option('--semantic', 'Use HNSW vector search for semantic matching')
    .option('--namespace <ns>', 'Namespace to search in', 'default')
    .option('--limit <n>', 'Maximum results', '20')
    .option('--offset <n>', 'Skip first N results', '0')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!options.pattern && !options.query) {
        console.error(chalk.red('  Either --pattern or --query is required'));
        await cleanupAndExit(1);
      }

      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryQuery } = await import('../../mcp/handlers/memory-handlers.js');

        const searchPattern = options.query || options.pattern;
        const useSemantic = options.semantic || !!options.query;

        const result = await handleMemoryQuery({
          pattern: searchPattern,
          namespace: options.namespace,
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
          semantic: useSemantic,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.data) {
          const { entries, total, searchType } = result.data;
          console.log(chalk.blue(`  ${total} result(s) via ${searchType} search\n`));
          for (const entry of entries) {
            const score = entry.score !== undefined ? chalk.gray(` (score: ${entry.score.toFixed(3)})`) : '';
            console.log(`  ${chalk.green(entry.key)} ${chalk.gray(`[${entry.namespace}]`)}${score}`);
          }
          if (result.data.hasMore) {
            console.log(chalk.gray(`\n  ... and more. Use --offset ${parseInt(options.offset, 10) + parseInt(options.limit, 10)} to see next page`));
          }
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  // ── list ────────────────────────────────────────────────────────────────
  memory
    .command('list')
    .description('List all memory entries in a namespace')
    .option('--namespace <ns>', 'Namespace to list', 'default')
    .option('--limit <n>', 'Maximum results', '50')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryQuery } = await import('../../mcp/handlers/memory-handlers.js');

        const result = await handleMemoryQuery({
          pattern: '*',
          namespace: options.namespace,
          limit: parseInt(options.limit, 10),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.data) {
          console.log(chalk.blue(`  ${result.data.total} entries in namespace "${options.namespace}"\n`));
          for (const entry of result.data.entries) {
            console.log(`  ${chalk.green(entry.key)}`);
          }
          if (result.data.hasMore) {
            console.log(chalk.gray(`\n  ... more entries exist. Use --limit to see more.`));
          }
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  // ── delete ──────────────────────────────────────────────────────────────
  memory
    .command('delete')
    .description('Delete a memory entry by key')
    .requiredOption('--key <key>', 'Memory key to delete')
    .option('--namespace <ns>', 'Namespace', 'default')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryDelete } = await import('../../mcp/handlers/memory-handlers.js');

        const result = await handleMemoryDelete({
          key: options.key,
          namespace: options.namespace,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.data) {
          if (result.data.deleted) {
            console.log(chalk.green(`  ✓ Deleted "${options.key}" from namespace "${options.namespace}"`));
          } else {
            console.log(chalk.yellow(`  Key "${options.key}" not found in namespace "${options.namespace}"`));
          }
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  // ── share ───────────────────────────────────────────────────────────────
  memory
    .command('share')
    .description('Share knowledge between agents')
    .requiredOption('--from <agentId>', 'Source agent ID')
    .requiredOption('--to <agentIds>', 'Comma-separated target agent IDs')
    .requiredOption('--domain <domain>', 'Knowledge domain')
    .requiredOption('--content <json>', 'JSON content to share')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryShare } = await import('../../mcp/handlers/memory-handlers.js');

        let content: Record<string, unknown>;
        try {
          content = JSON.parse(options.content);
        } catch {
          console.error(chalk.red('  --content must be valid JSON'));
          await cleanupAndExit(1);
          return; // unreachable but satisfies TS
        }

        const targetIds = options.to.split(',').map((s: string) => s.trim());

        const result = await handleMemoryShare({
          sourceAgentId: options.from,
          targetAgentIds: targetIds,
          knowledgeDomain: options.domain,
          knowledgeContent: content,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.data) {
          console.log(chalk.green(`  ✓ Shared knowledge from ${result.data.sourceAgent} to ${result.data.targetAgents.join(', ')}`));
          console.log(chalk.gray(`    Domain: ${result.data.domain}`));
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  // ── usage ───────────────────────────────────────────────────────────────
  memory
    .command('usage')
    .description('Show memory usage statistics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const { handleMemoryUsage } = await import('../../mcp/handlers/memory-handlers.js');

        const result = await handleMemoryUsage();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success && result.data) {
          console.log(chalk.blue('  Memory Usage\n'));
          console.log(`  Entries:    ${chalk.green(String(result.data.entries))}`);
          console.log(`  Vectors:    ${chalk.green(String(result.data.vectors))}`);
          console.log(`  Namespaces: ${chalk.green(String(result.data.namespaces))}`);
        } else {
          console.error(chalk.red(`  ✗ ${result.error}`));
          await cleanupAndExit(1);
        }
      } catch (error) {
        console.error(chalk.red(`  Error: ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  return memory;
}
