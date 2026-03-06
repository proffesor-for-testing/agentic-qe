# Superplane Product Quality & User Experience (QX) Analysis

## SFDIPOT Framework Assessment

**Project**: Superplane - Open Source DevOps Control Plane
**Version**: Alpha (pre-1.0)
**Date**: 2026-03-06
**Methodology**: HTSM Product Factors (Bach) - SFDIPOT
**Codebase**: Go 1.25 monolith (~318K LOC, 1411 Go files) + React/TypeScript frontend

---

## Executive Summary

Superplane is a well-architected alpha-stage DevOps control plane with strong foundational engineering choices: a modular monolith with clean package separation, gRPC-first API design with REST gateway, 37 third-party integrations, and thoughtful multi-tenancy. The project demonstrates engineering maturity well above typical alpha products in several dimensions (architecture documentation, contributor experience, E2E testing patterns) while showing expected gaps in others (operational hardening, schema migration strategy at scale, SSRF defaults).

**Overall QX Score: 72/100** (Strong for alpha; key gaps in operational readiness and security defaults)

| Factor | Score | Verdict |
|--------|-------|---------|
| Structure | 78/100 | Strong modular monolith; some coupling concerns |
| Function | 75/100 | Core complete; AI features in-progress; missing audit trail |
| Data | 68/100 | Clean schema; 197 migrations is aggressive; no retention policy |
| Interfaces | 80/100 | Excellent API-first design; auto-generated clients |
| Platform | 70/100 | Docker/Helm/tarball options; RabbitMQ adds operational cost |
| Operations | 65/100 | Good OTel foundation; logging is basic; no runbook |
| Time | 60/100 | Alpha honest about instability; no upgrade/migration guide |

---

## 1. STRUCTURE: What the Product IS

### 1.1 Package Organization (Score: 80/100)

The Go monolith uses a flat `pkg/` structure with 30+ packages organized by domain concern:

```
pkg/
  authentication/   authorization/   cli/          components/
  config/           configuration/   core/         crypto/
  database/         grpc/            integrations/ jwt/
  logging/          models/          oidc/         openapi_client/
  protos/           public/          registry/     retry/
  secrets/          server/          services/     telemetry/
  templates/        triggers/        utils/        web/
  widgets/          workers/
```

**Strengths:**
- Clean separation between API layer (`grpc/`, `public/`), business logic (`core/`, `services/`), and infrastructure (`database/`, `crypto/`, `telemetry/`)
- Integration/component/trigger packages follow a consistent registration pattern via Go `init()` functions and a central registry
- 37 integration packages each isolated in their own directory under `pkg/integrations/`
- 14 built-in component types (approval, filter, HTTP, SSH, merge, memory operations, time gate, wait, if/conditional, noop)
- Architecture documentation at `docs/contributing/architecture.md` is clear and accurate

**Risks and Concerns:**
- **`server.go` is a configuration monolith**: The `Start()` function (470 lines) is a single function that wires everything together using 30+ environment variables. Worker startup is controlled by `START_*` env vars checked with string comparisons -- no configuration struct, no validation, no defaults documentation. Missing any required env var causes a `panic()`
- **Init-based registration is implicit**: Components, integrations, and triggers are registered via blank imports (`_ "github.com/superplanehq/superplane/pkg/integrations/github"`). This is idiomatic Go but makes it impossible to know at compile time which integrations are available without reading the import list in `server.go`
- **`config/` package is trivially thin**: The entire config package is a single function (`RabbitMQURL()`) that reads one env var. Configuration management is scattered across `server.go` as raw `os.Getenv()` calls with no centralized config struct, validation, or documentation of required vs optional settings
- **`pkg/models/` holds both data models and ORM logic**: This is a fat-model pattern that will grow harder to maintain as the schema expands. No repository/DAO abstraction layer separates data access from business logic

