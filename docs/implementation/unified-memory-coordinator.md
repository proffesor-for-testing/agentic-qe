# UnifiedMemoryCoordinator

## Overview

The `UnifiedMemoryCoordinator` provides a single, unified interface for all memory systems in the Agentic QE Fleet, with automatic fallback handling, health monitoring, and cross-system synchronization.

## Architecture

```
┌─────────────────────────────────────────┐
│   UnifiedMemoryCoordinator              │
│   (Single Interface)                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┤
│  │ SQLite   │  │ AgentDB  │  │ JSON   │
│  │ (SwarmM) │  │ (Vector) │  │ (Mem)  │
│  └──────────┘  └──────────┘  └────────┘
│                                         │
│  Automatic Fallback Chain:             │
│  SQLite → AgentDB → Vector → JSON      │
└─────────────────────────────────────────┘
```

## Key Features

### 1. **Automatic Backend Detection**
- Detects available backends at initialization
- Selects optimal backend based on configuration and availability
- Falls back gracefully when backends are unavailable

### 2. **Unified Interface**
- Single API for all memory operations
- Works with any backend transparently
- No need to know which backend is active

### 3. **Health Monitoring**
- Periodic health checks for all backends
- Automatic status tracking (healthy/degraded/failed)
- Latency and error rate monitoring

### 4. **Fallback Chain Execution**
- Automatic failover to alternative backends
- Configurable retry logic
- Data synchronization between backends

### 5. **Namespace Isolation**
- Create isolated namespaces for different contexts
- Prevents data conflicts between agents/teams
- Simplifies multi-tenant usage

### 6. **Metrics Collection**
- Operation counting by backend
- Average latency tracking
- Failover and sync statistics
- Cache hit rate monitoring

## Usage

### Basic Setup

```typescript
import { createUnifiedMemoryCoordinator } from './core/memory';

// Create coordinator with default config
const coordinator = await createUnifiedMemoryCoordinator({
  namespace: 'my-app',
  preferredBackend: 'auto', // or 'sqlite', 'agentdb', 'json'
  enableFallback: true,
  healthCheckInterval: 30000,
  syncInterval: 60000,
});

// Store and retrieve data
await coordinator.store('user-123', { name: 'John', role: 'admin' });
const user = await coordinator.retrieve('user-123');

// Clean shutdown
await coordinator.shutdown();
```

### Configuration Options

```typescript
interface MemoryConfig {
  // Backend selection
  preferredBackend: 'sqlite' | 'agentdb' | 'json' | 'auto';

  // Fallback behavior
  enableFallback: boolean;
  maxRetries: number;

  // Monitoring
  healthCheckInterval: number;  // milliseconds
  syncInterval: number;         // milliseconds

  // Namespace
  namespace: string;

  // Database paths
  dbPaths?: {
    swarm?: string;
    agentdb?: string;
    ruvector?: string;
  };

  // Vector operations
  enableVectorOps?: boolean;
  vectorDimension?: number;
}
```

### Key-Value Operations

```typescript
// Store with TTL
await coordinator.store('session-token', 'abc123', 3600); // 1 hour TTL

// Retrieve
const token = await coordinator.retrieve<string>('session-token');

// Delete
const deleted = await coordinator.delete('session-token');

// Check existence
const exists = await coordinator.exists('session-token');

// List keys
const keys = await coordinator.list('session-*');

// Batch operations
await coordinator.storeBatch([
  { key: 'user-1', value: { name: 'Alice' } },
  { key: 'user-2', value: { name: 'Bob' } },
  { key: 'user-3', value: { name: 'Charlie' } },
]);

const users = await coordinator.retrieveBatch(['user-1', 'user-2', 'user-3']);
```

### Search Operations

```typescript
// Search for entries
const results = await coordinator.search('user', {
  limit: 10,
  offset: 0,
  sortBy: 'createdAt',
  order: 'desc',
});

// Results include backend information
for (const result of results) {
  console.log(`Key: ${result.key}, Backend: ${result.backend}`);
}
```

### Pattern Storage

```typescript
// Store patterns
await coordinator.storePattern({
  id: 'test-pattern-1',
  type: 'unit-test',
  content: 'Test implementation pattern',
  confidence: 0.85,
  metadata: {
    framework: 'jest',
    domain: 'authentication',
  },
  embedding: [0.1, 0.2, ...], // Optional vector
});

// Query patterns
const patterns = await coordinator.queryPatterns({
  type: 'unit-test',
  minConfidence: 0.8,
  domain: 'authentication',
  limit: 10,
});
```

### Vector Operations

