# Semaphore CI/CD Platform - Comprehensive Test Analysis Report

**Date**: 2026-03-06
**Scope**: Full test suite analysis across all services and languages
**Methodology**: Static analysis of test files, source modules, test patterns, and infrastructure

---

## Executive Summary

The Semaphore CI/CD platform contains **1,085 test files** across 4 languages (864 Elixir, 118 Go, 55 Ruby, 40 JS/TS) plus 8 E2E test files. Against **2,735 source files** (2,179 Elixir, 410 Go, 146 Ruby), the overall file-level test coverage stands at approximately **39.7%**. Critical gaps exist in security-sensitive modules (encryption, authentication tokens, OIDC), pipeline orchestration infrastructure, and front-end code (8.4% file coverage). The E2E suite covers only 4 API flows and 4 UI flows, leaving notifications, dashboards, RBAC, and periodic scheduling without end-to-end validation.

---

## 1. Test Coverage by Service

### 1.1 Elixir Services

| Service | Source Files | Test Files | File Ratio | Risk Level |
|---------|-------------|------------|------------|------------|
| auth | 17 | 5 | 29.4% | HIGH |
| badge | 20 | 8 | 40.0% | LOW |
| branch_hub | 9 | 3 | 33.3% | MEDIUM |
| dashboardhub | 24 | 2 | 8.3% | HIGH |
| feature_provider | 8 | 9 | 112.5% | LOW |
| guard | 129 | 37 | 28.7% | CRITICAL |
| hooks_processor | 47 | 20 | 42.6% | MEDIUM |
| hooks_receiver | 23 | 5 | 21.7% | HIGH |
| notifications | 52 | 21 | 40.4% | MEDIUM |
| projecthub | 59 | 21 | 35.6% | MEDIUM |
| projecthub-rest-api | 14 | 1 | 7.1% | HIGH |
| public-api-gateway | (Go: 27 files) | 2 | 7.4% | HIGH |
| repository_hub | 135 | 64 | 47.4% | MEDIUM |
| scouter | 19 | 2 | 10.5% | HIGH |
| secrethub | 54 | 24 | 44.4% | MEDIUM |
| zebra | 100 | 50 | 50.0% | MEDIUM |
| mcp_server | (Go: 75 files) | 21 (Go) | 28.0% | MEDIUM |
| github_notifier | 37 | 10 | 27.0% | MEDIUM |

### 1.2 Elixir Sub-Application Services

| Service | Source Files | Test Files | File Ratio | Risk Level |
|---------|-------------|------------|------------|------------|
| plumber/ppl | 138 | 89 | 64.5% | MEDIUM |
| plumber/block | 43 | 24 | 55.8% | MEDIUM |
| plumber/looper | 20 | 10 | 50.0% | MEDIUM |
| plumber/proto | 23 | 0 | 0.0% | HIGH |
| plumber/repo_proxy_ref | 3 | 0 | 0.0% | HIGH |
| plumber/task_api_referent | 21 | 7 | 33.3% | MEDIUM |
| plumber/definition_validator | 8 | 5 | 62.5% | LOW |
| plumber/gofer_client | 5 | 4 | 80.0% | LOW |
| plumber/job_matrix | 5 | 5 | 100.0% | LOW |
| periodic_scheduler/scheduler | 57 | 27 | 47.4% | MEDIUM |
| periodic_scheduler/definition_validator | 6 | 4 | 66.7% | LOW |
| public-api/v1alpha | 136 | 60 | 44.1% | MEDIUM |
| public-api/v2 | 258 | 59 | 22.9% | HIGH |
| ee/rbac | 137 | 39 | 28.5% | HIGH |
| ee/gofer | 92 | 51 | 55.4% | MEDIUM |
| ee/audit | 32 | 8 | 25.0% | HIGH |
| ee/pre_flight_checks | 25 | 8 | 32.0% | MEDIUM |

### 1.3 Go Services

