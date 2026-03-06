# Superplane Code Quality & Complexity Analysis

**Date**: 2026-03-06
**Scope**: Full codebase -- Go backend (`pkg/`, `cmd/`) + React/TypeScript frontend (`web_src/`)
**Tool**: AQE v3 Code Complexity Analyzer

---

## Executive Summary

Superplane is a well-structured Go monolith with a clean plugin architecture for integrations. The codebase demonstrates strong separation of concerns via interfaces, a thoughtful registry pattern, and consistent conventions across 37 integrations. However, it carries measurable technical debt in several areas: two bidirectional package dependencies, a handful of extremely long functions, sparse frontend testing, and a monolithic workflow page that accounts for 80% of the frontend code surface.

| Metric | Value | Rating |
|--------|-------|--------|
| Total Go files | 1,443 | -- |
| Total Go LOC | 323,883 | -- |
| Source (non-generated, non-test) | ~784 files, ~150K LOC | -- |
| Frontend TS/TSX files | 656 | -- |
| Frontend LOC | 113,501 | -- |
| Avg cyclomatic complexity | Low (majority < 10) | GOOD |
| Functions with CC > 10 | 311 | MEDIUM |
| Functions with CC > 20 | 40 | WARNING |
| Max nesting depth (non-generated) | 22 levels | CRITICAL |
| Bidirectional package deps | 2 pairs | WARNING |
| Frontend test files | 1 | CRITICAL |
| Technical debt markers (TODO) | 11 | LOW |

**Overall Quality Score: 72/100 (Good)**

---

## 1. Code Complexity Analysis

### 1.1 Cyclomatic Complexity Distribution

| CC Range | Classification | Functions | Percentage |
|----------|---------------|-----------|------------|
| 1-5 | Low | ~2,800 | ~82% |
| 6-10 | Medium | ~300 | ~9% |
| 11-20 | High | 271 | ~8% |
| 21-30 | Critical | 33 | ~1% |
| >30 | Extreme | 7 | <0.3% |

The vast majority of functions are simple and well-decomposed. The high-complexity tail is concentrated in two patterns: `ListResources()` switch statements and `Configuration()` field-builder methods.

### 1.2 Top 15 Most Complex Functions (Non-Test, Non-Generated)

| CC | Nesting | Lines | Location | Function |
|----|---------|-------|----------|----------|
| 47 | 6 | 178 | `pkg/integrations/hetzner/hetzner.go:98` | `ListResources` |
| 36 | 5 | 101 | `pkg/configuration/validation.go:581` | `validateFieldValue` |
| 35 | 3 | 118 | `pkg/integrations/rootly/on_incident_timeline_event.go:222` | `HandleWebhook` |
| 30 | 3 | 134 | `pkg/integrations/slack/slack.go:384` | `handleInteractivity` |
| 30 | 3 | 97 | `pkg/integrations/launchdarkly/on_feature_flag_change.go:174` | `HandleWebhook` |
| 30 | 3 | 78 | `pkg/triggers/schedule/schedule.go:494` | `getNextTrigger` |
| 30 | 3 | 75 | `pkg/integrations/gcp/gcp.go:560` | `ListResources` |
| 29 | 6 | 204 | `pkg/workers/contexts/process_queue_context.go:32` | `BuildProcessQueueContext` |
| 28 | 4 | 127 | `pkg/integrations/sendgrid/send_email.go:311` | `Execute` |
| 28 | 4 | 86 | `pkg/integrations/harness/on_pipeline_completed.go:194` | `Setup` |
| 27 | 11 | 899 | `pkg/integrations/gcp/compute/create_vm.go:1376` | `Configuration` |
| 27 | 5 | 136 | `pkg/public/setup_owner.go:36` | `setupOwner` |
| 27 | 4 | 168 | `pkg/integrations/servicenow/list_resources.go:10` | `ListResources` |
| 26 | 5 | 106 | `pkg/cli/commands/canvases/update.go:22` | `Execute` |
| 26 | 3 | 108 | `pkg/integrations/statuspage/update_incident.go:327` | `Execute` |

### 1.3 Longest Non-Test Functions