```typescript
// Enable vector operations in config
const coordinator = await createUnifiedMemoryCoordinator({
  enableVectorOps: true,
  vectorDimension: 384,
});

// Store vectors
await coordinator.storeVector('doc-1', [0.1, 0.2, ...], {
  title: 'Test document',
  category: 'qa',
});

// Search similar vectors
const similar = await coordinator.searchSimilar([0.15, 0.25, ...], 5);

for (const result of similar) {
  console.log(`Key: ${result.key}, Similarity: ${result.similarity}`);
}
```

### Namespace Isolation

```typescript
// Create namespaced coordinators
const agentMemory = coordinator.createNamespace('agent-123');
const teamMemory = coordinator.createNamespace('team-qa');

// Each namespace is isolated
await agentMemory.store('state', { status: 'active' });
await teamMemory.store('state', { members: 5 });

// Data doesn't conflict
console.log(await agentMemory.retrieve('state')); // { status: 'active' }
console.log(await teamMemory.retrieve('state'));  // { members: 5 }
```

### Health Monitoring

```typescript
// Check health of all backends
const health = await coordinator.checkHealth();

for (const [backend, status] of health) {
  console.log(`${backend}: ${status.status} (${status.latency}ms)`);
}

// Get current health status
const currentHealth = coordinator.getHealthStatus();

// Check if coordinator is healthy
if (coordinator.isHealthy()) {
  console.log('All systems operational');
} else {
  console.warn('Some backends are degraded');
}
```

### Backend Synchronization

```typescript
// Manual sync
const syncResult = await coordinator.syncBackends();

console.log(`Synced ${syncResult.recordsSynced} records in ${syncResult.duration}ms`);
console.log(`Conflicts: ${syncResult.conflicts}`);

if (!syncResult.success) {
  console.error('Sync errors:', syncResult.errors);
}
```

### Metrics and Monitoring

```typescript
// Get coordinator metrics
const metrics = coordinator.getMetrics();

console.log(`Total operations: ${metrics.totalOperations}`);
console.log(`Average latency: ${metrics.averageLatency}ms`);
console.log(`Failover count: ${metrics.failoverCount}`);
console.log(`Sync count: ${metrics.syncCount}`);
console.log(`Cache hit rate: ${metrics.cacheHitRate}%`);

// Operations by backend
for (const [backend, count] of metrics.operationsByBackend) {
  console.log(`${backend}: ${count} operations`);
}
```

### Direct Backend Access

```typescript
// When you need backend-specific features
const swarmMemory = coordinator.getSwarmMemory();
const agentDB = coordinator.getAgentDB();
const vectorStore = coordinator.getVectorStore();

if (agentDB) {
  // Use AgentDB-specific features
  const patterns = await agentDB.searchPatterns({
    domain: 'testing',
    minConfidence: 0.9,
  });
}
```

## Best Practices

### 1. **Use Namespaces**
```typescript
// Good: Isolated namespaces
const userMemory = coordinator.createNamespace('users');
const sessionMemory = coordinator.createNamespace('sessions');

// Avoid: Global namespace pollution
await coordinator.store('user-data', ...); // Could conflict
```

### 2. **Handle Errors Gracefully**
```typescript
// Always handle potential nulls
const value = await coordinator.retrieve('key');
if (value === null) {
  // Handle missing value
}

// Use try-catch for critical operations
try {
  await coordinator.store('critical-data', data);
} catch (error) {
  logger.error('Failed to store critical data:', error);
  // Fallback logic
}
```

### 3. **Set Appropriate TTLs**
```typescript
// Short-lived data
await coordinator.store('cache-token', token, 300); // 5 minutes

// Session data
await coordinator.store('session', sessionData, 3600); // 1 hour

// Persistent data
await coordinator.store('user-prefs', prefs); // No TTL
```

### 4. **Monitor Health**
```typescript
// Periodic health checks
setInterval(async () => {
  if (!coordinator.isHealthy()) {
    logger.warn('Memory coordinator health degraded');
    await coordinator.checkHealth();
  }
}, 60000);
```

### 5. **Clean Shutdown**
```typescript
// Always shutdown gracefully
process.on('SIGTERM', async () => {
  await coordinator.shutdown();
  process.exit(0);
});
```

## Integration with QE Fleet

### Agent Memory
```typescript
class QEAgent {
  private memory: NamespacedCoordinator;

  constructor(
    private coordinator: UnifiedMemoryCoordinator,
    private agentId: string
  ) {
    this.memory = coordinator.createNamespace(`agent:${agentId}`);
  }

  async saveState(state: any): Promise<void> {
    await this.memory.store('state', state);
  }

  async loadState(): Promise<any> {
    return this.memory.retrieve('state');
  }
}
```

