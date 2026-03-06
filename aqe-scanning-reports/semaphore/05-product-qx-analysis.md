# Semaphore CI/CD -- Product Quality & User Experience (QX) Analysis

**Analysis Framework:** SFDIPOT (James Bach's Heuristic Test Strategy Model)
**Date:** 2026-03-06
**Scope:** Semaphore open-source monorepo (Community Edition + Enterprise Edition)
**Commit Base:** main branch, v1.0.0 stable release

---

## Executive Summary

Semaphore is a mature, polyglot CI/CD platform comprising **30+ microservices** built primarily in Elixir and Go, with Ruby (github_hooks) and TypeScript/React (front). The architecture is Kubernetes-native, using gRPC for all internal service communication and RabbitMQ for async messaging. The project demonstrates strong engineering fundamentals -- security scanning, Helm-based deployment, image signing -- but exhibits architectural accretion typical of a SaaS product transitioning to open-source self-hosted delivery. Key quality risks center on service boundary duplication (repohub vs. repository_hub), API versioning fragmentation (v1alpha, v1beta, v1, v2), and operational observability gaps for self-hosted operators.

**Overall Product Maturity Score: 72/100**

| Factor | Score | Risk Level |
|--------|-------|------------|
| Structure | 68/100 | Medium-High |
| Function | 78/100 | Medium |
| Data | 65/100 | High |
| Interfaces | 62/100 | High |
| Platform | 75/100 | Medium |
| Operations | 58/100 | High |
| Time | 70/100 | Medium |

---

## 1. STRUCTURE -- What the Product IS

### 1.1 Service Inventory

The monorepo contains **33 deployable services** (28 CE + 5 EE), identified from the Helm chart dependencies and skaffold.yaml:

| Service | Language | Role | Boundary Clarity |
|---------|----------|------|-----------------|
| auth | Elixir | Authentication proxy | Clear |
| guard | Elixir | Authorization, org mgmt, user mgmt, instance config | **Overloaded** |
| front | Elixir/Phoenix | Web UI | Clear |
| plumber/ppl | Elixir | Pipeline execution engine | Clear |
| projecthub | Elixir | Project data (gRPC) | Partially duplicated |
| projecthub-rest-api | Elixir | Project data (REST) | Why separate from projecthub? |
| secrethub | Elixir | Secrets management | Clear |
| zebra | Elixir | Job scheduling & execution | Clear |
| branch_hub | Elixir | Branch tracking | Clear |
| dashboardhub | Elixir | Dashboard management | Clear |
| notifications | Elixir | Notification delivery | Clear |
| scouter | Elixir | Usage/analytics tracking | Clear |
| hooks_processor | Elixir | Webhook processing | Clear |
| hooks_receiver | Elixir | Webhook ingestion | Clear, good separation from processor |
| github_hooks | Ruby/Rails | GitHub/Bitbucket webhook handling | Legacy concern |
| github_notifier | Elixir | GitHub status notifications | Clear |
| repository_hub | Elixir | Repository metadata | **Duplicated with repohub** |
| repohub | Go | Repository operations (git) | **Duplicated with repository_hub** |
| artifacthub | Go | Artifact storage | Clear |
| loghub2 | Go | Log storage & retrieval | Clear |
| encryptor | Go | Encryption service | Clear |
| bootstrapper | Go | Initial setup & config | Clear |
| self_hosted_hub | Go | Self-hosted agent management | Clear |
| public-api-gateway | Go | API gateway (REST/gRPC bridge) | Clear |
| public-api/v1alpha | Elixir | Public API v1 (legacy) | **Migration concern** |
| public-api/v2 | Elixir | Public API v2 (current) | Clear |
| rbac/ce | Elixir | Role-based access control (CE) | Clear |
| periodic_scheduler | Elixir | Cron-like pipeline scheduling | Clear |
| badge | Elixir | Build status badges | Clear |
| feature_provider | Elixir | Feature flag management | Clear |
| mcp_server | Go | MCP (AI assistant) integration | Forward-looking |
| keycloak | Java (external) | Identity provider | External dependency |
| statsd | Node.js | Metrics relay | Minimal |

### 1.2 Architectural Quality Assessment

**Strengths:**
- Consistent use of gRPC for inter-service communication (50+ internal API endpoints visible in the configmap)
- Clean separation between webhook ingestion (hooks_receiver) and processing (hooks_processor)
- Umbrella-app pattern in plumber with well-defined sub-packages (block, looper, definition_validator, job_matrix, spec)
- Each service has its own Dockerfile, Makefile, Helm chart, and docker-compose.yml -- full autonomy
- Feature flag system (feature_provider) enables safe rollouts

**Concerns:**

**[S-RISK-01] Guard Service is a God Object (CRITICAL)**
Guard handles authentication API, organization API, user API, instance config, OIDC/Keycloak integration, and front-end session management. The configmap reveals 6 separate gRPC endpoints exposed by guard alone:
- `guard-authentication-api:50051`
- `guard-organization-api:50051`
- `guard-user-api:50051`
- `guard-instance-config:50051`
- `guard:50051`
- `guard-service-account-api:50051`
- `guard-okta-internal-api:50051`

This violates the single responsibility principle. A failure in the organization service takes down authentication. The service has 3 separate Ecto repos (Repo, FrontRepo, InstanceConfigRepo), confirming data boundary leakage.

**[S-RISK-02] Repository Service Duplication (HIGH)**
Two services manage repository concerns:
- `repository_hub` (Elixir) -- repository metadata
- `repohub` (Go) -- repository git operations

Both have their own databases, migrations, and Helm charts. The naming inconsistency (`repository_hub` vs `repohub`) and language split suggest either an incomplete migration or an accidental boundary split. This creates confusion about which service owns repository-related decisions.

**[S-RISK-03] Polyglot Complexity Overhead (MEDIUM)**
Four languages in production:
- **Elixir** (18 services): Core domain logic, Phoenix web
- **Go** (8 services): Infrastructure, gRPC gateway, performance-critical paths
- **Ruby** (1 service): github_hooks -- a Rails app
- **Node.js** (1 service): statsd relay

The Ruby service (github_hooks) is the only Rails service, requiring separate dependency management, security scanning, and operational expertise. It handles a critical path (webhook processing from GitHub/Bitbucket) but cannot share libraries with the rest of the fleet. The `protobuffer/generated` directory in github_hooks suggests proto generation is handled separately from Elixir services.

**[S-RISK-04] Inconsistent Naming Conventions (LOW-MEDIUM)**
Service naming is inconsistent across the monorepo:
- Underscore: `branch_hub`, `self_hosted_hub`, `repository_hub`, `hooks_processor`
- Hyphen: `public-api-gateway`, `projecthub-rest-api`, `helm-chart`
- Concatenated: `secrethub`, `projecthub`, `dashboardhub`, `loghub2`, `repohub`

This creates cognitive load and increases the probability of misconfiguration in Helm values, environment variables, and CI scripts.

### 1.3 Dependency Architecture

**Shared Infrastructure:**
- PostgreSQL 14 (single instance, shared across all services)
- RabbitMQ 3.13 (async messaging)
- Redis 7.2 (caching)
- MinIO (3 instances: artifacts, cache, logs)
- Keycloak (identity/OIDC)
- Emissary Ingress (API gateway routing)

**Internal Shared Libraries:**
- `feature_provider` -- compiled as a dependency, not deployed separately
- `plumber/looper` -- reusable periodic worker macro library
- `plumber/definition_validator` -- YAML schema validation
- `internal_api` proto definitions -- copied into each service's `lib/internal_api/` directory

**[S-RISK-05] Proto Definition Distribution (HIGH)**
Generated protobuf files (`.pb.ex`, `.pb.go`) are checked into each service individually under `lib/internal_api/`. There is a `pb.clone` Makefile target that pulls from a private `renderedtext/internal_api` repository. This means:
1. Proto definitions can drift between services
2. No single source of truth for API contracts within the monorepo
3. Updating an API requires regenerating protos in every consuming service
4. The reference repo is external (`renderedtext/internal_api`), creating a hidden dependency

---

## 2. FUNCTION -- What the Product DOES

### 2.1 Core CI/CD Capabilities

| Capability | Service(s) | Maturity | Notes |
|-----------|------------|----------|-------|
| Pipeline Configuration | plumber/definition_validator, plumber/spec | High | YAML-based, schema-validated |
| Pipeline Execution | plumber/ppl, plumber/block, zebra | High | State machine-driven, OTP supervision |
| Job Scheduling | zebra | High | gRPC API, in-flight counters |
| Periodic Pipelines | periodic_scheduler | Medium | Cron-like scheduling |
| GitHub Integration | github_hooks, github_notifier, bootstrapper | High | App installation, webhooks, status updates |
| Bitbucket Integration | github_hooks (shared), bootstrapper | Medium | Shares codebase with GitHub -- naming misleading |
| GitLab Integration | bootstrapper | Low | Config support only, limited feature parity |
| Secrets Management | secrethub, encryptor | High | Dedicated encryption service, per-project secrets |
| Artifact Storage | artifacthub | Medium | MinIO-backed, JWT-authenticated |
| Log Storage | loghub2 | Medium | MinIO-backed, AMQP-based ingestion |
| Dashboards | dashboardhub | Medium | Public API available |
| Notifications | notifications | Medium | Webhook-based notification rules |
| Build Badges | badge | High | SVG badge generation |
| RBAC | rbac/ce, ee/rbac | Medium | CE has simplified model, EE has full RBAC |
| Self-Hosted Agents | self_hosted_hub | Medium | Agent type management, quotas |
| MCP/AI Integration | mcp_server | Early | MCP protocol for AI assistants |

### 2.2 Functional Gaps and Concerns

**[F-RISK-01] Misleading Service Names (HIGH)**
`github_hooks` handles both GitHub AND Bitbucket webhooks (evidenced by `fixtures/bitbucket_payloads` directory). The service name actively misleads operators and developers about its scope. This affects incident response: an operator debugging Bitbucket webhook failures would not intuitively look at the `github_hooks` service.

**[F-RISK-02] CD (Continuous Deployment) Not Yet Implemented (MEDIUM)**
Per the ROADMAP.md, "CD project kick-off is underway" (Q1 2025) and is described as a priority for Cloud and Enterprise editions. For a CI/CD platform, the absence of first-class deployment capabilities is a significant competitive gap. The `ee/gofer` service appears to be an early deployment target management system.

**[F-RISK-03] Missing GitLab Feature Parity (MEDIUM)**
The bootstrapper has `pkg/gitlab/` for initial setup, but there is no equivalent of `github_hooks` for GitLab webhook processing. GitLab users would have a degraded experience compared to GitHub users, with no webhook-driven pipeline triggering.

**[F-RISK-04] Audit Trail Limited to Enterprise (MEDIUM)**
The `ee/audit` service provides audit logging, but it exists only in the enterprise edition. The public-api-gateway has audit middleware (`audit_middleware.go`), but CE deployments lack the backend to store audit events. For organizations with compliance requirements, this is a gap that could block adoption.

**[F-RISK-05] Pre-flight Checks are Enterprise-Only (LOW)**
`ee/pre_flight_checks` provides pipeline pre-validation. CE users must rely on pipeline failures to discover configuration issues, while EE users get early feedback. This creates a meaningfully different quality of experience between editions.

### 2.3 Feature Architecture Quality

**Pipeline Engine (Plumber) -- Well Architected:**
The plumber service demonstrates excellent domain modeling:
- `definition_validator` -- validates YAML against schemas before execution
- `block` -- manages individual pipeline blocks with independent lifecycle
- `looper` -- reusable periodic worker macro (DRY infrastructure)
- `job_matrix` -- handles matrix expansion for parallel jobs
- `spec` -- schema definitions for pipeline YAML
- State machine pattern (`Ppl.Sup.STM`) for pipeline lifecycle

This is one of the best-designed subsystems in the codebase.

**Security Model -- Layered but Complex:**
- Keycloak handles OIDC/identity
- Guard handles authorization decisions
- RBAC service provides role-based policies
- Encryptor service handles all encryption operations
- Secrets are stored encrypted, decrypted only by encryptor service sidecar

The layering is sound, but the number of moving parts (5 services for auth/authz) increases the attack surface and operational complexity.

---

## 3. DATA -- What the Product PROCESSES

### 3.1 Data Storage Architecture

**PostgreSQL** is the primary data store, shared across all services:

| Service Group | Database Scope | Migration Tool | Migration Count |
|--------------|---------------|----------------|-----------------|
| Elixir services (18) | Ecto migrations (.exs) | Ecto.Migrator | ~80 migration files |
| Go services (4) | SQL migrations (.sql) | golang-migrate | 114 SQL files |
| Ruby service (1) | ActiveRecord migrations | Rails | Separate migration dir |

**Storage Services:**
- MinIO (artifacts): 3Gi default, stores build artifacts
- MinIO (cache): 3Gi default, stores build cache
- MinIO (logs): 3Gi default, stores job logs
- Redis: 1Gi default, session/cache data
- RabbitMQ: 2Gi default, message queuing

### 3.2 Data Integrity Risks

**[D-RISK-01] Shared PostgreSQL with No Schema Isolation (CRITICAL)**
All services connect to a single PostgreSQL instance with a single set of credentials (`postgres/postgres` in defaults). There is no evidence of:
- Per-service database isolation
- Schema namespacing
- Connection pooling limits per service
- Database user separation

This means:
1. A misbehaving service can lock tables used by other services
2. Migration conflicts between services sharing the same database
3. No blast radius containment for database failures
4. `maxConnections: 1000` is shared across 30+ services

**[D-RISK-02] Default Credentials in Helm Values (HIGH)**
The `values.yaml.in` contains plaintext default credentials:
```yaml
database:
  username: postgres
  password: postgres
rabbitmq:
  username: rabbitmq
  password: rabbitmq
artifacts:
  username: "semaphore"
  password: "semaphore"
```
While these are defaults meant to be overridden, the pattern of including real credentials in tracked files creates risk of accidental deployment with defaults. The MinIO version (`RELEASE.2021-04-22T15-44-28Z.hotfix.56647434e`) is from 2021 and likely has known CVEs.

**[D-RISK-03] Three Separate Migration Frameworks (HIGH)**
Three different migration tools manage the same PostgreSQL instance:
- **Ecto** (Elixir): Timestamp-based migrations in `priv/repo/migrations/`
- **golang-migrate** (Go): Sequential SQL files in `db/migrations/`
- **ActiveRecord** (Ruby): Rails-style migrations in `db/migrate/`

There is no orchestration layer to ensure migration ordering across services. During an upgrade, if Go service migrations run before Elixir ones (or vice versa), data integrity violations are possible. The Helm chart has no visible migration ordering mechanism.

**[D-RISK-04] Guard Has Three Separate Databases (MEDIUM)**
Guard maintains three Ecto repos:
- `Guard.Repo` -- primary guard data
- `Guard.FrontRepo` -- front-end related data
- `Guard.InstanceConfigRepo` -- instance configuration

This suggests the guard service has accumulated responsibilities that should be in separate services, each with their own data store. The coupling between these three data domains within one service is a refactoring debt indicator.

**[D-RISK-05] No Visible Data Backup Strategy (MEDIUM)**
Neither the Helm chart nor documentation describes backup procedures for:
- PostgreSQL (all service data)
- MinIO (artifacts, logs, cache)
- RabbitMQ (in-flight messages)
- Redis (session state)

For a self-hosted CI/CD platform, data loss scenarios are catastrophic (loss of all pipeline history, secrets, project configuration).

### 3.3 Data Flow Architecture

```
GitHub/Bitbucket/GitLab
    |
    v
hooks_receiver --> hooks_processor --> plumber/ppl
    |                                      |
    v                                      v
github_hooks                          zebra (jobs)
    |                                      |
    v                                      v
repository_hub/repohub              loghub2 (logs)
    |                              artifacthub (artifacts)
    v
projecthub --> secrethub --> encryptor
    |
    v
guard (auth/org) --> rbac --> keycloak
```

Data flows through gRPC calls, with RabbitMQ used for async operations (log ingestion, org events, hook processing). The plumber service consumes org events via AMQP consumer (`Ppl.OrgEventsConsumer`).

---

## 4. INTERFACES -- How the Product CONNECTS

### 4.1 API Surface Inventory

**Internal APIs (gRPC):**
The `internal-api-urls.yaml` configmap reveals **42 distinct internal gRPC endpoints** across services, all on port 50051 (with minor exceptions: feature on 50052, gofer on 50055, plumber on 50053).

**Public APIs:**

| API Version | Technology | Status | Scope |
|------------|-----------|--------|-------|
| v1alpha | Elixir/gRPC | Legacy | Pipelines, workflows (plumber-public) |
| v2 | Elixir/REST | Current | Projects, workflows, pipelines, secrets |
| Gateway | Go/REST | Current | Artifacts, dashboards, jobs, notifications, secrets |

**Webhook Interfaces:**
- GitHub App webhooks (hooks_receiver)
- Bitbucket webhooks (github_hooks -- misnamed)
- Notification webhooks (outbound)

### 4.2 API Quality Concerns

**[I-RISK-01] API Version Fragmentation (CRITICAL)**
The public API exists in at least **5 different versioning schemes simultaneously**:
- `v1alpha` -- pipelines/plumber (Elixir)
- `v2` -- projects, workflows (Elixir)
- `v1` -- artifacts (Go gateway: `artifacts.v1`)
- `v1` -- project_secrets (Go gateway: `project_secrets.v1`)
- `v1beta` -- secrets (Go gateway: `secrets.v1beta`)
- `v1alpha` -- dashboards, jobs, notifications (Go gateway)

A developer integrating with the Semaphore API must navigate 5+ version schemes across 2 different service implementations (Elixir public-api and Go gateway). There is no unified API reference or SDK that abstracts this complexity.

**[I-RISK-02] Dual Public API Implementations (HIGH)**
Public APIs are split between two separate implementations:
1. **Elixir** (`public-api/v1alpha`, `public-api/v2`): Pipelines, workflows, projects
2. **Go** (`public-api-gateway`): Artifacts, dashboards, jobs, notifications, secrets

These use different authentication patterns, error formats, and potentially different rate limiting. A user making a single workflow that creates a project (v2/Elixir), runs a pipeline (v1alpha/Elixir), and fetches artifacts (v1/Go) interacts with three different API implementations.

**[I-RISK-03] OpenAPI Spec is Draft-Only (HIGH)**
The `docs/docs-drafts/openapi-spec/` directory contains 60+ API endpoint descriptions, but they are in `docs-drafts` -- not published. Without a published OpenAPI spec:
- No automated SDK generation
- No contract testing against the spec
- No API-first development workflow
- Third-party integrations must reverse-engineer the API

**[I-RISK-04] No API Rate Limiting Evidence (MEDIUM)**
The public-api-gateway middleware directory contains only audit middleware. There is no visible rate limiting, request throttling, or abuse prevention for the public API. For a CI/CD platform that triggers expensive compute operations, this is a denial-of-service risk.

**[I-RISK-05] gRPC Health Checking Inconsistency (LOW)**
Some services implement `GRPC.Server` with health checks (plumber, zebra), while others have separate health check endpoints. The `health.pb.ex` files appear in some but not all services. Kubernetes liveness/readiness probes may not have consistent health check targets.

### 4.3 UI Architecture

The front-end is a **Phoenix 1.6 application** (Elixir server-rendered) with JavaScript assets. Key observations:
- Server-side rendering with Phoenix templates (not SPA)
- Workflow templates in `front/workflow_templates/` for onboarding
- Browser tests in `front/test/browser/`
- Assets include CSS, JS, fonts, and images
- No evidence of TypeScript or modern frontend framework (React/Vue) -- the CONTRIBUTING.md mentions "TS/React" but the actual front service is Phoenix/EEx

This is notable: the contributing guide claims "TS/React: Frontend (front/)" but the actual implementation is a Phoenix server-rendered application. This documentation inaccuracy will confuse potential contributors.

---

## 5. PLATFORM -- What the Product DEPENDS ON

### 5.1 Deployment Model

**Primary Target:** Kubernetes (GKE, EKS, k3s, Minikube)

**Helm Chart Architecture:**
- 35 sub-charts (one per service)
- Umbrella chart with `Chart.yaml.in` template (version injected at build time)
- Dependencies: Emissary Ingress 8.9.1, Controller 0.2.4

**Infrastructure Requirements:**
- Minimum (dev): 8 CPUs, 16GB RAM (Minikube)
- PostgreSQL 14
- RabbitMQ 3.13
- Redis 7.2
- MinIO (3 instances)
- Keycloak
- TLS certificates

**Ingress Options:**
- GCE (Google Cloud)
- Traefik (k3s/VM)
- Nginx (Minikube/dev)

### 5.2 Platform Quality Concerns

**[P-RISK-01] Heavy Resource Requirements (HIGH)**
The minimum development setup requires 8 CPUs and 16GB RAM. This is before any CI/CD workload runs. For self-hosted operators:
- A production deployment likely needs 32+ GB RAM and 16+ CPUs just for the platform
- 30+ pods running simultaneously
- 3 MinIO instances, PostgreSQL, RabbitMQ, Redis, Keycloak
- The roadmap acknowledges this: "Reduced resource requirements for CE" is a short-term goal

**[P-RISK-02] Keycloak as Hard Dependency (HIGH)**
Keycloak is not optional -- it is a required component for authentication. This:
- Adds significant memory overhead (~512MB-1GB)
- Introduces Java runtime dependency in an otherwise Elixir/Go stack
- Requires separate upgrade and security patching lifecycle
- Creates a single point of failure for all authentication
- Adds complexity for operators unfamiliar with Keycloak configuration

**[P-RISK-03] MinIO Version is 3+ Years Old (MEDIUM)**
The default MinIO version (`RELEASE.2021-04-22T15-44-28Z.hotfix.56647434e`) is from April 2021. This version likely has:
- Known CVEs
- Missing performance improvements
- Incompatibility with newer S3 client libraries
- No support for newer MinIO features

**[P-RISK-04] Emissary Ingress Dependency (MEDIUM)**
Emissary Ingress (formerly Ambassador) is a required component even when using nginx or traefik for external ingress. The Helm chart always deploys it for internal service routing. This adds:
- Another control plane component to manage
- Potential conflicts with existing ingress controllers
- CRD installation requirement (`emissary-crds.yaml`)

**[P-RISK-05] No Horizontal Pod Autoscaling (LOW-MEDIUM)**
The Helm chart shows `replicaCount: 1` for Emissary. There is no visible HPA configuration for any service. For a CI/CD platform where load is inherently spiky (push events trigger many pipelines), the inability to auto-scale critical services (plumber, zebra, hooks_receiver) is a scalability concern.

### 5.3 Deployment Tooling

| Tool | Purpose | Quality |
|------|---------|---------|
| Skaffold | Local development | Well-configured with sync support |
| Helm | Production deployment | Comprehensive but complex |
| Docker BuildKit | Image building | Required, properly configured |
| Cosign | Image signing | Sigstore-based, secure |
| Terraform | Ephemeral environments | EKS, GKE, single-VM support |

The release pipeline is mature: image signing with cosign, Helm chart signing, OIDC-based authentication to GCP for signing operations. This is above-average security practice for open-source projects.

---

## 6. OPERATIONS -- How the Product is USED

### 6.1 Observability Architecture

**Metrics:**
- StatsD relay service (Node.js) forwarding to Graphite
- `Watchman` library used across 293 Elixir source files for metrics emission
- Go services have `pkg/metrics` packages (e.g., repohub)
- Default: metrics disabled (`statsd.enabled: false`)

**Logging:**
- Elixir Logger across 417 source files
- Go standard logging across 147 source files
- Sentry integration in 16 Elixir services (error tracking)
- No centralized log aggregation in the Helm chart

**Tracing:**
- No visible distributed tracing (no OpenTelemetry, Jaeger, or Zipkin integration)

### 6.2 Operational Concerns

**[O-RISK-01] No Distributed Tracing (CRITICAL)**
With 30+ microservices communicating over gRPC, debugging a failed pipeline requires tracing a request through:
hooks_receiver -> hooks_processor -> plumber -> zebra -> loghub2 -> (multiple other services)

Without distributed tracing, operators must correlate logs across services manually using timestamps. This is the single largest operational blind spot in the system.

**[O-RISK-02] Metrics Disabled by Default (HIGH)**
StatsD is disabled in the default Helm values. Even when enabled, it only supports Graphite as a backend. There is no:
- Prometheus metrics endpoint (the standard for Kubernetes)
- Grafana dashboards
- Pre-built alerting rules
- Service-level indicators (SLIs) or service-level objectives (SLOs)

For a Kubernetes-native platform, the absence of Prometheus integration is a significant gap. Every Kubernetes operator expects to scrape `/metrics` endpoints.

**[O-RISK-03] No Admin Panel (HIGH)**
Per the roadmap, "Admin panel interface" is a short-term goal. Currently, operators must:
- Use kubectl to inspect pod status
- Query PostgreSQL directly for data issues
- Parse logs to understand system health
- Use the public API for any management operations

This makes self-hosted operation accessible only to experienced Kubernetes operators, limiting the addressable market.

**[O-RISK-04] Incomplete Error Handling Visibility (MEDIUM)**
Sentry integration exists in 16 Elixir services but:
- Requires operators to have their own Sentry instance (or account)
- Go services do not use Sentry -- error tracking is different per language
- No built-in error aggregation dashboard
- No alerting on error rate thresholds

**[O-RISK-05] No Upgrade/Migration Tooling (MEDIUM)**
The RELEASE.md describes a manual release process:
1. Create release branch
2. Update change_in directives (manual yq command)
3. Run E2E tests
4. Tag and promote

For self-hosted operators upgrading their installation, there is no:
- `semaphore upgrade` CLI command
- Automated pre-upgrade checks
- Rollback procedure documentation
- Database migration ordering guarantees
- Breaking change detection between versions

### 6.3 Security Operations

**Strengths:**
- Security toolbox with code scanning (`check.code`), dependency scanning (`check.deps`), and Docker image scanning (`check.docker`)
- Image signing with cosign/sigstore
- OIDC-based authentication for CI operations
- Dedicated encryptor service (separation of encryption from business logic)
- Security policy (SECURITY.md) with responsible disclosure process

**Gaps:**
- No runtime security scanning
- No network policy definitions in Helm chart
- No pod security standards enforcement
- Default credentials in values files
- No secrets rotation mechanism

---

## 7. TIME -- WHEN Things Happen

### 7.1 Release Cadence

- **Current Version:** v1.0.0 (stable)
- **Release Pattern:** Minor releases from release branches (`release/vX.Y.x`)
- **Changelog:** git-cliff with conventional commits (partially adopted -- "not enforcing conventional commits yet")
- **Release Signing:** Cosign-signed Helm charts and container images

### 7.2 Time-Related Concerns

**[T-RISK-01] No Conventional Commits Enforcement (MEDIUM)**
The cliff.toml is configured for conventional commits, but RELEASE.md explicitly states they are "not enforcing conventional commits yet." This means:
- Changelogs may be incomplete
- Breaking changes may not be surfaced
- Automated versioning (semver) is not possible
- Community contributors have no commit message standard

**[T-RISK-02] Release Branch Strategy Creates Drift (MEDIUM)**
The release process creates `release/vX.Y.x` branches that diverge from main. The manual `yq` command to update `change_in` directives suggests the CI configuration must be manually adjusted per branch. This creates:
- Merge conflict potential between release branches and main
- Risk of hotfixes applied to release branch but not backported to main
- Manual overhead for each release

**[T-RISK-03] Concurrency in Pipeline Execution (LOW-MEDIUM)**
The plumber service uses:
- OTP supervision trees for process management
- In-flight counters (`Ppl.Grpc.InFlightCounter`) for rate limiting
- State machine pattern for pipeline lifecycle
- AMQP for async event processing

The design is sound, but there is no visible configuration for max concurrent pipelines, max queue depth, or backpressure mechanisms at the system level.

**[T-RISK-04] Ephemeral Environment Lifecycle (LOW)**
The `ephemeral_environment/` directory contains Terraform for EKS, GKE, and single-VM environments. These are used for E2E testing before releases. There is no visible TTL or automatic cleanup mechanism, creating risk of cloud resource leaks during failed test runs.

**[T-RISK-05] Startup Time for 30+ Services (LOW)**
Skaffold configuration notes "Initial startup takes 30-60 minutes depending on your machine." The Helm install timeout is set to `120m` (2 hours). For a CI/CD platform that should model fast feedback loops, this startup time is a developer experience concern.

---

## 8. USER PERSONA ANALYSIS

### 8.1 Developer Persona (CI/CD Configuration Author)

**Journey:** Write YAML pipeline config -> Push to GitHub -> Pipeline triggers -> View results

**Experience Quality: 7/10**

| Touchpoint | Quality | Notes |
|-----------|---------|-------|
| Pipeline YAML authoring | Good | Schema validation, definition_validator |
| Pipeline triggering | Good | Webhook-driven, reliable |
| Build log viewing | Medium | loghub2 works but no streaming evidence |
| Artifact access | Medium | MinIO-backed, JWT-authenticated |
| Secret management | Good | Per-project and org-level secrets |
| Status notifications | Good | GitHub status checks, notifications service |
| API integration | Poor | Fragmented versions, no SDK, draft OpenAPI spec |
| Debug experience | Poor | No distributed tracing, log correlation is manual |

**Key Pain Points:**
1. API version confusion when automating workflows
2. No CLI tool for local pipeline validation (definition_validator is server-side only)
3. No pipeline-as-code dry-run capability
4. MCP server integration is forward-looking but not yet mature

### 8.2 Self-Hosted Admin Persona (Infrastructure Operator)

**Journey:** Deploy Semaphore -> Configure GitHub App -> Manage users -> Monitor health -> Upgrade

**Experience Quality: 4/10**

| Touchpoint | Quality | Notes |
|-----------|---------|-------|
| Initial installation | Medium | 10-30 min claim, but complex prerequisites |
| GitHub App configuration | Medium | Bootstrapper automates, but requires env vars |
| User management | Poor | No admin panel, kubectl-dependent |
| Monitoring | Poor | Metrics disabled by default, no Prometheus |
| Troubleshooting | Poor | No tracing, 30+ services to debug |
| Upgrading | Poor | No upgrade tooling, manual process |
| Backup/Restore | Absent | No documented procedure |
| Scaling | Poor | No HPA, manual scaling only |
| Cost management | Poor | No resource optimization guidance |

**Key Pain Points:**
1. Massive resource requirements (8 CPU, 16GB RAM minimum for dev)
2. No admin dashboard for day-2 operations
3. Keycloak adds significant operational complexity
4. Single PostgreSQL instance is a scaling bottleneck
5. No runbooks or operational playbooks

### 8.3 Contributor Persona (Open-Source Developer)

**Experience Quality: 6/10**

**Strengths:**
- Dev container support for many services
- Comprehensive CONTRIBUTING.md
- Per-service Makefile with consistent targets
- Good test coverage (1,059 test files)
- RFC process for design decisions

**Weaknesses:**
- CONTRIBUTING.md claims "TS/React" frontend, but it is Phoenix -- misleading
- 30-60 minute initial setup time
- No contribution guide for specific services
- Proto generation requires access to private repo (`renderedtext/internal_api`)
- Guard's complexity makes it hard for newcomers to contribute auth-related features

---

## 9. COMPETITIVE POSITIONING

### 9.1 Architectural Comparison

| Aspect | Semaphore | GitLab CI | GitHub Actions | Drone/Woodpecker |
|--------|-----------|-----------|---------------|------------------|
| Architecture | 30+ microservices | Monolith (Rails) | Monolith + runners | Single binary |
| Deployment | Kubernetes-only | K8s, Docker, bare metal | SaaS-only (self-hosted via GHES) | Docker, K8s, bare metal |
| Min Resources | 8 CPU, 16GB RAM | 4 CPU, 4GB RAM | N/A | 1 CPU, 512MB RAM |
| Languages | Elixir, Go, Ruby | Ruby, Go | Go, TypeScript | Go |
| Pipeline Config | YAML | YAML | YAML | YAML |
| Setup Time | 30-60 min | 5-10 min (Omnibus) | N/A | 2-5 min |
| Admin Panel | Planned | Built-in | Built-in | Built-in |
| Distributed Tracing | None | Optional | Internal | N/A |
| Prometheus Metrics | None (StatsD only) | Built-in | N/A | Built-in |

### 9.2 Competitive Strengths

1. **Pipeline Engine Quality:** The plumber subsystem is exceptionally well-designed with proper domain modeling, schema validation, and state machine patterns
2. **Security Practices:** Image signing, dedicated encryption service, security scanning toolbox -- above average for open-source
3. **Feature Flag System:** Built-in feature_provider enables safe rollouts, which competitors typically handle externally
4. **MCP Server:** Forward-looking AI integration that no competitor offers yet
5. **Multi-VCS Support:** GitHub, Bitbucket, and GitLab support (though with varying maturity)

### 9.3 Competitive Weaknesses

1. **Operational Complexity:** 30+ microservices vs. single-binary competitors is a massive operational burden for self-hosted users
2. **Resource Requirements:** 4-8x the resources of simpler alternatives like Drone/Woodpecker
3. **Missing Admin Panel:** Every competitor has one; Semaphore CE does not
4. **No Prometheus/OpenTelemetry:** The Kubernetes ecosystem standard, and Semaphore does not support it
5. **No CD:** A CI/CD platform without deployment capabilities loses to GitLab and GitHub Actions
6. **Setup Complexity:** 30-60 minutes vs. 2-5 minutes for simpler alternatives

---

## 10. PRIORITIZED TEST IDEAS (SFDIPOT-derived)

### P0 -- Critical Path

| # | Category | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| 1 | Data | Force concurrent Ecto and golang-migrate migrations on the same PostgreSQL instance during a Helm upgrade; observe whether table locks cause service startup failures | Human Exploration |
| 2 | Data | Deploy with default credentials from values.yaml.in to a public-facing cluster; confirm whether external access is possible with `postgres/postgres` | Integration Test |
| 3 | Interfaces | Send a pipeline trigger through GitHub webhook and trace the request through hooks_receiver -> hooks_processor -> plumber -> zebra; measure end-to-end latency and identify where errors get swallowed | Human Exploration |
| 4 | Platform | Deploy all 30+ services into a cluster with exactly 8 CPU and 16GB RAM; measure whether all pods reach Ready state within the documented timeframe | E2E Test |
| 5 | Structure | Kill the Guard pod while 50 users are actively authenticated; observe whether auth, org, user, and instance-config APIs all fail simultaneously | Integration Test |

### P1 -- High Priority

| # | Category | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| 6 | Data | Create a project with secrethub, then query the same project ID from projecthub and projecthub-rest-api; confirm data consistency across the two separate service implementations | Integration Test |
| 7 | Interfaces | Call the same logical API endpoint (e.g., "list secrets") through public-api/v2, public-api-gateway/secrets.v1beta, and public-api-gateway/project_secrets.v1; compare response schemas for consistency | Unit Test |
| 8 | Function | Configure a Bitbucket webhook and trigger it through the github_hooks service; measure whether all GitHub-specific code paths are properly guarded for the Bitbucket context | Integration Test |
| 9 | Platform | Restart Keycloak while users have active sessions; observe whether all services lose authentication or whether token caching provides resilience | Integration Test |
| 10 | Operations | Enable StatsD metrics and send 1000 pipeline triggers; confirm whether metrics arrive at Graphite and whether metric names are consistent across Elixir (Watchman) and Go (pkg/metrics) services | Integration Test |
| 11 | Time | Submit 100 pipeline YAML files with invalid schemas simultaneously to definition_validator; observe whether validation backpressure affects pipeline creation for valid submissions | Integration Test |
| 12 | Structure | Compare protobuf definitions between auth/lib/internal_api/organization.pb.ex and guard/lib/internal_api/organization.pb.ex; identify any version drift in shared proto definitions | Unit Test |

### P2 -- Medium Priority

| # | Category | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| 13 | Data | Fill PostgreSQL to 90% disk capacity and trigger new pipeline creation; observe whether any service provides meaningful error messages vs. generic 500 errors | Human Exploration |
| 14 | Interfaces | Access the Semaphore API from a client that sends Accept: application/json to the gRPC-only v1alpha endpoints; observe error response quality | Unit Test |
| 15 | Platform | Deploy to a k3s cluster with Traefik instead of nginx; confirm whether Emissary Ingress coexists without routing conflicts | E2E Test |
| 16 | Operations | Simulate a RabbitMQ outage during active webhook processing; observe whether hooks_receiver queues or drops webhooks, and whether recovery is automatic | Integration Test |
| 17 | Time | Create a periodic scheduler pipeline with a 1-minute cron and simultaneously deploy an upgrade; observe whether scheduled pipelines are duplicated or missed during the upgrade window | Integration Test |
| 18 | Function | Create a project with GitLab integration; attempt to trigger a pipeline via webhook; document the exact point of failure since no GitLab webhook receiver exists | Human Exploration |
| 19 | Structure | Map all 42 internal gRPC endpoints from the configmap and confirm each has a corresponding health check; identify services with no health endpoint | Unit Test |
| 20 | Data | Run all Ecto migrations from scratch on a fresh database, then run all Go SQL migrations; confirm no table name or column conflicts between the two migration frameworks | Integration Test |

### P3 -- Lower Priority

| # | Category | Test Idea | Automation Fitness |
|---|----------|-----------|-------------------|
| 21 | Platform | Deploy with MinIO version from 2021 (as defaulted) and attempt to store a 5GB artifact; observe whether known CVEs in that version are exploitable | Human Exploration |
| 22 | Operations | Generate a git-cliff changelog between two tags where 50% of commits do not follow conventional commit format; measure changelog completeness | Unit Test |
| 23 | Interfaces | Access the OpenAPI spec draft files and compare them against actual API responses; identify documentation drift | Integration Test |
| 24 | Time | Start Semaphore from cold (no running pods) and measure time-to-first-pipeline for each installation method (GKE, EKS, k3s, Minikube) | E2E Test |
| 25 | Function | Use the mcp_server to create a pipeline through AI interaction; document the completeness of tool coverage for all Semaphore operations | Human Exploration |

---

## 11. CLARIFYING QUESTIONS

These questions surface unknown risks and missing requirements. They are suggestions based on general risk patterns observed during SFDIPOT analysis.

### Structure

1. **Why do both `repository_hub` (Elixir) and `repohub` (Go) exist?** Is one being deprecated? What is the migration timeline? Which one is the source of truth for repository data?

2. **Is there a plan to decompose the Guard service?** Its 7 gRPC endpoints and 3 database repos suggest it handles authentication, authorization, organization management, user management, instance configuration, and service accounts -- all in one process.

3. **Why is the internal_api proto repository external (`renderedtext/internal_api`)?** Is there a plan to move proto definitions into the monorepo? How do contributors without access to that repo regenerate proto files?

### Function

4. **What is the GitLab integration story?** The bootstrapper supports GitLab configuration, but there is no webhook receiver equivalent to github_hooks. Are GitLab users expected to use only periodic scheduling?

5. **When will CD capabilities be available for CE?** The roadmap mentions CD for Cloud/EE in Q1 2025. Is there a timeline for CE? Without CD, Semaphore competes with only half of what CI/CD platforms typically offer.

### Data

6. **Are services intended to share a single PostgreSQL database?** If yes, is there documentation on which tables belong to which service? If no, when will per-service databases be supported?

7. **What is the backup and disaster recovery strategy for self-hosted operators?** With all data in PostgreSQL and MinIO, what procedures should operators follow for backup, restore, and point-in-time recovery?

### Interfaces

8. **Is there a plan to unify the public API versions?** Having v1alpha, v1beta, v1, and v2 simultaneously across Elixir and Go implementations creates a poor developer experience. Is there a deprecation timeline for older versions?

9. **When will the OpenAPI spec move from draft to published?** The 60+ endpoint descriptions in `docs-drafts/openapi-spec/` appear comprehensive but are not integrated into the documentation site.

### Platform

10. **What are the production resource recommendations?** The documentation mentions 8 CPU/16GB RAM for development. What are the recommendations for 10 users? 100 users? 1000 users?

11. **Can Keycloak be made optional?** For small teams who just want basic username/password auth, Keycloak adds significant overhead. Is there a simpler auth option for CE?

### Operations

12. **Is Prometheus/OpenTelemetry integration planned?** The current StatsD-to-Graphite pipeline is non-standard for Kubernetes environments. Most operators expect Prometheus-compatible metrics endpoints.

13. **What is the upgrade path between versions?** How should a self-hosted operator upgrade from v1.0.0 to v1.1.0? Is there a rollback procedure? Are database migrations reversible?

---

## 12. SUMMARY OF CRITICAL FINDINGS

| Priority | Finding | Impact | Recommendation |
|----------|---------|--------|----------------|
| P0 | Shared PostgreSQL with no isolation | Data corruption, cascading failures | Implement per-service database schemas or separate databases |
| P0 | Guard service is a God Object | Single point of failure for all auth/authz | Decompose into auth, org, user, and config services |
| P0 | No distributed tracing | Unable to debug cross-service failures | Add OpenTelemetry instrumentation |
| P1 | API version fragmentation | Poor developer experience | Publish unified API spec, deprecate legacy versions |
| P1 | Default credentials in Helm values | Security risk for production deployments | Use Kubernetes secret generation, remove defaults |
| P1 | Three migration frameworks on one DB | Upgrade reliability risk | Add migration orchestration layer to Helm |
| P1 | Metrics disabled by default, no Prometheus | Operational blindness | Add Prometheus endpoints to all services |
| P2 | Repository service duplication | Confusion, maintenance overhead | Consolidate or clearly document boundaries |
| P2 | No admin panel | Poor self-hosted operator experience | Prioritize admin panel for CE |
| P2 | Outdated MinIO version (2021) | Security vulnerability exposure | Update to current MinIO release |
| P3 | Misleading service names | Operational confusion | Rename github_hooks to webhook_processor |
| P3 | No conventional commits enforcement | Incomplete changelogs | Enable commitlint in CI |

---

*Analysis performed using SFDIPOT framework from James Bach's Heuristic Test Strategy Model. Findings represent risk-based observations, not exhaustive coverage. Actual defect presence requires validation through the test ideas described above.*
