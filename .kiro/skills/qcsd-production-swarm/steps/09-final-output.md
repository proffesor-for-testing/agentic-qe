# Step 9: Final Output & Completion Summary

## Prerequisites
- All previous steps (1-8) completed
- All reports saved to OUTPUT_FOLDER
- FINAL RECOMMENDATION determined
- Feedback loops closed

## Instructions

**At the very end of swarm execution, ALWAYS output this completion summary:**

```
+---------------------------------------------------------------------+
|                  QCSD PRODUCTION SWARM COMPLETE                       |
+---------------------------------------------------------------------+
|                                                                      |
|  Release Assessed: [Release Name/ID]                                  |
|  Reports Generated: [count]                                           |
|  Output Folder: ${OUTPUT_FOLDER}                                     |
|                                                                      |
|  PRODUCTION HEALTH SCORES:                                            |
|  +-- DORA Score:              __.__ (Elite/High/Med/Low)             |
|  +-- SLA Compliance:          __%                                     |
|  +-- Incident Severity:       P_/NONE                                |
|  +-- Defect Trend:            declining/stable/increasing            |
|  +-- RCA Completeness:        __%                                     |
|  +-- Defect Density:          __.__ per KLOC                         |
|  +-- Learning Quality:        __/100                                   |
|  [IF HAS_INFRASTRUCTURE_CHANGE]                                       |
|  +-- Chaos Resilience:        __/100                                  |
|  [IF HAS_PERFORMANCE_SLA]                                             |
|  +-- Performance SLA:         __/100                                  |
|  [IF HAS_REGRESSION_RISK]                                             |
|  +-- Regression Score:        __/100                                  |
|  [IF HAS_RECURRING_INCIDENTS]                                         |
|  +-- Recurring Patterns:      __ identified                          |
|  [IF HAS_MIDDLEWARE]                                                  |
|  +-- Middleware Health:        __/100                                  |
|  [IF HAS_SAP_INTEGRATION]                                            |
|  +-- SAP Health:               __/100                                  |
|  [IF HAS_AUTHORIZATION]                                              |
|  +-- SoD Compliance:           __/100                                  |
|                                                                      |
|  FEEDBACK LOOPS:                                                      |
|  +-- To Ideation:             [X signals transferred]                |
|  +-- To Refinement:           [X signals transferred]                |
|  +-- Loop Closure:            X/Y closed                             |
|                                                                      |
|  RECOMMENDATION: [HEALTHY / DEGRADED / CRITICAL]                      |
|  REASON: [1-2 sentence rationale]                                     |
|                                                                      |
|  DELIVERABLES:                                                        |
|  +-- 01-executive-summary.md                                          |
|  +-- 02-dora-metrics.md                                               |
|  +-- 03-defect-prediction.md                                          |
|  +-- 04-root-cause-analysis.md                                        |
|  [IF HAS_INFRASTRUCTURE_CHANGE]                                       |
|  +-- 05-chaos-resilience.md                                           |
|  [IF HAS_PERFORMANCE_SLA]                                             |
|  +-- 06-performance-sla.md                                            |
|  [IF HAS_REGRESSION_RISK]                                             |
|  +-- 07-regression-analysis.md                                        |
|  [IF HAS_RECURRING_INCIDENTS]                                         |
|  +-- 08-pattern-analysis.md                                           |
|  +-- 09-learning-persistence.json                                     |
|  [IF HAS_MIDDLEWARE]                                                  |
|  +-- 10-middleware-health.md                                          |
|  [IF HAS_SAP_INTEGRATION]                                            |
|  +-- 11-sap-health.md                                                |
|  [IF HAS_AUTHORIZATION]                                              |
|  +-- 12-sod-compliance.md                                            |
|  +-- 13-feedback-loops.md                                             |
|                                                                      |
+---------------------------------------------------------------------+
```

**IF recommendation is CRITICAL, ALSO output this prominent action box:**

```
+---------------------------------------------------------------------+
|  ACTION REQUIRED: PRODUCTION CRITICAL - IMMEDIATE ATTENTION           |
+---------------------------------------------------------------------+
|                                                                      |
|  The following critical issues MUST be resolved immediately:          |
|                                                                      |
|  1. [Critical issue 1 with specific remediation]                      |
|  2. [Critical issue 2 with specific remediation]                      |
|  3. [Critical issue 3 with specific remediation]                      |
|                                                                      |
|  NEXT STEPS:                                                          |
|  - Activate incident response for all P0/P1 incidents                |
|  - Address all critical issues listed above                           |
|  - Consider rollback if production stability cannot be restored      |
|  - Re-run /qcsd-production-swarm after stabilization                 |
|  - Target: DORA >= 0.7, SLA >= 99%, no P0/P1, density <= 2.0        |
|                                                                      |
+---------------------------------------------------------------------+
```

**IF recommendation is DEGRADED, output this guidance box:**

```
+---------------------------------------------------------------------+
|  DEGRADED: PRODUCTION NEEDS ATTENTION                                 |
+---------------------------------------------------------------------+
|                                                                      |
|  The production environment is functional but requires improvement:   |
|                                                                      |
|  1. [Improvement 1 - must be addressed this sprint]                   |
|  2. [Improvement 2 - must be addressed next sprint]                   |
|                                                                      |
|  MONITORING STRATEGY:                                                 |
|  - Increase monitoring frequency for [specific metrics]              |
|  - Set tighter alert thresholds for [conditions]                     |
|  - Schedule follow-up production assessment in [timeframe]           |
|                                                                      |
|  FEEDBACK LOOP ACTIONS:                                               |
|  - Ideation: Update risk criteria based on production learnings      |
|  - Refinement: Add BDD scenarios for escaped defect patterns         |
|  - Development: Increase test coverage for identified hotspots       |
|                                                                      |
+---------------------------------------------------------------------+
```

**DO NOT end the swarm without displaying the completion summary.**

## Success Criteria
- [ ] Completion summary displayed with all metrics filled
- [ ] Recommendation-specific action box shown (CRITICAL or DEGRADED)
- [ ] All deliverable files listed
- [ ] Feedback loop status reported

## Output
This is the final step. The swarm execution is complete.

## Navigation
- This is the terminal step. No further steps.
- To re-run: invoke `/qcsd-production-swarm` again
- To resume from a specific step: use `--from-step N`
