# Step 1: Analyze Story Content (Flag Detection)

## Prerequisites
- Refinement swarm skill invoked
- User story / acceptance criteria provided
- OUTPUT_FOLDER determined

## Instructions

### MANDATORY: Complete this analysis before Step 2.

### Step 0: Retrieve Ideation Phase Signals (Cross-Phase Consumption)

Before analyzing story content, retrieve the most recent Ideation phase signals from memory.

**MCP Method (preferred):**

```javascript
mcp__agentic-qe__memory_query({
  pattern: "qcsd-ideation-*",
  namespace: "qcsd-ideation",
  limit: 1
})
```

**CLI Fallback:**

```bash
npx --no-install ruflo memory search --query "qcsd-ideation" --namespace qcsd-ideation --limit 1
```

### Step 1: Scan Story Content and Detect Flags

Scan the user story, acceptance criteria, and any referenced specifications to SET these flags. Do not skip any flag.

### Flag Detection (Check ALL SEVEN)

```
HAS_API = FALSE
  Set TRUE if story mentions ANY of: API, endpoint, REST, GraphQL, gRPC,
  webhook, contract, consumer, provider, OpenAPI, Swagger, request/response,
  HTTP method, payload, schema, backward compatibility

HAS_REFACTORING = FALSE
  Set TRUE if story mentions ANY of: refactor, restructure, rewrite,
  migrate, replace, consolidate, extract, decompose, simplify, optimize,
  technical debt, legacy, modernize, upgrade

HAS_DEPENDENCIES = FALSE
  Set TRUE if story mentions ANY of: dependency, library, package, version,
  upgrade, third-party, external service, integration, SDK, plugin,
  framework update, breaking change, compatibility

HAS_SECURITY = FALSE
  Set TRUE if story mentions ANY of: authentication, authorization, encryption,
  token, OAuth, JWT, RBAC, security, vulnerability, OWASP, input validation,
  sanitization, XSS, CSRF, injection, secrets, credentials

HAS_MIDDLEWARE = FALSE
  Set TRUE if story mentions ANY of: middleware, ESB, message broker, MQ,
  Kafka, RabbitMQ, integration bus, API gateway, message queue, pub/sub,
  event bus, service bus, ActiveMQ, NATS, Redis Streams

HAS_SAP_INTEGRATION = FALSE
  Set TRUE if story mentions ANY of: SAP, OData, RFC, BAPI, IDoc,
  S/4HANA, EWM, ECC, ABAP, CDS view, Fiori, SAP Cloud Integration,
  SAP PI/PO, SAP Gateway, SAP connector

HAS_AUTHORIZATION = FALSE
  Set TRUE if story mentions ANY of: SoD, segregation of duties,
  role conflict, authorization object, T-code, user role,
  access control matrix, GRC, RBAC policy, permission matrix,
  privilege escalation, role assignment
```

### MANDATORY: Output Flag Detection Results

You MUST output flag detection results in a structured format showing each flag value with evidence before proceeding.

## Success Criteria
- [ ] Ideation phase signals retrieved (or documented as unavailable)
- [ ] All SEVEN flags evaluated with evidence
- [ ] Flag detection results output
- [ ] Expected agent count calculated (3 core + conditional count + 1 transformation)

## Output
Provide: All flag values with evidence, expected agent count, Ideation baseline data.

## Navigation
- On success: proceed to Step 2 by reading `steps/02-core-agents.md`
- On failure: halt and report which flags could not be evaluated
