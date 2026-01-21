/**
 * Example: Detecting and Resolving Circular Dependencies with MinCut
 *
 * This example shows how to use the CircularDependencyDetector to find
 * circular dependencies in your codebase and get actionable recommendations
 * for breaking them.
 */

import { CircularDependencyDetector } from '../../src/code-intelligence/analysis/mincut/CircularDependencyDetector.js';
import { CodeGraph, GraphNode, GraphEdge } from '../../src/code-intelligence/graph/types.js';

/**
 * Helper to create a code graph from simplified data
 */
function createGraph(
  nodeData: Array<{ id: string; label: string; filePath: string; type: string }>,
  edgeData: Array<{ id: string; source: string; target: string; type: string; weight: number }>
): CodeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const outgoingEdges = new Map<string, string[]>();
  const incomingEdges = new Map<string, string[]>();
  const fileNodes = new Map<string, string[]>();

  for (const n of nodeData) {
    const node: GraphNode = {
      id: n.id,
      type: n.type as any,
      label: n.label,
      filePath: n.filePath,
      startLine: 1,
      endLine: 100,
      language: 'typescript',
      properties: {},
    };
    nodes.set(n.id, node);

    if (!fileNodes.has(n.filePath)) {
      fileNodes.set(n.filePath, []);
    }
    fileNodes.get(n.filePath)!.push(n.id);
  }

  for (const e of edgeData) {
    const edge: GraphEdge = {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type as any,
      weight: e.weight,
      properties: {},
    };
    edges.set(e.id, edge);

    if (!outgoingEdges.has(e.source)) {
      outgoingEdges.set(e.source, []);
    }
    outgoingEdges.get(e.source)!.push(e.id);

    if (!incomingEdges.has(e.target)) {
      incomingEdges.set(e.target, []);
    }
    incomingEdges.get(e.target)!.push(e.id);
  }

  return { nodes, edges, outgoingEdges, incomingEdges, fileNodes };
}

/**
 * Example 1: Simple circular dependency (A -> B -> A)
 */
async function simpleCircle() {
  console.log('=== Example 1: Simple Circular Dependency ===\n');

  const graph = createGraph(
    [
      { id: 'UserService', label: 'UserService', filePath: '/src/services/UserService.ts', type: 'class' },
      { id: 'AuthService', label: 'AuthService', filePath: '/src/services/AuthService.ts', type: 'class' },
    ],
    [
      { id: 'e1', source: 'UserService', target: 'AuthService', type: 'imports', weight: 1.0 },
      { id: 'e2', source: 'AuthService', target: 'UserService', type: 'imports', weight: 1.0 },
    ]
  );

  const detector = new CircularDependencyDetector(graph);
  const results = await detector.detectAll();

  console.log(`Found ${results.length} circular dependency\n`);

  for (const result of results) {
    console.log(`Cycle: ${result.cycle.join(' → ')}`);
    console.log(`Severity: ${result.severity}`);
    console.log('\nBreak Points:');
    result.breakPoints.forEach((bp, i) => {
      console.log(`  ${i + 1}. ${bp.source} → ${bp.target}`);
      console.log(`     Effort: ${bp.effort}`);
      console.log(`     Suggestion: ${bp.suggestion}`);
    });
    console.log('\nRecommendations:');
    result.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }

  console.log('\n');
}

/**
 * Example 2: Complex circular dependency with inheritance
 */