| Service | Source Files | Test Files | File Ratio | Untested Packages |
|---------|-------------|------------|------------|-------------------|
| repohub | 39 | 8 | 20.5% | 9 of 10 packages |
| self_hosted_hub | 45 | 18 | 40.0% | 5 of 14 packages |
| encryptor | 9 | 4 | 44.4% | 1 (protos only) |
| bootstrapper | 40 | 6 | 15.0% | 11 of 15 packages |
| artifacthub | 50 | 16 | 32.0% | 2 of 8 packages |
| loghub2 | 25 | 12 | 48.0% | 1 (protos only) |
| mcp_server | 75 | 21 | 28.0% | 6 of 12 packages |

### 1.4 Ruby Services

| Service | Source Files | Test Files | File Ratio | Risk Level |
|---------|-------------|------------|------------|------------|
| github_hooks | 99 | 55 | 55.6% | MEDIUM |

### 1.5 JavaScript/TypeScript (Front-end)

| Service | Source Files | Test Files | File Ratio | Risk Level |
|---------|-------------|------------|------------|------------|
| front (JS/TS) | 477 | 40 | 8.4% | CRITICAL |

---

## 2. Test Quality Assessment

### 2.1 Elixir Test Quality

**Strengths:**
- Well-structured tests using ExUnit with `describe` blocks for logical grouping
- Good use of `setup` callbacks and context passing (323 files use setup/teardown patterns)
- Mock library (`Mock`) used effectively for external service isolation (145 files)
- Factories and support modules are well-organized (e.g., `ee/rbac` has 17 factory modules)
- Meaningful test names that describe behavior (e.g., "destroys the secret", "logs errors and re-raises")

**Weaknesses:**
- `guard_test.exs` contains only a trivial "greets the world" test with 1 assertion -- the default generated test was never replaced with real tests
- 58 test files modify global environment via `Application.put_env` or `System.put_env`, creating shared state risks
- 43 test files contain `Process.sleep` or `:timer.sleep` calls, indicating potential flakiness
- 146 files configure `async: true/false`, but database-dependent tests (267 files) with `async: true` risk transactional isolation failures

**AAA Pattern Usage:**
- Secrethub tests demonstrate strong Arrange-Act-Assert: factory setup in `setup` blocks, explicit action calls, and targeted assertions
- Plumber/ppl tests follow AAA well with separate factory setup, request execution, and multi-field assertions
- Guard service tests have inconsistent quality -- some files (organization_test.exs: 133 assertions) are thorough while others (guard_test.exs: 1 assertion) are trivially incomplete

### 2.2 Go Test Quality

**Strengths:**
- Consistent use of `testify/assert` and `testify/require` packages
- Good test naming convention with `Test__FunctionName` pattern
- Database cleanup patterns (`support.PurgeDB()`, `database.TruncateTables()`) used consistently
- Self-hosted hub tests are particularly thorough (server_test.go: 169 assertions, self_hosted_service_test.go: 190 assertions)
- gRPC integration tests validate full request-response cycles

**Weaknesses:**
- 12 Go test files contain `time.Sleep` calls, risking flaky behavior in CI
- `health_service_test.go` has 0 assertions -- it runs but validates nothing
- Repohub has 8 test files but 9 of 10 packages are completely untested (tests only cover the hub package via integration tests)
- Bootstrapper has the worst Go coverage at 15% with 11 of 15 packages untested
- No table-driven tests observed in the sampled files, missing Go best practices

### 2.3 Ruby Test Quality (github_hooks)

**Strengths:**
- Well-structured RSpec tests with proper `describe`/`context`/`it` nesting
- Good use of `let` for lazy evaluation and `instance_double` for strict mocking
- Tests cover error paths (gRPC errors, standard errors) alongside happy paths
- No `sleep` calls found in Ruby tests -- good test isolation
- Cache behavior tested with time helpers (`ActiveSupport::Testing::TimeHelpers`)

**Weaknesses:**
- `factory_spec.rb` has only 1 assertion -- minimal validation for a factory module
- Heavy reliance on `allow`/`receive` stubs means tests may not catch integration issues

### 2.4 JavaScript/TypeScript Test Quality

**Strengths:**
- Uses Mocha/Chai with sinon for mocking -- well-established testing stack
- DOM setup and teardown in `beforeEach`/`afterEach` demonstrates proper cleanup
- Workflow editor model tests are comprehensive (agent, block, pipeline, promotion, secrets)

