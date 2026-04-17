# ADR-093: Opus 4.7 Migration and Claude Code 2026-04 Feature Adoption

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-093 |
| **Status** | Proposed |
| **Date** | 2026-04-17 |
| **Author** | AQE Team |
| **Implementation Branch** | `adr-093-opus-4-7-migration` |
| **Related Issues** | TBD |
| **Review Cadence** | Re-review at 4.7 tokenizer/cost data ≥30 days, at Sonnet 4 retirement (2026-06-15), and at Anthropic Advisor GA |
| **Analysis Method** | Deep web research against anthropic.com, docs.anthropic.com, code.claude.com, Claude Code CHANGELOG.md; cross-referenced against fleet inventory (60 qe-* agents), routing stack (`TinyDancerRouter`, `HybridRouter`, `MultiModelExecutor` per ADR-092), 25+ hardcoded `claude-sonnet-4-20250514` references across `src/`, and all 92 prior ADRs |

---

## WH(Y) Decision Statement

**In the context of** Anthropic's April 16, 2026 release of Opus 4.7 (`claude-opus-4-7`) with breaking Messages-API changes (`thinking.budget_tokens` → 400; non-default `temperature`/`top_p`/`top_k` → 400; thinking content omitted by default), a new tokenizer emitting up to 1.35× more tokens per input at unchanged rate-card, the new `xhigh` effort level that Anthropic recommends as the starting point for agentic coding, 1M context window now at standard pricing with no beta header, the retirement of Sonnet 4 (`claude-sonnet-4-20250514`) on 2026-06-15, and the AQE fleet having 25+ hardcoded references to that retiring model plus 60 qe-* agents with no model-capability frontmatter,

**facing** (1) a hard deadline of 2026-06-15 after which Tier 3 routing 404s fleet-wide if unchanged; (2) latent 400-errors from any agent path that passes `{type: "enabled", budget_tokens: N}` to a 4.7 endpoint; (3) silent cost inflation up to 35% as the 4.7 tokenizer produces more tokens against the same $/MTok; (4) a missed quality-and-cost win on the `xhigh` effort tier that Anthropic explicitly recommends for agentic coding; (5) Claude Code 2026-04 primitives — **Routines** (scheduled/API/GitHub-event triggered agents on Anthropic infra), **Monitor** (event-driven background-script streaming), and the **Advisor tool** beta (`advisor-tool-2026-03-01`) — all of which partially overlap with AQE subsystems and need explicit keep/delegate decisions; (6) AQE's `qe-pentest-validator`, `qe-security-scanner`, and `qe-security-auditor` agents now risk refusals under 4.7's real-time cyber safeguards unless enrolled in Anthropic's Cyber Verification Program,

**we decided for** (a) migrate Tier 3 default to **Sonnet 4.6** (`claude-sonnet-4-6`) at **standard context** — not Opus 4.7, not 1M context — for steady-state fleet use, reserving Opus 4.7 as an opt-in escalation target accessed via ADR-092's `MultiModelExecutor` when `triggerMultiModel=true` and the task warrants maximum capability; (b) retain the **vendor-agnostic advisor architecture from ADR-092** unchanged — do not adopt Anthropic's `advisor_20260301` beta, because it breaks the 7-provider mandate of ADR-043 and duplicates infrastructure AQE already owns; (c) add a **fleet-wide configurable effort level** defaulting to **`xhigh`** via a new `QE_EFFORT_LEVEL` env var + `config/fleet-defaults.yaml` key + per-agent `effort:` frontmatter override, so individual qe-* agents can downgrade (e.g. to `medium` for cheap coverage scans) or upgrade (e.g. to `max` for `qe-security-auditor`) without a code change; (d) a single-commit **model-ID sweep** replacing 25+ hardcoded `claude-sonnet-4-20250514` occurrences with a central `DEFAULT_SONNET_MODEL` constant sourced from `src/shared/llm/model-registry.ts`; (e) a thinking-config compatibility shim translating legacy `{type: "enabled", budget_tokens: N}` callers to `{type: "adaptive"}` when the target model is 4.7, logged at warn-level so callers can be fixed; (f) recalibrating ADR-082 complexity thresholds and the ADR-092 per-session 10-call advisor circuit breaker to account for the 1.0–1.35× tokenizer shift once 30 days of 4.7 telemetry are collected; (g) applying to Anthropic's **Cyber Verification Program** for `qe-pentest-validator`, `qe-security-scanner`, and `qe-security-auditor` before shipping 4.7 as an escalation target; (h) **explicitly deferring** Routines/Monitor adoption to a follow-up ADR (pending GA maturity and value-proof against existing Queen+CronCreate primitives),

