# Step 2: Spawn Core Agents (Parallel Batch 1)

## Prerequisites
- Step 1 completed

## Instructions

### Spawn ALL THREE in ONE message

| Agent | Domain | Role |
|-------|--------|------|
| qe-tdd-specialist | test-generation | TDD adherence and test-first assessment |
| qe-code-complexity | code-intelligence | Cyclomatic complexity and maintainability |
| qe-coverage-specialist | coverage-analysis | Coverage gap detection and recommendations |

### Agent 1: TDD Specialist
Analyze TDD adherence, test-code ratio, test-first evidence. Save to: `${OUTPUT_FOLDER}/02-tdd-analysis.md`

### Agent 2: Code Complexity
Analyze cyclomatic complexity, cognitive complexity, coupling. Save to: `${OUTPUT_FOLDER}/03-complexity-analysis.md`

### Agent 3: Coverage Specialist
Detect coverage gaps, untested paths, coverage by module. Save to: `${OUTPUT_FOLDER}/04-coverage-analysis.md`

## Success Criteria
- [ ] All THREE agents spawned

## Navigation
- On success: proceed to Step 3 by reading `steps/03-batch1-results.md`
