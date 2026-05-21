# ADR-043: Vendor-Independent LLM Support

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-043 |
| **Status** | Implemented |
| **Date** | 2026-01-13 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** Agentic QE v3's LLM integration layer that currently supports only 3 providers (Claude, OpenAI, Ollama) via ADR-011,

**facing** user demand for access to 100+ models via OpenRouter, enterprise compliance requirements for Azure OpenAI and AWS Bedrock, need for intelligent routing based on task complexity and agent type, cost optimization through automatic model selection, and privacy requirements for local ONNX inference,

**we decided for** a HybridRouter pattern extending ADR-011 with vendor-independent LLM support including 7 providers, bidirectional model ID mapping, 4 routing modes (manual, rule-based, cost-optimized, performance-optimized), agent-aware routing rules, and prompt translation layers,

**and neglected** LiteLLM Gateway (external dependency, deployment complexity), per-provider abstraction alone (insufficient for routing needs), and full router rewrite (unnecessary when extension pattern works),

**to achieve** access to 100+ models through unified interface, 30-50% cost reduction via intelligent routing, zero code changes for existing integrations, enterprise compliance with Azure/Bedrock support, and privacy-sensitive local inference via ONNX,

**accepting that** this adds complexity in the routing layer, requires more configuration options, introduces provider-specific testing requirements, and adds potential routing decision overhead (<10ms target).

---

## Context

ADR-011 established the LLM provider system with 3 providers. Analysis of user requirements revealed gaps: limited model access, no intelligent routing, manual provider switching, no cost optimization, missing enterprise providers, and no local inference option.

Research into agentic-flow's HybridRouter revealed a proven pattern with Strategy-based ModelRouter, capability flags, and cross-vendor model mapping. This pattern enables incremental adoption without breaking existing consumers.

---

## Options Considered

### Option 1: HybridRouter Pattern (Selected)

Extend ADR-011 with multi-provider routing, model mapping, and agent-aware rules.

**Pros:** Proven architecture, minimal breaking changes, DDD alignment, incremental adoption
**Cons:** Additional routing complexity, more configuration to manage

### Option 2: LiteLLM Gateway (Rejected)

Use external LiteLLM as unified gateway.

**Why rejected:** External dependency, deployment complexity, less control over routing logic.

### Option 3: Per-Provider Abstraction Only (Rejected)

Keep current ADR-011 approach, just add more providers.

