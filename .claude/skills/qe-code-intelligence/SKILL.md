---
name: "qe-code-intelligence"
description: "Build knowledge graphs, search code semantically, map dependencies, and reduce context window usage through intelligent retrieval. Use when understanding unfamiliar code or navigating large codebases."
---

# QE Code Intelligence

Knowledge graph construction, semantic code search, dependency mapping, and context-aware code understanding with token reduction.

## Quick Start

```bash
# Index codebase
aqe kg index --source src/ --incremental

# Semantic search
aqe kg search "authentication middleware" --limit 10

# Query dependencies
aqe kg deps --file src/services/UserService.ts --depth 3

# Get optimized context
aqe kg context --query "how does payment processing work"
```

## Workflow

### Step 1: Index Codebase

```typescript
await knowledgeGraph.index({
  source: 'src/**/*.ts',
  extraction: {
    entities: ['class', 'function', 'interface', 'type', 'variable'],
    relationships: ['imports', 'calls', 'extends', 'implements', 'uses'],
    metadata: ['jsdoc', 'complexity', 'lines']
  },
  embeddings: { model: 'code-embedding', dimensions: 384, normalize: true },
  incremental: true
});
```

**Checkpoint:** Verify entity count matches expected modules.

### Step 2: Semantic Search

```typescript
await semanticSearcher.search({
  query: 'payment processing with stripe',
  options: { similarity: 'cosine', threshold: 0.7, limit: 20, includeContext: true },
  filters: { fileTypes: ['.ts', '.tsx'], excludePaths: ['node_modules', 'dist'] }
});
```

### Step 3: Dependency Analysis

```typescript
await dependencyMapper.analyze({
  entry: 'src/services/OrderService.ts',
  depth: 3,
  direction: 'both',
  output: {
    graph: true,
    metrics: { afferentCoupling: true, efferentCoupling: true, instability: true }
  }
});
```

### Step 4: Optimized Context Retrieval

```typescript
const context = await codeIntelligence.getOptimizedContext({
  query: 'implement user registration',
  budget: 4000,  // max tokens
  strategy: { relevanceRanking: true, summarization: true, codeCompression: true, deduplication: true },
  include: { signatures: true, implementations: 'relevant-only', comments: 'essential', examples: 'top-3' }
});
```

Achieves ~80% token reduction vs. raw file reads.

## CLI Reference

```bash
aqe kg index --source src/ --force          # Full reindex
aqe kg search "database connection" --type function --file "*.service.ts"
aqe kg show --entity UserService --relations # Entity details
aqe kg export --format dot --output codebase.dot
aqe kg stats                                 # Graph statistics
```

## Gotchas

- code-intelligence domain has 18% success rate -- prefer direct grep/glob for simple queries
- Knowledge graph fails on repos > 50K LOC -- scope to specific modules
- Semantic search without domain-specific embeddings returns irrelevant results -- always verify manually
- Agent claims "80% token reduction" but may skip critical context -- verify key files are included
- Run `npx ruflo doctor --fix` if initialization errors occur

## Coordination

**Primary Agents**: qe-knowledge-graph, qe-semantic-searcher, qe-dependency-mapper
**Related Skills**: qe-test-generation, qe-defect-intelligence
