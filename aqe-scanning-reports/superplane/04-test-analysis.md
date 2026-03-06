# Superplane Test Analysis Report

**Date:** 2026-03-06
**Analyzer:** qe-coverage-gap-analyzer
**Project:** Superplane (Go monolith with React/TypeScript frontend)

---

## Executive Summary

Superplane has **388 Go test files** containing **1,151 test functions** across a codebase of **1,055 non-test Go source files**. The backend testing is concentrated in integration adapters and gRPC actions, with solid patterns (testify, subtests, HTTP mocking). However, **13 packages have zero test files**, **the CLI has 1 test for 42 source files**, **26 of 28 model files lack tests**, and the **frontend has 1 test file covering 649 TypeScript/TSX source files** -- a 0.15% test-to-file ratio. The E2E suite covers core workflows via Playwright but has only 17 top-level test functions.

### Risk Score Summary

| Area | Risk Score | Coverage Gap | Priority |
|------|-----------|-------------|----------|
| Frontend (web_src/) | **CRITICAL (9.5/10)** | 1 test / 649 source files | P0 |
| JWT package | **CRITICAL (9.0/10)** | 0 tests / 99 lines (auth token generation/validation) | P0 |
| Secrets package | **HIGH (8.5/10)** | 0 tests / 80 lines (encryption, secret loading) | P0 |
| Models package | **HIGH (8.5/10)** | 2 tests / 28 source files (data layer) | P0 |
| gRPC service layer | **HIGH (8.0/10)** | 1 test / 17 service files at root level | P1 |
| CLI package | **HIGH (7.5/10)** | 1 test / 42 source files | P1 |
| Server package | **HIGH (7.5/10)** | 0 tests / 469 lines (server bootstrap) | P1 |
| Worker contexts | **MEDIUM (6.5/10)** | 13 of 18 context files untested | P2 |
| gRPC canvas actions | **MEDIUM (6.5/10)** | 23 of 36 actions untested | P2 |
| Hetzner integration | **MEDIUM (5.0/10)** | 0 tests / 8 source files | P2 |

---

## 1. Test Coverage by Package

### Fully Untested Packages (0 test files)

| Package | Source Files | Lines | Criticality | Risk |
|---------|-------------|-------|-------------|------|
| `openapi_client` | 230 | 51,645 | Low (generated) | Low - auto-generated code |
| `protos` | 41 | 33,591 | Low (generated) | Low - protobuf generated code |
| `core` | 4 | 829 | High (interfaces) | Medium - interface definitions, less logic |
| `server` | 1 | 469 | High | High - server bootstrap, config wiring |
| `templates` | 1 | 228 | Medium | Medium |
| `jwt` | 1 | 99 | **Critical (auth)** | **Critical** |
| `database` | 1 | 119 | Medium | Medium - thin connection wrapper |
| `logging` | 2 | 94 | Low | Low |
| `secrets` | 2 | 80 | **Critical (security)** | **Critical** |
| `web` | 4 | 195 | Medium | Medium |
| `widgets` | 1 | 53 | Low | Low |
| `retry` | 1 | 40 | Medium | Medium |
| `config` | 1 | 15 | Low | Low |

**Excluding generated code** (openapi_client, protos), there are **11 packages with zero tests** totaling **2,221 lines of handwritten code**.

### Undertested Packages (test files exist but coverage is low)

| Package | Source Files | Test Files | Test Functions | Test:Source Ratio | Gap |
|---------|-------------|------------|----------------|-------------------|-----|
| `cli` | 42 | 1 | 4 | 0.024 | **Severe** - 41 untested source files |
| `models` | 28 | 2 | 4 | 0.071 | **Severe** - 26 model files untested |
| `grpc` (root) | 17 | 1 | 1 | 0.059 | **Severe** - 16 service files untested |
| `authentication` | 2 | 1 | 2 | 0.50 | Moderate |
| `configuration` | 4 | 1 | 7 | 0.25 | Moderate |
| `services` | 3 | 1 | 2 | 0.33 | Moderate |

