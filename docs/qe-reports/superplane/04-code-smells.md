# Code Smell Detection Report - Superplane

**Generated:** 2026-01-28
**Analyzer:** QE Code Reviewer Agent (qe-code-reviewer)
**Project:** superplane-analysis
**Languages:** Go (Backend), TypeScript/React (Frontend)

---

## Executive Summary

This report identifies code smells across the Superplane codebase, categorized by severity and smell type. The analysis covers structural smells, Go-specific anti-patterns, TypeScript/React smells, and general code quality issues.

### Smell Category Counts

| Category | Critical | Major | Minor | Total |
|----------|----------|-------|-------|-------|
| Structural Smells | 3 | 8 | 12 | 23 |
| Go-Specific Smells | 2 | 7 | 15 | 24 |
| TypeScript/React Smells | 2 | 6 | 9 | 17 |
| General Smells | 1 | 5 | 8 | 14 |
| **Total** | **8** | **26** | **44** | **78** |

### Overall Risk Assessment

| Metric | Rating |
|--------|--------|
| Code Health | **Moderate** |
| Technical Debt | **Medium-High** |
| Maintainability | **Needs Improvement** |
| Testability | **Good** |

---

## 1. Structural Smells

### 1.1 God Classes/Large Files (Critical)

Large files that handle too many responsibilities, violating the Single Responsibility Principle.

| File | Lines | Severity | Issue |
|------|-------|----------|-------|
| `web_src/src/pages/workflowv2/index.tsx` | 3,537 | **Critical** | Massive React component handling workflow state, rendering, events |
| `web_src/src/ui/CanvasPage/index.tsx` | 2,136 | **Critical** | Canvas component with excessive responsibilities |
| `pkg/openapi_client/api_organization.go` | 2,062 | **Critical** | Generated API client - consider code generation improvements |
| `pkg/authorization/service.go` | 1,290 | **Major** | Authorization service with many methods |
| `pkg/configuration/validation.go` | 994 | **Major** | Validation logic could be split by domain |
| `pkg/public/server.go` | 947 | **Major** | HTTP server with many route handlers |
| `web_src/src/components/AutoCompleteInput/AutoCompleteInput.tsx` | 1,568 | **Major** | Complex autocomplete component |
| `web_src/src/pages/custom-component/index.tsx` | 1,353 | **Major** | Custom component page with mixed concerns |

**Refactoring Suggestions:**
1. Split `workflowv2/index.tsx` into smaller focused components (WorkflowCanvas, WorkflowSidebar, WorkflowToolbar)
2. Extract business logic from React components into custom hooks
3. Consider implementing a micro-frontend architecture for large pages
4. Split `authorization/service.go` by permission domain (organization, workflow, user)

### 1.2 Long Parameter Lists (Major)

Functions with excessive parameters indicating missing abstractions.

| Location | Parameters | Issue |
|----------|------------|-------|
| `pkg/server/server.go:48` | 6 params | `startWorkers(jwtSigner, encryptor, registry, oidcProvider, baseURL, authService)` |
| `pkg/server/server.go:126` | 4 params | `startEmailConsumers(rabbitMQURL, encryptor, baseURL, authService)` |
| `pkg/server/server.go:163` | 7 params | `startInternalAPI(baseURL, webhooksBaseURL, basePath, encryptor, authService, registry, oidcProvider)` |
| `pkg/server/server.go:168` | 7 params | `startPublicAPI(baseURL, basePath, encryptor, registry, jwtSigner, oidcProvider, authService)` |
| `pkg/grpc/server.go:56` | 8 params | `RunServer(baseURL, webhooksBaseURL, basePath, encryptor, authService, registry, oidcProvider, port)` |
| `pkg/grpc/workflow_service.go:23` | 4 params | `NewWorkflowService(authService, registry, encryptor, webhookBaseURL)` |
| `pkg/public/server.go:87-99` | 11 params | `NewServer()` constructor |

