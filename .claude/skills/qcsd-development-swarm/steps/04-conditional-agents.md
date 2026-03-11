# Step 4: Spawn Conditional Agents (Parallel Batch 2)

## Prerequisites
- Step 3 completed, flags from Step 1

## Instructions

| Flag | Agent | Output File |
|------|-------|-------------|
| HAS_SECURITY_CODE | qe-security-scanner | `05-security-scan.md` |
| HAS_PERFORMANCE_CODE | qe-performance-tester | `06-performance-assessment.md` |
| HAS_CRITICAL_CODE | qe-mutation-tester | `07-mutation-testing.md` |
| HAS_MIDDLEWARE | qe-message-broker-tester | `08-middleware-testing.md` |
| HAS_SAP_INTEGRATION | qe-sap-idoc-tester | `09-sap-testing.md` |
| HAS_AUTHORIZATION | qe-sod-analyzer | `10-sod-analysis.md` |

If ALL flags FALSE, skip to Step 5.

## Success Criteria
- [ ] All flagged agents completed

## Navigation
- On success: proceed to Step 5 by reading `steps/05-decision-synthesis.md`
