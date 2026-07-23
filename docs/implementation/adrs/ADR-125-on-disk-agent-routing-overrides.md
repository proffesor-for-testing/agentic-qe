# ADR-125: On-disk per-agent-type LLM routing overrides

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-125 |
| **Status** | Accepted |
| **Date** | 2026-07-23 |
| **Author** | AQE Core |
| **Review Cadence** | 6 months |
| **Supersedes** | — |
| **Related** | [ADR-043](./ADR-043-vendor-independent-llm.md) (Milestone 8 defined `AgentRoutingOverride`), [ADR-123](./ADR-123-billing-aware-llm-execution.md) (billing-aware providers, explicit-disable precedence), [ADR-124](./ADR-124-qe-court-adversarial-verdict-service.md) (qe-court's court-role `routing` map). Origin: issue [#568](https://github.com/proffesor-for-testing/agentic-qe/issues/568) (Chris Phillipson / `agentic-kit`). |

---

## WH(Y) Decision Statement

**In the context of** ADR-043 Milestone 8 having already built the right data model
for per-agent-type model selection — `AgentRoutingOverride`
(`condition: {agentTypes, taskPatterns, complexity, requiresTools, requiresReasoning}`
→ `modelPreference: {provider, model, temperature, maxTokens, priority}`), a
category map covering 59+ QE agent types, and a `getPreferredModelForAgent()`
resolver — but every one of those functions operating purely in memory, reachable
only through an in-process `buildAgentRouterConfig({ customOverrides: [...] })`
call,

**facing** (1) a downstream tool author (`agentic-kit`, which installs and heals
agentic-qe on developers' machines) with no stable contract to write to, and no
option but to tell users "this isn't exposed yet"; (2) an existence proof that the
need is real — qe-court (ADR-124) needed per-role vendor-diverse routing badly
enough that it shipped its own bespoke `routing` map in
`.claude/skills/qe-court/config.json`, covering ~9 court roles and helping none of
the other 50+ agent types; and (3) a discovery made while implementing this: the
generated per-agent ruleset was **not merely unreachable from disk, it was
unreachable at all** — `HybridRouter` only ever evaluates `config.rules`
(falling back to the ~10 hardcoded `DEFAULT_QE_ROUTING_RULES`), and
`createAllAgentRoutingRules()` was never installed into either,

**we decided for** extending the *existing* `.agentic-qe/llm-config.json` — the
file the router already loads via `config-store.ts` and the file downstream tools
already write — with an additive `agentOverrides` map keyed by agent type, wired
through three seams:

1. **Schema + merge.** `RouterConfig.agentOverrides?: Record<string, AgentProviderOverride>`,
   deep-merged by `mergeRouterConfig` with **keyed-object semantics** (like
   `providers`), not the shallow-replace treatment `fallbackChain` gets — so
   overriding one agent never wipes the others.
2. **Resolution.** `getPreferredModelForAgent(agentType)` consults the on-disk map
   **first**, falling back to the existing category-default chain. An override is
   a *partial*: unset fields keep their category default, and an entry outranks
   the built-in category rule by default (`base.priority + 100`) unless the user
   sets `priority` explicitly. **One exception to "unset fields inherit":** when
   `provider` changes and `model` is unset, `model` resolves to the *new*
   provider's `defaultModel`, not the old provider's model id. Inheriting it
   would route `{ "provider": "ollama" }` to ollama asking for
   `claude-sonnet-4-6` — a model that provider cannot serve. Caught during live
   verification, not by the unit tests, which is why the end-to-end probe was
   worth running.
3. **Materialization.** `createOverrideRoutingRules()` emits one routing rule per
   overridden agent, and `createLLMRouterService()` prepends them to the rules
   `HybridRouter` actually evaluates.
4. **Attribution.** Routing rules match on `agentType`, and the QE domain
   services were calling `llmRouter.chat()` **without** it — so a materialized
   rule still never fired. All nine router-calling domain services now send their
   agent type, with a test that fails if a new call site omits it.

Steps 3 and 4 together are what make the feature real rather than
parsed-and-ignored. Step 4 was found by the adversarial review, not by the unit
tests: config parsed, rule built, and the routing decision still unchanged.

Plus a smaller companion fix from the same report: `codex` was a working
`LLMProviderType` with a provider implementation, a `PROVIDER_ENV_KEYS` entry, and
a `RUNTIME_CONSTRUCTIBLE_PROVIDERS` membership, but was **missing from
`ALL_PROVIDER_TYPES`** — which `detectAvailableProvidersFromEnv()` iterates, so the
provider could never be selected through the router.

**and neglected**:

- **A new config file.** Rejected — `.agentic-qe/llm-config.json` is already the
  router's own config surface and already the file `ak` writes. A second file
  means two things to keep in sync and two things for a consumer to discover.
- **The BMAD-002 agent overlay (`.claude/agent-overrides/*.yaml`).** Rejected —
  its design center is agent *content and behavior*
  (`minimumFindings`, `preferredFrameworks`, `severityThresholds`). Conflating
  "how an agent is customized" with "which LLM runs it" couples two orthogonal
  systems that currently version and reload independently.
- **Auto-enabling a provider named in an override.** Rejected — silently enabling
  a provider is how a user ends up billed for something they never turned on
  (the exact failure ADR-123 corrected). We warn loudly instead and leave the
  override inert until the provider is genuinely available.
- **Threading a config object through `getPreferredModelForAgent()`.** Deferred —
  it is a synchronous pure-lookup called from rule construction, capability
  resolution, and router dispatch; plumbing config through all of them is a much
  larger change than this feature justifies. Module-level state installed once at
  router construction, with an explicit reset for tests, is the proportionate
  design.
- **Reimplementing qe-court's `routing` map on top of this.** Deferred, not
  rejected — the issue is right that one routing model beats two, but qe-court's
  invariants (`≥2 distinct vendors seated`, `jury vendor ∉ {writer, defense}`) are
  enforced in `referee.ts` and are court-specific. Converging them is its own
  change with its own risk; see Follow-ups.

**to achieve** a documented, stable on-disk contract that any consumer — a user
hand-editing JSON, or a tool like `ak` writing it programmatically — can rely on
to route security-sensitive agents to a stronger model and mechanical ones to a
cheap or local provider, without forking the router; and, as a side effect, the
first time ADR-043's per-agent routing machinery has actually influenced a routing
decision at runtime,

**accepting that** module-level override state is process-global (correct for the
one-router-per-process reality, but tests must reset it — hence
`resetAgentProviderOverrides()`); that an override naming an unavailable provider
is inert-with-a-warning rather than an error, because failing router construction
over one bad line in a config file is worse than degrading; and that hand-edited
JSON is untrusted input, so entries are validated and dropped individually
(`sanitizeAgentOverrides`) rather than validated all-or-nothing.

---

## Schema

```jsonc
{
  "defaultProvider": "claude-code",
  "fallbackChain": { /* existing shape, unchanged */ },

  "agentOverrides": {
    "qe-security-scanner": { "provider": "cognitum", "model": "cognitum-high" },
    "qe-test-architect":   { "provider": "claude-code", "model": "sonnet" },
    "qe-mutation-tester":  { "provider": "ollama" }
  }
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `provider` | `ExtendedProviderType` | no | agent's category default |
| `model` | `string` | no | agent's category default |
| `temperature` | `number` | no | agent's category default |
| `maxTokens` | `number` | no | agent's category default |
| `priority` | `number` | no | category priority + 100 |

**Validation.** Unknown providers, providers that are not runtime-constructible,
non-object entries, and entries with no usable fields are dropped with a
`console.warn`. An `apiKey` field is stripped and warned about — the same
"never persist API keys" discipline `saveRouterConfigFile` already enforces for
`providers.*`.

**Precedence.** `agentOverrides[agentType]` > `DEFAULT_ROUTING_OVERRIDES` >
`AGENT_CATEGORY_MAP` → `DEFAULT_CATEGORY_MODELS`. The global `defaultProvider` and
`fallbackChain` are unaffected; an override changes only which provider a matching
agent's request is routed to first, and normal fallback still applies if that
provider fails.

---

## Consequences

- **Positive:** ADR-043's override mechanism becomes reachable by every consumer
  rather than only by in-process callers; downstream tools get a documented
  contract instead of reverse-engineered internals; `codex` becomes selectable
  through the router for the first time; and per-agent cost/quality tradeoffs
  (strong model for security, local model for mutation) are available across the
  whole roster, not just qe-court's nine roles.
- **Neutral:** projects that never write `agentOverrides` get byte-identical
  routing — the rule list is untouched when the map is empty.
- **Negative / watch:** a second routing surface now exists alongside qe-court's
  `routing` map until they converge; module-level state requires test discipline;
  and an override pointing at a disabled provider is silent-but-warned rather
  than loud, which relies on users reading stderr.
- **Reversible:** the key is additive and optional. Removing it restores the
  previous behavior exactly; no migration, no persisted state.

---

## Follow-ups

- Converge qe-court's court-role `routing` map onto `agentOverrides`, preserving
  its vendor-diversity invariants (`referee.ts`) as a validation layer on top
  rather than a parallel mechanism.
- Consider surfacing `agentOverrides` through `aqe llm config --set` so users can
  set an override without hand-editing JSON.
- Consider exposing the resolved per-agent routing table via a diagnostic command,
  so "why did this agent use that model?" is answerable without reading source.
