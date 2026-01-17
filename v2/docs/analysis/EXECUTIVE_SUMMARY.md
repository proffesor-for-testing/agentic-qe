# Executive Summary: AQE MCP Tools Optimization

**Date:** 2025-12-05
**Status:** Research Complete - Ready for Implementation
**Priority:** HIGH - Immediate token cost reduction opportunity

---

## The Problem

The Agentic QE MCP server currently loads **102 tools** (~31,500 tokens) into every Claude Code conversation context before any work begins. This represents **15.75% of a 200K context window** consumed by tool metadata alone.

### Impact
- **Cost:** Wasted tokens on every single interaction
- **Performance:** LLM struggles to choose from 100+ flat tool list
- **Scalability:** Limited headroom for new features
- **User Experience:** Slow response times due to context bloat

---

## The Opportunity

Based on industry research and MCP best practices, we can achieve **85-95% token reduction** through:

1. **Tool Consolidation:** 102 → 60 tools (eliminate duplicates/overlap)
2. **Lazy Loading:** Load 15 core tools by default, domains on-demand
3. **Hierarchical Organization:** Category-based discovery and loading
4. **Schema Optimization:** Extract common schemas, shorten descriptions

### Expected Results

| Metric | Current | Phase 1 (Quick) | Phase 2 (Medium) | Phase 3 (Advanced) |
|--------|---------|-----------------|------------------|---------------------|
| **Tools Loaded** | 102 | 60 | 15 + dynamic | 15 + dynamic |
| **Baseline Tokens** | 31,500 | 15,750 | 6,300 | 3,150 |
| **Context %** | 15.75% | 7.9% | 3.2% | 1.6% |
| **Reduction** | 0% | 50% | 80% | 90% |
| **Timeline** | - | 1-2 weeks | 3-5 weeks | 6-9 weeks |

---

## Key Findings

### 1. Current Tool Inventory

```
Total Tools: 102 (100 unique, 2 duplicates)
File Size: 125,959 characters
Token Cost: ~31,500 tokens
File: /workspaces/agentic-qe-cf/src/mcp/tools.ts
```

### 2. Tool Categories

- **Core Fleet Management:** 3 tools (always needed)
- **Test Lifecycle:** 14 tools (high usage)
- **Quality & Gates:** 10 tools (medium usage)
- **Security:** 11 tools (domain-specific)
- **Performance:** 8 tools (domain-specific)
- **Learning & Patterns:** 14 tools (rarely used)
- **Specialized:** 42 tools (on-demand only)

### 3. Major Issues Identified

#### **Duplicates (5 instances across 2 tools):**
- `performance_monitor_realtime` - appears 2x
- `security_scan_comprehensive` - appears 3x

#### **Overlapping Functionality:**
- Coverage tools: 5 tools doing similar things → consolidate to 2
- Test generation: 4 tools with overlap → consolidate to 2
- Quality gates: 10 tools → consolidate to 3
- Flaky detection: 4 tools → consolidate to 2
- Requirements: 4 tools → consolidate to 2

#### **Verbose Descriptions:**
- Many tools have 500+ character descriptions
- Should be <150 characters max
- Details belong in server instructions, not per-tool

---

## Industry Best Practices (Research-Backed)

### 1. Lazy Loading (85% reduction possible)