**Weaknesses:**
- Only 40 test files for 477 source files -- vast majority of front-end code is untested
- Test coverage concentrated in `workflow_editor` and `workflow_view` modules
- 36+ front-end feature directories have zero test coverage (billing, insights, groups, roles, deployments, etc.)

---

## 3. Test Types Distribution

### 3.1 Test Pyramid Analysis

| Test Type | Count | Percentage | Health |
|-----------|-------|------------|--------|
| Unit Tests | ~750 | ~69% | ADEQUATE |
| Integration Tests (DB/gRPC) | ~267 | ~25% | GOOD |
| Contract Tests | ~62 | ~6% | WEAK |
| E2E Tests | 8 | <1% | CRITICAL GAP |

### 3.2 Unit Tests
- **Elixir**: Most test files are unit tests using mocks/stubs for external dependencies
- **Go**: Mix of unit and integration (many tests require database setup)
- **Ruby**: RSpec tests are primarily unit-level with extensive stubbing
- **JS/TS**: Pure unit tests for model logic and UI components

### 3.3 Integration Tests
- 267 test files have database dependencies (Ecto/Repo patterns)
- gRPC integration tests exist in repohub, self_hosted_hub, plumber, and zebra
- 152 files use stubs/fakes for service-to-service boundaries
- Several services use `FakeServer` modules for gRPC service simulation

### 3.4 Contract Tests
- 62 files contain integration-tagged tests
- Tagged tests found primarily in repository_hub (bitbucket/github adapters) and front-end
- No formal consumer-driven contract tests (e.g., Pact) detected
- Proto/gRPC interfaces lack schema compatibility testing

### 3.5 E2E Tests
- 8 E2E test files covering:
  - **API**: agent types, secrets, tasks, workflows
  - **UI**: login, project creation, git integrations, user management
- Uses Elixir-based E2E framework with client libraries for each API
- Missing E2E for: notifications, dashboards, periodic scheduling, RBAC, audit, badges, branch operations

---

## 4. Critical Untested Paths

### 4.1 CRITICAL: Security and Authentication (Risk Score: 10/10)

| Module | Service | Lines | Risk |
|--------|---------|-------|------|
| `guard/encryptor.ex` | guard | 40+ | Encryption/decryption logic with no tests |
| `guard/authentication_token.ex` | guard | 15 | Token generation and hashing -- crypto-sensitive |
| `guard/oidc/token.ex` | guard | 30 | OIDC token encrypt/decrypt for session management |
| `guard/store/oidc_session.ex` | guard | -- | OIDC session persistence |
| `guard/store/oidc_user.ex` | guard | -- | OIDC user data store |
| `auth/id_provider.ex` | auth | 30 | Identity provider access control checks |
| `auth/feature_client.ex` | auth | -- | Feature flag integration for auth |
| `secrethub/auth.ex` | secrethub | 15+ errors | Authorization with 15 error paths |

**Impact**: These modules handle token generation, encryption, OIDC session management, and access control. A defect in any of these could lead to authentication bypass, session hijacking, or unauthorized data access.

### 4.2 CRITICAL: Pipeline Execution Infrastructure (Risk Score: 9/10)

| Module | Service | Risk |
|--------|---------|------|
| `plumber/proto` (23 files) | plumber | Zero tests for gRPC protocol definitions |
| `plumber/repo_proxy_ref` (3 files) | plumber | Zero tests for repository proxy references |
| `plumber/task_api_referent` (14 untested) | plumber | Agent, gRPC, service modules partially untested |
| `zebra/workers/agent/hosted_agent.ex` | zebra | Hosted agent worker logic untested |
| `zebra/workers/agent/self_hosted_agent.ex` | zebra | Self-hosted agent worker logic untested |
| `zebra/workers/job_request_factory/*.ex` | zebra | 4 factory sub-modules untested (callback_token, loghub2, project, toolbox_install) |

**Impact**: Pipeline execution is the core product function. Untested agent workers and job request factories could cause silent pipeline failures, incorrect job scheduling, or resource leaks.

### 4.3 HIGH: Webhook Processing (Risk Score: 8/10)