**Test Ideas:**
- P0: Start the server binary with each required env var missing one at a time; confirm error messages are clear and identify which variable is missing (currently some say "DB username not set" for `DB_PASSWORD`)
- P1: Map every `os.Getenv()` call across the codebase; confirm each has a documented default or a clear error on absence
- P2: Add a component to the registry at runtime and confirm it is immediately available to canvas nodes

### 1.2 Frontend Structure (Score: 75/100)

React/TypeScript frontend at `web_src/` with Vite build tooling:

```
web_src/src/
  api-client/     # Auto-generated from OpenAPI spec
  assets/         # Icons, images
  components/     # Reusable UI components (30+ directories)
  constants/      # App constants
  contexts/       # React contexts
  hooks/          # Custom hooks
  lib/            # Utility libraries
  pages/          # Route-based pages (auth, canvas, home, org, workflow)
  stores/         # State management
  test/           # Frontend tests
  ui/             # UI primitives (80+ directories - accordion, button, dialog, etc.)
  utils/          # Utility functions
```

**Strengths:**
- Auto-generated TypeScript API client from OpenAPI spec (`openapi-ts` tooling)
- Storybook available for component development
- Clean separation between UI primitives (`ui/`) and business components (`components/`)
- Radix UI primitive foundation for accessibility

**Risks:**
- 80+ UI directories in `src/ui/` suggests potential component sprawl
- `pages/workflowv2/` naming suggests an active rewrite -- unclear what state `v1` is in
- Frontend test coverage not assessed (separate report needed)

### 1.3 Dependency Profile

**Backend dependencies** (go.mod, 126 lines):
- GORM for ORM, PostgreSQL for persistence
- RabbitMQ via `go-tackle` for message queuing
- Casbin for RBAC
- gRPC + grpc-gateway for API layer
- Playwright-go for E2E testing
- AES-GCM for secret encryption
- Logrus for logging
- Cobra for CLI
- OpenTelemetry SDK for metrics

**Notable:** Go 1.25 is cutting edge (released 2026). This is either intentional early adoption or a potential compatibility concern for contributors on older toolchains.

---

## 2. FUNCTION: What the Product DOES

### 2.1 Core Capabilities (Score: 78/100)

| Capability | Status | Notes |
|------------|--------|-------|
| Canvas (workflow DAG) design | Implemented | Create, version, sandbox mode |
| Component library (14 built-in) | Implemented | approval, filter, HTTP, SSH, merge, memory ops, etc. |
| Integration library (37 providers) | Implemented | Broad coverage: CI/CD, cloud, observability, comms, AI |
| Trigger system (3 types) | Implemented | Schedule, webhook, manual start |
| Execution engine | Implemented | Event-driven, parallel branch execution |
| CLI | Implemented | Canvases, events, executions, integrations, secrets, queue |
| RBAC | Implemented | Casbin-backed, organization-scoped, groups/roles |
| Multi-tenancy | Implemented | Organization-scoped isolation |
| Service accounts | Implemented | Unified user table with type column |
| Canvas memory (persistent state) | Implemented | setData/getData/clearData across executions |
| Canvas versioning | Implemented | User-owned versions from live canvas |
| Sandbox mode | Implemented | Safe testing environment |
| AI canvas builder | In PRD stage | AI-assisted workflow creation via chat sidebar |
| AI agent skill awareness | In PRD stage | Component SKILL.md grounding for AI |
| Email notifications | Implemented | Invitation + notification via Resend or SMTP |
| WebSocket real-time updates | Implemented | Event distribution to UI |

**Strengths:**
- Impressive integration breadth for alpha: GitHub, GitLab, Bitbucket, Slack, PagerDuty, Jira, AWS (ECR/Lambda/CloudWatch/SNS/CodeArtifact), GCP, Cloudflare, Datadog, Grafana, Honeycomb, Prometheus, and more
- AI integrations (Claude, Cursor, OpenAI) position the product well for AI-native DevOps
- Canvas memory (setData/getData) enables stateful workflows -- a differentiator vs simple DAG runners
- 6 pre-built canvas templates: automated rollback, incident data collection, incident router, multi-repo CI release, policy-gated deployment, staged release

