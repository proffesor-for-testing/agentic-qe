# Semaphore CI/CD -- Code Quality & Complexity Analysis

**Analysis Date**: 2026-03-06
**Scope**: Full monorepo at `/tmp/semaphore`
**Analyzer**: QE Code Complexity Agent v3

---

## Executive Summary

The Semaphore project is a large polyglot monorepo containing **30+ microservices** spanning four primary languages. The architecture follows a gRPC-first microservices pattern with significant protobuf code generation. The codebase shows disciplined engineering in many areas but carries substantial technical debt in protobuf duplication, a monolithic `front` service, and inconsistent language version pinning.

| Metric | Value |
|--------|-------|
| **Total Services** | 30+ (26 in Elixir, 9 in Go, 1 in Ruby, 1 in TypeScript/JS) |
| **Elixir Files** | ~4,025 (.ex/.exs) |
| **Go Files** | ~528 (.go) |
| **Ruby Files** | ~418 (.rb) |
| **TypeScript/JS Files** | ~607 (.ts/.tsx/.js/.jsx, excl. node_modules) |
| **Generated Protobuf** | 501 files, ~319,500 lines (150K Elixir + 169K Go) |
| **Overall Quality Rating** | **MEDIUM** -- 62/100 Maintainability Index |

---

## 1. Code Complexity Analysis

### 1.1 Severity: CRITICAL -- God Module: `front` Service

The `front` service is the single largest concentration of complexity in the entire codebase, containing **48,693 lines** of non-protobuf Elixir source code across 326 source files. It depends on **46 protobuf stubs** -- more than double the next highest service (guard: 22, zebra: 22). This indicates a monolithic aggregation layer that knows about virtually every other service.

**Worst files in `front`** (source only, excluding protobuf and tests):

| File | Lines | Branch Density | Severity |
|------|-------|----------------|----------|
| `front_web/controllers/people_controller.ex` | 1,295 | 135 | CRITICAL |
| `front/models/project.ex` | 1,181 | 127 | CRITICAL |
| `front_web/controllers/project_controller.ex` | 1,059 | 97 | HIGH |
| `front_web/controllers/project_onboarding_controller.ex` | 1,026 | 89 | HIGH |
| `front_web/controllers/schedulers_controller.ex` | 948 | 97 | HIGH |
| `front_web/router.ex` | 797 | 366 route directives | HIGH |
| `front_web/views/pipeline_view.ex` | 735 | 175 | HIGH |
| `front_web/views/shared_helpers.ex` | 734 | 148 | HIGH |
| `front_web/controllers/project_settings_controller.ex` | 722 | -- | HIGH |
| `front/models/pipeline.ex` | 704 | 92 | HIGH |

The router alone has **366 route directives** in a single 797-line file. The `people_controller.ex` at 1,295 lines handles user CRUD, RBAC, project membership, password resets, token management, and repo scope updates -- far too many responsibilities for a single controller.

### 1.2 Severity: CRITICAL -- Longest Functions

Functions exceeding 100 lines represent critical testability risks:

**Elixir:**

| Function | File | Lines | Issue |
|----------|------|-------|-------|
| `list/0` (permissions) | `rbac/ce/lib/rbac/permissions.ex:46` | 242 | Giant hardcoded permission list |
| `spec/0` (OpenAPI) | `public-api/v2/lib/public_api/api_spec.ex:9` | 214 | Monolithic API spec definition |
| `setup_responses_for_development/0` | `guard/lib/guard/fake_servers.ex:16` | 180 | Test setup god function |
| `optional_claims/0` | `secrethub/.../jwt_claim.ex:105` | 175 | Hardcoded JWT claims |
| `process/1` (job factory) | `zebra/lib/zebra/workers/job_request_factory.ex:41` | 102 | Complex `with` chain, 17 async tasks |
| `update/4` (scheduler) | `front_web/controllers/schedulers_controller.ex:297` | 97 | Fat controller action |
| `create/2` (scheduler) | `front_web/controllers/schedulers_controller.ex:161` | 95 | Fat controller action |

**Go:**