| Module | Service | Risk |
|--------|---------|------|
| `hooks_receiver/hook/bitbucket_filter.ex` | hooks_receiver | Bitbucket webhook filtering untested |
| `hooks_receiver/hook/gitlab_filter.ex` | hooks_receiver | GitLab webhook filtering untested |
| `hooks_receiver/organization_client.ex` | hooks_receiver | Org lookup for webhook routing untested |
| `hooks_receiver/plugs/cache_body_reader.ex` | hooks_receiver | Request body caching untested |
| `hooks_processor/hooks/processing/utils.ex` | hooks_processor | Processing utility functions untested |

**Impact**: Webhook processing is the primary trigger for CI/CD pipelines. Untested filters could silently drop legitimate webhooks or process invalid ones, causing missed builds or security issues.

### 4.4 HIGH: Event System (Risk Score: 8/10)

Guard has 13 untested event modules:
- `organization_blocked`, `organization_created`, `organization_deleted`, `organization_restored`
- `organization_suspension_created`, `organization_suspension_removed`, `organization_unblocked`
- `user_created`, `user_deleted`, `user_joined_organization`, `user_updated`
- `config_modified`, `work_email_added`, `favorite_created`, `favorite_deleted`

**Impact**: Event publishing drives cross-service communication. Untested event modules could silently fail, leaving dependent services with stale data.

### 4.5 HIGH: RBAC and Access Control (Risk Score: 8/10)

| Module | Service | Risk |
|--------|---------|------|
| `guard/api/rbac.ex` | guard | RBAC API endpoint untested |
| `guard/rbac/tmp_sync.ex` | guard | RBAC sync mechanism untested |
| `guard/repo/subject_role_binding.ex` | guard | Role binding persistence untested |
| `ee/rbac` (137 src, 39 tests) | ee | 28.5% coverage on enterprise RBAC |
| `ee/audit` (32 src, 8 tests) | ee | 25% coverage on audit logging |

**Impact**: RBAC controls who can access what across the entire platform. Gaps here could lead to privilege escalation or unauthorized access.

### 4.6 MEDIUM: Dashboard and Notification Services (Risk Score: 6/10)

- **dashboardhub**: 24 source files, only 2 test files (8.3% coverage). All gRPC endpoints, event publishing, and store modules untested.
- **notifications**: 9 untested modules including email workers, rule factory, and data transformations.
- **scouter**: 7 untested modules out of 19 source files (10.5% coverage). gRPC endpoint and storage layer untested.

### 4.7 MEDIUM: Front-end (Risk Score: 7/10)

36+ feature directories with zero test coverage:
- `billing`, `insights`, `groups`, `roles`, `deployments`, `flaky_tests`
- `organization_health`, `organization_okta`, `organization_onboarding`
- `project_settings`, `report`, `service_accounts`, `test_results`
- `activity_monitor`, `jump_to`, `people`, `pre_flight_checks`

Only `workflow_editor`, `workflow_view`, `toolbox`, and `utils` have tests.

### 4.8 MEDIUM: Go Services Infrastructure (Risk Score: 6/10)

- **bootstrapper**: 11 of 15 packages untested (73%). Untested: bitbucket, clients, config, github, gitlab, installation, organization, random, user, utils
- **repohub**: 9 of 10 packages untested. Critical `gitrekt` package (10 source files, Git operations) has zero tests
- **artifacthub**: `api` package (9 files, all API handlers) completely untested
- **mcp_server**: `authz`, `internal_api` (26 files), `config`, `logging`, `utils`, `watchman` packages untested

---

## 5. Test Infrastructure Assessment

### 5.1 Test Helpers and Support

**Elixir:**
- 39 `test_helper.exs` files across services (one per application)
- Factory pattern well-adopted: `ee/rbac` (17 factories), `repository_hub` (7 factories), `guard` (5 factories)
- Custom `RepoCase`, `DataCase` modules for database test setup
- `FakeServer` modules in guard, zebra, front, github_notifier for gRPC simulation

**Go:**
- `support` packages with `PurgeDB()`, `CreateRepository()` helper functions
- `grpcmock` package in self_hosted_hub for gRPC mock server
- `fake_servers.go` in repohub and ee/velocity
- Database truncation helpers used consistently

**Ruby:**
- Standard RSpec with `spec_helper.rb`
- ActiveSupport test helpers for time manipulation
- Instance doubles for strict type checking on mocks