**Why rejected:** No routing intelligence, no cost optimization, no agent-aware selection.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extends | ADR-011 | LLM Provider System | Foundation being extended |
| Part Of | MADR-001 | V3 Implementation Initiative | Core infrastructure |
| Enables | ADR-026 | 3-Tier Model Routing | Uses HybridRouter for routing |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-043-A | LLM Provider Adapters | Technical Spec | [specs/SPEC-043-A-llm-provider-adapters.md](../specs/SPEC-043-A-llm-provider-adapters.md) |
| SPEC-043-B | HybridRouter Core | Technical Spec | [specs/SPEC-043-B-hybrid-router-core.md](../specs/SPEC-043-B-hybrid-router-core.md) |
| SPEC-043-C | Model ID Mapping | Technical Spec | [specs/SPEC-043-C-model-mapping.md](../specs/SPEC-043-C-model-mapping.md) |
| SPEC-043-D | Agent-Aware Routing Rules | Technical Spec | [specs/SPEC-043-D-routing-rules.md](../specs/SPEC-043-D-routing-rules.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-13 | Approved | 2026-07-13 |
| Implementation Audit | 2026-01-15 | Verified | - |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-13 | Initial ADR creation |
| Approved | 2026-01-13 | Architecture review passed |
| Implemented | 2026-01-15 | All 12 milestones complete, 4936 tests passing |
| Wiring Verified | 2026-05-21 | HybridRouter now constructed by kernel and injected into 11 LLM-enhanced domains (14 services). Previously the router code shipped but no production path constructed it. End-to-end round-trip verified against Gemini (gemini-2.5-flash), OpenAI (gpt-4o-mini), OpenRouter (openai/gpt-4o-mini). Devil's-advocate audit and follow-up fixes also included. See addendum below. |

---

## Addendum: Wiring Verification (2026-05-21)

### Problem identified

User audit revealed that although the HybridRouter implementation was complete
and `ProviderConfig.providers.gemini.enabled` was a real configurable knob,
**no production code path constructed a HybridRouter**. Every domain service
that accepted `llmRouter` as an optional dependency received `undefined` from
its coordinator, so `isLLMAnalysisAvailable()` returned `false` everywhere and
the ADR-051 LLM-enhancement branches were unreachable. The only live
`createHybridRouter()` call was in `aqe llm advise` (a CLI advisor utility),
not in the kernel boot or MCP tool path.

Additionally:
- `aqe llm config --set` mutated an in-memory module-level `let` with a
  literal comment `// would be persisted in real implementation` — settings
  evaporated with the process.
- The Gemini provider read `GOOGLE_AI_API_KEY` and `GEMINI_API_KEY` but not
  the conventional `GOOGLE_API_KEY` that users typically have set.

### Resolution

Phases delivered on `feat/wire-llm-router` (commits 94033e3, be1e60d, c206c81,
and subsequent audit-fix commits):

1. **Phase 1 — Foundation**
   - `src/shared/llm/router/config-store.ts` (new): persistent
     `.agentic-qe/llm-config.json` with env-detection layering
     (`defaults < disk < env < explicit override`), apiKey-stripping on save
   - `src/shared/llm/llm-router-service.ts` (new): kernel-singleton builder
     that picks primary/fallbacks from the available provider set, honoring
     `defaultProvider` when possible
   - `QEKernelImpl._initializeLLMRouter()` builds the router during
     `initialize()`; exposed as `kernel.llmRouter`
   - `KernelConfig.llmRouter` extension: `enabled: 'auto' | true | false` plus
     `configOverride` and `providerManager` (test injection)
   - `src/cli/commands/llm-router.ts`: `aqe llm config --set` now persists to
     disk via the new config-store; `AQE_CONFIG_ROOT` env var added as a test
     seam
   - `src/shared/llm/providers/gemini.ts`: `GOOGLE_API_KEY` accepted as a
     third alias

2. **Phase 2 — Domain wiring**
   - 12 LLM-enhanced domain plugins/coordinators updated to forward
     `llmRouter` from the kernel through to their services via the
     dependency-bag constructor form (`new XService({ memory, llmRouter })`)
   - `DOMAIN_FACTORIES` in `kernel.ts`: 11 wrapper updates so the kernel
     singleton actually reaches the plugin layer
   - Domains intentionally NOT wired: `enterprise-integration` and
     `coordination` (no LLM-aware services in their surface)

3. **Phase 3 — MCP tool path**
   - 8 standalone MCP tool service constructions updated to resolve the
     router via `getLLMRouter(context)`
   - Shared `getSharedLLMRouter()` singleton added to `src/mcp/tools/base.ts`
     mirroring the `getSharedMemoryBackend()` pattern
   - `MCPToolContext.llmRouter` added so future tools can inject explicitly

4. **Phase 4 — Verification**
   - `tests/unit/shared/llm/router/config-store.test.ts` — 29 unit tests
   - `tests/unit/shared/llm/llm-router-service.test.ts` — 10 unit tests
   - `tests/unit/kernel/kernel-llm-router.test.ts` — 4 wiring tests
   - `tests/integration/llm-router-wiring.test.ts` — 17 tests proving the
     router instance reaches every domain service; one behavioral test
     proving `TestExecutorService.analyzeFailuresWithLLM` actually invokes
     the provider
   - `tests/e2e/llm-router-real-providers.test.ts` — gated by `AQE_LLM_E2E=1`;
     verified live against Gemini (gemini-2.5-flash), OpenAI (gpt-4o-mini),
     and OpenRouter on 2026-05-21

### Service / Domain counts

The integration test `tests/integration/llm-router-wiring.test.ts`
enumerates **15 service paths across 11 LLM-enhanced domains**:

- test-execution → executor
- test-generation → testGenerator
- coverage-analysis → coverageAnalyzer, gapDetector
- quality-assessment → qualityAnalyzer, deploymentAdvisor
- security-compliance → securityScanner (→ SASTScanner sub-component)
- contract-testing → contractValidator
- chaos-resilience → chaosEngineer
- requirements-validation → validator
- code-intelligence → knowledgeGraph
- defect-intelligence → predictor, rootCauseAnalyzer
- learning-optimization → learningService
- visual-accessibility → visualTester

Two domains are deliberately NOT wired because they have no LLM-aware
services: `enterprise-integration` (integration plumbing) and
`coordination` (cross-cutting). Verified via
`grep -rn "llmRouter" src/domains/enterprise-integration/ src/domains/coordination/`
returning empty.

### Precedence & env-var conventions

Config-store precedence (highest wins):

  1. Explicit `configOverride` passed to `KernelConfig.llmRouter.configOverride`
  2. Environment variables (provider API keys + `AQE_LLM_ROUTER_DISABLED`)
  3. Project file `.agentic-qe/llm-config.json`
  4. Built-in defaults from `DEFAULT_ROUTER_CONFIG`

Note: `applyEnvProviderDetection` force-enables a provider when its env
key is present, even when the disk config explicitly sets
`enabled: false`. This is intentional — env should win — but is
counterintuitive when users set `enabled: false` to disable. To truly
disable a provider that has a key in env, either unset the env key OR
set `AQE_LLM_ROUTER_DISABLED=1`.

### Behavior change for users

Once installed, any fleet booted with at least one provider API key in env
will route LLM-enhanced analysis paths through that provider. Three opt-out
mechanisms, in order of preference:

  1. `AQE_LLM_ROUTER_DISABLED=1` env var — env-only opt-out, no code change
  2. `KernelConfig.llmRouter.enabled: false` — programmatic opt-out
  3. Unset the relevant provider keys in env

See the release notes for the version that ships this change.

### Audit findings (2026-05-21) and resolutions

A qe-devils-advocate audit surfaced 10 issues post-Phase-4. All addressed:

  1. ✅ Silent billing regression — added `AQE_LLM_ROUTER_DISABLED` env kill-switch
  2. ✅ 2 unwired MCP standalone tools (test-generation/generate.ts, visual-accessibility/index.ts) — both now wired via `getLLMRouter(context)`
  3. ✅ Rule-based mode E2E coverage — added two new E2E tests; surfaced TWO real routing bugs (`executeWithFallback` hardcoded provider list, non-retryable errors short-circuiting fallback) both now fixed
  4. ✅ `MCPToolContext.llmRouter` decorative — added `invoke()` option; qe-tool-bridge and registry now forward the singleton explicitly
  5. ✅ Behavioral mock tests for 14 services — added `isLLMAnalysisAvailable()` gate assertions + end-to-end tests
  6. ✅ Split router singletons (MCP vs kernel) — kernel now calls `setSharedLLMRouter()` on init so both paths share one HybridRouter, one cost tracker, one cache, one circuit breaker
  7. ✅ Silent init errors — kernel now publishes `kernel.llm-router.init-failed` / `kernel.llm-router.init-no-provider` events on the event bus for monitoring
  8. ✅ Service count mismatch — corrected to 15 services / 11 LLM-enhanced domains
  9. ✅ apiKey silently dropped on CLI — now throws a clear error pointing to env vars
  10. ✅ Env vs disk precedence documented (this section)