| Function | File | Lines | Issue |
|----------|------|-------|-------|
| `searchHandler` | `mcp_server/pkg/tools/projects/projects.go:601` | 255 | Monolithic search with nested loops |
| `listHandler` (workflows) | `mcp_server/pkg/tools/workflows/search_tool.go:102` | 221 | Same pattern |
| `listHandler` (pipelines) | `mcp_server/pkg/tools/pipelines/pipelines.go:231` | 219 | Same pattern |
| `handler` (test results) | `mcp_server/pkg/tools/testresults/testresults.go:91` | 212 | Same pattern |
| `listHandler` (orgs) | `mcp_server/pkg/tools/organizations/organizations.go:137` | 211 | Same pattern |
| `runHandler` | `mcp_server/pkg/tools/workflows/run_tool.go:91` | 191 | Complex workflow runner |
| `main` | `mcp_server/cmd/mcp_server/main.go:48` | 147 | Oversized main function |
| `ListChangedFiles` | `repohub/pkg/gitrekt/list_changed_files.go:18` | 121 | Complex git operations |

The `mcp_server` service shows a repeated anti-pattern: every tool handler is a 150-255 line monolithic function containing input validation, authorization, RPC calls, response formatting, and error handling -- all in a single function scope. This is the most testability-hostile pattern found in the Go codebase.

### 1.3 Severity: HIGH -- Deep Nesting

Files with nesting depth >= 6 levels (indentation-based measurement):

| File | Max Depth | Issue |
|------|-----------|-------|
| `plumber/ppl/lib/ppl/ppl_blocks/beholder.ex` | 12 | Macro-generated code with callback nesting |
| `plumber/ppl/lib/ppl/ppls/beholder.ex` | 11 | Same pattern |
| `public-api/v2/.../partial_rebuild.ex` | 10.5 | Deeply nested `with` chains |
| `guard/lib/guard/store/service_account.ex` | 8.5 | Nested case/with |
| `ee/rbac/lib/rbac/grpc_servers/rbac_server.ex` | 8 | gRPC handler complexity |
| `zebra/lib/zebra/workers/scheduler/selector.ex` | 7 | Job scheduling logic |
| `repository_hub/.../github_client.ex` | 7 | API response handling |

### 1.4 Severity: HIGH -- Cyclomatic Complexity Hotspots

Based on branch count analysis (case/cond/if/with + function heads), the highest-complexity modules:

| Module | File | Branch+Fn Count | Severity |
|--------|------|-----------------|----------|
| `Projecthub.Api.GrpcServer` | `projecthub/lib/projecthub/api/grpc_server.ex` | 194 | CRITICAL |
| `Ppl.Ppls.Model.PplsQueries` | `plumber/ppl/lib/ppl/ppls/model/ppls_queries.ex` | 184 | CRITICAL |
| `FrontWeb.PipelineView` | `front/lib/front_web/views/pipeline_view.ex` | 175 | HIGH |
| `PipelinesApi.DeploymentsClient.RequestFormatter` | `public-api/v1alpha/.../request_formatter.ex` | 162 | HIGH |
| `RepositoryHub.GithubClient` | `repository_hub/.../github_client.ex` | 159 | HIGH |
| `FrontWeb.SharedHelpers` | `front/lib/front_web/views/shared_helpers.ex` | 148 | HIGH |
| `Zebra.Models.Job` | `zebra/lib/zebra/models/job.ex` | 140 | HIGH |

---

## 2. Code Smells

### 2.1 Severity: CRITICAL -- Massive Protobuf Duplication

The single largest quality issue in the codebase: **protobuf-generated code is duplicated into every consuming service** rather than being shared from a central library.

| Protobuf File | Copies | Lines/Copy | Total Wasted Lines |
|---------------|--------|------------|-------------------|
| `projecthub.pb.ex` | 20 | ~1,100 avg | ~22,400 |
| `organization.pb.ex` | 19 | ~1,100 avg | ~20,900 |
| `repository_integrator.pb.ex` | 24 | ~400 avg | ~9,600 |
| `response_status.pb.ex` | 22 | ~100 avg | ~2,200 |
| `plumber.pipeline.pb.ex` | 10 | ~1,550 avg | ~15,500 |
| `user.pb.ex` | 14 | ~700 avg | ~9,800 |
| `rbac.pb.ex` | 14 | ~500 avg | ~7,000 |