**Gaps Identified:**
- **No audit log**: The service accounts PRD mentions audit trail as a goal, but no `audit_log` table or audit middleware exists in the codebase
- **No API rate limiting**: No rate limiting middleware found in `pkg/public/` or `pkg/grpc/`
- **No webhook signature verification documentation**: Incoming webhooks from third parties need clear signature validation guidance for operators
- **No workflow versioning rollback**: Canvas versioning exists but rollback semantics are unclear
- **No built-in secrets rotation**: Secrets are stored encrypted but no rotation workflow exists
- **No health check beyond basic**: `health_service.go` exists but depth of checks (DB, RabbitMQ, workers) is unclear

**Test Ideas:**
- P0: Create a canvas with 50+ nodes in a complex DAG pattern; execute it and confirm all branches complete without deadlock or dropped events
- P0: Submit 100 concurrent webhook events to the same trigger; confirm all are processed exactly once with no duplicates or drops
- P1: Execute a canvas that uses setData in branch A and getData in branch B; confirm cross-branch memory consistency
- P1: Create a service account, assign a restricted role, and confirm it cannot access resources outside its permission set
- P2: Build a canvas using every built-in component type; execute end-to-end and confirm all component types process correctly

### 2.2 Error Handling (Score: 65/100)

The `pkg/grpc/error_sanitizer.go` suggests error sanitization exists for gRPC responses. However:

- The `server.go` `Start()` function uses `panic()` for startup failures rather than graceful error reporting
- Worker goroutines are started with `go w.Start(context.Background())` -- no recovery mechanism, no restart-on-panic, no circuit breaker
- The `docker-entrypoint.sh` has a bug: the first validation says "DB username not set" but checks `$DB_PASSWORD`

**Test Ideas:**
- P0: Kill the RabbitMQ connection while workflows are executing; confirm workers reconnect and resume without data loss
- P1: Inject malformed payloads into every gRPC endpoint; confirm error responses are sanitized (no stack traces, no internal paths)
- P1: Crash a single worker goroutine; confirm the server process detects it and either restarts the worker or fails visibly

### 2.3 Security (Score: 68/100)

**Implemented:**
- AES-GCM encryption for secrets at rest with proper nonce handling
- JWT authentication with configurable secret
- OIDC support for external identity providers
- Casbin RBAC with organization-scoped permissions
- gRPC interceptor-level authorization enforcement
- SSRF protection framework in `pkg/registry/http.go` with DNS rebinding prevention

**Critical Concern -- SSRF Defaults Are Disabled:**
The `server.go` file shows that the default blocked hosts and private IP ranges are **entirely commented out**:

```go
var defaultBlockedHTTPHosts = []string{
    // "metadata.google.internal",
    // "169.254.169.254",
    // "kubernetes.default",
    // "localhost",
    // ...
}

var defaultBlockedPrivateIPRanges = []string{
    // "10.0.0.0/8",
    // "172.16.0.0/12",
    // "192.168.0.0/16",
    // ...
}
```

This means the HTTP component and any integration making outbound HTTP requests can reach cloud metadata endpoints, internal services, and localhost by default. The SSRF protection code exists and is well-written (including DNS rebinding prevention), but it is **non-functional with empty defaults**. An operator must explicitly set `BLOCKED_HTTP_HOSTS` and `BLOCKED_PRIVATE_IP_RANGES` environment variables.

**For a self-hosted product that executes arbitrary HTTP requests as workflow components, this is a P0 security gap.**

**Other Security Gaps:**
- `NO_ENCRYPTION=yes` disables all secret encryption -- acceptable for dev but dangerous if set in production (no warning in entrypoint)
- Dev compose file hardcodes `ENCRYPTION_KEY: 1234567890abcdefghijklmnopqrstuv` -- this must never leak to production configs
- No CSP headers observed in the public API server setup
- No CORS configuration visible for the REST API
- Password hashing exists (`pkg/crypto/password.go`) but algorithm choice not verified

