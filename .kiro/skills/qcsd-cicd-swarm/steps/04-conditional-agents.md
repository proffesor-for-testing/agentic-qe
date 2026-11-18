# Step 4: Spawn Conditional Agents (Parallel Batch 2)

## Prerequisites
- Step 3 completed, flags from Step 1

## Instructions

| Flag | Agent | Output File |
|------|-------|-------------|
| HAS_SECURITY_PIPELINE | qe-security-scanner | `05-security-scan.md` |
| HAS_PERFORMANCE_PIPELINE | qe-chaos-engineer | `06-performance-assessment.md` |
| HAS_INFRA_CHANGE | qe-coverage-specialist | `07-coverage-analysis.md` |
| HAS_MIDDLEWARE | qe-middleware-validator | `08-middleware-validation.md` |
| HAS_SAP_INTEGRATION | qe-soap-tester | `09-soap-testing.md` |
| HAS_AUTHORIZATION | qe-sod-analyzer | `10-sod-analysis.md` |

If ALL flags FALSE, skip to Step 5.

## Success Criteria
- [ ] All flagged agents spawned and completed

## Navigation
- On success: proceed to Step 5 by reading `steps/05-decision-synthesis.md`
