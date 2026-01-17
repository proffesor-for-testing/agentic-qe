/**
 * MinCut Analysis CLI Commands
 *
 * Provides CLI interface for module coupling analysis using MinCut algorithms:
 * - coupling: Analyze coupling between two modules
 * - coupling-all: Find all highly coupled module pairs
 * - circular: Detect circular dependencies
 * - boundaries: Suggest optimal module boundaries
 * - overview: Get coupling overview for entire codebase
 */

import chalk from 'chalk';
import ora from 'ora';
import { CodeIntelligenceOrchestrator } from '../../../code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js';
import { ModuleCouplingAnalyzer } from '../../../code-intelligence/analysis/mincut/ModuleCouplingAnalyzer.js';
import { CircularDependencyDetector } from '../../../code-intelligence/analysis/mincut/CircularDependencyDetector.js';
import { GraphBuilder } from '../../../code-intelligence/graph/GraphBuilder.js';
import type { CodeGraph } from '../../../code-intelligence/graph/types.js';
import type { ModuleCouplingResult, CircularDependencyResult } from '../../../code-intelligence/analysis/mincut/types.js';

export interface MinCutCouplingOptions {
  threshold?: string;
  json?: boolean;
}

export interface MinCutCouplingAllOptions {
  threshold?: string;
  limit?: string;
  json?: boolean;
}

export interface MinCutCircularOptions {
  severity?: 'low' | 'medium' | 'high';
  json?: boolean;
}

export interface MinCutBoundariesOptions {
  json?: boolean;
}

export interface MinCutOverviewOptions {
  json?: boolean;
}

/**
 * Load code graph from knowledge graph
 */