| Lines | File | Function |
|-------|------|----------|
| 1,159 | `pkg/integrations/aws/ecs/service.go:247` | `ecsServiceMutationFields` |
| 899 | `pkg/integrations/gcp/compute/create_vm.go:1376` | `Configuration` |
| 374 | `pkg/integrations/aws/ecs/run_task.go:155` | `Configuration` |
| 254 | `pkg/integrations/gcp/cloudbuild/create_build.go:121` | `Configuration` |
| 253 | `pkg/components/http/http.go:182` | `Configuration` |
| 204 | `pkg/workers/contexts/process_queue_context.go:32` | `BuildProcessQueueContext` |
| 178 | `pkg/integrations/hetzner/hetzner.go:98` | `ListResources` |
| 168 | `pkg/integrations/servicenow/list_resources.go:10` | `ListResources` |

**Pattern**: Nearly all extreme-length functions are `Configuration()` methods that build form field definitions. These are declarative in nature (low logical complexity despite high line count) but would benefit from a builder pattern or data-driven approach.

### 1.4 Deepest Nesting

| Depth | File | Function |
|-------|------|----------|
| 22 | `pkg/integrations/aws/ecs/service.go:247` | `ecsServiceMutationFields` |
| 17 | `pkg/integrations/aws/ecs/run_task.go:155` | `Configuration` |
| 11 | `pkg/integrations/statuspage/update_incident.go:100` | `Configuration` |
| 11 | `pkg/integrations/statuspage/create_incident.go:114` | `Configuration` |
| 11 | `pkg/integrations/gcp/compute/create_vm.go:1376` | `Configuration` |
| 11 | `pkg/components/approval/approval.go:353` | `Configuration` |

The AWS ECS `ecsServiceMutationFields` function at nesting depth 22 is the single most structurally complex function in the codebase. This is caused by deeply nested configuration field groups. While it compiles and works, it is extremely difficult to test, review, or modify safely.

---

## 2. Code Smells

### 2.1 Duplicate Patterns

The integration plugin architecture results in significant structural duplication:

| Pattern | Instances | Assessment |
|---------|-----------|------------|
| `HandleWebhook()` implementations | 229 | Expected -- interface contract |
| `Configuration()` field builders | 268 | Expected but could benefit from DSL/builder |
| `Execute()` implementations | 173 | Expected -- interface contract |
| `ListResources()` switch blocks | 50 | Repetitive -- each follows identical list/convert pattern |
| `init()` registration functions | 58 | Expected -- plugin registration |

The `ListResources()` pattern across integrations (Hetzner, GCP, ServiceNow, AWS, etc.) shows nearly identical code structure: call client method, iterate results, convert to `core.IntegrationResource`. This is a candidate for a generic helper or code generation.

### 2.2 Oversized Files

| Lines | File | Assessment |
|-------|------|------------|
| 5,698 | `pkg/protos/canvases/canvases.pb.go` | Generated -- acceptable |
| 3,456 | `pkg/protos/organizations/organizations.pb.go` | Generated -- acceptable |
| 2,532 | `pkg/openapi_client/api_organization.go` | Generated -- acceptable |
| 2,368 | `pkg/integrations/gcp/compute/create_vm.go` | **Hand-written -- too large** |
| 1,406 | `pkg/integrations/aws/ecs/service.go` | **Hand-written -- too large** |
| 1,325 | `pkg/integrations/gcp/compute/list_resource_handler.go` | **Hand-written -- borderline** |
| 1,255 | `pkg/grpc/actions/canvases/send_ai_message.go` | **Hand-written -- too large** |
| 1,236 | `pkg/authorization/service.go` | **Hand-written -- borderline** |
| 1,208 | `pkg/grpc/actions/common.go` | **Hand-written -- too large** |
| 1,166 | `pkg/integrations/aws/ecs/run_task.go` | **Hand-written -- too large** |
| 998 | `pkg/public/server.go` | **Hand-written -- borderline** |

### 2.3 Error Handling

| Pattern | Count | Assessment |
|---------|-------|------------|
| Naked `return err` (no wrapping) | 786 | WARNING -- 29% of error returns lack context |
| `fmt.Errorf` with `%w` (proper wrapping) | 1,918 | GOOD -- 71% properly wrap |
| Ignored errors (`_ = `) | 99 | MEDIUM -- several are in production paths |
| `panic()` in non-test code | 23 | WARNING -- 13 in server startup, 10 scattered |

