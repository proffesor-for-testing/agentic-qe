# Code Intelligence Domain

## Bounded Context Overview

**Domain**: Code Intelligence
**Responsibility**: Knowledge Graph construction, semantic search, and impact analysis
**Location**: `src/domains/code-intelligence/`

The Code Intelligence domain builds and maintains a Knowledge Graph of the codebase, enabling O(log n) semantic search via HNSW indexing and accurate change impact analysis.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Knowledge Graph** | Graph representation of code relationships |
| **Semantic Search** | Natural language code search |
| **Impact Analysis** | Determining affected code from changes |
| **Dependency Map** | Graph of code dependencies |
| **Index** | Searchable representation of codebase |
| **KG Node** | Entity in the Knowledge Graph |
| **KG Edge** | Relationship between nodes |

## Domain Model

### Aggregates

#### IndexResult (Aggregate Root)
Result of codebase indexing operation.

```typescript
interface IndexResult {
  filesIndexed: number;
  nodesCreated: number;
  edgesCreated: number;
  duration: number;
  errors: IndexError[];
}
```

#### ImpactAnalysis (Aggregate Root)
Complete change impact assessment.

```typescript
interface ImpactAnalysis {
  directImpact: ImpactedFile[];
  transitiveImpact: ImpactedFile[];
  impactedTests: string[];
  riskLevel: Severity;
  recommendations: string[];
}
```

### Entities

#### DependencyNode
Node in the dependency graph.

```typescript
interface DependencyNode {
  id: string;
  path: string;
  type: 'module' | 'class' | 'function' | 'file';
  inDegree: number;
  outDegree: number;
}
```

#### KGNode
Entity in the Knowledge Graph.

```typescript
interface KGNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}
```

#### SearchResult
Individual search match.

```typescript
interface SearchResult {
  file: string;
  line?: number;
  snippet: string;
  score: number;
  highlights: string[];
  metadata?: Record<string, unknown>;
}
```

### Value Objects

#### ImpactedFile
Immutable representation of affected file.

```typescript
interface ImpactedFile {
  readonly file: string;
  readonly reason: string;
  readonly distance: number;        // Graph distance from change
  readonly riskScore: number;
}
```

#### DependencyEdge
Immutable dependency relationship.

```typescript
interface DependencyEdge {
  readonly source: string;
  readonly target: string;
  readonly type: 'import' | 'call' | 'extends' | 'implements';
}
```

#### DependencyMetrics
Aggregate dependency statistics.

```typescript
interface DependencyMetrics {
  readonly totalNodes: number;
  readonly totalEdges: number;
  readonly avgDegree: number;
  readonly maxDepth: number;
  readonly cyclomaticComplexity: number;
}
```

#### SearchFilter
Search constraint specification.

```typescript
interface SearchFilter {
  readonly field: string;
  readonly operator: 'eq' | 'contains' | 'gt' | 'lt';
  readonly value: unknown;
}
```

## Domain Services

### CodeIntelligenceAPI
Primary API for the domain.