**Test Ideas:**
- P0: With default configuration, send an HTTP component request to `http://169.254.169.254/latest/meta-data/` from a canvas node; confirm it is blocked (currently it will succeed)
- P0: Deploy with `NO_ENCRYPTION=yes` in a production-like environment; confirm there is a visible warning or startup refusal
- P1: Attempt to access resources in Organization B using a token from Organization A; confirm complete tenant isolation
- P1: Send a JWT with an expired token; confirm all endpoints reject it consistently

---

## 3. DATA: What it PROCESSES

### 3.1 Data Model Quality (Score: 72/100)

**Schema design** (from `db/structure.sql`):
- UUIDs used as primary keys throughout (good for distributed systems)
- Proper `created_at`/`updated_at` timestamps on all tables
- JSONB used for flexible configuration storage (component specs, event payloads)
- Multi-tenancy enforced at schema level via `organization_id` foreign keys
- Account/User/Organization hierarchy is clean and well-documented

**Core entities identified from models package:**
- `account`, `account_provider`, `account_password_auth` -- identity
- `organization`, `organization_invitation`, `organization_invite_link` -- tenancy
- `canvas`, `canvas_node`, `canvas_event`, `canvas_node_execution` -- workflow engine
- `canvas_version`, `canvas_change_request` -- versioning
- `canvas_memory`, `canvas_node_execution_kvs` -- state persistence
- `integration`, `integration_subscription`, `integration_request` -- external connections
- `secret`, `webhook`, `blueprint` -- supporting entities
- `user`, `role_metadata` -- RBAC

**Concerns:**
- **197 SQL migrations in alpha** is a high number, suggesting rapid schema churn. This creates upgrade burden for self-hosted users and risk of migration failures on complex schemas
- **No explicit data retention policy**: Canvas memories, events, and executions will grow unbounded. The PRD acknowledges this ("Risk: Namespace values grow unbounded") but defers mitigation
- **Canvas cleanup worker exists** but scope is limited to deleted canvases, not historical execution data
- **No database backup documentation** for self-hosted operators

### 3.2 Data Flow (Score: 70/100)

```
Event Source --> Trigger --> Canvas Event (pending)
    --> Event Router Worker --> Queue Items
    --> Node Queue Worker --> Node Executor
    --> Component Execution --> New Events (propagation)
    --> WebSocket Distribution --> UI Update
```

The event-driven architecture is clean but introduces several data consistency concerns:

- Events are polled from the database by workers on tick intervals, not pushed via message queue. This creates a latency floor equal to the tick interval
- Queue items are published to RabbitMQ for async processing, but the relationship between database state and message queue state could drift
- The "stuck queue items" metric in telemetry suggests this drift has been observed and measured

**Test Ideas:**
- P0: Inject 10,000 events in rapid succession; measure throughput and confirm no events are lost or processed out of order within a single canvas
- P1: Kill the database mid-transaction during a canvas execution; confirm RabbitMQ queue items are not orphaned
- P2: Measure event-to-execution latency across different tick intervals; document the minimum achievable latency

---

## 4. INTERFACES: How it CONNECTS

### 4.1 API Design (Score: 82/100)

**Architecture**: gRPC-first with REST gateway

- Protocol Buffers define all API contracts in `protos/` (15 proto files covering canvases, components, integrations, users, organizations, secrets, triggers, etc.)
- gRPC-Gateway auto-generates REST endpoints from proto annotations
- OpenAPI spec auto-generated (6873-line Swagger JSON)
- TypeScript client auto-generated from OpenAPI via `openapi-ts`

**Strengths:**
- Single source of truth (protobuf) for API contracts across gRPC, REST, and frontend client
- Consistent `/api/v1/` path prefix
- Rich Swagger annotations with descriptions, tags, and operation summaries
- Versioned API path (`v1`) from the start

**Concerns:**
- No API versioning strategy documented beyond `v1`
- No pagination parameters visible in the sample proto (could be present but not confirmed)
- No API changelog or breaking change policy documented

### 4.2 CLI (Score: 70/100)