**Total**: 384 Elixir + 117 Go protobuf files containing ~319,500 lines of generated code. With an average of ~15 copies per proto file, roughly **300,000 lines** are pure duplication.

The protobuf stubs also vary in size across services (e.g., `projecthub.pb.ex` ranges from 794 to 1,415 lines), indicating they were generated at different times from different proto versions. This creates version drift risk where services disagree on message schemas.

### 2.2 Severity: HIGH -- Lint Suppressions as Debt Markers

Found **60+ `credo:disable` annotations** across the codebase, with concentrations in:

| Service | Count | Primary Suppression |
|---------|-------|---------------------|
| `repository_hub` | 18 | `DuplicatedCode`, `CyclomaticComplexity` |
| `front` | 27 | `DuplicatedCode`, `CyclomaticComplexity`, `MaxLineLength` |
| `plumber` | 7 | `DuplicatedCode` |
| `ee/rbac` | 5 | `DuplicatedCode`, `CyclomaticComplexity` |

Notable: `repository_hub/lib/repository_hub/clients/github_client.ex` has a **file-level** `credo:disable-for-this-file` -- the entire 971-line file is exempt from all lint checks.

The `auth/lib/auth.ex` file explicitly marks its `authenticate/2` function with `credo:disable-for-next-line Credo.Check.Refactor.CyclomaticComplexity`, acknowledging but not resolving the complexity.

### 2.3 Severity: HIGH -- Adapter Code Duplication (repository_hub)

The `repository_hub` service implements GitHub, GitLab, and Bitbucket adapters with substantial structural duplication:

| Action | GitHub | GitLab | Bitbucket | Structural Similarity |
|--------|--------|--------|-----------|----------------------|
| `regenerate_deploy_key_action.ex` | 108 lines | 100 lines | 103 lines | ~75% |
| `delete_action.ex` | 90 lines | 91 lines | 86 lines | ~80% |
| `update_action.ex` | 79 lines | 76 lines | 70 lines | ~70% |
| `fork_action.ex` | 90 lines | 69 lines | 87 lines | ~65% |
| `describe_remote_repository_action.ex` | 94 lines | 64 lines | 82 lines | ~60% |
| `describe_revision_action.ex` | 91 lines | 81 lines | 89 lines | ~70% |

The Ecto.Multi pipeline pattern is nearly identical across adapters; only the provider-specific client calls differ. This could be refactored into a shared template with provider-specific callbacks.

### 2.4 Severity: MEDIUM -- Test Factory God Files

| File | Lines | Issue |
|------|-------|-------|
| `hooks_processor/test/support/bitbucket_hooks.ex` | 4,234 | Hardcoded webhook payloads |
| `front/test/support/factories.ex` | 3,174 | Monolithic factory file |
| `front/test/support/stubs/billing.ex` | 1,090 | Billing stub data |
| `front/test/support/stubs/velocity.ex` | 1,084 | Velocity stub data |
| `front/test/support/fake_services.ex` | 860 | Fake service implementations |
| `front/test/support/stubs/rbac.ex` | 752 | RBAC stub data |

These oversized test support files indicate that test setup logic is not properly modularized and may create maintenance burden.

---

## 3. Architecture Analysis

### 3.1 Service Boundary Assessment

**Service Count by Language:**

| Language | Services | Total Source Lines (excl. protobuf/tests) |
|----------|----------|------------------------------------------|
| Elixir | 26 (38 mix.exs) | ~224K |
| Go | 9 (9 go.mod) | ~38K |
| Ruby | 1 (github_hooks) | ~20K |
| TypeScript/JS | 1 (front assets) | ~35K |

**Service Size Distribution (source lines, excluding protobuf and tests):**

| Service | Lines | Files | Language | Risk |
|---------|-------|-------|----------|------|
| **front** | 101,521 | 748 | Elixir+TS | CRITICAL -- god service |
| public-api | 36,866 | 396 | Elixir | HIGH -- two versions (v1alpha, v2) |
| ee | 34,165 | 377 | Elixir+Go | HIGH -- enterprise extensions |
| plumber | 22,010 | 260 | Elixir | HIGH -- 10 sub-packages |
| github_hooks | 19,638 | 397 | Ruby | MEDIUM |
| mcp_server | 16,442 | 70 | Go | MEDIUM |
| guard | 13,594 | 135 | Elixir | MEDIUM |
| repository_hub | 13,089 | 140 | Elixir | MEDIUM |
| zebra | 9,500 | 87 | Elixir | LOW |
| self_hosted_hub | 8,977 | 51 | Go | LOW |
| artifacthub | 8,310 | 59 | Go | LOW |

