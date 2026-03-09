# OpenClaw Deep Research Report v2 — AQE Integration & Improvement Strategy

**Date:** 2026-03-09
**Method:** 5 parallel research agents covering plugin architecture, memory systems, multi-agent orchestration, RL/learning, and security/distribution
**Sources:** 100+ across GitHub repos, official docs, security analyses, blog posts, academic papers

---

## Executive Summary

OpenClaw (247k stars, 13,700+ skills) is the dominant open-source AI agent platform. This report identifies **18 actionable improvements for AQE** and a **concrete 3-phase integration plan** to publish AQE as an OpenClaw plugin, reaching 247k+ users.

**Key strategic insight:** OpenClaw optimizes for *runtime infrastructure* (messaging, shell, browser); AQE optimizes for *quality intelligence* (test generation, coverage, defect prediction, pattern learning). They are complementary, not competitive. AQE fills specific gaps OpenClaw cannot: quality gates, security scanning, RL-based test improvement, and compliance audit trails.

---

## Part 1: Ideas to Improve AQE

### Tier 1 — High Impact, Low Effort

| # | Improvement | Source | AQE Impact |
|---|------------|--------|------------|
| 1 | **Hybrid search (70/30 vector/FTS5)** | OpenClaw memsearch | Add BM25 FTS5 alongside HNSW cosine similarity. Dramatically improves exact-match queries (error codes, function names) where semantic similarity fails. Add `fts5` virtual table to `src/learning/sqlite-persistence.ts` |
| 2 | **Binary reward assignment for test outcomes** | OpenClaw-RL GRPO | Add reward function to `experience-capture.ts`: +1 catches bug, -1 flaky/false positive, 0 neutral. Transforms pattern lifecycle from heuristic-based to outcome-based |
| 3 | **At-least-one learning guarantee** | OpenClaw-RL session guarantee | Warn when a session produces zero patterns/outcomes. Every `test_generate_enhanced` call should produce at least one experience record |
| 4 | **Temporal decay on search results** | OpenClaw memsearch | Add 30-day half-life exponential multiplier to pattern search scores. Currently AQE treats all patterns equally regardless of age. Formula: `score *= exp(-0.693 * age_days / 30)` |
| 5 | **Temporal window on promotion** | OpenClaw self-improving-agent | Add 30-day recency requirement to `shouldPromotePattern()`. Patterns must have recent activity, not just historical 3+ uses |
| 6 | **Auto-promotion alignment** | OpenClaw self-improving-agent | Align existing `PatternLifecycleConfig` (currently `promotionMinOccurrences: 2`) with "3+ occurrences across 2+ distinct projects within 30 days" rule |

### Tier 2 — High Impact, Medium Effort

| # | Improvement | Source | AQE Impact |
|---|------------|--------|------------|
| 7 | **OPD-style remediation hints** | OpenClaw-RL On-Policy Distillation | When tests fail quality checks, generate textual explanation of *why* and *how to fix*, store as pattern. Use `edge-case-injector.ts` to inject hints into future prompts. Transforms feedback from "bad test, -0.3" to "bad test because assertion checks `.length` instead of specific values" |
| 8 | **Pre-compaction flush hook** | OpenClaw memory system | Before context compaction, auto-extract pending patterns via hidden turn. Add to `qe-hooks.ts`. Prevents knowledge loss during long sessions |
| 9 | **Deterministic QE pipeline definitions (YAML)** | Lobster workflow engine | Define pipelines as: `generate → static_analysis_gate → execute → coverage_gate → quality_gate → commit`. Each gate halts for approval or auto-passes. Saves tokens by removing LLM orchestration overhead |
| 10 | **Token-free heartbeat scheduling** | DevClaw work_heartbeat | Background scheduler dispatches QE tasks without LLM involvement. Health checks detect stuck agents and revert tasks to queue. Zero reasoning tokens spent on scheduling |
| 11 | **Group-relative advantage estimation** | OpenClaw-RL GRPO | When multiple test variants generated for same code, compute GRPO-style group advantages rather than absolute scores. Requires generating multiple candidates and comparing them |
| 12 | **Per-agent tool scoping** | OpenClaw agent isolation | Enforce tool allowlists per agent type. Security scanner cannot invoke `test_execute_parallel`; test generator cannot invoke `security_scan`. Deny list wins over allow list |

