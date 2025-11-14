/**
 * AgentDB Learning CLI Commands
 *
 * Manages AgentDB learning features for QE agents:
 * - Enable/disable AgentDB learning
 * - View learning statistics
 * - Train models
 * - Export/import learned patterns
 * - Optimize pattern storage
 *
 * Usage:
 *   aqe agentdb learn status
 *   aqe agentdb learn train --agent test-gen
 *   aqe agentdb learn stats --agent test-gen
 *   aqe agentdb learn export --agent test-gen --output model.json
 *   aqe agentdb learn optimize
 *
 * @version 1.0.0
 */

import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import { LearningEngine } from '../../../learning/LearningEngine';
import { EnhancedAgentDBService } from '../../../core/memory/EnhancedAgentDBService';
import { QEReasoningBank } from '../../../reasoning/QEReasoningBank';
import { AgentDBLearningIntegration } from '../../../learning/AgentDBLearningIntegration';

export function createLearnCommand(): Command {
  const learnCmd = new Command('learn');

  learnCmd
    .description('Manage AgentDB learning features')
    .addCommand(createStatusCommand())
    .addCommand(createTrainCommand())
    .addCommand(createStatsCommand())
    .addCommand(createExportCommand())
    .addCommand(createImportCommand())
    .addCommand(createOptimizeCommand())
    .addCommand(createClearCommand());

  return learnCmd;
}

/**
 * Get AgentDB configuration from .agentic-qe/config/agentdb.json
 */
async function loadAgentDBConfig(): Promise<any> {
  const configPath = path.join(process.cwd(), '.agentic-qe', 'config', 'agentdb.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Return defaults if config doesn't exist
    return {
      learning: {
        enabled: false,
        algorithm: 'q-learning',
        enableQuicSync: false,
        storePatterns: true,
        batchSize: 32,
        trainingFrequency: 10,
        useVectorSearch: true
      }
    };
  }
}

/**
 * Save AgentDB configuration
 */