### 3.2 Severity: CRITICAL -- `front` as Aggregation Monolith

The `front` service has evolved into an aggregation monolith that knows about every other service:

- **46 protobuf dependencies** (compared to guard's 22 and zebra's 22)
- **797-line router** with 366 route directives
- **15 controllers** exceeding 400 lines each
- Direct gRPC client calls to: projecthub, plumber, guard, zebra, secrethub, rbac, notifications, artifacthub, loghub2, repository_integrator, scouter, velocity, billing, feature_provider, self_hosted, periodic_scheduler, dashboardhub, and more

This creates a deployment bottleneck: any protobuf change in any service requires a `front` rebuild and redeploy.

### 3.3 Severity: HIGH -- Dual Repository Services

Two separate services handle repository concerns:
- **`repository_hub`** (Elixir, 13K lines) -- repository adapter layer (GitHub/GitLab/Bitbucket operations)
- **`repohub`** (Go, 3.5K lines) -- git operations (clone, diff, commit listing)

The naming collision (`repohub` vs `repository_hub`) creates confusion. While they serve different purposes (adapter vs git operations), having both handle "repository" concerns with similar names suggests an unclear domain boundary.

### 3.4 Severity: HIGH -- `plumber` Sub-Package Complexity

The `plumber` service is split across **10 mix.exs files**:

```
plumber/block/
plumber/definition_validator/
plumber/gofer_client/
plumber/job_matrix/
plumber/looper/
plumber/ppl/
plumber/proto/
plumber/repo_proxy_ref/
plumber/spec/
plumber/task_api_referent/
```

While this follows the umbrella app pattern, the deep nesting (e.g., `plumber/ppl/lib/ppl/ppls/model/ppls_queries.ex` at 812 lines with 184 branch points) suggests the internal decomposition may not have kept pace with growing complexity.

### 3.5 Severity: MEDIUM -- Cross-Service Coupling via gRPC

High-coupling services (by protobuf dependency count):

| Service | Proto Dependencies | Risk |
|---------|-------------------|------|
| front | 46 | CRITICAL |
| public-api (v1alpha+v2) | 31 | HIGH |
| zebra | 22 | MEDIUM |
| guard | 22 | MEDIUM |
| plumber | 21 | MEDIUM |
| mcp_server | 26 | MEDIUM |
| projecthub | 15 | LOW |
| notifications | 15 | LOW |

Lower-coupling (well-bounded) services: `auth` (7), `badge` (8), `branch_hub` (small), `encryptor` (small).

### 3.6 Service Communication Pattern

All inter-service communication uses **synchronous gRPC**. No evidence of asynchronous messaging (event bus, message queue) except for `server_farm.mq.job_state_exchange.pb` -- a single job-state exchange proto. This creates tight runtime coupling: if `projecthub` is slow, every dependent service's latency increases.

---

## 4. Naming & Convention Analysis

### 4.1 Severity: MEDIUM -- Service Naming Inconsistencies

Directory naming uses three different conventions:

| Convention | Examples |
|------------|----------|
| snake_case | `repository_hub`, `self_hosted_hub`, `github_hooks`, `branch_hub`, `hooks_processor` |
| camelCase/compound | `projecthub`, `secrethub`, `artifacthub`, `dashboardhub`, `loghub2` |
| kebab-case | `public-api`, `public-api-gateway`, `projecthub-rest-api`, `security-toolbox`, `helm-chart` |

This inconsistency means there is no single convention for service naming. The hub services alone use both `_hub` (underscore) and `hub` (concatenated) forms.

### 4.2 Severity: LOW -- Elixir Module Naming

Elixir module naming is generally consistent within services. Acronyms follow Elixir conventions (e.g., `GrpcServer`, `HTTPMock`, `OpenIDConnect`). No major deviations found.

### 4.3 Severity: LOW -- Go Package Naming

Go packages follow standard conventions. The `mcp_server` uses underscore (acceptable but non-idiomatic; Go convention prefers `mcpserver`). Not a significant issue.

