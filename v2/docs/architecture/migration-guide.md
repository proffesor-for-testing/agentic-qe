# Pattern Migration Guide - AgentDB to RuVector

Complete guide for migrating test patterns from AgentDB (SQLite) to RuVector high-performance vector database.

## Table of Contents

- [Overview](#overview)
- [Why Migrate?](#why-migrate)
- [Migration Strategies](#migration-strategies)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Programmatic API](#programmatic-api)
- [Migration Process](#migration-process)
- [Dual-Write Pattern](#dual-write-pattern)
- [Rollback & Recovery](#rollback--recovery)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)

## Overview

The Pattern Migration Tools provide a comprehensive solution for transitioning from AgentDB's SQLite-based pattern storage to RuVector's high-performance vector database backend.

**Key Benefits:**
- **170x faster search** (1.5µs p50 vs 255µs baseline)
- **192K QPS** (53x higher throughput)
- **2.7M+ ops/sec** batch insert performance
- **18% less memory** usage
- Native HNSW indexing for optimal similarity search

## Why Migrate?

### Performance Comparison

| Metric | AgentDB (SQLite) | RuVector | Improvement |
|--------|------------------|----------|-------------|
| Search p50 | 255 µs | 1.5 µs | **170x faster** |
| QPS | 3,600 | 192,840 | **53x higher** |
| Batch Insert | 20,982 ops/s | 2,703,923 ops/s | **129x faster** |
| Memory Usage | Baseline | -18% | **18% less** |

### When to Migrate

✅ **Migrate if:**
- Pattern search is a performance bottleneck
- You need real-time pattern similarity search
- Scaling to millions of patterns
- Building production QE systems

⏸️ **Wait if:**
- Pattern count < 1000
- Search performance is acceptable
- Development/testing environment only
- Need AgentDB's advanced learning features (for now)

## Migration Strategies

### 1. One-Time Migration (Recommended for Small Datasets)

Complete migration in a single operation with automatic backup.

```bash
# Dry-run first
npx tsx scripts/migrate-patterns.ts --dry-run --verbose

# Full migration
npx tsx scripts/migrate-patterns.ts --verbose
```

**Best for:**
- < 100K patterns
- Can tolerate brief downtime
- Testing/development environments

### 2. Dual-Write Migration (Zero-Downtime)

Write to both backends during transition period.

```typescript
import { createDualWriteProxy } from './src/core/memory/MigrationTools';

// Initialize dual-write proxy
const proxy = await createDualWriteProxy(
  { storagePath: './data/patterns.ruvector' },  // Primary (RuVector)
  { storagePath: './data/patterns-backup.db' }  // Secondary (AgentDB)
);

// Use proxy as normal pattern store
await proxy.storePattern(pattern);
```

**Best for:**
- Production environments
- Large datasets (100K+ patterns)
- Zero-downtime requirement
- Gradual rollout

### 3. Batch Migration (Large Datasets)

Migrate in smaller chunks over time.

```typescript
const migrator = new PatternMigrator();

// Migrate in batches of 10K patterns
await migrator.migrate({
  sourcePath: './data/agentic-qe.db',
  targetPath: './data/patterns.ruvector',
  batchSize: 10000,
  verbose: true
});
```

**Best for:**
- Very large datasets (1M+ patterns)
- Resource-constrained environments
- Controlled migration pace

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install better-sqlite3 @ruvector/core

# Verify RuVector availability
npx tsx -e "const {isRuVectorAvailable} = require('./src/core/memory/RuVectorPatternStore'); console.log('RuVector available:', isRuVectorAvailable())"
```

### Step-by-Step Migration

**Step 1: Validate Source**

```bash
# Check if source database is valid
npx tsx scripts/migrate-patterns.ts --dry-run --verbose
```

**Step 2: Create Backup (Optional but Recommended)**

```bash
# Backup is created automatically by default
# To skip backup (not recommended):
# npx tsx scripts/migrate-patterns.ts --no-backup
```

**Step 3: Run Migration**

```bash
# Full migration with default settings
npx tsx scripts/migrate-patterns.ts --verbose

# Custom paths
npx tsx scripts/migrate-patterns.ts \
  --source ./data/custom.db \
  --target ./data/custom.ruvector \
  --batch-size 5000 \
  --verbose
```

**Step 4: Verify Migration**

```bash
# Check migration status
npx tsx scripts/migrate-patterns.ts --status --verbose
```

**Step 5: Update Application Code**

```typescript
// Before (AgentDB)
import { PatternDatabaseAdapter } from './core/PatternDatabaseAdapter';

// After (RuVector)
import { PatternStoreFactory } from './core/memory/PatternStoreFactory';

const { store } = await PatternStoreFactory.create({
  preferredBackend: 'ruvector',
  storagePath: './data/patterns.ruvector'
});
```

## CLI Reference

### Commands

```bash
# Basic migration
npx tsx scripts/migrate-patterns.ts

# Dry-run (validate without writing)
npx tsx scripts/migrate-patterns.ts --dry-run

# Custom configuration
npx tsx scripts/migrate-patterns.ts \
  --source ./data/old.db \
  --target ./data/new.ruvector \
  --batch-size 1000 \
  --dimension 384 \
  --verbose

# Check status
npx tsx scripts/migrate-patterns.ts --status

# Rollback
npx tsx scripts/migrate-patterns.ts --rollback
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--source <path>` | Source AgentDB database | `./data/agentic-qe.db` |
| `--target <path>` | Target RuVector path | `./data/patterns.ruvector` |
| `--dry-run` | Validate without writing | `false` |
| `--batch-size <n>` | Patterns per batch | `1000` |
| `--no-backup` | Skip backup creation | `false` (backup enabled) |
| `--dimension <n>` | Embedding dimension | `384` |
| `--verbose` | Enable verbose logging | `false` |
| `--status` | Check migration status | - |
| `--rollback` | Rollback last migration | - |
| `--help` | Show help message | - |

## Programmatic API

### Basic Migration

```typescript
import { PatternMigrator } from './src/core/memory/MigrationTools';

const migrator = new PatternMigrator();

const result = await migrator.migrate({
  sourcePath: './data/agentic-qe.db',
  targetPath: './data/patterns.ruvector',
  batchSize: 1000,
  verbose: true
});

console.log(`Migrated ${result.migratedCount} patterns in ${result.duration}ms`);
```

### Custom Embedding Generator

```typescript
import { PatternMigrator } from './src/core/memory/MigrationTools';
import { EmbeddingGenerator } from './utils/embeddings';

const generator = new EmbeddingGenerator();

const migrator = new PatternMigrator();

await migrator.migrate({
  sourcePath: './data/agentic-qe.db',
  targetPath: './data/patterns.ruvector',
  generateEmbedding: async (pattern) => {
    // Generate semantic embedding from pattern content
    return await generator.embed(pattern.template);
  },
  verbose: true
});
```

### Dual-Write Proxy

```typescript
import { DualWriteProxy } from './src/core/memory/MigrationTools';
import { RuVectorPatternStore } from './src/core/memory/RuVectorPatternStore';

// Create stores
const primary = new RuVectorPatternStore({
  storagePath: './data/patterns.ruvector'
});

const secondary = new RuVectorPatternStore({
  storagePath: './data/patterns-backup.ruvector'
});

// Create proxy
const proxy = new DualWriteProxy(primary, secondary);
await proxy.initialize();

// Use as normal IPatternStore
await proxy.storePattern(pattern);
const results = await proxy.searchSimilar(embedding, { k: 10 });
```

## Migration Process

### What Gets Migrated

**Pattern Data:**
- ✅ Pattern ID, name, description
- ✅ Category, framework, language
- ✅ Template and examples
- ✅ Confidence, usage count, success rate
- ✅ Quality scores
- ✅ Metadata (JSON)
- ✅ Created/updated timestamps

**Transformations:**
- Pattern content is constructed from template + examples
- Quality score maps to `coverage` field
- Success rate determines `verdict` (success/flaky/failure)
- Flakiness score computed from success rate
- Original fields preserved in metadata

**Generated:**
- ⚠️ Embeddings (generated if missing)
- You can provide custom embedding generator
- Default: normalized random embeddings (for testing)

### What Doesn't Migrate

**Not migrated (AgentDB-specific):**
- ❌ Pattern usage history (separate table)
- ❌ Learning history (separate table)
- ❌ Learning metrics (separate table)

**Workaround:** Export these separately if needed for analytics.

## Dual-Write Pattern

For zero-downtime production migrations:

### Phase 1: Setup Dual-Write

```typescript
import { createDualWriteProxy } from './src/core/memory/MigrationTools';

// Initialize dual-write
const proxy = await createDualWriteProxy(
  { storagePath: './data/patterns.ruvector' },    // Primary (new)
  { storagePath: './data/agentic-qe.db' }         // Secondary (old)
);

// Replace existing store with proxy
// All writes go to both, reads from RuVector
app.patternStore = proxy;
```

### Phase 2: Backfill Historical Data

```bash
# Migrate existing patterns to RuVector
npx tsx scripts/migrate-patterns.ts --verbose
```

### Phase 3: Monitor & Validate

```typescript
// Verify consistency
const stats = await proxy.getStats();
console.log('RuVector patterns:', stats.count);

// Check for errors
// Monitor logs for "Secondary store write failed"
```

### Phase 4: Cut Over

```typescript
// Once confident, switch to RuVector only
const { store } = await PatternStoreFactory.create({
  preferredBackend: 'ruvector',
  storagePath: './data/patterns.ruvector'
});

app.patternStore = store;
```

## Rollback & Recovery

### Automatic Backup

Migrations create automatic backups with timestamps:

```
data/
  agentic-qe.db                          # Original
  agentic-qe.backup-2025-11-30T12-00.db  # Auto backup
```

### Rollback Procedure

```bash
# Rollback using CLI
npx tsx scripts/migrate-patterns.ts --rollback --verbose

# Manual rollback
cp data/agentic-qe.backup-2025-11-30T12-00.db data/agentic-qe.db
```

### Rollback via API

```typescript
const migrator = new PatternMigrator();

// Run migration
await migrator.migrate({
  sourcePath: './data/agentic-qe.db',
  targetPath: './data/patterns.ruvector',
  createBackup: true
});

// If issues occur, rollback
await migrator.rollback();
```

### Recovery from Failed Migration

```typescript
// Check what went wrong
const result = await migrator.migrate({ dryRun: true, verbose: true });

console.log('Errors:', result.errors);
console.log('Validation:', result.validation);

// Fix issues and retry
await migrator.migrate({ verbose: true });
```

## Performance

### Batch Size Tuning

| Pattern Count | Recommended Batch Size | Estimated Duration |
|---------------|------------------------|-------------------|
| < 1K | 100 | < 1 second |
| 1K - 10K | 500 | 1-5 seconds |
| 10K - 100K | 1000 | 5-30 seconds |
| 100K - 1M | 5000 | 30-300 seconds |
| > 1M | 10000 | 5-30 minutes |

### Memory Usage

| Operation | Memory Impact | Recommendation |
|-----------|---------------|----------------|
| Export from SQLite | Low (streaming) | No limits |
| Batch processing | `batchSize * pattern_size` | Keep batch < 10K |
| RuVector insertion | Native optimized | Use batch insert |
| Index building | ~2x vector data | Plan for headroom |

### Optimization Tips

1. **Use Batch Insert** - 129x faster than individual inserts
2. **Tune HNSW Parameters** - Higher M = better recall but slower
3. **Enable Metrics** - Track performance in production
4. **Pre-allocate Storage** - Avoid fragmentation
5. **Parallel Processing** - For multiple databases

Example optimized config:

```typescript
await migrator.migrate({
  batchSize: 5000,        // Optimal for most datasets
  dimension: 384,         // Standard embedding size
  verbose: false,         // Reduce I/O overhead
  createBackup: true      // Safety first
});
```

## Troubleshooting

### Common Issues

**Issue: "Source database validation failed"**

```bash
# Check if file exists
ls -lh ./data/agentic-qe.db

# Verify SQLite format
sqlite3 ./data/agentic-qe.db "SELECT COUNT(*) FROM patterns"
```

**Issue: "RuVector native backend not available"**

```bash
# Check platform support
node -e "console.log(process.platform, process.arch)"

# Install platform-specific binding
npm install ruvector-core-linux-arm64-gnu  # Linux ARM64
npm install ruvector-core-linux-x64-gnu     # Linux x64
npm install ruvector-core-darwin-arm64      # macOS M1/M2
```

**Issue: "Migration incomplete: X patterns remaining"**

```typescript
// Re-run migration (idempotent)
await migrator.migrate({
  sourcePath: './data/agentic-qe.db',
  targetPath: './data/patterns.ruvector',
  verbose: true
});

// Check for specific errors
const result = await migrator.migrate({ dryRun: true, verbose: true });
console.log('Errors:', result.errors);
```

**Issue: Out of memory during migration**

```bash
# Reduce batch size
npx tsx scripts/migrate-patterns.ts --batch-size 100

# Or increase Node.js heap
NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/migrate-patterns.ts
```

**Issue: Slow migration performance**

```typescript
// Use larger batches
await migrator.migrate({ batchSize: 10000 });

// Disable verbose logging
await migrator.migrate({ verbose: false });

// Check disk I/O
iostat -x 1
```

### Debug Mode

```bash
# Enable all logging
DEBUG=* npx tsx scripts/migrate-patterns.ts --verbose

# Check migration status
npx tsx scripts/migrate-patterns.ts --status --verbose
```

### Validation

```typescript
import { PatternStoreFactory } from './src/core/memory/PatternStoreFactory';

// Validate migrated store
const result = await PatternStoreFactory.create({
  preferredBackend: 'ruvector',
  storagePath: './data/patterns.ruvector'
});

const validation = await PatternStoreFactory.validate(result.store);
console.log('Valid:', validation.valid);
console.log('Errors:', validation.errors);
console.log('Stats:', validation.stats);
```

## Next Steps

After successful migration:

1. **Update Application Code** - Use `PatternStoreFactory.create()`
2. **Monitor Performance** - Track search latency and QPS
3. **Optimize HNSW** - Tune M, efConstruction, efSearch for your workload
4. **Enable Metrics** - Use `enableMetrics: true` for production monitoring
5. **Archive Old Database** - Keep AgentDB backup for 30 days minimum

## Support

- **Documentation:** [RuVector Pattern Store](/workspaces/agentic-qe-cf/src/core/memory/RuVectorPatternStore.ts)
- **API Reference:** [IPatternStore Interface](/workspaces/agentic-qe-cf/src/core/memory/IPatternStore.ts)
- **Issues:** Report migration issues in project tracker

---

**Last Updated:** 2025-11-30
**Version:** 1.0.0
**Migration Tools:** `/workspaces/agentic-qe-cf/src/core/memory/MigrationTools.ts`
