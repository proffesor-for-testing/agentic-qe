# AQE v2 to v3 Migration Plan

> Upgrading existing agents/skills while preserving backward compatibility for 2000+ users

**Created**: 2026-01-17
**Status**: Draft
**Author**: AI Migration Agent

---

## Executive Summary

When v3 becomes the main release, existing v2 users need their agents and skills to be **upgraded** rather than **duplicated**. This plan follows the claude-flow approach of:

1. **Zero-Breaking-Changes**: v2 code continues to work during transition
2. **Upgrade-in-Place**: Existing agents get v3 capabilities via compatibility layers
3. **Automatic Migration**: CLI command handles the upgrade transparently
4. **Rollback Support**: Users can revert to v2 behavior at any time

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Migration Architecture](#migration-architecture)
3. [Agent Migration Strategy](#agent-migration-strategy)
4. [Skill Migration Strategy](#skill-migration-strategy)
5. [Compatibility Layers](#compatibility-layers)
6. [Global Installation: Binary Conflict Handling](#global-installation-binary-conflict-handling)
7. [CLI Migration Commands](#cli-migration-commands)
8. [Implementation Phases](#implementation-phases)
9. [Best Agents for Migration Work](#best-agents-for-migration-work)

---

## Current State Analysis

### Directory Structure Comparison

```
v2 Structure (Current):                    v3 Target Structure:
.claude/agents/                            .claude/agents/
├── qe-quality-analyzer.md (v2)           ├── core/
├── qe-test-generator.md (v2)             │   ├── coder.md
├── qe-coverage-analyzer.md (v2)          │   ├── tester.md
├── qe-security-scanner.md (v2)           │   └── ...
├── core/                                  ├── domains/           <-- NEW
│   ├── coder.md                          │   ├── test-generation/
│   └── tester.md                         │   │   └── qe-test-generator.md (v3 upgrade)
├── subagents/                            │   ├── coverage-analysis/
│   └── qe-test-writer.md (v2)            │   │   └── qe-coverage-specialist.md (v3 upgrade)
└── v3/                     <-- PROBLEM   │   ├── quality-assessment/
    ├── qe-quality-gate.md (v3 NEW)       │   │   ├── qe-quality-gate.md
    └── ...                               │   │   └── qe-quality-analyzer.md (v3 upgrade)
                                          │   └── ...
                                          ├── legacy/            <-- v2 BACKUP
                                          └── migration/
```

### Problem Statement

Currently, v3 agents are stored in a separate `.claude/agents/v3/` folder. When users upgrade:
- They get **both** v2 and v3 agents
- Duplication causes confusion
- No clear upgrade path
- Breaking changes not handled

### Accurate QE-Only Counts

| Category | v2 Count | v3 Count | Notes |
|----------|----------|----------|-------|
| **QE Main Agents** | 21 | 41 | qe-* and qx-* prefixed |
| **QE Subagents** | 11 | 7 | Under subagents/ folder |
| **QE Agents Total** | **32** | **48** | 16 new in v3 |
| **QE Skills** | 15 | 15 | qe-*, aqe-*, agentic-quality-* |
| **Testing Methodology Skills** | ~25 | ~25 | *-testing, test-* patterns |
| **QE-Related Skills Total** | **~40** | **~40** | Plus enhancements |

#### v2 QE Agents (32 total):
**Root level (21):**
- qe-a11y-ally, qe-api-contract-validator, qe-chaos-engineer
- qe-code-complexity, qe-code-intelligence, qe-coverage-analyzer
- qe-deployment-readiness, qe-flaky-test-hunter, qe-fleet-commander
- qe-performance-tester, qe-production-intelligence, qe-quality-analyzer
- qe-quality-gate, qe-regression-risk-analyzer, qe-requirements-validator
- qe-security-scanner, qe-test-data-architect, qe-test-executor
- qe-test-generator, qe-visual-tester, qx-partner

**Subagents (11):**
- qe-code-reviewer, qe-coverage-gap-analyzer, qe-data-generator
- qe-flaky-investigator, qe-integration-tester, qe-performance-validator
- qe-security-auditor, qe-test-data-architect-sub, qe-test-implementer
- qe-test-refactorer, qe-test-writer

#### v3 QE Agents (48 total):
**Main level (41):** Includes 16 new agents:
- NEW: qe-bdd-generator, qe-contract-validator, qe-defect-predictor
- NEW: qe-dependency-mapper, qe-gap-detector, qe-graphql-tester
- NEW: qe-impact-analyzer, qe-kg-builder, qe-learning-coordinator
- NEW: qe-load-tester, qe-metrics-optimizer, qe-mutation-tester
- NEW: qe-parallel-executor, qe-pattern-learner, qe-property-tester
- NEW: qe-queen-coordinator, qe-responsive-tester, qe-retry-handler
- NEW: qe-risk-assessor, qe-root-cause-analyzer, qe-tdd-specialist
- NEW: qe-test-architect, qe-transfer-specialist

**Subagents (7):**
- qe-code-reviewer, qe-integration-reviewer, qe-performance-reviewer
- qe-security-reviewer, qe-tdd-green, qe-tdd-red, qe-tdd-refactor

#### QE-Specific Skills (15):
- agentic-quality-engineering, aqe-v2-v3-migration
- qe-chaos-resilience, qe-code-intelligence, qe-contract-testing
- qe-coverage-analysis, qe-defect-intelligence, qe-iterative-loop
- qe-learning-optimization, qe-quality-assessment, qe-requirements-validation
- qe-security-compliance, qe-test-execution, qe-test-generation
- qe-visual-accessibility

#### Testing Methodology Skills (~25):
- accessibility-testing, api-testing-patterns, compatibility-testing
- compliance-testing, context-driven-testing, contract-testing
- database-testing, exploratory-testing-advanced, holistic-testing-pact
- localization-testing, mobile-testing, mutation-testing
- performance-testing, regression-testing, risk-based-testing
- security-testing, shift-left-testing, shift-right-testing
- visual-testing-advanced, test-automation-strategy, test-data-management
- test-design-techniques, test-environment-management, test-reporting-analytics
- testability-scoring

---

## Migration Architecture

### Key Principle: Upgrade, Don't Duplicate

Following claude-flow's approach:

```typescript
// v2 Agent Definition
{
  name: "qe-quality-analyzer",
  description: "...",
  // v2 capabilities
}

// v3 Agent Definition (UPGRADED)
{
  name: "qe-quality-analyzer",
  version: "3.0.0",
  v2_compat: "qe-quality-analyzer",  // <-- MAPS to v2 name
  domain: "quality-assessment",       // <-- NEW: Domain assignment
  description: "...",
  // Enhanced v3 capabilities
  // + Backward compatibility hooks
}
```

### v2 Compatibility Fields

Every v3 agent that replaces a v2 agent MUST include:

```yaml
---
name: qe-quality-analyzer
version: "3.0.0"
v2_compat: qe-quality-analyzer      # Maps to v2 agent name
v2_api_support: true                 # Supports v2 API calls
v2_removal_version: "4.0.0"          # When v2 support drops
domain: quality-assessment           # DDD domain assignment
---
```

---

## Agent Migration Strategy

### Tier 1: Direct Upgrades (v2 → v3 Same Name)

These agents have the **same name** in both versions - direct replacement:

| v2 Agent | v3 Agent | Domain | Action |
|----------|----------|--------|--------|
| qe-chaos-engineer | qe-chaos-engineer | chaos-resilience | Upgrade in place |
| qe-code-complexity | qe-code-complexity | code-intelligence | Upgrade in place |
| qe-code-intelligence | qe-code-intelligence | code-intelligence | Upgrade in place |
| qe-fleet-commander | qe-fleet-commander | coordination | Upgrade in place |
| qe-performance-tester | qe-performance-tester | chaos-resilience | Upgrade in place |
| qe-quality-gate | qe-quality-gate | quality-assessment | Upgrade in place |
| qe-requirements-validator | qe-requirements-validator | requirements-validation | Upgrade in place |
| qe-security-scanner | qe-security-scanner | security-compliance | Upgrade in place |
| qe-visual-tester | qe-visual-tester | visual-accessibility | Upgrade in place |

### Tier 2: Renamed Agents (v2 → v3 Different Name)

These agents are **renamed** in v3 - need name mapping:

| v2 Agent | v3 Agent | Domain | Mapping Required |
|----------|----------|--------|------------------|
| qe-quality-analyzer | (split) qe-quality-gate + qe-metrics-optimizer | quality-assessment | Complex mapping |
| qe-test-generator | qe-test-architect | test-generation | `v2_compat: qe-test-generator` |
| qe-coverage-analyzer | qe-coverage-specialist | coverage-analysis | `v2_compat: qe-coverage-analyzer` |
| qe-flaky-test-hunter | qe-flaky-hunter | test-execution | `v2_compat: qe-flaky-test-hunter` |
| qe-regression-risk-analyzer | qe-regression-analyzer | defect-intelligence | `v2_compat: qe-regression-risk-analyzer` |
| qe-a11y-ally | qe-accessibility-auditor | visual-accessibility | `v2_compat: qe-a11y-ally` |
| qe-api-contract-validator | qe-contract-validator | contract-testing | `v2_compat: qe-api-contract-validator` |
| qe-deployment-readiness | qe-deployment-advisor | quality-assessment | `v2_compat: qe-deployment-readiness` |
| qe-production-intelligence | qe-impact-analyzer | defect-intelligence | `v2_compat: qe-production-intelligence` |
| qe-test-executor | qe-parallel-executor | test-execution | `v2_compat: qe-test-executor` |
| qe-test-data-architect | qe-data-generator | test-generation | Maps to subagent |
| qx-partner | qe-qx-partner | quality-assessment | `v2_compat: qx-partner` |

### Tier 3: New Agents (v3 Only - Add)

These agents are **new** in v3 and should be **added** (no v2 equivalent):

| Agent | Domain | Purpose |
|-------|--------|---------|
| qe-bdd-generator | requirements-validation | Gherkin scenario generation |
| qe-defect-predictor | defect-intelligence | ML defect prediction |
| qe-dependency-mapper | code-intelligence | Dependency analysis |
| qe-gap-detector | coverage-analysis | Coverage gap detection |
| qe-graphql-tester | contract-testing | GraphQL API testing |
| qe-kg-builder | code-intelligence | Knowledge graph builder |
| qe-learning-coordinator | learning-optimization | Cross-domain learning |
| qe-load-tester | chaos-resilience | Load testing |
| qe-metrics-optimizer | learning-optimization | Metrics optimization |
| qe-mutation-tester | test-generation | Mutation testing |
| qe-parallel-executor | test-execution | Parallel test runs |
| qe-pattern-learner | learning-optimization | Pattern recognition |
| qe-property-tester | test-generation | Property-based testing |
| qe-queen-coordinator | coordination | V3 queen coordinator |
| qe-responsive-tester | visual-accessibility | Responsive testing |
| qe-retry-handler | test-execution | Retry logic |
| qe-risk-assessor | quality-assessment | Risk assessment |
| qe-root-cause-analyzer | defect-intelligence | Failure analysis |
| qe-tdd-specialist | test-generation | TDD workflow |
| qe-test-architect | test-generation | Test architecture |
| qe-transfer-specialist | learning-optimization | Knowledge transfer |

### Tier 4: Subagent Consolidation

| v2 Subagents | v3 Subagent | Reason |
|--------------|-------------|--------|
| qe-test-writer, qe-test-implementer, qe-test-refactorer | qe-tdd-red, qe-tdd-green, qe-tdd-refactor | TDD phase alignment |
| qe-flaky-investigator | qe-flaky-hunter (main) | Absorbed |
| qe-coverage-gap-analyzer | qe-gap-detector (main) | Promoted to main |
| qe-code-reviewer | qe-code-reviewer | Same |
| qe-security-auditor | qe-security-auditor | Same |
| qe-integration-tester | qe-integration-tester | Same |
| qe-performance-validator | qe-performance-reviewer | Renamed |
| qe-data-generator | qe-data-generator | Same |
| qe-test-data-architect-sub | (removed) | Merged into main |

### Tier 5: Removed/Deprecated Agents

| v2 Agent | Status | Migration Path |
|----------|--------|----------------|
| (none currently identified) | - | - |

---

## Skill Migration Strategy

### Skill Upgrade Pattern

```yaml
# v2 Skill: .claude/skills/quality-metrics/skill.md
---
name: quality-metrics
version: 1.0.0
---

# v3 Upgrade: Same file, enhanced
---
name: quality-metrics
version: 3.0.0
v2_compat: true
domain: quality-assessment
new_features:
  - hnsw-search
  - learning-integration
  - domain-events
---
```

### Skill Categories

| Category | v2 Skills | v3 Skills | Action |
|----------|-----------|-----------|--------|
| Core QE | 20 | 20 | Upgrade in place |
| Testing Patterns | 25 | 28 | Upgrade + Add new |
| Security | 8 | 12 | Upgrade + Add new |
| GitHub | 6 | 6 | Upgrade |
| CI/CD | 5 | 8 | Upgrade + Add new |
| v3-specific | 0 | 8 | Add new |

---

## Compatibility Layers

### 1. Agent Name Mapping

```typescript
// src/v3/compatibility/agent-mapper.ts
export const agentNameMapping: Record<string, string> = {
  // v2 name → v3 name
  'qe-test-generator': 'qe-test-architect',
  'qe-coverage-analyzer': 'qe-coverage-specialist',
  'qe-flaky-test-hunter': 'qe-flaky-hunter',
  'qe-quality-analyzer': 'qe-quality-analyzer', // Same name
  'qe-security-scanner': 'qe-security-scanner', // Same name
};

export function resolveAgentName(v2Name: string): string {
  return agentNameMapping[v2Name] || v2Name;
}
```

### 2. API Translation Layer

```typescript
// src/v3/compatibility/api-compat.ts
export class V2ApiCompatLayer {
  private v3Client: AQEv3Client;

  // v2 API: aqe.generateTests(options)
  async generateTests(options: V2TestGenOptions): Promise<V2TestResult> {
    console.warn('[DEPRECATED] generateTests() - Use testGeneration.generate()');

    // Translate to v3 API
    const v3Options = this.translateOptions(options);
    const v3Result = await this.v3Client.domains.testGeneration.generate(v3Options);

    // Translate result back to v2 format
    return this.translateResult(v3Result);
  }

  // v2 API: aqe.analyzeGaps(path)
  async analyzeGaps(path: string): Promise<V2GapResult> {
    console.warn('[DEPRECATED] analyzeGaps() - Use coverageAnalysis.findGaps()');

    return this.v3Client.domains.coverageAnalysis.findGaps({
      path,
      algorithm: 'hnsw' // v3 enhancement
    });
  }
}
```

### 3. Memory Schema Migration

```typescript
// src/v3/compatibility/memory-migration.ts
export async function migrateMemorySchema(v2Db: string, v3Db: string): Promise<void> {
  const v2Data = await readV2Memory(v2Db);

  for (const entry of v2Data) {
    // Transform v2 schema to v3
    const v3Entry = {
      key: entry.id,
      namespace: mapNamespace(entry.namespace),
      value: entry.data,
      metadata: {
        migratedFrom: 'v2',
        originalId: entry.id,
        migratedAt: Date.now()
      },
      // v3 additions
      embedding: null, // Generated on first access
      importance: 0.5,
      ttl: entry.ttl
    };

    await writeV3Memory(v3Db, v3Entry);
  }
}

function mapNamespace(v2Namespace: string): string {
  const mapping = {
    'patterns': 'aqe/patterns',
    'test-results': 'aqe/test-execution/results',
    'coverage': 'aqe/coverage-analysis/results',
    'quality': 'aqe/quality-assessment/metrics'
  };
  return mapping[v2Namespace] || `aqe/legacy/${v2Namespace}`;
}
```

---

## Global Installation: Binary Conflict Handling

### The Problem

Both v2 (`agentic-qe`) and v3 (`@agentic-qe/v3`) packages register the same `aqe` binary name. When users have v2 installed globally and try to install v3 globally, npm fails:

```bash
$ npm install -g @agentic-qe/v3@alpha
npm error code EEXIST
npm error EEXIST: file already exists
npm error File exists: /usr/local/share/nvm/versions/node/v24.11.1/bin/aqe
npm error Remove the existing file and try again, or run npm
npm error with --force to overwrite files recklessly.
```

### Solutions

#### Option 1: Uninstall v2 First (Recommended)

```bash
# Step 1: Uninstall v2 globally
npm uninstall -g agentic-qe

# Step 2: Install v3
npm install -g @agentic-qe/v3@alpha

# Step 3: Verify installation
aqe --version  # Should show 3.0.0-alpha.x
```

#### Option 2: Force Install (Overwrites v2)

```bash
# Force install v3 (overwrites v2 binary)
npm install -g @agentic-qe/v3@alpha --force

# Verify
aqe --version  # Should show 3.0.0-alpha.x
```

#### Option 3: Use npx (No Global Install)

```bash
# Run v3 without global install
npx @agentic-qe/v3@alpha init
npx @agentic-qe/v3@alpha migrate
npx @agentic-qe/v3@alpha test
```

### Project-Level Installation (No Conflict)

For project-level (local) installations, there's no conflict since each project has its own `node_modules/.bin`:

```bash
# In project with v2
npm install agentic-qe
npx aqe --version  # v2

# In another project with v3
npm install @agentic-qe/v3@alpha
npx aqe --version  # v3
```

### Future Consideration: Pre-Install Check

A future enhancement could add a `preinstall` script to v3 that:
1. Detects if v2's `aqe` binary exists globally
2. Warns the user and provides instructions
3. Optionally auto-uninstalls v2 with user confirmation

```json
// v3/package.json (future)
{
  "scripts": {
    "preinstall": "node scripts/check-v2-conflict.js"
  }
}
```

---

## CLI Migration Commands

### Migration Command

```bash
# Check migration status
aqe migrate status

# Run migration (with backup)
aqe migrate run --backup

# Preview changes
aqe migrate run --dry-run

# Migrate specific component
aqe migrate run --target agents
aqe migrate run --target skills
aqe migrate run --target config
aqe migrate run --target memory

# Verify migration
aqe migrate verify

# Rollback
aqe migrate rollback
```

> **Note**: All v3 CLI commands use `aqe` (not `aqe-v3`). When v3 becomes
> the main release, the package name is `agentic-qe` with `aqe` CLI.

### Migration Output

```
$ aqe migrate run

🔄 AQE v2 to v3 Migration
==========================

📋 Pre-flight checks:
  ✓ v2 installation detected (.agentic-qe/)
  ✓ Backup created (.agentic-qe.backup-1705485600/)
  ✓ Node.js 20+ verified

📦 Migrating Agents:
  ↗ qe-quality-analyzer → upgraded (v3.0.0)
  ↗ qe-test-generator → qe-test-architect (renamed + upgraded)
  ↗ qe-coverage-analyzer → qe-coverage-specialist (renamed + upgraded)
  + qe-learning-coordinator (new in v3)
  + qe-pattern-learner (new in v3)
  ✓ 25 agents migrated

📚 Migrating Skills:
  ↗ quality-metrics → upgraded (v3.0.0)
  ↗ test-generation → upgraded (v3.0.0)
  + qe-iterative-loop (new in v3)
  ✓ 107 skills migrated

⚙️ Migrating Configuration:
  ↗ .agentic-qe/config.json → .aqe/config.json
  ✓ Configuration migrated

🧠 Migrating Memory:
  ↗ Patterns: 245 entries
  ↗ Test results: 1,203 entries
  ↗ Coverage data: 89 entries
  ✓ Memory migrated to AgentDB

✅ Migration Complete!
   Run 'aqe test' to verify
```

---

## Implementation Phases

### Phase 1: Compatibility Layer (Week 1-2)

**Goal**: v2 code works with v3 runtime

1. Create agent name mapping
2. Create API translation layer
3. Implement v2 → v3 parameter translation
4. Add deprecation warnings for v2 APIs

**Deliverables**:
- `src/v3/compatibility/agent-mapper.ts`
- `src/v3/compatibility/api-compat.ts`
- `src/v3/compatibility/param-translator.ts`

### Phase 2: Agent Upgrade (Week 2-3)

**Goal**: Upgrade agents in place, not duplicate

1. Move v3 agents from `.claude/agents/v3/` to domain folders
2. Add `v2_compat` fields to all v3 agents
3. Archive v2-only agents to `.claude/agents/legacy/`
4. Update agent index

**Directory Changes**:
```
# Before
.claude/agents/qe-quality-analyzer.md (v2)
.claude/agents/v3/qe-quality-gate.md (v3)

# After
.claude/agents/domains/quality-assessment/qe-quality-analyzer.md (v3, with v2_compat)
.claude/agents/domains/quality-assessment/qe-quality-gate.md (v3, new)
.claude/agents/legacy/qe-quality-analyzer.v2.md (archived backup)
```

### Phase 3: Skill Upgrade (Week 3-4)

**Goal**: Upgrade skills with v3 features while maintaining compatibility

1. Add v3 features to existing skills
2. Add `v2_compat: true` to upgraded skills
3. Create new v3-only skills

### Phase 4: Migration CLI (Week 4-5)

**Goal**: Automated migration for users

1. Implement `aqe migrate` command
2. Implement status, verify, rollback subcommands
3. Handle edge cases and error recovery

### Phase 5: Testing & Documentation (Week 5-6)

**Goal**: Ensure smooth migration for all users

1. E2E migration tests
2. User documentation
3. Troubleshooting guide
4. Video walkthroughs

---

## Best Agents for Migration Work

Based on analysis, these agents are best suited for implementing this migration:

### 1. v3-integration-architect
**Domain**: Integration
**Use For**: Designing the compatibility layers, API translation, and overall migration architecture.

```bash
Task({
  prompt: "Design the v2-v3 compatibility layer architecture for AQE",
  subagent_type: "v3-integration-architect",
  description: "Design compatibility layer"
})
```

### 2. migration-planner
**Domain**: Planning
**Use For**: Creating detailed migration steps, handling edge cases, and rollback scenarios.

```bash
Task({
  prompt: "Create detailed migration steps for AQE v2→v3 with rollback plan",
  subagent_type: "migration-planner",
  description: "Plan migration steps"
})
```

### 3. ddd-domain-expert
**Domain**: Architecture
**Use For**: Organizing agents into proper DDD domains, designing domain boundaries.

```bash
Task({
  prompt: "Organize AQE agents into DDD domains following bounded context patterns",
  subagent_type: "ddd-domain-expert",
  description: "Domain organization"
})
```

### 4. v3-queen-coordinator
**Domain**: Coordination
**Use For**: Orchestrating the multi-agent migration effort, coordinating parallel tasks.

```bash
Task({
  prompt: "Coordinate the AQE v2→v3 migration across multiple agents",
  subagent_type: "v3-queen-coordinator",
  description: "Migration coordination"
})
```

### 5. coder + tester (Parallel)
**Domain**: Implementation
**Use For**: Implementing the compatibility layers and testing them.

```bash
Task({
  prompt: "Implement the agent name mapping compatibility layer",
  subagent_type: "coder",
  run_in_background: true,
  description: "Implement compat layer"
})

Task({
  prompt: "Write tests for the v2→v3 agent name mapping",
  subagent_type: "tester",
  run_in_background: true,
  description: "Test compat layer"
})
```

### 6. qe-coverage-specialist
**Domain**: Coverage Analysis
**Use For**: Ensuring migration tests cover all edge cases.

```bash
Task({
  prompt: "Analyze test coverage for v2→v3 migration and identify gaps",
  subagent_type: "qe-coverage-specialist",
  description: "Migration test coverage"
})
```

---

## Recommended Swarm Configuration

```bash
# Initialize migration swarm
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 12 \
  --strategy specialized

# Spawn migration team
Task({
  prompt: "Coordinate v2→v3 migration implementation",
  subagent_type: "v3-queen-coordinator",
  description: "Migration Queen"
})

Task({
  prompt: "Design compatibility architecture",
  subagent_type: "v3-integration-architect",
  run_in_background: true,
  description: "Architect"
})

Task({
  prompt: "Organize agents into DDD domains",
  subagent_type: "ddd-domain-expert",
  run_in_background: true,
  description: "Domain expert"
})

Task({
  prompt: "Implement compatibility layer code",
  subagent_type: "coder",
  run_in_background: true,
  description: "Implementation"
})

Task({
  prompt: "Write migration tests",
  subagent_type: "tester",
  run_in_background: true,
  description: "Testing"
})
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User disruption | Zero | No manual steps required |
| v2 API support | 100% | All v2 APIs work |
| Migration time | <5 min | Automated CLI |
| Rollback success | 100% | Full restoration |
| New v3 features | Available | After migration |

---

## Next Steps

1. **Immediate**: Create compatibility layer skeleton
2. **This Week**: Implement agent name mapping
3. **Next Week**: Reorganize agent directories
4. **Week 3**: Implement migration CLI
5. **Week 4**: E2E testing
6. **Week 5**: Documentation and release

---

## References

- [claude-flow v2→v3 Migration Guide](/tmp/claude-flow-analysis/v3/implementation/migration/MIGRATION-GUIDE.md)
- [claude-flow Backward Compatibility](/tmp/claude-flow-analysis/v3/implementation/v3-migration/BACKWARD-COMPATIBILITY.md)
- [AQE v3 DDD Architecture](../skills/v3-ddd-architecture/skill.md)
- [AQE v2→v3 Migration Skill](../.claude/skills/aqe-v2-v3-migration/skill.md)