**JS/TS:**
- Mocha/Chai/Sinon stack
- DOM setup in `beforeEach` blocks
- jQuery cleanup in `afterEach`

### 5.2 E2E Infrastructure

- **Framework**: Elixir ExUnit with custom client libraries
- **Client libraries**: agent, common, job, pipeline, project, secret, task, workflow
- **UI testing**: Browser-based using support modules (`browser.ex`, `ui_test_case.ex`, `user_action.ex`)
- **Configuration**: Environment-specific configs (`dev.exs`, `test.exs`)
- **Limitations**: No parallel E2E execution visible, no retry mechanisms for flaky E2E tests

### 5.3 CI Integration

- `.semaphore/` directory exists for Semaphore CI configuration
- Test helpers configure async execution (146 files)
- Database-dependent tests use Ecto sandbox for isolation

---

## 6. Flaky Test Indicators

### 6.1 Sleep/Wait Patterns (HIGH RISK)

**55 files contain sleep/wait calls across the codebase:**

- **Elixir**: 43 files use `Process.sleep` or `:timer.sleep`
  - `auth/cache_test.exs` -- cache expiration testing
  - `badge/cache_test.exs` -- cache TTL validation
  - `branch_hub/branches_queries_test.exs` -- timing-dependent queries
  - All front-end browser tests (12 files) -- UI rendering waits
  - `guard/test/support/wait.ex` -- explicit wait helper (indicates known flakiness)
- **Go**: 12 files use `time.Sleep`
  - `loghub2/publicapi/timeout_test.go` -- timeout behavior
  - `self_hosted_hub/publicapi/timeout_test.go` -- timeout behavior
  - `self_hosted_hub/models/agent_test.go` -- state transition timing
  - `artifacthub/server` tests -- server startup timing

### 6.2 Time-Dependent Tests (MEDIUM RISK)

- **90 test files** reference current time functions (`DateTime.utc_now`, `NaiveDateTime.utc_now`, `time.Now`)
- Tests that compare against "now" can fail across midnight boundaries or under slow CI
- No time-freezing utilities detected in Elixir tests (Ruby uses `ActiveSupport::Testing::TimeHelpers`)

### 6.3 Shared State Risks (MEDIUM RISK)

- **58 test files** modify global environment via `Application.put_env` or `System.put_env`
- If tests run concurrently (`async: true`), environment mutations can cause cross-test interference
- 267 database-dependent test files rely on transactional isolation -- any non-sandboxed test can corrupt shared state

### 6.4 Non-Deterministic Assertions (LOW RISK)

- Some tests use UUID generation in assertions (`UUID.uuid4()`) which is inherently non-deterministic but typically harmless
- No random data in assertion expectations observed (good practice)

---

## 7. Missing Test Scenarios by Service

### 7.1 auth
- Identity provider allow/deny logic (`id_provider.ex`) -- no tests for provider filtering
- Feature flag client behavior under failure conditions
- gRPC client connection retry and timeout handling
- Cache invalidation race conditions

### 7.2 guard (HIGHEST PRIORITY)
- **Encryption module**: encrypt/decrypt round-trip, empty string handling, error propagation
- **Authentication token**: token generation entropy, hash consistency, salt configuration
- **OIDC token**: encrypt/decrypt with user ID binding, error recovery (logs but continues)
- **OIDC session store**: create, read, expire, concurrent access
- **All 13 event modules**: event serialization, publishing failures, message format validation
- **RBAC API**: permission checks, role resolution, deny-by-default verification
- **Instance config models**: GitHub App, GitLab App, Bitbucket App configuration validation
- **Organization suspension**: suspend/unsuspend lifecycle, cascading effects

### 7.3 secrethub
- **Auth module**: all 15 error paths need individual test cases
- **OIDC utilization**: OpenID Connect secret injection scenarios
- **Public gRPC API**: list_secrets pagination, filtering, access control
- **Encryption integration**: secret encryption at rest verification

### 7.4 zebra
- **Hosted agent worker**: job assignment, heartbeat, cleanup on failure
- **Self-hosted agent worker**: registration, capability matching, disconnection handling
- **Job request factory sub-modules**: callback token generation, loghub2 integration, project resolution, toolbox installation
- **Debug permissions API**: authorization checks for debug access
- **Quantum scheduler**: cron scheduling accuracy, timezone handling, overlap prevention