### Tier 3 — Medium Impact or Higher Effort

| # | Improvement | Source | AQE Impact |
|---|------------|--------|------------|
| 13 | **Proof-of-Quality command** | OpenClaw PoQ skill | `aqe quality prove --threshold 90` — runs benchmarks, produces hash-verified quality proof. Bitcoin-style nonce grinding for tamper-evident reports. Useful for CI gates and compliance |
| 14 | **Daily log tier (Markdown)** | OpenClaw memory system | Human-readable `memory/YYYY-MM-DD.md` alongside SQLite store. Provides transparency, debuggability, and bridge to OpenClaw's memory system |
| 15 | **Session reuse for repeated operations** | DevClaw persistent sessions | Agents running tests on same codebase accumulate context across runs instead of re-loading 50K tokens. 40-60% token savings |
| 16 | **Task ledger with dependency tracking** | OpenClaw Agent Teams RFC | Shared task list with `pending/blocked/claimed/completed` states. Completing a task auto-unblocks dependents |
| 17 | **Adversarial test-code co-training** | UTRL framework | Use mutation testing as adversarial code generator. Tests catching more mutants get positive rewards; surviving mutants signal gaps. UTRL proves small RL-trained models outperform GPT-4.1 on test quality |
| 18 | **ClawWork-style economic model** | ClawWork (HKUDS) | Assign "cost" to each model tier (ADR-026) and "revenue" based on quality outcomes. Agents producing high-quality results at lower cost get more traffic |

### Implementation Priority Matrix

```
Impact ↑
       │  [2] Binary RL    [7] OPD hints     [17] UTRL adversarial
       │  [1] Hybrid FTS   [9] YAML pipeline  [11] GRPO advantages
  HIGH │  [3] Learn guarantee
       │  [6] Auto-promote  [8] Pre-compact   [13] PoQ command
       │  [4] Temporal decay [10] Heartbeat   [15] Session reuse
  MED  │  [5] Temporal window [12] Tool scope  [16] Task ledger
       │                    [14] Daily logs    [18] Economic model
  LOW  │
       └──────────────────────────────────────────────────────→ Effort
              LOW              MEDIUM              HIGH
```

---

## Part 2: OpenClaw Integration Architecture

### 2.1 Plugin Architecture

Based on deep analysis of OpenClaw's plugin SDK, the AQE plugin uses three integration surfaces:

```
OpenClaw Gateway (port 18789)
  └─ Agent Runtime
       └─ openclaw-agentic-qe plugin
            ├─ MCP Bridge (stdio) ──── AQE MCP Server
            │   └─ @modelcontextprotocol/sdk@1.25.3
            ├─ Tool Plugin (6 tools via registerTool factory)
            ├─ Memory Plugin (ReasoningBank ↔ OpenClaw memory bridge)
            ├─ Lifecycle Hooks (4 hooks via registerHook)
            └─ Background Service (via registerService for MCP lifecycle)
```

### 2.2 Plugin Contract

