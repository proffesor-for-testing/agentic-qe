#!/usr/bin/env npx tsx
/**
 * Query Codebase Script
 *
 * Search the indexed codebase using semantic search.
 * Usage: npx tsx scripts/query-codebase.ts "your search query"
 */

import chalk from 'chalk';
import { CodeIntelligenceOrchestrator } from '../src/code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js';

async function queryCodebase(query: string): Promise<void> {
  console.log(chalk.cyan(`\n🔍 Searching: "${query}"\n`));

  const orchestrator = new CodeIntelligenceOrchestrator({
    rootDir: process.cwd(),
    watchEnabled: false,
    gitEnabled: false,
    database: {
      enabled: true,
      host: 'localhost',
      port: 5432,
      database: 'ruvector_db',
      user: 'ruvector',
      password: 'ruvector',
    },
  });

  try {
    await orchestrator.initialize();

    const result = await orchestrator.query({
      query,
      topK: 10,
      includeGraphContext: true,
      graphDepth: 2,
    });

    if (result.results.length === 0) {
      console.log(chalk.yellow('No results found.\n'));
    } else {
      console.log(chalk.green(`Found ${result.results.length} results (${result.metadata?.searchTimeMs || 0}ms):\n`));

      for (let i = 0; i < result.results.length; i++) {
        const r = result.results[i];
        const file = r.filePath.replace(process.cwd(), '').replace(/^\//, '');

        console.log(chalk.white.bold(`${i + 1}. ${r.entityName || file}`));
        console.log(chalk.gray(`   File: ${file}:${r.startLine}-${r.endLine}`));
        console.log(chalk.gray(`   Type: ${r.entityType || 'chunk'} | Score: ${r.score.toFixed(4)}`));

        // Show preview
        const preview = r.content.substring(0, 150).replace(/\n/g, ' ').trim();
        console.log(chalk.dim(`   ${preview}...`));
        console.log();
      }
    }

    await orchestrator.shutdown();
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
    await orchestrator.shutdown();
    process.exit(1);
  }
}

// Get query from command line
const query = process.argv.slice(2).join(' ') || 'BaseAgent initialization';
queryCodebase(query);
