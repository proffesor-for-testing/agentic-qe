# Free-Tier Local Models for Test Generation

Run AQE's test generation on a **free local model first**, with an automatic
**repair loop**, and only pay for a cloud model when you choose to. Most routine
test generation can be handled by a small local model at **$0** — you reserve
paid models for the hard cases.

> **Status:** opt-in, off by default. Enabling it changes nothing for anyone who
> doesn't turn it on. Today the free tier runs **local-only with a repair loop**
> (no automatic escalation to paid models yet).

This is AQE's adaptation of the "cheap-first, repair, escalate" economics
demonstrated by [Darwin Mode](https://github.com/ruvnet/agent-harness-generator):
a feedback/repair loop roughly doubled a fixed cheap model's bug-fix rate
(7.7% → 15.3%) **without retraining anything** — the software around the model
did the work.

---

## What you get

- **Cheap-first generation** — test generation tries your configured free/local
  model before any paid LLM call.
- **Repair loop (D8)** — if the model's first output isn't a valid test (no
  assertion, etc.), AQE feeds the failure back and asks it to fix it, up to a
  configurable number of retries, *before* falling back.
- **Safe fallback** — if the local model can't produce a valid test, AQE
  silently falls back to the normal generation path. You never get a worse
  result than today.
- **Self-learning (D9)** — when wired to routing feedback, every cheap-vs-fallback
  outcome is recorded so routing confidence improves over time.

---

## Quick start (local Ollama)

1. **Install Ollama** and pull a small coding model:

   ```bash
   # on your machine (or the Docker host)
   ollama pull qwen3:8b
   ```

   `qwen3:8b` (~5 GB) is the recommended default — it was the most productive
   local worker in our benchmarks and fits an 8 GB machine. `qwen3:30b-a3b` is
   faster if you have the RAM; `gemma3/4` work but were slower for this task.

2. **Enable the opt-in** (either env var or config):

   ```bash
   export AQE_FREE_TIER=1                 # turn it on
   export AQE_FREE_TIER_MODEL=qwen3:8b    # optional; this is the default
   ```

3. **Generate tests as usual.** AQE now tries the local model first:

   ```bash
   claude "Use qe-test-architect to generate tests for src/services/Add.ts"
   ```

   You'll see a log line: `Free-tier local test generation enabled (model=qwen3:8b, repair-only, no escalation)`.

### Running in a container (Docker Desktop / dev container)

If AQE runs in a container and Ollama runs on the host, point the free tier at
the host gateway (this is the default for the `local-ollama` provider):

```
http://host.docker.internal:11434/v1
```

---

## Choosing a provider

The free tier speaks the OpenAI-compatible `/v1/chat/completions` API, so it
works with several backends. Configure programmatically via `defaultFreeTierLadder()`
and rebinding the bottom (`local`) tier:

```ts
import { defaultFreeTierLadder } from 'agentic-qe/routing/free-tier';

// 1) Local Ollama (default) — $0, private
const ladder = defaultFreeTierLadder('qwen3:8b');

// 2) Cloud Ollama (ollama.com) — key from env, never stored
ladder.bindings.local = {
  provider: 'free-tier',
  config: { kind: 'cloud-ollama', model: 'qwen3:8b', apiKeyEnv: 'OLLAMA_API_KEY' },
};

// 3) OpenRouter free models
ladder.bindings.local = {
  provider: 'free-tier',
  config: { kind: 'openrouter', model: 'mistralai/devstral-small:free', apiKeyEnv: 'OPENROUTER_API_KEY' },
};

// 4) Any OpenAI-compatible endpoint (Groq, vLLM, LM Studio, llama.cpp, …)
ladder.bindings.local = {
  provider: 'free-tier',
  config: { kind: 'openai-compatible', model: 'llama-3.3-70b',
            baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' },
};
```

| Provider kind | `baseUrl` default | API key |
|---|---|---|
| `local-ollama` | `http://host.docker.internal:11434/v1` | none |
| `cloud-ollama` | `https://ollama.com/v1` | `OLLAMA_API_KEY` (or custom `apiKeyEnv`) |
| `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `openai-compatible` | *(you must set `baseUrl`)* | optional `apiKeyEnv` |

**Secrets:** API keys are read from the named environment variable at run time
and **never stored** in any config file — the same policy as AQE's main LLM
router.

---

## Configuration reference

When constructing the test-generation coordinator (or via project config):

| Option | Env var | Default | Meaning |
|---|---|---|---|
| `enableFreeTier` | `AQE_FREE_TIER=1` | `false` | Turn the free tier on |
| `freeTierModel` | `AQE_FREE_TIER_MODEL` | `qwen3:8b` | Local model id |
| `freeTierRepairAttempts` | — | `1` | Same-tier repair retries before fallback |
| Ollama base URL | `AQE_OLLAMA_URL` (or `OLLAMA_URL`) | per-client default (`localhost:11434`, or `host.docker.internal:11434` for the free tier) | One knob that points **every** local client — chat provider, consensus, local judge, embeddings, free tier — at your Ollama. Set it to reach a remote GPU box or a non-default host. The judge still honours its own `NAGUAL_JUDGE_URL` first. |

---

## How it works

1. AQE reads the source file and asks the local model for tests.
2. An **objective check** verifies the output is a real test (contains a
   `test`/`it`/`describe` block *and* an `expect`/`assert`).
3. On failure, the **repair loop** feeds the rejection reason back and retries
   the same local model (up to `freeTierRepairAttempts`).
4. If a valid test is produced, AQE returns it and **skips the paid path**.
5. Otherwise AQE **falls back** to the normal generation path unchanged.

For the design and measured results, see
[Darwin-for-QE action lane](../metaharness/06-darwin-qe-self-learning-action-lane.md).

---

## Troubleshooting

- **No effect / paid path still used:** confirm `AQE_FREE_TIER=1` is set in the
  environment AQE runs in, and that the model responds:
  `curl http://localhost:11434/api/tags` (or `host.docker.internal` in a container).
- **Empty output from reasoning models:** qwen3/gemma split a `reasoning` channel
  from `content`; AQE reads `content` and allows a generous token budget, so this
  is handled — but a very small model on a large file may still fail verification
  and fall back. Try a wider model (`qwen3:30b-a3b`) or a smaller source file.
- **Slow first call:** the first request loads the model into memory; subsequent
  calls are much faster.
