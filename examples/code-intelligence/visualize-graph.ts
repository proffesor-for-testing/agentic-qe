/**
 * Example: Generate Mermaid Diagrams from Code Intelligence Graph
 *
 * Demonstrates visualization capabilities for class diagrams,
 * dependency graphs, and circular dependency detection.
 */

import { GraphBuilder } from '../../src/code-intelligence/graph/GraphBuilder.js';
import {
  MermaidGenerator,
  ClassDiagramBuilder,
  DependencyGraphBuilder,
} from '../../src/code-intelligence/visualization/index.js';

// Example 1: Create a sample graph with classes
console.log('=== Example 1: Class Diagram ===\n');

const builder = new GraphBuilder();

// Add classes
const baseService = builder.addNode(
  'class',
  'BaseService',
  '/src/services/BaseService.ts',
  1,
  20,
  'typescript',
  {
    methods: [
      { name: 'initialize', visibility: 'public', returnType: 'Promise<void>', params: [] },
      { name: 'cleanup', visibility: 'public', returnType: 'Promise<void>', params: [] },
    ],
    properties: [
      { name: '_config', visibility: 'private', type: 'Config' },
    ],
  }
);

const authService = builder.addNode(
  'class',
  'AuthService',
  '/src/services/AuthService.ts',
  1,
  50,
  'typescript',
  {
    methods: [
      { name: 'login', visibility: 'public', returnType: 'Promise<string>', params: ['username', 'password'] },
      { name: 'logout', visibility: 'public', returnType: 'Promise<void>', params: ['username'] },
      { name: '_validateCredentials', visibility: 'private', returnType: 'Promise<boolean>', params: ['username', 'password'] },
    ],
    properties: [
      { name: '_tokenStore', visibility: 'private', type: 'Map<string, string>' },
    ],
  }
);

const userService = builder.addNode(
  'class',
  'UserService',
  '/src/services/UserService.ts',
  1,
  40,
  'typescript',
  {
    methods: [
      { name: 'getUser', visibility: 'public', returnType: 'Promise<User>', params: ['id'] },
      { name: 'updateUser', visibility: 'public', returnType: 'Promise<void>', params: ['id', 'data'] },
    ],
  }
);

// Add inheritance relationships
builder.addEdge(authService.id, baseService.id, 'extends');
builder.addEdge(userService.id, baseService.id, 'extends');
builder.addEdge(authService.id, userService.id, 'uses');

// Generate class diagram
const classDiagram = ClassDiagramBuilder.build(
  builder.getAllNodes(),
  builder.getAllEdges(),
  {
    includeMethods: true,
    includeProperties: true,
    showParameters: true,
    showReturnTypes: true,
  }
);

console.log(classDiagram);
console.log('\n');

// Example 2: Dependency Graph
console.log('=== Example 2: Dependency Graph ===\n');

const depBuilder = new GraphBuilder();

// Add files
const indexFile = depBuilder.addNode('file', 'index.ts', '/src/index.ts', 1, 10, 'typescript');
const utilsFile = depBuilder.addNode('file', 'utils.ts', '/src/utils.ts', 1, 20, 'typescript');
const configFile = depBuilder.addNode('file', 'config.ts', '/src/config.ts', 1, 15, 'typescript');
const authFile = depBuilder.addNode('file', 'auth.ts', '/src/auth.ts', 1, 30, 'typescript');
const userFile = depBuilder.addNode('file', 'user.ts', '/src/user.ts', 1, 25, 'typescript');

// Add import relationships
depBuilder.addEdge(indexFile.id, authFile.id, 'imports');
depBuilder.addEdge(indexFile.id, userFile.id, 'imports');
depBuilder.addEdge(authFile.id, utilsFile.id, 'imports');
depBuilder.addEdge(authFile.id, configFile.id, 'imports');
depBuilder.addEdge(userFile.id, utilsFile.id, 'imports');
depBuilder.addEdge(userFile.id, configFile.id, 'imports');

// Generate dependency graph
const dependencyGraph = DependencyGraphBuilder.build(
  depBuilder.getAllNodes(),
  depBuilder.getAllEdges(),
  {
    direction: 'LR',
    includeLegend: true,
  }
);

console.log(dependencyGraph);
console.log('\n');

// Example 3: Circular Dependency Detection
console.log('=== Example 3: Circular Dependency Detection ===\n');

const circularBuilder = new GraphBuilder();

// Create circular dependency: A -> B -> C -> A
const fileA = circularBuilder.addNode('file', 'a.ts', '/src/a.ts', 1, 10, 'typescript');
const fileB = circularBuilder.addNode('file', 'b.ts', '/src/b.ts', 1, 10, 'typescript');
const fileC = circularBuilder.addNode('file', 'c.ts', '/src/c.ts', 1, 10, 'typescript');
const fileD = circularBuilder.addNode('file', 'd.ts', '/src/d.ts', 1, 10, 'typescript');

circularBuilder.addEdge(fileA.id, fileB.id, 'imports');
circularBuilder.addEdge(fileB.id, fileC.id, 'imports');
circularBuilder.addEdge(fileC.id, fileA.id, 'imports'); // Creates cycle!
circularBuilder.addEdge(fileD.id, fileA.id, 'imports'); // Not part of cycle

// Generate graph with circular dependency highlighting
const circularGraph = MermaidGenerator.generateDependencyGraphWithCycles(
  circularBuilder.getAllNodes(),
  circularBuilder.getAllEdges(),
  {
    direction: 'TB',
  }
);

console.log(circularGraph);
console.log('\n');

// Analyze dependencies
console.log('=== Dependency Metrics ===\n');

const metrics = DependencyGraphBuilder.analyzeDependencies(
  circularBuilder.getAllNodes(),
  circularBuilder.getAllEdges()
);

console.log(`Total Files: ${metrics.totalFiles}`);
console.log(`Total Dependencies: ${metrics.totalDependencies}`);
console.log(`Average Dependencies per File: ${metrics.avgDependenciesPerFile.toFixed(2)}`);
console.log(`Circular Dependencies Found: ${metrics.circularDependencies}`);

if (metrics.circularDependencies > 0) {
  console.log('\nCircular Dependency Paths:');
  for (const cycle of metrics.circularDependencyPaths) {
    const nodes = cycle.map(id => {
      const node = circularBuilder.getNode(id);
      return node ? node.label : id;
    });
    console.log(`  - ${nodes.join(' -> ')}`);
  }
}

console.log('\n');

// Example 4: Dependency Matrix
console.log('=== Example 4: Dependency Matrix ===\n');

const matrix = DependencyGraphBuilder.generateDependencyMatrix(
  depBuilder.getAllNodes(),
  depBuilder.getAllEdges()
);

console.log(matrix);
console.log('\n');

// Example 5: Dependency Tree
console.log('=== Example 5: Dependency Tree (from index.ts) ===\n');

const depTree = DependencyGraphBuilder.buildDependencyTree(
  indexFile.id,
  depBuilder.getAllNodes(),
  depBuilder.getAllEdges(),
  { maxDepth: 2 }
);

console.log(depTree);
console.log('\n');

// Example 6: Reverse Dependencies
console.log('=== Example 6: Reverse Dependencies (who uses utils.ts?) ===\n');

const reverseDeps = DependencyGraphBuilder.buildReverseDependencies(
  utilsFile.id,
  depBuilder.getAllNodes(),
  depBuilder.getAllEdges()
);

console.log(reverseDeps);
console.log('\n');

console.log('✓ All visualization examples completed!');
console.log('Copy any of the generated Mermaid diagrams to GitHub to see them rendered.');