Notable ignored errors in production code:
- `pkg/utils/json.go:11` -- silently ignores JSON unmarshal failures
- `pkg/integrations/honeycomb/client.go:284` -- silently ignores secret storage failure
- `pkg/integrations/incident/on_incident.go:131` -- silently ignores metadata decode failure
- `pkg/integrations/gitlab/gitlab.go:277-278` -- silently ignores OAuth token cleanup

The server startup uses `panic()` for missing configuration, which is acceptable Go practice for fatal initialization errors. However, `panic()` in `pkg/grpc/actions/common.go:1045` and `pkg/integrations/gcp/compute/create_vm.go:43` can crash the process during request handling.

### 2.4 Dead Code Indicators

- Only 11 TODO comments across the entire codebase -- remarkably clean
- Notable TODOs:
  - `pkg/public/server.go:126`: "implement origin checking" -- potential security concern
  - `pkg/grpc/actions/organizations/remove_user.go:32`: "this should all be inside of a transaction" -- data integrity risk
  - `pkg/grpc/actions/organizations/create_invitation.go:67,122`: "this is not using the transaction properly" -- data integrity risk

---

## 3. Architecture Analysis

### 3.1 Package Structure

```
pkg/
  core/           (829 LOC)   -- Interface definitions (Component, Integration, Trigger, Widget)
  configuration/  (1,361 LOC) -- Field type system and validation
  registry/       (985 LOC)   -- Plugin registration and discovery
  models/         (5,016 LOC) -- GORM data models
  database/       (119 LOC)   -- Connection management

  server/         (469 LOC)   -- Application bootstrap (init() side-effect imports)
  public/         (1,869 LOC) -- HTTP API server (REST + auth + webhooks)
  grpc/           (13,542 LOC)-- gRPC service layer + actions
  workers/        (5,819 LOC) -- Background processing (event routing, execution)

  integrations/   (104,424 LOC) -- 37 third-party integrations
  components/     (6,173 LOC)   -- 13 built-in components (approval, filter, merge, etc.)
  triggers/       (1,306 LOC)   -- 3 trigger types (schedule, start, webhook)
  widgets/        (53 LOC)      -- 1 widget (annotation)

  authentication/ (684 LOC)  -- Auth handlers
  authorization/  (1,515 LOC)-- Casbin-based RBAC
  jwt/            (99 LOC)   -- JWT utilities
  oidc/           (213 LOC)  -- OpenID Connect
  crypto/         (200 LOC)  -- Encryption/hashing
  secrets/        (80 LOC)   -- Secret provider

  cli/            (3,912 LOC)-- CLI commands
  telemetry/      (517 LOC)  -- OpenTelemetry + analytics beacon
  logging/        (94 LOC)   -- Log middleware
  templates/      (228 LOC)  -- Blueprint seeding
  utils/          (24 LOC)   -- Minimal utilities
```

**Assessment**: The package structure is excellent for a Go monolith. Clean separation between:
- **Domain interfaces** (`core/`) -- stable, well-documented
- **Plugin implementations** (`integrations/`, `components/`, `triggers/`) -- isolated and independently testable
- **Infrastructure** (`database/`, `grpc/`, `public/`) -- clear boundaries
- **Cross-cutting** (`authentication/`, `authorization/`, `crypto/`) -- properly factored

### 3.2 Dependency Graph

**Most depended-on packages (incoming dependencies):**

| Package | Dependents | Role |
|---------|-----------|------|
| `models` | 12 | Data layer -- expected hub |
| `crypto` | 10 | Cross-cutting -- expected |
| `configuration` | 9 | Type system -- expected |
| `registry` | 9 | Plugin discovery -- expected |
| `database` | 9 | Connection -- expected |
| `core` | 7 | Interfaces -- expected |

**High-coupling packages (outgoing + incoming):**

| Package | Out | In | Total | Assessment |
|---------|-----|-----|-------|-----------|
| `workers` | 16 | 3 | 19 | WARNING -- depends on too many packages |
| `grpc` | 14 | 4 | 18 | WARNING -- high fan-out |
| `server` | 16 | 0 | 16 | Acceptable -- composition root |
| `public` | 14 | 2 | 16 | WARNING -- doing too much |

### 3.3 Bidirectional Dependencies

Two problematic dependency cycles exist:

1. **`public` <-> `workers`**: The HTTP server and background workers have a circular dependency. This suggests shared concerns that should be extracted into a separate package.

2. **`grpc` <-> `workers`**: The gRPC layer and workers depend on each other. The `workers` package imports `grpc` for serialization helpers, while `grpc` imports `workers` for context building.

**Recommendation**: Extract shared types/helpers into a new `internal/shared` or `pkg/runtime` package to break these cycles.

### 3.4 Plugin Architecture (Strengths)

The plugin system is the architectural highlight:

- **Interface-driven**: `core.Component`, `core.Integration`, `core.Trigger`, `core.Widget` define clear contracts
- **Registry pattern**: `pkg/registry` provides type-safe discovery
- **`init()` registration**: Each integration self-registers -- zero boilerplate in the composition root
- **Side-effect imports**: `server.go` imports all plugins via `_` imports, keeping the registration list explicit
- **Testability**: Interfaces allow mocking; `core.HTTPContext` wraps `http.Client` for test injection
- **Configuration system**: The `configuration.Field` type system enables declarative UI generation from Go structs

---

## 4. Naming & Conventions

### 4.1 Go Idioms

| Practice | Status | Details |
|----------|--------|---------|
| Error wrapping with `%w` | GOOD | 71% of error returns use `fmt.Errorf` with `%w` |
| Interface naming (`-er` suffix) | PARTIAL | Some interfaces use `-er` (not all) |
| Get-prefix on methods | WARNING | 150 `Get*` methods -- non-idiomatic in Go |
| Package naming | GOOD | Lowercase, single-word where possible |
| Test file naming | GOOD | Consistent `*_test.go` convention |
| Comment style | GOOD | Multi-line `/* */` for interface docs, `//` for implementation |
| Error variables | GOOD | `Err*` prefix for sentinel errors |

### 4.2 Test Naming

Tests follow a clear `Test__<Component>__<Method>` double-underscore convention, which is non-standard but consistent and readable. This is a deliberate choice and works well with Go's test runner.

### 4.3 Global State

- **722 global variables** across the package tree -- most are constants, field definitions, or configuration defaults
- **58 `init()` functions** for plugin registration -- acceptable in this architecture
- **120 `context.Background()` calls** in non-test code -- some may indicate missing context propagation from HTTP/gRPC handlers into background operations

---

## 5. Technical Debt

### 5.1 TODO/FIXME Comments

Only 11 TODO comments -- exceptionally clean. However, the ones that exist are significant:

| Location | TODO | Severity |
|----------|------|----------|
| `pkg/public/server.go:126` | "implement origin checking" | HIGH -- CORS/security gap |
| `pkg/grpc/actions/organizations/remove_user.go:32` | "should all be inside of a transaction" | HIGH -- data integrity |
| `pkg/grpc/actions/organizations/create_invitation.go:67,122` | "not using the transaction properly" | HIGH -- data integrity |
| `pkg/integrations/aws/sns/on_topic_message.go:301` | "not fetch the certificate every time" | MEDIUM -- performance |
| `pkg/integrations/semaphore/client.go:232` | Empty TODO | LOW |

### 5.2 Go Module & Dependencies

- **Go version**: `go 1.25` -- cutting edge (released 2026)
- **Direct dependencies**: 40 -- reasonable for a project of this scope
- **Indirect dependencies**: ~80 -- manageable
- **Notable frameworks**: GORM (ORM), gorilla/mux (HTTP), gRPC, Casbin (RBAC), Cobra (CLI)
- **No deprecated packages detected** in direct dependencies
- **`github.com/golang/protobuf v1.5.4`**: Legacy protobuf package (superseded by `google.golang.org/protobuf`). Used alongside the modern package -- likely for compatibility with generated code. Should be migrated eventually.

### 5.3 Database Migrations

- **194 SQL migration files** with up/down pairs -- proper schema management
- Latest migration: `20260304` -- actively maintained
- Using golang-migrate compatible naming: `{timestamp}_{description}.{up|down}.sql`

### 5.4 Panic in Request Paths

Two `panic()` calls can crash the server during normal request handling:

1. `pkg/grpc/actions/common.go:1045` -- panics if JSON marshal fails for a default value
2. `pkg/integrations/gcp/compute/create_vm.go:43` -- panics if client factory not set
3. `pkg/database/connection.go:75,80` -- panics on DB connection failure (acceptable at startup)

