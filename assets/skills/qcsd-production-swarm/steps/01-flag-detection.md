# Step 1: Flag & Signal Detection

## Prerequisites
- Production swarm skill invoked
- TELEMETRY_DATA path provided (or pre-collected telemetry available)
- RELEASE_ID identified (optional)
- OUTPUT_FOLDER determined

## Instructions

### Step 0: Retrieve CI/CD Phase Signals (Cross-Phase Consumption)

Before analyzing production context, retrieve the most recent CI/CD phase signals from memory.
These provide the release readiness baseline that the Production Swarm builds upon.

**MCP Method (preferred):**

```javascript
mcp__agentic-qe__memory_query({
  pattern: "qcsd-cicd-*",
  namespace: "qcsd-cicd",
  limit: 1
})
```

**CLI Fallback:**

```bash
npx @claude-flow/cli@latest memory search --query "qcsd-cicd" --namespace qcsd-cicd --limit 1
```

**Extract and record CI/CD baseline (if available):**

```
+-------------------------------------------------------------+
|                CI/CD PHASE BASELINE                          |
+-------------------------------------------------------------+
|                                                              |
|  Retrieved:     [YES / NO - memory query failed]             |
|                                                              |
|  Release Decision:       [RELEASE / REMEDIATE / BLOCK / N/A] |
|  Deployment Risk Score:  [value / N/A]                       |
|  Quality Gate Status:    [PASSED / FAILED / N/A]             |
|  Known Issues:           [list / NONE]                       |
|  Monitoring Recommendations: [list / NONE]                   |
|                                                              |
|  If NO CI/CD baseline: Proceed without baseline.             |
|  Note "NO CI/CD BASELINE AVAILABLE" in report.               |
|                                                              |
+-------------------------------------------------------------+
```

**DO NOT skip this step.** If memory retrieval fails, proceed without baseline but document the gap.

---

### Step 0.5: Auto-Detect Pre-Collected Telemetry

Before requiring manual telemetry input, check if the GitHub Actions telemetry collection
workflow has pre-collected DORA metrics. This runs automatically after every npm publish
and weekly on schedule.

**Check for pre-collected telemetry:**

```bash
TELEMETRY_FILE="docs/telemetry/production/latest.json"
```

**If the file exists and is recent (< 7 days old):**
- Use it as the primary TELEMETRY_DATA source
- The DORA metrics (deployment frequency, lead time, change failure rate, MTTR) are already
  computed from GitHub API — the qe-metrics-optimizer agent should validate and enrich these,
  not recompute from scratch
- Record: `TELEMETRY SOURCE: GHA pre-collected (${collectionTimestamp from JSON})`
- Extract the `releaseId` from the JSON if RELEASE_ID was not provided as a parameter

**If the file does not exist or is stale (> 7 days old):**
- Proceed with the manually provided TELEMETRY_DATA parameter as currently specified
- Record: `TELEMETRY SOURCE: Manual input`

**This step is non-blocking.** If pre-collected telemetry is unavailable, the swarm
operates exactly as before. Pre-collected telemetry simply accelerates Phase 2 by
giving qe-metrics-optimizer a validated starting point.

---

### Step 1: Scan Production Context and Detect Flags

Scan the production telemetry, incident reports, DORA data, and release context to SET these flags. Do not skip any flag.

### Flag Detection (Check ALL SEVEN)

```
HAS_INFRASTRUCTURE_CHANGE = FALSE
  Set TRUE if input mentions RECENT infrastructure changes since last release:
  Kubernetes config changes, container image updates, cloud resource modifications,
  deployment topology changes, scaling policy updates, network rule changes,
  load balancer updates, DNS changes, certificate rotations, CDN changes.
  NOTE: General mentions of infrastructure existing do NOT trigger this flag.
  Only RECENT CHANGES to infrastructure trigger it.

HAS_PERFORMANCE_SLA = FALSE
  Set TRUE if input mentions ANY of: SLA, SLO, SLI, response time requirements,
  latency targets, error budgets, throughput thresholds, availability targets,
  uptime requirements, p95 latency, p99 latency, error rate targets

HAS_REGRESSION_RISK = FALSE
  Set TRUE if input mentions ANY of: user-reported issues, error rate increases,
  degraded functionality, rollback consideration, feature flag incidents,
  A/B test anomalies, customer complaints, support ticket spikes,
  monitoring alerts, degraded performance post-deploy

HAS_RECURRING_INCIDENTS = FALSE
  Set TRUE if input mentions ANY of: repeated incidents, known recurring issues,
  incident patterns, chronic alerts, previously-seen failure modes,
  flapping services, repeat offender modules, recurring pages,
  same-root-cause incidents, deja-vu failures

HAS_MIDDLEWARE = FALSE
  Set TRUE if input mentions ANY of: middleware, ESB, message broker, MQ,
  Kafka, RabbitMQ, integration bus, API gateway, message queue, pub/sub,
  event bus, service bus, ActiveMQ, NATS, Redis Streams

HAS_SAP_INTEGRATION = FALSE
  Set TRUE if input mentions ANY of: SAP, RFC, BAPI, IDoc, OData,
  S/4HANA, EWM, ECC, ABAP, CDS view, Fiori, SAP Cloud Integration,
  SAP PI/PO, SAP Gateway, SAP connector

HAS_AUTHORIZATION = FALSE
  Set TRUE if input mentions ANY of: SoD, segregation of duties,
  role conflict, authorization object, T-code, user role,
  access control matrix, GRC, RBAC policy, permission matrix,
  privilege escalation, role assignment
```

### Validation Checkpoint

Before proceeding, confirm:

```
+-- I have read the production telemetry and incident reports
+-- I have read the DORA metrics data
+-- I have reviewed the release context and CI/CD phase signals
+-- I have evaluated ALL SEVEN flags
+-- I have recorded which flags are TRUE
+-- I understand which conditional agents will be needed
```

**DO NOT proceed until all checkboxes are confirmed.**

### MANDATORY: Output Flag Detection Results

You MUST output flag detection results before proceeding:

```
+-------------------------------------------------------------+
|                    FLAG DETECTION RESULTS                    |
+-------------------------------------------------------------+
|                                                             |
|  HAS_INFRASTRUCTURE_CHANGE: [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_PERFORMANCE_SLA:       [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_REGRESSION_RISK:       [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_RECURRING_INCIDENTS:   [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_MIDDLEWARE:             [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_SAP_INTEGRATION:       [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  HAS_AUTHORIZATION:          [TRUE/FALSE]                    |
|  Evidence:                  [what triggered it - specific]  |
|                                                             |
|  EXPECTED AGENTS:                                           |
|  - Core: 3 (always)                                         |
|  - Conditional: [count based on TRUE flags]                 |
|  - Feedback: 2 (always)                                     |
|  - TOTAL: [3 + conditional count + 2]                       |
|                                                             |
+-------------------------------------------------------------+
```

## Success Criteria
- [ ] CI/CD phase signals retrieved (or documented as unavailable)
- [ ] Pre-collected telemetry checked
- [ ] All SEVEN flags evaluated with evidence
- [ ] Flag detection results output in the required format
- [ ] Expected agent count calculated

## Output
Provide to the next step:
- CI/CD baseline data (or "NO CI/CD BASELINE AVAILABLE")
- Telemetry source (GHA pre-collected or Manual input)
- All seven flag values with evidence
- Expected agent count (core + conditional + feedback)

## Navigation
- On success: proceed to Step 2 (Core Agents) by reading `steps/02-core-agents.md`
- On failure: halt and report which flags could not be evaluated or which data was missing