**Refactoring Suggestions:**
1. Create configuration structs: `ServerConfig`, `WorkerConfig`, `APIConfig`
2. Use the builder pattern for complex object construction
3. Implement dependency injection containers

```go
// Example refactoring
type ServerConfig struct {
    BaseURL         string
    WebhooksBaseURL string
    BasePath        string
    Encryptor       crypto.Encryptor
    AuthService     authorization.Authorization
    Registry        *registry.Registry
    OIDCProvider    oidc.Provider
    Port            int
}

func RunServer(config ServerConfig) { ... }
```

### 1.3 Primitive Obsession (Minor)

Overuse of primitive types instead of domain-specific types.

| File | Line | Issue |
|------|------|-------|
| `pkg/triggers/schedule/schedule.go:47-55` | Multiple `*int` fields | Schedule intervals use raw int pointers |
| `pkg/models/*.go` | Various | UUIDs passed as strings instead of `uuid.UUID` type |
| `pkg/authorization/service.go` | Various | Domain types passed as plain strings |

**Refactoring Suggestions:**
1. Create domain types: `ScheduleInterval`, `DomainType`, `Permission`
2. Use value objects for composite values
3. Implement validation at the type level

---

## 2. Go-Specific Smells

### 2.1 Ignored Errors (Critical)

Errors silently discarded using blank identifier.

| File | Line | Code | Risk |
|------|------|------|------|
| `pkg/utils/json.go:11` | `_ = json.Unmarshal(data, target)` | **High** - Silent JSON parsing failure |
| `pkg/grpc/actions/triggers/describe_trigger.go:28` | `exampleData, _ = structpb.NewStruct(data)` | **Medium** - Struct conversion error ignored |
| `pkg/grpc/actions/workflows/update_workflow.go:58` | `nodes, edges, _ = remapNodeIDsForConflicts(...)` | **High** - Remapping errors silently dropped |
| `pkg/integrations/github/on_pr_comment.go:200` | `body, _ = review["body"].(string)` | **Medium** - Type assertion without check |
| `pkg/cli/list.go:42` | `_ = writer.Flush()` | **Low** - Writer flush error ignored |
| `pkg/public/server.go:898` | `_ = res.Body.Close()` | **Low** - Body close error (acceptable) |
| `pkg/templates/seed.go:207` | `_ = tx.Exec("SELECT pg_advisory_unlock(?)", seedLockID).Error` | **Medium** - Lock release error ignored |

**Total Ignored Errors in Non-Generated Code:** ~15 instances

**Refactoring Suggestions:**
1. At minimum, log ignored errors: `if err := ...; err != nil { log.Warn("...") }`
2. For critical operations, return errors to callers
3. Create error handling middleware for common patterns

### 2.2 Improper Context Usage (Major)

Using `context.Background()` in non-root contexts or ignoring context parameters.

| File | Line | Issue |
|------|------|-------|
| `pkg/server/server.go:64-122` | Multiple | Workers started with `context.Background()` instead of managed context |
| `pkg/grpc/actions/workflows/resolve_execution_errors.go:15` | `_ = ctx` | Context parameter explicitly ignored |
| `pkg/secrets/local_provider.go:29` | `context.TODO()` | Unresolved context placeholder in production code |

**Refactoring Suggestions:**
1. Pass context from server startup through worker lifecycle
2. Implement graceful shutdown using context cancellation
3. Replace `context.TODO()` with proper context propagation

### 2.3 Goroutine Patterns (Major)

Potential goroutine leak patterns and missing synchronization.

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `pkg/telemetry/periodic.go:25` | `go func() { ticker := ... }` | No cancellation mechanism |
| `pkg/telemetry/beacon.go:34` | `go func() { for range ticker.C }` | Runs forever, no shutdown |
| `pkg/server/server.go:64-122` | Multiple `go w.Start()` | Workers without coordinated shutdown |
| `pkg/grpc/actions/workflows/list_node_executions.go:105-132` | 4 goroutines with WaitGroup | **Good pattern** - proper synchronization |