These should be converted to error returns.

---

## 6. Frontend Quality (web_src/)

### 6.1 Overall Structure

| Metric | Value | Rating |
|--------|-------|--------|
| Total files | 656 | -- |
| Total LOC | 113,501 | -- |
| React components (.tsx) | 292 | -- |
| TypeScript files (.ts) | 357 | -- |
| Test files | 1 | CRITICAL |
| `any` type usage (non-generated) | 147 | WARNING |

### 6.2 Framework & Dependencies

- **React 19** with TypeScript 5.8
- **State management**: Zustand (1 store) + React Context (2 contexts) + TanStack Query for server state
- **UI library**: Radix UI primitives (29 packages) + Tailwind CSS 4
- **Routing**: react-router-dom v7
- **Build**: Vite 6
- **Canvas/Flow**: @xyflow/react (workflow editor)
- **Testing**: Vitest + React Testing Library (configured but barely used)
- **Storybook**: Configured with a11y addon

### 6.3 Component Organization

```
web_src/src/
  components/     -- 34 reusable UI components (well-organized)
  ui/             -- 70+ Radix-based primitive wrappers (shadcn/ui pattern)
  pages/          -- 7 route pages
    workflowv2/   -- 301 files, 39,226 LOC (!!!)
    organization/ -- 19 files, 6,079 LOC
    home/         -- 3 files, 1,198 LOC
    ...
  hooks/          -- 16 custom hooks
  stores/         -- 1 Zustand store
  contexts/       -- 2 React contexts
  api-client/     -- Generated API client
  lib/            -- Utility functions
```

### 6.4 Critical Findings

**The `workflowv2/` page is a god module.**

At 301 files and 39,226 lines, the `pages/workflowv2/` directory contains **80% of the frontend's non-generated code**. It includes:
- The main canvas editor (5,277 LOC in `index.tsx`)
- 150+ mapper files that translate between API types and UI state
- Inline utility functions (1,192 LOC in `utils.ts`)
- Multiple handler hooks

This is the primary contributor to frontend complexity and should be refactored into:
- A `features/canvas-editor/` module
- A separate `features/mappers/` module (or code-generated from protos)
- Shared utilities moved to `lib/`

**Largest frontend files:**

| Lines | File | Assessment |
|-------|------|------------|
| 5,277 | `pages/workflowv2/index.tsx` | CRITICAL -- god component |
| 4,043 | `api-client/types.gen.ts` | Generated -- acceptable |
| 2,956 | `ui/CanvasPage/storybooks/buildingBlocks.tsx` | Storybook data -- acceptable |
| 2,733 | `ui/CanvasPage/index.tsx` | WARNING -- should be decomposed |
| 1,568 | `components/AutoCompleteInput/AutoCompleteInput.tsx` | WARNING |
| 1,434 | `components/AutoCompleteInput/core.ts` | WARNING |
| 1,360 | `pages/custom-component/index.tsx` | WARNING |

**Testing is nearly absent.** Only 1 test file exists in the entire frontend. Given the complexity of the workflow editor, this represents the single largest quality risk in the project.

### 6.5 State Management

The state management approach is reasonable but inconsistent:
- **Zustand** (1 store: `nodeExecutionStore`) -- for execution-level state
- **React Context** (2 contexts: Account, Permissions) -- for auth/RBAC
- **TanStack Query** -- for server state (API calls)
- **React Flow** (`@xyflow/react`) -- manages canvas/node state internally

The minimal use of Zustand (1 store) combined with TanStack Query is a good pattern. However, the workflow editor likely has significant implicit state that should be more formally managed.

---

## 7. Refactoring Recommendations

### Priority 1 (High Impact, Moderate Effort)

| # | Recommendation | Impact | Files Affected |
|---|---------------|--------|----------------|
| 1 | **Break `public` <-> `workers` cycle**: Extract shared types into `pkg/runtime` | Removes circular dep, improves testability | ~20 files |
| 2 | **Break `grpc` <-> `workers` cycle**: Move serialization helpers to shared package | Removes circular dep | ~15 files |
| 3 | **Replace panics in request paths** with error returns | Prevents server crashes | 3 files |
| 4 | **Fix transaction TODOs** in organization management | Prevents data corruption | 2 files |

