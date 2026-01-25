# MinCut Analysis CLI Commands

CLI commands for analyzing module coupling and circular dependencies using MinCut algorithms.

## Overview

The MinCut CLI commands provide powerful code analysis capabilities to identify highly coupled modules, detect circular dependencies, and suggest optimal module boundaries. All commands are available under `aqe kg mincut`.

## Commands

### 1. Coupling Analysis

Analyze coupling between two specific modules:

```bash
aqe kg mincut coupling <module1> <module2> [options]
```

**Arguments:**
- `module1` - First module path (e.g., `src/core`)
- `module2` - Second module path (e.g., `src/agents`)

**Options:**
- `--threshold <number>` - Coupling threshold (0-1, default: 0.3)
- `--json` - Output as JSON

**Example:**
```bash
aqe kg mincut coupling src/core src/agents
aqe kg mincut coupling src/core src/agents --threshold 0.5
aqe kg mincut coupling src/core src/agents --json
```

**Output:**
```
📊 Coupling Analysis: src/core ↔ src/agents

Coupling Strength: 67% (High)
Circular Dependency: Yes ⚠️

Shared Dependencies (3):
  • src/utils/Logger
  • src/types/common
  • src/config/Config

Key Dependencies (5):
  • src/core/FleetManager → src/agents/BaseAgent
  • src/agents/BaseAgent → src/core/Task
  ... and 3 more

💡 Recommendations:
  High coupling detected - review for potential refactoring
  Consider extracting shared functionality to reduce interdependence
  ⚠️ Circular dependency detected - this should be resolved
  Break the cycle by:
    1. Introducing an interface/abstraction layer
    2. Moving shared code to a third module
    3. Using dependency injection
    4. Applying the Dependency Inversion Principle
```

### 2. Find All Highly Coupled Modules

Find all module pairs with high coupling:

```bash
aqe kg mincut coupling-all [options]
```

**Options:**
- `--threshold <number>` - Minimum coupling to report (0-1, default: 0.5)
- `--limit <number>` - Maximum results to show (default: 10)
- `--json` - Output as JSON

**Example:**
```bash
aqe kg mincut coupling-all
aqe kg mincut coupling-all --threshold 0.7 --limit 5
aqe kg mincut coupling-all --json
```

**Output:**
```
🔗 Highly Coupled Modules (showing 5 of 12):

85% (Very High) src/core ↔ src/agents
  ⚠️  Circular dependency detected

72% (High) src/cli ↔ src/core

68% (High) src/agents ↔ src/learning

61% (High) src/code-intelligence/graph ↔ src/code-intelligence/parser

58% (Moderate) src/core/memory ↔ src/learning
```

### 3. Detect Circular Dependencies

Detect all circular dependencies in the codebase:

```bash
aqe kg mincut circular [options]
```

**Options:**
- `--severity <level>` - Minimum severity to report (low|medium|high, default: low)
- `--json` - Output as JSON

**Example:**
```bash
aqe kg mincut circular
aqe kg mincut circular --severity high
aqe kg mincut circular --json
```

**Output:**
```
🔄 Circular Dependencies Found: 3

🔴 HIGH: src/core/FleetManager.ts → src/agents/BaseAgent.ts → src/core/Task.ts → src/core/FleetManager.ts
   Break points:
   • src/agents/BaseAgent.ts → src/core/Task.ts (low effort)
   • src/core/Task.ts → src/core/FleetManager.ts (medium effort)

🟡 MEDIUM: src/learning/LearningEngine.ts → src/agents/QEAgent.ts → src/learning/LearningEngine.ts
   Break points:
   • src/agents/QEAgent.ts → src/learning/LearningEngine.ts (low effort)

🟢 LOW: src/utils/helpers.ts → src/utils/Logger.ts → src/utils/helpers.ts
   Break points:
   • src/utils/Logger.ts → src/utils/helpers.ts (low effort)
```

### 4. Suggest Module Boundaries

Suggest optimal module boundaries for partitioning the codebase (placeholder):

```bash
aqe kg mincut boundaries <count> [options]
```

**Arguments:**
- `count` - Number of modules to partition into (must be >= 2)

**Options:**
- `--json` - Output as JSON

**Example:**
```bash
aqe kg mincut boundaries 5
```

**Note:** This feature is not yet implemented. It will analyze the code graph and suggest optimal module boundaries to partition the codebase into N modules with minimal coupling.

### 5. Coupling Overview

Get a coupling overview for the entire codebase:

```bash
aqe kg mincut overview [options]
```

**Options:**
- `--json` - Output as JSON

**Example:**
```bash
aqe kg mincut overview
aqe kg mincut overview --json
```

**Output:**
```
📊 Coupling Overview

Average Coupling: 42% (Moderate)
Maximum Coupling: 85% (Very High)
Highly Coupled Pairs: 12
Circular Dependencies: 3

💡 Recommendations:
  Found 12 highly coupled module pairs - review for potential merging or refactoring
  Found 3 circular dependencies - consider introducing abstraction layers
```

## Prerequisites

All commands require an indexed knowledge graph:

```bash
# Index your codebase first
aqe kg index

# Or index incrementally since last release
aqe kg index --git-since v2.6.0
```

## Database Requirements

MinCut analysis requires PostgreSQL to be running:

```bash
# Start PostgreSQL (if using Docker)
docker start agentic-qe-ruvector-dev

# Or ensure your PostgreSQL instance is accessible
# Default connection: localhost:5432, database: ruvector_dev
```

## Understanding the Output

### Coupling Strength Scale

- **0-39% (Low)**: Well-isolated modules, minimal coupling
- **40-59% (Moderate)**: Acceptable coupling for closely related modules
- **60-79% (High)**: Review for potential refactoring
- **80-100% (Very High)**: Strong candidate for merging or major refactoring

### Circular Dependency Severity

- **Low**: 2-node cycles with imports only
- **Medium**: 3-5 node cycles or includes interface implementations
- **High**: Large cycles (>5 nodes) or inheritance-based cycles

### Break Point Effort

- **Low**: Simple imports/calls - easy to refactor (e.g., extract to shared module)
- **Medium**: Interface usage or shared types - moderate refactoring
- **High**: Inheritance hierarchies - significant restructuring required

## JSON Output Format

All commands support `--json` output for programmatic use:

```json
{
  "module1": "src/core",
  "module2": "src/agents",
  "couplingStrength": 0.67,
  "circularDependency": true,
  "sharedDependencies": ["src/utils/Logger", "src/types/common"],
  "cutEdges": [
    {
      "source": "src/core/FleetManager",
      "target": "src/agents/BaseAgent",
      "weight": 5.2,
      "edgeType": "imports"
    }
  ],
  "recommendations": [
    "High coupling detected - review for potential refactoring",
    "⚠️ Circular dependency detected - this should be resolved"
  ]
}
```

## Use Cases

### 1. Pre-Release Refactoring Check

Check for problematic coupling before release:

```bash
aqe kg mincut circular --severity high
aqe kg mincut coupling-all --threshold 0.8
```

### 2. Architecture Review

Generate a comprehensive coupling report:

```bash
aqe kg mincut overview > coupling-report.txt
aqe kg mincut circular --json > circular-deps.json
```

### 3. Module Extraction Planning

Identify modules that should be extracted:

```bash
aqe kg mincut coupling src/feature src/core --threshold 0.3
```

### 4. Dependency Cleanup

Find and fix circular dependencies:

```bash
# Find all circular dependencies
aqe kg mincut circular

# Check if specific module is involved in cycles
aqe kg mincut coupling src/problematic-module src/core
```

## Implementation Details

### Files

- `/workspaces/agentic-qe-cf/src/cli/commands/kg/mincut.ts` - CLI command implementations
- `/workspaces/agentic-qe-cf/src/cli/index.ts` - Command registration
- `/workspaces/agentic-qe-cf/tests/unit/cli/commands/kg/mincut.test.ts` - Unit tests

### Dependencies

- `ModuleCouplingAnalyzer` - High-level coupling analysis
- `CircularDependencyDetector` - Tarjan's algorithm for SCC detection
- `MinCutAnalyzer` - Stoer-Wagner MinCut algorithm
- `GraphAdapter` - Graph format conversion
- `CodeIntelligenceOrchestrator` - Knowledge graph access

### Graph Loading

All commands load the code graph from the knowledge graph database:

1. Initialize `CodeIntelligenceOrchestrator`
2. Get `GraphBuilder` instance
3. Export graph as nodes/edges
4. Convert to `CodeGraph` format with index maps
5. Pass to analysis classes

## Error Handling

### No Code Graph Found

```
❌ No code graph found
Run "aqe kg index" to index your codebase first.
```

**Solution:** Run `aqe kg index` to index your codebase.

### Database Connection Failed

```
❌ Database connection failed.
Make sure PostgreSQL is running and accessible.
```

**Solution:** Start PostgreSQL and ensure connection settings are correct.

### Invalid Parameters

```
❌ Invalid module count. Must be >= 2
```

**Solution:** Provide valid parameters according to command requirements.

## Performance Considerations

- **Coupling analysis**: O(E) where E is edges between modules (fast)
- **Find all coupled modules**: O(M²) where M is number of modules (can be slow for large codebases)
- **Circular detection**: O(V + E) using Tarjan's algorithm (efficient)
- **MinCut computation**: O(V³) worst case, but optimized for sparse graphs

For large codebases:
- Use `--threshold` to filter results
- Use `--limit` to reduce output size
- Consider analyzing specific modules instead of entire codebase

## Future Enhancements

- [ ] Implement `boundaries` command using K-way MinCut partitioning
- [ ] Add interactive mode for exploring coupling
- [ ] Generate visual diagrams of highly coupled modules
- [ ] Track coupling trends over time
- [ ] Integration with CI/CD for automated checks
- [ ] Suggest specific refactoring strategies based on coupling patterns

## See Also

- [MinCut Integration Summary](../architecture/MINCUT-INTEGRATION-SUMMARY.md)
- [Code Intelligence Quickstart](../guides/code-intelligence-quickstart.md)
- [Knowledge Graph CLI](../reference/cli.md#knowledge-graph)