### Well-Tested Packages

| Package | Source Files | Test Files | Test Functions | Assessment |
|---------|-------------|------------|----------------|------------|
| `integrations` | 444 | 273 | 801 | **Good** - 61% file coverage, comprehensive per-integration tests |
| `grpc/actions` | 115 | 47 | 74 | **Moderate** - auth fully covered, canvases partially |
| `components` | 27 | 13 | 101 | **Good** - every component has at least 1 test file |
| `workers` | 33 | 13 | 73 | **Moderate** - core workers tested, contexts undertested |
| `registry` | 6 | 6 | 28 | **Excellent** - 1:1 file ratio |
| `crypto` | 7 | 3 | 3 | **Moderate** - AES-GCM, HMAC, SHA256 tested; password, random untested |
| `triggers` | 6 | 2 | 8 | **Moderate** - schedule and webhook tested, start trigger untested |

---

## 2. Test Quality Assessment

### Strengths

**Consistent use of testify:** 380 files use testify with both `require` (for fatal assertions) and `assert` (for non-fatal checks). This is correct Go testing practice -- `require` stops the test on failure (preventing nil pointer cascades), while `assert` allows multiple failures to be reported.

**Extensive subtest usage:** 2,581 `t.Run()` calls across the codebase demonstrate widespread use of Go subtests for organized, granular test cases. Tests are well-structured with descriptive names like `"invalid configuration -> error"` and `"missing chat ID -> error"`.

**Table-driven patterns:** 109 instances of table-driven test structures (using `[]struct` with range loops). This is the canonical Go testing idiom and is used primarily in integration tests.

**HTTP mocking:** Two distinct patterns are used appropriately:
- `httptest.NewServer` (52 uses) for full HTTP server mocking in registry and component tests
- Custom `RoundTripper` replacement for intercepting outbound HTTP calls in integration tests (e.g., Telegram)

**Test support infrastructure:** The `test/support/` package provides:
- `support.Setup(t)` - standardized test environment with organization, user, encryptor, registry
- `DummyIntegration` - configurable test double for integration testing
- `TestOIDCProvider` - mock OIDC provider for auth tests
- Database truncation between tests for isolation
- Helper functions for creating canvases, events, executions

### Weaknesses

**Near-zero `t.Parallel()` usage:** Only 2 calls to `t.Parallel()` across 388 test files. This means the entire test suite runs sequentially, increasing CI feedback time. Given that tests share a database (with truncation), parallelism would require per-test database isolation.

**Minimal `t.Helper()` usage:** Only 13 calls to `t.Helper()` across all test helper functions. Many helper functions in `test/support/` that call `t.Fatal` or `require.NoError` should be marked as `t.Helper()` so failure stack traces point to the calling test, not the helper.

**No mock generation framework:** No use of mockery, gomock, or similar. Tests rely on hand-crafted test doubles (`DummyIntegration`) or real database interactions. While this provides high-fidelity tests, it makes the test suite slow and tightly coupled to infrastructure (PostgreSQL, potentially RabbitMQ).

**Global state mutation in integration tests:** The Telegram tests replace `http.DefaultTransport` globally with `withDefaultTransport()`. While they restore it via `t.Cleanup`, this is not safe with parallel test execution and indicates a design that could benefit from dependency injection of HTTP clients.

**Database dependency:** Most tests require a running PostgreSQL database (`support.Setup` calls `database.TruncateTables()`). There is no in-memory database alternative, making tests impossible to run without infrastructure.

### Sample Test Quality (Representative)

**pkg/integrations/telegram/send_message_test.go** - GOOD quality:
- Clear setup/execute/assert structure
- Tests both error paths (invalid config, missing fields) and happy paths
- HTTP responses mocked via RoundTripper
- Assertion on specific error messages
- Proper use of `require` vs `assert`