async function loadCodeGraph(): Promise<{ nodes: any[], edges: any[] }> {
  const spinner = ora('Loading code graph from knowledge graph...').start();

  try {
    // Initialize orchestrator
    const orchestrator = new CodeIntelligenceOrchestrator({
      rootDir: process.cwd(),
      database: {
        enabled: true,
        host: 'localhost',
        port: 5432,
        database: 'ruvector_dev',
        user: 'postgres',
        password: 'postgres'
      }
    });

    await orchestrator.initialize();

    // Get graph builder
    const graphBuilder = orchestrator.getGraphBuilder();
    const graph = graphBuilder.exportGraph();

    if (!graph || graph.nodes.length === 0) {
      spinner.fail('No code graph found');
      console.log(chalk.yellow('Run "aqe kg index" to index your codebase first.'));
      process.exit(1);
    }

    spinner.succeed(`Code graph loaded: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    return graph;
  } catch (error: any) {
    spinner.fail('Failed to load code graph');
    if (error.message?.includes('connect')) {
      console.error(chalk.red('❌ Database connection failed.'));
      console.log(chalk.yellow('Make sure PostgreSQL is running and accessible.'));
    } else {
      console.error(chalk.red(`❌ Error: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Format coupling strength with color
 */
function formatCoupling(strength: number): string {
  const percentage = (strength * 100).toFixed(0);
  if (strength >= 0.8) {
    return chalk.red(`${percentage}% (Very High)`);
  }
  if (strength >= 0.6) {
    return chalk.yellow(`${percentage}% (High)`);
  }
  if (strength >= 0.4) {
    return chalk.blue(`${percentage}% (Moderate)`);
  }
  return chalk.green(`${percentage}% (Low)`);
}

/**
 * Display coupling analysis result
 */
function displayCouplingResult(result: ModuleCouplingResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.bold.cyan(`\n📊 Coupling Analysis: ${result.module1} ↔ ${result.module2}\n`));
  console.log(`Coupling Strength: ${formatCoupling(result.couplingStrength)}`);
  console.log(`Circular Dependency: ${result.circularDependency ? chalk.red('Yes ⚠️') : chalk.green('No ✓')}`);

  if (result.sharedDependencies.length > 0) {
    console.log(chalk.gray(`\nShared Dependencies (${result.sharedDependencies.length}):`));
    result.sharedDependencies.slice(0, 5).forEach(dep => {
      console.log(chalk.gray(`  • ${dep}`));
    });
    if (result.sharedDependencies.length > 5) {
      console.log(chalk.gray(`  ... and ${result.sharedDependencies.length - 5} more`));
    }
  }

  if (result.cutEdges.length > 0) {
    console.log(chalk.gray(`\nKey Dependencies (${result.cutEdges.length}):`));
    result.cutEdges.slice(0, 5).forEach(edge => {
      console.log(chalk.gray(`  • ${edge.source} → ${edge.target}`));
    });
    if (result.cutEdges.length > 5) {
      console.log(chalk.gray(`  ... and ${result.cutEdges.length - 5} more`));
    }
  }

  if (result.recommendations.length > 0) {
    console.log(chalk.yellow('\n💡 Recommendations:'));
    result.recommendations.forEach(r => {
      console.log(`  ${r}`);
    });
  }

  console.log(); // Empty line
}

/**
 * Analyze coupling between two modules
 */
export async function analyzeCoupling(
  module1: string,
  module2: string,
  options: MinCutCouplingOptions
): Promise<void> {
  const graph = await loadCodeGraph();
  const threshold = options.threshold ? parseFloat(options.threshold) : 0.3;

  const spinner = ora('Analyzing module coupling...').start();

  try {
    // Convert graph to CodeGraph format
    const codeGraph: CodeGraph = {
      nodes: new Map(graph.nodes.map(n => [n.id, n])),
      edges: new Map(graph.edges.map(e => [e.id, e])),
      fileNodes: new Map(),
      outgoingEdges: new Map(),
      incomingEdges: new Map()
    };

    // Build index maps
    for (const node of graph.nodes) {
      const fileNodes = codeGraph.fileNodes.get(node.filePath) || [];
      fileNodes.push(node.id);
      codeGraph.fileNodes.set(node.filePath, fileNodes);
      codeGraph.outgoingEdges.set(node.id, []);
      codeGraph.incomingEdges.set(node.id, []);
    }

    for (const edge of graph.edges) {
      const outgoing = codeGraph.outgoingEdges.get(edge.source) || [];
      outgoing.push(edge.id);
      codeGraph.outgoingEdges.set(edge.source, outgoing);

      const incoming = codeGraph.incomingEdges.get(edge.target) || [];
      incoming.push(edge.id);
      codeGraph.incomingEdges.set(edge.target, incoming);
    }

    const analyzer = new ModuleCouplingAnalyzer(codeGraph, {
      minCouplingThreshold: threshold
    });

    const result = await analyzer.analyzeCoupling(module1, module2);
    spinner.succeed('Analysis complete');

    displayCouplingResult(result, options.json || false);
  } catch (error: any) {
    spinner.fail('Analysis failed');
    console.error(chalk.red(`❌ Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Find all highly coupled module pairs
 */
export async function findHighlyCoupledModules(options: MinCutCouplingAllOptions): Promise<void> {
  const graph = await loadCodeGraph();
  const threshold = options.threshold ? parseFloat(options.threshold) : 0.5;
  const limit = options.limit ? parseInt(options.limit) : 10;

  const spinner = ora('Finding highly coupled modules...').start();

  try {
    // Convert graph to CodeGraph format
    const codeGraph: CodeGraph = {
      nodes: new Map(graph.nodes.map(n => [n.id, n])),
      edges: new Map(graph.edges.map(e => [e.id, e])),
      fileNodes: new Map(),
      outgoingEdges: new Map(),
      incomingEdges: new Map()
    };

    // Build index maps
    for (const node of graph.nodes) {
      const fileNodes = codeGraph.fileNodes.get(node.filePath) || [];
      fileNodes.push(node.id);
      codeGraph.fileNodes.set(node.filePath, fileNodes);
      codeGraph.outgoingEdges.set(node.id, []);
      codeGraph.incomingEdges.set(node.id, []);
    }

    for (const edge of graph.edges) {
      const outgoing = codeGraph.outgoingEdges.get(edge.source) || [];
      outgoing.push(edge.id);
      codeGraph.outgoingEdges.set(edge.source, outgoing);

      const incoming = codeGraph.incomingEdges.get(edge.target) || [];
      incoming.push(edge.id);
      codeGraph.incomingEdges.set(edge.target, incoming);
    }

    const analyzer = new ModuleCouplingAnalyzer(codeGraph);
    const results = await analyzer.findHighlyCoupledModules(threshold);
    const limitedResults = results.slice(0, limit);

    spinner.succeed(`Found ${results.length} highly coupled module pairs`);

    if (options.json) {
      console.log(JSON.stringify(limitedResults, null, 2));
      return;
    }

    if (limitedResults.length === 0) {
      console.log(chalk.green('\n✓ No highly coupled modules found (threshold: ' + (threshold * 100).toFixed(0) + '%)'));
      return;
    }

    console.log(chalk.bold.cyan(`\n🔗 Highly Coupled Modules (showing ${limitedResults.length} of ${results.length}):\n`));

    for (const result of limitedResults) {
      console.log(`${formatCoupling(result.couplingStrength)} ${chalk.bold(result.module1)} ↔ ${chalk.bold(result.module2)}`);
      if (result.circularDependency) {
        console.log(chalk.red('  ⚠️  Circular dependency detected'));
      }
      console.log();
    }
  } catch (error: any) {
    spinner.fail('Analysis failed');
    console.error(chalk.red(`❌ Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Detect circular dependencies
 */
export async function detectCircularDependencies(options: MinCutCircularOptions): Promise<void> {
  const graph = await loadCodeGraph();

  const spinner = ora('Detecting circular dependencies...').start();

  try {
    // Convert graph to CodeGraph format
    const codeGraph: CodeGraph = {
      nodes: new Map(graph.nodes.map(n => [n.id, n])),
      edges: new Map(graph.edges.map(e => [e.id, e])),
      fileNodes: new Map(),
      outgoingEdges: new Map(),
      incomingEdges: new Map()
    };

    // Build index maps
    for (const node of graph.nodes) {
      const fileNodes = codeGraph.fileNodes.get(node.filePath) || [];
      fileNodes.push(node.id);
      codeGraph.fileNodes.set(node.filePath, fileNodes);
      codeGraph.outgoingEdges.set(node.id, []);
      codeGraph.incomingEdges.set(node.id, []);
    }

    for (const edge of graph.edges) {
      const outgoing = codeGraph.outgoingEdges.get(edge.source) || [];
      outgoing.push(edge.id);
      codeGraph.outgoingEdges.set(edge.source, outgoing);

      const incoming = codeGraph.incomingEdges.get(edge.target) || [];
      incoming.push(edge.id);
      codeGraph.incomingEdges.set(edge.target, incoming);
    }

    const detector = new CircularDependencyDetector(codeGraph);
    const cycles = await detector.detectAll();

    // Filter by severity if specified
    const filteredCycles = options.severity
      ? cycles.filter(c => {
          const severityOrder = { low: 1, medium: 2, high: 3 };
          return severityOrder[c.severity] >= severityOrder[options.severity!];
        })
      : cycles;

    spinner.succeed(`Detected ${cycles.length} circular dependencies`);

    if (options.json) {
      console.log(JSON.stringify(filteredCycles, null, 2));
      return;
    }

    if (filteredCycles.length === 0) {
      console.log(chalk.green('\n✓ No circular dependencies found'));
      return;
    }

    console.log(chalk.bold.red(`\n🔄 Circular Dependencies Found: ${filteredCycles.length}\n`));

    for (const cycle of filteredCycles) {
      const severityIcon = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      }[cycle.severity];

      console.log(`${severityIcon} ${chalk.bold(cycle.severity.toUpperCase())}: ${cycle.cycle.join(' → ')}`);

      if (cycle.breakPoints.length > 0) {
        console.log(chalk.gray('   Break points:'));
        for (const bp of cycle.breakPoints.slice(0, 3)) {
          console.log(chalk.gray(`   • ${bp.source} → ${bp.target} (${bp.effort} effort)`));
        }
        if (cycle.breakPoints.length > 3) {
          console.log(chalk.gray(`   ... and ${cycle.breakPoints.length - 3} more`));
        }
      }

      console.log();
    }
  } catch (error: any) {
    spinner.fail('Detection failed');
    console.error(chalk.red(`❌ Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Suggest optimal module boundaries
 */
export async function suggestModuleBoundaries(count: string, options: MinCutBoundariesOptions): Promise<void> {
  const graph = await loadCodeGraph();
  const moduleCount = parseInt(count);

  if (isNaN(moduleCount) || moduleCount < 2) {
    console.error(chalk.red('❌ Invalid module count. Must be >= 2'));
    process.exit(1);
  }

  console.log(chalk.yellow(`\n⚠️  Module boundary suggestion is not yet implemented.`));
  console.log(chalk.gray('This feature will analyze the code graph and suggest optimal module boundaries'));
  console.log(chalk.gray(`to partition the codebase into ${moduleCount} modules with minimal coupling.\n`));
}

/**
 * Get coupling overview for entire codebase
 */
export async function getCouplingOverview(options: MinCutOverviewOptions): Promise<void> {
  const graph = await loadCodeGraph();

  const spinner = ora('Computing coupling overview...').start();

  try {
    // Convert graph to CodeGraph format
    const codeGraph: CodeGraph = {
      nodes: new Map(graph.nodes.map(n => [n.id, n])),
      edges: new Map(graph.edges.map(e => [e.id, e])),
      fileNodes: new Map(),
      outgoingEdges: new Map(),
      incomingEdges: new Map()
    };

    // Build index maps
    for (const node of graph.nodes) {
      const fileNodes = codeGraph.fileNodes.get(node.filePath) || [];
      fileNodes.push(node.id);
      codeGraph.fileNodes.set(node.filePath, fileNodes);
      codeGraph.outgoingEdges.set(node.id, []);
      codeGraph.incomingEdges.set(node.id, []);
    }

    for (const edge of graph.edges) {
      const outgoing = codeGraph.outgoingEdges.get(edge.source) || [];
      outgoing.push(edge.id);
      codeGraph.outgoingEdges.set(edge.source, outgoing);

      const incoming = codeGraph.incomingEdges.get(edge.target) || [];
      incoming.push(edge.id);
      codeGraph.incomingEdges.set(edge.target, incoming);
    }

    const analyzer = new ModuleCouplingAnalyzer(codeGraph);
    const overview = await analyzer.getCouplingOverview();

    spinner.succeed('Overview computed');

    if (options.json) {
      console.log(JSON.stringify(overview, null, 2));
      return;
    }

    console.log(chalk.bold.cyan('\n📊 Coupling Overview\n'));
    console.log(`Average Coupling: ${formatCoupling(overview.averageCoupling)}`);
    console.log(`Maximum Coupling: ${formatCoupling(overview.maxCoupling)}`);
    console.log(`Highly Coupled Pairs: ${chalk.yellow(overview.highlyCoupledPairs)}`);
    console.log(`Circular Dependencies: ${overview.circularDependencies > 0 ? chalk.red(overview.circularDependencies) : chalk.green(overview.circularDependencies)}`);

    if (overview.recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      overview.recommendations.forEach(r => {
        console.log(`  ${r}`);
      });
    }

    console.log();
  } catch (error: any) {
    spinner.fail('Overview computation failed');
    console.error(chalk.red(`❌ Error: ${error.message}`));
    process.exit(1);
  }
}
