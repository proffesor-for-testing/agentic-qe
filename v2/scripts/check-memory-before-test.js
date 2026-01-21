#!/usr/bin/env node

/**
 * Pre-Test Memory Check Script
 * Validates available system memory before running tests
 */

const os = require('os');
const chalk = require('chalk');

const MIN_REQUIRED_MB = 512; // Minimum free memory required
const RECOMMENDED_MB = 1024; // Recommended free memory

function checkMemory() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  const totalGB = (totalMemory / 1024 / 1024 / 1024).toFixed(2);
  const freeGB = (freeMemory / 1024 / 1024 / 1024).toFixed(2);
  const freeMB = (freeMemory / 1024 / 1024).toFixed(0);
  const usedPercent = ((usedMemory / totalMemory) * 100).toFixed(1);

  console.log('\n🔍 Pre-Test Memory Check:\n');
  console.log(`  Total Memory:     ${totalGB}GB`);
  console.log(`  Free Memory:      ${freeGB}GB (${freeMB}MB)`);
  console.log(`  Memory Usage:     ${usedPercent}%`);
  console.log(`  Node Max Old:     ${process.env.NODE_OPTIONS || 'default'}\n`);

  // Check minimum requirements
  if (freeMemory / 1024 / 1024 < MIN_REQUIRED_MB) {
    console.error(chalk.red(`❌ ERROR: Insufficient memory to run tests safely!`));
    console.error(chalk.red(`   Required: ${MIN_REQUIRED_MB}MB, Available: ${freeMB}MB\n`));
    console.log(chalk.yellow('💡 Suggestions:'));
    console.log(chalk.yellow('   1. Close unnecessary applications'));
    console.log(chalk.yellow('   2. Run tests in smaller batches'));
    console.log(chalk.yellow('   3. Use: npm run test:unit-only (lower memory)\n'));
    process.exit(1);
  }

  // Warn if below recommended
  if (freeMemory / 1024 / 1024 < RECOMMENDED_MB) {
    console.warn(chalk.yellow(`⚠️  WARNING: Memory is below recommended levels`));
    console.warn(chalk.yellow(`   Recommended: ${RECOMMENDED_MB}MB, Available: ${freeMB}MB`));
    console.log(chalk.yellow('   Tests may run slower or fail due to memory constraints.\n'));
    console.log(chalk.cyan('💡 Consider using:'));
    console.log(chalk.cyan('   - npm run test:safe (ultra-conservative settings)'));
    console.log(chalk.cyan('   - npm run test:unit-only (lighter memory footprint)\n'));
  } else {
    console.log(chalk.green(`✅ Memory check passed! Sufficient memory available.\n`));
  }

  // Recommend garbage collection
  if (process.execArgv.includes('--expose-gc')) {
    console.log(chalk.green('✅ Garbage collection exposed (--expose-gc)\n'));
  } else {
    console.log(chalk.yellow('💡 Consider enabling --expose-gc for better memory management\n'));
  }
}

// Run the check
try {
  checkMemory();
} catch (error) {
  console.error(chalk.red('❌ Error checking memory:'), error.message);
  process.exit(1);
}