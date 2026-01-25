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
import { MermaidGenerator } from '../../code-intelligence/visualization/MermaidGenerator.js';
import { ClassDiagramBuilder } from '../../code-intelligence/visualization/ClassDiagramBuilder.js';
import { DependencyGraphBuilder } from '../../code-intelligence/visualization/DependencyGraphBuilder.js';
import { C4ContextDiagramBuilder } from '../../code-intelligence/visualization/C4ContextDiagramBuilder.js';
import { C4ContainerDiagramBuilder } from '../../code-intelligence/visualization/C4ContainerDiagramBuilder.js';
import { C4ComponentDiagramBuilder } from '../../code-intelligence/visualization/C4ComponentDiagramBuilder.js';
import { ProjectMetadataAnalyzer } from '../../code-intelligence/inference/ProjectMetadataAnalyzer.js';
import { ExternalSystemDetector } from '../../code-intelligence/inference/ExternalSystemDetector.js';
import { ComponentBoundaryAnalyzer } from '../../code-intelligence/inference/ComponentBoundaryAnalyzer.js';
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

export interface KGC4Options {
  output?: string;
  json: boolean;
  verbose: boolean;
  container?: string;
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
   * C4 Context command: Generate C4 system context diagram
   */
  static async c4Context(options: KGC4Options): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeC4Context(options);
  }

  /**
   * C4 Container command: Generate C4 container diagram
   */
  static async c4Container(options: KGC4Options): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeC4Container(options);
  }

  /**
   * C4 Component command: Generate C4 component diagram
   */
  static async c4Component(containerName: string | undefined, options: KGC4Options): Promise<void> {
    const cmd = new KnowledgeGraphCommand();
    await cmd.executeC4Component(containerName, options);
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

      // Get statistics (now async to include database stats)
      spinner.start('Fetching statistics...');
      const stats = await this.orchestrator.getStats();
      const usingDatabase = this.orchestrator.isUsingDatabase();
      spinner.succeed('Statistics loaded');

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

    // Return default config (matching agentic-qe-ruvector-dev container defaults)
    return {
      rootDir: process.cwd(),
      ollamaUrl: 'http://localhost:11434',
      database: {
        enabled: true,
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        database: process.env.PGDATABASE || 'ruvector_db',
        user: process.env.PGUSER || 'ruvector',
        password: process.env.PGPASSWORD || 'ruvector',
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

    const graphBuilder = this.orchestrator.getGraphBuilder();
    const nodes = graphBuilder.findNodesInFile(filePath);

    // Get all edges for these nodes
    const edges = this.getEdgesForNodes(graphBuilder, nodes);

    if (nodes.length === 0) {
      const fileName = path.basename(filePath);
      return format === 'mermaid'
        ? `%% No graph data found for ${fileName}\n%% Run 'aqe kg index' first to index the codebase`
        : `// No graph data found for ${fileName}\n// Run 'aqe kg index' first to index the codebase`;
    }

    if (format === 'mermaid') {
      if (type === 'class') {
        return ClassDiagramBuilder.build(nodes, edges, { includeMethods: true });
      } else {
        return DependencyGraphBuilder.build(nodes, edges, { direction: 'TB' });
      }
    } else {
      // DOT format
      if (type === 'class') {
        return this.generateDotClassDiagram(nodes, edges);
      } else {
        return this.generateDotDependencyDiagram(nodes, edges);
      }
    }
  }

  /**
   * Get all edges connecting the given nodes
   */
  private getEdgesForNodes(graphBuilder: any, nodes: any[]): any[] {
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges: any[] = [];
    const seenEdges = new Set<string>();

    for (const node of nodes) {
      // Get outgoing edges
      const outgoing = graphBuilder.getOutgoingEdges(node.id);
      for (const edge of outgoing) {
        if (!seenEdges.has(edge.id)) {
          edges.push(edge);
          seenEdges.add(edge.id);
        }
      }

      // Get incoming edges from nodes in our set
      const incoming = graphBuilder.getIncomingEdges(node.id);
      for (const edge of incoming) {
        if (nodeIds.has(edge.source) && !seenEdges.has(edge.id)) {
          edges.push(edge);
          seenEdges.add(edge.id);
        }
      }
    }

    return edges;
  }

  /**
   * Generate DOT class diagram from real graph data
   */
  private generateDotClassDiagram(nodes: any[], edges: any[]): string {
    const lines: string[] = ['digraph G {', '  rankdir=BT;', '  node [shape=box];', ''];

    // Add nodes
    for (const node of nodes) {
      const label = node.metadata?.signature || node.label;
      lines.push(`  "${node.id}" [label="${label}"];`);
    }

    lines.push('');

    // Add edges
    for (const edge of edges) {
      const style = edge.type === 'extends' ? 'solid' : 'dashed';
      lines.push(`  "${edge.source}" -> "${edge.target}" [style=${style}, label="${edge.type}"];`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate DOT dependency diagram from real graph data
   */
  private generateDotDependencyDiagram(nodes: any[], edges: any[]): string {
    const lines: string[] = ['digraph G {', '  rankdir=LR;', '  node [shape=box];', ''];

    // Filter to file nodes and import edges
    const fileNodes = nodes.filter(n => n.type === 'file');
    const importEdges = edges.filter(e => e.type === 'imports');

    // Add nodes
    for (const node of fileNodes) {
      lines.push(`  "${node.id}" [label="${node.label}"];`);
    }

    lines.push('');

    // Add edges
    for (const edge of importEdges) {
      lines.push(`  "${edge.source}" -> "${edge.target}";`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Execute C4 Context diagram generation
   */
  private async executeC4Context(options: KGC4Options): Promise<void> {
    if (!options.json) {
      console.log(chalk.blue.bold('\n📊 C4 System Context Diagram\n'));
    }

    try {
      const rootDir = process.cwd();
      const spinner = ora('Analyzing project metadata...').start();

      // Analyze project metadata
      const metadataAnalyzer = new ProjectMetadataAnalyzer(rootDir);
      const metadata = await metadataAnalyzer.analyze();
      spinner.text = 'Detecting external systems...';

      // Detect external systems
      const externalDetector = new ExternalSystemDetector(rootDir);
      const externalSystems = await externalDetector.detect();
      spinner.succeed('Analysis complete');

      // Generate C4 Context diagram
      const builder = new C4ContextDiagramBuilder();
      const diagram = builder.build(metadata, externalSystems);

      // Output diagram
      if (options.output) {
        await fs.writeFile(options.output, diagram);
        console.log(chalk.green(`\n✅ Diagram saved to: ${options.output}`));
      } else if (options.json) {
        console.log(JSON.stringify({ diagram, type: 'c4-context', metadata }, null, 2));
      } else {
        console.log(chalk.yellow('\n📊 C4 Context Diagram:\n'));
        console.log(diagram);

        if (options.verbose) {
          console.log(chalk.gray('\n📝 Metadata:'));
          console.log(chalk.gray(`  System: ${metadata.name}`));
          console.log(chalk.gray(`  Type: ${metadata.systemType}`));
          console.log(chalk.gray(`  Technology: ${metadata.technology}`));
          console.log(chalk.gray(`  External Systems: ${externalSystems.length}`));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ C4 Context diagram generation failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Execute C4 Container diagram generation
   */
  private async executeC4Container(options: KGC4Options): Promise<void> {
    if (!options.json) {
      console.log(chalk.blue.bold('\n📊 C4 Container Diagram\n'));
    }

    try {
      const rootDir = process.cwd();
      const spinner = ora('Analyzing project metadata...').start();

      // Analyze project metadata
      const metadataAnalyzer = new ProjectMetadataAnalyzer(rootDir);
      const metadata = await metadataAnalyzer.analyze();
      spinner.text = 'Detecting external systems...';

      // Detect external systems
      const externalDetector = new ExternalSystemDetector(rootDir);
      const externalSystems = await externalDetector.detect();
      spinner.succeed('Analysis complete');

      // Generate C4 Container diagram
      const builder = new C4ContainerDiagramBuilder();
      const diagram = builder.build(metadata, externalSystems);

      // Output diagram
      if (options.output) {
        await fs.writeFile(options.output, diagram);
        console.log(chalk.green(`\n✅ Diagram saved to: ${options.output}`));
      } else if (options.json) {
        console.log(JSON.stringify({ diagram, type: 'c4-container', metadata, containers: metadata.containers }, null, 2));
      } else {
        console.log(chalk.yellow('\n📊 C4 Container Diagram:\n'));
        console.log(diagram);

        if (options.verbose) {
          console.log(chalk.gray('\n📝 Containers:'));
          for (const container of metadata.containers) {
            console.log(chalk.gray(`  - ${container.name} (${container.type}): ${container.technology}`));
          }
          console.log(chalk.gray(`\n📝 External Systems: ${externalSystems.length}`));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ C4 Container diagram generation failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Execute C4 Component diagram generation
   */
  private async executeC4Component(containerName: string | undefined, options: KGC4Options): Promise<void> {
    if (!options.json) {
      console.log(chalk.blue.bold('\n📊 C4 Component Diagram\n'));
    }

    try {
      const rootDir = process.cwd();
      let targetContainer = containerName;

      // If no container specified, try to infer from project name or use 'Application'
      if (!targetContainer) {
        const metadataAnalyzer = new ProjectMetadataAnalyzer(rootDir);
        const metadata = await metadataAnalyzer.analyze();

        // Use first container if available, otherwise use project name
        if (metadata.containers.length > 0) {
          targetContainer = metadata.containers[0].name;
          if (!options.json) {
            console.log(chalk.yellow(`Using container: ${targetContainer}\n`));
          }
        } else {
          targetContainer = metadata.name || 'Application';
          if (!options.json) {
            console.log(chalk.yellow(`Using default container: ${targetContainer}\n`));
          }
        }
      }

      const spinner = ora('Analyzing component boundaries...').start();

      // Analyze component boundaries
      const componentAnalyzer = new ComponentBoundaryAnalyzer(
        path.join(rootDir, 'src'),
        {
          minFilesPerComponent: 2,
          analyzeImports: true,
          excludePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
          maxDepth: 5,
        }
      );

      const analysisResult = await componentAnalyzer.analyze();
      spinner.succeed('Analysis complete');

      // Generate C4 Component diagram
      const builder = new C4ComponentDiagramBuilder();
      const diagram = builder.build(targetContainer, analysisResult.components, analysisResult.relationships);

      // Output diagram
      if (options.output) {
        await fs.writeFile(options.output, diagram);
        console.log(chalk.green(`\n✅ Diagram saved to: ${options.output}`));
      } else if (options.json) {
        console.log(JSON.stringify({
          diagram,
          type: 'c4-component',
          container: targetContainer,
          components: analysisResult.components,
          relationships: analysisResult.relationships
        }, null, 2));
      } else {
        console.log(chalk.yellow(`\n📊 C4 Component Diagram for ${targetContainer}:\n`));
        console.log(diagram);

        if (options.verbose) {
          console.log(chalk.gray('\n📝 Components:'));
          for (const component of analysisResult.components) {
            const boundary = component.boundary ? ` [${component.boundary}]` : '';
            console.log(chalk.gray(`  - ${component.name}${boundary}`));
          }
          console.log(chalk.gray(`\n📝 Total Components: ${analysisResult.components.length}`));
          console.log(chalk.gray(`📝 Total Relationships: ${analysisResult.relationships.length}`));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ C4 Component diagram generation failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      ProcessExit.exitIfNotTest(1);
    }
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