**pkg/workers/node_executor_test.go** - EXCELLENT quality:
- Tests concurrent processing with goroutines and channels
- Verifies database-level locking behavior (SKIP LOCKED)
- Validates that exactly one worker succeeds and one gets locked out
- Tests both canvas and blueprint execution paths

---

## 3. Test Types Distribution

### Unit Tests
**Count:** ~350 test files in `pkg/`
**Focus:** Integration adapters (setup, execute, validation), component logic, worker behavior, gRPC actions, configuration parsing.
**Note:** Many "unit" tests require a database connection, making them technically integration tests. True unit tests (no external dependencies) are limited to crypto, configuration parsing, and some component setup validation.

### Integration Tests
**Count:** ~40 test files (workers, gRPC actions with database)
**Focus:** Worker execution flows, gRPC action handlers that interact with models and database.
**Infrastructure required:** PostgreSQL, potentially RabbitMQ for consumer tests.

### End-to-End Tests
**Location:** `test/e2e/` (17 test files, 17 test functions)
**Framework:** Playwright (Go bindings)
**Coverage areas:**
| E2E Test File | Feature Tested |
|--------------|----------------|
| `owner_setup_test.go` | Initial owner/admin setup |
| `login_page_test.go` | Authentication flow |
| `organization_test.go` | Organization CRUD |
| `canvas_page_test.go` | Canvas creation and interaction |
| `approvals_test.go` | Approval workflow |
| `secrets_test.go` | Secret management |
| `roles_test.go` | Role-based access control |
| `groups_test.go` | Group management |
| `members_test.go` | Member management |
| `invitations_test.go` | Invitation flow |
| `service_accounts_test.go` | Service account management |
| `time_gate_test.go` | Time-gated execution |
| `wait_test.go` | Wait component behavior |
| `webhook_reset_test.go` | Webhook reset functionality |
| `agent_mode_test.go` | Agent mode features |
| `home_page_test.go` | Home page rendering |

**E2E infrastructure:**
- Full server bootstrap via `TestContext.Start()` (sets 25+ environment variables)
- Playwright browser automation
- VCR cassettes for GitHub trigger recording/replay (2 cassettes)
- Session management via `test/e2e/session/`
- Shared step definitions in `test/e2e/shared/`

### Consumer Tests
**Location:** `test/consumer/consumer.go`
**Type:** RabbitMQ message consumer test helper
**Note:** This is a test utility, not standalone tests. Used by other tests to verify message publishing.

### Missing Test Types
- **Performance/load tests:** None found
- **Contract tests:** None found (no API contract validation between services)
- **Chaos/resilience tests:** None found
- **Security-focused tests:** No dedicated security test suite (fuzz testing, injection testing)
- **Snapshot/golden file tests:** None found

---

## 4. Critical Untested Paths

### P0 - Security-Critical Gaps

#### JWT Token Generation and Validation (pkg/jwt/)
**Risk: 9.0/10** -- Zero tests for 99 lines of security-critical code.

The `jwt.go` file implements:
- `Generate()` - Creates HS256 JWT tokens with iat, nbf, exp, sub claims
- `Validate()` - Validates token signature, expiration, not-before, and subject matching
- `ValidateAndGetClaims()` - Validates and returns claims map

Missing test scenarios:
- Token generation with various durations (including zero/negative)
- Token validation with expired tokens
- Token validation with wrong subject
- Token validation with tampered signature
- Token validation with wrong signing method (algorithm confusion attack)
- Token validation with empty/nil secret
- `ValidateAndGetClaims` with malformed tokens
- Race condition: token generated just before expiry boundary

#### Secrets Provider (pkg/secrets/)
**Risk: 8.5/10** -- Zero tests for encryption/decryption of secrets.

Missing test scenarios:
- `NewProvider()` with valid local secret
- `NewProvider()` with unsupported provider type
- `NewProvider()` with non-existent secret name
- `LocalProvider.Load()` - successful decryption
- `LocalProvider.Load()` - decryption failure (corrupt data, wrong key)
- Secret loading with different domain types

