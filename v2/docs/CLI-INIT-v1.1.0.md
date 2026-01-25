# CLI Init Command - v1.1.0

## Overview

The `aqe init` command initializes Agentic QE projects with full Phase 1 (routing) and Phase 2 (learning, patterns, improvement) capabilities.

## Usage

```bash
aqe init [options]
```

## Options

```
--topology <type>       Fleet topology (hierarchical|mesh|ring|adaptive) [default: hierarchical]
--max-agents <number>   Maximum number of agents [default: 10]
--focus <areas>         Testing focus areas (comma-separated) [default: all]
--environments <envs>   Target environments (comma-separated) [default: development]
--frameworks <fws>      Testing frameworks (comma-separated) [default: jest]
--config <path>         Load configuration from file
--verbose               Show detailed output
```

## Interactive Mode

When run without `--config`, the command enters interactive mode and prompts for:

1. **Project Setup**
   - Project name
   - Primary programming language
   - Enable Claude Flow coordination
   - Setup CI/CD integration

2. **Phase 1 Features**
   - Multi-Model Router (70-81% cost savings)
   - Streaming progress updates

3. **Phase 2 Features**
   - Learning system (Q-learning for continuous improvement)
   - Pattern bank (pattern extraction and templates)
   - Improvement loop (A/B testing and optimization)

## What Gets Created

### Directory Structure

```
.agentic-qe/
├── config/
│   ├── fleet.json              # Fleet configuration
│   ├── routing.json            # Phase 1: Routing configuration
│   ├── learning.json           # Phase 2: Learning configuration
│   ├── patterns.json           # Phase 2: Pattern configuration
│   ├── improvement.json        # Phase 2: Improvement configuration
│   ├── agents.json             # Agent configurations
│   ├── environments.json       # Environment configurations
│   └── aqe-hooks.json          # AQE hooks configuration
├── config.json                 # Comprehensive configuration
├── data/
│   ├── learning/
│   │   └── state.json          # Learning state
│   ├── patterns/
│   │   └── index.json          # Pattern index
│   ├── improvement/
│   │   └── state.json          # Improvement state
│   └── registry.json           # Agent registry
├── logs/
│   └── coordination.log        # Coordination logs
├── scripts/
│   ├── pre-execution.sh        # Pre-execution coordination
│   └── post-execution.sh       # Post-execution coordination
└── state/
    └── coordination/           # Coordination state

.claude/
└── agents/                     # Agent definition files (*.md)

tests/
├── unit/                       # Unit tests
├── integration/                # Integration tests
├── e2e/                        # End-to-end tests
├── performance/                # Performance tests
└── security/                   # Security tests

CLAUDE.md                       # Claude Code configuration
```

### Configuration Files

#### `.agentic-qe/config.json` (Main Configuration)

```json
{
  "version": "1.1.0",
  "initialized": "2025-10-16T00:00:00.000Z",

  "phase1": {
    "routing": {
      "enabled": false,
      "defaultModel": "claude-sonnet-4.5",
      "costTracking": true,
      "fallback": true,
      "maxRetries": 3,
      "modelPreferences": {
        "simple": "gpt-3.5-turbo",
        "medium": "claude-haiku",
        "complex": "claude-sonnet-4.5",
        "critical": "gpt-4"
      },
      "budgets": {
        "daily": 50,
        "monthly": 1000
      }
    },
    "streaming": {
      "enabled": true,
      "progressInterval": 2000,
      "bufferEvents": false,
      "timeout": 1800000
    }
  },

  "phase2": {
    "learning": {
      "enabled": true,
      "learningRate": 0.1,
      "discountFactor": 0.95,
      "explorationRate": 0.2,
      "targetImprovement": 0.20
    },
    "patterns": {
      "enabled": true,
      "dbPath": ".agentic-qe/data/patterns.db",
      "minConfidence": 0.85,
      "enableExtraction": true
    },
    "improvement": {
      "enabled": true,
      "intervalMs": 3600000,
      "autoApply": false,
      "enableABTesting": true
    }
  },

  "agents": {
    "testGenerator": {
      "enablePatterns": true,
      "enableLearning": true
    },
    "coverageAnalyzer": {
      "enableLearning": true,
      "targetImprovement": 0.20
    },
    "flakyTestHunter": {
      "enableML": true,
      "enableLearning": true
    },
    "defaultAgents": {
      "enableLearning": true
    }
  },

  "fleet": {
    "topology": "hierarchical",
    "maxAgents": 10,
    "testingFocus": [],
    "environments": [],
    "frameworks": ["jest"]
  }
}
```