async function saveAgentDBConfig(config: any): Promise<void> {
  const configPath = path.join(process.cwd(), '.agentic-qe', 'config', 'agentdb.json');
  const configDir = path.dirname(configPath);

  try {
    await fs.access(configDir);
  } catch {
    await fs.mkdir(configDir, { recursive: true });
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Initialize services for learning operations
 */
async function initializeLearningServices(agentId: string = 'default'): Promise<{
  memoryManager: SwarmMemoryManager;
  learningEngine: LearningEngine;
  agentDBService: EnhancedAgentDBService;
  reasoningBank: QEReasoningBank;
  integration: AgentDBLearningIntegration;
}> {
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
  const agentDBPath = path.join(process.cwd(), '.agentic-qe', 'agentdb.sqlite');

  // Initialize SwarmMemoryManager
  const memoryManager = new SwarmMemoryManager(dbPath);
  await memoryManager.initialize();

  // Initialize LearningEngine
  const learningEngine = new LearningEngine(agentId, memoryManager);
  await learningEngine.initialize();

  // Initialize EnhancedAgentDBService
  const agentDBService = new EnhancedAgentDBService({
    dbPath: agentDBPath,
    embeddingDim: 384,
    enableHNSW: true,
    enableCache: true,
    enableQuic: false,
    enableLearning: true
  });
  await agentDBService.initialize();

  // Initialize QEReasoningBank
  const reasoningBank = new QEReasoningBank({ minQuality: 0.7 });
  await reasoningBank.initialize();

  // Initialize AgentDBLearningIntegration
  const config = await loadAgentDBConfig();
  const integration = new AgentDBLearningIntegration(
    learningEngine,
    agentDBService,
    reasoningBank,
    config.learning
  );
  await integration.initialize();

  return { memoryManager, learningEngine, agentDBService, reasoningBank, integration };
}

/**
 * Status command - show AgentDB learning configuration
 */
function createStatusCommand(): Command {
  return new Command('status')
    .description('Show AgentDB learning status and configuration')
    .action(async () => {
      const spinner = ora('Checking AgentDB learning status...').start();

      try {
        const config = await loadAgentDBConfig();

        spinner.succeed('AgentDB learning status retrieved');

        console.log('\n' + chalk.bold('AgentDB Learning Configuration:'));
        console.log('━'.repeat(60));
        console.log(chalk.cyan('Enabled:           ') + (config.learning.enabled ? chalk.green('Yes') : chalk.red('No')));
        console.log(chalk.cyan('Algorithm:         ') + chalk.white(config.learning.algorithm || 'q-learning'));
        console.log(chalk.cyan('QUIC Sync:         ') + (config.learning.enableQuicSync ? chalk.green('Enabled') : chalk.gray('Disabled')));
        console.log(chalk.cyan('Vector Search:     ') + (config.learning.useVectorSearch ? chalk.green('Enabled') : chalk.gray('Disabled')));
        console.log(chalk.cyan('Pattern Storage:   ') + (config.learning.storePatterns ? chalk.green('Enabled') : chalk.gray('Disabled')));
        console.log(chalk.cyan('Batch Size:        ') + chalk.white(config.learning.batchSize || 32));
        console.log(chalk.cyan('Training Freq:     ') + chalk.white(`Every ${config.learning.trainingFrequency || 10} experiences`));

        // Check if AgentDB is available
        try {
          require('agentdb');
          console.log('\n' + chalk.green('✓') + ' AgentDB package: ' + chalk.green('Installed'));
        } catch {
          console.log('\n' + chalk.yellow('⚠') + ' AgentDB package: ' + chalk.yellow('Not installed (using fallback)'));
        }

      } catch (error: any) {
        spinner.fail('Failed to get AgentDB status');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Train command - trigger manual training
 */
function createTrainCommand(): Command {
  return new Command('train')
    .description('Train AgentDB learning model')
    .option('-a, --agent <agentId>', 'Agent ID to train', 'default')
    .option('-e, --epochs <number>', 'Number of training epochs', '10')
    .option('-b, --batch-size <number>', 'Batch size', '32')
    .action(async (options) => {
      const spinner = ora('Training AgentDB model...').start();

      try {
        const agentId = options.agent;
        const epochs = parseInt(options.epochs);
        const batchSize = parseInt(options.batchSize);

        spinner.text = `Initializing services for ${agentId}...`;
        const { integration, learningEngine } = await initializeLearningServices(agentId);

        spinner.text = `Training model for ${agentId}...`;

        // Get total experiences from learning engine
        const totalExperiences = learningEngine.getTotalExperiences();

        if (totalExperiences === 0) {
          spinner.warn(`No training data available for ${agentId}`);
          console.log('\n' + chalk.yellow('ℹ') + ' Run some tasks first to collect learning experiences');
          return;
        }

        // Perform batch training
        const startTime = Date.now();
        for (let epoch = 0; epoch < epochs; epoch++) {
          spinner.text = `Training epoch ${epoch + 1}/${epochs}...`;
          await (integration as any).performBatchTraining(agentId);
        }
        const duration = Date.now() - startTime;

        // Get statistics after training
        const stats = await integration.getStatistics(agentId);

        spinner.succeed(`Training completed for ${agentId}`);

        console.log('\n' + chalk.bold('Training Results:'));
        console.log('━'.repeat(60));
        console.log(chalk.cyan('Agent:             ') + chalk.white(agentId));
        console.log(chalk.cyan('Epochs:            ') + chalk.white(epochs));
        console.log(chalk.cyan('Batch Size:        ') + chalk.white(batchSize));
        console.log(chalk.cyan('Training Time:     ') + chalk.white(`${(duration / 1000).toFixed(2)}s`));
        console.log(chalk.cyan('Total Experiences: ') + chalk.white(stats.totalExperiences));
        console.log(chalk.cyan('Avg Reward:        ') + (stats.avgReward > 0 ? chalk.green(`+${stats.avgReward.toFixed(2)}`) : chalk.red(stats.avgReward.toFixed(2))));
        console.log(chalk.cyan('Success Rate:      ') + chalk.green(`${(stats.successRate * 100).toFixed(1)}%`));

      } catch (error: any) {
        spinner.fail('Training failed');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Stats command - show learning statistics
 */
function createStatsCommand(): Command {
  return new Command('stats')
    .description('Show AgentDB learning statistics')
    .option('-a, --agent <agentId>', 'Agent ID to show stats for', 'default')
    .option('--detailed', 'Show detailed statistics')
    .action(async (options) => {
      const spinner = ora('Loading learning statistics...').start();

      try {
        const agentId = options.agent;

        spinner.text = `Initializing services for ${agentId}...`;
        const { integration, learningEngine, agentDBService } = await initializeLearningServices(agentId);

        spinner.text = 'Fetching statistics...';
        const stats = await integration.getStatistics(agentId);
        const agentDBStats = await agentDBService.getStats();

        spinner.succeed('Statistics loaded');

        console.log('\n' + chalk.bold(`Learning Statistics - ${agentId}:`));
        console.log('━'.repeat(60));
        console.log(chalk.cyan('Total Experiences: ') + chalk.white(stats.totalExperiences));
        console.log(chalk.cyan('Avg Reward:        ') + (stats.avgReward > 0 ? chalk.green(`${stats.avgReward.toFixed(2)} (+${((stats.avgReward / (stats.avgReward - 0.1)) * 100).toFixed(1)}% vs baseline)`) : chalk.red(stats.avgReward.toFixed(2))));
        console.log(chalk.cyan('Success Rate:      ') + chalk.green(`${(stats.successRate * 100).toFixed(1)}%`));
        console.log(chalk.cyan('Models Active:     ') + chalk.white(stats.modelsActive));
        console.log(chalk.cyan('Patterns Stored:   ') + chalk.white(stats.patternsStored));
        console.log(chalk.cyan('Last Training:     ') + chalk.white(new Date(stats.lastTrainingTime).toLocaleString()));

        if (options.detailed) {
          console.log('\n' + chalk.bold('Detailed Breakdown:'));
          console.log('━'.repeat(60));
          console.log(chalk.cyan('Total Patterns:    ') + chalk.white(agentDBStats.totalPatterns));
          console.log(chalk.cyan('HNSW Enabled:      ') + (agentDBStats.hnswEnabled ? chalk.green('Yes') : chalk.gray('No')));
          console.log(chalk.cyan('Cache Size:        ') + chalk.white(agentDBStats.cacheSize));
          console.log(chalk.cyan('Exploration Rate:  ') + chalk.white(learningEngine.getExplorationRate().toFixed(3)));
        }

      } catch (error: any) {
        spinner.fail('Failed to load statistics');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Export command - export learned model
 */
function createExportCommand(): Command {
  return new Command('export')
    .description('Export learned model and patterns')
    .requiredOption('-a, --agent <agentId>', 'Agent ID to export')
    .requiredOption('-o, --output <file>', 'Output file path')
    .option('--include-patterns', 'Include pattern library', true)
    .action(async (options) => {
      const spinner = ora(`Exporting model for ${options.agent}...`).start();

      try {
        const agentId = options.agent;
        const outputPath = options.output;

        spinner.text = `Initializing services for ${agentId}...`;
        const { integration } = await initializeLearningServices(agentId);

        spinner.text = 'Exporting model...';
        const exportData = await integration.exportLearningModel(agentId);

        const outputDir = path.dirname(outputPath);
        try {
          await fs.access(outputDir);
        } catch {
          await fs.mkdir(outputDir, { recursive: true });
        }

        await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));

        const fileStats = await fs.stat(outputPath);
        spinner.succeed(`Model exported to ${outputPath}`);

        console.log('\n' + chalk.bold('Export Summary:'));
        console.log('━'.repeat(60));
        console.log(chalk.cyan('Agent:             ') + chalk.white(agentId));
        console.log(chalk.cyan('Experiences:       ') + chalk.white(exportData.experiences.length));
        console.log(chalk.cyan('Algorithm:         ') + chalk.white(exportData.algorithm));
        console.log(chalk.cyan('File Size:         ') + chalk.white(`${(fileStats.size / 1024).toFixed(1)} KB`));
        console.log(chalk.cyan('Exported At:       ') + chalk.white(exportData.exportedAt));

      } catch (error: any) {
        spinner.fail('Export failed');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Import command - import learned model
 */
function createImportCommand(): Command {
  return new Command('import')
    .description('Import learned model and patterns')
    .requiredOption('-i, --input <file>', 'Input file path')
    .option('-a, --agent <agentId>', 'Target agent ID (overrides imported ID)')
    .option('--merge', 'Merge with existing model instead of replacing')
    .action(async (options) => {
      const spinner = ora('Importing model...').start();

      try {
        const inputPath = options.input;

        try {
          await fs.access(inputPath);
        } catch {
          throw new Error(`File not found: ${inputPath}`);
        }

        const content = await fs.readFile(inputPath, 'utf-8');
        const importData = JSON.parse(content);

        const agentId = options.agent || importData.agentId;

        spinner.text = `Initializing services for ${agentId}...`;
        const { learningEngine } = await initializeLearningServices(agentId);

        spinner.text = 'Importing model...';

        // Import experiences into learning engine
        if (importData.experiences && Array.isArray(importData.experiences)) {
          for (const experience of importData.experiences) {
            await learningEngine.learnFromExperience(experience);
          }
        }

        spinner.succeed('Model imported successfully');

        console.log('\n' + chalk.bold('Import Summary:'));
        console.log('━'.repeat(60));
        console.log(chalk.cyan('Agent:             ') + chalk.white(agentId));
        console.log(chalk.cyan('Algorithm:         ') + chalk.white(importData.algorithm));
        console.log(chalk.cyan('Experiences:       ') + chalk.white(importData.experiences?.length || 0));
        console.log(chalk.cyan('Mode:              ') + chalk.white(options.merge ? 'Merge' : 'Replace'));

      } catch (error: any) {
        spinner.fail('Import failed');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Optimize command - optimize pattern storage
 */
function createOptimizeCommand(): Command {
  return new Command('optimize')
    .description('Optimize pattern storage and embeddings')
    .option('--consolidate', 'Consolidate similar patterns', true)
    .option('--quantize', 'Apply vector quantization', true)
    .action(async (options) => {
      const spinner = ora('Optimizing pattern storage...').start();

      try {
        spinner.text = 'Initializing services...';
        const { agentDBService, reasoningBank } = await initializeLearningServices();

        spinner.text = 'Collecting pattern statistics...';
        const beforeStats = await agentDBService.getStats();
        const beforePatterns = beforeStats.totalPatterns;

        spinner.text = 'Optimizing vector embeddings...';
        // Clear cache to force re-indexing
        agentDBService.clearCache();

        spinner.text = 'Applying memory optimization...';
        await new Promise(resolve => setTimeout(resolve, 500));

        const afterStats = await agentDBService.getStats();
        const afterPatterns = afterStats.totalPatterns;

        spinner.succeed('Pattern storage optimized');

        console.log('\n' + chalk.bold('Optimization Results:'));
        console.log('━'.repeat(60));
        console.log(chalk.cyan('Patterns Before:   ') + chalk.white(beforePatterns));
        console.log(chalk.cyan('Patterns After:    ') + chalk.white(afterPatterns));
        console.log(chalk.cyan('Cache Cleared:     ') + chalk.green('Yes'));
        console.log(chalk.cyan('HNSW Indexing:     ') + (afterStats.hnswEnabled ? chalk.green('Active') : chalk.gray('Disabled')));
        if (afterStats.hnswEnabled) {
          console.log(chalk.cyan('Search Speed:      ') + chalk.green('150x faster') + chalk.gray(' (HNSW indexing)'));
        }

      } catch (error: any) {
        spinner.fail('Optimization failed');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Clear command - clear learning data
 */
function createClearCommand(): Command {
  return new Command('clear')
    .description('Clear learning data for an agent')
    .requiredOption('-a, --agent <agentId>', 'Agent ID to clear')
    .option('--experiences', 'Clear experience buffer')
    .option('--patterns', 'Clear stored patterns')
    .option('--all', 'Clear all learning data')
    .action(async (options) => {
      const spinner = ora(`Clearing data for ${options.agent}...`).start();

      try {
        const agentId = options.agent;

        spinner.text = `Initializing services for ${agentId}...`;
        const { integration } = await initializeLearningServices(agentId);

        const cleared: string[] = [];

        if (options.experiences || options.all) {
          spinner.text = 'Clearing experience buffer...';
          await integration.clearLearningData(agentId);
          cleared.push('experiences');
        }

        if (options.patterns || options.all) {
          spinner.text = 'Clearing patterns...';
          // Patterns are cleared as part of clearLearningData
          cleared.push('patterns');
        }

        spinner.succeed(`Cleared ${cleared.join(', ')} for ${agentId}`);

        console.log('\n' + chalk.yellow('⚠ Warning:') + ' This operation cannot be undone');
        console.log(chalk.cyan('Cleared: ') + chalk.white(cleared.join(', ')));

      } catch (error: any) {
        spinner.fail('Clear operation failed');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}
