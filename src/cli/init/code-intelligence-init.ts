/**
 * Code Intelligence initialization module
 *
 * Sets up Code Intelligence System for semantic code search and knowledge graph.
 * Requires: Ollama (nomic-embed-text) + RuVector PostgreSQL
 *
 * @module cli/init/code-intelligence-init
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FleetConfig } from '../../types';

/**
 * Code Intelligence configuration stored in .agentic-qe/config
 */
export interface CodeIntelligenceConfig {
  enabled: boolean;
  ollamaUrl: string;
  embeddingModel: string;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  indexPaths: string[];
  autoIndex: boolean;
  watchEnabled: boolean;
}

/**
 * Check if Code Intelligence prerequisites are available
 */
export async function checkCodeIntelligencePrerequisites(): Promise<{
  ollama: boolean;
  ollamaModel: boolean;
  postgres: boolean;
  allReady: boolean;
  messages: string[];
}> {
  const messages: string[] = [];
  let ollama = false;
  let ollamaModel = false;
  let postgres = false;

  // Check Ollama
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      ollama = true;
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models || [];
      ollamaModel = models.some((m: { name: string }) => m.name.includes('nomic-embed-text'));
      if (!ollamaModel) {
        messages.push('nomic-embed-text model not found. Run: ollama pull nomic-embed-text');
      }
    }
  } catch {
    messages.push('Ollama not available at http://localhost:11434. Start with: ollama serve');
  }

  // Check PostgreSQL/RuVector
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.RUVECTOR_HOST || 'localhost',
      port: parseInt(process.env.RUVECTOR_PORT || '5432'),
      database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
      user: process.env.RUVECTOR_USER || 'ruvector',
      password: process.env.RUVECTOR_PASSWORD || 'ruvector',
      connectionTimeoutMillis: 3000,
    });
    await pool.query('SELECT 1');
    await pool.end();
    postgres = true;
  } catch {
    messages.push('RuVector PostgreSQL not available. Start with: docker-compose up -d ruvector');
  }

  return {
    ollama,
    ollamaModel,
    postgres,
    allReady: ollama && ollamaModel && postgres,
    messages,
  };
}

/**
 * Initialize Code Intelligence System
 *
 * Optionally sets up Code Intelligence if prerequisites are available.
 * Creates configuration file and optionally triggers initial indexing.
 *
 * @param config - Fleet configuration
 * @param interactive - Whether to prompt user for options
 */
export async function initializeCodeIntelligence(
  config: FleetConfig,
  interactive: boolean = true
): Promise<void> {
  console.log(chalk.cyan('\n🧠 Code Intelligence System Setup\n'));

  // Check prerequisites
  const prereqs = await checkCodeIntelligencePrerequisites();

  if (!prereqs.allReady) {
    console.log(chalk.yellow('  ⚠️  Code Intelligence prerequisites not available:'));
    prereqs.messages.forEach(msg => {
      console.log(chalk.gray(`     • ${msg}`));
    });
    console.log(chalk.gray('\n  Skipping Code Intelligence setup. You can enable it later with:'));
    console.log(chalk.cyan('     aqe code-intel setup\n'));

    // Create disabled config
    await saveCodeIntelligenceConfig({
      enabled: false,
      ollamaUrl: 'http://localhost:11434',
      embeddingModel: 'nomic-embed-text',
      database: {
        host: 'localhost',
        port: 5432,
        database: 'ruvector_db',
        user: 'ruvector',
        password: 'ruvector',
      },
      indexPaths: ['src'],
      autoIndex: false,
      watchEnabled: false,
    });

    return;
  }

  console.log(chalk.green('  ✓ All prerequisites available'));
  console.log(chalk.gray(`     • Ollama: running with nomic-embed-text`));
  console.log(chalk.gray(`     • RuVector PostgreSQL: connected`));

  // Ask user if they want to enable Code Intelligence
  let enableCodeIntel = true;
  let autoIndex = false;

  if (interactive) {
    const answers = await inquirer.prompt<{ enable: boolean; autoIndex?: boolean }>([
      {
        type: 'confirm',
        name: 'enable',
        message: 'Enable Code Intelligence for semantic code search?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'autoIndex',
        message: 'Index the codebase now? (can be done later with: aqe code-intel index)',
        default: false,
        when: (ans: { enable: boolean }) => ans.enable,
      },
    ]);
    enableCodeIntel = answers.enable;
    autoIndex = answers.autoIndex ?? false;
  }

  // Save configuration
  const codeIntelConfig: CodeIntelligenceConfig = {
    enabled: enableCodeIntel,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    embeddingModel: 'nomic-embed-text',
    database: {
      host: process.env.RUVECTOR_HOST || 'localhost',
      port: parseInt(process.env.RUVECTOR_PORT || '5432'),
      database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
      user: process.env.RUVECTOR_USER || 'ruvector',
      password: process.env.RUVECTOR_PASSWORD || 'ruvector',
    },
    indexPaths: ['src'],
    autoIndex: false,
    watchEnabled: false,
  };

  await saveCodeIntelligenceConfig(codeIntelConfig);

  if (!enableCodeIntel) {
    console.log(chalk.gray('  Code Intelligence disabled. Enable later with: aqe code-intel enable'));
    return;
  }

  console.log(chalk.green('  ✓ Code Intelligence enabled'));

  // Perform initial indexing if requested
  if (autoIndex) {
    console.log(chalk.cyan('\n  📊 Indexing codebase (this may take a few minutes)...\n'));
    try {
      await indexCodebase();
      console.log(chalk.green('  ✓ Codebase indexed successfully'));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  Indexing failed: ${(error as Error).message}`));
      console.log(chalk.gray('     Run manually with: aqe code-intel index'));
    }
  } else {
    console.log(chalk.gray('\n  To index your codebase, run:'));
    console.log(chalk.cyan('     aqe code-intel index'));
  }
}

/**
 * Save Code Intelligence configuration
 */
async function saveCodeIntelligenceConfig(config: CodeIntelligenceConfig): Promise<void> {
  const configDir = path.join(process.cwd(), '.agentic-qe', 'config');
  await fs.ensureDir(configDir);
  await fs.writeJson(path.join(configDir, 'code-intelligence.json'), config, { spaces: 2 });
}

/**
 * Load Code Intelligence configuration
 */
export async function loadCodeIntelligenceConfig(): Promise<CodeIntelligenceConfig | null> {
  const configPath = path.join(process.cwd(), '.agentic-qe', 'config', 'code-intelligence.json');
  try {
    return await fs.readJson(configPath);
  } catch {
    return null;
  }
}

/**
 * Index the codebase using Code Intelligence System
 */
async function indexCodebase(): Promise<void> {
  const { initializeCodeIntelligence } = await import('../../code-intelligence/service/CodeIntelligenceService.js');

  const service = await initializeCodeIntelligence();

  const result = await service.indexDirectory('src', (progress) => {
    const pct = progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : 0;
    process.stdout.write(`\r  Processing: ${progress.processedFiles}/${progress.totalFiles} files (${pct}%) - ${progress.chunksCreated} chunks`);
  });

  process.stdout.write('\n');
  console.log(chalk.gray(`     • Files indexed: ${result.filesIndexed}`));
  console.log(chalk.gray(`     • Chunks created: ${result.chunksCreated}`));
  console.log(chalk.gray(`     • Graph nodes: ${result.nodesCreated}`));
  console.log(chalk.gray(`     • Graph edges: ${result.edgesCreated}`));
}