## Initialization Output

When you run `aqe init`, you'll see output like:

```
🚀 Initializing Agentic QE Project (v1.1.0)

? Project name: my-awesome-app
? Primary programming language: TypeScript
? Enable Claude Flow coordination? Yes
? Setup CI/CD integration? Yes
? Enable Multi-Model Router for cost optimization? (70-81% savings) No
? Enable streaming progress updates for long-running operations? Yes
? Enable Phase 2 learning system (Q-learning for continuous improvement)? Yes
? Enable Phase 2 pattern bank (pattern extraction and templates)? Yes
? Enable Phase 2 improvement loop (A/B testing and optimization)? Yes

⠸ Setting up fleet infrastructure...

✓ Copied 17 agent definitions
✓ Learning system initialized
    • Q-learning algorithm (lr=0.1, γ=0.95)
    • Experience replay buffer: 10000 experiences
    • Target improvement: 20%
✓ Pattern bank initialized
    • Frameworks: jest
    • Confidence threshold: 85%
    • Pattern extraction: enabled
✓ Improvement loop initialized
    • Cycle interval: 1 hour(s)
    • A/B testing: enabled (sample size: 100)
    • Auto-apply: disabled (requires approval)
✓ Comprehensive configuration created
    • Config file: .agentic-qe/config.json

✅ Project initialization completed successfully!

📊 Initialization Summary:

Phase 1: Multi-Model Router
  Status: ⚠️  Disabled (opt-in)

Phase 1: Streaming
  Status: ✅ Enabled
  • Real-time progress updates
  • for-await-of compatible

Phase 2: Learning System
  Status: ✅ Enabled
  • Q-learning (lr=0.1, γ=0.95)
  • Experience replay (10,000 buffer)
  • Target: 20% improvement

Phase 2: Pattern Bank
  Status: ✅ Enabled
  • Pattern extraction: enabled
  • Confidence threshold: 85%
  • Template generation: enabled

Phase 2: Improvement Loop
  Status: ✅ Enabled
  • Cycle: 1 hour intervals
  • A/B testing: enabled
  • Auto-apply: OFF (requires approval)

Agent Configuration:
  • TestGeneratorAgent: Patterns + Learning
  • CoverageAnalyzerAgent: Learning + 20% target
  • FlakyTestHunterAgent: ML + Learning
  • All agents: Learning enabled (opt-in)

Fleet Configuration:
  Topology: hierarchical
  Max Agents: 10
  Frameworks: jest

💡 Next Steps:

  1. Review configuration: .agentic-qe/config.json
  2. Generate tests: aqe test generate src/
  3. Check learning status: aqe learn status
  5. List patterns: aqe patterns list
  6. Start improvement loop: aqe improve start

📚 Documentation:

  • Getting Started: docs/GETTING-STARTED.md
  • Learning System: docs/guides/LEARNING-SYSTEM-USER-GUIDE.md
  • Pattern Management: docs/guides/PATTERN-MANAGEMENT-USER-GUIDE.md

⚡ Performance Tips:

  • Learning improves over time (20% target in 100 tasks)
  • Patterns increase test quality (85% confidence threshold)
  • Improvement loop optimizes continuously (1 hour cycles)
```

## Phase 1: Multi-Model Router

When enabled, the Multi-Model Router provides:

- **70-81% cost savings** through intelligent model selection
- **Automatic fallback chains** for resilience
- **Real-time cost tracking** and aggregation
- **Budget management** (daily $50, monthly $1000)

### Model Selection Rules

| Task Complexity | Model | Est. Cost | Use Case |
|----------------|-------|-----------|----------|
| **Simple** | GPT-3.5 | $0.0004 | Unit tests, basic validation |
| **Moderate** | GPT-3.5 | $0.0008 | Integration tests, mocks |
| **Complex** | GPT-4 | $0.0048 | Property-based, edge cases |
| **Critical** | Claude Sonnet 4.5 | $0.0065 | Security, architecture review |

## Phase 2: Learning System

The learning system uses Q-learning to optimize agent performance:

- **Algorithm**: Q-learning with experience replay
- **Learning Rate**: 0.1 (adjustable)
- **Discount Factor**: 0.95 (adjustable)
- **Exploration Rate**: 0.2 with decay (0.995)
- **Target Improvement**: 20% (adjustable)
- **Experience Buffer**: 10,000 experiences

### Learning Workflow

