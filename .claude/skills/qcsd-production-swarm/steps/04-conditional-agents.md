# Step 4: Spawn Conditional Agents (Parallel Batch 2)

## Prerequisites
- Step 3 (Batch 1 Results) completed with all metrics extracted
- Flag detection results from Step 1 available
- Core agent reports saved to OUTPUT_FOLDER

## Instructions

### ENFORCEMENT: NO SKIPPING CONDITIONAL AGENTS

```
+-------------------------------------------------------------+
|  IF A FLAG IS TRUE, YOU MUST SPAWN THAT AGENT                |
|                                                              |
|  HAS_INFRASTRUCTURE_CHANGE = TRUE -> MUST spawn qe-chaos-engineer       |
|  HAS_PERFORMANCE_SLA = TRUE       -> MUST spawn qe-performance-tester   |
|  HAS_REGRESSION_RISK = TRUE       -> MUST spawn qe-regression-analyzer  |
|  HAS_RECURRING_INCIDENTS = TRUE   -> MUST spawn qe-pattern-learner      |
|  HAS_MIDDLEWARE = TRUE             -> MUST spawn qe-middleware-validator  |
|  HAS_SAP_INTEGRATION = TRUE       -> MUST spawn qe-sap-rfc-tester       |
|  HAS_AUTHORIZATION = TRUE         -> MUST spawn qe-sod-analyzer         |
|                                                              |
|  Skipping a flagged agent is a FAILURE of this skill.        |
+-------------------------------------------------------------+
```

### Conditional Domain Mapping

| Flag | Agent | Domain | MCP Tool |
|------|-------|--------|----------|
| HAS_INFRASTRUCTURE_CHANGE | qe-chaos-engineer | chaos-resilience | `performance_benchmark` |
| HAS_PERFORMANCE_SLA | qe-performance-tester | chaos-resilience | `performance_benchmark` |
| HAS_REGRESSION_RISK | qe-regression-analyzer | defect-intelligence | `defect_predict` |
| HAS_RECURRING_INCIDENTS | qe-pattern-learner | defect-intelligence | `root_cause_analyze` |
| HAS_MIDDLEWARE | qe-middleware-validator | enterprise-integration | `task_orchestrate` |
| HAS_SAP_INTEGRATION | qe-sap-rfc-tester | enterprise-integration | `task_orchestrate` |
| HAS_AUTHORIZATION | qe-sod-analyzer | enterprise-integration | `task_orchestrate` |

### Decision Tree

```
IF ALL flags are FALSE:
    -> Skip to Step 5 (no conditional agents needed)
    -> State: "No conditional agents needed based on production context"

ELSE:
    -> Spawn ALL applicable agents in ONE message
    -> Count how many you're spawning: __
```

### IF HAS_INFRASTRUCTURE_CHANGE: Chaos Engineer

Spawn qe-chaos-engineer to assess resilience of production systems after recent infrastructure changes. Agent must analyze infrastructure change impact, run resilience tests, assess auto-recovery, evaluate resource utilization, and produce a Chaos Resilience Score (0-100). Save to: `${OUTPUT_FOLDER}/05-chaos-resilience.md`

### IF HAS_PERFORMANCE_SLA: Performance Tester

Spawn qe-performance-tester to validate production performance against SLA/SLO targets. Agent must assess SLA/SLO compliance, detect performance regressions, analyze error budgets, evaluate latency distributions, and produce a Performance SLA Score (0-100). Save to: `${OUTPUT_FOLDER}/06-performance-sla.md`

### IF HAS_REGRESSION_RISK: Regression Analyzer

Spawn qe-regression-analyzer to analyze production regressions from user-reported issues and monitoring data. Agent must inventory regressions, analyze error rates, map root causes, assess user impact, and produce a Regression Analysis Score (0-100). Save to: `${OUTPUT_FOLDER}/07-regression-analysis.md`

### IF HAS_RECURRING_INCIDENTS: Pattern Learner

Spawn qe-pattern-learner to detect recurring incident patterns in production. Agent must identify recurring patterns, analyze flapping services, find repeat offender modules, cluster same-root-cause incidents, and provide recommendations. Save to: `${OUTPUT_FOLDER}/08-pattern-analysis.md`

### IF HAS_MIDDLEWARE: Middleware Validator

Spawn qe-middleware-validator to validate middleware and message broker health. Agent must inventory middleware components, assess message flow health, evaluate broker health, analyze message loss, and produce a Middleware Health Score (0-100). Save to: `${OUTPUT_FOLDER}/10-middleware-health.md`

### IF HAS_SAP_INTEGRATION: SAP RFC Tester

Spawn qe-sap-rfc-tester to validate SAP RFC/BAPI integration health. Agent must inventory SAP services, assess RFC/BAPI health, validate data integrity, evaluate connector performance, and produce a SAP Health Score (0-100). Save to: `${OUTPUT_FOLDER}/11-sap-health.md`

### IF HAS_AUTHORIZATION: SoD Analyzer

Spawn qe-sod-analyzer to validate segregation of duties and authorization controls. Agent must assess compliance status, inventory SoD violations, analyze role assignments, evaluate access control effectiveness, and produce a SoD Compliance Score (0-100). Save to: `${OUTPUT_FOLDER}/12-sod-compliance.md`

### Agent Count Validation

```
+-------------------------------------------------------------+
|                   AGENT COUNT VALIDATION                     |
+-------------------------------------------------------------+
|  CORE AGENTS (ALWAYS 3):                                     |
|    [ ] qe-metrics-optimizer - SPAWNED                        |
|    [ ] qe-defect-predictor - SPAWNED                         |
|    [ ] qe-root-cause-analyzer - SPAWNED                      |
|  CONDITIONAL AGENTS (based on flags):                        |
|    [ ] qe-chaos-engineer - [Y/N] (HAS_INFRA)                |
|    [ ] qe-performance-tester - [Y/N] (HAS_PERF_SLA)         |
|    [ ] qe-regression-analyzer - [Y/N] (HAS_REGRESS)         |
|    [ ] qe-pattern-learner - [Y/N] (HAS_RECURRING)           |
|    [ ] qe-middleware-validator - [Y/N] (HAS_MIDDLEWARE)       |
|    [ ] qe-sap-rfc-tester - [Y/N] (HAS_SAP_INTEG)            |
|    [ ] qe-sod-analyzer - [Y/N] (HAS_AUTHORIZATION)          |
|  FEEDBACK AGENTS (ALWAYS 2): PENDING (Step 7)               |
|  VALIDATION:                                                 |
|    Expected so far: [3 + count of TRUE flags]                |
|    Actual spawned:  [count]                                  |
|    Status:          [PASS/FAIL]                              |
+-------------------------------------------------------------+
```

**DO NOT proceed if validation FAILS. Wait for all conditional agents to complete.**

## Success Criteria
- [ ] All flagged conditional agents spawned in ONE message (or skipped to Step 5 if no flags)
- [ ] Agent count validation PASSED
- [ ] All conditional agents completed and returned results
- [ ] Conditional scores extracted

## Output
Provide to the next step:
- regressionCount (from qe-regression-analyzer, or NULL)
- chaosResilience (from qe-chaos-engineer, or NULL, 0-100)
- middlewareHealth (from qe-middleware-validator, or NULL, 0-100)
- sapHealth (from qe-sap-rfc-tester, or NULL, 0-100)
- sodCompliance (from qe-sod-analyzer, or NULL, 0-100)
- Agent count validation result

## Navigation
- On success: proceed to Step 5 (Decision Logic) by reading `steps/05-decision-synthesis.md`
- On failure: spawn missing agents before proceeding