async function complexCircle() {
  console.log('=== Example 2: Complex Circular Dependency with Inheritance ===\n');

  const graph = createGraph(
    [
      { id: 'BaseModel', label: 'BaseModel', filePath: '/src/models/BaseModel.ts', type: 'class' },
      { id: 'UserModel', label: 'UserModel', filePath: '/src/models/UserModel.ts', type: 'class' },
      { id: 'Repository', label: 'Repository', filePath: '/src/data/Repository.ts', type: 'class' },
      { id: 'QueryBuilder', label: 'QueryBuilder', filePath: '/src/data/QueryBuilder.ts', type: 'class' },
    ],
    [
      { id: 'e1', source: 'UserModel', target: 'BaseModel', type: 'extends', weight: 1.0 },
      { id: 'e2', source: 'BaseModel', target: 'Repository', type: 'imports', weight: 1.0 },
      { id: 'e3', source: 'Repository', target: 'QueryBuilder', type: 'uses', weight: 1.0 },
      { id: 'e4', source: 'QueryBuilder', target: 'UserModel', type: 'calls', weight: 1.0 },
    ]
  );

  const detector = new CircularDependencyDetector(graph);
  const results = await detector.detectAll();

  console.log(`Found ${results.length} circular dependency\n`);

  for (const result of results) {
    console.log(`Cycle: ${result.cycle.join(' → ')}`);
    console.log(`Severity: ${result.severity} (inheritance involved!)`);
    console.log('\nBreak Points:');
    result.breakPoints.forEach((bp, i) => {
      console.log(`  ${i + 1}. ${bp.source} → ${bp.target} (${bp.edgeType})`);
      console.log(`     Effort: ${bp.effort}`);
      console.log(`     Suggestion: ${bp.suggestion}`);
    });
    console.log('\nRecommendations:');
    result.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }

  console.log('\n');
}

/**
 * Example 3: Check specific file for cycles
 */
async function checkSpecificFile() {
  console.log('=== Example 3: Check Specific File ===\n');

  const graph = createGraph(
    [
      { id: 'A', label: 'A.ts', filePath: '/src/A.ts', type: 'file' },
      { id: 'B', label: 'B.ts', filePath: '/src/B.ts', type: 'file' },
      { id: 'C', label: 'C.ts', filePath: '/src/C.ts', type: 'file' },
    ],
    [
      { id: 'e1', source: 'A', target: 'B', type: 'imports', weight: 1.0 },
      { id: 'e2', source: 'B', target: 'A', type: 'imports', weight: 1.0 },
      { id: 'e3', source: 'C', target: 'A', type: 'imports', weight: 1.0 },
    ]
  );

  const detector = new CircularDependencyDetector(graph);

  // Check file in cycle
  const fileInCycle = '/src/A.ts';
  const result1 = await detector.checkFile(fileInCycle);
  console.log(`Checking ${fileInCycle}:`);
  if (result1) {
    console.log(`  ✗ Part of cycle: ${result1.cycle.join(' → ')}`);
  } else {
    console.log('  ✓ Not part of any cycle');
  }

  // Check file not in cycle
  const fileNotInCycle = '/src/C.ts';
  const result2 = await detector.checkFile(fileNotInCycle);
  console.log(`\nChecking ${fileNotInCycle}:`);
  if (result2) {
    console.log(`  ✗ Part of cycle: ${result2.cycle.join(' → ')}`);
  } else {
    console.log('  ✓ Not part of any cycle');
  }

  console.log('\n');
}

/**
 * Example 4: Get statistics
 */