1. **Task Execution**: Agents execute tasks and record experiences
2. **Reward Calculation**: Success/failure + performance metrics
3. **Q-Table Update**: Q(s,a) = Q(s,a) + α * [r + γ * max(Q(s',a')) - Q(s,a)]
4. **Strategy Learning**: High-performing strategies are identified
5. **Continuous Improvement**: Performance improves over time

## Phase 2: Pattern Bank

The pattern bank stores and retrieves test patterns:

- **Pattern Extraction**: Automatic extraction from existing tests
- **Template Generation**: Reusable test templates
- **Confidence Scoring**: 85% minimum confidence threshold
- **Framework Support**: jest, mocha, cypress, vitest
- **Categories**: unit, integration, e2e, performance, security

### Pattern Workflow

1. **Extraction**: Analyze existing tests for patterns
2. **Classification**: Categorize patterns by type
3. **Storage**: Store patterns with metadata
4. **Retrieval**: Find matching patterns for new code
5. **Template Generation**: Generate tests from patterns

## Phase 2: Improvement Loop

The improvement loop continuously optimizes agent performance:

- **Cycle Interval**: 1 hour (adjustable)
- **A/B Testing**: Enabled by default (sample size: 100)
- **Auto-Apply**: Disabled (requires user approval)
- **Strategies**: Parallel execution, adaptive retry, resource optimization

### Improvement Workflow

1. **Performance Analysis**: Analyze current metrics
2. **Pattern Detection**: Identify failure patterns
3. **Optimization Discovery**: Find improvement opportunities
4. **A/B Testing**: Test strategies against each other
5. **Strategy Application**: Apply winning strategies (with approval)

## Environment Variables

```bash
# Phase 1: Routing
export AQE_ROUTING_ENABLED=true
export AQE_ROUTING_DEFAULT_MODEL=claude-sonnet-4.5
export AQE_ROUTING_DAILY_BUDGET=50
export AQE_ROUTING_MONTHLY_BUDGET=1000

# Phase 2: Learning
export AQE_LEARNING_ENABLED=true
export AQE_LEARNING_RATE=0.1
export AQE_LEARNING_DISCOUNT=0.95
export AQE_LEARNING_TARGET=0.20

# Phase 2: Patterns
export AQE_PATTERNS_ENABLED=true
export AQE_PATTERNS_MIN_CONFIDENCE=0.85

# Phase 2: Improvement
export AQE_IMPROVEMENT_ENABLED=true
export AQE_IMPROVEMENT_INTERVAL=3600000
export AQE_IMPROVEMENT_AUTO_APPLY=false
```

## Configuration Management

### Enable/Disable Features

```bash
# Enable routing after initialization
aqe routing enable

# Disable learning temporarily
aqe learn disable

# Enable improvement loop
aqe improve enable
```

### Update Configuration

Edit `.agentic-qe/config.json`:

```json
{
  "phase1": {
    "routing": {
      "enabled": true  // Change to enable routing
    }
  },
  "phase2": {
    "learning": {
      "targetImprovement": 0.30  // Increase target to 30%
    }
  }
}
```

## Troubleshooting

### Issue: Initialization fails

**Solution**: Check directory permissions and ensure Node.js version >= 16.

### Issue: Agent definitions not created

**Solution**: Ensure `agentic-qe` package is installed. Run:

```bash
npm install agentic-qe
```

### Issue: Learning system not improving

**Solution**: Learning requires at least 10 experiences. Execute more tasks.

### Issue: Pattern extraction returns empty

**Solution**: Ensure test files exist. Pattern extraction requires existing tests.

## Next Steps

After initialization:

1. **Review Configuration**: Check `.agentic-qe/config.json`
2. **Generate Tests**: Run `aqe test generate src/`
3. **Monitor Learning**: Run `aqe learn status`
4. **Check Patterns**: Run `aqe patterns list`
5. **Start Improvement**: Run `aqe improve start`

## Related Documentation

- [Getting Started](GETTING-STARTED.md)
- [Learning System User Guide](guides/LEARNING-SYSTEM-USER-GUIDE.md)
- [Pattern Management User Guide](guides/PATTERN-MANAGEMENT-USER-GUIDE.md)
- [Cost Optimization Guide](guides/COST-OPTIMIZATION-GUIDE.md)
- [Improvement Loop Guide](guides/IMPROVEMENT-LOOP-USER-GUIDE.md)

---

**Version**: 1.1.0
**Last Updated**: 2025-10-16
**Status**: ✅ Production Ready
