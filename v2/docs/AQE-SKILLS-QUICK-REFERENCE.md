# AQE Skills Quick Reference

Quick reference guide for using the `aqe skills` CLI commands.

## Available Commands

### 📋 List All Skills

```bash
aqe skills list
```

Shows all 17 QE skills organized by category.

**Options**:
- `--detailed`: Show detailed information
- `--category <name>`: Filter by category (e.g., "Core Testing")

**Example Output**:
```
✔ Found 17 QE skills

🎯 Available QE Skills

Core Testing (3):
  • agentic-quality-engineering
  • context-driven-testing
  • holistic-testing-pact

...

Total QE Skills: 17/17
```

---

### 🔍 Search Skills

```bash
aqe skills search <keyword>
```

Search for skills by keyword.

**Examples**:
```bash
aqe skills search testing
aqe skills search api
aqe skills search tdd
```

**Output**:
```
✔ Found 4 matching QE skills

🔍 Search Results

  • api-testing-patterns
  • context-driven-testing
  • exploratory-testing-advanced
  • holistic-testing-pact
```

---

### 📖 Show Skill Details

```bash
aqe skills show <skill-name>
```

Display detailed documentation for a specific skill.

**Examples**:
```bash
aqe skills show agentic-quality-engineering
aqe skills show api-testing-patterns
aqe skills show tdd-london-chicago
```

**Output**:
```
✔ Skill loaded

📖 agentic-quality-engineering

Metadata:
name: Agentic Quality Engineering
description: Using AI agents as force multipliers...

---

# Agentic Quality Engineering

## What Is Agentic Quality Engineering?
...
```

---

### 📊 Show Statistics

```bash
aqe skills stats
```

Display skill statistics by category.

**Output**:
```
✔ Statistics calculated

📊 QE Skill Statistics

Total QE Skills: 17/17

📦 By Category:

  Professional              5
  Development               4
  Testing Techniques        4
  Core Testing              3
  Communication             1
```

---

### ⚙️ Enable/Disable Skills

```bash
aqe skills enable <skill-name>
aqe skills disable <skill-name>
```

Provides guidance for enabling/disabling skills for agents.

**Example**:
```bash
aqe skills enable api-testing-patterns --agent qe-test-generator
```

---

## All 17 QE Skills

### Core Testing (3)
1. **agentic-quality-engineering** - Using AI agents as force multipliers in quality work
2. **context-driven-testing** - Context-driven testing principles
3. **holistic-testing-pact** - Holistic Testing Model with PACT principles

### Development (4)
4. **tdd-london-chicago** - TDD London and Chicago school approaches
5. **xp-practices** - XP practices including pair/ensemble programming
6. **pair-programming** - AI-assisted pair programming modes
7. **sparc-methodology** - SPARC development methodology

### Testing Techniques (4)
8. **api-testing-patterns** - Comprehensive API testing patterns
9. **exploratory-testing-advanced** - Advanced exploratory testing techniques
10. **verification-quality** - Truth scoring and code quality verification
11. **bug-reporting-excellence** - High-quality bug report writing

### Communication (1)
12. **skill-builder** - Create new Claude Code Skills

### Professional (5)
13. **performance-analysis** - Performance analysis and optimization
14. **reasoningbank-intelligence** - Adaptive learning with ReasoningBank
15. **stream-chain** - Stream-JSON chaining for multi-agent pipelines
16. **swarm-advanced** - Advanced swarm orchestration patterns
17. **swarm-orchestration** - Multi-agent swarm orchestration

---

## Tips

1. **Discovery**: Start with `aqe skills list` to see all available skills
2. **Search**: Use `aqe skills search <keyword>` to find relevant skills quickly
3. **Learn More**: Use `aqe skills show <name>` to read full skill documentation
4. **Statistics**: Run `aqe skills stats` to see skill distribution by category

---

## Help

For command-specific help:

```bash
aqe skills --help
aqe skills list --help
aqe skills search --help
aqe skills show --help
```

---

**Generated**: October 20, 2025
**Version**: 1.1.0
**Feature**: CLI Enhancement Task 2/3
