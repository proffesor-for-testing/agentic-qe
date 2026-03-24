---
name: pair-programming
description: "Pair program with AI assistance using driver/navigator roles, TDD workflows, real-time code review, and quality monitoring. Switch modes between driver, navigator, TDD, debug, mentor, and review. Use when pair programming, practicing TDD with a navigator, or running collaborative debugging sessions."
---

# Pair Programming

Collaborative AI pair programming with intelligent role management, real-time quality monitoring, and integrated testing workflows.

## Quick Start

```bash
# Basic session
claude-flow pair --start

# TDD session with 90% coverage target
claude-flow pair --start --mode tdd --test-first --coverage 90

# Debug session
claude-flow pair --start --mode debug --verbose --trace

# Refactoring with high verification
claude-flow pair --start --agent senior-dev --focus refactor --verify --threshold 0.98
```

## Available Modes

| Mode | Description | Best For |
|------|-------------|----------|
| **Driver** | You code, AI navigates | Learning, familiar features |
| **Navigator** | AI codes, you direct | Rapid prototyping, boilerplate |
| **Switch** | Auto-alternating roles | Long sessions, balanced collaboration |
| **TDD** | Test-first red-green-refactor | Building with tests |
| **Review** | Continuous code review | Quality-focused work |
| **Mentor** | Learning-focused with explanations | Skill development |
| **Debug** | Systematic problem-solving | Fixing issues |

## Driver Mode

You write code while AI provides strategic guidance and real-time review.

```bash
claude-flow pair --start --mode driver
```

**Commands:**
```
/suggest     - Get implementation suggestions
/review      - Request code review
/explain     - Ask for explanations
/optimize    - Request optimization ideas
```

## Navigator Mode

AI writes code while you provide direction and review.

```bash
claude-flow pair --start --mode navigator
```

**Commands:**
```
/implement   - Direct AI to implement
/refactor    - Request refactoring
/test        - Generate tests
/alternate   - See alternative approaches
```

## TDD Workflow

```bash
claude-flow pair --start --mode tdd --test-first
```

```
[RED PHASE]
/test-gen "add item to cart"
> AI writes failing tests

[GREEN PHASE]
/implement minimal cart functionality
> You write just enough code to pass

[REFACTOR PHASE]
/refactor --pattern repository
> AI refactors to clean pattern

/test
> Tests still passing: 3/3
```

## In-Session Commands

### Code Commands
```
/explain [--level basic|detailed|expert]
/suggest [--type refactor|optimize|security]
/implement <description>
/refactor [--pattern <pattern>] [--scope function|file|module]
/optimize [--target speed|memory|both]
/document [--format jsdoc|markdown]
```

### Testing Commands
```
/test [--watch] [--coverage]
/test-gen [--type unit|integration|e2e]
/coverage [--report html|json]
/mock <target> [--realistic]
```

### Review Commands
```
/review [--scope current|file|changes] [--strict]
/security [--deep] [--fix]
/perf [--profile] [--suggestions]
/complexity [--threshold <value>]
```

### Git Commands
```
/diff [--staged]
/commit [--message <msg>]
/branch [create|switch|list] [<name>]
/stash [save|pop|list]
```

### Shortcuts
| Alias | Command | Alias | Command |
|-------|---------|-------|---------|
| `/s` | `/suggest` | `/r` | `/review` |
| `/e` | `/explain` | `/c` | `/commit` |
| `/t` | `/test` | `/sw` | `/switch` |

## Configuration

```json
{
  "pair": {
    "defaultMode": "switch",
    "modes": {
      "switch": { "interval": "10m", "warning": "30s", "autoSwitch": true }
    },
    "verification": {
      "enabled": true,
      "threshold": 0.95,
      "autoRollback": true,
      "preCommitCheck": true
    },
    "testing": {
      "autoRun": true,
      "framework": "jest",
      "coverage": { "minimum": 80, "enforce": true }
    }
  }
}
```

## Built-in Agents

| Agent | Focus | Review Level |
|-------|-------|-------------|
| `senior-dev` | Architecture, patterns, optimization | Strict |
| `tdd-specialist` | Testing, mocks, coverage | Comprehensive |
| `debugger-expert` | Debugging, profiling, tracing | Focused |
| `junior-dev` | Learning, basics, documentation | Educational |

## Session Management

```bash
claude-flow pair --status          # Check current session
claude-flow pair --history         # View past sessions
claude-flow pair --save            # Save session
claude-flow pair --load <id>       # Load session
claude-flow pair --report <id>     # Generate report
```

**Status output:**
```
Session: pair_1755021234567 | Duration: 45m | Mode: Switch
Partner: senior-dev | Role: DRIVER | Next Switch: 3m
Truth Score: 0.982 | Lines: 234 | Tests: 12 | Coverage: 87%
```

## Profiles

```bash
# Create reusable profile
claude-flow pair profile create refactoring --mode driver --verify --threshold 0.98

# Use profile
claude-flow pair --start --profile refactoring
```

## Quality Thresholds

| Metric | Error | Warning | Good | Excellent |
|--------|-------|---------|------|-----------|
| Truth Score | <0.90 | 0.90-0.95 | 0.95-0.98 | >0.98 |
| Coverage | <70% | 70-80% | 80-90% | >90% |
| Complexity | >15 | 10-15 | 5-10 | <5 |

## Session Templates

```bash
claude-flow pair --template refactor  # High verification, continuous review
claude-flow pair --template feature   # Standard verification, pre-commit review
claude-flow pair --template debug     # Analytical mode, regression tests
claude-flow pair --template learn     # Mentor mode, slow pace, detailed explanations
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Session won't start | Check agent availability, verify config syntax |
| Disconnected | Use `--recover`, check auto-save files |
| Poor performance | Reduce verification threshold, disable continuous testing |
| Config issues | Run `claude-flow pair config validate` |