```typescript
interface CodeIntelligenceAPI {
  index(request: IndexRequest): Promise<Result<IndexResult, Error>>;
  search(request: SearchRequest): Promise<Result<SearchResults, Error>>;
  analyzeImpact(request: ImpactRequest): Promise<Result<ImpactAnalysis, Error>>;
  mapDependencies(request: DependencyRequest): Promise<Result<DependencyMap, Error>>;
  queryKG(request: KGQueryRequest): Promise<Result<KGQueryResult, Error>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `IndexCompletedEvent` | Indexing finished | `{ filesIndexed, nodesCreated, edgesCreated }` |
| `ImpactAnalyzedEvent` | Impact analysis done | `{ changedFiles, impactedFiles, riskLevel }` |
| `CycleDetectedEvent` | Dependency cycle found | `{ cycle, severity }` |
| `HotspotIdentifiedEvent` | High-coupling node found | `{ node, inDegree, outDegree }` |

## Knowledge Graph Schema

### Node Types

| Type | Properties | Description |
|------|------------|-------------|
| `File` | `path, language, size, lastModified` | Source file |
| `Module` | `name, path, exports` | ES/CJS module |
| `Class` | `name, file, methods, properties` | Class definition |
| `Function` | `name, file, params, async, exported` | Function definition |
| `Interface` | `name, file, properties` | TypeScript interface |
| `Test` | `name, file, type, assertions` | Test case |

### Edge Types

| Type | From | To | Description |
|------|------|-----|-------------|
| `IMPORTS` | Module | Module | Import relationship |
| `CALLS` | Function | Function | Function call |
| `EXTENDS` | Class | Class | Inheritance |
| `IMPLEMENTS` | Class | Interface | Implementation |
| `TESTS` | Test | Function/Class | Test target |
| `CONTAINS` | File | Class/Function | File contents |

## Search Capabilities

### Search Types

| Type | Use Case | Algorithm |
|------|----------|-----------|
| `semantic` | Natural language queries | HNSW + embeddings |
| `exact` | Precise string match | Inverted index |
| `fuzzy` | Approximate match | Levenshtein distance |

### Query Examples

```typescript
// Semantic search
const results = await api.search({
  query: "function that handles user authentication",
  type: 'semantic',
  limit: 10,
});

// Exact search with filters
const results = await api.search({
  query: "handleLogin",
  type: 'exact',
  filters: [
    { field: 'language', operator: 'eq', value: 'typescript' },
    { field: 'type', operator: 'eq', value: 'function' },
  ],
});

// Knowledge Graph query (Cypher)
const results = await api.queryKG({
  query: "MATCH (f:Function)-[:CALLS]->(g:Function) WHERE f.name = 'processOrder' RETURN g",
  type: 'cypher',
});

// Natural language KG query
const results = await api.queryKG({
  query: "What functions call the authentication service?",
  type: 'natural-language',
});
```

## Context Integration

### Upstream Dependencies
- AST parsers (ts-morph, babel, tree-sitter)
- Embedding models (transformers)

### Downstream Consumers
- **Test Generation**: Import paths, function signatures
- **Coverage Analysis**: File complexity
- **Defect Intelligence**: Dependency analysis
- **All Domains**: Semantic code search

### Anti-Corruption Layer
The domain abstracts different languages through language-specific AST parsers, exposing a unified Knowledge Graph interface.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `index-codebase` | `index()` | Build/update Knowledge Graph |
| `semantic-search` | `search()` | O(log n) code search |
| `analyze-impact` | `analyzeImpact()` | Change impact analysis |
| `map-dependencies` | `mapDependencies()` | Dependency graph |
| `query-kg` | `queryKG()` | Knowledge Graph queries |

## Impact Analysis Algorithm

```typescript
async function analyzeImpact(changedFiles: string[], depth: number): Promise<ImpactAnalysis> {
  const directImpact: ImpactedFile[] = [];
  const transitiveImpact: ImpactedFile[] = [];
  const visited = new Set<string>();

  // BFS to find impacted files
  const queue: Array<{ file: string; distance: number }> =
    changedFiles.map(f => ({ file: f, distance: 0 }));

  while (queue.length > 0) {
    const { file, distance } = queue.shift()!;

    if (visited.has(file) || distance > depth) continue;
    visited.add(file);

    const dependents = await getDependents(file);

    for (const dependent of dependents) {
      const impact: ImpactedFile = {
        file: dependent,
        reason: `Depends on ${file}`,
        distance: distance + 1,
        riskScore: calculateRiskScore(dependent, distance + 1),
      };

      if (distance === 0) {
        directImpact.push(impact);
      } else {
        transitiveImpact.push(impact);
      }

      queue.push({ file: dependent, distance: distance + 1 });
    }
  }

  return {
    directImpact,
    transitiveImpact,
    impactedTests: await findImpactedTests(visited),
    riskLevel: calculateOverallRisk(directImpact, transitiveImpact),
    recommendations: generateRecommendations(directImpact, transitiveImpact),
  };
}
```

## ADR References

- **ADR-006**: Unified Memory Service (KG storage)
- **ADR-009**: Hybrid Memory Backend (HNSW indexing)
