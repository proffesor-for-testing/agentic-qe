/**
 * Phase 11: CLAUDE.md
 * Generates CLAUDE.md documentation for Claude Code
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import type { AQEInitConfig } from '../types.js';

export interface ClaudeMdResult {
  generated: boolean;
  path: string;
  backupCreated: boolean;
}

/**
 * CLAUDE.md phase - generates Claude Code documentation
 */
export class ClaudeMdPhase extends BasePhase<ClaudeMdResult> {
  readonly name = 'claude-md';
  readonly description = 'Generate CLAUDE.md';
  readonly order = 110;
  readonly critical = false;
  readonly requiresPhases = ['configuration'] as const;

  protected async run(context: InitContext): Promise<ClaudeMdResult> {
    const config = context.config as AQEInitConfig;
    const { projectRoot } = context;

    const claudeMdPath = join(projectRoot, 'CLAUDE.md');
    const content = this.generateContent(config);
    let backupCreated = false;

    // Check existing CLAUDE.md
    if (existsSync(claudeMdPath)) {
      const existing = readFileSync(claudeMdPath, 'utf-8');

      // Skip if AQE section exists
      if (existing.includes('## Agentic QE v3')) {
        context.services.log('  CLAUDE.md already has AQE section');
        return { generated: false, path: claudeMdPath, backupCreated: false };
      }

      // Create backup
      const backupPath = join(projectRoot, 'CLAUDE.md.backup');
      writeFileSync(backupPath, existing, 'utf-8');
      backupCreated = true;

      // Append AQE section
      writeFileSync(claudeMdPath, existing + '\n\n' + content, 'utf-8');
    } else {
      // Create new
      writeFileSync(claudeMdPath, content, 'utf-8');
    }

    context.services.log(`  Path: ${claudeMdPath}`);
    if (backupCreated) {
      context.services.log('  Backup created');
    }

    return {
      generated: true,
      path: claudeMdPath,
      backupCreated,
    };
  }

  /**
   * Generate CLAUDE.md content
   */
  private generateContent(config: AQEInitConfig): string {
    const enabledDomains = config.domains.enabled.slice(0, 6).join(', ');
    const moreDomainsCount = Math.max(0, config.domains.enabled.length - 6);

    return `## Agentic QE v3

This project uses **Agentic QE v3** - a Domain-Driven Quality Engineering platform with 13 bounded contexts, ReasoningBank learning, HNSW vector search, and Agent Teams coordination (ADR-064).

---

### CRITICAL POLICIES

#### Integrity Rule (ABSOLUTE)
- NO shortcuts, fake data, or false claims
- ALWAYS implement properly, verify before claiming success
- ALWAYS use real database queries for integration tests
- ALWAYS run actual tests, not assume they pass

**We value the quality we deliver to our users.**

#### Test Execution
- NEVER run \`npm test\` without \`--run\` flag (watch mode risk)
- Use: \`npm test -- --run\`, \`npm run test:unit\`, \`npm run test:integration\` when available

#### Data Protection
- NEVER run \`rm -f\` on \`.agentic-qe/\` or \`*.db\` files without confirmation
- ALWAYS backup before database operations

#### Git Operations
- NEVER auto-commit/push without explicit user request
- ALWAYS wait for user confirmation before git operations

---

### Quick Reference

\`\`\`bash
# Run tests
npm test -- --run

# Check quality
aqe quality assess

# Generate tests
aqe test generate <file>

# Coverage analysis
aqe coverage <path>
\`\`\`

### Using AQE MCP Tools

AQE exposes tools via MCP with the \`mcp__agentic-qe__\` prefix. You MUST call \`fleet_init\` before any other tool.

#### 1. Initialize the Fleet (required first step)

\`\`\`typescript
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  maxAgents: 15,
  memoryBackend: "hybrid"
})
\`\`\`

#### 2. Generate Tests

\`\`\`typescript
mcp__agentic-qe__test_generate_enhanced({
  targetPath: "src/services/auth.ts",
  framework: "vitest",
  strategy: "boundary-value"
})
\`\`\`

#### 3. Analyze Coverage

\`\`\`typescript
mcp__agentic-qe__coverage_analyze_sublinear({
  paths: ["src/"],
  threshold: 80
})
\`\`\`

#### 4. Assess Quality

\`\`\`typescript
mcp__agentic-qe__quality_assess({
  scope: "full",
  includeMetrics: true
})
\`\`\`

#### 5. Store and Query Patterns (with learning persistence)

\`\`\`typescript
// Store a learned pattern
mcp__agentic-qe__memory_store({
  key: "patterns/coverage-gap/{timestamp}",
  namespace: "learning",
  value: {
    pattern: "...",
    confidence: 0.95,
    type: "coverage-gap",
    metadata: { /* domain-specific */ }
  },
  persist: true
})

// Query stored patterns
mcp__agentic-qe__memory_query({
  pattern: "patterns/*",
  namespace: "learning",
  limit: 10
})
\`\`\`

#### 6. Orchestrate Multi-Agent Tasks

\`\`\`typescript
mcp__agentic-qe__task_orchestrate({
  task: "Full quality assessment of auth module",
  domains: ["test-generation", "coverage-analysis", "security-compliance"],
  parallel: true
})
\`\`\`

### MCP Tool Reference

| Tool | Description |
|------|-------------|
| \`fleet_init\` | Initialize QE fleet (MUST call first) |
| \`fleet_status\` | Get fleet health and agent status |
| \`agent_spawn\` | Spawn specialized QE agent |
| \`test_generate_enhanced\` | AI-powered test generation |
| \`test_execute_parallel\` | Parallel test execution with retry |
| \`task_orchestrate\` | Orchestrate multi-agent QE tasks |
| \`coverage_analyze_sublinear\` | O(log n) coverage analysis |
| \`quality_assess\` | Quality gate evaluation |
| \`memory_store\` | Store patterns with namespace + persist |
| \`memory_query\` | Query patterns by namespace/pattern |
| \`security_scan_comprehensive\` | SAST/DAST scanning |

### Configuration

- **Enabled Domains**: ${enabledDomains}${moreDomainsCount > 0 ? ` (+${moreDomainsCount} more)` : ''}
- **Learning**: ${config.learning.enabled ? 'Enabled' : 'Disabled'} (${config.learning.embeddingModel} embeddings)
- **Max Concurrent Agents**: ${config.agents.maxConcurrent}
- **Background Workers**: ${config.workers.enabled.length > 0 ? config.workers.enabled.join(', ') : 'None'}

### V3 QE Agents

QE agents are in \`.claude/agents/v3/\`. Use with Task tool:

\`\`\`javascript
Task({ prompt: "Generate tests", subagent_type: "qe-test-architect", run_in_background: true })
Task({ prompt: "Find coverage gaps", subagent_type: "qe-coverage-specialist", run_in_background: true })
Task({ prompt: "Security audit", subagent_type: "qe-security-scanner", run_in_background: true })
\`\`\`

### Data Storage

- **Memory Backend**: \`.agentic-qe/memory.db\` (SQLite)
- **Configuration**: \`.agentic-qe/config.yaml\`

---
*Generated by AQE v3 init - ${new Date().toISOString()}*
`;
  }
}

// Instance exported from index.ts