**and neglected**:
- **(α) Adopt Opus 4.7 as Tier 3 default.** Rejected: quality gain does not justify the 5× $/MTok over Sonnet 4.6 for steady-state QE work where SWE-bench-class reasoning is rare; 4.7 remains available as an escalation target via ADR-092.
- **(β) Adopt 1M context as the default for 4.6 or 4.7.** Rejected per explicit user direction; Sonnet 4.6 1M context retires 2026-04-30 anyway and Opus 4.7 1M at standard rate is still token-inflated by the new tokenizer. Standard context remains the default; opt-in 1M for specific agents (e.g. `qe-integration-architect` doing cross-repo impact analysis) is allowed via per-agent frontmatter.
- **(γ) Adopt Anthropic's `advisor_20260301` beta tool.** Rejected: breaks ADR-043 vendor-independence (Anthropic-API-only, no Bedrock/Vertex/Ollama), requires beta header, and duplicates ADR-092's `MultiModelExecutor` which already gives AQE 7-provider advisor consultation.
- **(δ) Migrate AQE's scheduled-scan work to Anthropic Routines now.** Deferred to a follow-up ADR: Routines are research preview (launched 2026-04-14), AQE's Queen+CronCreate path is production-proven, and value-proof against existing infra needs real data.
- **(ε) Adopt `xhigh` only for a subset of agents.** Rejected: the user direction was explicit that `xhigh` is fleet-wide default; per-agent override handles the long tail.
- **(ζ) Leave stale `claude-sonnet-4-20250514` references in place and patch on error.** Rejected: the retirement date is known and a single mechanical sweep with a central constant is lower-risk than a distributed migration.

**to achieve** (1) zero fleet breakage at Sonnet 4 retirement on 2026-06-15; (2) `xhigh` agentic-coding quality on every qe-* agent without a code change per agent; (3) zero breaking-change exposure from 4.7 thinking-config API changes thanks to the compatibility shim; (4) preservation of ADR-043's vendor-independence and ADR-092's completed advisor architecture — no double-stack; (5) bounded migration scope: one central model constant, one effort-level knob, one Cyber Verification Program application, one shim; (6) an evidence-gated decision point at 30 days of 4.7 telemetry for recalibrating routing thresholds; (7) documented deferral of Routines/Monitor so the decision is tracked rather than forgotten,

**accepting that** (a) `xhigh` fleet-wide will raise reasoning latency and token spend on agents where `medium` or `high` would have sufficed — mitigated by per-agent override and the follow-up recalibration window; (b) the central `DEFAULT_SONNET_MODEL` constant adds one level of indirection compared to inline literals — trivial cost for fleet-wide upgradability; (c) our explicit choice to keep Sonnet 4.6 at standard context means we do not benefit from the 1M-context availability of 4.7 by default — per user direction; (d) the compatibility shim for thinking-config adds a translation layer where callers should eventually use the new API directly — acceptable as a migration aid with warn-level logging; (e) deferring Routines adoption means AQE will not benefit from Anthropic-managed schedule/trigger infra in this cycle, but avoids a premature migration off a production path; (f) the Cyber Verification Program application process may take weeks — security agents are the last to migrate to 4.7 until approval is received.

---

## Context

**The April 2026 Anthropic release cluster reshapes the model and harness surface AQE builds against:**

1. **Opus 4.7 release (2026-04-16).** Model ID `claude-opus-4-7`, 1M context at standard pricing, no beta header required. SWE-bench Verified 87.6% (vs 80.8% on 4.6), SWE-bench Pro 64.3% (vs 53.4%), CursorBench 70% (vs 58%), XBOW visual-acuity 98.5% (vs 54.5%). Pricing unchanged at $5/$25 per MTok, but a **new tokenizer emits 1.0–1.35× more tokens** per input — real bills rise even at the same rate card.

