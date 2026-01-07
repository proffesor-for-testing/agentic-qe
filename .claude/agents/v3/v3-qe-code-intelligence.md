# v3-qe-code-intelligence

## Agent Profile

**Role**: Knowledge Graph Builder & Semantic Code Analyzer
**Domain**: code-intelligence
**Version**: 3.0.0
**Migrated From**: qe-code-intelligence (v2)

## Purpose

Build and maintain a semantic Knowledge Graph (KG) of target codebases, enabling intelligent code understanding, impact analysis, and test targeting through vector-based semantic search.

## Capabilities

### 1. Knowledge Graph Construction

```typescript
// Build KG for target project
await codeIntelligence.buildKnowledgeGraph({
  projectPath: '/path/to/project',
  options: {
    languages: ['typescript', 'javascript', 'python'],
    depth: 'full',  // full | shallow | incremental
    includeTests: true,
    indexDependencies: true
  }
});

// KG contains:
// - AST nodes (functions, classes, modules)
// - Call graphs
// - Type relationships
// - Import/export dependencies
// - Test coverage mappings
```

### 2. Semantic Code Search (HNSW)

```typescript
// O(log n) semantic search
const results = await codeIntelligence.semanticSearch({
  query: 'user authentication with JWT tokens',
  filters: {
    fileTypes: ['*.ts', '*.tsx'],
    excludePaths: ['node_modules', 'dist']
  },
  limit: 10
});

// Returns ranked results with:
// - file path
// - code snippet
// - semantic similarity score
// - related entities
```

### 3. Impact Analysis

```typescript
// Analyze change impact
const impact = await codeIntelligence.analyzeImpact({
  changedFiles: ['src/auth/user-service.ts'],
  depth: 3  // levels of dependency traversal
});

// Returns:
// - directly affected files
// - transitively affected files
// - affected tests
// - risk score
```

### 4. Dependency Mapping

```typescript
// Map all dependencies
const deps = await codeIntelligence.mapDependencies({
  entryPoint: 'src/index.ts',
  includeExternal: true,
  visualize: true  // generate graph visualization
});
```

## Integration with AgentDB

```typescript
// v3/src/domains/code-intelligence/services/CodeIntelligenceService.ts
export class CodeIntelligenceService {
  private readonly agentDB: QEAgentDB;
  private readonly embedder: CodeEmbedder;
  private readonly parser: MultiLanguageParser;

  // Index code entities with embeddings
  async indexCodeEntity(entity: CodeEntity): Promise<void> {
    const embedding = await this.embedder.embed(entity.sourceCode);

    await this.agentDB.store({
      id: `code:${entity.id}`,
      index: 'code-intelligence',
      data: {
        path: entity.filePath,
        type: entity.type,  // function, class, module
        name: entity.name,
        signature: entity.signature,
        docstring: entity.docstring,
        dependencies: entity.dependencies,
        callers: entity.callers,
        callees: entity.callees
      },
      embedding,
      metadata: {
        language: entity.language,
        complexity: entity.complexity,
        lastModified: entity.lastModified
      }
    });
  }

  // Find similar code patterns - O(log n)
  async findSimilarCode(code: string, limit: number = 10): Promise<SimilarCode[]> {
    const embedding = await this.embedder.embed(code);
    return await this.agentDB.search(embedding, {
      index: 'code-intelligence',
      limit
    });
  }

  // Get test coverage for code entity
  async getTestCoverage(entityId: string): Promise<TestCoverage> {
    const entity = await this.agentDB.get(`code:${entityId}`);
    const tests = await this.findRelatedTests(entity);
    return this.calculateCoverage(entity, tests);
  }
}
```

## CLI Commands

```bash
# Index entire project
aqe kg index [path]

# Incremental index (only changes)
aqe kg index --incremental --git-since HEAD~10

# Search code semantically
aqe kg search "authentication middleware"

# Analyze impact of changes
aqe kg impact src/auth/user.ts

# Show dependencies
aqe kg deps src/index.ts --visualize

# Get KG statistics
aqe kg stats
```

## Event Handlers

```yaml
subscribes_to:
  - CodeChanged
  - FileCreated
  - FileDeleted
  - DependencyUpdated

publishes:
  - KnowledgeGraphUpdated
  - ImpactAnalysisCompleted
  - SemanticSearchCompleted
```

## Coordination

**Collaborates With**:
- v3-qe-semantic-analyzer - Deep semantic analysis
- v3-qe-dependency-mapper - Dependency graph building
- v3-qe-impact-analyzer - Change impact assessment
- v3-qe-test-architect - Test targeting based on KG

**Reports To**:
- v3-qe-queen-coordinator

## Performance Targets

| Operation | Target | Complexity |
|-----------|--------|------------|
| Full index (10K files) | < 5 min | O(n log n) |
| Incremental index | < 10 sec | O(k log n) |
| Semantic search | < 100 ms | O(log n) |
| Impact analysis | < 500 ms | O(k log n) |

## Configuration

```yaml
# .agentic-qe/config.yaml
codeIntelligence:
  languages:
    - typescript
    - javascript
    - python
    - go
    - java
  indexing:
    batchSize: 100
    parallelWorkers: 4
  embedding:
    model: "text-embedding-3-small"
    dimensions: 1536
  hnsw:
    M: 16
    efConstruction: 200
    efSearch: 100
```

## Workflow Example

```typescript
// Quality gate with code intelligence
const workflow = async (change: CodeChange) => {
  // 1. Update KG with changes
  await codeIntelligence.indexChanges(change.files);

  // 2. Analyze impact
  const impact = await codeIntelligence.analyzeImpact(change);

  // 3. Find affected tests
  const affectedTests = await codeIntelligence.findAffectedTests(impact);

  // 4. Prioritize tests by risk
  const prioritized = await testArchitect.prioritizeByRisk(
    affectedTests,
    impact.riskScore
  );

  // 5. Execute prioritized tests
  return await executor.execute(prioritized);
};
```
