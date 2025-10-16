# Phase 2 CLI Commands Documentation

## Overview

This document describes the Phase 2 CLI commands for the AQE Fleet, which provide comprehensive management for the learning engine, test pattern bank, and continuous improvement loop.

## Table of Contents

- [`aqe learn`](#aqe-learn) - Learning Engine Management
- [`aqe patterns`](#aqe-patterns) - Test Pattern Management
- [`aqe improve`](#aqe-improve) - Continuous Improvement Loop

---

## `aqe learn`

Manage the LearningEngine and view learning status for agents.

### Commands

#### `aqe learn status`

View current learning status for an agent.

**Usage:**
```bash
aqe learn status [options]
```

**Options:**
- `--agent <id>` - Target specific agent (default: 'default')
- `--detailed` - Show detailed information including Q-table size and model version

**Example:**
```bash
aqe learn status --agent test-generator --detailed
```

**Output:**
```
🧠 Learning Engine Status

Agent: test-generator-1
├─ Learning Rate: 0.1
├─ Experiences: 1,247
├─ Avg Reward: 0.82
├─ Best Strategy: pattern-based-generation
└─ Improvement: +23.4% (vs baseline)

📊 Performance Trends:
├─ Last 24h: +15.2%
├─ Last 7d:  +23.4%
└─ Last 30d: +31.7%

✅ Target Status: 20% improvement REACHED
```

---

#### `aqe learn enable`

Enable learning for one or all agents.

**Usage:**
```bash
aqe learn enable [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--all` - Enable for all agents

**Example:**
```bash
aqe learn enable --all
```

---

#### `aqe learn disable`

Disable learning for an agent (preserves existing learned patterns).

**Usage:**
```bash
aqe learn disable [options]
```

**Options:**
- `--agent <id>` - Target specific agent (required)

**Example:**
```bash
aqe learn disable --agent test-executor-1
```

---

#### `aqe learn history`

View learning history showing recent experiences and rewards.

**Usage:**
```bash
aqe learn history [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--limit <number>` - Number of experiences to show (default: 20)

**Example:**
```bash
aqe learn history --agent test-gen --limit 50
```

---

#### `aqe learn train`

Manually trigger a training session with a custom task.

**Usage:**
```bash
aqe learn train --agent <id> --task <json>
```

**Options:**
- `--agent <id>` - Agent to train (required)
- `--task <json>` - Task JSON for training (required)

**Example:**
```bash
aqe learn train --agent test-gen --task '{"type":"test-generation","complexity":0.8}'
```

---

#### `aqe learn reset`

Reset learning state (deletes all learning data for an agent).

**Usage:**
```bash
aqe learn reset [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--confirm` - Confirm the reset operation (required)

**Example:**
```bash
aqe learn reset --agent test-gen --confirm
```

---

#### `aqe learn export`

Export learning data to a JSON file.

**Usage:**
```bash
aqe learn export --output <file> [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--output <file>` - Output file path (required)

**Example:**
```bash
aqe learn export --agent test-gen --output learning-backup.json
```

---

## `aqe patterns`

Manage test patterns in the QEReasoningBank.

### Commands

#### `aqe patterns list`

List all test patterns with filtering options.

**Usage:**
```bash
aqe patterns list [options]
```

**Options:**
- `--framework <name>` - Filter by framework (jest, mocha, vitest, playwright)
- `--type <category>` - Filter by type (unit, integration, e2e, performance, security)
- `--limit <number>` - Limit number of results (default: 20)

**Example:**
```bash
aqe patterns list --framework jest --type integration --limit 50
```

**Output:**
```
📦 Test Patterns (Jest)

├─ API Response Validation
   ├─ Type: integration
   ├─ Framework: jest
   ├─ Confidence: 92%
   ├─ Success Rate: 94%
   └─ Usage: 47 times

└─ Edge Case Handler
   ├─ Type: unit
   ├─ Framework: jest
   ├─ Confidence: 88%
   ├─ Success Rate: 91%
   └─ Usage: 23 times
```

---

#### `aqe patterns search`

Search patterns by keyword with confidence filtering.

**Usage:**
```bash
aqe patterns search <keyword> [options]
```

**Options:**
- `--min-confidence <n>` - Minimum confidence threshold 0-1 (default: 0.3)
- `--limit <number>` - Limit number of results (default: 10)

**Example:**
```bash
aqe patterns search "api validation" --min-confidence 0.85
```

---

#### `aqe patterns show`

Show detailed information about a specific pattern.

**Usage:**
```bash
aqe patterns show <pattern-id>
```

**Example:**
```bash
aqe patterns show pattern-edge-123
```

**Output:**
```
📋 Pattern Details

ID: pattern-edge-123
Name: API Response Validation
Description: Validates API response structure and status codes
Category: integration
Framework: jest
Language: typescript
Confidence: 92%
Success Rate: 94%
Usage Count: 47
Tags: api, validation, integration

📝 Template:
test('should validate ${endpoint}', async () => {
  const response = await api.get(${endpoint});
  expect(response.status).toBe(200);
  expect(response.data).toMatchSchema(${schema});
});
```

---

#### `aqe patterns extract`

Extract patterns from a test directory using AI analysis.

**Usage:**
```bash
aqe patterns extract <directory> [options]
```

**Options:**
- `--framework <name>` - Test framework (default: jest)

**Example:**
```bash
aqe patterns extract ./tests --framework jest
```

---

#### `aqe patterns share`

Share a pattern across multiple projects.

**Usage:**
```bash
aqe patterns share <pattern-id> --projects <ids>
```

**Options:**
- `--projects <ids>` - Comma-separated project IDs (required)

**Example:**
```bash
aqe patterns share pattern-123 --projects project-a,project-b,project-c
```

---

#### `aqe patterns delete`

Delete a pattern permanently.

**Usage:**
```bash
aqe patterns delete <pattern-id> [options]
```

**Options:**
- `--confirm` - Confirm deletion (required)

**Example:**
```bash
aqe patterns delete pattern-old-123 --confirm
```

---

#### `aqe patterns export`

Export patterns to a JSON file.

**Usage:**
```bash
aqe patterns export --output <file> [options]
```

**Options:**
- `--output <file>` - Output file path (required)
- `--framework <name>` - Filter by framework

**Example:**
```bash
aqe patterns export --output patterns-jest.json --framework jest
```

---

#### `aqe patterns import`

Import patterns from a JSON file.

**Usage:**
```bash
aqe patterns import --input <file>
```

**Options:**
- `--input <file>` - Input file path (required)

**Example:**
```bash
aqe patterns import --input patterns-shared.json
```

---

#### `aqe patterns stats`

Show pattern statistics and analytics.

**Usage:**
```bash
aqe patterns stats [options]
```

**Options:**
- `--framework <name>` - Filter by framework

**Example:**
```bash
aqe patterns stats --framework jest
```

**Output:**
```
📊 Pattern Statistics

Total Patterns: 142
Avg Confidence: 89%
Avg Success Rate: 91%

📦 By Category:
  integration     67
  unit           45
  e2e            22
  performance     8

🔧 By Framework:
  jest           98
  playwright     28
  vitest         16
```

---

## `aqe improve`

Manage the continuous improvement loop for performance optimization.

### Commands

#### `aqe improve status`

View current improvement loop status and recent improvements.

**Usage:**
```bash
aqe improve status [options]
```

**Options:**
- `--agent <id>` - Target specific agent

**Example:**
```bash
aqe improve status --agent test-executor-1
```

**Output:**
```
🔄 Improvement Loop Status

Agent: test-executor-1
├─ Status: ✅ ACTIVE
├─ Cycle Interval: 1 hour
├─ Last Cycle: 23 minutes ago
└─ Next Cycle: in 37 minutes

📈 Recent Improvements:
1. [Applied] Increased parallel workers: 4 → 6 (+18% throughput)
2. [Applied] Optimized memory usage (-23% memory)
3. [Pending] Enable caching for repeated tests

⚠️  Failure Patterns Detected:
1. Timeout in integration tests (12 occurrences)
   └─ Recommendation: Increase timeout from 5s to 10s
```

---

#### `aqe improve start`

Start the continuous improvement loop.

**Usage:**
```bash
aqe improve start [options]
```

**Options:**
- `--agent <id>` - Target specific agent

**Example:**
```bash
aqe improve start --agent test-gen
```

---

#### `aqe improve stop`

Stop the continuous improvement loop.

**Usage:**
```bash
aqe improve stop [options]
```

**Options:**
- `--agent <id>` - Target specific agent

**Example:**
```bash
aqe improve stop --agent test-gen
```

---

#### `aqe improve history`

View improvement history over a time period.

**Usage:**
```bash
aqe improve history [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--days <number>` - Time period in days (default: 30)

**Example:**
```bash
aqe improve history --days 7
```

---

#### `aqe improve ab-test`

Run an A/B test comparing two strategies.

**Usage:**
```bash
aqe improve ab-test --strategy-a <name> --strategy-b <name> [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--strategy-a <name>` - First strategy (required)
- `--strategy-b <name>` - Second strategy (required)

**Example:**
```bash
aqe improve ab-test --strategy-a parallel-execution --strategy-b sequential-execution
```

**Output:**
```
✅ A/B Test Created

Test ID: abtest-1234
Strategy A: parallel-execution
Strategy B: sequential-execution
Sample Size: 100

The test will run automatically during task executions
Use "aqe improve status" to monitor progress
```

---

#### `aqe improve failures`

View detected failure patterns with recommendations.

**Usage:**
```bash
aqe improve failures [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--limit <number>` - Limit number of results (default: 10)

**Example:**
```bash
aqe improve failures --limit 20
```

**Output:**
```
⚠️  Failure Patterns

├─ timeout:test-execution (12 occurrences)
   ├─ Confidence: 87%
   └─ Recommendation: Increase timeout threshold or implement progress checkpointing

├─ memory:leak-detected (3 occurrences)
   ├─ Confidence: 72%
   └─ Recommendation: Implement memory pooling and garbage collection optimization

└─ network:api-timeout (8 occurrences)
   ├─ Confidence: 81%
   └─ Recommendation: Implement retry logic with exponential backoff
```

---

#### `aqe improve apply`

Apply a specific improvement recommendation.

**Usage:**
```bash
aqe improve apply <recommendation-id> [options]
```

**Options:**
- `--dry-run` - Preview changes without applying (default: true)

**Example:**
```bash
aqe improve apply rec-timeout-123 --no-dry-run
```

---

#### `aqe improve report`

Generate a comprehensive improvement report.

**Usage:**
```bash
aqe improve report [options]
```

**Options:**
- `--agent <id>` - Target specific agent
- `--format <format>` - Report format: html, json, text (default: text)
- `--output <file>` - Output file path

**Example:**
```bash
aqe improve report --format html --output improvement-report.html
```

**Output (text format):**
```
📊 Improvement Report

Agent test-executor-1 performance: ✓ Target achieved! 23.4% improvement over 28 days.

📈 Trends:
  successRate: ↑ +12.3%
  averageExecutionTime: ↓ -18.7%
  errorRate: ↓ -45.2%
  userSatisfaction: ↑ +15.8%

💡 Recommendations:
  1. Performance is excellent! Continue current strategies and maintain quality.
```

---

## Common Workflows

### Initialize and Enable Learning

```bash
# Initialize fleet
aqe init

# Enable learning for all agents
aqe learn enable --all

# Check learning status
aqe learn status --detailed
```

### Extract and Share Patterns

```bash
# Extract patterns from tests
aqe patterns extract ./tests --framework jest

# View extracted patterns
aqe patterns list --framework jest

# Export patterns for sharing
aqe patterns export --output my-patterns.json
```

### Monitor and Improve Performance

```bash
# Start improvement loop
aqe improve start

# Monitor status
aqe improve status

# View failure patterns
aqe improve failures

# Generate report
aqe improve report --format html --output report.html
```

### A/B Testing Strategies

```bash
# Create A/B test
aqe improve ab-test \
  --strategy-a parallel-execution \
  --strategy-b sequential-execution

# Monitor test progress
aqe improve status

# View results when complete
aqe improve history --days 7
```

---

## Integration with Existing Commands

Phase 2 commands integrate seamlessly with existing Phase 1 commands:

```bash
# Phase 1: Initialize routing
aqe routing enable

# Phase 2: Enable learning
aqe learn enable --all

# Phase 2: Start improvement
aqe improve start

# Phase 1: Monitor fleet
aqe fleet status

# Phase 2: Check learning progress
aqe learn status --detailed
```

---

## Configuration

### Learning Configuration

Learning parameters are stored in:
`.agentic-qe/data/swarm-memory.db` under partition `learning`

### Pattern Storage

Patterns are stored in:
`.agentic-qe/data/swarm-memory.db` under partition `patterns`

### Improvement Loop

Improvement cycle data is stored in:
`.agentic-qe/data/swarm-memory.db` under partition `learning`

---

## Error Handling

All commands provide clear error messages and suggestions:

```bash
# Missing required parameter
$ aqe learn export
❌ --output is required

# Agent not found
$ aqe learn status --agent unknown
❌ Agent not found
💡 Run "aqe init" first to initialize the fleet

# No data available
$ aqe patterns list
⚠️  No patterns found
💡 Run "aqe patterns extract <directory>" to discover patterns
```

---

## Performance Characteristics

- **Learning status**: < 100ms response time
- **Pattern search**: < 50ms (p95) with indexing
- **Improvement report generation**: < 500ms for 1000+ cycles
- **Pattern extraction**: ~2-5 seconds per 100 test files

---

## Troubleshooting

### Learning data not appearing

```bash
# Check if fleet is initialized
aqe status

# Verify learning is enabled
aqe learn status --detailed

# Re-enable learning
aqe learn enable --agent <id>
```

### Patterns not extracting

```bash
# Verify directory exists
ls ./tests

# Check framework is correct
aqe patterns extract ./tests --framework jest

# View extraction logs
aqe debug agent <agent-id>
```

### Improvement loop not running

```bash
# Check loop status
aqe improve status

# Restart loop
aqe improve stop
aqe improve start

# View system health
aqe debug health-check
```

---

## API Integration

All CLI commands can be integrated programmatically:

```typescript
import { LearningCommand } from './cli/commands/learn';
import { PatternsCommand } from './cli/commands/patterns';
import { ImproveCommand } from './cli/commands/improve';

// Execute commands programmatically
await LearningCommand.execute('status', { agent: 'test-gen', detailed: true });
await PatternsCommand.execute('list', [], { framework: 'jest' });
await ImproveCommand.execute('report', [], { format: 'json' });
```

---

## Version

Phase 2 CLI Commands - v1.0.0

**Dependencies:**
- Phase 1 CLI Commands v1.0.5+
- SwarmMemoryManager
- LearningEngine
- PerformanceTracker
- ImprovementLoop
- QEReasoningBank

---

## See Also

- [Learning System Architecture](./LEARNING-SYSTEM.md)
- [Pattern Extraction Guide](./PATTERN-EXTRACTION-GUIDE.md)
- [Phase 2 Implementation Summary](./PHASE2-IMPLEMENTATION-SUMMARY.md)
- [Routing Commands Documentation](./routing-commands.md)