**Source:** [Claude Code Issue #11364](https://github.com/anthropics/claude-code/issues/11364)

Real-world example: 67K tokens → 10K tokens baseline by loading tools on-demand instead of upfront.

### 2. Hierarchical Tool Management

**Source:** [MCP Discussion #532](https://github.com/orgs/modelcontextprotocol/discussions/532)

Organize tools into categories (core/domains/specialized), load dynamically based on conversation context.

### 3. Tool Consolidation

**Source:** [GitHub MCP Server Changelog](https://github.blog/changelog/2025-10-29-github-mcp-server-now-comes-with-server-instructions-better-tools-and-more/)

GitHub consolidated related tools by adding mode parameters instead of creating separate tools. Simpler, faster, clearer.

### 4. Schema Deduplication

**Source:** [SEP-1576](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576)

Use JSON `$ref` to reuse common schema definitions across tools. 15-25% reduction for AQE.

### 5. Server Instructions > Tool Descriptions

**Source:** [MCP Best Practices 2025](https://www.marktechpost.com/2025/07/23/7-mcp-server-best-practices-for-scalable-ai-integrations-in-2025/)

Server instructions shown once per session. Tool descriptions shown for every tool. Move details to server level.

---

## Recommended Action Plan

### Phase 1: Quick Wins (1-2 weeks) → 50% Reduction

**What:**
- Remove 5 duplicate tools
- Consolidate 27 overlapping tools → 11 tools
- Shorten all descriptions to <150 chars
- Extract common schemas with `$ref`

**Result:** 102 → 60 tools, ~15,750 tokens (50% reduction)

**Files to Modify:**
- `/workspaces/agentic-qe-cf/src/mcp/tools.ts`
- `/workspaces/agentic-qe-cf/src/mcp/server.ts`

### Phase 2: Hierarchical Organization (3-5 weeks) → 80% Reduction

**What:**
- Implement 3-tier hierarchy: core/domains/specialized
- Add meta-tools: `aqe_discover_tools()`, `aqe_execute_tool()`
- Load 15 core tools by default
- Auto-load domains based on keywords (e.g., "security" → load security tools)
- Add comprehensive server instructions

**Result:** 15 core + dynamic loading, ~6,300 tokens (80% reduction)

**New Architecture:**
```
/core (15 tools - always loaded)
  /fleet: fleet_init, agent_spawn, fleet_status
  /testing: test_generate_enhanced, test_execute_parallel, test_report_comprehensive
  /memory: memory_store, memory_retrieve, memory_query
  /quality: quality_analyze, quality_gate_execute
  /orchestration: task_orchestrate, task_status

/domains (31 tools - load on keyword/context)
  /security (9 tools)
  /performance (6 tools)
  /coverage (4 tools)
  /quality (6 tools)
  /flaky (3 tools)
  /visual (3 tools)

/specialized (14 tools - load on explicit request)
  /learning (9 tools)
  /improvement (4 tools)
  /advanced (1 tool)
```

### Phase 3: Advanced Lazy Loading (6-9 weeks) → 90% Reduction

**What:**
- Implement full MCP proxy with lazy loading
- Intelligent pre-loading based on conversation analysis
- Response data optimization (summaries vs full data)
- Alternative serialization exploration (TOON format)

**Result:** 15 core + optimized dynamic, ~3,150 tokens (90% reduction)

---

## Immediate Next Steps

### For Decision Makers:
1. **Review this summary + full analysis:** `/workspaces/agentic-qe-cf/docs/analysis/mcp-tools-analysis-and-optimization.md`
2. **Approve Phase 1 implementation** (quick wins, low risk, high impact)
3. **Assign development resources** (1 engineer for 1-2 weeks)

### For Developers:
1. **Start with duplicates:** Remove 5 duplicate tools immediately
2. **Tool consolidation:** Begin merging overlapping tools
3. **Schema extraction:** Create shared type definitions
4. **Description audit:** Shorten all tool descriptions

### For Testing:
1. **Backward compatibility tests:** Ensure consolidation doesn't break existing integrations
2. **Token measurement:** Track actual token reduction achieved
3. **Performance testing:** Measure impact on response times

---

## Success Metrics

### Baseline (Current)
- Tools: 102
- Tokens: 31,500
- Context: 15.75% of 200K

### Target (Phase 1 - 2 weeks)
- Tools: 60
- Tokens: 15,750
- Context: 7.9%
- **Reduction: 50%**

### Target (Phase 2 - 5 weeks)
- Tools: 15 + dynamic
- Tokens: 6,300
- Context: 3.2%
- **Reduction: 80%**

### Target (Phase 3 - 9 weeks)
- Tools: 15 + optimized
- Tokens: 3,150
- Context: 1.6%
- **Reduction: 90%**

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking changes for users | Maintain backward compatibility, deprecation period |
| Users can't find tools | Clear server instructions, discovery meta-tools |
| Lazy loading latency | Pre-load based on keywords, cache frequently used |
| Implementation complexity | Phased approach, thorough testing |

---

## References

**Full Analysis:** `/workspaces/agentic-qe-cf/docs/analysis/mcp-tools-analysis-and-optimization.md`

**Key Research Sources:**
- [Lazy Loading for MCP](https://github.com/anthropics/claude-code/issues/11364)
- [Hierarchical Tool Management](https://github.com/orgs/modelcontextprotocol/discussions/532)
- [Schema Deduplication (SEP-1576)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576)
- [GitHub MCP Best Practices](https://github.blog/changelog/2025-10-29-github-mcp-server-now-comes-with-server-instructions-better-tools-and-more/)
- [MCP Server Best Practices 2025](https://www.marktechpost.com/2025/07/23/7-mcp-server-best-practices-for-scalable-ai-integrations-in-2025/)

---

## Questions?

Contact the Research Agent or review the full analysis document for detailed findings, implementation guidance, and complete tool inventory.

**Bottom Line:** We have a clear path to reduce MCP context consumption by 50-90% through proven techniques, improving performance, reducing costs, and enabling future scalability.
