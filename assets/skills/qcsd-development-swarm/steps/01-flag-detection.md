# Step 1: Analyze Code Context (Flag Detection)

## Prerequisites
- Development swarm skill invoked
- SOURCE_PATH provided
- OUTPUT_FOLDER determined

## Instructions

### Step 0: Retrieve Refinement Phase Signals
```javascript
mcp__agentic-qe__memory_query({ pattern: "qcsd-refinement-*", namespace: "qcsd-refinement", limit: 1 })
```

### Flag Detection (Check ALL SIX)

```
HAS_SECURITY_CODE = FALSE
  Set TRUE if source code includes: auth logic, crypto, input validation,
  token handling, password management, encryption, access control

HAS_PERFORMANCE_CODE = FALSE
  Set TRUE if source code includes: database queries, caching, async ops,
  batch processing, file I/O, network calls, concurrency

HAS_CRITICAL_CODE = FALSE
  Set TRUE if source code includes: payment processing, PII handling,
  financial calculations, healthcare data, safety-critical logic

HAS_MIDDLEWARE = FALSE
  Set TRUE if code includes: message broker clients, queue producers/consumers,
  ESB integration, event publishing, pub/sub patterns

HAS_SAP_INTEGRATION = FALSE
  Set TRUE if code includes: SAP SDK calls, IDoc processing, RFC calls,
  BAPI invocations, OData client code

HAS_AUTHORIZATION = FALSE
  Set TRUE if code includes: role checks, permission validation,
  SoD enforcement, RBAC logic, authorization middleware
```

Output flag detection results.

## Success Criteria
- [ ] All SIX flags evaluated
- [ ] Expected agent count calculated

## Navigation
- On success: proceed to Step 2 by reading `steps/02-core-agents.md`