#### Crypto - Untested Functions (pkg/crypto/)
**Risk: 7.0/10** -- `password.go` and `random.go` have zero tests.

Missing test scenarios:
- Password hashing and verification
- Password comparison with wrong password
- Random byte generation (length, uniqueness)
- Edge cases: empty password, very long password

### P1 - Business-Critical Gaps

#### Models Package (pkg/models/) - 26 of 28 files untested
**Risk: 8.5/10** -- The data layer underpins all business logic.

Untested model files include:
- `canvas.go` - Canvas CRUD, state management
- `canvas_event.go` - Event creation, querying
- `canvas_node_execution.go` - Execution state machine
- `canvas_node.go` - Node configuration
- `canvas_version.go` - Version management
- `secret.go` - Secret storage
- `webhook.go` - Webhook lifecycle
- `organization.go` - Organization management
- `user.go` - User management
- `integration.go` - Integration state
- `blueprint.go` - Blueprint management

Missing test scenarios per critical model:
- **canvas.go:** Create, find, update state, delete, list by organization, concurrent updates
- **canvas_node_execution.go:** State transitions (pending -> started -> finished/failed), result assignment, concurrent lock acquisition
- **secret.go:** Create encrypted, find by name, update, delete, list by domain
- **user.go:** Create, find by email, update, deactivate

#### gRPC Service Layer (pkg/grpc/ root) - 16 of 17 services untested
**Risk: 8.0/10** -- Service files wire together authorization, validation, and actions.

Untested services:
- `canvas_service.go` - Canvas API surface
- `secret_service.go` - Secret API surface
- `organization_service.go` - Organization API surface
- `integration_service.go` - Integration API surface
- `blueprint_service.go` - Blueprint API surface
- `roles_service.go` - RBAC API surface
- `trigger_service.go` - Trigger API surface
- All other service files

**Note:** The gRPC actions underneath are partially tested, but the service routing/middleware layer is not.

#### gRPC Canvas Actions - 23 of 36 untested
**Risk: 6.5/10**

Critical untested actions:
- `create_canvas_change_request.go` - Change management
- `publish_canvas_change_request.go` - Publishing workflow
- `invoke_node_execution_action.go` - Manual execution triggering
- `invoke_node_trigger_action.go` - Manual trigger firing
- `send_ai_message.go` - AI agent interaction
- `sandbox_mode.go` - Sandbox execution
- `cancel_execution.go` - Has test, but other execution lifecycle actions don't

#### CLI Package - 1 test for 42 source files
**Risk: 7.5/10**

Untested CLI commands:
- Canvas operations: create, get, list, publish, active
- Event operations: list, list_executions
- Execution operations: cancel, list
- Secret operations: create, delete, get, list, update
- Integration operations: get, list, list_resources
- Queue operations: delete, list
- Index operations: components, integrations, triggers
- Core: client.go, connect.go, configuration.go, contexts.go

#### Server Bootstrap (pkg/server/)
**Risk: 7.5/10** -- 469 lines of server initialization with zero tests.

Missing test scenarios:
- Server starts with valid configuration
- Server handles missing required config
- Server wires all services correctly
- Graceful shutdown behavior
- Health check endpoint responds correctly on startup

### P2 - Important Gaps

#### Worker Contexts - 13 of 18 untested
Missing tests for:
- `auth_context.go` - Authorization context building
- `secrets_context.go` - Secret resolution during execution
- `canvas_memory_context.go` - Memory access during execution
- `execution_request_context.go` - Execution request building
- `webhook_context.go` - Webhook data preparation

#### Worker Event Distribution - Entirely untested
The `pkg/workers/eventdistributer/` subdirectory (4 files) has no tests:
- `canvas.go` - Canvas event distribution
- `event_created.go` - Event creation handling
- `execution.go` - Execution event distribution
- `queue_item.go` - Queue item management