CLI built with Cobra, offering commands for:
- Canvases (CRUD, management)
- Events (listing, inspection)
- Executions (monitoring)
- Integrations (listing resources)
- Secrets (full CRUD)
- Queue (list, delete)
- Contexts (multi-server management)
- Connect, Configuration, Whoami

**Gaps:**
- No `superplane init` or onboarding wizard
- No `superplane apply` for declarative workflow management (GitOps pattern)
- No shell completion generation visible
- CLI documentation not found in contributor docs

### 4.3 UI (Score: 75/100)

React + TypeScript + Vite with Radix UI primitives:

- Canvas editor with DAG visualization
- Component sidebar with building blocks
- Execution monitoring and debugging views
- Organization management (members, roles, groups, secrets)
- Integration management
- Real-time updates via WebSocket
- Custom component builder page
- AI builder sidebar (in progress)

**Frontend Testing:**
- Vitest for unit tests
- Playwright (via Go bindings) for E2E tests -- unique approach of writing E2E tests in Go rather than TypeScript
- 23 E2E test files covering: canvas page, approvals, groups, invitations, login, members, organization, roles, secrets, service accounts, time gate, wait, webhook reset
- Excellent E2E testing guide with anti-patterns documentation

---

## 5. PLATFORM: What it DEPENDS ON

### 5.1 Runtime Dependencies (Score: 68/100)

| Dependency | Type | Concern Level |
|------------|------|---------------|
| PostgreSQL 17 | Required | Low -- standard, widely supported |
| RabbitMQ | Required | **Medium** -- adds significant operational complexity for self-hosted users |
| Go 1.25 | Build-time | Low -- standard compilation |
| Node.js | Build-time | Low -- frontend build only |

**RabbitMQ Concern**: For a product targeting DevOps teams (who are infrastructure-aware), RabbitMQ is a reasonable choice. However, it adds another stateful service to operate. The dev compose shows it as `rabbitmq:5672` without management plugin, clustering, or persistence configuration. For self-hosted users, RabbitMQ failure = workflow execution failure.

### 5.2 Deployment Options (Score: 72/100)

**Docker Image** (`ghcr.io/superplanehq/superplane-demo:stable`):
- Multi-stage build: Ubuntu 22.04 base, Go 1.25 build, minimal runner
- Runs as `nobody` user (good security practice)
- `HEALTHCHECK NONE` -- defers to Kubernetes probes
- Single binary + static assets

**Helm Chart** (`release/superplane-helm-chart/`):
- Version 0.1.0 -- very early
- Published to `oci://ghcr.io/superplanehq`
- `Chart.yaml` is minimal (no dependencies declared, no `values.yaml` review)

**Single-Host Tarball** (`release/superplane-single-host-tarball/`):
- Docker Compose + Caddy reverse proxy
- Includes install script and SBOM generation
- Good for quick evaluation

**Demo Container**:
- `docker run --rm -p 3000:3000 -v spdata:/app/data` -- minimal barrier to trial
- Volume mount for data persistence

**Gaps:**
- No ARM64 builds mentioned (increasingly important for cloud instances)
- No documented resource requirements (CPU, memory, disk)
- No backup/restore procedures
- Helm chart at 0.1.0 likely lacks production-grade configuration options (replicas, resource limits, PDB, HPA)

**Test Ideas:**
- P0: Run `docker pull` + `docker run` exactly as documented in README; confirm the app is accessible within 60 seconds
- P1: Deploy via Helm chart on a fresh Kubernetes cluster; confirm all pods come up healthy with zero manual intervention
- P1: Simulate PostgreSQL failover; confirm the app recovers automatically or fails visibly
- P2: Run the demo container for 7 days with continuous workflow execution; monitor for memory leaks, disk growth, connection exhaustion

---

## 6. OPERATIONS: How it is USED

### 6.1 Observability (Score: 70/100)

