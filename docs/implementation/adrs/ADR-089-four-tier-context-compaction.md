# ADR-089: Four-Tier Context Compaction Pipeline

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-089 |
| **Status** | Proposed |
| **Date** | 2026-04-01 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Source** | Claude Code Internals Research (Six Thinking Hats Analysis) |

---

## WH(Y) Decision Statement

**In the context of** AQE agents conducting long QE sessions (coverage analysis, defect investigation, test generation) where accumulated MCP tool results and conversation context exhaust the LLM context window,

**facing** a single-tier output compaction strategy (per-result truncation only) that cannot manage cross-result accumulation, has no session summary capability, no LLM-powered intelligent compaction, and no recovery mechanism for context overflow errors -- causing sessions to fail or degrade after 30-60 minutes of continuous operation,

**we decided for** a four-tier context compaction pipeline with escalating cost and intelligence: Tier 1 (microcompact -- zero API calls), Tier 2 (QE session summary -- zero API calls), Tier 3 (LLM compact with QE-specific 9-section summary -- one API call), and Tier 4 (reactive compact on 413 errors), managed by a context budget tracker with 5 operational states,

**and neglected** staying with single-tier truncation (sessions remain short), aggressive early summarization (loses detail when not needed), unlimited context via RAG-only approach (adds retrieval latency and complexity), and manual user-triggered compaction (poor UX),

**to achieve** 5-10x longer QE sessions before context exhaustion, automatic graceful degradation under context pressure, zero-cost compaction for 80% of cases (Tiers 1-2), intelligent preservation of critical QE findings in summaries, and transparent context budget visibility via MCP tools,

**accepting that** Tier 3 LLM compact consumes one additional API call per trigger, compaction necessarily loses some detail from early conversation, QE-specific summary structure may not suit all use cases, and post-compact file restoration adds complexity.

---

## Context

### Problem

AQE QE sessions involve heavy MCP tool usage: coverage analysis returns kilobytes of gap data, defect prediction returns risk matrices, test generation returns full test code, and code intelligence returns dependency graphs. After 20-40 tool invocations, the accumulated context approaches or exceeds the LLM context window (200K tokens for Opus 4.6).

Current state: `src/mcp/middleware/output-compaction.ts` provides per-result truncation (single tier). It caps individual tool outputs using `estimateTokens(chars/4)` and summarizes arrays (first 5 + count). However:
- Old results accumulate indefinitely in conversation context
- No time-based or count-based eviction
- No session-level summary capability
- No recovery from 413 context overflow errors
- No context budget tracking or state management

Sessions that exceed context limits either fail silently (truncated responses) or crash with 413 errors.

### Execution Model Clarification

**Critical distinction**: AQE operates as an MCP server. Standard MCP `tools/call` requests are stateless from AQE's perspective — the calling LLM (Claude Code, Cursor, etc.) manages its own conversation context. AQE does NOT control what accumulates in the caller's context window.

However, AQE DOES manage context in three internal execution paths:
1. **Internal LLM calls** — Consensus providers call Anthropic/OpenAI APIs with AQE-managed prompts (coverage analysis, test generation, defect prediction). These accumulate context that AQE controls.
2. **QE Quality Daemon** — Long-running background sessions making repeated LLM calls for analysis, pattern consolidation, and test suggestion. These are multi-turn LLM conversations managed entirely by AQE.
3. **Sub-agent orchestration** — Task orchestration spawns sub-agents that maintain their own conversation context for multi-step QE workflows.

**Tier applicability by execution context:**

| Tier | MCP tool responses | Internal LLM calls | Daemon sessions | Sub-agent orchestration |
|------|-------------------|--------------------|-----------------|-----------------------|
| Tier 1 (Microcompact) | **Yes** — controls response size | **Yes** | **Yes** | **Yes** |
| Tier 2 (Session Summary) | No — no session context | **Yes** | **Yes** | **Yes** |
| Tier 3 (LLM Compact) | No — no conversation to compact | **Yes** | **Yes** | Limited |
| Tier 4 (Reactive) | No — no 413 errors from AQE side | **Yes** | **Yes** | **Yes** |