**Refactoring Suggestions:**
1. Add context cancellation to all long-running goroutines
2. Implement `Stop()` methods for background workers
3. Use `errgroup` for coordinated goroutine management

### 2.4 Panic Usage (Minor)

Panics used for error handling in non-test code.

| File | Line | Context |
|------|------|---------|
| `pkg/server/server.go:53,289,309,314,325,330,336` | Server startup | Acceptable for fatal configuration errors |
| `pkg/database/connection.go:75,80` | DB connection | Acceptable for fatal startup |
| `pkg/grpc/server.go:135` | gRPC server | Fatal server error |
| `pkg/grpc/actions/common.go:983` | Default value marshal | Should return error instead |
| `pkg/cli/check.go:43` | CLI exit | Non-standard exit pattern |

**Refactoring Suggestions:**
1. Replace panics with error returns where possible
2. Use `log.Fatal()` for clearer intent on fatal errors
3. Implement proper error propagation in `common.go:983`

### 2.5 Interface Pollution (Minor)

Empty interfaces and overly broad interface usage.

**Instances Found:** 566 occurrences of `*string`, `*int`, `*bool` (nullable primitives)

| Pattern | Count | Files |
|---------|-------|-------|
| `interface{}` / `any` usage | ~120 | Various files |
| `map[string]interface{}` | ~200 | OpenAPI client, models |
| Nullable primitives | ~566 | Models, configuration |

**Note:** Many are in generated code (openapi_client) which is acceptable.

---

## 3. TypeScript/React Smells

### 3.1 Large Components (Critical)

Components exceeding reasonable size limits, indicating missing decomposition.

| Component | Lines | Issue |
|-----------|-------|-------|
| `pages/workflowv2/index.tsx` | 3,537 | **Critical** - Workflow orchestration page |
| `ui/CanvasPage/storybooks/buildingBlocks.tsx` | 2,939 | **Major** - Storybook data file (acceptable) |
| `ui/CanvasPage/index.tsx` | 2,136 | **Critical** - Canvas rendering logic |
| `components/AutoCompleteInput/AutoCompleteInput.tsx` | 1,568 | **Major** - Complex input component |
| `pages/custom-component/index.tsx` | 1,353 | **Major** - Custom component editor |
| `ui/chainItem/ChainItem.tsx` | 1,027 | **Major** - Chain item rendering |

**Refactoring Suggestions:**
1. Extract logic into custom hooks
2. Split into container/presentational components
3. Use compound component pattern for complex UIs
4. Extract state management to dedicated stores

### 3.2 Missing Error Boundaries (Major)

Only 1 file references ErrorBoundary implementation.

| Finding | Details |
|---------|---------|
| ErrorBoundary imports | `web_src/src/main.tsx` only |
| Critical pages without boundaries | workflowv2, CanvasPage, custom-component |

**Refactoring Suggestions:**
1. Add ErrorBoundary wrappers to route-level components
2. Implement fallback UIs for graceful degradation
3. Add error reporting to Sentry from boundaries

### 3.3 State Management Issues (Major)

Inconsistent state management patterns across the application.

| Pattern | Count | Location |
|---------|-------|----------|
| `useState` calls | 200 | 65 files |
| `useMemo`/`useCallback` | 317 | 57 files |
| Zustand stores | 1 | `stores/nodeExecutionStore.ts` |
| React Context | 4 | Various contexts |

**Issues Identified:**
1. Mixed state management (useState, Context, Zustand)
2. Potential missing memoization in large components
3. Props being passed through multiple levels

**Refactoring Suggestions:**
1. Establish clear state management guidelines
2. Migrate component-local state to Zustand where appropriate
3. Add more useMemo/useCallback in render-heavy components

### 3.4 ESLint Suppressions (Minor)

Disabled linting rules indicating potential issues.