```typescript
// src/index.ts
import type { OpenClawPluginDefinition, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { AqeBridge } from "./mcp-bridge";

const plugin: OpenClawPluginDefinition = {
  id: "agentic-qe",
  kind: "tool",
  version: "1.0.0",
  configSchema: { /* see manifest below */ },

  register(api: OpenClawPluginApi) {
    const bridge = new AqeBridge();

    // 1. Background service for MCP lifecycle
    api.registerService({
      id: "aqe-mcp",
      async start() { await bridge.connect(api.config); },
      async stop() { await bridge.disconnect(); },
    });

    // 2. Tools via factory form (gets runtime context)
    api.registerTool(
      (ctx) => buildAqeTools(bridge, ctx),
      { names: ["qe_quality_gate", "qe_generate_tests", "qe_coverage_gaps",
                "qe_security_scan", "qe_defect_predict", "qe_swarm"] }
    );

    // 3. Lifecycle hooks
    api.registerHook(["before_agent_start"], async (ev) => {
      if (api.config.autoRecall) await recallPatterns(bridge, ev);
    });
    api.registerHook(["before_tool_call"], async (ev) => {
      if (isDeployTool(ev.toolName)) await enforceQualityGate(bridge, ev, api.config.deployGateThreshold);
    });
    api.registerHook(["after_tool_call"], async (ev) => {
      if (api.config.autoCapture) await captureModifications(bridge, ev);
    });
    api.registerHook(["session_end"], async (ev) => {
      if (api.config.sessionSummary) await generateQualitySummary(bridge, ev);
    });
  },
};

export default plugin;
```

**Critical constraints discovered:**
- `register()` must be **synchronous** — async MCP handshake goes in `registerService.start()`
- Plugin runs **in-process** (no VM isolation) — all MCP bridge calls must be wrapped in try/catch
- Tool names must not collide with core tools (`exec`, `read`, `write`, `browser`, `memory_search`)
- Registration is **synchronous** but tools can have async `execute()` functions

### 2.3 Plugin Manifest (`openclaw.plugin.json`)

```json
{
  "id": "agentic-qe",
  "kind": "tool",
  "name": "Agentic QE",
  "description": "AI-powered Quality Engineering: test generation, coverage analysis, security scanning, quality gates, and pattern-based learning via MCP.",
  "version": "1.0.0",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "projectRoot": { "type": "string", "description": "Root directory of the project to analyze" },
      "mcpCommand": { "type": "string", "default": "npx" },
      "mcpArgs": { "type": "array", "items": { "type": "string" }, "default": ["agentic-qe-mcp"] },
      "autoRecall": { "type": "boolean", "default": true, "description": "Auto-recall QE patterns before agent turns" },
      "autoCapture": { "type": "boolean", "default": true, "description": "Auto-capture quality findings from conversations" },
      "deployGateThreshold": { "type": "number", "default": 0.8, "description": "Quality score threshold for deploy gates (0-1)" },
      "sessionSummary": { "type": "boolean", "default": true, "description": "Generate quality summary at session end" }
    },
    "required": ["projectRoot"]
  },
  "uiHints": {
    "projectRoot": { "label": "Project Root", "placeholder": "/path/to/project" },
    "deployGateThreshold": { "label": "Deploy Gate Threshold", "min": 0, "max": 1, "step": 0.05 }
  }
}
```

### 2.4 Tools Exposed to OpenClaw Agents

| Tool | Description | Use Frequency | OpenClaw Tool Policy |
|------|-------------|--------------|---------------------|
| `qe_quality_gate` | Quality assessment with pass/fail threshold | Daily | Required (auto-enabled) |
| `qe_generate_tests` | AI test generation (vitest/jest/pytest/cargo) | Daily | Required |
| `qe_coverage_gaps` | O(log n) sublinear coverage analysis | Daily | Required |
| `qe_security_scan` | Comprehensive security scan (deps, patterns, secrets) | Daily | Required |
| `qe_defect_predict` | ML-powered defect probability scoring | Weekly | Optional (must opt-in) |
| `qe_swarm` | Multi-agent parallel QE orchestration | On-demand | Optional |

### 2.5 Memory Bridge Architecture

```
OpenClaw Memory                    AQE ReasoningBank
┌─────────────────┐               ┌──────────────────┐
│ memory_search    │◄── bridge ──►│ searchPatterns()  │
│ memory_store     │◄── bridge ──►│ storePattern()    │
│ memory_get       │◄── bridge ──►│ getPattern()      │
│ MEMORY.md        │◄── export ──►│ SQLite + HNSW     │
│ YYYY-MM-DD.md    │◄── sync ───►│ experience-capture │
└─────────────────┘               └──────────────────┘
```