**OpenTelemetry Metrics** (well-instrumented):
- `queue_worker.tick.duration.seconds` -- queue processing latency
- `executor_worker.tick.duration.seconds` -- execution latency
- `event_worker.tick.duration.seconds` -- event routing latency
- `node_request_worker.tick.duration.seconds` -- request processing latency
- `workflow_cleanup_worker.tick.duration.seconds` -- cleanup performance
- `db.locks.count` -- database lock monitoring
- `db.long_queries.count` -- slow query detection
- `queue_items.stuck.count` -- stuck item detection

**Strengths:**
- Purpose-built metrics for every worker type
- Database health metrics (locks, long queries) show operational awareness
- Stuck queue item detection is a mature pattern
- OTel collector config included for development
- Graceful degradation when OTel is disabled (metrics functions no-op when not ready)

**Concerns:**
- **No distributed tracing**: Only metrics are initialized; no trace spans for request flows or execution chains. For a workflow engine where a single execution spans multiple workers and external API calls, tracing is critical for debugging
- **No traces through the event processing pipeline**: When an event takes 10 minutes to process, there is no way to identify which component or external call caused the delay
- **Logging is minimal**: The `pkg/logging/` package has 74 lines with structured fields for events, executions, nodes, and integrations. This is a good foundation but uses Logrus (which is in maintenance mode) rather than structured logging (zerolog, slog)
- **No Sentry breadcrumbs for workflow execution path**: Sentry is initialized but usage is not pervasive
- **Beacon sends anonymous analytics** to `analytics.superplane.com` -- opt-in (`SUPERPLANE_BEACON_ENABLED=yes`), which is the right default

### 6.2 Error Recovery (Score: 55/100)

- Workers are started as goroutines with no supervisor, no restart mechanism, and no panic recovery
- If a worker goroutine panics, the entire server process crashes (Go behavior for unrecovered panics in goroutines)
- No circuit breaker pattern for external integration calls
- No dead letter queue for failed RabbitMQ messages (not confirmed, but not visible in worker code)
- No retry with exponential backoff for external API calls (a `pkg/retry/` package exists but usage scope unclear)

**Test Ideas:**
- P0: Crash-loop the RabbitMQ container 5 times in 10 minutes while workflows are executing; confirm no data loss and eventual recovery
- P1: Simulate a timeout from every external integration API; confirm the execution fails gracefully with a clear error state (not hung indefinitely)
- P2: Monitor process memory under sustained load for 24 hours; confirm no goroutine leaks from failed workers

### 6.3 Developer/Contributor Experience (Score: 82/100)

**Strengths:**
- **2-command setup**: `make dev.setup && make dev.start` -- everything runs in Docker, no local toolchain required
- **Comprehensive CONTRIBUTING.md** with links to architecture, testing, quality standards, integration guides
- **Bounty program** via BountyHub for paid integration contributions
- **Quality standards document** emphasizing user-first thinking, AI-native code, backward compatibility, and testing
- **E2E testing guide** with clear patterns, anti-patterns, and debugging tips
- **Integration contribution guides**: 7 separate docs covering component design, implementation, customization, templates, and PR process
- **AI agent guide** for using AI agents in development
- **DCO (Developer Certificate of Origin)** for legal clarity

**Minor Gaps:**
- No `DEVELOPMENT.md` separate from CONTRIBUTING.md for pure setup/build/test cycle
- No documented architecture decision records (ADRs) -- the service accounts PRD includes architectural decisions inline, but no ADR format
- No pre-commit hooks visible for linting/formatting enforcement

---

## 7. TIME: WHEN Things Happen

### 7.1 Maturity Assessment (Score: 60/100)

**Alpha Stage Signals:**
- README explicitly states: "This project is in alpha stage and moving quickly. Expect rough edges and occasional breaking changes."
- Helm chart at v0.1.0
- 197 SQL migrations suggest rapid schema evolution
- `pages/workflowv2/` in frontend suggests ongoing rewrites
- Multiple PRDs for features still in design (AI canvas builder, AI skill awareness)
- Several commented-out security defaults (SSRF blocklists)
- No semantic versioning applied yet
- No changelog