Tier 1 is universally applicable (it controls individual tool result sizes). Tiers 2-4 apply only to code paths where AQE manages the conversation context.

### Prior Art -- Claude Code 4-Tier System

Research into Claude Code's architecture reveals a sophisticated 4-tier compaction pipeline:

| Tier | Name | API Cost | Mechanism |
|------|------|----------|-----------|
| 1 | Microcompact | Zero | Clear old tool results; keep last 5; sentinel placeholder |
| 2 | Session Memory | Zero | Continuously-updated session summary file |
| 3 | Full LLM Compact | One call | Fork sub-agent for structured 9-section summary |
| 4 | Reactive | Zero | Peel oldest API rounds on 413 error |

The system tracks 5 operational states: Normal (>20K remaining), Warning (<=20K), Error (<=20K), Auto-Compact (<=13K), Blocking (<=3K). Post-compact restoration injects up to 5 previously-read files (50K budget) and active skills (25K budget).

### Why Existing ADRs Don't Cover This

- **ADR-042** (Token Tracking): Tracks consumption, optimizes via pattern reuse. Does not manage conversation context lifecycle.
- **ADR-066** (RVF Pattern Store): Manages pattern storage with HNSW indexing. Not conversation-level compaction.
- **ADR-036** (Result Persistence): Persists task results to disk. Does not compact in-memory conversation state.

These ADRs address pieces of the puzzle but no unified framework orchestrates multi-tier compaction with budget tracking and automatic escalation. This ADR provides that framework.

---

## Options Considered

### Option 1: Four-Tier Compaction Pipeline with Budget Tracking (Selected)

Implement 4 tiers of escalating compaction intelligence, managed by a context budget tracker that auto-triggers the appropriate tier based on token pressure.

**Pros:**
- 80% of compaction handled at zero API cost (Tiers 1-2)
- Graceful degradation through escalating tiers
- QE-specific summary preserves domain-critical findings
- Budget tracking provides transparency and predictability
- Post-compact restoration avoids re-reading frequently-accessed files

**Cons:**
- Tier 3 consumes one API call per trigger
- Multi-tier system adds orchestration complexity
- QE-specific summary structure is opinionated
- Sentinel placeholders may confuse agents expecting real content

### Option 2: Single-Tier Aggressive Truncation (Rejected -- Current Behavior)

Continue with per-result truncation, increase aggressiveness.

**Why rejected:** Cannot manage cross-result accumulation. Sessions remain limited to 30-60 minutes. No intelligent preservation of important findings.

### Option 3: RAG-Only Approach (Rejected)

Store all context externally, retrieve via semantic search when needed.

**Why rejected:** Adds retrieval latency (100-500ms per lookup), requires embedding generation for every tool result, and loses conversational coherence that LLM requires for multi-step QE analysis.

### Option 4: User-Triggered Manual Compaction (Rejected)

Provide `/compact` command, let users decide when to compact.

**Why rejected:** Users cannot accurately estimate context pressure. Forgetting to compact causes session failure. Poor UX for automated/daemon QE operations.

### Option 5: Two-Tier Compaction Only (Considered -- Deferred Scope)

Implement only Tier 1 (microcompact) and Tier 4 (reactive), skipping LLM-powered summarization entirely. Zero API cost.

**Why deferred, not rejected:** This captures ~80% of the benefit at zero additional API cost. If Tiers 2-3 prove too complex or the internal LLM call volume doesn't justify them, the two-tier approach is a valid fallback. **Recommendation**: Implement Tier 1 + Tier 4 first (IMP-01 scope), then add Tiers 2-3 only after measuring whether internal LLM sessions actually hit context limits frequently enough to warrant the complexity.

---

## Architecture

### Tier Overview

