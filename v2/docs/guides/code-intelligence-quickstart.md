# Code Intelligence System Quick Start Guide

The Code Intelligence System provides deep codebase understanding through Tree-sitter parsing, semantic embeddings, and knowledge graph relationships. It achieves **80% token reduction** when providing context to QE agents.

> 📊 **Benchmark Results**: See [Token Reduction Benchmark](../benchmarks/code-intelligence-token-reduction.md) for detailed performance analysis showing 79.9% token reduction and 92% context relevance.

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

Code Intelligence requires PostgreSQL with vector search capability. Use the `ruvnet/ruvector` image which includes the RuVector extension pre-installed.

**Option A: Quick Docker run**
```bash
docker run -d \
  --name ruvector-db \
  -p 5432:5432 \
  -e POSTGRES_USER=ruvector \
  -e POSTGRES_PASSWORD=ruvector \
  -e POSTGRES_DB=ruvector_db \
  -v ruvector-data:/var/lib/postgresql/data \
  ruvnet/ruvector:latest
```

**Option B: Using docker-compose** (recommended for projects)

Create a `docker-compose.yml` in your project:
```yaml
version: '3.8'
services:
  ruvector:
    image: ruvnet/ruvector:latest
    container_name: ruvector-db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ruvector
      POSTGRES_PASSWORD: ruvector
      POSTGRES_DB: ruvector_db
    volumes:
      - ruvector-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ruvector -d ruvector_db"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  ruvector-data:
```

Then start with:
```bash
docker-compose up -d
```

**Verify connection:**
```bash
# Check container is running
docker ps | grep ruvector

# Test database connection
docker exec ruvector-db psql -U ruvector -d ruvector_db -c "SELECT 1"
```

> ⚠️ **Important**: Do NOT use plain `postgres:15` - it lacks the vector extension required for semantic search.

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
# Index your codebase (after starting Ollama + PostgreSQL)
aqe kg index

# Check indexing statistics
aqe kg stats

# Search code semantically
aqe kg query "how does authentication work"
```

## Usage Options

### Option 1: CLI Commands (`aqe kg`)

```bash
# Indexing
aqe kg index                    # Full index
aqe kg index --incremental      # Incremental update
aqe kg index --watch            # Watch mode
aqe kg index --git-since v2.6.0 # Index changes since a git ref

# Searching
aqe kg query "how does authentication work"
aqe kg query "JWT validation" --k 20 --verbose

# Visualization
aqe kg graph src/services/UserService.ts --type class
aqe kg graph src/services --type dependency

# C4 Architecture Diagrams
aqe kg c4-context              # System context diagram
aqe kg c4-container            # Container diagram
aqe kg c4-component            # Component diagram

# Statistics
aqe kg stats
aqe kg stats --verbose

# Module Coupling Analysis
aqe kg mincut coupling-all     # Find highly coupled modules
aqe kg mincut circular         # Detect circular dependencies
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

When Code Intelligence is enabled (via `aqe kg index`), the **FleetManager automatically injects** Code Intelligence components into all spawned agents. No code changes required!

**How it works:**
1. `aqe init` creates `.agentic-qe/config/code-intelligence.json`
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
# Check if container exists and is running
docker ps -a | grep ruvector

# Start container if stopped
docker start ruvector-db

# Check container logs for errors
docker logs ruvector-db --tail 50

# Test connection from inside container
docker exec ruvector-db psql -U ruvector -d ruvector_db -c "SELECT 1"

# If container doesn't exist, create it (see Prerequisites section)
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
