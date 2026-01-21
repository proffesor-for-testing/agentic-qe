#!/usr/bin/env tsx
/**
 * Demo: Learning Metrics CLI
 * Populates AgentDB with sample patterns and demonstrates metrics command
 */

import { createAgentDBManager } from '../src/core/memory/AgentDBManager';
import chalk from 'chalk';

async function main() {
  console.log(chalk.blue('🧪 Demo: Learning Metrics CLI\n'));

  // Create AgentDB manager
  const agentDB = createAgentDBManager({
    dbPath: '.agentic-qe/agentdb.db'
  });

  await agentDB.initialize();
  console.log(chalk.green('✅ AgentDB initialized\n'));

  // Populate with sample patterns (simulating agent learning)
  console.log(chalk.blue('📝 Inserting sample learning patterns...\n'));

  const agentTypes = [
    'qe-test-generator',
    'qe-coverage-analyzer',
    'qe-performance-tester',
    'qe-security-scanner'
  ];

  let totalInserted = 0;

  for (const agentType of agentTypes) {
    // Insert 5-15 patterns per agent with varying confidence
    const count = Math.floor(Math.random() * 10) + 5;

    for (let i = 0; i < count; i++) {
      const confidence = 0.5 + (Math.random() * 0.5); // 0.5-1.0

      await agentDB.store({
        id: `${agentType}_pattern_${i}`,
        type: agentType,
        domain: 'test-generation',
        pattern_data: JSON.stringify({
          pattern: `Sample pattern ${i} for ${agentType}`,
          strategy: ['coverage-first', 'risk-based', 'mutation'][i % 3]
        }),
        confidence,
        usage_count: Math.floor(Math.random() * 50),
        success_count: Math.floor(Math.random() * 40),
        created_at: Date.now() / 1000,
        last_used: Date.now() / 1000
      });

      totalInserted++;
    }

    console.log(`  ✓ ${agentType}: ${count} patterns (confidence: ${chalk.cyan('50-100%')})`);
  }

  console.log(chalk.green(`\n✅ Inserted ${totalInserted} patterns total\n`));

  // Get stats
  const stats = await agentDB.getStats();
  console.log(chalk.blue('📊 Database Stats:\n'));
  console.log(`  Total Vectors: ${chalk.cyan(stats.totalVectors)}`);
  console.log(`  Dimension: ${chalk.cyan(stats.dimension)}`);
  console.log(`  Mode: ${chalk.cyan(stats.mode)}\n`);

  await agentDB.close();

  console.log(chalk.green('✅ Demo complete!\n'));
  console.log(chalk.yellow('💡 Now run:'));
  console.log(chalk.gray('   npx tsx src/cli/index.ts learn metrics'));
  console.log(chalk.gray('   npx tsx src/cli/index.ts learn metrics --days 30'));
  console.log(chalk.gray('   npx tsx src/cli/index.ts learn metrics --agent test-generator'));
  console.log();
}

main().catch(console.error);