### Team Coordination
```typescript
class TeamCoordination {
  private teamMemory: NamespacedCoordinator;

  constructor(
    coordinator: UnifiedMemoryCoordinator,
    teamId: string
  ) {
    this.teamMemory = coordinator.createNamespace(`team:${teamId}`);
  }

  async shareResult(agentId: string, result: any): Promise<void> {
    await this.teamMemory.store(`results:${agentId}`, result);
  }

  async getTeamResults(): Promise<Map<string, any>> {
    const keys = await this.teamMemory.list('results:*');
    const results = new Map();

    for (const key of keys) {
      const agentId = key.split(':')[1];
      const result = await this.teamMemory.retrieve(key);
      results.set(agentId, result);
    }

    return results;
  }
}
```

### Pattern Learning
```typescript
class PatternLearner {
  constructor(private coordinator: UnifiedMemoryCoordinator) {}

  async learnPattern(pattern: Pattern): Promise<void> {
    // Store with embedding for similarity search
    await this.coordinator.storePattern({
      ...pattern,
      embedding: await this.generateEmbedding(pattern.content),
    });
  }

  async findSimilarPatterns(
    content: string,
    threshold: number = 0.8
  ): Promise<Pattern[]> {
    const embedding = await this.generateEmbedding(content);
    const similar = await this.coordinator.searchSimilar(embedding, 10);

    return similar
      .filter(r => r.similarity >= threshold)
      .map(r => r.metadata as Pattern);
  }

  private async generateEmbedding(content: string): Promise<number[]> {
    // Generate embedding (integrate with your embedding model)
    return [];
  }
}
```

## Performance Considerations

### Backend Selection
- **SQLite**: Best for structured data, ACID guarantees, complex queries
- **AgentDB**: Best for vector operations, similarity search, ML patterns
- **JSON**: Best for simple key-value, development, fallback

### Optimization Tips
1. **Use batch operations** for multiple keys
2. **Set appropriate TTLs** to prevent memory bloat
3. **Enable fallback** for high availability
4. **Monitor metrics** to identify bottlenecks
5. **Use namespaces** to organize data logically

### Memory Management
```typescript
// Good: Batch operations
await coordinator.storeBatch(manyEntries);

// Avoid: Individual operations in loop
for (const entry of manyEntries) {
  await coordinator.store(entry.key, entry.value); // Slower
}
```

## Troubleshooting

### Backend Not Available
```typescript
const health = await coordinator.checkHealth();
const sqliteHealth = health.get('sqlite');

if (sqliteHealth?.status === 'failed') {
  console.error('SQLite backend failed:', sqliteHealth.details);
  // Will automatically fall back to JSON
}
```

### Sync Issues
```typescript
const syncResult = await coordinator.syncBackends();

if (!syncResult.success) {
  console.error('Sync failed:', syncResult.errors);
  // Check backend health
  await coordinator.checkHealth();
}
```

### Performance Issues
```typescript
const metrics = coordinator.getMetrics();

if (metrics.averageLatency > 100) {
  console.warn('High latency detected:', metrics.averageLatency);

  // Check backend distribution
  for (const [backend, count] of metrics.operationsByBackend) {
    console.log(`${backend}: ${count} ops`);
  }
}
```

## Migration Guide

### From SwarmMemoryManager
```typescript
// Before
const swarmMemory = new SwarmMemoryManager('./memory.db');
await swarmMemory.initialize();
await swarmMemory.store('key', 'value', { partition: 'default' });

// After
const coordinator = await createUnifiedMemoryCoordinator({
  namespace: 'default',
  dbPaths: { swarm: './memory.db' },
});
await coordinator.store('key', 'value');
```

### From Direct AgentDB
```typescript
// Before
const agentDB = new AgentDBService({ dbPath: './agentdb.db' });
await agentDB.initialize();
await agentDB.storePattern(pattern);

// After
const coordinator = await createUnifiedMemoryCoordinator({
  enableVectorOps: true,
  dbPaths: { agentdb: './agentdb.db' },
});
await coordinator.storePattern(pattern);
```

## API Reference

See the TypeScript definitions in `src/core/memory/UnifiedMemoryCoordinator.ts` for complete API documentation.

## Contributing

When extending the coordinator:
1. Add new backend support in `detectAvailableBackends()`
2. Implement backend-specific operations in private methods
3. Update fallback chain logic in `buildFallbackChain()`
4. Add tests for new features
5. Update this documentation

## License

MIT License - See LICENSE file for details.