2. **Breaking Messages-API changes on 4.7 only.** Managed Agents are unaffected, but AQE does not use Managed Agents. The raw-Messages-API callers in `src/shared/llm/providers/*` will error on: `thinking: {type: "enabled", budget_tokens: N}` (must use `{type: "adaptive"}`); `temperature`/`top_p`/`top_k` set to non-default values; thinking content is omitted by default and must be opted in with `thinking.display: "summarized"`.

3. **New `xhigh` effort level** between `high` and `max`. Anthropic explicitly recommends `xhigh` as the starting point for agentic coding. The fleet currently has no effort-level plumbing — all 60 qe-* agents run at the provider's default.

4. **Sonnet 4 retirement on 2026-06-15.** `claude-sonnet-4-20250514` is hardcoded in 25+ locations across `src/`: `src/coordination/task-executor.ts:156-159` (tier 2 and tier 3), `src/shared/llm/router/types.ts`, `src/shared/llm/router/hybrid-router.ts`, `src/shared/llm/router/agent-router-config.ts`, `src/shared/llm/router/routing-rules.ts`, `src/shared/llm/providers/claude.ts`, `src/shared/llm/providers/bedrock.ts`, `src/shared/llm/cost-tracker.ts`, `src/shared/llm/model-mapping.ts`, `src/shared/llm/provider-manager.ts`, `src/shared/llm/interfaces.ts`, `src/cli/commands/llm-router.ts`. Any of these paths will 404 after retirement.

5. **Claude Code 2026-04 net-new primitives.** Routines (scheduled/API/GitHub-event triggered agents on Anthropic infra; launched 2026-04-14 as research preview); Monitor tool (event-driven background-script streaming; 2026-04-09); Advisor tool beta (`advisor-tool-2026-03-01`; 2026-04-09); Managed Agents public beta (2026-04-08, $0.08/runtime hour); Agent SDK (renamed from Claude Code SDK); `ant` CLI; `/ultrareview` parallel multi-agent PR review; automatic prompt caching (2026-02-19); high-res vision at 3.75 MP with 1:1 coordinate mapping; worktree-aware subagents with PreCompact blocking hook. Each partially overlaps with existing AQE subsystems — decisions in this ADR are limited to the 4.7-blocking set plus `xhigh`; Routines/Monitor are explicitly deferred.

6. **Fleet inventory and existing architecture.** 60 qe-* agents under `.claude/agents/v3/`, no `model:` or `effort:` fields in frontmatter — all model/effort selection happens in the routing layer. ADR-082 routes via TinyDancer (FastGRNN, `triggerMultiModel` flag at confidence < 0.80 / < 0.85 for security). ADR-092 completes ADR-082 with `MultiModelExecutor` → `HybridRouter.chat()` for vendor-agnostic advisor consultation across 7 providers. ADR-043 mandates vendor-independence. ADR-088 ships `PromptCacheLatch` for API cost optimization.

7. **Cyber Verification Program.** Opus 4.7 ships with real-time cyber safeguards that may refuse legitimate security work. Anthropic provides a verification program at `https://claude.com/form/cyber-use-case`; enrolled organizations get usage policies that accommodate pentest/security-audit workflows. AQE has `qe-pentest-validator`, `qe-security-scanner`, `qe-security-auditor`, `qe-security-reviewer` — all at risk of refusals until enrolled.

---

## Options Considered

### Option 1: Sonnet 4.6 as Tier 3 default, 4.7 as opt-in escalation target, `xhigh` fleet-wide configurable, defer Routines/Monitor (Selected)

Sonnet 4.6 at standard context becomes the default model for Tier 3. Opus 4.7 is available to `MultiModelExecutor` (ADR-092) as an escalation target when `triggerMultiModel=true`. `xhigh` becomes the fleet-wide default effort level, overridable per-agent. The ADR-092 vendor-agnostic advisor architecture is kept unchanged. One central `DEFAULT_SONNET_MODEL` constant replaces 25+ hardcoded references. A thinking-config shim translates legacy budget_tokens calls to adaptive. The Cyber Verification Program application is filed for security agents. Routines/Monitor adoption is deferred to a follow-up ADR.

**Pros:**
- Zero breakage at 2026-06-15 retirement (single-commit sweep)
- Preserves ADR-043 vendor-independence and ADR-092 advisor architecture
- `xhigh` fleet-wide unlocks agentic-coding quality on every agent without per-agent code changes
- Bounded scope — one central constant, one effort knob, one shim, one application
- 4.7 escalation available via existing ADR-092 infrastructure — no double-stack