**Bidirectional sync:**
- OpenClaw → AQE: Quality findings from conversations captured via `llm_output` hook
- AQE → OpenClaw: High-confidence patterns injected into agent context via `before_agent_start` hook
- Namespace isolation: All AQE patterns use `aqe/` prefix to prevent cross-contamination

### 2.6 Lifecycle Hooks

| Hook | Behavior | Fallback on Error |
|------|----------|------------------|
| `before_agent_start` | Auto-recall relevant QE patterns from ReasoningBank, inject into context | Skip silently, log warning |
| `before_tool_call` | If tool is deploy/commit, check quality gate score against threshold | Allow action, log warning |
| `after_tool_call` | Track code modifications for coverage analysis, capture tool outcomes | Skip silently |
| `session_end` | Generate quality summary with metrics, store session patterns | Log summary to stderr |

---

## Part 3: Multi-Runtime Distribution Strategy

### 3.1 Target Runtimes

| Runtime | Integration | Users | Priority | Transport |
|---------|------------|-------|----------|-----------|
| **OpenClaw** | MCP server + ClawHub skill + Plugin hooks | 247k+ | Primary | stdio (recommended) |
| **IronClaw** | MCP server + WASM tool modules | 8.3k | Secondary | stdio + WASM |
| **ZeroClaw** | MCP server + `Tool` trait impl | Growing | Tertiary | stdio |

**Universal surface:** MCP protocol (JSON-RPC 2.0 over stdio) works across all three runtimes with zero code changes. AQE's existing `src/mcp/` server requires no modifications for basic compatibility.

### 3.2 ClawHub Publishing Plan

**Skill format requirements:**
- `SKILL.md` with ClawHub-compatible YAML frontmatter
- `clawhub.json` manifest (tagline ≤80 chars, category: "Development", tags: testing/quality/security/coverage)
- 3-5 screenshots at 1920x1080 PNG
- Permission justification for each tool (exec access needed for test execution)
- Demo video URL (30-90 seconds recommended)

**Security differentiation** (critical given ClawHavoc — 36.82% of skills have security flaws):
- Full VirusTotal verification
- Transparent source code (link to GitHub)
- Comprehensive permission justifications
- Security scan results included in documentation
- No hardcoded secrets (10.9% of ClawHub skills have this)

**Category:** Development
**Tags:** `testing`, `quality`, `security`, `coverage`, `test-generation`, `mcp`
**Pricing:** Free (drives adoption; premium features via enterprise tier later)

### 3.3 IronClaw-Specific Benefits

IronClaw (Rust, Near AI) provides security innovations AQE should leverage:
- **WASM sandboxing:** AQE tools could compile to WASM modules with capability-based permissions
- **Credential injection at host boundary:** Secrets never passed into sandbox — compatible with AQE's MCP bridge
- **AES-256-GCM encryption at rest:** Aligns with AQE's security posture
- **Zero telemetry:** No data harvesting

### 3.4 ZeroClaw-Specific Benefits

ZeroClaw (Rust, 3.4MB binary) enables edge deployment:
- **Trait-driven architecture:** Implement `Tool` trait to expose AQE capabilities
- **Identical hybrid search:** 70% vector + 30% FTS5 BM25 — same ratio as OpenClaw
- **Minimal footprint:** <5MB RAM enables QE on IoT/embedded CI pipelines
- **TOML skill manifests:** Different format than ClawHub YAML (requires adapter)

---

## Part 4: RL-Based Test Quality Learning

### 4.1 Binary Reward Model

Based on OpenClaw-RL's GRPO and the UTRL/RLSQM research:

| Test Outcome | Reward | Rationale |
|-------------|--------|-----------|
| Catches real bug (mutation killed) | +1.0 | Primary quality signal |
| Flaky / intermittent failure | -1.0 | Erodes trust, wastes CI |
| False positive (fails on correct code) | -1.0 | Worse than no test |
| Covers new code path | +0.3 | Useful but secondary |
| Redundant (no new coverage) | 0.0 | Neutral |
| Code smells (magic numbers, no assertions) | -0.5 | RLSQM showed 21% improvement |
| Correct failure message on bug | +0.2 | Diagnostic quality bonus |

### 4.2 Minimum Viable RL Loop for AQE

```
Phase 1: Experience Collection (→ OpenClaw-RL's rollout)
  test_generate_enhanced → test_execute_parallel → Record (prompt, test, result, coverage_delta)

Phase 2: Binary Reward Assignment (→ PRM judging)
  Execute against mutant code: catch_bug ? +1 : 0
  Execute against correct code: pass ? 0 : -1
  Flakiness check (3x): inconsistent ? -1 : 0
  Coverage delta: new_paths > 0 ? +0.3 : 0
  Composite = weighted sum, clipped to [-1, +1]

Phase 3: Pattern Update (→ GRPO training)
  Group rewards by code-under-test
  Compute group-relative advantages
  Update pattern confidence in ReasoningBank
  Promote patterns with reward > 0.7 over 3+ occurrences
  Deprecate patterns with 3 consecutive failures

Phase 4: Feedback Integration (continuous)
  High-reward patterns → injected into future generation prompts
  Low-reward patterns → trigger OPD-style remediation hints
```

### 4.3 Key AQE Files for RL Integration

| File | Current Role | RL Enhancement |
|------|-------------|----------------|
| `src/learning/pattern-lifecycle.ts` | Pattern promotion/deprecation | Add binary reward mapping, GRPO advantages |
| `src/learning/experience-capture.ts` | Task execution recording | Add reward assignment from test outcomes |
| `src/routing/routing-feedback.ts` | Outcome collection | Add group-relative scoring |
| `src/integrations/rl-suite/algorithms/decision-transformer.ts` | RL infrastructure | Wire to test quality rewards |
| `src/domains/test-generation/coordinator.ts` | Test generation orchestration | Generate multiple candidates for GRPO |
| `src/domains/test-generation/pattern-injection/edge-case-injector.ts` | Pattern injection | OPD hint injection point |

---

## Part 5: Security Considerations

### 5.1 OpenClaw Attack Surface (8 CVEs, Jan-Feb 2026)

| CVE | CVSS | Risk to AQE Integration |
|-----|------|------------------------|
| CVE-2026-25253 | 8.8 | RCE via WebSocket — AQE plugin runs in-process, must validate all inputs |
| CVE-2026-24763 | 8.8 | Docker sandbox escape — AQE tools must work inside sandbox |
| CVE-2026-27001 | 8.6 | Prompt injection via workspace path — AQE must sanitize file paths |
| CVE-2026-28484 | — | Git hook injection — AQE must not blindly execute user-provided commands |

### 5.2 AQE Plugin Security Requirements

1. **All MCP bridge calls wrapped in try/catch** — plugin crash must not crash Gateway
2. **File path sanitization** — prevent directory traversal in `projectRoot` config
3. **No ambient authority** — request minimum necessary permissions
4. **Sandbox compatibility** — all tools must function inside Docker containers
5. **Memory namespace isolation** — use `aqe/` prefix for all stored patterns
6. **No hardcoded secrets** — credential injection via config, never in source
7. **Input validation** at MCP boundary — never trust tool arguments from LLM

### 5.3 ClawHub Supply Chain Risk

- 36.82% of skills have security flaws (Snyk ToxicSkills study)
- 13.4% have critical-level issues
- 10.9% have hardcoded secrets
- 824+ confirmed malicious skills (ClawHavoc campaign)

**AQE differentiator:** AQE's `security_scan` tool can scan other ClawHub skills before loading, adding a security layer OpenClaw currently lacks.

