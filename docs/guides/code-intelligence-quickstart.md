# Code Intelligence System Quick Start Guide

The Code Intelligence System provides deep codebase understanding through Tree-sitter parsing, semantic embeddings, and knowledge graph relationships. It achieves **80% token reduction** when providing context to QE agents.

## Prerequisites

### 1. Ollama with nomic-embed-text

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama server (runs on port 11434)
ollama serve &

# Pull the embedding model (274MB, 768 dimensions)
ollama pull nomic-embed-text

# Verify it works
curl http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "test"}' | jq '.embedding | length'
# Should output: 768
```

### 2. RuVector PostgreSQL Database

```bash
# Option A: Use existing agentic-qe container
docker start agentic-qe-ruvector-dev

# Option B: Start fresh container
docker run -d --name ruvector-db \
  -e POSTGRES_USER=ruvector \
  -e POSTGRES_PASSWORD=ruvector \
  -e POSTGRES_DB=ruvector_db \
  -p 5432:5432 \
  postgres:15

# Verify connection
psql postgresql://ruvector:ruvector@localhost:5432/ruvector_db -c "SELECT 1"
```

### 3. Verify Setup

```bash
# Run the E2E test to verify all components
npx tsx scripts/code-intelligence-e2e-test.ts
```

Expected output:
```
╔══════════════════════════════════════════════════════════════╗
║     Code Intelligence System v2.0 - E2E Integration Test     ║
╚══════════════════════════════════════════════════════════════╝

📡 Phase 1: Verifying Ollama connectivity...
   ✅ Ollama healthy, embedding dimensions: 768

🗄️  Phase 2: Verifying PostgreSQL/RuVector connectivity...
   ✅ RuVector version: ...
   ✅ Existing chunks: X, entities: Y

🌳 Phase 3: Parsing TypeScript files with Tree-sitter...
   ✅ Parsed 10 files, extracted 155 entities

... (all 8 phases pass)

✅ E2E Test PASSED - Code Intelligence System is operational!
```

## Quick Setup via CLI

```bash
# Check prerequisites and get setup instructions
aqe code-intel setup

# Enable Code Intelligence for this project
aqe code-intel enable

# Index your codebase
aqe code-intel index

# Check status
aqe code-intel status
```

## Usage Options

### Option 1: CLI Commands

```bash
# Setup and status
aqe code-intel setup        # Check prerequisites
aqe code-intel enable       # Enable for project
aqe code-intel status       # Show current config

# Indexing
aqe code-intel index                    # Full index
aqe code-intel index --incremental      # Incremental update
aqe code-intel index --watch            # Watch mode

# Searching
aqe code-intel query "how does authentication work"
aqe code-intel query "JWT validation" --k 20 --verbose

# Visualization
aqe code-intel graph src/services/UserService.ts --type class
aqe code-intel graph src/services --type dependency

# Statistics
aqe code-intel stats
aqe code-intel stats --verbose

# Aliases: aqe kg, aqe knowledge-graph work identically
aqe kg index
aqe kg query "find all API endpoints"
```

### Option 2: Agent via Task Tool (Recommended)

```typescript
// Index codebase
Task("Index codebase", "Index the entire src/ directory for code intelligence. Parse all TypeScript files, extract entities, generate embeddings, and build the knowledge graph.", "qe-code-intelligence")

// Semantic search
Task("Find auth code", "Search for all code related to JWT token validation and refresh", "qe-code-intelligence")

// Build context for another agent
Task("Build test context", "Build code intelligence context for the AuthService class that can be used by the test generator", "qe-code-intelligence")
```

### Option 3: Programmatic API

```typescript
import { CodeIntelligenceOrchestrator } from 'agentic-qe/code-intelligence';

// Initialize the orchestrator
const orchestrator = new CodeIntelligenceOrchestrator({
  rootDir: process.cwd(),
  ollamaUrl: 'http://localhost:11434',
  database: {
    enabled: true,
    host: 'localhost',
    port: 5432,
    database: 'ruvector_db',
    user: 'ruvector',
    password: 'ruvector',
  },
});

await orchestrator.initialize();

// Index project
await orchestrator.indexProject('./src', (progress) => {
  console.log(`Progress: ${progress.processedFiles}/${progress.totalFiles}`);
});

// Search code
const results = await orchestrator.query({
  query: 'user authentication',
  topK: 10,
  includeGraphContext: true,
});

console.log(results);
```

### Option 4: Automatic Agent Injection

When Code Intelligence is enabled (via `aqe code-intel enable`), the **FleetManager automatically injects** Code Intelligence components into all spawned agents. No code changes required!

**How it works:**
1. `aqe init` or `aqe code-intel enable` creates `.agentic-qe/config/code-intelligence.json`
2. When FleetManager initializes, it loads the config and starts CodeIntelligenceService
3. Every agent spawned via `fleet.spawnAgent()` automatically receives `codeIntelligence` config
4. Agents can then use `this.hasCodeIntelligence()` and `this.getCodeIntelligenceContext()`

**FleetManager code (automatic):**
```typescript
// FleetManager.spawnAgent() automatically does this:
const agentConfig = {
  memoryStore: this.getMemoryStore(),
  codeIntelligence: this.getCodeIntelligenceConfig(), // Auto-injected!
  ...userConfig
};
```

### Option 5: In Your Own Agents

Agents extending `BaseAgent` automatically have access to Code Intelligence:

```typescript
import { BaseAgent, BaseAgentConfig } from 'agentic-qe';