**Cons:**
- `xhigh` fleet-wide raises token spend on agents where `medium` would have sufficed (mitigated by per-agent override)
- Does not adopt 4.7 quality wins for steady-state Tier 3 work (by design)
- Defers Claude Code 2026-04 primitives — missed opportunity if Routines matures fast

### Option 2: Opus 4.7 as Tier 3 default at standard context (Rejected)

Make `claude-opus-4-7` the Tier 3 default model across the fleet.

**Why rejected:** 5× $/MTok vs Sonnet 4.6 for steady-state QE work where SWE-bench-class reasoning is rare. Quality gain over Sonnet 4.6 does not justify steady-state cost. Explicitly rejected by user direction.

### Option 3: Opus 4.7 1M context as Tier 3 default (Rejected)

Tier 3 becomes Opus 4.7 with 1M context enabled by default.

**Why rejected:** Explicitly rejected by user direction. Token spend compounded by the 1.0–1.35× tokenizer inflation would make fleet cost unpredictable. 1M context remains available as per-agent opt-in frontmatter for cross-repo impact-analysis agents.

### Option 4: Adopt Anthropic's `advisor_20260301` beta tool (Rejected)

Wire the official Advisor tool with beta header `advisor-tool-2026-03-01` into `claude-provider.ts`.

**Why rejected:** Breaks ADR-043's vendor-independence (Anthropic-API-only, no Bedrock/Vertex/OpenRouter/Ollama/self-hosted). Duplicates ADR-092's `MultiModelExecutor`. Beta header coupling contradicts ADR-010. Revisit on GA + Bedrock parity. Explicitly rejected by user direction.

### Option 5: Per-agent `xhigh` opt-in (Rejected)

Keep the current provider-default effort level and add `xhigh` only to agents that explicitly opt in.

**Why rejected:** Explicitly rejected by user direction ("use xhigh as default, fleet wide"). Leaves the long tail of 60 qe-* agents on the provider default indefinitely.

### Option 6: Adopt Routines + Monitor in this ADR (Rejected — Deferred)

Migrate AQE's scheduled-scan and background-monitoring work to Anthropic Routines and the Monitor tool in this cycle.

**Why deferred:** Routines are research preview (2026-04-14), Monitor is 7 days old at writing. AQE's Queen+CronCreate+post-task-hook path is production-proven across 92 prior ADRs. Value-proof against existing infra needs real data before migration. Tracked as follow-up ADR-094 (proposed).

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-043 | Vendor-Independent LLM Support | Vendor-independence mandate preserved; Advisor tool rejection follows this mandate |
| Depends On | ADR-082 | Neural Model Routing with Tiny Dancer | Complexity thresholds recalibrated after 30 days of 4.7 tokenizer telemetry |
| Depends On | ADR-092 | Provider-Agnostic Advisor Strategy | Opus 4.7 becomes one of the escalation models the existing `MultiModelExecutor` can dispatch to |
| Depends On | ADR-088 | Prompt Cache Latch Fields | Re-evaluate against automatic caching (2026-02-19) in a separate ADR if PromptCacheLatch is now over-engineered |
| Depends On | ADR-026 | AISP Parsing (Rejected) / 3-Tier Routing (CLAUDE.md) | Tier 3 model default updated |
| Supersedes | — | — | No prior ADR superseded |
| Blocks | ADR-094 (proposed) | Claude Code 2026-04 Primitives Adoption (Routines/Monitor/Managed Agents) | Follow-up after this ADR and after 4.7 telemetry |

---

## Implementation Plan

**Phase 1: Safety net (single commit, pre-retirement)**

1. Add `src/shared/llm/model-registry.ts` entry for `claude-opus-4-7` with capabilities `{context_window: 1_000_000, supportsAdaptiveThinking: true, supportsEffortXHigh: true, tokenizer: "opus-4-7"}`.
2. Add `DEFAULT_SONNET_MODEL` constant in `src/shared/llm/model-registry.ts` pointing to `claude-sonnet-4-6`.
3. Mechanical sweep: replace 25+ hardcoded `claude-sonnet-4-20250514` occurrences with imports of `DEFAULT_SONNET_MODEL`. Paths enumerated in the Context section above.
4. Update `src/coordination/task-executor.ts:156-159` tier map: Tier 2 → `DEFAULT_SONNET_MODEL`, Tier 3 → `DEFAULT_SONNET_MODEL` (not Opus 4.7 per decision), escalation-only → Opus 4.7 via `MultiModelExecutor`.

