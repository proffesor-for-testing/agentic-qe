# RuVector Self-Learning Guide

> **Version:** 2.5.10 | **Phase:** 0.5 | **Status:** Production Ready

RuVector Self-Learning is an optional enhancement that enables your QE agents to continuously improve through pattern learning, neural graph networks (GNN), and anti-forgetting mechanisms (EWC++).

## What is RuVector Self-Learning?

RuVector is a PostgreSQL-based vector database with built-in machine learning capabilities that enables:

- **Pattern Learning**: Agents learn from successful test executions and reuse patterns
- **Semantic Search**: Find similar patterns in <1ms using vector similarity
- **Anti-Forgetting**: EWC++ ensures old patterns aren't forgotten when learning new ones
- **Neural Optimization**: GNN continuously improves pattern relationships

### Benefits

| Benefit | Description | Impact |
|---------|-------------|--------|
| **Faster Test Generation** | Reuse proven patterns instead of generating from scratch | 50%+ cache hit rate |
| **Better Quality** | Learn from successful patterns across your team | 20% better routing |
| **Lower Costs** | Reduce LLM calls through intelligent caching | 70-81% cost savings |
| **Pattern Retention** | Never lose learned patterns (EWC++ anti-forgetting) | >98% retention |

## Quick Start

### 1. Start RuVector Docker Container

```bash
docker run -d \
  --name ruvector \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=ruvector \
  ruvnet/ruvector:latest
```

### 2. Enable RuVector

Add to your `.env` file or export:

```bash
export AQE_RUVECTOR_ENABLED=true
```

### 3. Verify Connection

```bash
aqe ruvector status
```

Expected output:
```
✅ RuVector Status

Connection:
  Status:       Connected
  Health:       Healthy
  Extension:    Loaded

Data:
  Patterns:     0
  Queries:      0
  Cache Hits:   0

Configuration:
  Enabled:      Yes
  Host:         localhost
  Port:         5432
```

## CLI Commands

### Check Status

```bash
aqe ruvector status
aqe ruvector status --json  # JSON output for scripts
```

### View GOAP Metrics

```bash
aqe ruvector metrics
```

Shows:
- Pattern count and retention rate
- Query performance (latency, cache hits)
- GNN/LoRA/EWC++ status
- GOAP target compliance

### Force Learning Consolidation

```bash
aqe ruvector learn
```

Triggers:
- GNN graph optimization
- LoRA adapter updates
- EWC++ weight consolidation

### Detailed Health Check

```bash
aqe ruvector health
```

Checks:
- Docker container status
- PostgreSQL connection
- RuVector extension
- Environment configuration

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AQE_RUVECTOR_ENABLED` | `false` | Enable RuVector self-learning |
| `AQE_RUVECTOR_URL` | - | Full PostgreSQL connection URL |
| `RUVECTOR_HOST` | `localhost` | PostgreSQL host |
| `RUVECTOR_PORT` | `5432` | PostgreSQL port |
| `RUVECTOR_DATABASE` | `ruvector_db` | Database name |
| `RUVECTOR_USER` | `ruvector` | Database user |
| `RUVECTOR_PASSWORD` | `ruvector` | Database password |

### Connection URL Format

```bash
# Using individual variables (recommended)
export RUVECTOR_HOST=localhost
export RUVECTOR_PORT=5432
export RUVECTOR_DATABASE=ruvector_db
export RUVECTOR_USER=ruvector
export RUVECTOR_PASSWORD=your-secure-password

# Or using full URL
export AQE_RUVECTOR_URL=postgresql://ruvector:password@localhost:5432/ruvector_db
```

## Migration from memory.db

If you have existing patterns in memory.db, you can migrate them to RuVector:

### Preview Migration (Dry Run)

```bash
npx tsx scripts/migrate-patterns-to-ruvector.ts --dry-run
```

### Run Migration

```bash
npx tsx scripts/migrate-patterns-to-ruvector.ts --force
```

### Migration Options

| Option | Description |
|--------|-------------|
| `--source <path>` | Source database path (default: `~/.aqe/data/memory.db`) |
| `--dry-run` | Preview without making changes |
| `--batch-size <n>` | Batch size for migration (default: 100) |
| `--verbose` | Show detailed progress |
| `--force` | Skip confirmation prompt |

## How It Works

### Pattern Storage Flow

```
Test Execution → Generate Embedding → Store in RuVector → GNN Optimization
                      ↓
                768-dim vector
                      ↓
              pgvector similarity
                      ↓
              <1ms retrieval