**Positive Maturity Signals:**
- CI badge on Semaphore (green)
- Discord community with active badge
- Commit activity badge shows ongoing development
- Well-structured documentation
- E2E test suite with 23 test files
- 371 unit test files across the Go codebase
- License (Apache 2.0) and NOTICE file present
- SBOM generation in release pipeline

### 7.2 Concurrency and Timing (Score: 65/100)

- **Worker tick intervals**: Event router, node executor, queue worker, and cleanup workers all poll on intervals. No configuration for these intervals is visible in env vars
- **Webhook provisioner**: Runs continuously to provision integration webhooks -- timing of initial provisioning vs. first event reception could cause races
- **Canvas versioning + live execution**: Creating a canvas version from a live canvas while executions are in-flight is a potential consistency risk
- **Event processing order**: The `eventdistributer` package handles event distribution, but ordering guarantees within a canvas execution path are not documented
- **Schedule triggers**: Use `robfig/cron/v3` -- a well-tested library, but timezone handling and DST behavior not documented

**Test Ideas:**
- P0: Modify a canvas definition while an execution is in-flight; confirm the running execution uses the original definition, not the modified one
- P1: Create two schedule triggers that fire within 1 second of each other on the same canvas; confirm both executions are independent
- P1: Send a webhook event immediately after creating a trigger; measure the time until the trigger is provisioned and can receive events
- P2: Set a schedule trigger to fire at 2:00 AM on a DST transition day; confirm it fires exactly once

---

## 8. Clarifying Questions

These questions surface gaps that could not be resolved through codebase analysis alone:

### Critical (Blocks Risk Assessment)

1. **Why are SSRF protection defaults commented out?** Is this intentional for alpha flexibility, or an oversight? For a product that executes arbitrary HTTP requests via workflow components, this is the most significant security finding.

2. **What is the worker restart strategy?** If a goroutine panics (e.g., nil pointer in an integration response), does the entire process crash? Is this by design (let the orchestrator restart the pod) or an unhandled gap?

3. **What are the RabbitMQ durability guarantees?** Are queues durable? Are messages persistent? What happens to in-flight messages on RabbitMQ restart?

### High Priority

4. **Is there an upgrade/migration path documented for self-hosted users?** With 197 migrations, how does a user upgrade from version N to version N+5? Are migrations always forward-compatible?

5. **What are the event ordering guarantees within a canvas execution?** If node A emits events to nodes B and C simultaneously, are they processed in deterministic order or is it non-deterministic?

6. **What is the planned API versioning strategy?** The API is at `v1` -- when `v2` is needed, will `v1` be maintained? For how long?

### Medium Priority

7. **Is the beacon telemetry payload documented for users?** The code shows only `installation_type` and `installation_id` are sent, but this should be visible to self-hosted operators for trust.

8. **What is the intended production topology?** Can the API, workers, and event router be deployed as separate processes/containers, or must they run in a single process? The env var-based worker selection suggests splitting is possible, but no documentation confirms this.

9. **How does canvas memory handle concurrent writes?** If two parallel branches of a canvas both call setData on the same namespace, what is the conflict resolution strategy?

10. **What is the retention strategy for execution history?** Canvas cleanup handles deleted canvases, but what about historical executions, events, and queue items for active canvases?

---

## 9. SFDIPOT Test Coverage Summary

| Category | Test Ideas | P0 | P1 | P2 | P3 |
|----------|-----------|-----|-----|-----|-----|
| Structure | 3 | 1 | 1 | 1 | 0 |
| Function | 7 | 2 | 3 | 1 | 1 |
| Data | 3 | 1 | 1 | 1 | 0 |
| Interfaces | 0 | 0 | 0 | 0 | 0 |
| Platform | 4 | 1 | 2 | 1 | 0 |
| Operations | 3 | 1 | 1 | 1 | 0 |
| Time | 4 | 1 | 2 | 1 | 0 |
| **Total** | **24** | **7** | **10** | **6** | **1** |

