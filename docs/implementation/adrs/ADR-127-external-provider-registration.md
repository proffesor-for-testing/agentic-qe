# ADR-127: External provider registration — a host may earn its own provider identity

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-127 |
| **Status** | Accepted — implemented (see Verification) |
| **Date** | 2026-08-19 |
| **Updated** | 2026-08-30 — config-aware advisor CLI/MCP construction |
| **Author** | AQE Core |
| **Review Cadence** | 6 months |
| **Supersedes** | — |
| **Related** | ADR-011 (the provider interface and `ProviderManager`; no file in this directory — cited as ADR-043 does), [ADR-043](./ADR-043-vendor-independent-llm.md) (`ExtendedProviderType`, `HybridRouter`), [ADR-123](./ADR-123-billing-aware-llm-execution.md) (`AQE_LLM_PROVIDER`, billing modes, budget enforcement), [ADR-125](./ADR-125-on-disk-agent-routing-overrides.md) (the precedent: an existing in-memory mechanism made reachable from `.agentic-qe/llm-config.json`). Origin: issue [#628](https://github.com/proffesor-for-testing/agentic-qe/issues/628) (Chris Phillipson / `agentic-kit`), following [#568](https://github.com/proffesor-for-testing/agentic-qe/issues/568). |

---

## WH(Y) Decision Statement

**In the context of** AQE's LLM provider set being a closed enumeration that only
AQE can extend — `LLMProviderType` a ten-member union in
`src/shared/llm/interfaces.ts:19`, `ALL_PROVIDER_TYPES` a frozen `const` array in
`src/shared/llm/router/types.ts:51`, `ProviderManager.createProvider()` a `switch`
whose `default` arm throws (`src/shared/llm/provider-manager.ts:565`), and
`resolveProviderOverrideFromEnv()` rejecting any `AQE_LLM_PROVIDER` value not in
that array (`src/shared/llm/router/config-store.ts:411`) — so that a downstream
integrator can *select* any provider we already ship but cannot *introduce* one,

**facing** issue #628 from the same downstream tool that motivated ADR-125:
`agentic-kit` admits external host adapters via a declarative manifest and runs a
tiered conformance kit against them, but a host it supervises cannot be given an
AQE-provider identity of its own. The two workarounds available to it are both
bad, and it correctly refused both: **fork our enum**, which puts a copy of our
type system in someone else's release cycle; or **project the host onto an
unrelated built-in provider identity**, which would make `aqe health` report that
(say) `openai` served work that a different vendor's host actually served —
falsifying exactly the billing-and-attribution honesty ADR-123 was written to
establish. Quality is never blocked today, because work still runs through the
*model provider underneath* a host; what is blocked is telling the truth about who
ran it,

**and facing, additionally, two constraints the issue could not see from outside:**

1. **An in-process registration API alone cannot serve the requester.**
   `agentic-kit` consumes AQE as spawned subprocesses — the `aqe` CLI bundle
   (`scripts/build-cli.mjs`) and the MCP server bundle (`scripts/build-mcp.mjs`),
   each a separate esbuild ESM artifact. A module-singleton `registerProvider()`
   is only reachable by a caller that shares the process. Shipping the issue's
   first bullet on its own would deliver a surface the person who asked for it
   could not use.
2. **The provider type is load-bearing in six exhaustive `Record`s** —
   `billing-modes.ts:13`, `config-store.ts:45` (`PROVIDER_ENV_KEYS`),
   `translation/message-formatter.ts:24`, `cli/commands/llm-router.ts:546`, plus
   the cost-tracker and circuit-breaker maps — and in a second hand-maintained
   allowlist, `RUNTIME_CONSTRUCTIBLE_PROVIDERS` (`config-store.ts:73`), which
   exists only to stay in sync with the `switch`. Widening the union without
   addressing these does not compile,

**we decided for** a two-surface extension point, additive and opt-in, with the
declarative surface as the primary one:

1. **A declarative external-host adapter (the surface that unblocks #628).** An
   `externalProviders` block in `.agentic-qe/llm-config.json` — the file
   `config-store.ts` already loads and downstream tools already write (ADR-125)
   — declares a host by data, not by code:

   ```jsonc
   "externalProviders": {
     "my-host": {
       "kind": "cli",
       "command": ["my-host", "exec"],
       "billingMode": "subscription",
       "models": ["default"]
     }
   }
   ```

   AQE builds a generic `ExternalCliProvider` from that declaration. This
   generalizes a shape we have already shipped twice and proven: `providers/codex.ts`
   and `providers/claude-code.ts` are both "spawn a vendor CLI, feed it a prompt,
   parse a result, attribute the spend." Because the declaration lives in config
   rather than in an imported module, it self-registers identically in the CLI
   bundle and the MCP bundle, with **no code loading and no new arbitrary-execution
   surface**.

2. **`registerProvider(type, factory)` for in-process embedders.** Exported from
   `agentic-qe/shared/llm`, refusing to shadow a built-in type, and validating in
   two stages: the *registration* eagerly (type shape, collision, factory is a
   function), and the *produced instance* at construction — a factory is
   deliberately not called at registration time, because a provider constructor
   may spawn processes or open handles. The instance check also rejects a
   provider whose `type` differs from the identity it registered under, so a
   host cannot register as `my-host` and then report itself as `claude`. This is
   the issue's literal first bullet, and it is the right surface for a consumer
   that embeds AQE as a library — it is simply not the one that serves the filer.

3. **The type system opens; the published constant does not.**
   `LLMProviderType` becomes `BuiltinProviderType | (string & {})` — preserving
   autocomplete on the ten built-ins while admitting registered identities. The
   exported `ALL_PROVIDER_TYPES` array keeps its present contents and meaning
   ("the providers AQE ships"), because it is public API and consumers read it;
   a new `allSelectableProviderTypes()` returns built-ins ∪ registered for
   validation paths. The exhaustive `Record`s become
   `Record<BuiltinProviderType, _>` (or `Record<BuiltinExtendedProviderType, _>`
   where `onnx` participates), read through an explicit type-guard.

   This last part turned out to matter more than expected. Widening the union
   alone **compiles clean** — TypeScript collapses
   `BuiltinProviderType | (string & {})` into an index signature, so every
   `Record` keyed on it silently accepts the change *and* starts typing
   `MAP[type]` as defined when it is `undefined` at runtime. Pinning the maps to
   the closed type restores both properties: a missing `case` fails the build
   again, and an open-typed lookup is correctly `_ | undefined`, forcing the
   fallback. Verified by temporarily adding an eleventh built-in: five maps
   failed the build (`billing-modes`, `config-store`, `message-formatter`,
   `cli/llm-router`, `cost-tracker`), and seven previously-unguarded lookup
   sites surfaced as errors.

**We decided against:**

- **A `providerPlugins: [{ module: "./my-provider.js" }]` config key that
  dynamic-imports user code at boot.** This is the most obvious reading of "plugin
  registration," and it is the wrong default for this tool. It makes a repo-local
  JSON file sufficient to execute arbitrary code inside a process that routinely
  runs unattended in CI — a supply-chain foothold acquired by editing a config
  file, in a *quality engineering* tool whose output is trusted to gate releases.
  The declarative adapter covers the requester's stated case (a supervised host
  invoked as a subprocess) without opening it. Deferred, not rejected: if a
  concrete need appears that data cannot express, it returns as its own ADR with
  its own trust gate — and note that the esbuild bundles would then need the
  dynamic specifier resolved against the *config file's* directory, not the
  bundle's.
- **Widening `ALL_PROVIDER_TYPES` itself to include registered types.** Exported,
  read by consumers, and semantically "what AQE ships." Mutating it at runtime
  would make a published constant depend on load order.
- **Trusting a declared `billingMode`.** A host that bills per-token but declares
  `subscription` would quietly defeat the budget enforcement ADR-123 added to the
  primary execution path (`hybrid-router.ts` → `assertWithinBudget`). We record
  the declaration *with its provenance* and surface it, rather than believing it
  silently (see Schema).
- **Bundling `agentic-kit`'s hosts into AQE.** Explicitly a non-goal in #628, and
  we agree.

**to achieve** an honest answer to the question `aqe health` already claims to
answer — *who served this work, and who pays for it* — for hosts AQE does not
ship; and, for the second time after ADR-125, a documented on-disk contract that
`ak` can write to instead of reverse-engineering our internals or forking our
types.

**accepting that** the registry is process-global module state, so tests must
reset it (`resetProviderRegistry()`, mirroring ADR-125's
`resetAgentProviderOverrides()`); that an external declaration naming a binary
that is absent is inert-with-a-warning rather than fatal, because failing router
construction over one bad config line is worse than degrading; that a declared
`billingMode` is an assertion by the declarer and is labelled as such rather than
verified; and that `ExternalCliProvider` will not support `embed()` — it reports
`EMBEDDING_UNSUPPORTED` and falls back, since a generic CLI contract cannot
promise an embeddings endpoint.

---

## Schema

```jsonc
{
  "defaultProvider": "my-host",           // AQE_LLM_PROVIDER=my-host also works
  "providers": { /* existing shape, unchanged */ },
  "agentOverrides": { /* ADR-125, unchanged */ },

  "externalProviders": {
    "my-host": {
      "kind": "cli",
      "command": ["my-host", "exec"],
      "billingMode": "subscription",
      "models": ["default", "fast"],
      "defaultModel": "default",
      "modelFlag": "--model",
      "timeoutMs": 180000,
      "maxConcurrency": 2,
      "stripEnv": ["OPENAI_API_KEY"],
      "displayName": "My Host (subscription)"
    }
  }
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `kind` | `"cli"` | yes | — (only `cli` in this ADR) |
| `command` | `string[]` | yes | — (argv; not shell-interpreted) |
| `billingMode` | `subscription \| metered-api \| metered-capped \| local` | no | `metered-api` (the safe, cap-requiring assumption) |
| `models` | `string[]` | no | `["default"]` |
| `defaultModel` | `string` | no | `models[0]` |
| `modelFlag` | `string` | no | omitted — model not passed |
| `timeoutMs` | `number` | no | `180000` |
| `maxConcurrency` | `number` | no | `2` |
| `stripEnv` | `string[]` | no | `[]` — env keys removed from the child |
| `displayName` | `string` | no | the type string |

**The host contract.** AQE writes the fully-flattened prompt to the host's
**stdin** and reads the completion from its **stdout**; stderr is diagnostic and
is used to classify failures. Message roles are flattened (system content
becomes a preamble) because a generic CLI has no role protocol — the same
strategy `codex.ts` uses, and the reason `message-formatter` falls back to
`'first-message'` for unknown providers. A non-zero exit with empty stdout is an
error; a rate-limit-shaped stderr is classified `RATE_LIMITED` and is retryable.

**Availability is answered without invoking the host.** `isAvailable()` resolves
`command[0]` on `PATH` (respecting `PATHEXT` on Windows) rather than running it.
AQE cannot know what invoking an arbitrary host costs, and spawning it with an
empty prompt to ask "are you installed?" could burn a real request against the
user's plan. A declaration for a host that is not installed on this machine is
therefore valid-but-unavailable, not malformed — config files stay portable.

**Validation — identical to a built-in, per the issue's non-goal.** A type
colliding with a built-in is rejected. A non-array or empty `command` is rejected.
`command[0]` must resolve on `PATH` or be an absolute path for the provider to
report `isAvailable()`; absence is a warning, not a construction failure. An
`apiKey` field is stripped and warned about, matching `saveRouterConfigFile`'s
existing never-persist-keys discipline. Bad entries are dropped **individually**,
never all-or-nothing.

**Billing provenance.** A registered provider's `billingMode` is stored alongside
its source (`config:.agentic-qe/llm-config.json` or `api:registerProvider`).
`aqe health` renders it as `external — subscription (declared by config)`, so the
word *declared* is on screen. `billingModeForType()` continues to return
`metered-api` for any type it does not know, which means an external provider that
declares nothing is treated as billable and requires a cap — the conservative
direction.

**Precedence.** `AQE_LLM_PROVIDER` > `defaultProvider` > env detection > defaults,
unchanged from ADR-123. A registered type is admitted at each of those gates on
the same terms as a built-in; `resolveProviderOverrideFromEnv()` consults
`allProviderTypes()` rather than the frozen array. Registered providers
participate in the fallback chain, circuit breaker, cost tracking, and budget
assertion with no special-casing.

---

## Consequences

- **Positive:** a host can hold an AQE-provider identity without forking our enum
  or misrepresenting a vendor; `agentic-kit` gets the sanctioned extension point
  it asked for rather than a workaround it had already refused on principle; the
  duplicated `RUNTIME_CONSTRUCTIBLE_PROVIDERS`/`switch` sync burden is replaced by
  a single registry lookup; and the CLI-subprocess provider pattern proven by
  `codex` and `claude-code` becomes reusable instead of being copy-pasted a third
  time.
- **Neutral:** projects that never write `externalProviders` and never call
  `registerProvider()` get byte-identical behavior — the built-in `switch` arms
  are untouched and are still consulted first.
- **Negative / watch:** the provider type is no longer exhaustively checkable, so
  the compiler stops catching a missed `case` — the six `Record`s now rely on
  their fallback reads being correct, which is a test obligation rather than a
  type obligation. A declared `billingMode` is unverified. `ExternalCliProvider`
  cannot embed. And `AQE_LLM_PROVIDER` typos that previously produced a clean
  "not a known provider" warning will now also match nothing but must not be
  mistaken for a silently-registered provider — the warning text enumerates
  built-ins *and* registered types to keep that distinguishable.
- **Reversible:** both surfaces are additive and optional. Deleting the
  `externalProviders` key and not calling `registerProvider()` restores previous
  behavior exactly; no migration, no persisted state.

**A latent misattribution bug this work surfaced and fixed.** `billingNotice()`
resolved the subscription case as ``provider === 'codex' ? 'ChatGPT' : 'Claude
Code'``, and `aqe health` printed a flat `Claude subscription (no per-token
charge)`. Both were correct only because the built-in set happened to contain
exactly two subscription providers. The first external provider to declare
`subscription` was therefore told — in the very output ADR-123 added so users
are never surprised about who pays — that the user's *Claude Code* plan was
covering a third party's host. Both sites now branch on the registry and render
`external — <mode> (declared by <source>, not verified by AQE)`. Regression
tests pin the built-in wording as well as the external wording.

---

## Follow-ups

- ~~Add `"./shared/llm"` to `package.json` `exports`.~~ **Done as part of this
  ADR.** `src/shared/llm/index.ts:19` had advertised
  `import { … } from 'agentic-qe/shared/llm'` in its own usage example while
  that subpath was never exported — an embedder had to reach it through
  `agentic-qe/shared`. `registerProvider()` would have been unusable by the very
  consumer it is for.
- `kind: "http"` for hosts that expose an OpenAI-compatible endpoint rather than a
  CLI. Deliberately out of scope here; `cli` is what #628 needs.
- A conformance command (`aqe llm-router verify <type>`) that runs a registered
  provider through a minimal generate/health probe, so `agentic-kit`'s tiered
  conformance kit has something to call rather than reimplementing the checks.
- Revisit `providerPlugins` (dynamic module loading) only with an explicit trust
  gate — an allowlist plus a consent prompt — and only if a real need appears that
  the declarative schema cannot express.

---

## Verification

Everything below was executed, not asserted.

The 2026-08-30 amendment closes a construction-path drift found after release:
`aqe llm advise` used a private minimal router bootstrap and therefore skipped
config-declared provider registration. It now uses the same config-aware router
service as the kernel. A real CLI subprocess regression declares an external
host, invokes `llm advise`, and asserts both the host marker and provider
identity. Because MCP `advisor_consult` delegates to this command, its protocol
test must cover the same declaration before #628 closes.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` (tsc + ESM + CLI bundle + MCP bundle) | all four succeed |
| `tests/unit/shared/llm/provider-registry.test.ts` | 32 passed |
| `tests/integration/llm/external-provider-registration.test.ts` | 15 passed |
| `tests/integration/llm/external-provider-declarative.test.ts` | 26 passed (real subprocesses, no spawn mocking) |
| Full `tests/unit/shared/llm` + `tests/integration/llm` | 1104 passed, 0 failed |
| Exhaustiveness probe (add an 11th built-in) | 5 maps correctly fail the build; reverted |

**CLI** — in a fixture project declaring `my-host`, `aqe llm providers` lists it
as `my-host *  available  Yes  default` with the footnote *“external provider
declared by this project, not shipped with AQE”*, and
`AQE_LLM_PROVIDER=my-host aqe health` prints
`Provider: my-host  ● external — subscription (declared by …/llm-config.json, not verified by AQE)`.

**MCP** — CLAUDE.md requires MCP fixes be verified through real protocol calls,
not handler unit tests. The built MCP bundle was spawned in the same fixture and
driven over JSON-RPC stdio: `initialize` → `tools/list` (88 tools) →
`tools/call test_generate_enhanced`. The declared host's process was genuinely
invoked (its log recorded a 1157-character prompt) and its output came back in
the MCP response. The declaration reached both bundles from one config file,
which is the property the whole declarative design exists to provide.

Note: the `model_route` / `routing_economics` MCP tools do **not** surface this —
they belong to ADR-026's three-tier *model* router (Haiku/Sonnet/Opus), a
different subsystem from ADR-043's provider router. Anyone probing external
provider selection over MCP should drive a tool that performs real LLM work.
