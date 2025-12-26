/**
 * Server Instructions for Agentic QE MCP Server
 * Phase 2 Implementation - Issue #115
 *
 * These instructions are shown to Claude once per session to guide tool usage.
 */

export const SERVER_INSTRUCTIONS = `
# Agentic QE Fleet - MCP Tool Guide

## Overview
Agentic QE provides 105 specialized quality engineering tools organized into a hierarchical system for efficient context usage.

## Quick Start
1. **Discover available tools:** Use \`tools_discover\` to see all domains
2. **Load domain tools:** Use \`tools_load_domain\` to load specialized tools
3. **Auto-loading:** Domain tools auto-load when relevant keywords are detected

---

## Core Tools (Always Available - 14 tools)

### Fleet Management
- \`fleet_init\` - Initialize QE fleet with topology
- \`agent_spawn\` - Spawn specialized QE agent
- \`fleet_status\` - Get fleet and agent status

### Testing
- \`test_generate_enhanced\` - AI test generation with pattern recognition
- \`test_execute_parallel\` - Parallel test execution with retry
- \`test_report_comprehensive\` - Multi-format test reports

### Memory & Coordination
- \`memory_store\` - Store data with TTL & namespacing
- \`memory_retrieve\` - Retrieve stored data
- \`memory_query\` - Pattern-based memory search

### Quality & Orchestration
- \`quality_analyze\` - Analyze quality metrics
- \`task_orchestrate\` - Orchestrate tasks across agents
- \`task_status\` - Check task progress

### Discovery
- \`tools_discover\` - List available tool domains
- \`tools_load_domain\` - Load tools for a domain

---

## Domain Tools (Load as Needed)

| Domain | Keywords | Tools | Use Case |
|--------|----------|-------|----------|
| **Security** | security, vulnerability, audit, owasp | 4 tools | Security scanning, vulnerability detection |
| **Performance** | benchmark, bottleneck, profiling | 4 tools | Performance testing, bottleneck analysis |
| **Coverage** | coverage, gap, uncovered | 5 tools | Coverage analysis, gap detection |
| **Quality** | quality gate, deploy, release | 6 tools | Quality gates, deployment readiness |
| **Flaky** | flaky, unstable, retry | 3 tools | Flaky test detection and stabilization |
| **Visual** | screenshot, accessibility, wcag | 3 tools | Visual regression, accessibility testing |
| **Requirements** | bdd, gherkin, acceptance | 2 tools | Requirements validation, BDD generation |

### Loading Domain Tools
\`\`\`
# Explicit load
tools_load_domain({ domain: 'security' })

# Auto-load: Just mention keywords in your request
"I need to run a security scan" → Security tools auto-load
\`\`\`

---

## Specialized Tools (Expert Use)

### Learning Domain (4 tools)
For persistent learning and pattern storage across sessions.
Load with: \`tools_load_domain({ domain: 'learning' })\`

### Advanced Domain (7 tools)
For mutation testing, API contract validation, production incident replay.
Load with: \`tools_load_domain({ domain: 'advanced' })\`

---

## Best Practices

1. **Start with core tools** - They handle 80% of use cases
2. **Let auto-load work** - Mention keywords naturally
3. **Use tools_discover** - When unsure what's available
4. **Batch operations** - Use parallel execution for speed
5. **Check fleet_status** - Monitor agent health

---

## Common Workflows

### Test Generation & Execution
1. \`test_generate_enhanced\` - Generate tests
2. \`test_execute_parallel\` - Run tests
3. \`test_report_comprehensive\` - Generate report

### Quality Gate Check
1. Load quality domain if not auto-loaded
2. \`quality_analyze\` - Analyze metrics
3. \`qe_qualitygate_evaluate\` - Make go/no-go decision

### Security Audit
1. \`tools_load_domain({ domain: 'security' })\`
2. \`qe_security_scan_comprehensive\` - Full scan
3. \`qe_security_detect_vulnerabilities\` - Detailed analysis

---

## Tool Naming Convention
All tools follow: \`mcp__agentic_qe__<tool_name>\`

Example: \`mcp__agentic_qe__test_generate_enhanced\`
`;

export const SERVER_NAME = 'agentic-qe';
export const SERVER_VERSION = '2.6.6';

/**
 * Get formatted server info for MCP initialization
 */
export function getServerInfo(): { name: string; version: string; instructions: string } {
  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: SERVER_INSTRUCTIONS,
  };
}