async function getStatistics() {
  console.log('=== Example 4: Circular Dependency Statistics ===\n');

  // Create graph with multiple cycles of different severities
  const graph = createGraph(
    [
      { id: 'A', label: 'A.ts', filePath: '/src/A.ts', type: 'file' },
      { id: 'B', label: 'B.ts', filePath: '/src/B.ts', type: 'file' },
      { id: 'C', label: 'C.ts', filePath: '/src/C.ts', type: 'class' },
      { id: 'D', label: 'D.ts', filePath: '/src/D.ts', type: 'class' },
      { id: 'E', label: 'E.ts', filePath: '/src/E.ts', type: 'class' },
      { id: 'F', label: 'F.ts', filePath: '/src/F.ts', type: 'class' },
    ],
    [
      // Simple cycle: A <-> B
      { id: 'e1', source: 'A', target: 'B', type: 'imports', weight: 1.0 },
      { id: 'e2', source: 'B', target: 'A', type: 'imports', weight: 1.0 },
      // Complex cycle with inheritance: C -> D -> E -> F -> C
      { id: 'e3', source: 'C', target: 'D', type: 'extends', weight: 1.0 },
      { id: 'e4', source: 'D', target: 'E', type: 'imports', weight: 1.0 },
      { id: 'e5', source: 'E', target: 'F', type: 'calls', weight: 1.0 },
      { id: 'e6', source: 'F', target: 'C', type: 'uses', weight: 1.0 },
    ]
  );

  const detector = new CircularDependencyDetector(graph);
  const stats = await detector.getStats();

  console.log(`Total Cycles: ${stats.totalCycles}`);
  console.log('\nBy Severity:');
  console.log(`  High: ${stats.bySeverity.high}`);
  console.log(`  Medium: ${stats.bySeverity.medium}`);
  console.log(`  Low: ${stats.bySeverity.low}`);
  console.log(`\nLargest Cycle: ${stats.largestCycle} files`);
  console.log(`Average Cycle Size: ${stats.avgCycleSize.toFixed(1)} files`);

  console.log('\n');
}

/**
 * Example 5: Real-world refactoring scenario
 */
async function refactoringScenario() {
  console.log('=== Example 5: Real-World Refactoring Scenario ===\n');
  console.log('Scenario: A typical e-commerce application with circular dependencies\n');

  const graph = createGraph(
    [
      { id: 'Order', label: 'Order', filePath: '/src/domain/Order.ts', type: 'class' },
      { id: 'OrderService', label: 'OrderService', filePath: '/src/services/OrderService.ts', type: 'class' },
      { id: 'PaymentService', label: 'PaymentService', filePath: '/src/services/PaymentService.ts', type: 'class' },
      { id: 'InventoryService', label: 'InventoryService', filePath: '/src/services/InventoryService.ts', type: 'class' },
    ],
    [
      { id: 'e1', source: 'OrderService', target: 'Order', type: 'uses', weight: 1.0 },
      { id: 'e2', source: 'OrderService', target: 'PaymentService', type: 'imports', weight: 1.0 },
      { id: 'e3', source: 'PaymentService', target: 'InventoryService', type: 'calls', weight: 1.0 },
      { id: 'e4', source: 'InventoryService', target: 'OrderService', type: 'imports', weight: 1.0 },
    ]
  );

  const detector = new CircularDependencyDetector(graph);
  const results = await detector.detectAll();

  for (const result of results) {
    console.log('🔍 Circular Dependency Detected:');
    console.log(`   ${result.cycle.join(' → ')}`);
    console.log(`\n⚠️  Severity: ${result.severity.toUpperCase()}`);

    console.log('\n💡 Recommended Break Points (easiest to hardest):');
    const sortedBreakPoints = [...result.breakPoints].sort((a, b) => {
      const order = { low: 0, medium: 1, high: 2 };
      return order[a.effort] - order[b.effort];
    });

    sortedBreakPoints.forEach((bp, i) => {
      console.log(`\n   ${i + 1}. Break: ${bp.source} → ${bp.target}`);
      console.log(`      Edge Type: ${bp.edgeType}`);
      console.log(`      Effort: ${bp.effort.toUpperCase()}`);
      console.log(`      How: ${bp.suggestion}`);
    });

    console.log('\n📋 Detailed Recommendations:');
    result.recommendations.forEach(rec => console.log(`   • ${rec}`));
  }

  console.log('\n✅ After implementing the suggested break point:');
  console.log('   - Extract a PaymentGateway interface');
  console.log('   - Have PaymentService implement PaymentGateway');
  console.log('   - OrderService depends on PaymentGateway interface instead of PaymentService');
  console.log('   - Use dependency injection to provide PaymentService at runtime');

  console.log('\n');
}

/**
 * Run all examples
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   Circular Dependency Detection with MinCut Analysis         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  await simpleCircle();
  await complexCircle();
  await checkSpecificFile();
  await getStatistics();
  await refactoringScenario();

  console.log('✨ All examples completed!\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
