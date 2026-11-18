# Step 4: Spawn Conditional Agents (Parallel Batch 2)

## Prerequisites
- Step 3 completed with core metrics
- Flag values from Step 1

## Instructions

### IF A FLAG IS TRUE, YOU MUST SPAWN THAT AGENT

| Flag | Agent | Domain | Output File |
|------|-------|--------|-------------|
| HAS_API | qe-contract-validator | contract-testing | `05-contract-validation.md` |
| HAS_REFACTORING | qe-impact-analyzer | code-intelligence | `06-impact-analysis.md` |
| HAS_DEPENDENCIES | qe-dependency-mapper | code-intelligence | `07-dependency-analysis.md` |
| HAS_SECURITY | (handled by core) | - | - |
| HAS_MIDDLEWARE | qe-middleware-validator | enterprise-integration | `08-middleware-validation.md` |
| HAS_SAP_INTEGRATION | qe-odata-contract-tester | enterprise-integration | `09-odata-contracts.md` |
| HAS_AUTHORIZATION | qe-sod-analyzer | enterprise-integration | `10-sod-analysis.md` |

If ALL flags are FALSE, skip to Step 5.

Otherwise, spawn all applicable agents in ONE message and WAIT for completion.

## Success Criteria
- [ ] All flagged agents spawned (or skipped if no flags)
- [ ] Agent count validation passed
- [ ] All conditional agents completed

## Output
Conditional agent scores for decision logic.

## Navigation
- On success: proceed to Step 5 by reading `steps/05-decision-synthesis.md`
- On failure: spawn missing agents
