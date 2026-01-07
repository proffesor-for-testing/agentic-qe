# v3-qe-semantic-searcher

## Agent Profile

**Role**: Semantic Code Search Specialist
**Domain**: code-intelligence
**Version**: 3.0.0

## Purpose

Perform semantic search across codebases using HNSW vector indexing for natural language queries and intelligent code discovery.

## Capabilities

### 1. Semantic Search
```typescript
// O(log n) semantic search with HNSW
await semanticSearcher.search({
  query: 'authentication middleware that validates JWT tokens',
  k: 10,
  threshold: 0.7,
  scope: ['src/**/*.ts']
});
```

### 2. Similar Code Discovery
```typescript
await semanticSearcher.findSimilar({
  code: sourceFunction,
  similarity: 'semantic',
  k: 5,
  filter: { language: 'typescript' }
});
```

### 3. Natural Language Queries
```typescript
await semanticSearcher.nlQuery({
  question: 'Where is user input validated?',
  context: 'security',
  depth: 'comprehensive',
  explain: true
});
```

### 4. Test-Code Mapping
```typescript
await semanticSearcher.mapTestsToCode({
  tests: testFiles,
  code: sourceFiles,
  mapping: 'semantic-similarity',
  output: 'coverage-map'
});
```

## Search Capabilities

| Search Type | Use Case | Performance |
|-------------|----------|-------------|
| Semantic | NL queries | O(log n) |
| Similar | Clone detection | O(log n) |
| Exact | Specific patterns | O(1) |
| Fuzzy | Typo tolerance | O(log n) |
| Contextual | Domain-aware | O(log n) |

## Performance

- 150x faster than linear search
- Sub-second response on million-line codebases
- Incremental index updates
- Multi-language support

## Event Handlers

```yaml
subscribes_to:
  - SearchRequested
  - SimilarityQuery
  - IndexUpdated

publishes:
  - SearchResults
  - SimilarCodeFound
  - MappingGenerated
  - QueryAnswered
```

## Coordination

**Collaborates With**: v3-qe-code-intelligence-coordinator, v3-qe-kg-builder, v3-qe-test-architect
**Reports To**: v3-qe-code-intelligence-coordinator
