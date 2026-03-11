# Step 4: Spawn Conditional Agents (Parallel Batch 2)

## Prerequisites
- Step 3 completed, flags from Step 1

## Instructions

| Flag | Agent | Output File |
|------|-------|-------------|
| HAS_UI | qe-accessibility-auditor | `05-accessibility-audit.md` |
| HAS_SECURITY | qe-security-auditor | `06-security-audit.md` |
| HAS_UX | qe-qx-partner | `07-ux-assessment.md` |
| HAS_MIDDLEWARE | qe-middleware-validator | `08-middleware-validation.md` |
| HAS_SAP_INTEGRATION | qe-sap-rfc-tester | `09-sap-assessment.md` |
| HAS_AUTHORIZATION | qe-sod-analyzer | `10-sod-analysis.md` |

If ALL flags FALSE, skip to Step 5.

## Success Criteria
- [ ] All flagged agents completed

## Navigation
- On success: proceed to Step 5 by reading `steps/05-decision-synthesis.md`
