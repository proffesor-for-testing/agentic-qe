# Darwin-QE Self-Learning: Cheaper, Self-Improving Test Generation

*A guide to the benchmark-driven improvements AQE shipped in mid-2026 — what we
measured, what we learned, what changed for you, and how to turn it on.*

> **TL;DR.** AQE can now do most routine quality-engineering work (writing tests,
> BDD scenarios) on a **free local model first**, automatically **repairing** and
> only **escalating to a paid model for the hard cases**. On a real benchmark this
> keeps **~70–80% of tasks at $0** while staying competitive with a frontier model
> on quality. Everything is **opt-in and off by default** — enabling it changes
> nothing for anyone who doesn't.

---

## 1. Why we did this

Most "AI for QE" tools use one expensive model for everything. That's wasteful:
*verifying* a test is much cheaper than *writing* one, and a lot of QE work is
bounded enough that a cheap model can do it — **if** the software around the model
is smart about when to spend more.

We borrowed the economic structure proven by [Darwin Mode](https://github.com/ruvnet/agent-harness-generator)
(cheap-first → repair → escalate, which roughly doubled a fixed cheap model's
results *without retraining anything*) and **measured whether it holds for QE** —
because QE has something open-ended coding doesn't: an **objective scorer**. A
generated test either kills a mutant or it doesn't; a branch is covered or it
isn't. So we could test our ideas against ground truth instead of guessing.

---

## 2. The benchmarks we ran

All three used **real models** generating **real tests**, scored by a **real
oracle** (mutation kill-rate + coverage on a corpus of small modules) — no
simulation, with the honest negatives recorded.

| Benchmark | Question | Headline result |
|---|---|---|
| **Model gate** (5 modules, n=30) | Can a cheap local model do QE test generation, and how does it compare to a frontier model? | A small 8B model is **below the floor** (couldn't write a valid suite); a **30B local model clears it** (~89% mutation kill). The cheap-first→repair→**escalate** lane lands **within noise of the frontier model** while keeping **~83% of tasks $0-local**. |
| **Judge selection** (n=20→30) | When the cheap model produces several candidate tests, can a separate cheap model reliably pick the best one? | A strong cheap judge picks the best **~89% of the time** — reliable — **but** it adds almost nothing when one model's candidates all look alike. |
| **Cross-model** (n=20) | Does generating candidates from *different* model families help? | **Yes, ~+6 quality points** over a single model — two diverse models **cover each other's failures** (when one writes nothing valid, the other usually does). And this win needs **no judge** — picking the first valid candidate already captures it. |

---

## 3. What we learned

1. **You can make the *verifier* cheap, but not the *writer*.** On the hardest,
   reasoning-dense tasks a small model just can't write a correct fix — so AQE's
   cheap tier is used where generation is **bounded** (a unit test, a BDD scenario)
   and **escalates** the rest. (We did *not* try to beat the frontier with a cheap
   model alone — that doesn't work, and we recorded it.)

2. **Model choice is a first-class lever.** The jump from an 8B to a 30B local
   model was the difference between "useless" and "competitive." **Don't trust a
   model's leaderboard rank for *your* task — measure it.** (A model that ranks
   well elsewhere flopped in our setup; another, picked by measurement, didn't.)

3. **Diversity beats repetition.** Trying the same model a few different ways helps
   a little; trying **different model families** helps much more, because they fail
   in different places and rescue each other.

4. **A cheap LLM "judge" is reliable but rarely worth it** for picking the best
   test — when you already run the real test/coverage, that *is* the oracle, and
   when candidates cluster there's nothing to pick between. We measured this before
   trusting it (and almost shipped a false negative — see §6).

5. **Never let the model grade its own homework.** A "passing" self-written test
   isn't evidence the code is right. AQE only lets an **objective** check (real test
   run, coverage, mutation, schema) move its confidence — a guard that's built in.

---

## 4. What changed for you

All opt-in, all off by default. Each is a real, tested capability:

- **Free local tier with repair + escalation.** Routine test generation runs on a
  local model first; on failure it **repairs in place**, and only the hard tail
  **escalates** up to paid tiers through your existing router. ~70–83% of tasks
  stayed $0 in our benchmark.
- **Best-of-k generation.** Tries a few diverse candidates and keeps the first that
  passes the objective check — costs an extra call **only when the first fails**.
- **Cross-model best-of-k.** Optionally draws those candidates from **different
  models** (e.g. a local model + a cloud model) — the +6-point diversity win.
- **Self-learning loop.** Every cheap-vs-escalated outcome feeds AQE's routing
  confidence, so it gets better at choosing the right tier over time.
- **Broader coverage.** The lane works for **test generation** and
  **requirements→BDD** today, via a reusable, off-by-default switch.
- **Cost-Pareto value scoring.** AQE can rank models by **quality-per-dollar** (and
  compute the non-dominated "frontier" of sensible choices) from *measured* data.
- **Adversarial verification gate.** An optional output gate that runs findings past
  blind, independent refuters and **drops the unverified ones before you see them**.
- **MCP self-governance.** AQE now ships a default-deny policy for its own tool
  surface, with a CI gate (largest-real-MCP-surface dogfood).

**Honest limits.** The cheap tier only pays off where generation is bounded and an
objective check exists. The recommended local model (~18 GB) doesn't fit an 8 GB
box — small-RAM users get **escalation-only** value (the cheap tier mostly defers).
Production gates today use fast structural checks, not the full mutation oracle, so
the in-loop confidence is "proxy-grade." None of this is hidden.

---

## 5. How to use the Darwin-QE self-learning system

### 5.1 Turn it on

The free tier is off until you opt in — either per-coordinator config or an env var:

```bash
# Enable the cheap-first lane for the whole process
export AQE_FREE_TIER=1
export AQE_FREE_TIER_MODEL=qwen3:30b-a3b   # ship the 30B, NOT the 8B (below the floor)
```

Point it at a local OpenAI-compatible endpoint (Ollama, `ruvllm serve`, LM Studio):

```bash
export OLLAMA_URL=http://localhost:11434    # or host.docker.internal:11434 in a container
ollama pull qwen3:30b-a3b
```

That's it — routine test generation now tries the local model first, repairs, and
escalates the hard cases through your configured paid router.

### 5.2 Configure it (per coordinator)

```ts
new TestGenerationCoordinator(eventBus, memory, agentCoordinator, {
  enableFreeTier: true,
  freeTierModel: 'qwen3:30b-a3b',
  freeTierBestOfK: 2,        // try 2 diverse candidates (extra call only if the 1st fails)
  freeTierRepairAttempts: 1, // repair in place before escalating
});
```

Pick the model to fit your hardware (`freeTierModel`): a 30B clears the QE floor; an
8B does not. You can also point the free tier at a **cloud** OpenAI-compatible
endpoint (OpenRouter, Groq, cloud Ollama) — see
[free-tier-local-models.md](./free-tier-local-models.md) for the provider presets.

### 5.3 Cross-model best-of-k (the +6 win)

Generate candidates from **different model families** so they cover each other's
failures. Provide a small generator pool:

```ts
{
  enableFreeTier: true,
  freeTierBestOfK: 2,
  freeTierCandidateProviders: [
    { kind: 'local-ollama', model: 'qwen3:30b-a3b' },
    { kind: 'openrouter',   model: 'z-ai/glm-5.2', apiKeyEnv: 'OPENROUTER_API_KEY' },
  ],
}
```

Selection stays the objective verifier (no judge needed) — whichever model writes
the first valid suite wins, and the diversity is what raises quality.

### 5.4 Let it learn

When you pass AQE's routing-feedback collector to the coordinator, every
cheap-vs-escalated outcome lifts (or lowers) the cheap tier's confidence, so AQE
routes better over time. This is the "self-learning" half — it's automatic once the
free tier is opted in at the plugin layer.

### 5.5 Rank models by value (optional)

```ts
import { rankByValue, paretoFrontier, MEASURED_QE_TEST_GEN } from 'agentic-qe/routing/value-score';

rankByValue(MEASURED_QE_TEST_GEN, { costWeight: 0.6 }); // quality-per-$ order
paretoFrontier(MEASURED_QE_TEST_GEN);                   // the only rational choices
```

The shipped numbers are a **measured** snapshot — refresh them from your own
routing-feedback rather than trusting any vendor's leaderboard.

---

## 6. The honesty record

We kept the negatives, because they're the trustworthy part:

- The "cheap model replaces the frontier" idea was **rejected** by our own data
  (recorded, not buried) — the win is the *escalation economics*, not a cheap-only
  harness.
- The judge looked like a failure at first; we found that was a **measurement bug**
  (truncated inputs + too-weak a judge), re-ran it, and the corrected result
  overturned the negative — *then* we found the judge still wasn't the lever.
- One claimed "warm escalation" flaw turned out to be **already fixed** in the code;
  we corrected the claim instead of "fixing" working code.

Same standard the upstream Darwin Mode project holds: publish the measurement,
state the limits, ship the part that earns its place.

---

*See also: [free-tier-local-models.md](./free-tier-local-models.md) (provider setup
+ troubleshooting), and the engineering record in
`docs/metaharness/06-darwin-qe-self-learning-action-lane.md` / ADR-111.*
