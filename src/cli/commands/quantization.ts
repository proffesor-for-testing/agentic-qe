/**
 * CLI commands for Vector Quantization management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { QuantizationManager, type AgentProfile, type QuantizationType } from '../../core/quantization';

export function createQuantizationCommand(): Command {
  const cmd = new Command('quantization')
    .alias('quant')
    .description('Manage vector quantization settings and monitoring');

  // Subcommand: recommend
  cmd
    .command('recommend')
    .description('Get quantization recommendation for your use case')
    .option('-v, --vectors <number>', 'Number of vectors to store', '10000')
    .option('-m, --memory <constraint>', 'Memory constraint (low|medium|high)', 'medium')
    .option('-a, --accuracy <priority>', 'Accuracy priority (low|medium|high|critical)', 'high')
    .option('-s, --speed <priority>', 'Speed priority (low|medium|high|critical)', 'medium')
    .option('-d, --deployment <type>', 'Deployment target (cloud|edge|mobile|desktop)', 'cloud')
    .action((options) => {
      const profile: AgentProfile = {
        vectorCount: parseInt(options.vectors),
        memoryConstraint: options.memory as 'low' | 'medium' | 'high',
        accuracyPriority: options.accuracy as 'low' | 'medium' | 'high' | 'critical',
        speedPriority: options.speed as 'low' | 'medium' | 'high' | 'critical',
        deployment: options.deployment as 'cloud' | 'edge' | 'mobile' | 'desktop'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);

      console.log(chalk.bold.cyan('\n📊 Quantization Recommendation\n'));
      console.log(chalk.bold('Profile:'));
      console.log(`  Vectors: ${chalk.yellow(profile.vectorCount.toLocaleString())}`);
      console.log(`  Memory Constraint: ${chalk.yellow(profile.memoryConstraint)}`);
      console.log(`  Accuracy Priority: ${chalk.yellow(profile.accuracyPriority)}`);
      console.log(`  Speed Priority: ${chalk.yellow(profile.speedPriority)}`);
      console.log(`  Deployment: ${chalk.yellow(profile.deployment)}`);

      console.log(chalk.bold('\n✨ Recommended Type:'), chalk.green.bold(recommendation.type.toUpperCase()));
      console.log(chalk.bold('Reason:'), recommendation.reason);

      console.log(chalk.bold('\n💡 Expected Benefits:'));
      console.log(`  Memory Reduction: ${chalk.cyan(recommendation.expectedBenefits.memoryReduction)}`);
      console.log(`  Speed Increase: ${chalk.cyan(recommendation.expectedBenefits.speedIncrease)}`);
      console.log(`  Accuracy Impact: ${chalk.cyan(recommendation.expectedBenefits.accuracyImpact)}`);

      console.log(chalk.bold('\n🎯 Use Case:'), recommendation.useCase);

      console.log(chalk.bold.green('\n✅ Configuration:'));
      console.log(chalk.gray('Add to your agent config:'));
      console.log(chalk.yellow(`  quantizationType: '${recommendation.type}'`));
      console.log('');
    });

  // Subcommand: compare
  cmd
    .command('compare')
    .description('Compare all quantization types')
    .option('-v, --vectors <number>', 'Number of vectors', '10000')
    .option('-d, --dimensions <number>', 'Vector dimensions', '768')
    .action((options) => {
      const vectorCount = parseInt(options.vectors);
      const dimensions = parseInt(options.dimensions);

      const comparison = QuantizationManager.compareQuantizationTypes(vectorCount, dimensions);

      console.log(chalk.bold.cyan(`\n📊 Quantization Comparison (${vectorCount.toLocaleString()} vectors, ${dimensions}D)\n`));

      const table = new Table({
        head: [
          chalk.white.bold('Type'),
          chalk.white.bold('Memory (MB)'),
          chalk.white.bold('Reduction'),
          chalk.white.bold('Speed'),
          chalk.white.bold('Accuracy Loss'),
          chalk.white.bold('Recommended')
        ],
        colWidths: [12, 15, 12, 12, 16, 14]
      });

      for (const item of comparison) {
        table.push([
          item.recommended ? chalk.green.bold(item.type) : item.type,
          item.recommended ? chalk.green(item.memoryMB.toFixed(2)) : item.memoryMB.toFixed(2),
          item.recommended ? chalk.green(item.reduction) : item.reduction,
          item.recommended ? chalk.green(item.speedMultiplier) : item.speedMultiplier,
          item.recommended ? chalk.green(item.accuracyLoss) : item.accuracyLoss,
          item.recommended ? chalk.green.bold('✓') : chalk.gray('-')
        ]);
      }

      console.log(table.toString());
      console.log('');
    });

  // Subcommand: calculate
  cmd
    .command('calculate')
    .description('Calculate memory usage for configuration')
    .requiredOption('-v, --vectors <number>', 'Number of vectors')
    .option('-d, --dimensions <number>', 'Vector dimensions', '768')
    .option('-t, --type <type>', 'Quantization type (none|scalar|binary|product)', 'scalar')
    .action((options) => {
      const vectorCount = parseInt(options.vectors);
      const dimensions = parseInt(options.dimensions);
      const type = options.type as QuantizationType;

      const result = QuantizationManager.calculateMemoryUsage(vectorCount, dimensions, type);

      console.log(chalk.bold.cyan('\n💾 Memory Usage Calculation\n'));
      console.log(chalk.bold('Configuration:'));
      console.log(`  Vectors: ${chalk.yellow(vectorCount.toLocaleString())}`);
      console.log(`  Dimensions: ${chalk.yellow(dimensions)}`);
      console.log(`  Quantization: ${chalk.yellow(type)}`);

      console.log(chalk.bold('\n📊 Results:'));
      console.log(`  Bytes per Vector: ${chalk.cyan(result.bytesPerVector.toLocaleString())}`);
      console.log(`  Total Memory: ${chalk.cyan(result.totalMB.toFixed(2) + ' MB')}`);
      console.log(`  Reduction: ${chalk.cyan(result.reduction)}`);

      // Show comparison
      const noQuant = QuantizationManager.calculateMemoryUsage(vectorCount, dimensions, 'none');
      const savedMB = noQuant.totalMB - result.totalMB;
      const savedPercent = ((savedMB / noQuant.totalMB) * 100).toFixed(1);

      if (type !== 'none') {
        console.log(chalk.bold('\n💰 Savings:'));
        console.log(`  Memory Saved: ${chalk.green(savedMB.toFixed(2) + ' MB')} (${savedPercent}%)`);
        console.log(`  Without Quantization: ${chalk.gray(noQuant.totalMB.toFixed(2) + ' MB')}`);
      }

      console.log('');
    });

  // Subcommand: status
  cmd
    .command('status')
    .description('Show quantization status and metrics')
    .action(() => {
      const report = QuantizationManager.generateReport();
      console.log(chalk.cyan(report));

      const aggregated = QuantizationManager.getAggregatedMetrics();

      if (aggregated.totalVectors > 0) {
        // Calculate potential savings
        const currentMemory = aggregated.totalMemoryMB;
        const noQuantMemory = currentMemory * aggregated.averageMemoryReduction;
        const savedMemory = noQuantMemory - currentMemory;
        const savedPercent = ((savedMemory / noQuantMemory) * 100).toFixed(1);

        console.log(chalk.bold.green('\n💰 MEMORY SAVINGS:'));
        console.log(`  Current Usage: ${chalk.cyan(currentMemory.toFixed(2) + ' MB')}`);
        console.log(`  Without Quantization: ${chalk.gray(noQuantMemory.toFixed(2) + ' MB')}`);
        console.log(`  Saved: ${chalk.green(savedMemory.toFixed(2) + ' MB')} (${savedPercent}%)`);
        console.log('');
      }
    });

  // Subcommand: guide
  cmd
    .command('guide')
    .description('Show quantization selection guide')
    .action(() => {
      console.log(chalk.bold.cyan('\n📚 Vector Quantization Guide\n'));

      console.log(chalk.bold('1. BINARY QUANTIZATION (32x reduction)'));
      console.log('   ✓ Best for: Mobile, edge devices, >1M vectors');
      console.log('   ✓ Memory: 32x smaller (3GB → 96MB)');
      console.log('   ✓ Speed: 10x faster');
      console.log('   ✗ Accuracy: 2-5% loss (95-98% accuracy)');
      console.log('   Example: Mobile apps, embedded systems');

      console.log(chalk.bold('\n2. SCALAR QUANTIZATION (4x reduction) ⭐ RECOMMENDED'));
      console.log('   ✓ Best for: Production apps, 10K-1M vectors');
      console.log('   ✓ Memory: 4x smaller (3GB → 768MB)');
      console.log('   ✓ Speed: 3x faster');
      console.log('   ✗ Accuracy: 1-2% loss (98-99% accuracy)');
      console.log('   Example: Most production applications');

      console.log(chalk.bold('\n3. PRODUCT QUANTIZATION (8-16x reduction)'));
      console.log('   ✓ Best for: High-dimensional vectors, >100K vectors');
      console.log('   ✓ Memory: 8-16x smaller (3GB → 192MB)');
      console.log('   ✓ Speed: 5x faster');
      console.log('   ✗ Accuracy: 3-7% loss (93-97% accuracy)');
      console.log('   Example: Image/video embeddings, large-scale search');

      console.log(chalk.bold('\n4. NO QUANTIZATION (Full precision)'));
      console.log('   ✓ Best for: <10K vectors, critical accuracy needs');
      console.log('   ✓ Memory: No reduction');
      console.log('   ✓ Speed: Baseline (1x)');
      console.log('   ✓ Accuracy: 100% (no loss)');
      console.log('   Example: Development, small datasets');

      console.log(chalk.bold.cyan('\n🎯 Quick Selection:'));
      console.log('  • <10K vectors → none');
      console.log('  • 10K-100K vectors → scalar');
      console.log('  • 100K-1M vectors → scalar or product');
      console.log('  • >1M vectors → binary or product');
      console.log('  • Mobile/Edge → binary');
      console.log('  • Critical accuracy → none or scalar');

      console.log(chalk.bold.green('\n✅ Usage:'));
      console.log(chalk.gray('  aqe quantization recommend --vectors 50000'));
      console.log(chalk.gray('  aqe quantization compare --vectors 50000'));
      console.log(chalk.gray('  aqe quantization calculate --vectors 50000 --type binary'));
      console.log('');
    });

  return cmd;
}