### 7.5 hooks_receiver
- **Bitbucket filter**: webhook event type filtering, signature validation
- **GitLab filter**: merge request events, push events, tag events
- **Organization client**: org lookup failures, caching behavior
- **Cache body reader**: large payload handling, malformed body recovery

### 7.6 hooks_processor
- **Admin client**: admin API integration error handling
- **Test worker**: test result processing edge cases
- **Processing utils**: data transformation validation
- **RabbitMQ consumers**: message acknowledgment, retry on failure, dead letter handling

### 7.7 plumber
- **Proto definitions**: request/response serialization round-trips for all 23 proto files
- **Repo proxy ref**: all 3 source files have zero tests -- repository proxy reference resolution
- **Task API referent**: agent selection, gRPC endpoint handling, service layer logic

### 7.8 projecthub
- **All 4 event modules**: project lifecycle event publishing
- **All gRPC interceptors** (7 modules): logging, metrics, request ID propagation, async execution
- **Deploy key model**: key generation, rotation, deletion
- **State machine**: project state transitions and invalid transition rejection

### 7.9 repository_hub
- **GitLab adapter**: repository operations for GitLab (distinct from GitHub adapter which has tests)
- **Bitbucket connector**: connection establishment, token refresh, error handling
- **GitLab connector**: same as above for GitLab
- **All gRPC interceptors** (8 modules): cross-cutting concerns untested
- **Remote ID sync worker**: background synchronization logic

### 7.10 dashboardhub
- **All gRPC endpoints**: internal and public API servers
- **All 5 event modules**: dashboard CRUD event publishing
- **Store module**: data access layer
- **Migrator**: schema migration execution

### 7.11 scouter
- **gRPC endpoint and health check**: server availability
- **Storage layer**: event storage and query execution
- **Metrics interceptor**: metric collection accuracy

### 7.12 front (JavaScript/TypeScript)
- **Billing module**: payment flows, plan changes, invoice display
- **Insights**: analytics data visualization, date range filtering
- **Groups/Roles**: RBAC UI, permission matrix rendering
- **Deployments**: deployment target management, promotion flows
- **Activity monitor**: real-time event streaming, filtering
- **Organization settings**: Okta integration, onboarding wizard
- **Test results**: test report parsing, flaky test detection UI

### 7.13 bootstrapper (Go)
- **Git provider clients** (bitbucket, github, gitlab): repository bootstrapping
- **Installation package**: Kubernetes deployment setup
- **Organization setup**: initial org configuration
- **Client connections**: gRPC client initialization and retry

### 7.14 E2E Missing Scenarios
- **Notification delivery**: email/webhook notification on pipeline events
- **Dashboard CRUD**: create, update, delete dashboards via UI
- **Periodic scheduling**: create scheduled pipeline, verify execution
- **RBAC flows**: role assignment, permission verification, access denial
- **Audit trail**: action logging and audit log retrieval
- **Badge rendering**: status badge generation and caching
- **Branch operations**: branch listing, archiving, filtering
- **Secret rotation**: update secret, verify propagation to running pipelines
- **Multi-provider webhooks**: GitHub, GitLab, Bitbucket webhook processing E2E

---

## 8. Prioritized Recommendations

### Priority 1: Security-Critical (Immediate Action Required)

1. **Guard encryption module tests** -- Risk Score: 10/10
   - Test encrypt/decrypt round-trip with various data sizes
   - Test empty string edge case (current code short-circuits)
   - Test error propagation from underlying crypto module
   - Test `encrypt!`/`decrypt!` exception-raising variants
   - Estimated effort: 1 day

2. **Guard authentication token tests** -- Risk Score: 10/10
   - Test token generation produces correct length and encoding
   - Test user-friendly vs standard token format
   - Test hash_token produces consistent results
   - Test salt configuration is applied
   - Estimated effort: 0.5 days

3. **Guard OIDC token tests** -- Risk Score: 10/10
   - Test encrypt/decrypt with user ID binding
   - Test decrypt failure returns `{:error, :decrypt_error}`
   - Test encrypt failure logs error and returns `{:ok, nil}` (current graceful degradation)
   - Estimated effort: 0.5 days