**Phase 2: `xhigh` fleet-wide configurable**

5. Add `QE_EFFORT_LEVEL` env var in `src/shared/llm/interfaces.ts`, valid values `low|medium|high|xhigh|max`, default `xhigh`.
6. Add `config/fleet-defaults.yaml` with `effort_level: xhigh`.
7. Extend qe-* agent frontmatter schema with optional `effort: <level>` field; wire through TinyDancerRouter and HybridRouter.
8. Update `src/shared/llm/providers/claude.ts` to pass `effort: "xhigh"` (or the resolved override) when the target model supports it.

**Phase 3: Thinking-config shim**

9. Add translation layer in `src/shared/llm/providers/claude.ts`: when target model is `claude-opus-4-7` and caller passes `{type: "enabled", budget_tokens: N}`, translate to `{type: "adaptive"}` with warn-level log. Remove shim after callers migrated.
10. Add `thinking.display: "summarized"` opt-in for paths that consume streamed CoT.

**Phase 4: Security agent accommodation**

11. File the Cyber Verification Program application at `https://claude.com/form/cyber-use-case` using the draft at `docs/security/cyber-verification-application.md` (this ADR).
12. Until approval received, `qe-pentest-validator`, `qe-security-scanner`, `qe-security-auditor`, `qe-security-reviewer` remain on Sonnet 4.6 for any path that would otherwise escalate to Opus 4.7.

**Phase 5: Telemetry-gated recalibration (30 days post-Phase 1)**

13. Collect 30 days of `routing_outcomes` SQLite data with 4.7-present escalation calls.
14. Recalibrate ADR-082 complexity thresholds for the 1.0–1.35× tokenizer shift.
15. Recalibrate ADR-092 per-session 10-call circuit-breaker if data shows the cap is under- or over-sized.

**Phase 6: Follow-up ADR (tracked, not blocked by this ADR)**

16. Open ADR-094 (proposed) for Claude Code 2026-04 primitives: Routines, Monitor tool, Managed Agents, Agent SDK rename, `/ultrareview`, high-res vision for `qe-visual-tester`.
17. Open ADR-095 (proposed) to re-evaluate ADR-088 PromptCacheLatch against 2026-02-19 automatic caching.

---

## Validation Criteria

- [ ] All 25+ `claude-sonnet-4-20250514` references replaced with `DEFAULT_SONNET_MODEL` (grep returns 0 on `src/`)
- [ ] `QE_EFFORT_LEVEL=xhigh` confirmed in fleet defaults; per-agent override verified with one qe-* agent downgraded to `medium` and one upgraded to `max`
- [ ] Thinking-config shim has unit test covering legacy `budget_tokens` → adaptive translation against 4.7
- [ ] `claude-opus-4-7` reachable through `MultiModelExecutor.consult()` end-to-end against a pinned fixture
- [ ] Cyber Verification Program application submitted; reference number captured in this ADR
- [ ] Security agents continue to function on Sonnet 4.6 until Cyber Verification approval
- [ ] 30-day telemetry review scheduled in the AQE project tracker

---

## References

- Anthropic, *Introducing Claude Opus 4.7* — https://www.anthropic.com/news/claude-opus-4-7
- Anthropic, *What's new in Claude Opus 4.7* — https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7
- Anthropic, *Migrating to Claude Opus 4.7* — https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Anthropic, *Claude Platform API release notes* — https://platform.claude.com/docs/en/release-notes/api
- Anthropic, *Claude Code CHANGELOG* — https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- Anthropic, *Cyber Verification Program application* — https://claude.com/form/cyber-use-case
- Anthropic, *Managed Agents overview* — https://platform.claude.com/docs/en/managed-agents/overview
- Anthropic, *Routines (scheduled tasks)* — https://code.claude.com/docs/en/web-scheduled-tasks
- ADR-043, ADR-082, ADR-088, ADR-092 (this repo)
