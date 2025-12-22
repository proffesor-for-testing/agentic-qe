/**
 * Knowledge Graph CLI Commands
 *
 * Provides CLI interface for Code Intelligence Knowledge Graph operations:
 * - index: Index codebase with incremental and watch modes
 * - query: Natural language code search with hybrid search
 * - graph: Generate Mermaid diagrams for code relationships
 * - stats: Display knowledge graph statistics
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CodeIntelligenceOrchestrator } from '../../code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js';
import { ProcessExit } from '../../utils/ProcessExit.js';
import { KGOutputFormatter } from '../formatters/KGOutputFormatter.js';
import type { IndexingProgress, QueryContext, QueryResult } from '../../code-intelligence/orchestrator/types.js';

export interface KGIndexOptions {
  watch: boolean;
  incremental: boolean;
  gitSince?: string;
  verbose: boolean;
  json: boolean;
}

export interface KGQueryOptions {
  hybrid: boolean;
  k: number;
  lang?: string;
  graphDepth: number;
  json: boolean;
  verbose: boolean;
}

export interface KGGraphOptions {
  type: 'class' | 'dependency';
  output?: string;
  format: 'mermaid' | 'dot';
  json: boolean;
}

export interface KGStatsOptions {
  json: boolean;
  verbose: boolean;
}

export class KnowledgeGraphCommand {
  private orchestrator: CodeIntelligenceOrchestrator | null = null;
  private formatter: KGOutputFormatter;

  constructor() {
    this.formatter = new KGOutputFormatter();
  }

  /**
   * Index command: Full indexing, incremental, or watch mode
   */
  static async index(options: KGIndexOptions): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeIndex(options);
  }

  /**
   * Query command: Hybrid search with formatted results
   */
  static async query(naturalLanguageQuery: string, options: KGQueryOptions): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeQuery(naturalLanguageQuery, options);
  }

  /**
   * Graph command: Generate Mermaid diagram for file/module
   */
  static async graph(filePath: string, options: KGGraphOptions): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeGraph(filePath, options);
  }

  /**
   * Stats command: Display graph statistics
   */
  static async stats(options: KGStatsOptions): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeStats(options);
  }

  /**
   * Execute index operation
   */
  private async executeIndex(options: KGIndexOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🔍 Knowledge Graph Indexing\n'));

    try {
      // Initialize orchestrator
      const spinner = ora('Initializing Code Intelligence system...').start();
      this.orchestrator = await this.initializeOrchestrator();
      spinner.succeed('Code Intelligence system initialized');

      // Determine indexing mode
      if (options.watch) {
        await this.runWatchMode(options);
      } else if (options.incremental && options.gitSince) {
        await this.runIncrementalMode(options);
      } else {
        await this.runFullIndex(options);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Indexing failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      ProcessExit.exitIfNotTest(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute query operation
   */
  private async executeQuery(query: string, options: KGQueryOptions): Promise<void> {
    if (options.json) {
      // Suppress header in JSON mode
    } else {
      console.log(chalk.blue.bold('\n🔎 Knowledge Graph Query\n'));
      console.log(chalk.gray(`Query: ${query}\n`));
    }

    try {
      // Initialize orchestrator
      const spinner = ora('Loading knowledge graph...').start();
      this.orchestrator = await this.initializeOrchestrator();
      spinner.succeed('Knowledge graph loaded');

      // Prepare query context
      const queryContext: QueryContext = {
        query,
        topK: options.k,
        includeGraphContext: options.graphDepth > 0,
        graphDepth: options.graphDepth,
        language: options.lang,
      };

      // Execute search
      const searchSpinner = ora('Searching...').start();
      const startTime = Date.now();
      const result = await this.orchestrator.query(queryContext);
      const searchTime = Date.now() - startTime;
      searchSpinner.succeed(`Found ${result.results.length} results in ${searchTime}ms`);

      // Output results
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        this.formatter.formatQueryResults(result, options.verbose);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Query failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      ProcessExit.exitIfNotTest(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute graph generation
   */
  private async executeGraph(filePath: string, options: KGGraphOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📊 Knowledge Graph Visualization\n'));

    try {
      // Check if file exists
      const absolutePath = path.resolve(filePath);
      if (!await fs.pathExists(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Initialize orchestrator
      const spinner = ora('Loading knowledge graph...').start();
      this.orchestrator = await this.initializeOrchestrator();
      spinner.succeed('Knowledge graph loaded');

      // Generate diagram
      spinner.start('Generating diagram...');
      const diagram = await this.generateDiagram(absolutePath, options.type, options.format);
      spinner.succeed('Diagram generated');

      // Output diagram
      if (options.output) {
        await fs.writeFile(options.output, diagram);
        console.log(chalk.green(`\n✅ Diagram saved to: ${options.output}`));
      } else if (options.json) {
        console.log(JSON.stringify({ diagram, format: options.format }, null, 2));
      } else {
        console.log(chalk.yellow('\n📊 Diagram:\n'));
        console.log(diagram);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Graph generation failed:'), error.message);
      ProcessExit.exitIfNotTest(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute stats display
   */
  private async executeStats(options: KGStatsOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📈 Knowledge Graph Statistics\n'));

    try {
      // Initialize orchestrator
      const spinner = ora('Loading knowledge graph...').start();
      this.orchestrator = await this.initializeOrchestrator();
      spinner.succeed('Knowledge graph loaded');

      // Get statistics
      const stats = this.orchestrator.getStats();
      const usingDatabase = this.orchestrator.isUsingDatabase();

      // Output statistics
      if (options.json) {
        console.log(JSON.stringify({ ...stats, usingDatabase }, null, 2));
      } else {
        this.formatter.formatStats(stats, usingDatabase, options.verbose);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to get statistics:'), error.message);
      ProcessExit.exitIfNotTest(1);
    } finally {
      await this.cleanup();
    }
  }

  // === Private Helper Methods ===

  /**
   * Initialize Code Intelligence Orchestrator
   */
  private async initializeOrchestrator(): Promise<CodeIntelligenceOrchestrator> {
    const config = await this.loadConfig();
    const orchestrator = new CodeIntelligenceOrchestrator(config);
    await orchestrator.initialize();
    return orchestrator;
  }

  /**
   * Load configuration from .agentic-qe/config/code-intelligence.json
   */
  private async loadConfig(): Promise<any> {
    const configPath = path.join(process.cwd(), '.agentic-qe', 'config', 'code-intelligence.json');

    if (await fs.pathExists(configPath)) {
      return await fs.readJson(configPath);
    }

    // Return default config
    return {
      rootDir: process.cwd(),
      ollamaUrl: 'http://localhost:11434',
      database: {
        enabled: true,
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        database: process.env.PGDATABASE || 'ruvector',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
      },
    };
  }

  /**
   * Run full index
   */
  private async runFullIndex(options: KGIndexOptions): Promise<void> {
    const rootDir = process.cwd();

    const progressBar = this.formatter.createProgressBar();
    let lastProgress: IndexingProgress | null = null;

    const result = await this.orchestrator!.indexProject(rootDir, (progress) => {
      lastProgress = progress;

      // Update progress bar
      progressBar.update(progress.processedFiles, {
        phase: progress.phase,
        file: progress.currentFile ? path.basename(progress.currentFile) : '',
        chunks: progress.chunksCreated,
        embeddings: progress.embeddingsGenerated,
      });

      // Set total if not set
      if (progress.totalFiles > 0 && progressBar.getTotal() === 0) {
        progressBar.setTotal(progress.totalFiles);
      }
    });

    progressBar.stop();

    // Display results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      this.formatter.formatIndexingResult(result, lastProgress);
    }
  }

  /**
   * Run incremental indexing based on git changes
   */
  private async runIncrementalMode(options: KGIndexOptions): Promise<void> {
    console.log(chalk.yellow(`Indexing changes since commit: ${options.gitSince}\n`));

    const spinner = ora('Detecting git changes...').start();
    const changes = await this.orchestrator!.getGitChanges(options.gitSince);
    spinner.succeed(`Found ${changes.length} changed files`);

    if (changes.length === 0) {
      console.log(chalk.green('\n✅ No changes to index'));
      return;
    }

    // Display changes
    console.log(chalk.gray('\nChanged files:'));
    changes.forEach((change) => {
      const icon = change.type === 'add' ? '+' : change.type === 'delete' ? '-' : '~';
      console.log(chalk.gray(`  ${icon} ${change.filePath}`));
    });

    // Process changes
    spinner.start('Processing changes...');
    const result = await this.orchestrator!.processChanges(changes);
    spinner.succeed('Changes processed');

    // Display results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      this.formatter.formatIndexingResult(result, null);
    }
  }

  /**
   * Run watch mode
   */
  private async runWatchMode(options: KGIndexOptions): Promise<void> {
    console.log(chalk.yellow('Starting watch mode...\n'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    // Start watching
    await this.orchestrator!.startWatching();

    // Listen for incremental updates
    this.orchestrator!.on('incrementalUpdate', (result) => {
      console.log(chalk.blue(`\n📝 Files updated: ${result.stats.filesIndexed}`));
      if (result.stats.filesIndexed > 0) {
        console.log(chalk.gray(`  Chunks: ${result.stats.chunksCreated}`));
        console.log(chalk.gray(`  Embeddings: ${result.stats.embeddingsGenerated}`));
      }
    });

    // Keep process alive
    await new Promise(() => {
      // Wait indefinitely
    });
  }

  /**
   * Generate diagram for file
   */
  private async generateDiagram(
    filePath: string,
    type: 'class' | 'dependency',
    format: 'mermaid' | 'dot'
  ): Promise<string> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    // Get graph stats
    const stats = this.orchestrator.getStats();
    const fileName = path.basename(filePath);

    if (format === 'mermaid') {
      if (type === 'class') {
        return this.generateMermaidClassDiagram(filePath, fileName);
      } else {
        return this.generateMermaidDependencyDiagram(filePath, fileName);
      }
    } else {
      // DOT format
      if (type === 'class') {
        return this.generateDotClassDiagram(filePath, fileName);
      } else {
        return this.generateDotDependencyDiagram(filePath, fileName);
      }
    }
  }

  /**
   * Generate Mermaid class diagram
   */
  private generateMermaidClassDiagram(filePath: string, fileName: string): string {
    // This would query the graph for class relationships
    // For now, return a simple example
    return `classDiagram
    class ${fileName.replace(/\./g, '_')} {
        +function1()
        +function2()
    }

    Note: Full implementation requires graph query API`;
  }

  /**
   * Generate Mermaid dependency diagram
   */
  private generateMermaidDependencyDiagram(filePath: string, fileName: string): string {
    return `graph TD
    ${fileName.replace(/\./g, '_')}[${fileName}]

    Note: Full implementation requires graph query API`;
  }

  /**
   * Generate DOT class diagram
   */
  private generateDotClassDiagram(filePath: string, fileName: string): string {
    return `digraph G {
  rankdir=BT;
  "${fileName}" [shape=box];

  // Note: Full implementation requires graph query API
}`;
  }

  /**
   * Generate DOT dependency diagram
   */
  private generateDotDependencyDiagram(filePath: string, fileName: string): string {
    return `digraph G {
  rankdir=LR;
  "${fileName}" [shape=box];

  // Note: Full implementation requires graph query API
}`;
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.shutdown();
      this.orchestrator = null;
    }
  }
}