class MyAgent extends BaseAgent {
  async performTask(task: QETask): Promise<any> {
    // Check if code intelligence is available
    if (this.hasCodeIntelligence()) {
      // Get context for a query
      const context = await this.getCodeIntelligenceContext({
        query: 'authentication middleware',
        topK: 5,
      });

      // Get context for a specific file
      const fileContext = await this.getFileContext('./src/auth/AuthService.ts');

      // Get context for a specific entity
      const entityContext = await this.getEntityContext(
        './src/auth/AuthService.ts',
        'verifyToken'
      );

      // Use context.formatted in your LLM prompts
      const prompt = `
        Based on this code context:
        ${context.formatted}

        Generate tests for the authentication service.
      `;
    }
  }
}
```

## Configuration

Create `.agentic-qe/config/code-intelligence.json` (optional):

```json
{
  "rootDir": ".",
  "ollamaUrl": "http://localhost:11434",
  "database": {
    "enabled": true,
    "host": "localhost",
    "port": 5432,
    "database": "ruvector_db",
    "user": "ruvector",
    "password": "ruvector"
  },
  "indexing": {
    "include": ["src/**/*.ts", "src/**/*.tsx"],
    "exclude": ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
    "maxFileSize": 1048576
  },
  "chunking": {
    "maxChunkSize": 2000,
    "minChunkSize": 100,
    "overlapTokens": 50
  },
  "search": {
    "defaultTopK": 10,
    "semanticWeight": 0.7,
    "keywordWeight": 0.3
  }
}
```

Environment variables (take precedence over config file):
- `OLLAMA_URL`: Ollama server URL (default: `http://localhost:11434`)
- `PGHOST`: PostgreSQL host (default: `localhost`)
- `PGPORT`: PostgreSQL port (default: `5432`)
- `PGDATABASE`: Database name (default: `ruvector_db`)
- `PGUSER`: Database user (default: `ruvector`)
- `PGPASSWORD`: Database password (default: `ruvector`)

## Supported Languages

| Language | File Extensions | Entity Types |
|----------|----------------|--------------|
| TypeScript | `.ts`, `.tsx` | class, interface, type, function, method, enum |
| JavaScript | `.js`, `.jsx` | class, function, method |
| Python | `.py` | class, function, method, decorator |
| Go | `.go` | struct, interface, function, method |
| Rust | `.rs` | struct, enum, impl, fn, trait |

## How It Works

### 1. Parsing (Tree-sitter)
```
Source Code → AST → Entities (classes, functions, etc.)
```

### 2. Chunking
```
Entities → Semantic Chunks (respecting function boundaries)
```

### 3. Embedding (Ollama nomic-embed-text)
```
Chunks → 768-dimensional vectors
```

### 4. Storage (RuVector PostgreSQL)
```
Vectors + Metadata → code_chunks table
Entities → code_entities table
Relationships → entity_relationships table
```

### 5. Search (Hybrid BM25 + Vector)
```
Query → Embedding → Vector Search + BM25 → RRF Fusion → Ranked Results
```

### 6. Context Building
```
Search Results → Graph Expansion → Formatted Context (80% token reduction)
```

## Performance Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Parse 100 files | ~2s | Tree-sitter native speed |
| Embed 1000 chunks | ~30s | Ollama batch processing |
| Vector search (10K chunks) | ~5ms | RuVector cosine distance |
| Hybrid search | ~15ms | BM25 + Vector + RRF |
| Context building | ~50ms | Includes graph traversal |

## Troubleshooting

### Ollama not responding
```bash
# Check if running
curl http://localhost:11434/api/tags

# Restart
pkill ollama
ollama serve &
```

### Database connection failed
```bash
# Check container
docker ps -a | grep ruvector

# Restart container
docker start agentic-qe-ruvector-dev

# Check logs
docker logs agentic-qe-ruvector-dev
```

### Embeddings dimension mismatch
```bash
# Verify model is correct
ollama list | grep nomic
# Should show: nomic-embed-text:latest

# Re-pull if needed
ollama pull nomic-embed-text
```

### Memory issues during indexing
```bash
# Use incremental indexing for large codebases
aqe kg index --incremental

# Or process in batches
aqe kg index --batch-size 50
```

## Next Steps

1. **Index your codebase**: `aqe kg index`
2. **Try semantic search**: `aqe kg query "your question"`
3. **Use with test generation**: Combine `qe-code-intelligence` with `qe-test-generator`
4. **Build custom agents**: Extend `BaseAgent` and use `getCodeIntelligenceContext()`