4. **Secrethub auth error paths** -- Risk Score: 9/10
   - Test all 15 error/raise paths individually
   - Test authorization denial scenarios
   - Estimated effort: 1 day

### Priority 2: Core Pipeline Infrastructure (This Sprint)

5. **Zebra agent worker tests** -- Risk Score: 9/10
   - Hosted and self-hosted agent job assignment
   - Job request factory sub-module tests
   - Estimated effort: 3 days

6. **Hooks receiver filter tests** -- Risk Score: 8/10
   - Bitbucket and GitLab webhook filter validation
   - Organization client failure scenarios
   - Estimated effort: 2 days

7. **Guard event module tests** -- Risk Score: 8/10
   - All 13 event modules need serialization and publishing tests
   - Estimated effort: 2 days

### Priority 3: Coverage Expansion (This Quarter)

8. **Dashboardhub full test suite** -- Risk Score: 7/10
   - From 8.3% to target 60% coverage
   - Estimated effort: 3 days

9. **Scouter service tests** -- Risk Score: 7/10
   - gRPC endpoint, storage layer, metrics
   - Estimated effort: 2 days

10. **Front-end test expansion** -- Risk Score: 7/10
    - Prioritize billing, insights, and organization settings modules
    - Estimated effort: 5 days (ongoing)

11. **Bootstrapper Go package tests** -- Risk Score: 6/10
    - Git provider clients, installation, organization setup
    - Estimated effort: 3 days

12. **E2E test expansion** -- Risk Score: 6/10
    - Add notification delivery, periodic scheduling, RBAC flows
    - Estimated effort: 5 days

### Priority 4: Test Quality Improvements (Ongoing)