```

### Learning Consolidation

When you run `aqe ruvector learn`:

1. **GNN (Graph Neural Network)**: Optimizes pattern relationships
2. **LoRA (Low-Rank Adaptation)**: Fine-tunes embeddings with <300MB memory
3. **EWC++ (Elastic Weight Consolidation)**: Prevents catastrophic forgetting

### GOAP Targets

| Metric | Target | Description |
|--------|--------|-------------|
| Cache Hit Rate | >50% | Patterns found without LLM calls |
| Search Latency | <1ms | Vector similarity search time |
| Pattern Retention | >98% | Old patterns retained after learning |
| LoRA Memory | <300MB | Memory constraint for adapters |

## Agent Integration

RuVector automatically integrates with these agents when enabled:

- **FlakyTestHunterAgent**: Stores flaky test patterns with stability scores
- **SecurityScannerAgent**: Stores vulnerability patterns with severity weights
- **All BaseAgent subclasses**: Pattern store available via `qePatternStore`

### Programmatic Usage

```typescript
import { createDockerRuVectorAdapter } from 'agentic-qe/providers';

// Create adapter
const adapter = createDockerRuVectorAdapter({
  host: 'localhost',
  port: 5432,
  database: 'ruvector_db',
  user: 'ruvector',
  password: 'ruvector',
  learningEnabled: true,
});

// Initialize
await adapter.initialize();

// Store pattern
const id = await adapter.store({
  embedding: generateEmbedding(content),
  content: JSON.stringify({ type: 'test-pattern', data }),
  metadata: { agent: 'test-generator', confidence: 0.95 }
});

// Search similar patterns
const results = await adapter.search(queryEmbedding, 10);

// Query with learning (cache + LLM fallback)
const result = await adapter.queryWithLearning(
  'Generate unit tests for UserService',
  queryEmbedding,
  async () => await llm.complete(prompt)
);

// Force learning consolidation
await adapter.forceLearn();

// Get metrics
const metrics = await adapter.getMetrics();
console.log(`Patterns: ${metrics.patternCount}, Cache hits: ${metrics.cacheHitRate * 100}%`);
```

## Docker Compose Setup

For production deployments, use Docker Compose:

```yaml
# docker-compose.yml
version: '3.8'
services:
  ruvector:
    image: ruvnet/ruvector:latest
    container_name: ruvector
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_PASSWORD=ruvector
      - POSTGRES_USER=ruvector
      - POSTGRES_DB=ruvector_db
    volumes:
      - ruvector_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ruvector -d ruvector_db"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  ruvector_data:
```

Start with:
```bash
docker-compose up -d ruvector
```

## Troubleshooting

### Connection Failed

```bash
# Check if Docker container is running
docker ps | grep ruvector

# Check container logs
docker logs ruvector

# Restart container
docker restart ruvector
```

### Extension Not Loaded

```bash
# Connect to PostgreSQL and check extension
docker exec -it ruvector psql -U ruvector -d ruvector_db -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### High Latency

In development environments (DevPod, Codespaces), expect higher latency due to Docker network overhead:
- **Production target**: <1ms
- **DevPod/Docker**: <500ms acceptable

### Memory Issues

LoRA adapters are constrained to <300MB. If you see memory warnings:

```bash
# Force learning to consolidate patterns
aqe ruvector learn
```

## FAQ

**Q: Do I need RuVector to use Agentic QE?**
A: No. RuVector is optional. Without it, agents use local HNSW pattern store (memory.db).

**Q: Will enabling RuVector affect existing patterns?**
A: No. RuVector is additive. Existing patterns in memory.db continue to work.

**Q: Can I disable RuVector after enabling it?**
A: Yes. Set `AQE_RUVECTOR_ENABLED=false`. Agents will fall back to local storage.

**Q: Is RuVector required for production?**
A: Recommended but not required. It provides better performance and cross-team learning.

**Q: How do I backup RuVector data?**
A: Use standard PostgreSQL backup tools:
```bash
docker exec ruvector pg_dump -U ruvector ruvector_db > backup.sql
```

## See Also

- [Agent Learning System Architecture](../architecture/agent-learning-system.md)
- [Phase 0.5 Planning Document](../planning/v2.4.0-phase0.5-ruvector-self-learning.md)
- [HybridRouter Integration](../agentics/M0.5.3-HybridRouter-RuVector-Integration-Complete.md)
