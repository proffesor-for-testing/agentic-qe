# LLM provider routing

> Implements [ADR-043](../implementation/adrs/ADR-043-vendor-independent-llm.md),
> [ADR-123](../implementation/adrs/ADR-123-billing-aware-llm-execution.md), and
> [ADR-125](../implementation/adrs/ADR-125-on-disk-agent-routing-overrides.md).
> Everything here lives in one file: `.agentic-qe/llm-config.json`.

AQE routes each LLM request to a provider. There are two levels of control:

| Level | Key | Scope |
|---|---|---|
| **Global** | `defaultProvider`, `fallbackChain` | every request that no rule matches |
| **Per agent type** | `agentOverrides` | one agent type (`qe-security-scanner`, …) |

Per-agent overrides exist so you can spend model quality where it matters —
a strong reasoning model for security review, a free local model for mechanical
work — without changing the global default for everything else.

## File location

`<project-root>/.agentic-qe/llm-config.json`. It is read at router
construction. **Never put API keys in it** — keys come from environment
variables, and any `apiKey` field found here is stripped with a warning.

## Global settings

```jsonc
{
  "defaultProvider": "claude-code",
  "providers": {
    "claude-code": { "enabled": true },
    "ollama":      { "enabled": true },
    "cognitum":    { "enabled": true }
  }
}
```

A provider whose API key is present in the environment is enabled automatically.
An explicit `"enabled": false` on disk always wins over key presence (ADR-123) —
that is how you stop `ANTHROPIC_API_KEY` in your shell from silently opting you
into paid API billing.

To disable the router entirely: `AQE_LLM_ROUTER_DISABLED=1`.

## Per-agent-type overrides

```jsonc
{
  "defaultProvider": "claude-code",

  "agentOverrides": {
    "qe-security-scanner": { "provider": "cognitum", "model": "cognitum-high" },
    "qe-test-architect":   { "provider": "claude-code", "model": "sonnet" },
    "qe-mutation-tester":  { "provider": "ollama" }
  }
}
```

| Field | Type | Default if omitted |
|---|---|---|
| `provider` | provider id (see below) | the agent's category default |
| `model` | string | the agent's category default |
| `temperature` | number | the agent's category default |
| `maxTokens` | number | the agent's category default |
| `priority` | number | category priority + 100 |

**Entries are partial.** `{ "provider": "ollama" }` changes only the provider;
temperature, token budget, and priority keep their category defaults. You never
have to restate a field you don't want to change.

**Changing provider without naming a model uses that provider's default model**,
not the previous provider's. Writing `{ "provider": "ollama" }` for an agent
whose category default is `claude/claude-sonnet-4-6` resolves to
`ollama/<its configured defaultModel>` — never `ollama/claude-sonnet-4-6`, which
ollama could not serve. Set `providers.<name>.defaultModel` to control it, or
name `model` explicitly.

**Precedence.** `agentOverrides[agentType]` beats the built-in routing overrides,
which beat the agent's category default. The global `defaultProvider` and
`fallbackChain` are unaffected — an override changes which provider is *tried
first* for that agent, and normal fallback still applies if it fails.

### Provider ids

`claude` · `claude-code` · `codex` · `openai` · `ollama` · `openrouter` ·
`gemini` · `azure-openai` · `bedrock` · `cognitum`

`claude-code` and `codex` bill against your Claude Code / ChatGPT subscription
rather than an API key, and require the corresponding CLI on `PATH`.

### Requirement: the caller must identify its agent type

An override only fires for a request that carries an `agentType`. Every AQE
domain service that calls the router now sends one (enforced by a test), so this
is automatic for normal use — but if you call `HybridRouter.chat()` yourself,
include `agentType` or your override will parse cleanly and never apply.

### Agent types

Any AQE agent type: `qe-test-architect`, `qe-security-scanner`,
`qe-mutation-tester`, `qe-coverage-specialist`, `qe-performance-tester`, and so
on — the full roster is in `.claude/agents/v3/qe-*.md`. An agent type with no
override falls back to its category default (security agents to stronger models,
mechanical agents to cheaper ones).

### Validation and diagnostics

Bad entries are dropped individually with a `console.warn`, never fatally — one
typo does not take down router initialization for the project. You will see a
warning on stderr when:

- `provider` names something that isn't a known provider
- `provider` names a provider that can't be constructed at runtime
- an entry isn't an object, or has no usable fields
- an `apiKey` field is present (it is stripped)
- an override points at a provider that is **not enabled** — the override stays
  inert until that provider becomes available. AQE deliberately does *not*
  auto-enable it, because silently enabling a provider is how you get billed for
  something you never turned on.

## Worked example: cheap by default, strong where it counts

```jsonc
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama":      { "enabled": true },
    "claude-code": { "enabled": true }
  },
  "agentOverrides": {
    "qe-security-scanner":  { "provider": "claude-code", "model": "opus" },
    "qe-security-auditor":  { "provider": "claude-code", "model": "opus" },
    "qe-pentest-validator": { "provider": "claude-code", "model": "opus" }
  }
}
```

Everything runs on a free local model except the three security agents, which run
on a subscription-billed frontier model.

## For downstream tool authors

`agentOverrides` is a stable, additive contract. Writing it is safe:

- merge semantics are **keyed-object** (like `providers`), so writing one agent
  key does not clobber the others — you can add an entry without reading and
  rewriting the whole map;
- the key is optional; a config without it behaves exactly as before;
- the entry shape is a subset of the in-process `ModelPreference` type, so it
  will not drift away from the internal model.
