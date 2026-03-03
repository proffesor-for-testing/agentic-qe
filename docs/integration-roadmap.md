# AQE Integration Roadmap

## What Was Done

### Phase 1: Istanbul Static Asset Cleanup
- Removed 9 generated Istanbul coverage report files from `src/coverage/` (HTML, CSS, PNG, JSON)
- Added `.gitignore` patterns to prevent reappearance
- None were imported by any TypeScript file

### Phase 2: MCP Tool Bridge (26 Bridged Tools)
- Created `src/mcp/qe-tool-bridge.ts` — adapter that registers non-overlapping QE tools
- 11 tools were already exposed under flat names (e.g., `test_generate_enhanced`)
- 37 total QE tools minus 11 skip = **26 tools registered via bridge**
- These 26 tools were previously invisible to MCP clients despite being fully implemented

### Phase 3: New MCP Tools from Dead Modules
- **`qe/tests/schedule`** — Test scheduling pipeline (phase scheduler, git-aware selector, flaky tracker)
  - Source: `src/test-scheduling/`
  - Calls `runTestPipeline()` with real `PipelineConfig`
- **`qe/tests/load`** — Agent fleet load testing (light/medium/heavy profiles)
  - Source: `src/testing/load/`
  - Defaults to `mockMode=true` (safe); user can set `mockMode=false` for real fleet testing
- **`qe/security/url-validate`** — URL security validation + PII exposure scanning
  - Checks for XSS, SQL injection, path traversal, open redirect patterns
  - Scans URL/query params for PII (emails, SSNs, credit cards, phone numbers, API keys)
- **`qe/workflows/browser-load`** — Browser workflow loader and validator
  - Loads from built-in YAML templates or inline YAML
  - Validates workflow structure, interpolates variables into step configs
  - Returns the resolved workflow ready for browser client execution
- **`fleet_health` enrichment** — Structural health via mincut-lambda
  - Passes actual agent nodes from `queen.getAgentsByDomain()`, not an empty array
  - Falls back gracefully if native mincut module is unavailable

### Phase 4: Dead CLI Code Removal
- Deleted `src/cli/commands/qe-tools.ts` (935 lines) — `registerQEToolCommands()` was never imported

### Phase 5: Neural Optimizer Archive
- Moved `src/neural-optimizer/` to `src/_archived/neural-optimizer/`
- Moved `tests/unit/neural-optimizer/` to `tests/_archived/neural-optimizer/`
- Excluded `src/_archived/` from TypeScript compilation
- Added `src/_archived/README.md` with restore instructions

## MCP Tool Inventory

### Core Tools (4)
| Tool | Category |
|------|----------|
| `fleet_init` | core |
| `fleet_status` | core |
| `fleet_health` | core (enriched with structural health) |
| `aqe_health` | core |

### Task Tools (5)
| Tool | Category |
|------|----------|
| `task_submit` | task |
| `task_list` | task |
| `task_status` | task |
| `task_cancel` | task |
| `task_orchestrate` | task |

### Agent & Team Tools (10)
| Tool | Category |
|------|----------|
| `agent_list` | agent |
| `agent_spawn` | agent |
| `agent_metrics` | agent |
| `agent_status` | agent |
| `team_list` | agent |
| `team_health` | agent |
| `team_message` | agent |
| `team_broadcast` | agent |
| `team_scale` | agent |
| `team_rebalance` | agent |

### Domain Tools — Flat Names (11)
| Tool | Maps to QE Tool |
|------|-----------------|
| `test_generate_enhanced` | `qe/tests/generate` |
| `test_execute_parallel` | `qe/tests/execute` |
| `coverage_analyze_sublinear` | `qe/coverage/analyze` |
| `quality_assess` | `qe/quality/evaluate` |
| `security_scan_comprehensive` | `qe/security/scan` |
| `contract_validate` | `qe/contracts/validate` |
| `accessibility_test` | `qe/a11y/audit` |
| `chaos_test` | `qe/chaos/inject` |
| `defect_predict` | `qe/defects/predict` |
| `requirements_validate` | `qe/requirements/validate` |
| `code_index` | `qe/code/analyze` |

### Domain Tools — QE Namespaced via Bridge (26)
| Tool | Domain |
|------|--------|
| `qe/coverage/gaps` | coverage-analysis |
| `qe/requirements/quality-criteria` | requirements-validation |
| `qe/visual/compare` | visual-accessibility |
| `qe/learning/optimize` | learning-optimization |
| `qe/learning/dream` | learning-optimization |
| `qe/analysis/token_usage` | code-intelligence |
| `qe/planning/goap_plan` | coordination |
| `qe/planning/goap_execute` | coordination |
| `qe/planning/goap_status` | coordination |
| `qe/mincut/health` | coordination |
| `qe/mincut/analyze` | coordination |
| `qe/mincut/strengthen` | coordination |
| `qe/embeddings/generate` | learning-optimization |
| `qe/embeddings/compare` | learning-optimization |
| `qe/embeddings/search` | learning-optimization |
| `qe/embeddings/store` | learning-optimization |
| `qe/embeddings/stats` | learning-optimization |
| `qe/coherence/check` | quality-assessment |
| `qe/coherence/audit` | quality-assessment |
| `qe/coherence/consensus` | quality-assessment |
| `qe/coherence/collapse` | quality-assessment |
| `qe/qx/analyze` | quality-assessment |
| `qe/tests/schedule` | test-execution |
| `qe/tests/load` | test-execution |
| `qe/security/url-validate` | security-compliance |
| `qe/workflows/browser-load` | test-execution |

### Memory Tools (6)
| Tool | Category |
|------|----------|
| `memory_store` | memory |
| `memory_retrieve` | memory |
| `memory_query` | memory |
| `memory_delete` | memory |
| `memory_usage` | memory |
| `memory_share` | memory |

### Routing & Infra Tools (5)
| Tool | Category |
|------|----------|
| `model_route` | routing |
| `routing_metrics` | routing |
| `infra_healing_status` | infra-healing |
| `infra_healing_feed_output` | infra-healing |
| `infra_healing_recover` | infra-healing |

## Tool Maturity Notes

| Tool | Maturity | Notes |
|------|----------|-------|
| `qe/tests/schedule` | Full | Calls real `runTestPipeline()` — requires Vitest + git |
| `qe/tests/load` | Full | Mock mode by default; real mode requires fleet_init |
| `qe/security/url-validate` | Full | Regex-based URL security + PII scanning — no browser needed |
| `qe/workflows/browser-load` | Loader only | Loads/validates/resolves workflows — does not execute steps (no browser client) |
| `fleet_health` structural | Conditional | Requires `@ruvector/mincut` native module; silently skipped if unavailable |

## Remaining Items

### Governance Module (Feature-Flagged)
- 14 governance integration files exist under `src/governance/`
- Currently feature-flagged and not exposed as MCP tools
- Status: keep as-is until maturity documentation is available

### Enterprise Integration Domain
- `src/domains/enterprise-integration/` has coordination infrastructure
- Future: expose dedicated MCP tools for enterprise workflow orchestration

### Browser Workflow Execution
- `qe/workflows/browser-load` currently only loads/validates — doesn't execute
- Future: add `qe/workflows/browser-execute` that requires a browser client (Vibium/Playwright)

### Neural Optimizer Restoration
- Archived at `src/_archived/neural-optimizer/`
- Restore when 100+ agent fleets become common
- See `src/_archived/README.md` for restore instructions