| File | Line | Suppression |
|------|------|-------------|
| `pages/workflowv2/mappers/webhook.tsx:308` | `rules-of-hooks` | Hook called conditionally |
| `ui/componentSidebar/index.tsx:270` | `exhaustive-deps` | Missing useEffect dependencies |
| `ui/componentBase/index.tsx:129` | `no-explicit-any` | Type safety bypassed |
| `ui/CanvasPage/storybooks/navigation.tsx:68` | `no-explicit-any` | Type safety bypassed |
| `ui/CustomComponentBuilderPage/index.tsx:348` | `exhaustive-deps` | Missing useEffect dependencies |
| `ui/componentSidebar/SidebarEventItem/SidebarEventItem.tsx:193` | `exhaustive-deps` | Missing useEffect dependencies |

**Refactoring Suggestions:**
1. Fix conditional hook usage in `webhook.tsx`
2. Review and fix useEffect dependencies
3. Add proper types instead of `any`

### 3.5 TypeScript `any` Usage (Minor)

Excessive use of `any` type bypassing TypeScript's type safety.

| Category | Count | Files |
|----------|-------|-------|
| `any` type annotations | 92 | 24 TypeScript files |
| `@ts-ignore` directives | 0 | None (good!) |
| `eslint-disable` for `any` | 2 | 2 files |

**Note:** The codebase follows the guidance to avoid `@ts-ignore` (mentioned in AGENTS.md).

---

## 4. General Smells

### 4.1 Magic Numbers/Hardcoded Values (Major)

Hardcoded values that should be constants or configuration.

| File | Line | Value | Context |
|------|------|-------|---------|
| `pkg/server/server.go:222` | `8000` | Default public API port |
| `pkg/server/server.go:236` | `50051` | Default internal API port |
| `pkg/server/server.go:270` | `10*time.Second` | Shutdown timeout |
| `pkg/cli/config.go:12` | `http://localhost:8000` | Default API URL |
| `pkg/crypto/password.go:7` | `12` | bcrypt cost |
| `pkg/triggers/schedule/schedule.go` | `1-59`, `0-23` | Validation bounds (acceptable) |
| `pkg/public/server.go:56-62` | `64*1024`, `4*1024` | Max event/output sizes |

**Refactoring Suggestions:**
1. Create a `config` package with typed constants
2. Move timeouts to configuration
3. Use environment variables with defaults

### 4.2 TODO/FIXME Comments (Major)

Unresolved technical debt markers.

| File | Line | Comment |
|------|------|---------|
| `pkg/public/server.go:124` | `// TODO: implement origin checking` | **Security** - WebSocket origin not validated |
| `pkg/integrations/semaphore/client.go:219` | `// TODO` | Incomplete implementation |
| `pkg/integrations/slack/slack.go:183,348` | `// TODO` | Incomplete features |
| `pkg/grpc/actions/organizations/accept_invite_link.go:66` | `// TODO: this should be a role...` | RBAC incomplete |
| `pkg/grpc/actions/organizations/create_invitation.go:67,122` | `// TODO: not using transaction properly` | Data integrity risk |
| `pkg/grpc/actions/workflows/invoke_node_execution_action.go:56` | `// TODO` | Incomplete |
| `pkg/grpc/actions/organizations/remove_user.go:32` | `// TODO: all inside transaction` | Data integrity risk |
| `pkg/components/approval/approval.go:380` | `// TODO: Uncomment after RBAC` | Feature incomplete |
| `test/e2e/approvals_test.go:14,83` | Multiple TODOs | Tests incomplete |

**Total TODO/FIXME:** 22 instances (excluding vendor/proto files)

**Priority Items:**
1. **High**: WebSocket origin checking (security)
2. **High**: Transaction handling in invitation/remove_user
3. **Medium**: RBAC completion tasks

### 4.3 Hardcoded URLs (Minor)

URLs that should be configurable.