---

## 5. Technical Debt Indicators

### 5.1 Severity: HIGH -- Language Version Fragmentation

**Go versions across modules:**

| Version | Services |
|---------|----------|
| go 1.22 | public-api-gateway, encryptor |
| go 1.23.0 | self_hosted_hub, repohub, loghub2, bootstrapper |
| go 1.24.0 | ee/velocity, artifacthub |
| go 1.25 | mcp_server |

Spanning **4 minor Go versions** across 9 modules creates inconsistent behavior, security patch coverage, and build toolchain requirements. The `mcp_server` is on go 1.25 while `encryptor` and `public-api-gateway` are still on 1.22.

**Elixir versions across services:**

| Version Constraint | Count |
|-------------------|-------|
| `~> 1.4` | 1 |
| `~> 1.11` | 10 |
| `~> 1.12` | 7 |
| `~> 1.13` | 6 |
| `~> 1.14` | 6 |
| `~> 1.15` | 1 |
| `~> 1.17` | 3 |
| `~> 1.18` | 3 |

Spanning **8 different Elixir version constraints**. The `~> 1.4` requirement (in a plumber sub-package) is extremely outdated. The mix of `~> 1.11` through `~> 1.18` means different services may behave differently on the same Elixir runtime.

### 5.2 Severity: MEDIUM -- TODO/FIXME Comments

Found **28 genuine TODO/FIXME comments** across the codebase (excluding `context.TODO()` in Go):

| Category | Count | Notable Examples |
|----------|-------|-----------------|
| Deprecated code marked for removal | 2 | `guard/lib/guard/store/members.ex`, `ee/rbac/lib/rbac/store/members.ex` -- both marked "TODO deprecated, should be removed once we migrate invitations" |
| Incomplete stubs | 12 | `public-api/v1alpha/test/support/stubs/*.ex` -- "This stub is not complete. Some values are still hardcoded. DO NOT COPY." (ironically, identical comment in v2 stubs = they were copied) |
| Unfinished implementation | 4 | `notifications/lib/notifications/api/*/serialization.ex` -- bare `# TODO` with no description |
| Quick patches | 2 | `ee/rbac/lib/rbac/role_binding_identification.ex:132` -- "TODO Better solution should be figured out for this. This is a quick patch for now" |
| Unexplained | 6 | `projecthub/test/.../grpc_server_test.exs` -- 6 bare `# TODO` comments |
| FIXME | 1 | `plumber/task_api_referent/lib/task_api_referent/application.ex:9` -- bare `# FIXME` |

The "DO NOT COPY" stubs that were copied from v1alpha to v2 is a clear indicator of tech debt propagation.

### 5.3 Severity: MEDIUM -- Dual Public API Versions

Two full API versions coexist:

| Version | Path | Lines | Status |
|---------|------|-------|--------|
| v1alpha | `public-api/v1alpha/` | ~18K | Active |
| v2 | `public-api/v2/` | ~19K | Active |

Both versions are fully maintained with their own protobuf stubs, test suites, and route definitions. If v1alpha is intended for deprecation, there is no clear timeline or migration path visible in the code.

### 5.4 Severity: LOW -- Enterprise Edition Coupling

The `ee/` directory contains enterprise extensions:

```
ee/audit/
ee/gofer/
ee/pre_flight_checks/
ee/rbac/
ee/velocity/
```

The `ee/rbac` and `rbac/ce` pattern (enterprise vs community edition) is well-structured. However, `ee/velocity` is a standalone Go service (not an Elixir overlay), making it architecturally inconsistent with the other `ee/` modules.

---

## 6. Refactoring Recommendations

### Priority 1: CRITICAL

**R1. Extract `front` into Backend-for-Frontend (BFF) services**
- Split the 46-dependency monolith into domain-specific BFF services
- Estimated impact: Reduce `front` from 101K to ~30K lines; eliminate deployment bottleneck
- Strategy: Extract controllers by domain (billing, projects, people, pipelines, agents) into separate Phoenix apps

**R2. Centralize protobuf generation into a shared library**
- Create a single `proto/` package that generates stubs once
- Consume as a dependency (Elixir: hex package or path dep; Go: go module)
- Estimated impact: Eliminate ~300K lines of duplicated generated code; ensure schema version consistency

