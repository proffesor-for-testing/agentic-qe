/**
 * MinCut Analysis Example
 *
 * Demonstrates how to use GraphAdapter to convert CodeGraph
 * to MinCut format for coupling analysis.
 */

import { GraphBuilder } from '../../src/code-intelligence/graph/GraphBuilder.js';
import { GraphAdapter } from '../../src/code-intelligence/analysis/mincut/GraphAdapter.js';

/**
 * Example 1: Basic file-level coupling analysis
 */
async function analyzeFileLevelCoupling() {
  console.log('=== File-Level Coupling Analysis ===\n');

  const builder = new GraphBuilder();

  // Add file nodes
  const authFile = builder.addNode('file', 'auth.ts', '/src/auth.ts', 1, 100, 'typescript');
  const userFile = builder.addNode('file', 'user.ts', '/src/user.ts', 1, 200, 'typescript');
  const dbFile = builder.addNode('file', 'db.ts', '/src/db.ts', 1, 150, 'typescript');
  const apiFile = builder.addNode('file', 'api.ts', '/src/api.ts', 1, 180, 'typescript');

  // Add dependencies (imports)
  builder.addEdge(authFile.id, userFile.id, 'imports', 1.0);
  builder.addEdge(authFile.id, dbFile.id, 'imports', 1.0);
  builder.addEdge(userFile.id, dbFile.id, 'imports', 1.0);
  builder.addEdge(apiFile.id, authFile.id, 'imports', 1.0);
  builder.addEdge(apiFile.id, userFile.id, 'imports', 1.0);

  // Export and validate
  const graph = builder.exportGraph();
  const validation = GraphAdapter.validateGraph(graph);

  if (!validation.valid) {
    console.error('Graph validation failed:', validation.errors);
    return;
  }

  console.log('✓ Graph validated successfully');
  console.log(`  Nodes: ${graph.nodes.length}`);
  console.log(`  Edges: ${graph.edges.length}\n`);

  // Convert to MinCut format with weight normalization
  const minCutInput = GraphAdapter.toMinCutFormat(graph, {
    nodeFilter: (node) => node.type === 'file',
    normalizeWeights: true,
    directed: false,
  });

  console.log('MinCut Input:');
  console.log(`  Nodes: ${minCutInput.nodes.length}`);
  console.log(`  Edges: ${minCutInput.edges.length}`);
  console.log(`  Directed: ${minCutInput.directed}\n`);

  // Display edge weights
  console.log('Edge Weights (normalized):');
  for (const edge of minCutInput.edges) {
    const source = minCutInput.nodes.find((n) => n.id === edge.source)?.label;
    const target = minCutInput.nodes.find((n) => n.id === edge.target)?.label;
    console.log(`  ${source} <-> ${target}: ${edge.weight.toFixed(2)} (${edge.edgeType})`);
  }
}

/**
 * Example 2: Module-level coupling with subgraph extraction
 */