13. **Eliminate sleep-based tests** -- Replace 55 sleep-dependent test files with event-driven waiting or polling helpers
14. **Time-freeze utilities** -- Introduce time-freezing in Elixir tests (similar to Ruby's `travel_to`)
15. **Replace guard_test.exs** -- The default "greets the world" test should be replaced with real auth middleware tests
16. **Fix zero-assertion test** -- `health_service_test.go` runs but asserts nothing
17. **Reduce shared state** -- Audit 58 files that modify environment and ensure cleanup in `on_exit` callbacks

---

## 9. Projected Coverage Impact

If Priority 1 and Priority 2 recommendations are implemented:

| Metric | Current | Projected | Delta |
|--------|---------|-----------|-------|
| Guard coverage | 28.7% | 55% | +26.3% |
| Auth coverage | 29.4% | 65% | +35.6% |
| Secrethub coverage | 44.4% | 60% | +15.6% |
| Zebra coverage | 50.0% | 65% | +15.0% |
| Hooks receiver coverage | 21.7% | 55% | +33.3% |
| Overall file coverage | 39.7% | 48% | +8.3% |
| Security module coverage | ~0% | 90%+ | +90% |
| E2E scenario coverage | 8 flows | 14 flows | +75% |

Estimated total effort for Priority 1 + 2: **~13 developer-days**

---

## 10. Test Infrastructure Recommendations

1. **Adopt contract testing**: Introduce Pact or similar consumer-driven contract testing for the 15+ gRPC service boundaries. The current approach of `FakeServer` modules does not guarantee provider compatibility.

2. **Centralize test factories**: Several services duplicate factory patterns. Consider a shared test support package for common entities (organizations, projects, users).

3. **Add mutation testing**: File-level coverage ratios may overstate actual test effectiveness. Mutation testing (e.g., `mu2` for Elixir) would reveal tests that run code without truly validating behavior.

4. **E2E environment isolation**: The E2E framework should support parallel execution with isolated environments to reduce feedback cycle time.

5. **Flaky test tracking**: Implement a flaky test detection system that correlates test failures with the 55 sleep-dependent and 90 time-dependent test files.

---

## Appendix A: Complete Untested Module List

### Guard (64 untested modules)
```
guard/api/github_app, guard/api/middleware/update_token, guard/api/okta,
guard/api/rbac, guard/authentication_token, guard/encryptor,
guard/events/config_modified, guard/events/favorite_created,
guard/events/favorite_deleted, guard/events/organization_blocked,
guard/events/organization_created, guard/events/organization_deleted,
guard/events/organization_restored, guard/events/organization_suspension_created,
guard/events/organization_suspension_removed, guard/events/organization_unblocked,
guard/events/user_created, guard/events/user_deleted,
guard/events/user_joined_organization, guard/events/user_updated,
guard/events/work_email_added, guard/fake_servers,
guard/feature_hub_provider, guard/front_repo/favorite,
guard/front_repo/organization_contact, guard/front_repo/organization_suspension,
guard/front_repo/repo_host_account, guard/grpc_servers/instance_config_server,
guard/grpc_servers/utils, guard/id/maybe_setup_git_providers,
guard/instance_config/api/cookie_org_username, guard/instance_config/api/org_id_assign,
guard/instance_config/api/utils, guard/instance_config/bitbucket_app,
guard/instance_config/github_app, guard/instance_config/gitlab_app,
guard/instance_config/models/bitbucket_app, guard/instance_config/models/github_app,
guard/instance_config/models/gitlab_app, guard/instance_config/models/installation_defaults,
guard/instance_config/models/utils, guard/instance_config_repo,
guard/instance_config/token, guard/metrics/external, guard/migrator,
guard/oidc/token, guard/rbac/tmp_sync, guard/repo/global_repo_schema,
guard/repo/oidc_session, guard/repo/oidc_user, guard/repo/rbac_user,
guard/repo/subject, guard/repo/subject_role_binding, guard/repo_url,
guard/services/feature_provider_invalidator_worker,
guard/store/oidc_session, guard/store/oidc_user, guard/store/rbac_user,
guard/store/suspension, guard/template_renderer,
guard/user/salt_generator, guard/user/update_mails, guard/utils
```

### Repository Hub (27 untested modules)
```
repository_hub/adapters/gitlab_adapter,
repository_hub/adapters/universal/describe_many_action,
repository_hub/clients/git_client,
repository_hub/connectors/bitbucket_connector,
repository_hub/connectors/gitlab_connector,
repository_hub/consumers/remote_repository_changed,
repository_hub/encryptor, repository_hub/encryptor/grpc,
repository_hub/internal_clients/organization,
repository_hub/internal_clients/projecthub,
repository_hub/internal_clients/repository_integrator,
repository_hub/internal_clients/user,
repository_hub/model/github_app_collaborators,
repository_hub/model/github_app_query,
repository_hub/model/repository_query,
repository_hub/server/actions/describe_many_action,
repository_hub/server/endpoint, repository_hub/server/health_check,
repository_hub/server/interceptors/client/* (4 modules),
repository_hub/server/interceptors/server/* (4 modules),
repository_hub/workers/remote_id_sync_worker
```

### Projecthub (23 untested modules)
```
projecthub/api/endpoint, projecthub/api/health_check,
projecthub/clients/feature_hub_client, projecthub/clients/grpc_client,
projecthub/clients/rbac_client, projecthub/clients/repository_hub_client,
projecthub/events/project_created, projecthub/events/project_deleted,
projecthub/events/project_restored, projecthub/events/project_updated,
projecthub/feature_hub_provider, projecthub/feature_provider_invalidator_worker,
projecthub/models/deploy_key, projecthub/models/member,
projecthub/models/project/state_machine, projecthub/repo_url,
projecthub/util/grpc/* (7 interceptor modules)
```

### Zebra (20 untested modules)
```
zebra/apis/debug_permissions, zebra/apis/public_job_api/auth,
zebra/apis/public_job_api/getter, zebra/apis/public_job_api/headers,
zebra/apis/utils, zebra/config, zebra/feature_hub_provider,
zebra/lock, zebra/metrics, zebra/models/project,
zebra/quantum_scheduler, zebra/sentry_filter,
zebra/workers/agent/hosted_agent, zebra/workers/agent/self_hosted_agent,
zebra/workers/db_worker,
zebra/workers/job_request_factory/callback_token,
zebra/workers/job_request_factory/loghub2,
zebra/workers/job_request_factory/project,
zebra/workers/job_request_factory/toolbox_install,
zebra/workers/query_helper
```