#### Untested Worker Lifecycle
- `event_distributer.go` - Event distribution orchestration
- `integration_cleanup_worker.go` - Integration cleanup
- `webhook_cleanup_worker.go` - Webhook cleanup

#### Hetzner Integration - 0 tests for 8 source files
The only integration with zero test coverage:
- create_server, create_load_balancer, create_snapshot
- delete_server, delete_load_balancer, delete_snapshot
- client, registration

#### gRPC Actions - Entire Subdirectories Untested
- `blueprints/` (7 files, 0 tests) - Blueprint CRUD operations
- `components/` (3 files, 0 tests) - Component listing
- `integrations/` (1 file, 0 tests) - Integration operations
- `me/` (2 files, 0 tests) - Current user profile
- `serviceaccounts/` (7 files, 0 tests) - Service account CRUD
- `triggers/` (2 files, 0 tests) - Trigger operations
- `widgets/` (2 files, 0 tests) - Widget operations
- `messages/` (7 files, 0 tests) - Message serialization

#### Start Trigger (pkg/triggers/start/) - 0 tests
The `start` trigger has 2 source files but no tests, while `schedule` and `webhook` triggers have tests.

---

## 5. Frontend Test Gap Analysis

### The Scale of the Gap

| Metric | Value |
|--------|-------|
| Frontend source files (.ts/.tsx) | 649 |
| Frontend test files | 1 |
| Test-to-source ratio | **0.15%** |
| Storybook story files | 69 |
| Pages directory files | 332 |
| UI component files | 195 |
| Hooks | 16 |
| Utility files | 10 |
| API client files | 16 |
| Test framework | Vitest (configured, barely used) |

### The Single Test File

`web_src/src/components/AutoCompleteInput/core.spec.ts` tests the `getSuggestions()` function with 8 test cases covering:
- Environment key suggestions after `$` trigger
- Dot-field suggestions from resolved globals
- Expandable field handling
- Internal metadata key filtering
- Built-in function prefix matching
- `root()` and `previous()` payload field suggestions

This is a well-written test file using Vitest with good edge case coverage -- but it is the **only** frontend test.

### Highest-Priority Frontend Test Gaps

**Tier 1 - Logic and Utilities (pure functions, easy to test):**
- `utils/cron.ts` - Cron expression handling
- `utils/date.ts` - Date formatting/parsing
- `utils/errors.ts` - Error handling utilities
- `utils/colors.ts` - Color utilities
- `utils/components.ts` - Component utilities
- `utils/integrationDisplayName.ts` - Display name resolution
- `utils/timezone.ts` - Timezone handling
- `utils/withOrganizationHeader.ts` - HTTP header injection
- `lib/` (5 files) - Library utilities

**Tier 2 - Hooks (testable with React Testing Library):**
- 16 custom hooks in `hooks/` directory - state management, API interactions

**Tier 3 - Components (testable with component testing):**
- 66 component files in `components/`
- 195 UI component files in `ui/`
- Note: 69 Storybook stories exist and could serve as a foundation for component tests

**Tier 4 - Pages (require more integration-style testing):**
- 332 page files representing the application's feature surface

### Storybook as Partial Mitigation

The 69 Storybook story files provide visual documentation and manual testing capability for UI components. However, Storybook stories are NOT automated tests -- they do not assert behavior, catch regressions, or run in CI. They could be converted to interaction tests using Storybook's play functions or used as a basis for visual regression testing with Chromatic.

---

## 6. Test Infrastructure Assessment

### Test Support Package (`test/support/`)

| File | Purpose | Quality |
|------|---------|---------|
| `support.go` | Core test setup: creates org, user, registry, encryptor | Good - provides `Setup()` and `SetupWithOptions()` |
| `application.go` | `DummyIntegration` and `DummyComponent` test doubles | Good - configurable behavior via options |
| `oidc_provider.go` | Mock OIDC provider for auth testing | Adequate - returns static test values |
| `contexts/contexts.go` | Test context implementations (Integration, Metadata) | Good - implements core interfaces |

