# Semaphore CI/CD Platform: Test Strategy, Test Plan, and Exploratory Testing Charters

**Document Version:** 1.0
**Date:** 2026-03-06
**Prepared by:** QE Test Architect (Agentic QE v3)
**Project:** Semaphore CI/CD Platform (monorepo)
**Classification:** Internal -- Quality Engineering

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Part 1: Test Strategy (Strategic Level)](#part-1-test-strategy)
3. [Part 2: Test Plan (Tactical Level)](#part-2-test-plan)
4. [Part 3: Exploratory Testing Charters](#part-3-exploratory-testing-charters)
5. [Appendices](#appendices)

---

## Executive Summary

Semaphore is a polyglot CI/CD platform composed of 40+ services spanning Elixir (18 services), Go (8 services), Ruby (1 service), and TypeScript/JavaScript (2 services). The platform handles pipeline orchestration, secrets management, webhook processing, RBAC, notifications, and repository integration for thousands of concurrent users.

The current test suite comprises approximately:
- **883 Elixir** test files across 18 services
- **118 Go** test files across 8 services
- **55 Ruby** spec files (github_hooks)
- **40 JS/TS** test files (front-end, docs, statsd)
- **8 E2E** test files (API + UI scenarios)
- **119 Public API** test files (v1alpha + v2)

This document provides a three-tier quality framework: strategic guidance (test strategy), tactical execution plans (test plan), and targeted risk exploration (exploratory charters).

---

# Part 1: Test Strategy

## 1.1 Testing Principles and Philosophy

### Core Principles

1. **Shift-Left by Default.** Testing begins at design time. Every service MUST have unit tests before merging. Integration contracts are verified before deployment.

2. **Risk-Proportional Investment.** Testing effort scales with business risk. Auth, secrets, pipeline execution, and RBAC receive disproportionately higher coverage investment than read-only services like badge or dashboardhub.

3. **Contract-First in a Microservice World.** With 40+ services communicating via gRPC and RabbitMQ, contract testing is not optional -- it is the primary mechanism to prevent cross-service regression.

4. **Test the CI/CD Platform with CI/CD.** Semaphore tests itself. This creates a unique meta-testing requirement: the platform's own pipelines must be treated as a first-class test artifact.

5. **Observable Quality.** Every test run produces structured telemetry. Flaky tests are tracked, quarantined, and resolved within SLA. Test results feed back into development prioritization.

6. **Polyglot Consistency.** Despite four languages, testing standards (naming, structure, coverage thresholds, CI gates) are uniform across all services.

7. **Immutable Test Environments.** Test environments are ephemeral, reproducible, and disposable. No shared mutable state between test runs.

### Testing Philosophy

The platform's complexity demands a **defense-in-depth** approach. No single test type is sufficient. Unit tests catch logic errors. Contract tests catch integration drift. E2E tests catch workflow regressions. Exploratory testing catches what automation misses. Security testing catches what functional testing ignores.

## 1.2 Risk-Based Testing Approach

### Risk Assessment Matrix

Services are categorized by two dimensions: **blast radius** (how many users/services are affected by failure) and **change velocity** (how frequently the service changes).

| Risk Tier | Services | Blast Radius | Change Velocity | Testing Investment |
|-----------|----------|-------------|----------------|-------------------|
| **Critical (P0)** | guard, auth, secrethub, encryptor, plumber/ppl, zebra | Entire platform | Medium-High | Maximum: 95%+ coverage, contract tests, chaos, security scans, E2E |
| **High (P1)** | hooks_receiver, hooks_processor, github_hooks, public-api-gateway, rbac (CE+EE), front | Major features | High | High: 85%+ coverage, contract tests, integration, E2E |
| **Medium (P2)** | projecthub, repohub, repository_hub, notifications, self_hosted_hub, loghub2, gofer | Single feature | Medium | Standard: 80%+ coverage, unit + integration |
| **Low (P3)** | badge, dashboardhub, branch_hub, scouter, feature_provider, github_notifier, statsd, docs | Cosmetic/telemetry | Low | Baseline: 70%+ coverage, unit tests |

### Highest-Risk Areas (Detailed)

1. **Authentication and Authorization (guard + auth + rbac):** A bypass here grants unauthorized access to the entire platform, including customer secrets and pipeline execution. This is the single highest-risk area.

2. **Secrets Management (secrethub + encryptor):** Secrets are encrypted at rest and decrypted at execution time. A failure here could leak customer credentials, API keys, and environment variables. Encryption correctness is non-negotiable.

3. **Pipeline Execution Engine (plumber + zebra):** The core value proposition. Plumber defines and validates pipelines; zebra schedules and dispatches jobs. Failures here mean customers cannot build, test, or deploy their software.

4. **Webhook Processing Chain (hooks_receiver -> hooks_processor -> github_hooks):** The primary trigger mechanism for pipelines. A failure in webhook processing means pushes, PRs, and tags silently fail to start pipelines. This is particularly dangerous because the failure mode is "nothing happens" -- users may not notice for hours.

5. **Public API Gateway:** The external contract with customers and tooling. Breaking changes or authorization bypasses here affect all API consumers.

## 1.3 Test Pyramid for Semaphore

The standard 70/20/10 pyramid is adapted for a microservice architecture with heavy inter-service communication:

```
                    /\
                   /  \        E2E Tests (5%)
                  / E2E\       8 scenarios: critical user journeys
                 /------\
                /        \     Contract Tests (10%)
               / Contract \    gRPC + AMQP contracts between all service pairs
              /------------\
             /              \  Integration Tests (20%)
            / Integration    \ Database, gRPC server, message consumer tests
           /------------------\
          /                    \ Unit Tests (65%)
         /       Unit           \ Pure logic, models, validators, transformers
        /--------------------------\
```

### Rationale for Deviations from Standard Pyramid

- **Contract tests elevated to 10%:** With 40+ services and gRPC as the primary communication protocol, contract drift is the most common source of production incidents in microservice architectures. Each service pair needs at least one contract test per API method.

- **E2E reduced to 5%:** E2E tests in a platform this complex are expensive to maintain and slow to execute. They should cover only the critical user journeys that cross 5+ service boundaries.

- **Integration at 20%:** Each Elixir service uses Ecto with PostgreSQL. Each Go service has its own database layer. Integration tests validating database interactions, gRPC server behavior, and RabbitMQ consumer logic are essential.

## 1.4 Quality Gates and Exit Criteria

### Per-Commit Gates (Blocking)

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Unit tests pass | 100% | CI blocks merge |
| Code coverage (changed files) | >= 80% | CI blocks merge |
| Code coverage (service overall) | No decrease | CI warns, blocks if >2% drop |
| Lint/format | Zero violations | CI blocks merge |
| Security scan (SAST) | Zero high/critical | CI blocks merge |
| Docker image scan (Trivy) | Zero critical CVEs | CI blocks merge |
| Contract tests (affected services) | 100% pass | CI blocks merge |

### Per-Release Gates (Blocking)

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| All unit tests | 100% pass | Release pipeline blocks |
| All integration tests | 100% pass | Release pipeline blocks |
| All contract tests | 100% pass | Release pipeline blocks |
| E2E critical paths | 100% pass | Release pipeline blocks |
| Performance benchmarks | No regression >10% | Release pipeline warns, manual override |
| Security scan (DAST) | Zero high findings | Release pipeline blocks |
| Dependency scan | Zero critical CVEs | Release pipeline blocks |
| Flaky test rate | < 2% | Release pipeline warns |

### Exit Criteria for Testing Phases

| Phase | Exit Criteria |
|-------|--------------|
| Development | All unit tests pass; coverage meets threshold; no lint errors |
| Integration | All integration and contract tests pass; no new service-pair failures |
| Staging | E2E tests pass; performance within bounds; security scans clean |
| Production | Canary metrics stable for 30 minutes; no error rate spike; rollback plan verified |

## 1.5 Environment Strategy

| Environment | Purpose | Data | Infra | Refresh Cycle |
|-------------|---------|------|-------|---------------|
| **Local (dev)** | Unit + integration tests | Fixtures, factories | Docker Compose (subset of services) | On-demand |
| **CI** | All automated tests per commit | Ephemeral databases, seeded fixtures | Semaphore pipelines (self-hosted) | Per-commit |
| **Staging** | E2E, performance, security | Anonymized production snapshot | Full Kubernetes cluster (mirrors prod) | Weekly data refresh |
| **Ephemeral** | PR-specific E2E validation | Seeded from fixtures | Terraform-managed (see `ephemeral_environment/`) | Per-PR, destroyed on merge |
| **Production** | Canary + smoke tests | Real data | Production Kubernetes | Continuous |

### Environment Parity Rules

- Staging MUST match production in: Kubernetes version, service mesh configuration, database versions, feature flag state.
- Ephemeral environments MUST include at minimum: guard, auth, plumber, zebra, secrethub, hooks_receiver, front, public-api-gateway.
- Local development MUST support running any single service with mocked dependencies via gRPC stubs.

## 1.6 Tooling Recommendations per Language

### Elixir Services (18 services)

| Category | Tool | Notes |
|----------|------|-------|
| Unit/Integration | ExUnit (built-in) | Already in use; add property-based with StreamData |
| Mocking | Mox | Interface-based mocking for gRPC clients |
| Coverage | excoveralls | Configure minimum thresholds per service |
| Property-based | StreamData | For validators, parsers, YAML/pipeline spec processing |
| Load testing | Tsung (Erlang-native) | Leverages BEAM concurrency for realistic load |
| Static analysis | Dialyxir + Credo | Type checking + style enforcement |
| Contract testing | Protobuf schema validation | Validate generated .pb.ex against source .proto |

### Go Services (8 services)

| Category | Tool | Notes |
|----------|------|-------|
| Unit/Integration | testing + testify | Standard library + assertions |
| Mocking | mockgen (gomock) | For gRPC client interfaces |
| Coverage | go test -cover | Built-in; enforce via CI |
| Property-based | rapid | For encryptor, API gateway input validation |
| Load testing | k6 or vegeta | HTTP/gRPC load generation |
| Static analysis | golangci-lint | Comprehensive linter suite |
| Security | gosec | Already integrated (see CI config) |
| Contract testing | buf | Protobuf linting and breaking change detection |

### Ruby Service (github_hooks)

| Category | Tool | Notes |
|----------|------|-------|
| Unit/Integration | RSpec | Already in use (55 specs) |
| Mocking | rspec-mocks, WebMock | HTTP stubbing for GitHub API |
| Coverage | SimpleCov | Enforce 85%+ for this critical webhook handler |
| Security | Brakeman | Rails/Rack-specific security scanner |
| Contract testing | Pact | For GitHub webhook payload contracts |

### JavaScript/TypeScript (front, statsd, docs)

| Category | Tool | Notes |
|----------|------|-------|
| Unit | Jest or Vitest | Depending on build tooling |
| E2E/UI | Playwright | Already implied by E2E structure; cross-browser |
| Coverage | Istanbul/c8 | Built into test runners |
| Accessibility | axe-core (via Playwright) | Automated WCAG 2.1 AA checks |
| Visual regression | Playwright screenshots | Baseline comparison for UI components |

## 1.7 Non-Functional Testing Approach

### Performance Testing

| Aspect | Approach | Target |
|--------|----------|--------|
| **Pipeline throughput** | Load test plumber + zebra with concurrent pipeline creations | 1000 concurrent pipelines, p99 < 5s scheduling |
| **Webhook processing latency** | Measure hooks_receiver -> hooks_processor -> pipeline start | p99 < 10s from webhook receipt to pipeline queued |
| **API gateway throughput** | k6 load test against public-api-gateway | 5000 req/s with p99 < 200ms |
| **Secret decryption** | Benchmark encryptor under load | 10,000 decrypt ops/s, p99 < 50ms |
| **Database query performance** | Slow query logging + explain analysis | No query > 100ms in hot paths |
| **Job scheduling** | Stress test zebra scheduler with 10K queued jobs | Fair scheduling across orgs, no starvation |

### Security Testing

| Layer | Approach | Frequency |
|-------|----------|-----------|
| **SAST** | gosec (Go), Credo security checks (Elixir), Brakeman (Ruby) | Every commit |
| **Dependency scanning** | Trivy, mix audit, bundler-audit, npm audit | Every commit |
| **Container scanning** | Trivy on Docker images | Every build |
| **DAST** | OWASP ZAP against staging API gateway | Weekly + pre-release |
| **Secret scanning** | gitleaks or trufflehog | Every commit (pre-commit hook) |
| **Penetration testing** | Third-party annual pen test | Annual + after major auth changes |
| **RBAC validation** | Automated permission matrix tests | Every commit (in rbac service tests) |
| **Crypto validation** | Encryptor unit tests + NIST test vectors | Every commit |

### Accessibility Testing

| Area | Approach | Standard |
|------|----------|----------|
| **Front UI** | axe-core via Playwright, manual screen reader testing | WCAG 2.1 AA |
| **Docs site** | Lighthouse accessibility audit | WCAG 2.1 AA |
| **Error messages** | Review for clarity and actionability | Plain language standard |

### Reliability Testing

| Type | Approach | Scope |
|------|----------|-------|
| **Chaos testing** | Kill individual services, introduce network partitions | Staging |
| **Graceful degradation** | Verify fallback behavior when dependencies are down | All P0/P1 services |
| **Data recovery** | Backup/restore verification for PostgreSQL databases | All stateful services |
| **Circuit breaker validation** | Force gRPC timeouts, verify circuit breaker activation | All gRPC clients |

## 1.8 CI/CD Testing Integration (Meta-Testing)

Semaphore tests itself. This creates unique requirements:

### Self-Referential Testing Strategy

1. **Pipeline-as-Code Validation:** The `.semaphore/semaphore.yml` and related pipeline definitions are themselves testable artifacts. Validate YAML syntax, step dependencies, and secret references before execution.

2. **Dogfooding Gate:** Every release candidate MUST successfully run its own CI pipeline on the new version before being promoted. This catches bootstrap failures where the new version cannot build itself.

3. **Pipeline Regression Suite:** Maintain a set of known-good pipeline definitions that exercise all pipeline features (parallelism, promotions, caching, artifacts, auto-cancel, fail-fast). Run these against staging before every release.

4. **Webhook Replay Testing:** Capture real webhook payloads (sanitized) and replay them against staging to verify the hooks_receiver -> hooks_processor -> plumber chain works end-to-end.

5. **API Backward Compatibility:** The public API (v1alpha, v2) has external consumers. Every release MUST run the full public API test suite and verify no breaking changes in response shapes.

---

# Part 2: Test Plan

## 2.1 Scope

### In Scope

| Area | Details |
|------|---------|
| All 40+ services listed in `.semaphore/services.json` | Unit, integration, contract tests |
| Enterprise Edition (EE) modules | audit, gofer, pre_flight_checks, rbac (EE), velocity |
| Community Edition (CE) RBAC | rbac/ce |
| Public APIs | v1alpha, v2, public-api-gateway |
| E2E user journeys | API and UI paths |
| Webhook processing chain | hooks_receiver -> hooks_processor -> github_hooks |
| Security testing | SAST, DAST, dependency scanning, container scanning |
| Performance testing | Pipeline throughput, API latency, job scheduling |

### Out of Scope

| Area | Rationale |
|------|-----------|
| Helm chart deployment testing | Infrastructure team responsibility; validated in staging |
| Keycloak configuration | Third-party component; tested via integration with guard/auth |
| Documentation content accuracy | Technical writing team; automated link checking only |
| Third-party service behavior | GitHub API, Slack API, email providers -- mock at boundary |
| Terraform/ephemeral environment provisioning | Infrastructure team; smoke test only |

## 2.2 Test Types by Service with Priorities

### P0 Critical Services

| Service | Language | Unit | Integration | Contract | E2E | Security | Performance |
|---------|----------|------|-------------|----------|-----|----------|-------------|
| guard | Elixir | Required (95%) | Required | Required (all gRPC) | Yes | SAST + RBAC audit | Session throughput |
| auth | Elixir | Required (95%) | Required | Required | Yes | SAST + auth bypass | Token validation |
| secrethub | Elixir | Required (95%) | Required | Required | Yes | Crypto audit | Decrypt latency |
| encryptor | Go | Required (95%) | Required | Required | - | Crypto audit + NIST | Encrypt/decrypt throughput |
| plumber/ppl | Elixir | Required (90%) | Required | Required | Yes | SAST | Pipeline creation |
| zebra | Elixir | Required (90%) | Required | Required | Yes | SAST | Job scheduling |

### P1 High-Priority Services

| Service | Language | Unit | Integration | Contract | E2E | Security | Performance |
|---------|----------|------|-------------|----------|-----|----------|-------------|
| hooks_receiver | Elixir | Required (85%) | Required | Required | Yes | Webhook validation | Webhook throughput |
| hooks_processor | Elixir | Required (85%) | Required | Required | Yes | SAST | Processing latency |
| github_hooks | Ruby | Required (85%) | Required | Pact | Yes | Brakeman | Webhook throughput |
| public-api-gateway | Go | Required (85%) | Required | Required | Yes | DAST + auth | API throughput |
| rbac/ce | Elixir | Required (90%) | Required | Required | - | Permission audit | - |
| ee/rbac | Elixir | Required (90%) | Required | Required | - | Permission audit | - |
| front | Elixir | Required (80%) | Required | Required | Yes (UI) | XSS audit | Page load |

### P2 Medium-Priority Services

| Service | Language | Unit | Integration | Contract | E2E |
|---------|----------|------|-------------|----------|-----|
| projecthub | Elixir | Required (80%) | Required | Required | - |
| repohub | Go | Required (80%) | Required | Required | - |
| repository_hub | Elixir | Required (80%) | Required | Required | - |
| notifications | Elixir | Required (80%) | Required | Required | - |
| self_hosted_hub | Go | Required (80%) | Required | Required | - |
| loghub2 | Go | Required (80%) | Required | Required | - |
| ee/gofer | Elixir | Required (80%) | Required | Required | - |
| public-api v2 | Elixir | Required (85%) | Required | Required | Yes |
| public-api v1alpha | Elixir | Required (85%) | Required | Required | - |

### P3 Lower-Priority Services

| Service | Language | Unit | Integration |
|---------|----------|------|-------------|
| badge | Elixir | Required (70%) | Minimal |
| dashboardhub | Elixir | Required (70%) | Minimal |
| branch_hub | Elixir | Required (70%) | Minimal |
| scouter | Elixir | Required (70%) | Minimal |
| feature_provider | Elixir | Required (70%) | Minimal |
| github_notifier | Elixir | Required (70%) | Required |
| statsd | JS | Required (70%) | Minimal |
| mcp_server | Go | Required (80%) | Required |
| artifacthub | Go | Required (80%) | Required |
| bootstrapper | Go | Required (75%) | Required |
| ee/velocity | Go | Required (80%) | Required |
| ee/audit | Elixir | Required (80%) | Required |
| ee/pre_flight_checks | Elixir | Required (80%) | Required |
| periodic_scheduler | Elixir | Required (80%) | Required |

## 2.3 Regression Testing Approach

### Tiered Regression Strategy

| Tier | Trigger | Scope | Duration Target |
|------|---------|-------|-----------------|
| **Smoke** | Every commit | 50 critical unit tests + health checks | < 5 minutes |
| **Core Regression** | Every PR merge to main | All unit + integration tests for changed service + dependent services | < 20 minutes |
| **Full Regression** | Nightly + pre-release | All tests across all services + E2E + contract | < 60 minutes |
| **Extended Regression** | Weekly + pre-major-release | Full + performance + security + chaos | < 4 hours |

### Change Impact Analysis

When a service changes, the following dependency graph determines which additional services need regression testing:

```
guard changes -> re-test: auth, front, public-api-gateway, all services using guard gRPC
auth changes  -> re-test: guard, front, hooks_receiver
secrethub changes -> re-test: zebra (secret injection), public-api-gateway
plumber changes -> re-test: zebra, hooks_processor, gofer, public-api v1alpha
zebra changes -> re-test: plumber, self_hosted_hub
hooks_receiver changes -> re-test: hooks_processor
hooks_processor changes -> re-test: plumber (workflow creation)
rbac changes -> re-test: guard, front, public-api-gateway, gofer
encryptor changes -> re-test: secrethub, guard
```

### Flaky Test Management

1. **Detection:** Any test that fails once in 5 consecutive runs is flagged as flaky.
2. **Quarantine:** Flaky tests are moved to a separate CI job that does not block merges.
3. **SLA:** Flaky tests must be fixed or removed within 5 business days.
4. **Tracking:** A dashboard tracks flaky test rate per service per week.
5. **Root Cause:** Common flaky causes in this codebase: timing-dependent RabbitMQ consumers, Ecto sandbox checkout race conditions, gRPC connection pool exhaustion in tests.

## 2.4 Data Management Strategy

### Test Data Principles

1. **Factories over fixtures.** Use ExMachina (Elixir) and factories (Go, Ruby) to generate test data. Avoid shared fixture files that create hidden coupling.

2. **Database isolation.** Each Elixir test uses Ecto.Adapters.SQL.Sandbox for transactional isolation. Go tests use per-test database transactions with rollback.

3. **Sensitive data handling.** Test secrets, API keys, and tokens are generated deterministically from seeds. Production data is NEVER used in tests without anonymization.

4. **Protobuf message factories.** Create factory functions for all internal API protobuf messages to ensure consistent test data across services.

### Test Data by Category

| Data Type | Strategy | Storage |
|-----------|----------|---------|
| User accounts | Factory-generated with known UUIDs | In-memory / test DB |
| Organizations | Factory with configurable plans (free/startup/enterprise) | In-memory / test DB |
| Secrets | Generated with known encryption keys (test-only KMS) | Test DB + encryptor mock |
| Pipeline YAML | Fixture files in `test/fixtures/` per service | Filesystem |
| Webhook payloads | Captured and sanitized from production | `test/fixtures/webhooks/` |
| Git repositories | Lightweight test repos with known commit SHAs | Git fixtures or mocks |
| RBAC roles/permissions | Seeded from `priv/repo/` migrations | Test DB |

## 2.5 Service-Level Test Plans: Top 5 Critical Services

### 2.5.1 Guard (User and Organization Management)

**Current State:** 37 test files
**Target Coverage:** 95%
**Language:** Elixir

| Test Area | Test Types | Priority | Count (Estimated) |
|-----------|-----------|----------|-------------------|
| User CRUD operations | Unit + Integration | P0 | 25 |
| Organization lifecycle | Unit + Integration | P0 | 20 |
| Session management (OIDC) | Unit + Integration + Security | P0 | 30 |
| Service account management | Unit + Integration | P1 | 15 |
| RBAC integration | Contract + Integration | P0 | 20 |
| Invitation flow | Unit + Integration | P1 | 10 |
| IP filtering | Unit + Property-based | P1 | 15 |
| Feature flag resolution | Unit | P2 | 10 |
| gRPC server endpoints | Integration + Contract | P0 | 25 |
| Event consumers (RabbitMQ) | Integration | P1 | 10 |

**Key Risks:** Session hijacking, privilege escalation via RBAC bypass, OIDC token validation flaws, organization isolation breakdowns.

### 2.5.2 Secrethub (Secrets Management)

**Current State:** 24 test files
**Target Coverage:** 95%
**Language:** Elixir

| Test Area | Test Types | Priority | Count (Estimated) |
|-----------|-----------|----------|-------------------|
| Secret CRUD (org-level) | Unit + Integration | P0 | 20 |
| Project-level secrets | Unit + Integration | P0 | 20 |
| Secret encryption/decryption | Unit + Integration + Security | P0 | 15 |
| OIDC JWT configuration | Unit + Integration | P1 | 15 |
| Public gRPC API | Contract + Integration | P0 | 15 |
| Access control (who can read secrets) | Unit + Security | P0 | 20 |
| Secret versioning | Unit + Integration | P1 | 10 |
| Owner deletion cascade | Integration | P1 | 5 |
| Encryptor client integration | Contract | P0 | 10 |

**Key Risks:** Secret leakage through logs, unauthorized secret access across organizations, encryption key rotation failures, OIDC JWT claim injection.

### 2.5.3 Plumber/PPL (Pipeline Engine)

**Current State:** 146 test files (89 in ppl alone)
**Target Coverage:** 90%
**Language:** Elixir

| Test Area | Test Types | Priority | Count (Estimated) |
|-----------|-----------|----------|-------------------|
| Pipeline YAML parsing | Unit + Property-based | P0 | 30 |
| Pipeline validation | Unit + Property-based | P0 | 25 |
| Workflow creation/management | Unit + Integration | P0 | 20 |
| Block execution logic | Unit + Integration | P0 | 20 |
| Job matrix expansion | Unit + Property-based | P1 | 15 |
| Time limits/auto-cancel | Unit + Integration | P1 | 15 |
| Promotions and deployments | Unit + Integration | P1 | 15 |
| Repo proxy integration | Contract | P1 | 10 |
| Task API | Contract + Integration | P0 | 15 |
| Pipeline definition validation | Unit + Fuzz | P0 | 20 |

**Key Risks:** YAML injection via pipeline definitions, infinite loop in pipeline evaluation, incorrect job dependency resolution, promotion to wrong environment.

### 2.5.4 Zebra (Job Scheduler and Dispatcher)

**Current State:** 50 test files
**Target Coverage:** 90%
**Language:** Elixir

| Test Area | Test Types | Priority | Count (Estimated) |
|-----------|-----------|----------|-------------------|
| Job scheduling algorithm | Unit + Property-based | P0 | 20 |
| Organization fair scheduling | Unit + Integration | P0 | 15 |
| Job request factory | Unit + Integration | P0 | 25 |
| Secret injection into jobs | Unit + Security | P0 | 15 |
| Agent dispatching (hosted) | Unit + Integration | P0 | 15 |
| Agent dispatching (self-hosted) | Unit + Integration | P1 | 10 |
| Job lifecycle (start/stop/finish) | Unit + Integration | P0 | 20 |
| Callback workers | Unit + Integration | P1 | 15 |
| Fail-fast logic | Unit + Integration | P1 | 10 |
| Job termination/cleanup | Unit + Integration | P1 | 10 |
| Public job API | Contract + Integration | P0 | 10 |

**Key Risks:** Job starvation for smaller organizations, secret leakage in job environment, orphaned jobs that never complete, scheduler deadlock under high load.

### 2.5.5 Hooks Receiver + Hooks Processor + GitHub Hooks (Webhook Chain)

**Current State:** 5 + 20 + 55 = 80 test files
**Target Coverage:** 85%
**Languages:** Elixir + Ruby

| Test Area | Test Types | Priority | Count (Estimated) |
|-----------|-----------|----------|-------------------|
| Webhook signature validation | Unit + Security | P0 | 15 |
| GitHub event parsing (push, PR, tag) | Unit + Property-based | P0 | 25 |
| Bitbucket event parsing | Unit | P1 | 10 |
| License verification | Unit + Integration | P1 | 5 |
| Repository/project lookup | Integration | P0 | 15 |
| Pipeline trigger logic | Integration | P0 | 20 |
| Webhook filtering/dedup | Unit + Integration | P1 | 15 |
| Rate limiting | Unit + Performance | P1 | 10 |
| Error handling (malformed payloads) | Unit + Fuzz | P0 | 15 |
| GitHub App installation flow | Integration | P1 | 10 |

**Key Risks:** Webhook replay attacks, forged webhook signatures, pipeline trigger for unauthorized branches, silent failure on malformed payloads, rate limiting bypass.

## 2.6 Integration Test Matrix

This matrix identifies which service pairs require contract/integration tests based on the gRPC and RabbitMQ communication observed in the codebase:

### gRPC Communication Map

| Caller (Client) | Callee (Server) | API | Priority |
|-----------------|-----------------|-----|----------|
| front | guard | UserServer, OrgServer | P0 |
| front | plumber | PipelineAPI, WorkflowAPI | P0 |
| front | zebra | JobAPI, TaskAPI | P0 |
| front | secrethub | SecretAPI | P1 |
| front | scouter | ScouterAPI | P2 |
| front | repository_hub | RepositoryAPI | P1 |
| front | loghub2 | LogAPI | P2 |
| guard | rbac | RbacServer | P0 |
| guard | encryptor | EncryptorAPI | P0 |
| guard | feature_provider | FeatureAPI | P2 |
| zebra | secrethub | SecretAPI (job secret injection) | P0 |
| zebra | plumber | TaskAPI, PipelineAPI | P0 |
| zebra | repohub | RepoProxyAPI | P1 |
| zebra | projecthub | ProjectAPI | P1 |
| zebra | artifacthub | ArtifactAPI | P2 |
| zebra | loghub2 | LogAPI | P2 |
| hooks_processor | plumber | WorkflowAPI | P0 |
| hooks_processor | projecthub | ProjectAPI | P1 |
| hooks_processor | rbac | RbacAPI | P1 |
| hooks_receiver | repository_hub | RepositoryAPI | P1 |
| public-api-gateway | guard | AuthAPI | P0 |
| public-api-gateway | plumber | PipelineAPI | P0 |
| public-api-gateway | secrethub | SecretAPI | P1 |
| public-api-gateway | notifications | NotificationAPI | P2 |
| gofer | plumber | WorkflowAPI | P1 |
| self_hosted_hub | zebra | AgentAPI | P1 |

### RabbitMQ Event Communication

| Publisher | Event | Consumer(s) | Priority |
|-----------|-------|-------------|----------|
| guard | org.suspended | zebra, secrethub, projecthub | P0 |
| guard | org.unsuspended | zebra, secrethub, projecthub | P1 |
| guard | user.deleted | rbac, secrethub | P0 |
| plumber | pipeline.done | zebra, notifications, gofer | P0 |
| zebra | job.finished | plumber, loghub2, notifications | P0 |
| zebra | job.started | plumber, velocity | P1 |
| secrethub | owner.deleted | (internal cleanup) | P2 |

## 2.7 E2E Test Scenarios for Critical User Journeys

### Current E2E Coverage

The existing 8 E2E test files cover:
- API: agent, secrets, task, workflow
- UI: git integrations, login, project creation, user management

### Proposed E2E Scenarios (Priority Order)

| ID | Scenario | Services Involved | Priority |
|----|----------|-------------------|----------|
| E2E-001 | **GitHub push triggers pipeline, runs to completion** | hooks_receiver -> hooks_processor -> plumber -> zebra -> loghub2 -> notifications | P0 |
| E2E-002 | **User login, create project, connect repo, trigger first build** | auth -> guard -> front -> projecthub -> repository_hub -> hooks_receiver -> plumber -> zebra | P0 |
| E2E-003 | **Create org secret, use in pipeline job, verify injection** | guard -> secrethub -> encryptor -> plumber -> zebra | P0 |
| E2E-004 | **RBAC: admin grants reader role, reader cannot modify project** | guard -> rbac -> front -> projecthub | P0 |
| E2E-005 | **API: create workflow via public API, monitor status, get logs** | public-api-gateway -> plumber -> zebra -> loghub2 | P0 |
| E2E-006 | **Pipeline with promotions: build -> staging -> production** | plumber -> gofer -> zebra -> notifications | P1 |
| E2E-007 | **Self-hosted agent connects, picks up job, reports completion** | self_hosted_hub -> zebra -> plumber | P1 |
| E2E-008 | **Notification rules: Slack + webhook on pipeline failure** | notifications -> plumber (event) -> webhook/slack delivery | P1 |
| E2E-009 | **Pipeline with job matrix, parallelism, and fail-fast** | plumber -> zebra | P1 |
| E2E-010 | **Organization suspension cascades: pipelines stop, secrets locked** | guard -> zebra -> secrethub -> projecthub | P1 |
| E2E-011 | **PR workflow: open PR, pipeline runs, status posted to GitHub** | hooks_receiver -> hooks_processor -> plumber -> zebra -> github_notifier | P1 |
| E2E-012 | **Artifact upload/download across pipeline stages** | zebra -> artifacthub | P2 |
| E2E-013 | **Dashboard creation and pipeline badge display** | dashboardhub -> plumber -> badge | P2 |
| E2E-014 | **Pre-flight checks block promotion when failing** | pre_flight_checks -> gofer -> plumber | P2 |
| E2E-015 | **Audit trail: verify all admin actions are logged** | guard -> audit -> (any admin action) | P2 |

## 2.8 Estimated Effort and Phasing

### Phase 1: Foundation (Weeks 1-4)

| Activity | Effort | Deliverable |
|----------|--------|-------------|
| Establish coverage baselines for all services | 3 days | Coverage report per service |
| Set up contract testing framework (buf for proto, Pact for Ruby) | 5 days | CI pipeline integration |
| Add missing unit tests for P0 services to reach 90%+ | 10 days | ~150 new tests |
| Implement flaky test detection and quarantine | 3 days | CI job + dashboard |
| Security scanning integration (gosec, Brakeman, mix audit) | 2 days | CI gate |

**Total Phase 1: ~23 person-days**

### Phase 2: Integration and Contracts (Weeks 5-8)

| Activity | Effort | Deliverable |
|----------|--------|-------------|
| Contract tests for all P0 gRPC service pairs | 10 days | ~50 contract tests |
| Integration tests for RabbitMQ event flows | 5 days | ~20 integration tests |
| Property-based tests for plumber YAML parsing and validation | 5 days | ~30 property tests |
| E2E-001 through E2E-005 implementation | 10 days | 5 E2E scenarios |

**Total Phase 2: ~30 person-days**

### Phase 3: Non-Functional and Extended Coverage (Weeks 9-12)

| Activity | Effort | Deliverable |
|----------|--------|-------------|
| Performance test suite (k6/Tsung) | 8 days | Benchmark suite |
| DAST integration (OWASP ZAP against staging) | 3 days | Security scan pipeline |
| E2E-006 through E2E-011 | 8 days | 6 E2E scenarios |
| Add P1 service unit tests to reach 85%+ | 8 days | ~100 new tests |
| Chaos testing framework setup | 3 days | Chaos test suite |

**Total Phase 3: ~30 person-days**

### Phase 4: Maturation (Weeks 13-16)

| Activity | Effort | Deliverable |
|----------|--------|-------------|
| P2/P3 service test gap closure | 10 days | ~80 new tests |
| E2E-012 through E2E-015 | 5 days | 4 E2E scenarios |
| Accessibility testing for front UI | 3 days | WCAG audit |
| Test data management automation | 3 days | Factory libraries |
| Documentation and runbook creation | 2 days | Test runbooks |

**Total Phase 4: ~23 person-days**

### Summary

| Phase | Duration | Person-Days | Key Outcome |
|-------|----------|-------------|-------------|
| Foundation | Weeks 1-4 | 23 | Coverage baselines, P0 unit coverage, security scanning |
| Integration | Weeks 5-8 | 30 | Contract tests, property tests, core E2E |
| Non-Functional | Weeks 9-12 | 30 | Performance, DAST, extended E2E, chaos |
| Maturation | Weeks 13-16 | 23 | Full coverage, accessibility, documentation |
| **Total** | **16 weeks** | **106 person-days** | **Comprehensive test suite** |

---

# Part 3: Exploratory Testing Charters

## Charter 1: Authentication Bypass and Session Manipulation

**Target Area:** auth service + guard session management
**Mission:** Explore authentication flows to discover bypass opportunities, session fixation, and token manipulation vulnerabilities.
**Time-Box:** 4 hours

**Setup/Preconditions:**
- Staging environment with auth + guard deployed
- Multiple user accounts (admin, member, reader, service account)
- HTTP proxy tool (Burp Suite or mitmproxy)
- Valid and expired JWT tokens

**Key Heuristics:**
- OWASP Authentication Testing Guide (OTG-AUTHN)
- Boundary analysis on token expiration times
- Goldilocks heuristic: what happens with too-long, too-short, empty tokens?

**Risks Being Explored:**
- Can an expired token be replayed to gain access?
- Can a token from org A be used to access org B resources?
- What happens when the auth service is unavailable -- does guard fail open or closed?
- Can a user escalate privileges by manipulating OIDC claims?
- Are there timing differences in responses for valid vs. invalid usernames?

**Notes/Oracles:**
- Compare behavior against OWASP ASVS Level 2 requirements
- Guard should ALWAYS fail closed (deny access) when auth is unreachable
- Token validation must reject: expired, wrong audience, wrong issuer, tampered signature

---

## Charter 2: Secret Leakage Through Logs and Error Messages

**Target Area:** secrethub + encryptor + zebra (job execution)
**Mission:** Determine whether secrets can be leaked through application logs, error messages, API responses, or job output.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Organization with secrets defined (environment variables + files)
- Pipeline that uses secrets in jobs
- Access to application logs for secrethub, encryptor, zebra
- Log aggregation tool access

**Key Heuristics:**
- Never-heuristic: secrets should NEVER appear in plaintext outside the job execution environment
- Error-message oracle: error responses should not reveal secret values
- Log scrubbing verification

**Risks Being Explored:**
- Do debug-level logs in secrethub expose decrypted values?
- If encryptor returns an error, does the error include the plaintext?
- When a job fails, does the failure output include injected environment variables?
- Do gRPC error traces include secret payloads?
- Can a user create a secret with a name that causes log injection?

**Notes/Oracles:**
- Search logs for known secret values after test operations
- Verify that `to_string` / `inspect` representations of secret structs are redacted
- Check that gRPC metadata does not include secrets in transit headers

---

## Charter 3: Webhook Forgery and Replay Attacks

**Target Area:** hooks_receiver + github_hooks
**Mission:** Attempt to trigger pipelines through forged or replayed webhook payloads to assess webhook security.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Staging hooks_receiver endpoint accessible
- Captured real GitHub webhook payloads (sanitized)
- Knowledge of GitHub webhook secret (or a test one)
- cURL or httpie for manual webhook submission

**Key Heuristics:**
- Spoofing: Can we impersonate GitHub?
- Tampering: Can we modify a signed payload without detection?
- Replay: Can we re-send an old valid webhook to re-trigger a pipeline?
- Denial of service: Can we flood the endpoint?

**Risks Being Explored:**
- Does hooks_receiver validate the `X-Hub-Signature-256` header correctly?
- What happens with a valid signature but modified payload body?
- Can a webhook with a valid signature be replayed hours/days later?
- What happens with extremely large payloads (>10MB)?
- Are non-GitHub webhook sources (Bitbucket, GitLab) properly validated?
- Does the license verifier correctly reject webhooks for expired licenses?

**Notes/Oracles:**
- GitHub's webhook documentation defines the signing algorithm
- Valid signatures with tampered payloads MUST be rejected
- Each webhook should be processed at most once (idempotency check)

---

## Charter 4: RBAC Permission Boundaries

**Target Area:** rbac/ce + ee/rbac + guard + front + public-api-gateway
**Mission:** Systematically test that RBAC boundaries cannot be crossed through direct API calls, UI manipulation, or service-to-service bypasses.
**Time-Box:** 4 hours

**Setup/Preconditions:**
- Organization with EE RBAC enabled
- Users with distinct roles: owner, admin, member, reader, custom role
- Multiple projects with different permission assignments
- API client (Postman, httpie) with tokens for each role

**Key Heuristics:**
- Privilege matrix testing: for each (role, action, resource) triple, verify expected allow/deny
- Horizontal privilege escalation: user A should not access user B's resources at same role level
- Vertical privilege escalation: reader should not perform admin actions
- Boundary crossings: project-level permissions should not grant org-level access

**Risks Being Explored:**
- Can a reader modify pipeline definitions through the API when the UI correctly blocks them?
- Can a member of project A access secrets of project B?
- What happens when a user's role is downgraded mid-session?
- Are service accounts subject to the same RBAC checks as human users?
- Does the public-api-gateway enforce the same RBAC as the internal front service?
- Can custom roles be crafted to grant more permissions than the admin role?

**Notes/Oracles:**
- RBAC decisions should be consistent between UI (front), API (public-api-gateway), and internal APIs
- Role changes must take effect immediately, not on next login
- The principle of least privilege: default deny, explicit allow

---

## Charter 5: Pipeline Definition Injection and Abuse

**Target Area:** plumber/ppl (definition_validator + spec + ppl)
**Mission:** Explore whether malicious or malformed pipeline YAML definitions can cause unexpected behavior, resource exhaustion, or code execution.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Ability to submit pipeline definitions via API or git push
- Collection of edge-case YAML files (deeply nested, self-referencing, oversized)
- Knowledge of Semaphore YAML schema (from docs)

**Key Heuristics:**
- YAML bomb (billion laughs attack): deeply nested anchors/aliases
- Resource exhaustion: pipeline with 10,000 jobs, infinite promotions
- Injection: special characters in job names, environment variable names
- Schema boundary: valid YAML that is semantically invalid for Semaphore

**Risks Being Explored:**
- Can a YAML bomb crash or slow the plumber service?
- What is the maximum pipeline size? Is it enforced?
- Can job names contain shell metacharacters that get executed?
- Can a pipeline definition reference secrets from another organization?
- What happens with circular promotion chains (A promotes B promotes A)?
- Can `auto_promote` conditions be crafted to always evaluate true regardless of pipeline result?

**Notes/Oracles:**
- All YAML parsing should use safe loaders (no arbitrary object instantiation)
- Pipeline definitions should be validated before any execution starts
- Resource limits (max jobs, max blocks, max depth) should be documented and enforced

---

## Charter 6: API Gateway Authorization and Rate Limiting

**Target Area:** public-api-gateway
**Mission:** Probe the API gateway for authorization gaps, rate limiting effectiveness, and input validation weaknesses.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- API tokens for different user roles and organizations
- API documentation (public-api/v2 specs)
- Rate limiting configuration knowledge
- HTTP client with ability to send rapid requests

**Key Heuristics:**
- BOLA (Broken Object-Level Authorization): access resources by guessing/iterating IDs
- Mass assignment: send extra fields in request bodies
- Rate limit bypass: vary headers, tokens, IP addresses
- API versioning: test v1alpha endpoints with v2 tokens and vice versa

**Risks Being Explored:**
- Can a user access another organization's resources by changing the org_id in the URL?
- Does the gateway properly validate all path parameters (UUID format, existence)?
- What error information is leaked in 4xx/5xx responses?
- Can rate limits be bypassed by rotating API tokens?
- Are deprecated v1alpha endpoints still accessible and do they share the same auth?
- What happens when backend services (plumber, secrethub) are slow -- does the gateway timeout gracefully?

**Notes/Oracles:**
- Every API endpoint must check that the authenticated user has access to the requested resource
- Error responses should not include stack traces, internal service names, or database details
- Rate limiting should be per-organization, not per-token

---

## Charter 7: Organization Isolation Under Concurrent Load

**Target Area:** guard + zebra + secrethub + plumber (cross-cutting)
**Mission:** Verify that organization data isolation holds under concurrent operations from multiple organizations.
**Time-Box:** 4 hours

**Setup/Preconditions:**
- Two test organizations (Org-Alpha and Org-Beta) with similar project structures
- Concurrent API clients for both organizations
- Known secrets in each org with distinct values
- Pipelines running simultaneously in both organizations

**Key Heuristics:**
- Isolation oracle: data from Org-Alpha should never appear in Org-Beta's context
- Concurrency stress: simultaneous operations may expose race conditions in isolation
- Caching verification: are gRPC responses or database queries properly scoped to org?

**Risks Being Explored:**
- Under concurrent secret creation, can Org-Alpha's secret end up in Org-Beta's namespace?
- When zebra schedules jobs from both orgs, can a job from Org-Alpha receive Org-Beta's secrets?
- Does the guard cache properly invalidate when org membership changes?
- Can a race condition in project creation cause cross-org project visibility?
- Do database queries consistently use org_id as a partition key?

**Notes/Oracles:**
- Cross-organization data leakage is a critical severity finding
- All database queries on multi-tenant tables MUST include org_id in WHERE clauses
- Cache keys MUST include org_id as a namespace component

---

## Charter 8: Graceful Degradation When Dependencies Fail

**Target Area:** All P0 services (guard, auth, secrethub, plumber, zebra)
**Mission:** Systematically disable dependencies and observe how each critical service degrades. Determine whether failures cascade or are contained.
**Time-Box:** 4 hours

**Setup/Preconditions:**
- Staging environment with ability to kill/restart individual services
- Network partition simulation tools (iptables, toxiproxy)
- Monitoring dashboards for all services
- Active pipelines running during tests

**Key Heuristics:**
- Circuit breaker heuristic: does the calling service stop hammering a dead dependency?
- Fail-fast vs. hang: does the service return errors quickly or hang waiting?
- Data consistency: after recovery, is data in a consistent state?
- User experience: what does the end user see when a backend service is down?

**Risks Being Explored:**
- When encryptor is down, does secrethub return errors or cached stale data?
- When guard is down, do all other services fail (total outage)?
- When RabbitMQ is down, do event publishers back up and OOM?
- When PostgreSQL is slow, do Ecto connection pools exhaust and cascade?
- After a service recovers, does it process the backlog correctly?
- Do gRPC clients implement proper retry with exponential backoff?

**Notes/Oracles:**
- Single service failure should not cause total platform outage
- gRPC clients should implement timeouts, retries, and circuit breakers
- RabbitMQ publishers should use confirms and handle nacks
- Recovery should be automatic -- no manual intervention required

---

## Charter 9: Encryption Key Rotation and Crypto Boundaries

**Target Area:** encryptor + secrethub
**Mission:** Explore the encryption key rotation process and verify cryptographic boundaries are correctly implemented.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Access to encryptor service configuration
- Knowledge of current encryption algorithm (AES-GCM based on code inspection)
- Secrets encrypted with current and previous key versions
- Ability to rotate encryption keys

**Key Heuristics:**
- Key rotation oracle: old secrets must still be decryptable after rotation
- Forward secrecy: new secrets must use the new key
- No-op encryptor concern: code shows a `no_op_encryptor.go` -- when is this used?
- Nonce reuse: AES-GCM is catastrophically broken if nonces are reused

**Risks Being Explored:**
- After key rotation, can all existing secrets still be decrypted?
- Is the no-op encryptor disabled in production? Can it be enabled accidentally?
- Are nonces generated with cryptographically secure randomness?
- What happens if the encryptor receives a ciphertext encrypted with an unknown key version?
- Can an attacker trigger a downgrade to the no-op encryptor?
- Is the encryption key itself stored securely (not in environment variables or config files)?

**Notes/Oracles:**
- AES-GCM with 256-bit keys and 96-bit random nonces is the expected standard
- The no-op encryptor MUST NOT be usable in production
- Key material should come from a KMS, not from environment variables
- NIST SP 800-38D provides test vectors for AES-GCM validation

---

## Charter 10: Notification Delivery Reliability and Injection

**Target Area:** notifications service
**Mission:** Explore notification delivery paths (Slack, webhook, email) for reliability, injection vulnerabilities, and edge cases.
**Time-Box:** 2 hours

**Setup/Preconditions:**
- Notification rules configured for Slack, webhook, and email channels
- Pipeline that can be triggered to completion/failure
- Webhook endpoint under test control (e.g., webhook.site)
- Access to notification service logs

**Key Heuristics:**
- Injection oracle: can pipeline names/branch names inject content into notifications?
- Delivery reliability: are notifications retried on failure?
- Filtering correctness: do notification rules filter correctly on branch, result, pipeline name?

**Risks Being Explored:**
- Can a branch name containing markdown/HTML inject content into Slack messages?
- Can a webhook URL be set to an internal service address (SSRF)?
- Are webhook secrets (HMAC signatures) generated correctly?
- What happens when the Slack API is rate-limited -- are notifications lost or queued?
- Can notification rules be crafted to match all pipelines in all organizations?
- Do email notifications properly escape HTML in pipeline/branch names?

**Notes/Oracles:**
- Webhook URLs must be validated against SSRF (no internal IPs, no localhost)
- Notification content must be escaped for the target channel format
- Failed notifications should be retried with backoff, not silently dropped

---

## Charter 11: Self-Hosted Agent Trust Boundaries

**Target Area:** self_hosted_hub + zebra (agent dispatching)
**Mission:** Explore the trust relationship between self-hosted agents and the platform, looking for impersonation, data exfiltration, or unauthorized access.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Self-hosted agent registered to a test organization
- Agent registration token/credentials
- Network capture capability
- Knowledge of agent-platform protocol (gRPC + AMQP)

**Key Heuristics:**
- Trust boundary: agents run on customer infrastructure but receive secrets from the platform
- Impersonation: can a rogue agent claim to be a different organization's agent?
- Data scope: does an agent only receive jobs and secrets for its own organization?

**Risks Being Explored:**
- Can an agent registration token from Org-Alpha be used to register an agent in Org-Beta?
- Can a self-hosted agent request jobs assigned to a different agent?
- What data is included in the agent sync protocol? Can it be used for reconnaissance?
- If an agent is compromised, what is the maximum blast radius?
- Are agent connections authenticated on every request, or only on initial registration?
- Can a deregistered agent continue to receive jobs?

**Notes/Oracles:**
- Agent tokens must be organization-scoped and non-transferable
- Every job dispatch must verify the agent belongs to the correct organization
- Agent cleanup workers should detect and remove stale agent registrations
- The protocol should use mutual TLS or equivalent for transport security

---

## Charter 12: Pipeline Concurrency, Queuing, and Resource Fairness

**Target Area:** zebra (scheduler) + plumber
**Mission:** Stress-test the job scheduling system to find unfairness, starvation, deadlocks, or priority inversion under high concurrent load.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Multiple organizations with different plan levels (free, startup, enterprise)
- Ability to submit many pipelines simultaneously (50+ per org)
- Monitoring of scheduler metrics (queue depth, wait times, dispatch rates)
- Understanding of the scheduling algorithm (selector, org-based fairness)

**Key Heuristics:**
- Fairness oracle: all organizations should make progress, even under contention
- Starvation detection: no organization should wait indefinitely
- Priority inversion: high-priority jobs should not be blocked by low-priority jobs

**Risks Being Explored:**
- Can a single organization with many pipelines starve other organizations?
- What happens when the job queue exceeds 10,000 entries?
- Does the scheduler correctly respect organization machine quotas?
- What is the maximum scheduling latency under peak load?
- Are there deadlock conditions when multiple organizations hit quota limits simultaneously?
- Does the `waiting_job_terminator` correctly handle jobs that have been waiting too long?

**Notes/Oracles:**
- Scheduling should be O(n log n) or better for n queued jobs
- Organization fairness should be weighted by plan level
- Jobs waiting beyond timeout should be terminated with clear error messages
- No organization should experience >5 minute scheduling latency under normal load

---

## Charter 13: Gofer Deployment Triggers and Promotion Safety

**Target Area:** ee/gofer (deployment targets, switches, triggers)
**Mission:** Explore the deployment promotion system for safety gaps, unauthorized promotions, and cascading failures.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- EE environment with gofer enabled
- Deployment targets configured (staging, production)
- Pipelines with promotion rules
- Multiple users with different RBAC permissions

**Key Heuristics:**
- Safety gate heuristic: promotions to production should require explicit approval
- Cascade analysis: what triggers when a promotion fires?
- RBAC boundary: can a developer promote to production without approval?

**Risks Being Explored:**
- Can auto-promote rules be configured to bypass manual approval for production?
- Can a user with project-level permissions promote to an org-level deployment target?
- What happens when a promotion triggers another promotion in a chain?
- Are deployment trigger conditions evaluated atomically or can they race?
- Can a switch/target be modified while a promotion is in progress?
- Does gofer properly integrate with RBAC for promotion permissions?

**Notes/Oracles:**
- Production promotions should always require at least one approval in the audit trail
- Promotion chains should have a maximum depth to prevent infinite loops
- All promotion events should be recorded in the audit service
- Gofer should validate that the source pipeline completed successfully before promoting

---

## Charter 14: Audit Trail Completeness and Tamper Resistance

**Target Area:** ee/audit + guard + all admin operations
**Mission:** Verify that all security-relevant actions are captured in the audit trail and that audit records cannot be modified or deleted by users.
**Time-Box:** 2 hours

**Setup/Preconditions:**
- EE environment with audit service enabled
- Admin user performing various operations
- Access to audit logs/database
- List of operations that should be audited (from compliance requirements)

**Key Heuristics:**
- Completeness oracle: every admin action should produce an audit record
- Immutability oracle: audit records should not be modifiable
- Attribution oracle: every audit record should identify who performed the action

**Risks Being Explored:**
- Are failed authentication attempts logged?
- Are RBAC permission changes logged with before/after states?
- Are secret access events (read, create, delete) logged?
- Can an admin delete their own audit records?
- Are audit records created synchronously or asynchronously (risk of loss)?
- Do audit records include the source IP address and user agent?
- Is there a gap where actions succeed but audit recording fails?

**Notes/Oracles:**
- SOC 2 Type II requires comprehensive, immutable audit trails
- Audit writes should be synchronous with the action (or at minimum guaranteed delivery via AMQP)
- The audit database should be append-only with no DELETE or UPDATE permissions for application users
- Compare actual audit records against a checklist of auditable events

---

## Charter 15: Front Service Cross-Site Scripting and Session Management

**Target Area:** front (Elixir/Phoenix web application)
**Mission:** Explore the web frontend for XSS vulnerabilities, CSRF protection, and session management weaknesses.
**Time-Box:** 3 hours

**Setup/Preconditions:**
- Staging front instance accessible via browser
- Multiple user accounts
- Browser developer tools + XSS payload library
- Knowledge of Phoenix framework security defaults

**Key Heuristics:**
- Reflected XSS: inputs that appear in responses (search, error messages, project names)
- Stored XSS: persistent inputs that render for other users (project descriptions, org names, pipeline YAML display)
- CSRF: state-changing operations should require CSRF tokens
- Session: cookies should have Secure, HttpOnly, SameSite attributes

**Risks Being Explored:**
- Can a project name containing `<script>` execute in another user's browser?
- Can pipeline YAML with malicious content render as HTML in the UI?
- Are all forms protected with CSRF tokens (Phoenix's `protect_from_forgery`)?
- Can session cookies be accessed via JavaScript (missing HttpOnly)?
- Is the `X-Semaphore-*` header filtering (`refuse_x_semaphore_headers.ex`) complete?
- Can an attacker craft a URL that pre-fills a form to trick an admin?

**Notes/Oracles:**
- Phoenix templates auto-escape by default, but raw HTML rendering bypasses this
- OWASP XSS Prevention Cheat Sheet is the primary reference
- All cookies must have Secure + HttpOnly + SameSite=Lax at minimum
- Content-Security-Policy headers should restrict inline scripts

---

# Appendices

## Appendix A: Service Inventory Summary

| # | Service | Language | Path | Test Files | Current Role |
|---|---------|----------|------|------------|-------------|
| 1 | auth | Elixir | auth/ | 5 | Authentication proxy |
| 2 | guard | Elixir | guard/ | 37 | User/org management, session |
| 3 | secrethub | Elixir | secrethub/ | 24 | Secrets storage + OIDC |
| 4 | encryptor | Go | encryptor/ | 4 | AES-GCM encryption service |
| 5 | plumber (ppl) | Elixir | plumber/ppl/ | 89 | Pipeline engine |
| 6 | plumber (spec) | Elixir | plumber/spec/ | varies | Pipeline spec validation |
| 7 | plumber (block) | Elixir | plumber/block/ | varies | Block execution |
| 8 | plumber (looper) | Elixir | plumber/looper/ | varies | Pipeline loop/retry logic |
| 9 | plumber (gofer_client) | Elixir | plumber/gofer_client/ | varies | Deployment client |
| 10 | zebra | Elixir | zebra/ | 50 | Job scheduling and dispatch |
| 11 | hooks_receiver | Elixir | hooks_receiver/ | 5 | Webhook HTTP endpoint |
| 12 | hooks_processor | Elixir | hooks_processor/ | 20 | Webhook business logic |
| 13 | github_hooks | Ruby | github_hooks/ | 55 | GitHub-specific webhook handling |
| 14 | front | Elixir | front/ | 181 | Web UI backend |
| 15 | public-api-gateway | Go | public-api-gateway/ | 2 | External API gateway |
| 16 | public-api v2 | Elixir | public-api/v2/ | 59 | Public API v2 logic |
| 17 | public-api v1alpha | Elixir | public-api/v1alpha/ | 60 | Public API v1alpha logic |
| 18 | projecthub | Elixir | projecthub/ | 21 | Project management |
| 19 | projecthub-rest-api | Elixir | projecthub-rest-api/ | varies | Project REST API |
| 20 | repohub | Go | repohub/ | 8 | Repository proxy |
| 21 | repository_hub | Elixir | repository_hub/ | 64 | Repository integration |
| 22 | notifications | Elixir | notifications/ | 21 | Slack/webhook/email notifications |
| 23 | self_hosted_hub | Go | self_hosted_hub/ | 18 | Self-hosted agent management |
| 24 | loghub2 | Go | loghub2/ | 12 | Log aggregation |
| 25 | artifacthub | Go | artifacthub/ | 16 | Artifact storage |
| 26 | rbac (CE) | Elixir | rbac/ce/ | 8 | Community RBAC |
| 27 | rbac (EE) | Elixir | ee/rbac/ | 39 | Enterprise RBAC |
| 28 | gofer | Elixir | ee/gofer/ | 51 | Deployment/promotion engine |
| 29 | audit | Elixir | ee/audit/ | 8 | Audit trail |
| 30 | velocity | Go | ee/velocity/ | 31 | CI analytics/insights |
| 31 | pre_flight_checks | Elixir | ee/pre_flight_checks/ | 8 | Deployment gates |
| 32 | badge | Elixir | badge/ | 8 | Status badges |
| 33 | dashboardhub | Elixir | dashboardhub/ | 2 | Dashboard management |
| 34 | branch_hub | Elixir | branch_hub/ | 3 | Branch tracking |
| 35 | scouter | Elixir | scouter/ | 2 | Monitoring/scouting |
| 36 | feature_provider | Elixir | feature_provider/ | 9 | Feature flag service |
| 37 | github_notifier | Elixir | github_notifier/ | 10 | GitHub status updates |
| 38 | mcp_server | Go | mcp_server/ | 21 | MCP protocol server |
| 39 | bootstrapper | Go | bootstrapper/ | 6 | Environment bootstrapping |
| 40 | periodic_scheduler | Elixir | periodic_scheduler/ | varies | Cron-like scheduling |
| 41 | statsd | JS | statsd/ | varies | Metrics collection |
| 42 | docs | JS | docs/ | varies | Documentation site |
| 43 | e2e | Elixir | e2e/ | 8 | End-to-end test suite |

## Appendix B: Communication Protocol Summary

| Protocol | Usage | Services |
|----------|-------|----------|
| gRPC (Protobuf) | Primary inter-service RPC | All Elixir and Go services |
| RabbitMQ (AMQP) | Event-driven communication | zebra, plumber, guard, self_hosted_hub |
| HTTP/REST | External API + webhooks | public-api-gateway, hooks_receiver, front, github_hooks |
| PostgreSQL | Primary data store | All stateful services |

## Appendix C: Risk Heat Map

```
                    Low Change Velocity    High Change Velocity
                    |                      |
High Blast Radius   | encryptor            | guard, auth, plumber
                    | secrethub            | zebra, hooks chain
                    |                      | public-api-gateway
                    |                      | rbac (CE+EE)
                    |----------------------|---------------------
Low Blast Radius    | badge, scouter       | front (UI changes)
                    | dashboardhub         | github_hooks
                    | bootstrapper         | notifications
                    | statsd               | mcp_server
```

## Appendix D: Test Coverage Gaps (Identified)

| Service | Current Test Files | Gap Assessment |
|---------|-------------------|----------------|
| auth | 5 | CRITICAL: Only 5 test files for the authentication service |
| hooks_receiver | 5 | HIGH: Webhook entry point has minimal tests |
| public-api-gateway | 2 | HIGH: External API gateway has only 2 test files |
| dashboardhub | 2 | LOW: Non-critical service, but below minimum |
| scouter | 2 | LOW: Monitoring service, minimal risk |
| branch_hub | 3 | LOW: Simple CRUD, low risk |
| encryptor | 4 | MEDIUM: Crypto service needs more test vectors |
| bootstrapper | 6 | MEDIUM: Infrastructure bootstrapping needs edge case coverage |

---

**Document End**

*This document should be reviewed and updated quarterly, or whenever significant architectural changes occur. All test coverage numbers should be validated against actual CI reports.*
