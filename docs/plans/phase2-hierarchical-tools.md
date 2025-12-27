# Phase 2: Hierarchical Tool Organization & Lazy Loading

**Issue:** #115
**Date:** 2025-12-05
**Target:** 80% token reduction (31,500 → 6,300 tokens)

---

## Objective

Transform the flat 96-tool architecture into a hierarchical 3-tier system with lazy loading to dramatically reduce context consumption.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE TOOLS (Always Loaded)               │
│                         15 tools                            │
├─────────────────────────────────────────────────────────────┤
│  Fleet: fleet_init, agent_spawn, fleet_status               │
│  Testing: test_generate, test_execute, test_report          │
│  Memory: memory_store, memory_retrieve, memory_query        │
│  Quality: quality_analyze, quality_gate_execute             │
│  Discovery: tools_discover, tools_load_domain               │
│  Orchestration: task_orchestrate, task_status               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 DOMAIN TOOLS (Load on Keyword)              │
│                         31 tools                            │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│  Security   │ Performance │  Coverage   │  Quality Gates    │
│  9 tools    │  6 tools    │  4 tools    │  6 tools          │
├─────────────┼─────────────┼─────────────┼───────────────────┤
│  Flaky      │   Visual    │ Requirements│                   │
│  3 tools    │  3 tools    │  2 tools    │                   │
└─────────────┴─────────────┴─────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              SPECIALIZED TOOLS (Load on Request)            │
│                         14 tools                            │
├─────────────────────────────────────────────────────────────┤
│  Learning: experience, qvalue, pattern, query (9 tools)     │
│  Advanced: mutation, chaos, contract validation (5 tools)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Create Meta-Tools (Week 1)

Add two new meta-tools for dynamic tool discovery and loading:

```typescript
// tools_discover - List available tool domains
{
  name: 'mcp__agentic_qe__tools_discover',
  description: 'List available QE tool domains and capabilities',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'core', 'domains', 'specialized'],
        default: 'all'
      }
    }
  }
}

// tools_load_domain - Dynamically load a tool domain
{
  name: 'mcp__agentic_qe__tools_load_domain',
  description: 'Load tools for a specific domain',
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        enum: ['security', 'performance', 'coverage', 'quality', 'flaky', 'visual', 'requirements', 'learning'],
        description: 'Domain to load'
      }
    },
    required: ['domain']
  }
}
```

### Step 2: Implement Tool Categories (Week 2)

Create `src/mcp/tool-categories.ts`:

```typescript
export const TOOL_CATEGORIES = {
  core: [
    'fleet_init', 'agent_spawn', 'fleet_status',
    'test_generate_enhanced', 'test_execute_parallel', 'test_report_comprehensive',
    'memory_store', 'memory_retrieve', 'memory_query',
    'quality_analyze', 'quality_gate_execute',
    'task_orchestrate', 'task_status',
    'tools_discover', 'tools_load_domain'
  ],
  domains: {
    security: ['qe_security_scan_comprehensive', 'qe_security_detect_vulnerabilities', ...],
    performance: ['performance_analyze_bottlenecks', 'performance_generate_report', ...],
    coverage: ['coverage_analyze_stream', 'coverage_detect_gaps_ml', ...],
    quality: ['qe_qualitygate_evaluate', 'qe_qualitygate_assess_risk', ...],
    flaky: ['flaky_detect_statistical', 'flaky_analyze_patterns', 'flaky_stabilize_auto'],
    visual: ['visual_compare_screenshots', 'visual_validate_accessibility', ...],
    requirements: ['qe_requirements_validate', 'qe_requirements_generate_bdd']
  },
  specialized: {
    learning: ['learning_store_experience', 'learning_store_qvalue', ...],
    advanced: ['mutation_test_execute', 'api_breaking_changes', ...]
  }
};
```

### Step 3: Keyword-Based Auto-Loading (Week 3)

Implement keyword detection in server.ts:

```typescript
const DOMAIN_KEYWORDS = {
  security: ['security', 'vulnerability', 'scan', 'audit', 'owasp', 'cve'],
  performance: ['performance', 'benchmark', 'bottleneck', 'profiling', 'latency'],
  coverage: ['coverage', 'gap', 'uncovered', 'line coverage', 'branch'],
  quality: ['quality gate', 'deploy', 'release', 'go/no-go'],
  flaky: ['flaky', 'unstable', 'intermittent', 'retry'],
  visual: ['screenshot', 'visual', 'regression', 'accessibility', 'wcag'],
  requirements: ['requirements', 'bdd', 'gherkin', 'acceptance criteria']
};

// Auto-load domain when keywords detected in conversation
function detectAndLoadDomains(message: string): string[] {
  const domainsToLoad: string[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => message.toLowerCase().includes(kw))) {
      domainsToLoad.push(domain);
    }
  }
  return domainsToLoad;
}
```

### Step 4: Server Instructions Enhancement (Week 4)

Create comprehensive server instructions in `src/mcp/server-instructions.ts`:

```typescript
export const SERVER_INSTRUCTIONS = `
# Agentic QE Fleet - Tool Guide

## Quick Start
- Use \`tools_discover\` to see available capabilities
- Use \`tools_load_domain\` to load specialized tools

## Core Tools (Always Available)
- **Fleet Management:** fleet_init, agent_spawn, fleet_status
- **Testing:** test_generate_enhanced, test_execute_parallel, test_report_comprehensive
- **Memory:** memory_store, memory_retrieve, memory_query
- **Quality:** quality_analyze, quality_gate_execute
- **Orchestration:** task_orchestrate, task_status

## Domain Tools (Load as Needed)
| Domain | Trigger Keywords | Tools |
|--------|-----------------|-------|
| Security | security, vulnerability, audit | 9 tools |
| Performance | benchmark, bottleneck, profiling | 6 tools |
| Coverage | coverage, gap, uncovered | 4 tools |
| Quality Gates | deploy, release, go/no-go | 6 tools |
| Flaky Tests | flaky, unstable, retry | 3 tools |
| Visual Testing | screenshot, accessibility | 3 tools |
| Requirements | BDD, gherkin, acceptance | 2 tools |

## Specialized Tools (Expert Use)
Load with \`tools_load_domain('learning')\` or \`tools_load_domain('advanced')\`
`;
```

---

## Token Impact Analysis

| Phase | Tools Loaded | Estimated Tokens | Context % |
|-------|--------------|------------------|-----------|
| Current | 96 | 31,500 | 15.75% |
| Phase 1 (Done) | 96 | ~20,000 | 10% |
| Phase 2 (Core) | 15 | 6,300 | 3.2% |
| Phase 2 + 1 Domain | 15 + ~6 | 8,500 | 4.25% |
| Phase 2 + All Domains | 15 + 31 | 16,800 | 8.4% |

---

## Migration Strategy

### Backward Compatibility

1. **Keep all tools available** - just not loaded by default
2. **Auto-load on keyword detection** - seamless for users
3. **Explicit load option** - for advanced users
4. **No breaking changes** - existing integrations work

### Deprecation Path

```
v2.2.0 - Phase 2 implementation (hierarchical, lazy loading)
v2.3.0 - Soft deprecation warnings for rarely used parameters
v3.0.0 - Remove deprecated parameters (breaking change)
```

---

## Success Metrics

- [ ] Core tools < 15 count
- [ ] Baseline tokens < 6,500
- [ ] Context consumption < 3.5%
- [ ] Auto-load accuracy > 95%
- [ ] Zero breaking changes
- [ ] All tests passing

---

## Files to Create/Modify

### New Files
- `src/mcp/tool-categories.ts` - Tool categorization
- `src/mcp/server-instructions.ts` - Server instructions
- `src/mcp/lazy-loader.ts` - Dynamic loading logic

### Modified Files
- `src/mcp/tools.ts` - Add meta-tools
- `src/mcp/server.ts` - Implement lazy loading
- `src/mcp/handlers/*.ts` - Add domain loading handlers

---

## Timeline

| Week | Deliverable |
|------|-------------|
| 1 | Meta-tools implementation |
| 2 | Tool categorization |
| 3 | Keyword auto-loading |
| 4 | Server instructions + testing |
| 5 | Documentation + release |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Users can't find tools | Clear server instructions, tools_discover |
| Auto-load misses domain | Conservative keyword matching, easy manual load |
| Performance overhead | Pre-compile tool categories, cache loaded tools |
| Breaking integrations | Keep all tools available, just lazy-loaded |

---

**Next Step:** Implement `tools_discover` and `tools_load_domain` meta-tools
