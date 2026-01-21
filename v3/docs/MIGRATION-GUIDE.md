# Agentic QE v2 to v3 Migration Guide

**Version:** 3.1.0
**Last Updated:** 2026-01-17

This guide provides comprehensive instructions for migrating from Agentic QE v2 to v3. The migration follows a **zero-breaking-changes** approach, ensuring backward compatibility while enabling access to all v3 features.

---

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Zero-Breaking-Changes Approach](#zero-breaking-changes-approach)
3. [Quick Start Migration](#quick-start-migration)
4. [Configuration Migration](#configuration-migration)
5. [CLI Command Mapping](#cli-command-mapping)
6. [Agent Name Migration](#agent-name-migration)
7. [API Changes and Compatibility](#api-changes-and-compatibility)
8. [Memory and Data Migration](#memory-and-data-migration)
9. [Rollback Instructions](#rollback-instructions)
10. [Troubleshooting](#troubleshooting)

---

## Migration Overview

### What's New in v3

| Feature | v2 | v3 | Improvement |
|---------|----|----|-------------|
| Architecture | Monolithic | 12 DDD Bounded Contexts | Modular, domain-driven |
| Coverage Analysis | O(n) linear scan | O(log n) HNSW-indexed | Sublinear performance |
| Memory Backend | SQLite only | Hybrid (SQLite + HNSW) | 150x faster search |
| Agents | 32 | 47+ specialized | Domain-focused |
| Learning | Basic patterns | ReasoningBank + SONA | Neural learning |
| Coordination | Sequential | Queen-led work stealing | 3-5x throughput |
| Test Framework | Jest | Vitest | Modern ESM support |

### Migration Scope

| Component | Migration Required | Automatic Migration |
|-----------|-------------------|---------------------|
| Configuration | Yes | Yes |
| Memory/Patterns | Yes | Yes |
| CLI Commands | Compatibility layer | N/A |
| Agent Names | Compatibility layer | N/A |
| API Imports | Manual update | N/A |

---

## Zero-Breaking-Changes Approach

v3 maintains full backward compatibility with v2 through multiple layers:

### 1. Agent Name Compatibility

All v2 agent names continue to work via automatic mapping:

```typescript
// v2 name still works
const agent = 'qe-test-generator';

// Internally mapped to v3
// 'qe-test-generator' -> 'qe-test-architect'
```

### 2. CLI Command Compatibility

v2 CLI commands are automatically translated:

```bash
# v2 command (still works)
aqe generate tests --file src/app.ts

# Automatically translated to v3
aqe test generate --file src/app.ts
```

### 3. Configuration Compatibility

v2 configuration is automatically migrated when detected:

```json
// v2 config (detected and migrated)
{
  "version": "2.8.2",
  "memory": { "backend": "sqlite" }
}

// Automatically converted to v3 format
{
  "v3": {
    "version": "3.1.0",
    "memory": { "backend": "hybrid" }
  }
}
```

### Deprecation Timeline

| Feature | Status in v3 | Removal Target |
|---------|-------------|----------------|
| v2 Agent Names | Deprecated (working) | v4.0.0 |
| v2 CLI Commands | Deprecated (working) | v4.0.0 |
| v2 Config Format | Auto-migrated | v4.0.0 |
| SQLite-only memory | Deprecated | v4.0.0 |

---

## Quick Start Migration

### Automatic v2 Detection

**New in v3:** When you run `aqe init`, the system automatically detects existing v2 installations and guides you through migration:

```bash
# If v2 is detected, you'll see:
════════════════════════════════════════════════════════════
⚠️  EXISTING V2 INSTALLATION DETECTED
════════════════════════════════════════════════════════════

Found v2 installation at:
  • Memory DB: .agentic-qe/memory.db
  • Config: .agentic-qe/config/
  • Agents: .claude/agents/

📋 RECOMMENDED: Run migration before init:

   npx aqe migrate status      # Check what needs migration
   npx aqe migrate run --dry-run  # Preview changes
   npx aqe migrate run         # Execute migration

Or continue with:
   aqe init --auto-migrate     # Auto-migrate during init
```

### Step 1: Install v3

```bash
# Install v3 (does not remove v2)
npm install agentic-qe

# Or install v3 explicitly
npm install @agentic-qe/v3
```

### Step 2: Choose Migration Approach

**Option A: Recommended - Explicit Migration**

```bash
# Check current v2 installation status
aqe migrate status

# Preview migration (dry run)
aqe migrate run --dry-run

# Run migration with automatic backup
aqe migrate run --backup

# Then initialize v3
aqe init --auto
```

**Option B: One-Command Migration**

```bash
# Auto-migrate v2 during v3 init (creates backup automatically)
aqe init --auto-migrate
```

### Step 3: Backup v2 Data (If Manual Migration)

```bash
# Create backup of v2 data (auto-migrate does this automatically)
cp -r .agentic-qe .agentic-qe.backup
```

### Step 4: Run Migration (If Using Option A)

```bash
# Preview migration (dry run)
aqe migrate --dry-run

# Run migration with backup
aqe migrate --backup

# Run full migration
aqe migrate
```

### Step 4: Verify Migration

```bash
# Check migration status
aqe migrate status

# Verify system health
aqe status --verbose

# Run tests to ensure everything works
aqe test run
```

### Step 5: Update MCP Server (if using Claude Code)

```bash
# Remove old MCP server
claude mcp remove aqe

# Add v3 MCP server (requires global install)
npm install -g agentic-qe
claude mcp add aqe -- aqe-mcp
```

---

## Configuration Migration

### v2 Configuration Format

```json
{
  "version": "2.8.2",
  "memory": {
    "backend": "sqlite",
    "path": ".agentic-qe/memory.db"
  },
  "agents": ["qe-test-generator", "qe-coverage-analyzer"],
  "learning": {
    "enabled": true,
    "patternRetention": 90
  },
  "coverage": {
    "threshold": 80
  }
}
```

### v3 Configuration Format

```json
{
  "v3": {
    "version": "3.1.0",
    "domains": [
      "test-generation",
      "test-execution",
      "coverage-analysis",
      "quality-assessment",
      "defect-intelligence",
      "code-intelligence",
      "requirements-validation",
      "security-compliance",
      "contract-testing",
      "visual-accessibility",
      "chaos-resilience",
      "learning-optimization"
    ],
    "agents": {
      "maxConcurrent": 15,
      "timeout": 300000,
      "retryOnFailure": true,
      "maxRetries": 3
    },
    "memory": {
      "backend": "hybrid",
      "sqlite": { "path": ".agentic-qe/memory.db" },
      "agentdb": { "enabled": true },
      "hnsw": {
        "enabled": true,
        "M": 16,
        "efConstruction": 200,
        "efSearch": 100
      }
    },
    "learning": {
      "enabled": true,
      "neuralLearning": true,
      "patternRetention": 180,
      "transferEnabled": true
    },
    "coverage": {
      "algorithm": "sublinear",
      "thresholds": {
        "statements": 80,
        "branches": 75,
        "functions": 85,
        "lines": 80
      },
      "riskWeighted": true
    },
    "qualityGates": {
      "coverage": { "min": 80, "blocking": true },
      "complexity": { "max": 15, "blocking": false },
      "vulnerabilities": { "critical": 0, "high": 0, "blocking": true }
    }
  }
}
```

### Configuration Migration Steps

1. **Automatic Migration**
   ```bash
   aqe migrate --target config
   ```

2. **Manual Migration** (if preferred)
   - Copy v2 config to v3 location
   - Update version to `3.1.0`
   - Wrap config in `v3` root key
   - Convert `agents` array to `domains` array
   - Add HNSW settings to memory config

### Key Configuration Changes

| v2 Setting | v3 Setting | Notes |
|------------|------------|-------|
| `version: "2.x.x"` | `v3.version: "3.1.0"` | Root key changes |
| `memory.backend: "sqlite"` | `memory.backend: "hybrid"` | Recommended upgrade |
| `agents: [...]` | `domains: [...]` | Agents -> Domains |
| `coverage.threshold` | `coverage.thresholds.*` | Multi-threshold support |
| N/A | `memory.hnsw.*` | New: HNSW indexing |
| N/A | `learning.neuralLearning` | New: Neural patterns |

---

## CLI Command Mapping

### Test Commands

| v2 Command | v3 Command |
|------------|------------|
| `aqe generate tests` | `aqe test generate` |
| `aqe run tests` | `aqe test run` |
| `aqe test --parallel` | `aqe test run --workers=4` |

### Coverage Commands

| v2 Command | v3 Command |
|------------|------------|
| `aqe analyze coverage` | `aqe coverage analyze` |
| `aqe coverage gaps` | `aqe coverage gaps` |
| `aqe coverage report` | `aqe coverage report` |

### Quality Commands

| v2 Command | v3 Command |
|------------|------------|
| `aqe check quality` | `aqe quality assess` |
| `aqe quality gate` | `aqe quality assess --gates all` |

### Security Commands

| v2 Command | v3 Command |
|------------|------------|
| `aqe security scan` | `aqe security scan` |
| `aqe security audit` | `aqe security compliance` |

### Learning Commands

| v2 Command | v3 Command |
|------------|------------|
| `aqe learn status` | `aqe learn status` |
| `aqe patterns list` | `aqe learn patterns` |

### New v3 Commands

```bash
# Initialize commands
aqe init                     # Interactive wizard
aqe init --auto              # Auto-configure from project analysis
aqe init --auto-migrate      # Auto-migrate v2 data during init
aqe init --wizard            # Full interactive wizard

# Domain-specific operations
aqe test generate src/services/user.ts
aqe coverage ./src --gaps --risk
aqe security --sast -t ./src
aqe security --compliance gdpr,hipaa

# Code intelligence
aqe code index ./src
aqe code search "authentication middleware"
aqe code impact ./src/auth.ts
aqe code deps ./src

# Task management
aqe task submit generate-tests -p p1 --payload '{"source":"src/"}'
aqe task list -s running
aqe task status <task-id>

# Agent management
aqe agent list -d test-generation
aqe agent spawn test-generation -t worker

# Migration commands
aqe migrate --dry-run
aqe migrate --backup
aqe migrate status
aqe migrate rollback
```

---

## Agent Name Migration

### Tier 1: Direct Upgrades (Same Name)

These agents keep the same name with enhanced capabilities:

| Agent | Notes |
|-------|-------|
| `qe-flaky-hunter` | Enhanced flaky detection |
| `qe-performance-tester` | Enhanced load testing |
| `qe-security-auditor` | Enhanced security scanning |
| `qe-integration-tester` | Enhanced integration testing |
| `qe-code-reviewer` | Enhanced code review |
| `qe-chaos-engineer` | Enhanced chaos engineering |
| `qe-data-generator` | Enhanced test data generation |

### Tier 2: Renamed Agents (with Compatibility)

| v2 Agent | v3 Agent | Domain |
|----------|----------|--------|
| `qe-test-generator` | `qe-test-architect` | test-generation |
| `qe-test-writer` | `qe-tdd-red` | test-generation |
| `qe-test-implementer` | `qe-tdd-green` | test-generation |
| `qe-test-refactorer` | `qe-tdd-refactor` | test-generation |
| `qe-coverage-analyzer` | `qe-coverage-specialist` | coverage-analysis |
| `qe-gap-detector` | `qe-coverage-specialist` | coverage-analysis |
| `qe-parallel-executor` | `qe-test-executor` | test-execution |
| `qe-deployment-advisor` | `qe-quality-gate` | quality-assessment |
| `qe-defect-predictor` | `qe-defect-intelligence` | defect-intelligence |
| `qe-root-cause-analyzer` | `qe-defect-intelligence` | defect-intelligence |
| `qe-learning-coordinator` | `qe-learning-optimization` | learning-optimization |
| `qe-visual-tester` | `qe-visual-accessibility` | visual-accessibility |
| `qe-graphql-tester` | `qe-contract-validator` | contract-testing |
| `qe-api-contract-validator` | `qe-contract-testing` | contract-testing |

### Tier 3: New v3-Only Agents

These agents are new in v3:

- `qe-test-architect` - Strategic test planning
- `qe-tdd-specialist` - TDD methodology expert
- `qe-property-tester` - Property-based testing
- `qe-mutation-tester` - Mutation testing
- `qe-requirements-validator` - Requirements validation
- `qe-bdd-generator` - BDD scenario generation
- `qe-knowledge-manager` - Knowledge graph management
- `qe-dependency-mapper` - Dependency analysis
- `qe-impact-analyzer` - Change impact analysis
- `qe-load-tester` - Load testing specialist
- `qe-resilience-tester` - Resilience validation
- `qe-pattern-learner` - Pattern recognition
- `qe-transfer-specialist` - Cross-project learning
- `qe-metrics-optimizer` - Metrics optimization
- `qe-fleet-commander` - Agent fleet coordination
- `qe-queen-coordinator` - Queen coordination
- `qe-regression-analyzer` - Regression analysis
- `qe-responsive-tester` - Responsive design testing
- `qe-accessibility-auditor` - WCAG compliance

---

## API Changes and Compatibility

### Import Path Changes

```typescript
// v2
import { AgenticQE } from 'agentic-qe';

// v3
import { QEKernelImpl } from 'agentic-qe';
// Or for specific domains
import { TestGenerationDomain } from 'agentic-qe/domains';
```

### API Pattern Changes

```typescript
// v2: Single entry point
const aqe = new AgenticQE();
await aqe.generateTests({ file: 'src/app.ts' });
await aqe.analyzeGaps({ source: './src' });

// v3: Domain-driven API
const kernel = new QEKernelImpl();
await kernel.initialize();

// Get domain-specific APIs
const testGenAPI = kernel.getDomainAPI('test-generation');
const result = await testGenAPI.generateTests({
  sourceFiles: ['src/app.ts'],
  testType: 'unit',
  framework: 'vitest',
});

const coverageAPI = kernel.getDomainAPI('coverage-analysis');
const gaps = await coverageAPI.detectGaps({
  coverageData: existingCoverage,
  minCoverage: 80,
});
```

### Event-Based Communication

```typescript
// v3: Event bus for cross-domain communication
kernel.eventBus.subscribe('test-generation.tests-generated', (event) => {
  console.log('Tests generated:', event.payload.testCount);
});

kernel.eventBus.publish('coverage-analysis.gap-detected', {
  file: 'src/auth.ts',
  coverage: 45,
});
```

### Queen Coordinator for Task Management

```typescript
// v3: Queen-led task orchestration
import { createQueenCoordinator } from 'agentic-qe';

const queen = createQueenCoordinator(kernel, router, executor);
await queen.initialize();

const result = await queen.submitTask({
  type: 'generate-tests',
  priority: 'p1',
  targetDomains: ['test-generation'],
  payload: { sourceFile: 'src/user-service.ts' },
  timeout: 300000,
});
```

---

## Memory and Data Migration

### Data Locations

| Component | v2 Location | v3 Location |
|-----------|-------------|-------------|
| Memory DB | `.agentic-qe/memory.db` | `.aqe/agentdb/` |
| Config | `.agentic-qe/config.json` | `.aqe/config.json` |
| Patterns | `.agentic-qe/patterns/` | `.aqe/reasoning-bank/` |
| Cache | `.agentic-qe/cache/` | `.aqe/cache/` |
| Logs | `.agentic-qe/logs/` | `.aqe/logs/` |

### Memory Migration Process

```bash
# Migrate all data
aqe migrate

# Migrate specific components
aqe migrate --target memory    # Migrate memory/patterns only
aqe migrate --target config    # Migrate project config only
aqe migrate --target patterns  # Migrate learned patterns only
```

### SQLite to AgentDB Migration

```typescript
// v2: Direct SQLite access
import Database from 'better-sqlite3';
const db = new Database('.agentic-qe/memory.db');
const patterns = db.prepare('SELECT * FROM patterns').all();

// v3: AgentDB with HNSW
import { QEKernelImpl } from 'agentic-qe';
const kernel = new QEKernelImpl({ memoryBackend: 'hybrid' });
await kernel.initialize();

// HNSW-indexed semantic search (150x faster)
const results = await kernel.memory.search('authentication patterns', {
  limit: 10,
  threshold: 0.7,
});
```

---

## Rollback Instructions

If migration fails or you need to revert to v2:

### Step 1: v3 Does Not Modify v2 Data

Your original `.agentic-qe/` folder remains untouched during migration. v3 creates a new `.aqe/` directory.

### Step 2: Remove v3 Installation

```bash
# Uninstall v3
npm uninstall agentic-qe
npm uninstall @agentic-qe/v3

# Remove v3 data directory
rm -rf .aqe/
```

### Step 3: Reinstall v2

```bash
# Install v2 explicitly
npm install agentic-qe@2

# Verify v2 is active
aqe --version  # Should show 2.x.x
```

### Step 4: Restore from Backup (if needed)

```bash
# If v2 data was modified
cp -r .agentic-qe.backup .agentic-qe
```

### Migration Rollback Command

```bash
# Use built-in rollback
aqe migrate rollback

# Rollback to specific version
aqe migrate rollback --to 2.8.2
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Cannot find .agentic-qe/` | No v2 installation | Run `aqe init` first in v2 |
| `Memory migration failed` | Corrupted SQLite | Restore backup, retry migration |
| `HNSW index error` | Dimension mismatch | Set `dimensions: 128` in config |
| `Pattern not found` | Not migrated | Re-run: `aqe migrate --patterns` |
| `Agent not recognized` | Unknown agent name | Check agent mapping table |
| `Config validation failed` | Invalid v3 config | Run `aqe migrate --target config` |

### Debug Mode

```bash
# Run migration with debug output
DEBUG=aqe:migrate aqe migrate

# Check migration logs
cat .aqe/logs/migration.log

# Verbose migration status
aqe migrate status --verbose
```

### Verify Migration

```bash
# Check all components
aqe status --verbose

# Verify memory migration
aqe memory stats

# Verify pattern migration
aqe learn patterns --count

# Verify agent availability
aqe agent list --all
```

### Getting Help

- **GitHub Issues**: Open issue with `[v2-v3-migration]` tag
- **Documentation**: https://github.com/proffesor-for-testing/agentic-qe/tree/main/v3
- **Migration Skill**: `/aqe-v2-v3-migration` in Claude Code

---

## Version Compatibility Matrix

| v2 Version | v3 Version | Migration Support |
|------------|------------|-------------------|
| 2.8.x | 3.0.x | Full automatic migration |
| 2.7.x | 3.0.x | Full automatic migration |
| 2.6.x | 3.0.x | Partial (config only) |
| 2.5.x and below | 3.0.x | Manual migration required |

---

*Migration Guide Version: 1.1.0 | Last Updated: 2026-01-19*
