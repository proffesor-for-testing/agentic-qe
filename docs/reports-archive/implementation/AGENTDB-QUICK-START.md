# AgentDB Quick Start Guide

**Get started with AgentDB in 5 minutes** ⚡

---

## What is AgentDB?

AgentDB is a production-ready vector database with built-in QUIC synchronization and 9 reinforcement learning algorithms. It replaces custom Phase 3 implementations with battle-tested, npm-packaged solutions.

**Key Features**:
- <1ms QUIC sync across nodes
- 150x faster vector search
- 9 RL algorithms (Decision Transformer, Q-Learning, etc.)
- Zero maintenance (npm package)
- Production secure (TLS 1.3)

---

## Installation (1 minute)

```bash
# Install agentic-flow (includes AgentDB)
npm install agentic-flow@latest

# Verify installation
npx agentdb@latest --version
# Expected: v1.0.7+
```

---

## Basic Usage (2 minutes)

### 1. Initialize AgentDB

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/quickstart.db',
  enableReasoning: true,
  cacheSize: 1000,
});
```

### 2. Insert Patterns

```typescript
// Insert a test pattern
await adapter.insertPattern({
  id: 'unit-test-1',
  type: 'test-pattern',
  domain: 'unit-testing',
  pattern_data: JSON.stringify({
    embedding: [0.1, 0.2, 0.3, /* ... 384 dimensions */],
    pattern: {
      framework: 'jest',
      template: 'expect(result).toBe(expected)'
    }
  }),
  confidence: 0.95,
  usage_count: 10,
  success_count: 9,
  created_at: Date.now(),
  last_used: Date.now(),
});
```

### 3. Query Patterns

```typescript
// Query similar patterns
const queryEmbedding = [0.1, 0.2, 0.3, /* ... */];
const results = await adapter.queryPatterns(queryEmbedding, 5);

results.forEach(r => {
  console.log(`Match: ${r.id}, Similarity: ${r.similarity.toFixed(2)}`);
});
```

---

## QUIC Sync (1 minute)

### Enable Multi-Node Sync

```typescript
const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/node1.db',
  enableQUICSync: true,         // Enable QUIC
  syncPort: 4433,                // QUIC port
  syncPeers: [                   // Peer nodes
    '192.168.1.10:4433',
    '192.168.1.11:4433',
  ],
  syncInterval: 1000,            // Sync every 1s
});

// Patterns automatically sync across all nodes
await adapter.insertPattern({/* ... */});
// Available on all peers within ~1ms!
```

---

## Learning Plugins (1 minute)

### Create Learning Plugin

```bash
# Create Decision Transformer plugin (recommended)
npx agentdb@latest create-plugin -t decision-transformer -n my-agent

# Or use interactive wizard
npx agentdb@latest create-plugin
```

### Enable Learning

```typescript
const adapter = await createAgentDBAdapter({
  dbPath: '.agentdb/learning.db',
  enableLearning: true,          // Enable learning
  pluginPath: '.agentdb/plugins/my-agent',
  trainingConfig: {
    batchSize: 32,
    epochs: 50,
    learningRate: 0.001,
  },
});

// Store training experience
await adapter.insertPattern({
  type: 'experience',
  pattern_data: JSON.stringify({
    embedding: [/* ... */],
    pattern: {
      state: [0.1, 0.2],
      action: 2,
      reward: 1.0,
      next_state: [0.15, 0.25],
    }
  }),
  // ... other fields
});

// Model trains automatically!
```

---

## Integration with AQE Fleet

### Update SwarmMemoryManager

```typescript
import { createAgentDBAdapter } from 'agentic-flow/reasoningbank';

export class SwarmMemoryManager {
  private agentdb: any;

  async initialize() {
    // ... existing init ...

    this.agentdb = await createAgentDBAdapter({
      dbPath: '.agentdb/fleet.db',
      enableQUICSync: true,
      syncPeers: ['node1:4433', 'node2:4433'],
    });
  }

  async store(key: string, value: any) {
    // Store in SQLite
    await super.store(key, value);

    // Sync to AgentDB
    await this.agentdb.insertPattern({
      id: key,
      type: 'memory-entry',
      pattern_data: JSON.stringify({ pattern: value }),
      confidence: 1.0,
      created_at: Date.now(),
    });
  }
}
```

---

## Common Commands

```bash
# List learning plugin templates
npx agentdb@latest list-templates

# List installed plugins
npx agentdb@latest list-plugins

# Get plugin information
npx agentdb@latest plugin-info my-agent

# Create plugin (interactive)
npx agentdb@latest create-plugin
```

---

## Next Steps

- **Migration Guide**: See `docs/AGENTDB-MIGRATION-GUIDE.md` for full migration
- **Advanced Features**: See `.claude/skills/agentdb-advanced/SKILL.md` for QUIC sync, hybrid search, custom metrics
- **Learning Plugins**: See `.claude/skills/agentdb-learning/SKILL.md` for 9 RL algorithms
- **API Reference**: See agentic-flow documentation

---

## Troubleshooting

**Issue**: `Cannot find module 'agentic-flow/reasoningbank'`

**Solution**:
```bash
npm install agentic-flow@latest
```

**Issue**: QUIC sync not working

**Solution**:
```bash
# Check network connectivity
ping 192.168.1.10

# Verify port is open
nc -zv 192.168.1.10 4433

# Allow port in firewall
sudo ufw allow 4433/udp
```

---

**Generated**: 2025-10-20
**Version**: 1.0.0
**Time to Complete**: 5 minutes ⚡