**R3. Decompose mcp_server tool handlers**
- Extract validation, authorization, RPC calls, and response formatting into composable middleware
- Estimated impact: Reduce 5 handlers from 150-255 lines to ~40 lines each; 3x testability improvement

### Priority 2: HIGH

**R4. Standardize language versions**
- Pin all Go modules to go 1.24+ and all Elixir projects to `~> 1.17`
- Estimated impact: Consistent behavior, security coverage, and build toolchain

**R5. Refactor repository_hub adapter duplication**
- Extract shared Multi pipeline into a template function with provider-specific callbacks
- Estimated impact: Reduce 6 adapter action files from ~500 total lines to ~200 with a ~150-line shared module

**R6. Remove acknowledged deprecated code**
- Delete `guard/lib/guard/store/members.ex` and `ee/rbac/lib/rbac/store/members.ex` (both marked "TODO deprecated")
- Clean up bare TODO/FIXME comments with either actionable items or removal

### Priority 3: MEDIUM

**R7. Split front router**
- Decompose `router.ex` (797 lines, 366 routes) into scoped sub-routers by domain
- Estimated impact: Each sub-router ~80-100 lines; easier to reason about routing per feature area

**R8. Rename services for consistency**
- Adopt a single naming convention (recommend snake_case): `repohub` -> `repo_hub`, `projecthub` -> `project_hub`, etc.
- Lower priority but reduces cognitive load for new contributors

**R9. Complete incomplete test stubs**
- Address the "DO NOT COPY" stubs that were copied from v1alpha to v2
- Implement proper test factories with builder patterns instead of hardcoded stubs

---

## Appendix A: Service Dependency Graph (Simplified)

```
front (46 deps) -----> projecthub, plumber, guard, zebra, secrethub,
                       rbac, notifications, artifacthub, loghub2,
                       repository_integrator, scouter, velocity,
                       billing, feature_provider, self_hosted,
                       periodic_scheduler, dashboardhub, ...

public-api (31 deps) -> projecthub, plumber, guard, zebra, secrethub,
                        rbac, notifications, artifacthub, loghub2, ...

mcp_server (26 deps) -> projecthub, plumber, organization, rbac,
                        user, artifacthub, loghub2, ...

guard (22 deps) ------> organization, projecthub, rbac, user,
                        encryptor, feature, repository, ...

zebra (22 deps) ------> projecthub, organization, rbac, secrethub,
                        artifacthub, loghub2, self_hosted, ...

plumber (21 deps) ----> projecthub, organization, user, repo_proxy,
                        repository_integrator, artifacthub, ...

projecthub (15 deps) -> organization, rbac, user, repository,
                        feature, artifacthub, cache, ...

secrethub (7 deps) ---> organization, projecthub, rbac, encryptor, ...
auth (7 deps) --------> organization, rbac, feature, ...
badge (8 deps) -------> projecthub, plumber, ...
```

## Appendix B: Files Examined

Key files analyzed in detail:

- `/tmp/semaphore/projecthub/lib/projecthub/api/grpc_server.ex` (1,333 lines, 194 branches)
- `/tmp/semaphore/front/lib/front_web/controllers/people_controller.ex` (1,295 lines)
- `/tmp/semaphore/front/lib/front/models/project.ex` (1,181 lines)
- `/tmp/semaphore/mcp_server/pkg/tools/projects/projects.go` (1,067 lines, 146 branches)
- `/tmp/semaphore/repository_hub/lib/repository_hub/clients/github_client.ex` (971 lines, credo-disabled)
- `/tmp/semaphore/zebra/lib/zebra/workers/job_request_factory.ex` (102-line process function with 17 async tasks)
- `/tmp/semaphore/security-toolbox/lib/global_report/aggregator.rb` (921 lines)
- `/tmp/semaphore/github_hooks/lib/semaphore/repo_host/hooks/handler.rb` (542 lines)
- `/tmp/semaphore/front/lib/front_web/router.ex` (797 lines, 366 routes)
- `/tmp/semaphore/auth/lib/auth.ex` (explicit cyclomatic complexity suppression)
- All 38 `mix.exs` files and 9 `go.mod` files for version analysis