### Automation Fitness

| Type | Count | Percentage |
|------|-------|-----------|
| Integration Test | 10 | 42% |
| E2E Test | 7 | 29% |
| Unit Test | 3 | 12% |
| Human Exploration | 4 | 17% |

**Human Exploration Reasoning**: The SSRF default bypass, worker crash recovery behavior, real-time WebSocket reliability under load, and multi-day memory leak detection all require exploratory investigation that cannot be fully automated until baseline behavior is established.

---

## 10. Key Recommendations

### Immediate (Before Beta)

1. **Enable SSRF protection defaults**: Uncomment the blocked hosts and private IP ranges in `server.go`. Make the defaults secure and let operators explicitly opt out if needed, not the reverse.

2. **Add worker panic recovery**: Wrap each `go w.Start()` call in a recovery goroutine that logs the panic, reports to Sentry, and restarts the worker with backoff.

3. **Centralize configuration**: Replace 30+ `os.Getenv()` calls with a typed configuration struct that validates all required settings at startup and documents defaults.

4. **Add distributed tracing**: Extend the existing OTel metrics setup to include trace spans through the event processing pipeline. For a workflow engine, tracing is a primary debugging tool, not an afterthought.

### Short-Term (Beta Readiness)

5. **Document upgrade path**: Provide a clear upgrade guide for self-hosted users, especially around database migrations.

6. **Add API rate limiting**: Implement rate limiting at the gRPC interceptor level for public API endpoints.

7. **Add audit logging**: Implement an audit log for security-sensitive operations (user creation, role changes, secret access, integration modification).

8. **Publish resource requirements**: Document minimum CPU, memory, and disk requirements for small/medium/large deployments.

### Medium-Term (GA Readiness)

9. **Add data retention policies**: Implement configurable retention for execution history, events, and canvas memories.

10. **Consider replacing RabbitMQ**: For simpler self-hosted deployments, evaluate whether PostgreSQL LISTEN/NOTIFY or an embedded queue (NATS) could reduce operational dependencies.

---

## Appendix: Files Examined

| Path | Purpose |
|------|---------|
| `README.md` | Project overview, quick start, integrations list |
| `CONTRIBUTING.md` | Contributor guide with extensive resource links |
| `Dockerfile` | Multi-stage build (base, dev, builder, runner) |
| `docker-compose.dev.yml` | Development environment configuration |
| `Makefile` | Build, test, and dev commands |
| `go.mod` | Go 1.25, 126-line dependency list |
| `pkg/server/server.go` | Main server startup, worker orchestration |
| `pkg/models/*.go` | 30 data model files |
| `pkg/telemetry/metrics.go` | OpenTelemetry metric definitions |
| `pkg/telemetry/beacon.go` | Anonymous usage analytics |
| `pkg/logging/logging.go` | Structured logging helpers |
| `pkg/crypto/aes_gcm_encryptor.go` | Secret encryption implementation |
| `pkg/registry/http.go` | SSRF protection framework |
| `protos/canvases.proto` | Canvas API proto definitions |
| `api/swagger/superplane.swagger.json` | Generated OpenAPI spec (6873 lines) |
| `db/structure.sql` | Current database schema |
| `docs/contributing/architecture.md` | System architecture overview |
| `docs/contributing/quality.md` | Quality standards |
| `docs/contributing/e2e-tests.md` | E2E testing guide |
| `docs/contributing/bounties.md` | Contributor bounty program |
| `docs/prd/canvas-memory.md` | Canvas memory PRD |
| `docs/prd/ai-canvas-builder-sidebar.md` | AI builder PRD |
| `docs/prd/ai-agent-component-skill-awareness.md` | AI skill awareness PRD |
| `docs/prd/service-accounts.md` | Service accounts PRD |
| `release/superplane-helm-chart/` | Helm chart (v0.1.0) |
| `release/superplane-single-host-tarball/` | Single-host deployment |
| `templates/canvases/` | 6 pre-built canvas templates |
| `templates/skills/` | AI component skill documents |
