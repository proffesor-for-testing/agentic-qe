# Step 1: Analyze Pipeline Context (Flag Detection)

## Prerequisites
- CI/CD swarm skill invoked
- PIPELINE_ARTIFACTS path provided
- OUTPUT_FOLDER determined

## Instructions

### MANDATORY: Complete this analysis before Step 2.

### Step 0: Retrieve Development Phase Signals

Retrieve the most recent Development phase signals from memory.

**MCP Method:**
```javascript
mcp__agentic-qe__memory_query({ pattern: "qcsd-development-*", namespace: "qcsd-development", limit: 1 })
```

### Flag Detection (Check ALL SIX)

```
HAS_SECURITY_PIPELINE = FALSE
  Set TRUE if pipeline artifacts include security scan results, SAST/DAST output,
  dependency vulnerability reports, container security scans, secret detection results

HAS_PERFORMANCE_PIPELINE = FALSE
  Set TRUE if pipeline includes performance test results, load test data,
  benchmark comparisons, response time measurements, throughput tests

HAS_INFRA_CHANGE = FALSE
  Set TRUE if pipeline includes infrastructure changes: Terraform plans,
  K8s manifests, Docker image changes, cloud resource modifications,
  deployment topology changes

HAS_MIDDLEWARE = FALSE
  Set TRUE if pipeline includes middleware components: message broker configs,
  ESB routes, API gateway rules, event bus schemas

HAS_SAP_INTEGRATION = FALSE
  Set TRUE if pipeline includes SAP artifacts: OData service definitions,
  SOAP WSDLs, IDoc schemas, RFC function modules

HAS_AUTHORIZATION = FALSE
  Set TRUE if pipeline includes authorization changes: role definitions,
  permission matrices, SoD policies, RBAC configurations
```

Output flag detection results before proceeding.

## Success Criteria
- [ ] Development phase signals retrieved
- [ ] All SIX flags evaluated with evidence
- [ ] Expected agent count calculated

## Output
All flag values with evidence, expected agent count.

## Navigation
- On success: proceed to Step 2 by reading `steps/02-core-agents.md`
- On failure: halt and report