| File | Line | URL | Purpose |
|------|------|-----|---------|
| `pkg/authentication/authentication.go:148` | `https://github.com/github.png` | Default avatar |
| `pkg/public/server.go:881` | `http://localhost:5173` | Dev proxy target |
| `pkg/integrations/openai/client.go:13` | `https://api.openai.com/v1` | OpenAI API (acceptable default) |
| Various test files | `http://localhost:8000` | Test URLs (acceptable) |

### 4.4 Dead Code Indicators (Minor)

Potential unused code based on patterns.

| Pattern | Count | Notes |
|---------|-------|-------|
| `#nosec` annotations | 3 | Security checks bypassed in CLI |
| Unused imports | - | Go compiler catches these |
| Commented code blocks | ~5 | Minor cleanup needed |

---

## 5. Priority Remediation Plan

### Immediate Actions (Week 1)

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P0 | Fix WebSocket origin validation | Security | Low |
| P0 | Add error handling in `json.go` | Reliability | Low |
| P0 | Fix transaction handling in invitation flows | Data Integrity | Medium |

### Short-Term (Weeks 2-4)

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P1 | Split `workflowv2/index.tsx` into components | Maintainability | High |
| P1 | Create ServerConfig struct for parameter reduction | Readability | Medium |
| P1 | Add ErrorBoundary to critical pages | UX | Low |
| P1 | Resolve TODO comments for RBAC completion | Feature Complete | High |

### Medium-Term (Weeks 5-8)

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P2 | Implement graceful shutdown for all workers | Reliability | Medium |
| P2 | Standardize state management in React | Consistency | High |
| P2 | Extract business logic to custom hooks | Testability | Medium |
| P2 | Create domain types for primitives | Type Safety | Medium |

### Long-Term (Months 2-3)

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P3 | Consider micro-frontend architecture | Scalability | Very High |
| P3 | Implement comprehensive error handling policy | Reliability | High |
| P3 | Automated code smell detection in CI | Prevention | Medium |

---

## 6. Metrics Summary

### Code Quality Scores

| Aspect | Score | Notes |
|--------|-------|-------|
| Error Handling | 6/10 | Multiple ignored errors |
| Type Safety | 7/10 | Good TS usage, some `any` |
| Component Size | 5/10 | Several oversized components |
| State Management | 6/10 | Inconsistent patterns |
| Configuration | 6/10 | Some hardcoded values |
| Documentation | 7/10 | Good inline docs, TODOs remain |

### Technical Debt Estimate

| Category | Hours | Priority |
|----------|-------|----------|
| Critical smells | 16-24 | Immediate |
| Major smells | 40-60 | Short-term |
| Minor smells | 60-80 | Medium-term |
| **Total** | **116-164** | - |

---

## Appendix A: File Analysis Summary

### Largest Go Files (Non-Generated)

1. `pkg/authorization/service.go` - 1,290 lines
2. `pkg/configuration/validation.go` - 994 lines
3. `pkg/public/server.go` - 947 lines
4. `pkg/workers/workflow_node_queue_worker_test.go` - 807 lines
5. `pkg/authentication/authentication.go` - 645 lines

### Largest React Components

1. `pages/workflowv2/index.tsx` - 3,537 lines
2. `ui/CanvasPage/index.tsx` - 2,136 lines
3. `components/AutoCompleteInput/AutoCompleteInput.tsx` - 1,568 lines
4. `pages/custom-component/index.tsx` - 1,353 lines
5. `ui/chainItem/ChainItem.tsx` - 1,027 lines

---

## Appendix B: Detection Methodology

This analysis used the following detection methods:

1. **Static Pattern Analysis**: grep/regex patterns for anti-patterns
2. **Size Metrics**: Line counts for complexity indicators
3. **Structural Analysis**: Import/dependency patterns
4. **Comment Mining**: TODO/FIXME/HACK extraction
5. **Type Analysis**: TypeScript `any` usage, Go interface patterns

---

*Report generated by QE Code Reviewer Agent*
*Analysis confidence: High*
*Review scope: Full codebase*