---

## Part 6: Architectural Comparison (Updated)

| Dimension | OpenClaw | AQE | Complementary Value |
|-----------|----------|-----|-------------------|
| Language | TypeScript (~273k lines) | TypeScript | Same ecosystem |
| Memory | Markdown + sqlite-vec (70/30 hybrid) | SQLite + HNSW (vector only) | AQE should add FTS5 |
| Learning | Passive (file promotion, agent-driven) | Active (SONA, rewards, MAST, consolidation) | AQE is superior |
| Search | 768-dim embeddings, BM25, temporal decay | 384-dim MiniLM, HNSW, domain filtering | Merge approaches |
| Coordination | ACP, Lobster workflows, file handoffs | Swarm orchestration, dual-write | Lobster YAML for AQE |
| Security | 8 CVEs, opt-in hardening, in-process plugins | Trust tiers, namespace isolation | AQE adds quality gates |
| Distribution | 247k users, ClawHub (13,700+ skills) | npm package, MCP server | ClawHub = 100x reach |
| Quality | No native quality gates | Full QE suite (14 tools) | AQE fills the gap |
| Enterprise | 1.2/5 readiness, no RBAC, no audit | Audit trails via ReasoningBank | AQE adds compliance |

---

## Part 7: Build Plan

| Phase | Scope | Deliverables | Timeline |
|-------|-------|-------------|----------|
| **1** | MCP bridge + 4 core tools + manifest | `mcp-bridge.ts`, tool registrations, `openclaw.plugin.json`, basic error boundaries | 2 weeks |
| **2** | Memory plugin + lifecycle hooks | ReasoningBank bridge, `before_agent_start` recall, `before_tool_call` gate, `session_end` summary | 1 week |
| **3** | Swarm tool + ClawHub publish | `qe_swarm` orchestration, ClawHub manifest, screenshots, permission justifications, VirusTotal verification | 1 week |
| **4** | RL loop + hybrid search | Binary reward assignment, FTS5 addition, temporal decay, OPD hints | 2 weeks |
| **5** | Lobster QE pipelines | YAML workflow definitions, approval gates, deterministic orchestration | 1 week |

### Quick Start (for OpenClaw users)

```bash
# Option 1: MCP server (works immediately)
openclaw config set agents.list[0].mcp.servers '[{"name":"aqe","command":"npx","args":["agentic-qe-mcp","--project","."]}]'

# Option 2: Plugin (richer integration with hooks)
cd ~/.openclaw/extensions && npm install openclaw-agentic-qe
# Configure in openclaw.json:
# { "plugins": { "agentic-qe": { "projectRoot": "/path/to/project" } } }

# Option 3: ClawHub skill (simplest)
clawhub install agentic-qe
```

---

## Sources Summary

**100+ sources across 5 research agents:**
- Official docs: docs.openclaw.ai (memory, plugins, skills, security, multi-agent, lobster, compaction)
- GitHub repos: openclaw/openclaw, Gen-Verse/OpenClaw-RL, nearai/ironclaw, zeroclaw-labs/zeroclaw, laurentenhoor/devclaw, HKUDS/ClawWork, openclaw/lobster, zilliztech/memsearch
- Security analyses: CrowdStrike, NSFOCUS, Nebius, Snyk ToxicSkills, Microsoft Security Blog
- Architecture deep dives: DeepWiki, Snowan GitBook, PingCAP, Substack (Wolfe, Pichka, VelvetShark)
- Academic: UTRL (arXiv 2508.21107), RLSQM (arXiv 2310.02368), GRPO/DeepSeekMath (arXiv 2402.03300), RLVR (arXiv 2506.14245)
- Community: DEV.to (ggondim pipeline, wonderlab plugin SDK), LumaDock, Zen Van Riel, ClawHub, Playbooks
- Enterprise: CloudBees, MintMCP, CSO Online, Belgian CCB advisory

Full source lists available in individual agent transcripts.