async function analyzeModuleCoupling() {
  console.log('\n=== Module-Level Coupling Analysis ===\n');

  const builder = new GraphBuilder();

  // Auth module
  const authLogin = builder.addNode('function', 'login', '/src/auth/login.ts', 1, 20, 'typescript');
  const authRegister = builder.addNode('function', 'register', '/src/auth/register.ts', 1, 30, 'typescript');
  const authMiddleware = builder.addNode('function', 'authenticate', '/src/auth/middleware.ts', 1, 15, 'typescript');

  // User module
  const userService = builder.addNode('class', 'UserService', '/src/user/service.ts', 1, 100, 'typescript');
  const userModel = builder.addNode('class', 'User', '/src/user/model.ts', 1, 50, 'typescript');

  // Database module
  const dbConnection = builder.addNode('function', 'connect', '/src/db/connection.ts', 1, 40, 'typescript');

  // Add relationships
  builder.addEdge(authLogin.id, userService.id, 'calls', 1.0);
  builder.addEdge(authRegister.id, userService.id, 'calls', 1.0);
  builder.addEdge(authMiddleware.id, userService.id, 'calls', 1.0);
  builder.addEdge(userService.id, userModel.id, 'uses', 1.0);
  builder.addEdge(userService.id, dbConnection.id, 'calls', 1.0);

  // Get full graph
  const fullGraph = builder.exportGraph();

  // Extract auth module only
  const authModule = GraphAdapter.extractFileSubgraph(fullGraph, [
    '/src/auth/login.ts',
    '/src/auth/register.ts',
    '/src/auth/middleware.ts',
  ]);

  console.log('Auth Module Subgraph:');
  console.log(`  Nodes: ${authModule.nodes.length}`);
  console.log(`  Edges: ${authModule.edges.length}`);
  console.log('  Files:');
  for (const node of authModule.nodes) {
    console.log(`    - ${node.label} (${node.filePath})`);
  }

  // Aggregate to file level
  const fileGraph = GraphAdapter.aggregateByFile(fullGraph);

  console.log('\nFile-Level Aggregation:');
  console.log(`  Files: ${fileGraph.nodes.length}`);
  console.log(`  Cross-file edges: ${fileGraph.edges.length}`);

  // Convert to MinCut format
  const minCutInput = GraphAdapter.toMinCutFormat(fileGraph, {
    normalizeWeights: true,
  });

  console.log('\nMinCut Input (file-level):');
  for (const edge of minCutInput.edges) {
    const source = minCutInput.nodes.find((n) => n.id === edge.source)?.label;
    const target = minCutInput.nodes.find((n) => n.id === edge.target)?.label;
    console.log(`  ${source} -> ${target}: ${edge.weight.toFixed(2)}`);
  }
}

/**
 * Example 3: Weight normalization demonstration
 */
async function demonstrateWeightNormalization() {
  console.log('\n=== Weight Normalization Demo ===\n');

  const builder = new GraphBuilder();

  const classA = builder.addNode('class', 'BaseClass', '/src/base.ts', 1, 50, 'typescript');
  const classB = builder.addNode('class', 'DerivedClass', '/src/derived.ts', 1, 100, 'typescript');
  const interfaceA = builder.addNode('interface', 'IService', '/src/interface.ts', 1, 20, 'typescript');
  const classC = builder.addNode('class', 'ServiceImpl', '/src/service.ts', 1, 80, 'typescript');

  // Add edges with different types
  builder.addEdge(classB.id, classA.id, 'extends', 1.0);
  builder.addEdge(classC.id, interfaceA.id, 'implements', 1.0);
  builder.addEdge(classB.id, classC.id, 'uses', 1.0);
  builder.addEdge(classC.id, classB.id, 'calls', 0.5);

  const graph = builder.exportGraph();

  // Without normalization
  const withoutNorm = GraphAdapter.toMinCutFormat(graph, {
    normalizeWeights: false,
  });

  console.log('Without normalization:');
  for (const edge of withoutNorm.edges) {
    console.log(`  ${edge.edgeType}: ${edge.weight.toFixed(2)}`);
  }

  // With normalization
  const withNorm = GraphAdapter.toMinCutFormat(graph, {
    normalizeWeights: true,
  });

  console.log('\nWith normalization (coupling-aware):');
  for (const edge of withNorm.edges) {
    const baseWeight = GraphAdapter.getEdgeTypeWeight(edge.edgeType!);
    console.log(`  ${edge.edgeType}: ${edge.weight.toFixed(2)} (base: ${baseWeight.toFixed(2)})`);
  }

  console.log('\nEdge Type Weights:');
  const edgeTypes = ['extends', 'implements', 'imports', 'calls', 'uses', 'contains', 'tests'];
  for (const type of edgeTypes) {
    const weight = GraphAdapter.getEdgeTypeWeight(type as any);
    console.log(`  ${type.padEnd(12)}: ${weight.toFixed(2)}`);
  }
}

/**
 * Run all examples
 */
async function main() {
  try {
    await analyzeFileLevelCoupling();
    await analyzeModuleCoupling();
    await demonstrateWeightNormalization();

    console.log('\n✓ All examples completed successfully\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyzeFileLevelCoupling, analyzeModuleCoupling, demonstrateWeightNormalization };
