# ADR-100: Tool-Loop Circuit Breaker for Hook Reliability

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-100 |
| **Status** | Implemented |
| **Date** | 2026-06-10 |
| **Author** | AQE Core (Fable 5 improvement initiative, issue #520) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** the Bash command lifecycle hooks (`aqe hooks pre-command` / `post-command`) that Claude Code invokes around every shell command,

**facing** runaway retry loops — agents re-running the same failing command verbatim, which Fable 5-era models' persistence makes more expensive, not less,

**we decided for** a consecutive-failure circuit breaker keyed by normalized command signature (WARN at 3, BLOCK at 5, half-open probe after 2 minutes, reset on success), persisted in a JSON sidecar (`.agentic-qe/tool-loop-state.json`), advisory by default with `AQE_STRICT_TOOL_LOOP=1` upgrading the block to a PreToolUse deny,

**and neglected** in-process state (impossible — every hook call is a fresh CLI process) and kv-store persistence via memory.db (adds DB-init latency to every Bash command in pre-command, which today deliberately runs without opening the DB),

**to achieve** early interruption of unproductive retry loops with a recovery hint, without slowing the hot pre-command path or ever breaking a hook (fail-open everywhere),

**accepting that** a small non-DB state file lives under `.agentic-qe/` (ephemeral guardrail state, safe to delete; not a data store — the unified-persistence rule targets durable data) and that advisory mode relies on the model heeding the hint.

---

## Context

Adopted from ruflo's Hermes-Agent tier-1 audit (ruflo PR #2237, tool-loop circuit breaker: warn at 3 / block at 5). AQE already has a circuit breaker at the *domain* level (`src/coordination/circuit-breaker/domain-circuit-breaker.ts`, ADR-064 Phase 2D) protecting QE domains inside the long-lived queen process; nothing protected the command level, where each hook invocation is a separate short-lived process.

The breaker mirrors ADR-064's closed → open → half-open semantics. The signature normalizes whitespace and caps length so cosmetic command variations share one failure count. It is orthogonal to the existing dangerous-command patterns in pre-command (security) — the breaker addresses *futility*, not danger.

## Options Considered

### Option 1: JSON sidecar state + hook integration (Selected)

Per-project `tool-loop-state.json`; `post-command` records `(signature, success)`, `pre-command` consults and emits warnings/blocks through the existing PreToolUse output (additionalContext / permissionDecision).

**Pros:** sub-ms reads on the hot path; survives process boundaries; fail-open trivially; stale entries pruned on write
**Cons:** one more file under `.agentic-qe/` (documented as ephemeral)

### Option 2: Reuse DomainCircuitBreaker class in-process (Rejected)

**Why rejected:** hook processes live for one command — in-process state never sees the previous invocation. The class's *semantics* were reused; its instance lifecycle cannot be.

### Option 3: kv_store via UnifiedMemory (Rejected)

**Why rejected:** pre-command currently runs without opening memory.db; adding a DB init to every Bash command's PreToolUse hook adds user-visible latency for a few bytes of counter state.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-064 | Agentic Teams Integration | Domain circuit breaker whose state-machine semantics this mirrors |
| Relates To | ADR-021 | QE ReasoningBank | post-command already records outcomes for learning; the breaker piggybacks on the same hook |
| Part Of | — | Fable 5 / ruflo-parity initiative | Tracking issue #520, improvement 3 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| — | Guardrail implementation | Source | `src/cli/commands/hooks-handlers/tool-loop-guardrail.ts` |
| — | Hook integration | Source | `src/cli/commands/hooks-handlers/command-hooks.ts` (pre-command/post-command) |
| — | Unit tests (11) | Tests | `tests/unit/cli/hooks/tool-loop-guardrail.test.ts` |
| — | ruflo prior art | External | ruvnet/ruflo PR #2237 (`tool-loop-guardrail.ts`) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-06-10 | Implemented | 2026-12-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-06-10 | From Fable 5 improvement plan (issue #520) |
| Implemented | 2026-06-10 | Guardrail + hook wiring + 11 unit tests + E2E verification via real hook commands |

---

## Definition of Done Checklist

- [x] Evidence: 11 unit tests green; E2E via real `aqe hooks pre-command`/`post-command` sequence (warn after 3, block after 5, strict deny, reset on success)
- [x] Criteria: 3 options compared; fail-open verified (corrupt state file → allow)
- [x] Agreement: follows ruflo #2237 prior art per improvement plan
- [x] Documentation: this ADR; MCP parity N/A documented (AQE MCP server exposes no hooks tools — hooks are a CLI-only surface)
- [x] Review: verification record on issue #520
