# Code Intelligence Visualization - Quick Reference

Quick reference for common visualization tasks.

## Installation

```typescript
import {
  MermaidGenerator,
  ClassDiagramBuilder,
  DependencyGraphBuilder,
} from './src/code-intelligence/visualization/index.js';
```

## Common Tasks

### 1. Generate Class Diagram

```typescript
const diagram = ClassDiagramBuilder.build(nodes, edges, {
  includeMethods: true,
  includeProperties: true,
  showParameters: true,
  showReturnTypes: true,
});
console.log(diagram);
```

### 2. Show Class Hierarchy

```typescript
const hierarchy = ClassDiagramBuilder.buildHierarchy(
  'MyClass',  // Root class node ID
  nodes,
  edges
);
```

### 3. Generate Dependency Graph

```typescript
const depGraph = DependencyGraphBuilder.build(nodes, edges, {
  direction: 'LR',        // Left to right
  showExternal: false,    // Hide node_modules
  highlightCycles: true,  // Highlight circular deps
});
```

### 4. Detect Circular Dependencies

```typescript
const cycles = MermaidGenerator.findCircularDependencies(nodes, edges);

if (cycles.length > 0) {
  console.log(`Found ${cycles.length} circular dependencies!`);
  const diagram = MermaidGenerator.generateDependencyGraphWithCycles(
    nodes,
    edges
  );
  console.log(diagram);
}
```

### 5. Build Dependency Tree

```typescript
const tree = DependencyGraphBuilder.buildDependencyTree(
  'index.ts',  // Root file node ID
  nodes,
  edges,
  { maxDepth: 3 }
);
```

### 6. Find Reverse Dependencies

```typescript
// Who depends on this file?
const reverseDeps = DependencyGraphBuilder.buildReverseDependencies(
  'utils.ts',  // Target file node ID
  nodes,
  edges
);
```

### 7. Analyze Dependencies

```typescript
const metrics = DependencyGraphBuilder.analyzeDependencies(nodes, edges);

console.log(`Total files: ${metrics.totalFiles}`);
console.log(`Circular dependencies: ${metrics.circularDependencies}`);
console.log(`Most imported:`);
metrics.mostImported.forEach(({ file, imports }) => {
  console.log(`  - ${file}: ${imports} imports`);
});
```

### 8. Generate Dependency Matrix

```typescript
const matrix = DependencyGraphBuilder.generateDependencyMatrix(nodes, edges);
console.log(matrix);  // Markdown table
```

### 9. Filter by Node Type

```typescript
const diagram = MermaidGenerator.generate(nodes, edges, 'graph', {
  nodeTypeFilter: ['class', 'interface'],  // Only show classes/interfaces
  maxNodes: 20,  // Limit to 20 nodes
});
```

### 10. Custom Graph Direction

```typescript
const diagram = DependencyGraphBuilder.build(nodes, edges, {
  direction: 'TB',  // Top to bottom (also: LR, RL, BT)
});
```

## Options Reference

### ClassDiagramOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeMethods` | boolean | true | Show methods |
| `includeProperties` | boolean | true | Show properties |
| `showParameters` | boolean | true | Show method params |
| `showReturnTypes` | boolean | true | Show return types |
| `groupByNamespace` | boolean | false | Group by namespace |
| `maxNodes` | number | 30 | Max nodes to show |

### DependencyGraphOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `direction` | 'TB'\|'LR'\|'RL'\|'BT' | 'TB' | Graph direction |
| `directOnly` | boolean | false | Show direct deps only |
| `maxDepth` | number | 3 | Max traversal depth |
| `highlightCycles` | boolean | true | Highlight circular deps |
| `showExternal` | boolean | false | Show node_modules |
| `maxNodes` | number | 50 | Max nodes to show |

### MermaidOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxNodes` | number | 50 | Max nodes to show |
| `includeLegend` | boolean | true | Add legend |
| `direction` | 'TB'\|'LR'\|'RL'\|'BT' | 'TB' | Graph direction |
| `nodeTypeFilter` | NodeType[] | undefined | Filter by node types |
| `edgeTypeFilter` | EdgeType[] | undefined | Filter by edge types |

## Node Types

- `file` - Source file
- `class` - Class definition
- `interface` - Interface definition
- `function` - Function/method
- `method` - Class method
- `variable` - Variable/property
- `import` - Import statement
- `export` - Export statement
- `type` - Type definition
- `enum` - Enum definition

## Edge Types

- `imports` - Import relationship
- `exports` - Export relationship
- `extends` - Class inheritance
- `implements` - Interface implementation
- `calls` - Function call
- `uses` - Variable/type usage
- `contains` - File contains entity
- `returns` - Return type
- `parameter` - Parameter type
- `overrides` - Method override
- `defines` - File defines entity
- `tests` - Test relationship

## Visual Legend

### Node Shapes

- Circle `(())` - File
- Rounded `()` - Class/Interface
- Rectangle `[]` - Function/Method
- Diamond `{}` - Variable/Type
- Hexagon `{{}}` - Import/Export

### Edge Arrows

- Solid `-->` - Regular relationship
- Thick `==>` - Import/Export
- Dotted `.->` - Call relationship
- Dashed `-.->` - Test relationship

### Colors

- Blue - File
- Purple - Class
- Green - Interface
- Orange - Function/Method
- Pink - Variable/Type
- Teal - Import/Export
- Red - Circular dependency

## Examples

### Full Pipeline

```typescript
import { GraphBuilder } from './src/code-intelligence/graph/GraphBuilder.js';
import { DependencyGraphBuilder } from './src/code-intelligence/visualization/index.js';

// 1. Build graph
const builder = new GraphBuilder();
builder.addNode('file', 'index.ts', '/src/index.ts', 1, 10, 'typescript');
builder.addNode('file', 'utils.ts', '/src/utils.ts', 1, 20, 'typescript');
builder.addEdge(file1.id, file2.id, 'imports');

// 2. Generate visualization
const diagram = DependencyGraphBuilder.build(
  builder.getAllNodes(),
  builder.getAllEdges()
);

// 3. Check for issues
const cycles = MermaidGenerator.findCircularDependencies(
  builder.getAllNodes(),
  builder.getAllEdges()
);

if (cycles.length > 0) {
  console.warn('Circular dependencies detected!');
}

// 4. Analyze metrics
const metrics = DependencyGraphBuilder.analyzeDependencies(
  builder.getAllNodes(),
  builder.getAllEdges()
);

console.log(`Total files: ${metrics.totalFiles}`);
console.log(`Avg dependencies: ${metrics.avgDependenciesPerFile.toFixed(2)}`);
```

## Tips

1. **Start Small**: Use `maxNodes` to limit initial visualizations
2. **Filter First**: Use node/edge type filters for focused views
3. **Check Cycles**: Always check for circular dependencies in module graphs
4. **Use Hierarchies**: For large codebases, visualize specific class hierarchies
5. **Hide External**: Set `showExternal: false` to hide node_modules
6. **GitHub Rendering**: Paste into GitHub markdown with \`\`\`mermaid blocks
7. **Iterative**: Start with high-level view, drill down as needed

## Running Examples

See complete examples:

```bash
npx tsx examples/code-intelligence/visualize-graph.ts
```

## Testing

Run tests to verify functionality:

```bash
npx vitest run tests/code-intelligence/visualization/
```

## Documentation

Full documentation:
- [Visualization Guide](./visualization.md)
- [Implementation Summary](./visualization-summary.md)
- [Code Intelligence](./README-code-intelligence.md)

---

**Quick Reference Version**: 1.0
**Last Updated**: 2025-12-22