**Helper functions in support.go** (sampled):
- `CreateCanvas()` - Creates canvas with nodes and edges
- `EmitCanvasEventForNode()` - Emits test events
- `CreateCanvasNodeExecution()` - Creates test executions

**Gaps in test infrastructure:**
- No test database factory/builder pattern for complex entity graphs
- No test data cleanup beyond `TruncateTables()` (full truncation every test)
- No test fixtures for common scenarios (e.g., "canvas with approval workflow")
- Missing `t.Helper()` annotations on most helper functions

### Test Fixtures (`test/fixtures/`)

| Directory | Contents |
|-----------|----------|
| `oidc-keys/` | RSA key file (`1769104302.pem`) for OIDC testing |

The fixture directory is minimal. No JSON fixtures, no YAML test data, no golden files.

### E2E Test Infrastructure

| Component | Implementation | Quality |
|-----------|---------------|---------|
| Browser automation | Playwright (Go bindings) | Good - mature framework |
| Server management | Full server bootstrap in-process | Good - realistic testing |
| VCR recording | `test/e2e/vcr/` with YAML cassettes | Minimal - only 2 cassettes for GitHub triggers |
| Session management | `test/e2e/session/` package | Good |
| Shared steps | `test/e2e/shared/` (component_steps, canvas_steps) | Good - DRY test code |
| Query helpers | `test/e2e/queries/` package | Good |

### Testify Usage Patterns

| Pattern | Count | Assessment |
|---------|-------|------------|
| `require.NoError` | Dominant pattern | Correct - stops test on unexpected errors |
| `require.ErrorContains` | Common | Good - validates specific error messages |
| `assert.Equal` | Common | Correct - non-fatal value comparison |
| `assert.Contains` | Common | Good - partial string matching |
| `testify/suite` | 0 uses | Not used - tests use standard Go test functions |
| `testify/mock` | 0 uses | Not used - hand-crafted doubles instead |

---

## 7. Flaky Test Indicators

### Low Flakiness Risk (Overall)

The test suite shows minimal signs of flakiness:

| Indicator | Count | Severity | Details |
|-----------|-------|----------|---------|
| `time.Sleep` in tests | 2 | Low | Both in `canvas_page_test.go` E2E tests (200ms waits) -- acceptable for UI animation settling |
| External HTTP calls | 0 | None | All HTTP interactions are mocked |
| `os.Getenv` in tests | 3 | Low | E2E tests read env vars set by `TestContext.Start()`, deterministic |
| `t.Parallel()` | 2 | N/A | Almost no parallelism means no parallel-related flakiness |
| Global state mutation | 3 | Medium | Telegram tests replace `http.DefaultTransport` -- would break under parallelism |
| Database dependency | High | Medium | All integration-style tests require PostgreSQL -- network/infra issues cause failures |
| RabbitMQ dependency | Low | Medium | Consumer test helper connects to RabbitMQ -- flaky if queue unavailable |

### Specific Flaky Risk Areas

1. **`test/e2e/canvas_page_test.go` lines 247 and 406:** `time.Sleep(200 * time.Millisecond)` -- these sleeps are UI timing hacks. Consider using Playwright's `WaitForSelector` or `WaitForLoadState` instead.

2. **Telegram RoundTripper replacement:** `withDefaultTransport()` mutates `http.DefaultTransport` globally. If tests ever run in parallel, this will cause intermittent failures.

3. **`test/consumer/consumer.go`:** The `waitForInitialization()` function polls `consumer.State` in a `time.Sleep(100ms)` loop. If RabbitMQ is slow to respond, this could time out.

4. **Concurrency test (`node_executor_test.go`):** Tests concurrent database locking with goroutines. While well-designed, database lock timing can vary under load.

---

## 8. Missing Test Scenarios by Critical Package