```
Context Budget Tracker
│
├── Normal (>25K remaining)
│   └── No action
│
├── Warning (<=25K remaining)
│   └── Tier 1: Microcompact (IMP-01)
│       ├── Clear tool results older than 60 minutes
│       ├── Keep last 5 results regardless of age
│       ├── Replace with sentinel: '[Old tool result content cleared]'
│       └── Token estimation: ceil(chars / 3) [padded: ~3 chars/token]
│
├── Pressure (<=18K remaining, Tier 1 was insufficient)
│   └── Tier 2: QE Session Summary
│       ├── Build summary from ContextCompiler output
│       ├── Preserve min 10K tokens of recent context
│       ├── Maintain tool_use/tool_result pairs
│       └── Zero API calls (uses captured session data)
│
├── Auto-Compact (<=13K remaining)
│   └── Tier 3: LLM Compact
│       ├── Fork sub-agent for structured 9-section QE summary:
│       │   1. Primary QE Objective
│       │   2. Key Technical Findings
│       │   3. Files and Test Artifacts
│       │   4. Errors and Fixes Applied
│       │   5. Quality Gates Status
│       │   6. All User Requests (verbatim)
│       │   7. Pending QE Tasks
│       │   8. Current Analysis State
│       │   9. Suggested Next Action
│       ├── Reserve 20K tokens for summary output
│       └── One API call (Haiku for cost efficiency)
│
└── Blocking (<=3K remaining)
    └── Tier 4: Reactive Compact
        ├── Triggered by 413 error or imminent overflow
        ├── Aggressively peel oldest conversation rounds
        ├── Recompute token estimate after each peel
        └── Retry original request after recovery
```

### Component Layout

```
src/context/compaction/
├── index.ts                      -- CompactionPipeline orchestrator
├── context-budget.ts             -- Token budget tracker with 5 states
├── tier1-microcompact.ts         -- Re-exports IMP-01 MicrocompactEngine
├── tier2-session-summary.ts      -- QE session summary builder
├── tier3-llm-compact.ts          -- LLM-powered 9-section summarization
├── tier4-reactive.ts             -- 413 error recovery
└── post-compact-restoration.ts   -- File and skill restoration after compaction
```

### Integration Points

| Component | Integration | Direction |
|-----------|-------------|-----------|
| `src/mcp/protocol-server.ts` | Wire compaction into tool result pipeline | Inbound |
| `src/mcp/middleware/microcompact.ts` (IMP-01) | Tier 1 engine reuse | Dependency |
| `src/context/compiler.ts` | Source data for Tier 2 summary | Inbound |
| `src/routing/` | Model selection for Tier 3 sub-agent | Outbound |
| `src/mcp/services/session-store.ts` (IMP-04) | Conversation history for all tiers | Dependency |
| `session_cache_stats` MCP tool | Expose compaction state and metrics | Outbound |

### Post-Compact Restoration

After any Tier 2+ compaction, the system restores recently-accessed context to prevent agents from needing to re-read files:

| Restoration Type | Budget | Per-Item Cap | Selection |
|-----------------|--------|-------------|-----------|
| Recently-read files | 50K tokens | 5K per file | Last 5 files by access time |
| Active skills | 25K tokens | 5K per skill | Currently-loaded skills |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-088 | Prompt Cache Latch | Stable system prompt enables better budget estimation |
| Relates To | ADR-042 | Token Tracking | Token metrics feed budget tracker |
| Relates To | ADR-036 | Result Persistence | Persisted results available for restoration |
| Relates To | ADR-066 | RVF Pattern Store | Pattern search results participate in compaction |
| Relates To | ADR-039 | MCP Optimization | Compaction reduces MCP response sizes |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| RESEARCH-001 | Claude Code Internals Analysis | Research | [docs/research/claude-code-internals-analysis.md](../../../docs/research/claude-code-internals-analysis.md) |
| PLAN-001 | CC-Internals Improvements Plan (IMP-08) | Implementation Plan | [docs/plans/cc-internals-improvements-plan.md](../../../docs/plans/cc-internals-improvements-plan.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-04-01 | Proposed | 2026-10-01 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-04-01 | Initial creation from Claude Code internals research |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: Pattern validated in Claude Code production (4-tier compaction with documented thresholds)
- [x] **C - Criteria**: 4 options compared (4-tier, single-tier, RAG, manual)
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [x] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [x] **Dp - Dependencies**: All relationships documented
- [x] **Rf - References**: Research and plan documents linked
- [ ] **M - Master**: N/A (standalone improvement)
