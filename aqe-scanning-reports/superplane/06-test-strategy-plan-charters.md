# Superplane: Test Strategy, Test Plan, and Exploratory Testing Charters

**Project**: Superplane -- Open-source DevOps control plane
**Architecture**: Go monolith (pkg/) + React frontend (web_src/) + PostgreSQL + RabbitMQ
**Stage**: Alpha
**Date**: 2026-03-06
**Prepared by**: QE Test Architect (Agentic QE v3)

---

## Table of Contents

1. [Test Strategy (Strategic Level)](#1-test-strategy-strategic-level)
2. [Test Plan (Tactical Level)](#2-test-plan-tactical-level)
3. [Exploratory Testing Charters](#3-exploratory-testing-charters)

---

## 1. Test Strategy (Strategic Level)

### 1.1 Testing Principles

1. **Risk-driven prioritization**: Testing effort is allocated proportionally to component risk and blast radius. Authentication, authorization, crypto, workflow execution, and trigger handling receive the highest investment.

2. **Shift-left with feedback loops**: Bugs caught at the unit level cost orders of magnitude less than those found in production. The test pyramid is strictly enforced, with unit tests forming the foundation.

3. **Contract-first for integrations**: With 40+ third-party integrations (AWS, GitHub, Slack, PagerDuty, etc.), each integration is tested against its contract (request/response shapes), not against live external services in CI.

4. **Determinism over speed**: Flaky tests are treated as bugs. All tests must be deterministic. Time-dependent logic (schedules, time gates) uses injectable clocks. Database tests use transactions with rollback.

5. **Production parity in E2E**: End-to-end tests run against the full Docker Compose stack (app + PostgreSQL + RabbitMQ) with Playwright for browser automation, matching the production topology.

6. **Defense in depth for security**: Crypto, secrets management, JWT, OIDC, and RBAC each have dedicated test suites with negative testing (invalid tokens, expired sessions, privilege escalation attempts).

### 1.2 Risk Assessment

| Package/Area | Risk Level | Rationale |
|---|---|---|
| `pkg/crypto` (AES-GCM, HMAC, SHA256, passwords) | **Critical** | Data-at-rest encryption. Subtle bugs leak secrets silently. |
| `pkg/authentication` + `pkg/jwt` + `pkg/oidc` | **Critical** | Session management, token validation. Bypass = full compromise. |
| `pkg/authorization` (Casbin RBAC) | **Critical** | 3 roles (owner/admin/viewer), 12+ resource types. Policy misconfig = data leak. |
| `pkg/secrets` (local provider, encryption) | **Critical** | Secret storage/retrieval. Plaintext leak = credential exposure. |
| `pkg/workers` (node executor, queue, event distributer) | **High** | Core execution engine. Failures cause silent workflow breakage or data loss. |
| `pkg/core` (Component/Trigger interfaces) | **High** | Foundation contracts. Breaking changes cascade to all integrations. |
| `pkg/triggers` (webhook, schedule, start) | **High** | Entry points for all workflows. Missed triggers = missed events. |
| `pkg/integrations` (40+ providers) | **High** | Largest surface area (273 test files). Each integration has unique failure modes. |
| `pkg/grpc` (gRPC actions) | **Medium-High** | API layer. Input validation gaps expose backend vulnerabilities. |
| `pkg/models` + `pkg/database` | **Medium** | Data integrity. ORM misuse causes subtle corruption. |
| `pkg/components` (filter, merge, if, wait, approval, etc.) | **Medium** | DAG node logic. Errors cause incorrect workflow routing. |
| `web_src/` (React frontend) | **Medium** | User-facing. Only 1 test file currently -- major gap. |
| `pkg/cli` | **Low-Medium** | Developer tooling. Bugs are annoying but not security-critical. |
| `pkg/templates`, `pkg/widgets` | **Low** | Display/configuration. Low blast radius. |

### 1.3 Test Pyramid

Given Superplane's architecture (Go monolith with clear package boundaries, React SPA, Docker Compose for services), the test pyramid is:

```
                    /\
                   /  \        E2E (Playwright)
                  / 5% \       Full-stack browser tests
                 /------\
                / 15%    \     Integration Tests
               / Component \   DB, RabbitMQ, gRPC, cross-package
              /-----------  \
             /    80%        \   Unit Tests
            /  Package-level  \  Per-function, mocked dependencies
           /___________________\
```

**Rationale for 80/15/5 split (not standard 70/20/10)**:

- The Go monolith has well-defined package boundaries that make unit testing highly effective.
- Integration tests require Docker (PostgreSQL + RabbitMQ), making them slower to run.
- E2E tests use Playwright with a full Docker Compose stack -- expensive but essential for 5-10 critical user journeys.
- The frontend currently has only 1 test file, so the 5% E2E allocation doubles as frontend coverage until the React test suite matures.

### 1.4 Quality Gates and Exit Criteria

#### Gate 1: Pre-Commit (Local)
- All changed package unit tests pass (`go test ./pkg/changed-package/...`)
- `revive` linter passes
- No new lint warnings in changed files

#### Gate 2: Pull Request (CI)
- Full unit test suite passes (`go test ./pkg/...`)
- Code coverage does not decrease (currently unmeasured -- establishing baseline is Phase 1 priority)
- No new security vulnerabilities (gosec scan)
- Frontend lint passes (`npm run lint` in web_src/)
- Frontend tests pass (`npm run test:run` in web_src/)

#### Gate 3: Pre-Release
- All unit + integration tests pass
- E2E test suite passes (all Playwright tests green)
- No Critical or High severity bugs open
- Security-sensitive packages (crypto, auth, jwt, oidc, secrets, authorization) have >= 85% line coverage
- Consumer contract tests pass (`test/consumer/`)

#### Gate 4: Release Candidate
- Exploratory testing charters completed for the release scope
- Performance benchmarks within acceptable thresholds
- RBAC policy manually reviewed against role matrix

#### Exit Criteria for Alpha-to-Beta Transition
- Unit test coverage >= 70% overall, >= 85% for critical packages
- All 15 E2E scenarios (Section 2.5) passing
- Frontend component test coverage >= 50%
- Zero known authentication/authorization bypass bugs
- All integration tests for Tier 1 integrations (GitHub, Slack, AWS) passing

### 1.5 Environment Strategy

| Environment | Purpose | Stack | Data |
|---|---|---|---|
| **Local Dev** | Unit tests, fast feedback | Go test runner, mocks | In-memory / test fixtures |
| **CI (Docker Compose)** | Integration + E2E | PostgreSQL + RabbitMQ + App | Migrated test DB, seeded fixtures |
| **Staging** | Pre-release validation | Full Kubernetes deployment | Anonymized production-like data |
| **Production** | Smoke tests, monitoring | Production cluster | Real data (read-only tests) |

**Test Database Strategy**:
- Unit tests: No database. All DB calls mocked via interfaces.
- Integration tests: `superplane_test` database, created via `make test.setup`. Each test uses a transaction with rollback.
- E2E tests: Same `superplane_test` database with full migrations. Test data created via gRPC API calls (not direct DB inserts) to validate the full stack.

### 1.6 Tooling

| Category | Tool | Purpose |
|---|---|---|
| **Go Unit Testing** | `go test` + `gotestsum` | Test execution, JUnit reporting |
| **Go Assertions** | `testify` (require/assert) | Already adopted project-wide |
| **Go Mocking** | `testify/mock` or `mockery` | Interface mocking for unit isolation |
| **Go Coverage** | `go test -coverprofile` | Line and branch coverage reporting |
| **Go Linting** | `revive` | Static analysis (already configured via `lint.toml`) |
| **Go Security** | `gosec`, `govulncheck` | SAST scanning |
| **Browser E2E** | Playwright (Go bindings) | Full-stack E2E via `playwright-go` |
| **Frontend Unit** | Vitest | Already configured in web_src/ |
| **Frontend Component** | React Testing Library | Component rendering + interaction |
| **Frontend E2E** | Playwright (or shared Go E2E) | Critical UI flows |
| **Contract Testing** | Consumer tests (`test/consumer/`) | API contract validation |
| **CI Orchestration** | Semaphore CI (`.semaphore/`) | Pipeline execution |
| **Test Reporting** | JUnit XML | `junit-report.xml` output from gotestsum |
| **RBAC Policy Testing** | Casbin policy unit tests | Policy file validation |

### 1.7 Non-Functional Testing

#### Performance Testing
- **Execution engine throughput**: Benchmark `NodeExecutor` with 100/500/1000 concurrent node executions. The semaphore is set to 25 -- verify behavior at and beyond that limit.
- **Event distribution latency**: Measure time from event creation to worker pickup via RabbitMQ.
- **gRPC API response time**: P50/P95/P99 for canvas CRUD, trigger management, and execution queries.
- **Database query performance**: Identify N+1 queries in GORM usage. Profile `ListPendingNodeExecutions` under load.
- **Canvas rendering**: Frontend performance with 50/100/200 node canvases (React Flow rendering budget).

#### Security Testing
- **SAST**: `gosec` on all Go code, `eslint-plugin-security` on frontend.
- **Dependency scanning**: `govulncheck` for Go, `npm audit` for frontend.
- **Authentication testing**: Token expiry, refresh flow, OIDC provider misconfiguration, JWT signature verification with wrong keys.
- **Authorization testing**: RBAC boundary testing for all 3 roles x 12 resource types x 4 operations = 144 permission checks.
- **Secrets management**: Verify AES-GCM encryption round-trip, ensure no plaintext secrets in logs/responses/database.
- **Webhook security**: HMAC signature verification for GitHub, Slack, and other webhook providers.
- **Input validation**: gRPC field validation, SQL injection via GORM, XSS in frontend inputs.

#### Accessibility Testing
- **WCAG 2.1 AA compliance**: Canvas page, login/signup flow, organization settings.
- **Keyboard navigation**: Canvas node selection, sidebar interactions, modal dialogs.
- **Screen reader**: ARIA labels on Radix UI components, canvas node announcements.
- **Color contrast**: Dark theme elements, status indicators (pass/fail/pending).

---

## 2. Test Plan (Tactical Level)

### 2.1 Scope Definition

**In Scope**:
- All Go packages under `pkg/` (28 top-level packages)
- React frontend under `web_src/src/` (components, pages, stores, hooks, UI)
- E2E user journeys (test/e2e/)
- Consumer contract tests (test/consumer/)
- CLI commands (`pkg/cli/`)
- gRPC API actions (`pkg/grpc/actions/`)
- Database migrations (`db/migrations/`)
- RBAC policy files (`rbac/`)

**Out of Scope (Alpha)**:
- Load/stress testing at scale (deferred to Beta)
- Third-party SaaS availability testing (external dependency)
- Mobile/responsive testing (desktop-first for Alpha)
- Helm chart deployment testing (`release/superplane-helm-chart/`)
- OpenTelemetry collector configuration testing

### 2.2 Test Types by Package with Priorities

#### Priority 1 -- Critical (Must have for every release)

| Package | Unit Tests | Integration Tests | Notes |
|---|---|---|---|
| `pkg/crypto` | AES-GCM encrypt/decrypt round-trip, HMAC verification, SHA256 hashing, password hashing/comparison, random generation | N/A (pure functions) | Existing: 3 test files. **Gap**: No test for `password.go`, `random.go`, `no_op_encryptor.go`, `encryptor.go` interface compliance. |
| `pkg/authentication` | Token extraction, context propagation, session validation | Login flow with DB | Existing: 1 test file. Needs negative tests (expired tokens, malformed headers). |
| `pkg/authorization` | Casbin policy evaluation for all role/resource/action combos | Policy loading from CSV files | Existing: 1 test file. **Gap**: Need exhaustive matrix test (144 combinations). |
| `pkg/jwt` | Token generation, validation, expiry, claims extraction | N/A | No test files found. **Critical gap**. |
| `pkg/oidc` | Provider configuration, key validation, token exchange | Mock OIDC provider | Existing: 1 test file. |
| `pkg/secrets` | Provider interface, local provider encrypt/store/retrieve | DB integration | No test files found. **Critical gap**. |
| `pkg/workers` | NodeExecutor logic, queue processing, event distribution | Full stack with DB + RabbitMQ | Existing: 13 test files. Good coverage. **Gap**: Concurrency edge cases, semaphore exhaustion. |

#### Priority 2 -- High (Required for feature completeness)

| Package | Unit Tests | Integration Tests | Notes |
|---|---|---|---|
| `pkg/core` | Component/Trigger interface contracts | N/A (interfaces) | No test files. Test via integration implementations. |
| `pkg/triggers/webhook` | Webhook parsing, signature verification, payload extraction | HTTP handler test | Existing: 1 test file. |
| `pkg/triggers/schedule` | Cron expression parsing, next-run calculation | Scheduler with mock clock | Existing: 1 test file. |
| `pkg/integrations/github` | Webhook handling, issue/PR/release operations | Mock GitHub API | Existing: many test files. Well covered. |
| `pkg/integrations/slack` | Message sending, button click handling, app mention | Mock Slack API | Existing: several test files. |
| `pkg/integrations/aws/*` | Each AWS service action | Mock AWS SDK | Existing: many test files. |
| `pkg/grpc/actions/*` | Request validation, response mapping | gRPC server test | Existing: 48 test files. |
| `pkg/components/*` | Each component type (filter, merge, if, wait, approval, etc.) | N/A | Existing: 13 test files. |
| `pkg/models` | Validation, state transitions, KVS operations | DB round-trip | Existing: 2 test files. **Gap**: Most models untested. |

#### Priority 3 -- Medium (Important for quality)

| Package | Unit Tests | Integration Tests | Notes |
|---|---|---|---|
| `pkg/database` | Connection management, migration runner | PostgreSQL container | No test files. |
| `pkg/registry` | Component/trigger registration, lookup | N/A | Existing: 6 test files. |
| `pkg/cli` | Command parsing, output formatting | CLI execution | Existing: 1 test file. |
| `pkg/configuration` | Field validation, type coercion | N/A | Existing: 1 test file. |
| `pkg/services` | Service layer orchestration | DB | Existing: 1 test file. |
| `web_src/` (React) | Component rendering, store logic, hooks | N/A | **Existing: 1 test file. Major gap.** |

#### Priority 4 -- Low (Nice to have)

| Package | Unit Tests | Notes |
|---|---|---|
| `pkg/templates` | Template rendering, validation | No test files. |
| `pkg/widgets` | Widget annotation logic | No test files. |
| `pkg/telemetry` | Metric recording | Existing: 1 test file. |
| `pkg/logging` | Log formatting | No test files. Trivial. |
| `pkg/utils` | Utility functions | Existing: 1 test file. |
| `pkg/public` | Middleware, websocket | Existing: 3 test files. |
| `pkg/retry` | Retry logic | No test files. |

### 2.3 Regression Testing Approach

**Trigger**: Every pull request and every merge to main.

**Scope Tiers**:

| Tier | When | What | Duration Target |
|---|---|---|---|
| Smoke | Every PR | Critical path unit tests (auth, crypto, workers, triggers) | < 2 min |
| Standard | Every PR | Full `go test ./pkg/...` | < 10 min |
| Full | Merge to main | Standard + E2E + Consumer contracts | < 30 min |
| Extended | Weekly / Pre-release | Full + Security scans + Performance benchmarks | < 60 min |

**Flaky Test Protocol**:
1. Any test that fails intermittently is immediately quarantined with `t.Skip("FLAKY: <issue-url>")`.
2. Flaky tests are tracked in a dedicated issue label.
3. Flaky tests must be fixed or deleted within 2 sprints.
4. E2E tests already use `--rerun-fails=3` (visible in Makefile) -- this is acceptable for E2E but not for unit/integration tests.

### 2.4 Integration Test Matrix

This matrix identifies which packages interact and require integration testing:

```
                 DB    RabbitMQ  gRPC   Crypto  Registry  Models  Auth   AuthZ
workers          X     X                X       X         X
grpc/actions     X                X                       X       X      X
authentication   X                             		       X
authorization    X                                        X              X
triggers         X     X                                  X
integrations     X     X                X       X         X
secrets          X                      X                 X
services         X     X                                  X       X      X
public/web       X                X                       X       X      X
```

**Key Integration Test Scenarios**:

1. **Worker-to-Database**: `NodeExecutor` locks and processes executions via `SELECT FOR UPDATE`. Test concurrent lock acquisition.
2. **Worker-to-RabbitMQ**: Event distributer publishes, consumers process. Test message acknowledgment and retry.
3. **gRPC-to-Authorization**: Every gRPC action checks RBAC. Test that the interceptor correctly denies unauthorized requests.
4. **Trigger-to-Worker**: Webhook trigger creates event, event distributer picks up, node executor runs. Test the full chain.
5. **Integration-to-Crypto**: Integrations decrypt stored credentials before making API calls. Test encryption round-trip through the integration layer.
6. **Authentication-to-JWT-to-OIDC**: Login flow generates JWT, subsequent requests validate JWT, OIDC refresh flow. Test the complete auth chain.

### 2.5 E2E Scenarios for Critical User Journeys

Based on analysis of existing E2E tests (`test/e2e/`) and the frontend structure:

| # | Scenario | Priority | Steps | Assertions |
|---|---|---|---|---|
| 1 | **Owner Setup** | P1 | First user signs up, creates organization | Organization exists, user has owner role |
| 2 | **Login (Password)** | P1 | Navigate to login, enter credentials, submit | Redirected to home, session cookie set |
| 3 | **Login (OIDC)** | P1 | Click OIDC provider, complete OAuth flow | Redirected to home, JWT issued |
| 4 | **Create Canvas** | P1 | Navigate to home, click create, enter name/description | Canvas appears in list, DB record exists |
| 5 | **Add Nodes to Canvas** | P1 | Open canvas, add trigger + component nodes from sidebar | Nodes visible on canvas, connected in DAG |
| 6 | **Configure Trigger (Webhook)** | P1 | Select webhook trigger, configure URL, save | Webhook URL generated, trigger active |
| 7 | **Execute Workflow** | P1 | Send webhook event, observe execution start | Execution created, nodes process in order, execution completes |
| 8 | **View Execution Results** | P1 | Navigate to execution detail page | Node outputs visible, timing shown, status correct |
| 9 | **Manage Secrets** | P1 | Create secret, use in component config, execute | Secret decrypted at runtime, not visible in logs/UI |
| 10 | **RBAC -- Viewer Denied** | P2 | Login as viewer, attempt canvas create/delete | Operations rejected, UI elements hidden |
| 11 | **Approval Gate** | P2 | Configure approval component, trigger execution, approve | Execution pauses at approval, resumes after approval |
| 12 | **Time Gate** | P2 | Configure time gate, trigger execution | Execution pauses until time window opens |
| 13 | **Wait/Queue Behavior** | P2 | Configure wait node, send multiple events | Items queued, processed in order, sidebar shows queue |
| 14 | **Organization Invitations** | P2 | Owner invites member by email, member accepts | New member has assigned role, sees org resources |
| 15 | **Service Account API Access** | P2 | Create service account, use API token for gRPC calls | API calls succeed with correct permissions |

### 2.6 Service-Level Test Plans for Top 5 Critical Packages

#### 2.6.1 `pkg/crypto` -- Cryptographic Operations

**Current State**: 3 test files (`aes_gcm_encryptor_test.go`, `hmac_test.go`, `sha256_test.go`).
**Gap**: No tests for `password.go`, `random.go`, `no_op_encryptor.go`, `encryptor.go`.

**Test Plan**:

| Test Case | Type | Priority | Description |
|---|---|---|---|
| AES-GCM round-trip | Unit | P1 | Encrypt then decrypt returns original plaintext |
| AES-GCM wrong key | Unit | P1 | Decrypt with wrong key returns error, not garbage |
| AES-GCM empty plaintext | Unit | P1 | Encrypt/decrypt empty string |
| AES-GCM large payload | Unit | P2 | Encrypt/decrypt 10MB payload |
| HMAC sign/verify | Unit | P1 | Generate HMAC, verify with correct key |
| HMAC wrong key | Unit | P1 | Verify with wrong key returns false |
| HMAC empty message | Unit | P2 | HMAC of empty message |
| SHA256 known vectors | Unit | P1 | Compare against NIST test vectors |
| Password hash/compare | Unit | P1 | Hash password, compare succeeds with correct input |
| Password compare wrong | Unit | P1 | Compare fails with wrong password |
| Password timing safety | Unit | P2 | Verify constant-time comparison (no timing leak) |
| Random token length | Unit | P1 | Generated token has expected length |
| Random token uniqueness | Unit | P2 | 1000 generated tokens are all unique |
| NoOpEncryptor passthrough | Unit | P2 | NoOp returns plaintext unchanged |
| Encryptor interface compliance | Unit | P2 | Both AES-GCM and NoOp satisfy Encryptor interface |

**Coverage Target**: >= 95%

#### 2.6.2 `pkg/authentication` + `pkg/jwt` + `pkg/oidc` -- Authentication Chain

**Current State**: `authentication` has 1 test file, `jwt` has 0, `oidc` has 1.
**Gap**: JWT package is entirely untested. Authentication has limited negative tests.

**Test Plan**:

| Test Case | Type | Priority | Description |
|---|---|---|---|
| JWT generate valid token | Unit | P1 | Generate token with claims, verify structure |
| JWT validate valid token | Unit | P1 | Validate token returns correct claims |
| JWT expired token | Unit | P1 | Expired token returns specific error |
| JWT wrong signing key | Unit | P1 | Token signed with wrong key fails validation |
| JWT malformed token | Unit | P1 | Random string, missing segments, base64 errors |
| JWT claims extraction | Unit | P1 | Extract user ID, org ID, role from claims |
| Auth context propagation | Unit | P1 | User info correctly set in request context |
| Auth missing token | Unit | P1 | Request without token returns 401 |
| Auth invalid token | Unit | P1 | Request with invalid token returns 401 |
| OIDC provider config | Unit | P1 | Valid OIDC discovery document parsed correctly |
| OIDC key rotation | Unit | P2 | Token validated after key rotation |
| OIDC token exchange | Integration | P1 | Authorization code exchanged for tokens |
| Auth-to-JWT integration | Integration | P1 | Login creates JWT, middleware validates it |
| Session expiry | Integration | P2 | Expired session rejected, refresh flow works |

**Coverage Target**: >= 90%

#### 2.6.3 `pkg/authorization` -- RBAC (Casbin)

**Current State**: 1 test file (`service_test.go`).
**Gap**: No exhaustive policy matrix test.

**Test Plan**:

| Test Case | Type | Priority | Description |
|---|---|---|---|
| Owner has all permissions | Unit | P1 | Owner can perform all operations on all resources |
| Admin inherits viewer | Unit | P1 | Admin can read all resources viewer can |
| Admin create/update/delete | Unit | P1 | Admin can create/update/delete canvases, members, groups, integrations, secrets, roles, blueprints, service accounts |
| Viewer read-only | Unit | P1 | Viewer can read org, roles, groups, members, canvases, blueprints, service accounts |
| Viewer cannot write | Unit | P1 | Viewer denied create/update/delete on all resources |
| Admin cannot delete org | Unit | P1 | Only owner can delete organization |
| Admin cannot update org | Unit | P1 | Only owner can update organization |
| Cross-org isolation | Unit | P1 | User in org A cannot access org B resources |
| Interceptor denies unauthorized | Integration | P1 | gRPC interceptor returns PermissionDenied for unauthorized calls |
| Interceptor allows authorized | Integration | P1 | gRPC interceptor allows authorized calls through |
| Policy file loading | Unit | P2 | CSV policy file parsed without errors |
| Role hierarchy | Unit | P2 | `g` rules correctly establish role inheritance |
| Unknown role denied | Unit | P2 | Non-existent role has no permissions |

**Coverage Target**: >= 95% (security-critical)

#### 2.6.4 `pkg/workers` -- Execution Engine

**Current State**: 13 test files. Relatively well covered.
**Gap**: Concurrency edge cases, error recovery, semaphore behavior.

**Test Plan**:

| Test Case | Type | Priority | Description |
|---|---|---|---|
| NodeExecutor processes pending | Unit | P1 | Pending executions found and processed |
| NodeExecutor lock contention | Integration | P1 | Two executors competing for same execution -- only one succeeds |
| NodeExecutor semaphore limit | Unit | P1 | 26th concurrent execution waits for semaphore (limit=25) |
| NodeQueueWorker ordering | Unit | P1 | Queued items processed in FIFO order |
| NodeQueueWorker retry on failure | Unit | P1 | Failed node re-queued with backoff |
| EventDistributer routing | Unit | P1 | Event routed to correct canvas and nodes |
| EventDistributer fan-out | Unit | P2 | Single event triggers multiple downstream nodes |
| WebhookProvisioner lifecycle | Unit | P1 | Webhook created, cleaned up on deletion |
| IntegrationRequestWorker timeout | Unit | P1 | Long-running integration request times out gracefully |
| NotificationEmailConsumer delivery | Unit | P2 | Email sent on execution events |
| InvitationEmailConsumer delivery | Unit | P2 | Invitation email sent correctly |
| Worker context cancellation | Unit | P1 | Workers shut down cleanly on context cancellation |
| Dead letter handling | Integration | P2 | Messages that fail repeatedly go to dead letter queue |

**Coverage Target**: >= 85%

#### 2.6.5 `pkg/integrations` -- Third-Party Integrations

**Current State**: 273 test files across 40+ providers. Best-covered area.
**Gap**: Consistency of error handling, timeout behavior, credential refresh.

**Test Plan (per integration pattern)**:

| Test Case | Type | Priority | Description |
|---|---|---|---|
| Action executes successfully | Unit | P1 | Happy path with mocked external API |
| Action handles HTTP 4xx | Unit | P1 | Client error returns descriptive error |
| Action handles HTTP 5xx | Unit | P1 | Server error triggers retry or returns error |
| Action handles timeout | Unit | P1 | Network timeout returns timeout error |
| Webhook signature valid | Unit | P1 | Valid signature accepted |
| Webhook signature invalid | Unit | P1 | Invalid signature rejected with 401 |
| Webhook payload parsing | Unit | P1 | All expected fields extracted from payload |
| Webhook unexpected payload | Unit | P2 | Malformed payload returns 400, not panic |
| Credential decryption | Integration | P1 | Encrypted credentials decrypted before API call |
| Credential refresh | Integration | P2 | Expired credentials refreshed (where applicable) |
| Configuration validation | Unit | P1 | Required fields validated, clear error for missing |
| Rate limiting | Unit | P2 | 429 response triggers backoff |

**Tier 1 Integrations (must have full coverage)**: GitHub, Slack, AWS (SQS/SNS/Lambda), PagerDuty
**Tier 2 Integrations (high coverage)**: GitLab, Bitbucket, Jira, Datadog, CircleCI
**Tier 3 Integrations (basic coverage)**: All others

**Coverage Target**: >= 80% Tier 1, >= 70% Tier 2, >= 60% Tier 3

### 2.7 Frontend Test Plan

**Current State**: 1 test file in `web_src/test/`. Vitest configured but underutilized. Storybook configured.

**Priority Areas**:

| Area | Test Type | Count Estimate | Priority |
|---|---|---|---|
| Canvas page (React Flow) | Component + E2E | 15-20 | P1 |
| Authentication pages (login, signup) | Component | 8-10 | P1 |
| Organization settings | Component | 10-12 | P2 |
| Component sidebar (config forms) | Component | 12-15 | P2 |
| Stores (state management) | Unit | 10-15 | P2 |
| Hooks (custom React hooks) | Unit | 5-8 | P2 |
| UI primitives (Radix wrappers) | Storybook + snapshot | 20-30 | P3 |
| API client layer | Unit (mocked fetch) | 8-10 | P2 |

**Recommended Approach**:
1. Start with store and hook unit tests (pure logic, no rendering).
2. Add component tests for authentication and canvas pages using React Testing Library.
3. Expand Storybook coverage for visual regression (already partially set up).
4. Rely on Go Playwright E2E tests for full integration validation.

### 2.8 Estimated Effort and Phasing

#### Phase 1: Foundation (Weeks 1-3)

| Task | Effort | Output |
|---|---|---|
| Establish coverage baseline (`go test -coverprofile`) | 2d | Coverage report, CI integration |
| Write `pkg/jwt` unit tests (critical gap) | 3d | 10-15 tests |
| Write `pkg/secrets` unit tests (critical gap) | 2d | 8-10 tests |
| Expand `pkg/crypto` tests (password, random, no-op) | 2d | 10-12 tests |
| Exhaustive RBAC matrix test | 2d | 144+ permission checks |
| Set up frontend Vitest infrastructure | 1d | Test config, CI integration |

**Total Phase 1**: ~12 developer-days

#### Phase 2: Integration Layer (Weeks 4-6)

| Task | Effort | Output |
|---|---|---|
| Auth chain integration tests (auth + jwt + oidc) | 3d | 10-15 integration tests |
| Worker concurrency tests | 3d | 8-10 tests with race detector |
| gRPC authorization interceptor tests | 2d | 12-15 tests |
| Trigger-to-execution integration tests | 3d | 5-8 end-to-end chain tests |
| Frontend store/hook unit tests | 3d | 20-30 tests |

**Total Phase 2**: ~14 developer-days

#### Phase 3: E2E and Expansion (Weeks 7-10)

| Task | Effort | Output |
|---|---|---|
| Implement E2E scenarios 1-10 (Section 2.5) | 5d | 10 Playwright tests |
| Implement E2E scenarios 11-15 | 3d | 5 Playwright tests |
| Frontend component tests (canvas, auth pages) | 4d | 25-35 tests |
| Integration test suites for Tier 1 integrations | 3d | 20-30 tests |
| Security test suite (gosec CI, input validation) | 2d | CI pipeline, 10 security tests |

**Total Phase 3**: ~17 developer-days

#### Phase 4: Hardening (Weeks 11-12)

| Task | Effort | Output |
|---|---|---|
| Performance benchmarks for execution engine | 2d | Benchmark suite |
| Flaky test audit and fixes | 2d | Stability improvement |
| Coverage gap analysis and targeted tests | 3d | Fill remaining gaps |
| Exploratory testing execution (charters below) | 3d | Bug reports, charter findings |

**Total Phase 4**: ~10 developer-days

**Grand Total**: ~53 developer-days across 12 weeks

---

## 3. Exploratory Testing Charters

### Charter 1: Workflow Execution Under DAG Complexity

**Target Area**: `pkg/workers`, `pkg/components`, Canvas DAG engine
**Mission**: Explore how the execution engine handles complex DAG topologies -- deep chains, wide fan-outs, diamond merges, cycles (if possible), and disconnected nodes.
**Time-box**: 90 minutes

**Setup/Preconditions**:
- Running Docker Compose stack with all workers enabled
- Create canvases via gRPC API or UI
- Prepare canvas templates with 5, 10, 20, and 50 nodes

**Key Heuristics**:
- **Boundaries**: What is the maximum DAG depth? Maximum fan-out from a single node?
- **Consistency**: Does execution order match the DAG topology?
- **Completeness**: Are all nodes in a canvas executed, or can some be skipped?
- **Error handling**: What happens when a node in the middle of a chain fails?

**Risks Being Explored**:
- Executions hang on deeply nested DAGs (stack overflow or timeout)
- Fan-out creates race conditions in node executor (semaphore=25 limit)
- Merge/join nodes receive incomplete inputs from parallel branches
- Disconnected nodes are silently skipped or cause execution to never complete
- Cycle detection fails, causing infinite execution loops

---

### Charter 2: Trigger Reliability Under Rapid-Fire Events

**Target Area**: `pkg/triggers/webhook`, `pkg/workers/eventdistributer`
**Mission**: Determine how the system behaves when a webhook trigger receives a burst of events in rapid succession -- do all events get processed, in order, without loss?
**Time-box**: 60 minutes

**Setup/Preconditions**:
- Canvas with webhook trigger connected to a noop or wait node
- Script to send 50/100/500 webhook events in rapid succession (curl loop or hey/vegeta)
- Database access to verify execution records

**Key Heuristics**:
- **Reliability**: Are all events received and processed (zero loss)?
- **Ordering**: If events arrive in order, are executions created in order?
- **Throughput**: At what rate do events start being dropped or queued?
- **Recovery**: After a burst, does the system return to normal processing speed?

**Risks Being Explored**:
- RabbitMQ queue overflow causes event loss
- Event distributer crashes under load and fails to restart
- Duplicate executions created from a single event (at-least-once delivery)
- Database connection pool exhaustion during burst

---

### Charter 3: Authentication Boundary Exploration

**Target Area**: `pkg/authentication`, `pkg/jwt`, `pkg/oidc`
**Mission**: Probe the authentication system for edge cases around token handling, session management, and provider switching.
**Time-box**: 90 minutes

**Setup/Preconditions**:
- Running app with both password and OIDC authentication enabled
- Access to JWT secret and OIDC test keys (from `test/fixtures/oidc-keys`)
- HTTP client for crafting custom requests (curl, httpie, or Postman)

**Key Heuristics**:
- **Security**: Can expired/malformed/forged tokens gain access?
- **Boundaries**: What happens at token expiry boundary (1 second before/after)?
- **Interoperability**: Can a JWT from one org be used in another?
- **Goldilocks**: What token sizes/claim lengths cause issues?

**Risks Being Explored**:
- JWT validation does not check the `iss` (issuer) claim, allowing cross-org tokens
- OIDC key rotation window allows old keys to validate indefinitely
- Missing `exp` claim in JWT is treated as "never expires"
- Token with valid signature but tampered claims (e.g., elevated role) is accepted
- Concurrent login from multiple devices creates session conflicts

---

### Charter 4: RBAC Privilege Escalation Boundaries

**Target Area**: `pkg/authorization`, `rbac/rbac_org_policy.csv`, gRPC interceptor
**Mission**: Attempt to perform actions beyond the assigned role's permissions through direct API calls, bypassing UI restrictions.
**Time-box**: 75 minutes

**Setup/Preconditions**:
- Three user accounts: owner, admin, viewer in the same organization
- gRPC client (grpcurl or a Go test client) to make direct API calls
- The RBAC policy CSV loaded and understood

**Key Heuristics**:
- **Authorization boundaries**: Can a viewer create a canvas via direct gRPC call?
- **Role hierarchy**: Does admin truly inherit all viewer permissions?
- **Resource isolation**: Can a user in org A access org B resources by manipulating org ID in the request?
- **Implicit permissions**: Are there API endpoints missing authorization checks?

**Risks Being Explored**:
- gRPC actions that skip the authorization interceptor (missing middleware registration)
- RBAC policy allows unintended cross-role access via wildcard matching
- Organization ID in request body overrides the authenticated user's org context
- Service account tokens bypass RBAC entirely
- Role change not reflected until re-login (stale JWT claims)

---

### Charter 5: Secret Management Lifecycle

**Target Area**: `pkg/secrets`, `pkg/crypto`, `pkg/grpc/actions/secrets`
**Mission**: Explore the entire lifecycle of secrets -- creation, storage encryption, usage in components, rotation, and deletion -- looking for plaintext leaks.
**Time-box**: 60 minutes

**Setup/Preconditions**:
- Running stack with `ENCRYPTION_KEY` configured
- Database access to inspect raw secret values
- Log access to check for plaintext leaks

**Key Heuristics**:
- **Encryption at rest**: Is the secret value encrypted in the database (not plaintext)?
- **Encryption in transit**: Is the secret value masked in API responses?
- **Logging safety**: Does the secret value appear in application logs during execution?
- **Deletion completeness**: After deletion, is the secret truly removed (not soft-deleted with recoverable data)?

**Risks Being Explored**:
- Secrets stored in plaintext when NoOpEncryptor is accidentally used in production
- Secret values appear in execution output/logs when used in component configuration
- Changing the encryption key makes all existing secrets unreadable (no key rotation support)
- Deleted secrets remain in canvas node configurations, causing execution failures
- gRPC API returns decrypted secret values to unauthorized users

---

### Charter 6: Concurrent Execution Interference

**Target Area**: `pkg/workers/node_executor`, `pkg/workers/node_queue_worker`
**Mission**: Explore what happens when multiple executions of the same canvas run simultaneously -- do they interfere with each other's state, lock on shared resources, or produce incorrect results?
**Time-box**: 75 minutes

**Setup/Preconditions**:
- Canvas with a chain of 5 components (trigger -> filter -> http -> merge -> noop)
- Ability to trigger 10 simultaneous executions
- Database access to inspect execution state and node outputs

**Key Heuristics**:
- **Isolation**: Does execution A's output contaminate execution B's input?
- **Locking**: Do concurrent executions deadlock on database rows?
- **Ordering**: If components modify shared state (memory), is it correctly isolated per execution?
- **Resource fairness**: Does one long-running execution starve others?

**Risks Being Explored**:
- `SELECT FOR UPDATE` in NodeExecutor causes deadlocks under concurrent load
- Canvas memory (addmemory/readmemory/updatememory/deletememory components) is not execution-scoped
- Semaphore (25 slots) causes head-of-line blocking when one execution has many nodes
- Race condition in execution status update (two nodes finishing simultaneously)

---

### Charter 7: Integration Failure Handling and Recovery

**Target Area**: `pkg/integrations/*`, `pkg/workers/integration_request_worker`
**Mission**: Explore how integrations behave when external services are unavailable, return errors, or respond slowly.
**Time-box**: 90 minutes

**Setup/Preconditions**:
- Canvas with HTTP component pointing to a controllable mock server
- Canvas with GitHub/Slack integration configured
- Mock server that can simulate: 500 errors, timeouts (30s delay), connection refused, malformed JSON
- Access to application logs and execution detail page

**Key Heuristics**:
- **Resilience**: Does a single integration failure halt the entire execution?
- **Retry**: Are failed integration requests retried? How many times? With backoff?
- **Timeout**: Is there a configurable timeout for integration requests?
- **Error reporting**: Are integration failures clearly reported in the execution detail?
- **Circuit breaking**: After N failures, does the system stop retrying?

**Risks Being Explored**:
- Integration timeout (e.g., 30s HTTP call) blocks the integration request worker, reducing throughput
- No retry logic: a transient 503 causes permanent execution failure
- Retry without idempotency causes duplicate side effects (e.g., sending Slack message twice)
- Integration error messages contain sensitive data (API keys in error responses)
- `pkg/retry` package exists but may not be used by all integration workers

---

### Charter 8: Canvas DAG Validation and Edge Cases

**Target Area**: `pkg/grpc/actions/canvases`, `pkg/grpc/actions/components`, `pkg/models/canvas_node`
**Mission**: Explore canvas creation and modification to find edge cases in DAG validation -- can invalid graphs be created?
**Time-box**: 60 minutes

**Setup/Preconditions**:
- gRPC client or UI access
- Understanding of canvas/node/edge model

**Key Heuristics**:
- **Structural validity**: Can you create a cycle in the DAG?
- **Orphan nodes**: Can you add a node with no incoming or outgoing edges?
- **Self-loops**: Can a node connect to itself?
- **Duplicate edges**: Can two edges connect the same pair of nodes?
- **Trigger placement**: Can a trigger be placed in the middle of a chain (not at the start)?
- **Empty canvas**: Can you activate/publish a canvas with no nodes?

**Risks Being Explored**:
- No cycle detection allows infinite execution loops
- Orphan nodes cause executions to never complete (waiting for unreachable node)
- Multiple triggers on the same canvas create ambiguous execution paths
- Deleting a node does not clean up its edges, leaving dangling references
- Canvas version management allows activating an invalid version

---

### Charter 9: Schedule Trigger Precision and Reliability

**Target Area**: `pkg/triggers/schedule`, `robfig/cron`
**Mission**: Explore the schedule trigger's accuracy, handling of edge-case cron expressions, and behavior across timezone boundaries and DST transitions.
**Time-box**: 60 minutes

**Setup/Preconditions**:
- Canvas with schedule trigger
- Ability to set various cron expressions
- Clock/timezone manipulation (if possible) or observation over time boundaries

**Key Heuristics**:
- **Precision**: Does a "every minute" cron fire within 1 second of the minute boundary?
- **Edge expressions**: `@yearly`, `0 0 29 2 *` (Feb 29), `0 0 31 * *` (months without 31st)
- **Timezone**: Does a schedule set for 2am fire correctly during DST spring-forward (when 2am does not exist)?
- **Overlap**: What if a scheduled execution is still running when the next schedule fires?

**Risks Being Explored**:
- Cron expression parsing silently accepts invalid expressions
- Schedule fires twice during DST fall-back (when 2am occurs twice)
- No execution overlap prevention: rapid schedules queue unlimited executions
- Server restart loses scheduled triggers (in-memory only, not persisted)
- Schedule trigger does not fire if the app was down during the scheduled time (no catch-up)

---

### Charter 10: WebSocket Real-Time Updates

**Target Area**: `pkg/public/ws`, `web_src/` (React frontend)
**Mission**: Explore the WebSocket connection for real-time execution updates -- reconnection, message loss, and concurrent viewer behavior.
**Time-box**: 45 minutes

**Setup/Preconditions**:
- Canvas page open in browser with DevTools Network tab on WS
- Active execution to generate real-time updates
- Ability to simulate network interruption (DevTools offline mode)

**Key Heuristics**:
- **Reconnection**: Does the client reconnect after network drop? How long?
- **Message loss**: Are updates missed during disconnection recovered on reconnect?
- **Consistency**: Do two browsers viewing the same execution show the same state?
- **Memory**: Does the WebSocket connection leak memory over long sessions?

**Risks Being Explored**:
- WebSocket disconnection causes stale execution state in the UI
- No reconnection logic: user must manually refresh after network blip
- Rapid execution updates overwhelm the WebSocket, causing message backlog
- WebSocket endpoint does not validate authentication (any connection accepted)
- Multiple tabs open multiple WebSocket connections, multiplying server load

---

### Charter 11: Component Conditional Logic (Filter, If, Merge)

**Target Area**: `pkg/components/filter`, `pkg/components/if`, `pkg/components/merge`
**Mission**: Explore the conditional routing components with complex expressions, edge-case inputs, and multi-branch scenarios.
**Time-box**: 60 minutes

**Setup/Preconditions**:
- Canvas with filter, if, and merge components
- Ability to send events with varying payloads
- Understanding of the `expr-lang/expr` expression language used for conditions

**Key Heuristics**:
- **Expression edge cases**: Empty string, null value, deeply nested JSON, very long strings
- **Type coercion**: Does `"1" == 1` evaluate as true or false?
- **Error in expression**: What happens when the expression itself is invalid at runtime?
- **Merge behavior**: How does merge handle: 1 of 2 branches arriving, both branches, neither branch?

**Risks Being Explored**:
- Malicious expression causes resource exhaustion (e.g., regex backtracking in expr)
- Filter with always-false condition causes execution to hang (no timeout)
- Merge node does not handle partial branch completion (waits forever)
- If component with no "else" branch drops the execution silently
- Expressions have access to more context than intended (information leak)

---

### Charter 12: Webhook Security and Payload Handling

**Target Area**: `pkg/triggers/webhook`, `pkg/integrations/*/webhook_handler.go`
**Mission**: Explore webhook endpoints for security vulnerabilities -- signature bypass, payload injection, and denial-of-service via oversized payloads.
**Time-box**: 75 minutes

**Setup/Preconditions**:
- Webhook trigger configured on a canvas
- curl/httpie for crafting custom HTTP requests
- Large payload generator (10KB, 100KB, 1MB, 10MB)

**Key Heuristics**:
- **Signature validation**: Is the signature check mandatory or optional?
- **Replay protection**: Can a captured webhook be replayed?
- **Payload limits**: Is there a maximum payload size? What happens when exceeded?
- **Content-Type handling**: Does the webhook handle unexpected Content-Types gracefully?
- **Path traversal**: Can the webhook URL be manipulated to access internal endpoints?

**Risks Being Explored**:
- Webhook without signature verification allows anyone to trigger executions
- No request body size limit allows denial-of-service via large payloads
- JSON payload with recursive references causes stack overflow in parser
- Webhook ID is predictable/sequential, allowing enumeration
- GitHub/Slack webhook signature verification uses timing-unsafe comparison

---

### Charter 13: Data Migration and Schema Evolution

**Target Area**: `db/migrations/`, `db/data_migrations/`, `pkg/database`
**Mission**: Explore the robustness of database migrations -- can they be applied, rolled back, and re-applied without data loss?
**Time-box**: 45 minutes

**Setup/Preconditions**:
- Fresh database instance
- Access to migration files
- Database client for direct SQL queries

**Key Heuristics**:
- **Idempotency**: Can a migration be run twice without error?
- **Rollback**: Are down migrations provided? Do they preserve data?
- **Ordering**: Are migrations numbered sequentially without gaps or duplicates?
- **Data migration safety**: Do data migrations handle NULL values and edge cases?

**Risks Being Explored**:
- Missing down migrations make rollback impossible after a failed release
- Data migration fails on large tables (timeout or memory)
- Migration adds NOT NULL column without default, failing on existing rows
- Schema change breaks GORM model assumptions (column rename without model update)

---

### Charter 14: CLI Command Robustness

**Target Area**: `pkg/cli/commands/*` (canvases, events, executions, integrations, queue, secrets)
**Mission**: Explore the CLI for error handling, input validation, and output formatting with unexpected inputs and states.
**Time-box**: 45 minutes

**Setup/Preconditions**:
- Built CLI binary
- Running Superplane server (for connected commands)
- Disconnected server (for offline error handling)

**Key Heuristics**:
- **Offline behavior**: What happens when the server is unreachable?
- **Invalid input**: UUIDs that do not exist, empty strings, special characters
- **Output formatting**: Are errors human-readable? Is JSON output valid?
- **Interrupt handling**: Does Ctrl+C during a long-running command clean up properly?

**Risks Being Explored**:
- CLI panics on network timeout instead of showing a user-friendly error
- Secret values displayed in plaintext in CLI output
- CLI stores credentials insecurely (plaintext in config file)
- Long-running commands (e.g., queue watch) do not handle SIGINT

---

### Charter 15: Canvas Template and Blueprint Integrity

**Target Area**: `pkg/templates`, `templates/canvases/`, `pkg/grpc/actions/blueprints`
**Mission**: Explore canvas templates and blueprints -- can templates be imported, exported, and instantiated without corruption? Do blueprints maintain integrity across versions?
**Time-box**: 45 minutes

**Setup/Preconditions**:
- Sample canvas templates from `templates/canvases/`
- UI or gRPC access to template/blueprint operations

**Key Heuristics**:
- **Round-trip fidelity**: Export a canvas as template, import it -- is it identical?
- **Version compatibility**: Can a template created in version N be imported in version N+1?
- **Invalid templates**: What happens when a template references a non-existent component or integration?
- **Naming collisions**: What happens when importing a template with a name that already exists?

**Risks Being Explored**:
- Template import silently drops unsupported components (data loss)
- Blueprint references are by name, not ID -- renaming breaks the link
- Template YAML/JSON injection allows arbitrary data in the canvas
- Large templates (100+ nodes) cause timeout during import
- No template validation: invalid DAG structure imported without warning

---

## Appendix A: Test Coverage Gap Summary

| Package | Existing Test Files | Estimated Current Coverage | Target Coverage | Gap Severity |
|---|---|---|---|---|
| `pkg/jwt` | 0 | 0% | 90% | **CRITICAL** |
| `pkg/secrets` | 0 | 0% | 90% | **CRITICAL** |
| `pkg/database` | 0 | 0% | 70% | HIGH |
| `pkg/retry` | 0 | 0% | 80% | HIGH |
| `pkg/templates` | 0 | 0% | 60% | MEDIUM |
| `pkg/widgets` | 0 | 0% | 50% | LOW |
| `pkg/logging` | 0 | 0% | 30% | LOW |
| `web_src/` (React) | 1 | <5% | 50% | **HIGH** |
| `pkg/crypto` | 3 (partial) | ~50% | 95% | HIGH |
| `pkg/authentication` | 1 | ~40% | 90% | HIGH |
| `pkg/authorization` | 1 | ~30% | 95% | HIGH |
| `pkg/models` | 2 | ~15% | 70% | MEDIUM |
| `pkg/integrations` | 273 | ~70% | 80% | LOW |
| `pkg/workers` | 13 | ~60% | 85% | MEDIUM |
| `pkg/grpc` | 48 | ~50% | 75% | MEDIUM |

## Appendix B: Integration Inventory (40+ Providers)

**Cloud Providers**: AWS (CloudWatch, CodeArtifact, CodePipeline, EC2, ECR, ECS, EventBridge, IAM, Lambda, Route53, SNS, SQS), GCP (CloudBuild, CloudFunctions, Compute, PubSub), Cloudflare, DigitalOcean, Hetzner, Render

**Source Control**: GitHub, GitLab, Bitbucket

**CI/CD**: CircleCI, Semaphore, Harness, Octopus

**Incident Management**: PagerDuty, FireHydrant, Rootly, Incident.io, ServiceNow

**Observability**: Datadog, Grafana, Prometheus, Honeycomb, Dash0

**Notifications**: Slack, Discord, Telegram, SendGrid, SMTP

**AI**: Claude, OpenAI, Cursor

**Other**: Jira, LaunchDarkly, JFrog Artifactory, DockerHub, Daytona, StatusPage

## Appendix C: RBAC Permission Matrix (for Authorization Testing)

| Resource | Operation | Viewer | Admin | Owner |
|---|---|---|---|---|
| org | read | Y | Y | Y |
| org | update | N | N | Y |
| org | delete | N | N | Y |
| canvases | read | Y | Y | Y |
| canvases | create | N | Y | Y |
| canvases | update | N | Y | Y |
| canvases | delete | N | Y | Y |
| members | read | Y | Y | Y |
| members | create | N | Y | Y |
| members | update | N | Y | Y |
| members | delete | N | Y | Y |
| groups | read | Y | Y | Y |
| groups | create | N | Y | Y |
| groups | update | N | Y | Y |
| groups | delete | N | Y | Y |
| integrations | read | N | Y | Y |
| integrations | create | N | Y | Y |
| integrations | update | N | Y | Y |
| integrations | delete | N | N | Y |
| secrets | read | N | Y | Y |
| secrets | create | N | Y | Y |
| secrets | update | N | Y | Y |
| secrets | delete | N | Y | Y |
| roles | read | Y | Y | Y |
| roles | create | N | Y | Y |
| roles | update | N | Y | Y |
| roles | delete | N | Y | Y |
| blueprints | read | Y | Y | Y |
| blueprints | create | N | Y | Y |
| blueprints | update | N | Y | Y |
| blueprints | delete | N | Y | Y |
| service_accounts | read | Y | Y | Y |
| service_accounts | create | N | Y | Y |
| service_accounts | update | N | Y | Y |
| service_accounts | delete | N | Y | Y |

**Total testable combinations**: 36 rows x 3 roles = 108 permission assertions (minimum).

---

*End of document. Generated by QE Test Architect based on static analysis of the Superplane codebase at /tmp/superplane.*
