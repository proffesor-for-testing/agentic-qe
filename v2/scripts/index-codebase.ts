#!/usr/bin/env npx tsx
/**
 * Index Codebase Script
 *
 * Uses the Code Intelligence System to index the full project codebase
 * and persist the data in RuVector PostgreSQL.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { CodeIntelligenceOrchestrator } from '../src/code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js';
import type { IndexingProgress } from '../src/code-intelligence/orchestrator/types.js';

async function indexCodebase(): Promise<void> {
  console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║       Code Intelligence - Full Codebase Indexing             ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════════╝\n'));

  const rootDir = process.cwd();
  const startTime = Date.now();

  // Initialize orchestrator
  const spinner = ora('Initializing Code Intelligence System...').start();

  const orchestrator = new CodeIntelligenceOrchestrator({
    rootDir,
    watchEnabled: false,
    gitEnabled: true,
    ollamaUrl: 'http://localhost:11434',
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
    spinner.succeed('Code Intelligence System initialized');

    // Get initial stats
    const initialStats = orchestrator.getStats();
    console.log(chalk.gray(`\n📊 Initial state: ${initialStats.indexer.totalChunks} chunks, ${initialStats.graph.nodeCount} nodes\n`));

    // Index the src directory
    const indexSpinner = ora('Indexing src/ directory...').start();
    let lastProgress: IndexingProgress | null = null;

    const result = await orchestrator.indexProject(path.join(rootDir, 'src'), (progress) => {
      lastProgress = progress;
      const pct = progress.totalFiles > 0
        ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
        : 0;
      indexSpinner.text = `Indexing: ${progress.processedFiles}/${progress.totalFiles} files (${pct}%) - ${progress.chunksCreated} chunks`;
    });

    indexSpinner.succeed(`Indexed ${result.stats.filesIndexed} files`);

    // Get final stats
    const finalStats = orchestrator.getStats();

    // Print summary
    console.log(chalk.green.bold('\n╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.green.bold('║                    INDEXING COMPLETE                         ║'));
    console.log(chalk.green.bold('╠══════════════════════════════════════════════════════════════╣'));
    console.log(chalk.white(`║ 📁 Files Indexed:        ${String(result.stats.filesIndexed).padStart(6)}                           ║`));
    console.log(chalk.white(`║ ✂️  Chunks Created:       ${String(result.stats.chunksCreated).padStart(6)}                           ║`));
    console.log(chalk.white(`║ 🧠 Embeddings Generated: ${String(result.stats.embeddingsGenerated).padStart(6)}                           ║`));
    console.log(chalk.white(`║ 📊 Graph Nodes:          ${String(result.stats.nodesCreated).padStart(6)}                           ║`));
    console.log(chalk.white(`║ 🔗 Graph Edges:          ${String(result.stats.edgesCreated).padStart(6)}                           ║`));
    console.log(chalk.white(`║ ⏱️  Total Time:           ${String(Math.round(result.stats.totalTimeMs / 1000) + 's').padStart(6)}                           ║`));
    console.log(chalk.green.bold('╠══════════════════════════════════════════════════════════════╣'));
    console.log(chalk.white(`║ 💾 Total Chunks in DB:   ${String(finalStats.indexer.totalChunks).padStart(6)}                           ║`));
    console.log(chalk.white(`║ 🌳 Total Graph Nodes:    ${String(finalStats.graph.nodeCount).padStart(6)}                           ║`));
    console.log(chalk.white(`║ 🔗 Total Graph Edges:    ${String(finalStats.graph.edgeCount).padStart(6)}                           ║`));
    console.log(chalk.green.bold('╚══════════════════════════════════════════════════════════════╝'));

    // Show node breakdown
    if (finalStats.graph.nodesByType) {
      console.log(chalk.cyan('\n📊 Nodes by Type:'));
      for (const [type, count] of Object.entries(finalStats.graph.nodesByType)) {
        console.log(chalk.gray(`   ${type}: ${count}`));
      }
    }

    // Test a sample search
    console.log(chalk.cyan('\n🔍 Testing sample search: "BaseAgent code intelligence"'));
    const searchResult = await orchestrator.query({
      query: 'BaseAgent code intelligence',
      topK: 5,
      includeGraphContext: true,
      graphDepth: 2,
    });

    if (searchResult.results.length > 0) {
      console.log(chalk.green(`   ✅ Found ${searchResult.results.length} results in ${searchResult.metadata?.searchTimeMs || 0}ms`));
      console.log(chalk.gray(`   Top result: ${searchResult.results[0].entityName || path.basename(searchResult.results[0].filePath)} (score: ${searchResult.results[0].score.toFixed(4)})`));
    } else {
      console.log(chalk.yellow('   ⚠️  No results found'));
    }

    // Cleanup
    await orchestrator.shutdown();

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(chalk.green.bold(`\n✅ Codebase indexing complete in ${totalTime}s\n`));

  } catch (error) {
    spinner.fail('Failed to index codebase');
    console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
    await orchestrator.shutdown();
    process.exit(1);
  }
}

// Run
indexCodebase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