### pkg/jwt/ (P0 - 0 tests)

| Scenario | Type | Priority |
|----------|------|----------|
| Generate token with valid subject and duration | Happy path | P0 |
| Generate token with zero duration | Edge case | P0 |
| Validate token with correct subject | Happy path | P0 |
| Validate expired token | Error path | P0 |
| Validate token with wrong subject | Security | P0 |
| Validate token with tampered payload | Security | P0 |
| Validate token with wrong signing algorithm | Security (alg confusion) | P0 |
| Validate token with empty string | Edge case | P1 |
| ValidateAndGetClaims returns correct claims | Happy path | P0 |
| ValidateAndGetClaims with expired token | Error path | P0 |
| Generate with empty secret | Edge case | P1 |

### pkg/secrets/ (P0 - 0 tests)

| Scenario | Type | Priority |
|----------|------|----------|
| NewProvider with local provider type | Happy path | P0 |
| NewProvider with unsupported provider type | Error path | P0 |
| NewProvider with non-existent secret name | Error path | P0 |
| LocalProvider.Load decrypts secrets correctly | Happy path | P0 |
| LocalProvider.Load with corrupt encrypted data | Error path | P0 |
| LocalProvider.Load with wrong encryption key | Error path | P0 |
| Secret loading across different domain types | Boundary | P1 |

### pkg/models/ (P0 - 26 files untested)

| Model | Key Missing Scenarios |
|-------|----------------------|
| `canvas.go` | Create, find by ID, find by org, update state, delete, list with pagination |
| `canvas_node_execution.go` | State machine transitions, result assignment, find by canvas+node, concurrent locking |
| `secret.go` | Create encrypted, find by name+domain, update value, delete, uniqueness constraints |
| `user.go` | Create, find by email, find by ID, update profile, deactivate |
| `organization.go` | Create, find by ID, update, member association |
| `webhook.go` | Create, find by URL, update state, cleanup expired |
| `integration.go` | Create, find by name, update config, list by org |
| `canvas_event.go` | Create with payload, find by canvas, list chronologically |
| `blueprint.go` | Create, update, delete, version management |

### pkg/grpc/actions/canvases/ (P2 - 23 actions untested)

| Action | Risk Level | Missing Scenarios |
|--------|-----------|-------------------|
| `invoke_node_execution_action.go` | High | Manual execution trigger, authorization check, invalid node ID |
| `publish_canvas_change_request.go` | High | Publish flow, conflict detection, authorization |
| `create_canvas_change_request.go` | High | Change request creation, validation, diff generation |
| `sandbox_mode.go` | High | Sandbox activation, execution isolation |
| `send_ai_message.go` | Medium | AI agent message handling, error cases |
| `cancel_execution.go` (has test) | -- | Already tested |
| Remaining 18 actions | Medium | CRUD operations, serialization, authorization |

### pkg/workers/ (P2 - event distribution untested)

| Component | Missing Scenarios |
|-----------|-------------------|
| `event_distributer.go` | Event routing to correct nodes, fan-out behavior, error handling |
| `eventdistributer/canvas.go` | Canvas-level event processing |
| `eventdistributer/execution.go` | Execution event lifecycle |
| `integration_cleanup_worker.go` | Cleanup on integration removal, orphan detection |
| `webhook_cleanup_worker.go` | Expired webhook cleanup, concurrent cleanup safety |
| Context files (13 untested) | Context building, error handling, nil/missing data cases |

### pkg/cli/ (P1 - 41 files untested)

| Command Group | Files | Missing Scenarios |
|--------------|-------|-------------------|
| `canvases/` | 9 | Create, get, list, publish, update, active -- all need CLI argument parsing + API call tests |
| `secrets/` | 7 | Create, delete, get, list, update + common helpers |
| `events/` | 3 | List events, list executions |
| `executions/` | 3 | Cancel, list |
| `integrations/` | 4 | Get, list, list_resources |
| `queue/` | 3 | Delete, list |
| `index/` | 4 | Components, integrations, triggers, root |
| Core files | 8 | Client, connect, configuration, contexts, root, whoami |