### Priority 2 (High Impact, High Effort)

| # | Recommendation | Impact | Files Affected |
|---|---------------|--------|----------------|
| 5 | **Add frontend tests**: Start with workflow editor integration tests | Catches regressions in most critical UI | 10+ new files |
| 6 | **Decompose `workflowv2/index.tsx`** (5,277 lines) into sub-components | Improves maintainability | 5-10 files |
| 7 | **Extract Configuration() builder DSL**: Create a fluent builder for field definitions | Reduces 268 verbose Configuration() methods by ~40% | 268 files |

### Priority 3 (Medium Impact, Low Effort)

| # | Recommendation | Impact | Files Affected |
|---|---------------|--------|----------------|
| 8 | **Wrap naked error returns**: Add context to the 786 bare `return err` statements | Improves debugging | ~200 files |
| 9 | **Generic ListResources helper**: Extract common list-and-convert pattern | Reduces 50 near-identical implementations | ~20 files |
| 10 | **Implement origin checking** (TODO at `public/server.go:126`) | Security improvement | 1 file |
| 11 | **Reduce `any` usage in frontend** (147 instances) | Improves type safety | ~50 files |
| 12 | **Remove `Get` prefix** from Go getter methods (150 instances) | Idiomatic Go | ~50 files |

---

## 8. Testability Assessment

### Backend Testability: 78/100 (Good)

| Factor | Score | Notes |
|--------|-------|-------|
| Interface coverage | 9/10 | Core interfaces are well-defined |
| Dependency injection | 8/10 | HTTP context injection, factory pattern for clients |
| Test file ratio | 7/10 | 388 test files for 784 source files (49.5%) |
| Test isolation | 8/10 | VCR for HTTP recording, mock contexts |
| Untested packages | 6/10 | 14 non-generated packages lack tests entirely |

**Untested packages of concern** (non-generated, non-trivial):
- `pkg/cli/` (6 files) -- CLI command handlers
- `pkg/core/` (4 files) -- Interface definitions (no testable logic)
- `pkg/integrations/hetzner/` (8 files) -- Full integration with no tests
- `pkg/workers/eventdistributer/` (4 files) -- Background event processing

### Frontend Testability: 15/100 (Critical)

| Factor | Score | Notes |
|--------|-------|-------|
| Test infrastructure | 8/10 | Vitest + RTL properly configured |
| Actual test coverage | 1/10 | 1 test file for 656 source files |
| Component isolation | 5/10 | Many god components that are hard to test |
| Storybook | 7/10 | Configured with a11y, some stories exist |

---

## 9. Package-Level Complexity Heatmap

```
Package               LOC    CC>10  Nesting>5  Risk
-------------------------------------------------------
integrations/aws     23,362    18       4      CRITICAL
integrations/gcp      8,680     8       2      HIGH
grpc/actions         13,542    12       0      HIGH
workers               5,819     8       1      HIGH
integrations/github   8,082     4       0      MEDIUM
authorization         1,515     4       0      MEDIUM
public                1,869     3       0      MEDIUM
configuration         1,361     2       0      MEDIUM
components            6,173     6       3      MEDIUM
All other packages       --    <3       0      LOW
```

---

## 10. Positive Findings

These aspects of the codebase deserve recognition:

1. **Clean plugin architecture**: The `core` interface + `registry` + `init()` registration pattern is a textbook example of extensible Go design
2. **Minimal technical debt markers**: Only 11 TODOs across 324K LOC is exceptionally clean
3. **Consistent test patterns**: VCR-based HTTP recording for integration tests, table-driven subtests
4. **Well-documented interfaces**: `pkg/core/component.go` has thorough docstrings on every method
5. **No inline SQL DDL**: All schema changes go through proper migrations (194 files)
6. **Clean dependency graph**: No dependency on internal packages from integrations (integrations only depend on `core`, `configuration`, `registry`, `crypto`, `utils`)
7. **Proper secret management**: Encryption at rest via `crypto.Encryptor` interface, no hardcoded secrets
8. **Modern stack**: Go 1.25, React 19, TypeScript 5.8, Vite 6 -- all current

---

*Report generated by AQE v3 Code Complexity Analyzer*
*Analysis covered 1,443 Go files (323,883 LOC) and 656 TypeScript files (113,501 LOC)*