---

## 9. Projected Coverage Impact

### Quick Wins (highest coverage gain per test effort)

| Action | Estimated Effort | Coverage Gain | ROI |
|--------|-----------------|---------------|-----|
| Add JWT tests (11 scenarios) | 2 hours | +99 lines covered | Very High |
| Add secrets provider tests (7 scenarios) | 2 hours | +80 lines covered | Very High |
| Add crypto password/random tests | 1 hour | +40 lines covered | High |
| Add model unit tests for top 5 models | 8 hours | +1,500 lines covered | High |
| Add frontend utility tests (10 files) | 4 hours | +300 lines covered | High |

### Medium-Term Improvements

| Action | Estimated Effort | Coverage Gain |
|--------|-----------------|---------------|
| Add CLI command tests (10 core commands) | 16 hours | +1,500 lines |
| Add gRPC service layer tests | 16 hours | +2,000 lines |
| Add remaining canvas action tests (23 actions) | 24 hours | +3,000 lines |
| Add frontend hook tests (16 hooks) | 8 hours | +800 lines |
| Add frontend component tests (top 20) | 16 hours | +2,000 lines |

### Long-Term Improvements

| Action | Estimated Effort | Coverage Gain |
|--------|-----------------|---------------|
| Comprehensive frontend test suite | 80 hours | +20,000 lines |
| Worker event distribution tests | 16 hours | +1,000 lines |
| Contract tests for gRPC API | 24 hours | API stability |
| Performance test suite | 40 hours | Performance baseline |

---

## 10. Recommendations

### Immediate Actions (This Sprint)

1. **Add JWT tests** -- This is a 2-hour task with critical security impact. Token generation/validation is the authentication backbone.

2. **Add secrets provider tests** -- Another 2-hour task. Secret loading/decryption errors should never reach production silently.

3. **Add `t.Helper()` to all test support functions** -- 30-minute improvement that makes every test failure message more readable.

### Short-Term (Next 2 Sprints)

4. **Establish frontend testing baseline** -- Start with utility functions (pure functions, easy to test). Add Vitest tests for all 10 files in `utils/`. Then expand to hooks.

5. **Add model layer tests** -- Focus on the 5 most critical models (canvas, canvas_node_execution, secret, user, organization). Test CRUD operations and state transitions.

6. **Test gRPC blueprint and service account actions** -- These are full CRUD surfaces with zero coverage.

### Structural Improvements

7. **Add `t.Parallel()` to independent test functions** -- Start with packages that don't share database state (crypto, configuration, CLI argument parsing).

8. **Create test fixture builders** -- Replace manual test data creation with builder patterns for common entity graphs (e.g., `NewCanvasFixture().WithNodes(3).WithApproval().Build()`).

9. **Convert Storybook stories to interaction tests** -- Use Storybook's play functions to add automated assertions to existing stories.

10. **Introduce database-free unit tests** -- Add interfaces to the model layer so gRPC actions can be tested with in-memory fakes, reducing test infrastructure requirements.

---

## Appendix: Raw Metrics

| Metric | Value |
|--------|-------|
| Total Go source files | 1,055 |
| Total Go test files | 388 |
| Total test functions | 1,151 |
| Total `t.Run()` subtests | 2,581 |
| Test-to-source file ratio | 36.8% |
| Packages with zero tests | 13 (11 excluding generated) |
| Frontend source files | 649 |
| Frontend test files | 1 |
| Frontend test ratio | 0.15% |
| E2E test functions | 17 |
| Storybook stories | 69 |
| Table-driven test patterns | 109 |
| `t.Parallel()` usage | 2 |
| `time.Sleep` in tests | 2 |
| Testify adoption | 380 files (98% of test files) |
| Mock framework usage | 0 (hand-crafted doubles) |
