/**
 * Init Wizard - Hooks, MCP, and CLAUDE.md Generation
 *
 * Contains hook configuration, MCP server setup, and CLAUDE.md generation
 * logic used during AQE initialization. Extracted from init-wizard.ts.
 *
 * Uses shared settings-merge utilities to:
 * - Detect and replace existing AQE hooks (no duplicates)
 * - Preserve non-AQE hooks from the user's config
 * - Add full env vars and v3 settings sections
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { safeJsonParse } from '../shared/safe-json.js';
import {
  mergeHooksSmart,
  generateAqeEnvVars,
  generateV3SettingsSections,
} from './settings-merge.js';

import type { AQEInitConfig } from './types.js';

// ============================================================================
// Hook Configuration
// ============================================================================

/**
 * Configure Claude Code hooks.
 * Creates or updates .claude/settings.json with AQE hooks.
 *
 * Smart merge: detects existing AQE/agentic-qe hooks and replaces them
 * instead of appending duplicates. Non-AQE hooks are preserved.
 */
export async function configureHooks(projectRoot: string, config: AQEInitConfig): Promise<boolean> {
  if (!config.hooks.claudeCode) {
    return false;
  }

  // Create .claude directory
  const claudeDir = join(projectRoot, '.claude');
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  // Load existing settings or create new
  const settingsPath = join(claudeDir, 'settings.json');
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = safeJsonParse<Record<string, unknown>>(content);
    } catch {
      settings = {};
    }
  }

  // Generate new AQE hooks config
  const aqeHooks: Record<string, unknown[]> = {
    PreToolUse: [
      {
        matcher: '^(Write|Edit|MultiEdit)$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks guard --file "$TOOL_INPUT_file_path" --json',
            timeout: 3000,
            continueOnError: true,
          },
        ],
      },
      {
        matcher: '^(Write|Edit|MultiEdit)$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks pre-edit --file "$TOOL_INPUT_file_path" --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
      {
        matcher: '^Bash$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks pre-command --command "$TOOL_INPUT_command" --json',
            timeout: 3000,
            continueOnError: true,
          },
        ],
      },
      {
        matcher: '^Task$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks pre-task --description "$TOOL_INPUT_prompt" --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: '^(Write|Edit|MultiEdit)$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks post-edit --file "$TOOL_INPUT_file_path" --success --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
      {
        matcher: '^Bash$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks post-command --command "$TOOL_INPUT_command" --success --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
      {
        matcher: '^Task$',
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks post-task --task-id "$TOOL_RESULT_agent_id" --success --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks route --task "$PROMPT" --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
    ],
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks session-start --session-id "$SESSION_ID" --json',
            timeout: 10000,
            continueOnError: true,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: 'npx agentic-qe hooks session-end --save-state --json',
            timeout: 5000,
            continueOnError: true,
          },
        ],
      },
    ],
  };

  // Smart merge: replace old AQE hooks, keep user hooks, add new AQE hooks
  const existingHooks = (settings.hooks as Record<string, unknown[]>) || {};
  settings.hooks = mergeHooksSmart(existingHooks, aqeHooks);

  // Set full AQE environment variables
  const existingEnv = (settings.env as Record<string, string>) || {};
  settings.env = {
    ...existingEnv,
    ...generateAqeEnvVars(config),
  };

  // Apply v3 settings sections
  const v3Sections = generateV3SettingsSections(config);
  for (const [key, value] of Object.entries(v3Sections)) {
    settings[key] = value;
  }

  // Enable MCP servers (deduplicate, replace old 'aqe' with 'agentic-qe')
  let existingMcp = (settings.enabledMcpjsonServers as string[]) || [];
  existingMcp = existingMcp.filter(s => s !== 'aqe');
  if (!existingMcp.includes('agentic-qe')) {
    existingMcp.push('agentic-qe');
  }
  settings.enabledMcpjsonServers = existingMcp;

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  // Install cross-phase memory hooks configuration
  await installCrossPhaseMemoryHooks(projectRoot);

  return true;
}

/**
 * Install cross-phase memory hooks configuration file.
 * Copies the QCSD feedback loop hooks from assets to .claude/hooks/.
 */
async function installCrossPhaseMemoryHooks(projectRoot: string): Promise<void> {
  const hooksDir = join(projectRoot, '.claude', 'hooks');
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const targetPath = join(hooksDir, 'cross-phase-memory.yaml');

  if (existsSync(targetPath)) {
    return;
  }

  const possiblePaths = [
    join(dirname(import.meta.url.replace('file://', '')), '..', '..', 'assets', 'hooks', 'cross-phase-memory.yaml'),
    join(process.cwd(), 'assets', 'hooks', 'cross-phase-memory.yaml'),
    join(process.cwd(), 'v3', 'assets', 'hooks', 'cross-phase-memory.yaml'),
  ];

  for (const sourcePath of possiblePaths) {
    try {
      if (existsSync(sourcePath)) {
        copyFileSync(sourcePath, targetPath);
        console.log('  ✓ Cross-phase memory hooks installed');
        return;
      }
    } catch {
      // Try next path
    }
  }

  // If no asset found, create minimal config
  const minimalConfig = `# Cross-Phase Memory Hooks Configuration
# Generated by aqe init
# See: https://github.com/anthropics/agentic-qe/docs/cross-phase-memory.md

version: "1.0"
enabled: true

hooks:
  # Add custom QCSD feedback loop hooks here
  # See .claude/hooks/cross-phase-memory.yaml in the agentic-qe repo for examples

routing:
  authorized_receivers:
    strategic:
      - "qe-risk-assessor"
      - "qe-quality-criteria-recommender"
    tactical:
      - "qe-product-factors-assessor"
    operational:
      - "qe-test-architect"
      - "qe-tdd-specialist"
    quality-criteria:
      - "qe-requirements-validator"
      - "qe-bdd-generator"
`;
  writeFileSync(targetPath, minimalConfig, 'utf-8');
  console.log('  ✓ Cross-phase memory hooks created (minimal config)');
}

// ============================================================================
// MCP Configuration
// ============================================================================

/**
 * Configure MCP server.
 * Creates .mcp.json (root level) with AQE v3 MCP server configuration.
 * Uses npx to run the MCP server without requiring global installation.
 */
export async function configureMCP(projectRoot: string): Promise<boolean> {
  const mcpPath = join(projectRoot, '.mcp.json');
  let mcpConfig: Record<string, unknown> = {};

  if (existsSync(mcpPath)) {
    try {
      const content = readFileSync(mcpPath, 'utf-8');
      mcpConfig = safeJsonParse<Record<string, unknown>>(content);
    } catch {
      mcpConfig = {};
    }
  }

  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {};
  }

  const servers = mcpConfig.mcpServers as Record<string, unknown>;
  servers['agentic-qe'] = {
    command: 'npx',
    args: [
      '@anthropics/agentic-qe',
      'mcp',
      'start'
    ],
    env: {
      AQE_PROJECT_ROOT: projectRoot,
      AQE_LEARNING_ENABLED: 'true',
      AQE_VERBOSE: 'false',
    },
    autoStart: false,
  };

  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

  return true;
}

// ============================================================================
// CLAUDE.md Generation
// ============================================================================

/**
 * Generate CLAUDE.md for the project.
 * Creates a comprehensive guide for Claude Code with V3-specific instructions.
 * If CLAUDE.md exists, creates backup and appends AQE v3 section.
 */
export async function generateCLAUDEmd(projectRoot: string, config: AQEInitConfig): Promise<boolean> {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  const content = generateCLAUDEmdContent(config);

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');

    if (existing.includes('## Agentic QE v3')) {
      return true;
    }

    const backupPath = join(projectRoot, 'CLAUDE.md.backup');
    writeFileSync(backupPath, existing, 'utf-8');
    writeFileSync(claudeMdPath, existing + '\n\n' + content, 'utf-8');
  } else {
    writeFileSync(claudeMdPath, content, 'utf-8');
  }

  return true;
}

/**
 * Generate CLAUDE.md content.
 * Comprehensive AQE instructions for Claude Code integration.
 */
function generateCLAUDEmdContent(config: AQEInitConfig): string {
  const enabledDomains = config.domains.enabled.slice(0, 6).join(', ');
  const moreDomainsCount = Math.max(0, config.domains.enabled.length - 6);

  return `## Agentic QE v3

This project uses **Agentic QE v3** - a Domain-Driven Quality Engineering platform with 12 bounded contexts, ReasoningBank learning, and HNSW vector search.

---

## 🐝 AQE FLEET ORCHESTRATION

### Fleet Initialization

**For QE-specific tasks, initialize the AQE fleet:**

\`\`\`javascript
// Initialize AQE Fleet with MCP tool
mcp__agentic-qe__fleet_init({
  config: {
    topology: "hierarchical",  // Queen-led for QE coordination
    maxAgents: 15,
    testingFocus: ["unit", "integration", "e2e", "performance"],
    frameworks: ["vitest", "jest", "playwright"],
    environments: ["node", "browser"]
  },
  projectContext: {
    language: "typescript",
    buildSystem: "npm"
  }
})
\`\`\`

### 12 DDD Domains → Agent Mapping

| Domain | Primary Agents | Focus Area |
|--------|---------------|------------|
| \`test-generation\` | qe-test-architect, qe-tdd-specialist | AI-powered test creation |
| \`test-execution\` | qe-parallel-executor, qe-flaky-hunter, qe-retry-handler | Parallel execution, flaky detection |
| \`coverage-analysis\` | qe-coverage-specialist, qe-gap-detector | O(log n) sublinear coverage |
| \`quality-assessment\` | qe-quality-gate, qe-deployment-advisor | Quality gates, risk scoring |
| \`defect-intelligence\` | qe-defect-predictor, qe-root-cause-analyzer | ML-powered defect prediction |
| \`learning-optimization\` | qe-learning-coordinator, qe-pattern-learner | Cross-domain pattern learning |
| \`requirements-validation\` | qe-tdd-specialist, qe-property-tester | BDD scenarios, property tests |
| \`code-intelligence\` | qe-knowledge-manager, code-analyzer | Knowledge graphs, 80% token reduction |
| \`security-compliance\` | qe-security-scanner, qe-security-auditor | OWASP, CVE detection |
| \`contract-testing\` | qe-contract-validator, qe-api-tester | Pact, schema validation |
| \`visual-accessibility\` | qe-visual-tester, qe-a11y-validator | Visual regression, WCAG |
| \`chaos-resilience\` | qe-chaos-engineer, qe-performance-tester | Fault injection, load testing |

### Fleet MCP Tools

\`\`\`javascript
// Spawn specialized QE agent
mcp__agentic-qe__agent_spawn({
  spec: {
    type: "test-generator",
    capabilities: ["unit-tests", "integration-tests"],
    name: "test-gen-1"
  },
  fleetId: "fleet-123"
})

// AI-enhanced test generation
mcp__agentic-qe__test_generate_enhanced({
  sourceCode: "...",
  language: "typescript",
  testType: "unit",
  coverageGoal: 90,
  aiEnhancement: true,
  detectAntiPatterns: true
})

// Parallel test execution with retry
mcp__agentic-qe__test_execute_parallel({
  testFiles: ["tests/**/*.test.ts"],
  parallelism: 4,
  retryFailures: true,
  maxRetries: 3,
  collectCoverage: true
})

// Orchestrate QE task across fleet
mcp__agentic-qe__task_orchestrate({
  task: {
    type: "comprehensive-testing",
    priority: "high",
    strategy: "adaptive",
    maxAgents: 5
  },
  context: {
    project: "my-project",
    environment: "test"
  },
  fleetId: "fleet-123"
})
\`\`\`

### QE Memory Operations

\`\`\`javascript
// Store QE pattern with namespace
mcp__agentic-qe__memory_store({
  key: "coverage-pattern-auth",
  value: { pattern: "...", successRate: 0.95 },
  namespace: "qe-patterns",
  ttl: 86400,
  persist: true
})

// Query memory with pattern matching
mcp__agentic-qe__memory_query({
  pattern: "coverage-*",
  namespace: "qe-patterns",
  limit: 10
})
\`\`\`

### QE Task Routing by Domain

| Task Type | MCP Tool | Agents Spawned |
|-----------|----------|----------------|
| Generate tests | \`test_generate_enhanced\` | qe-test-architect, qe-tdd-specialist |
| Run tests | \`test_execute_parallel\` | qe-parallel-executor, qe-retry-handler |
| Analyze coverage | \`task_orchestrate\` (coverage) | qe-coverage-specialist, qe-gap-detector |
| Quality gate | \`task_orchestrate\` (quality-gate) | qe-quality-gate, qe-deployment-advisor |
| Security scan | \`agent_spawn\` (security-scanner) | qe-security-scanner, qe-security-auditor |
| Chaos test | \`agent_spawn\` (chaos-engineer) | qe-chaos-engineer, qe-load-tester |

---

## Quick Reference

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

### MCP Server

The AQE v3 MCP server is configured in \`.claude/mcp.json\`. Available tools:

| Tool | Description |
|------|-------------|
| \`fleet_init\` | Initialize QE fleet with topology |
| \`agent_spawn\` | Spawn specialized QE agent |
| \`test_generate_enhanced\` | AI-powered test generation |
| \`test_execute_parallel\` | Parallel test execution with retry |
| \`task_orchestrate\` | Orchestrate multi-agent QE tasks |
| \`coverage_analyze_sublinear\` | O(log n) coverage analysis |
| \`quality_assess\` | Quality gate evaluation |
| \`memory_store\` / \`memory_query\` | Pattern storage with namespacing |
| \`security_scan_comprehensive\` | SAST/DAST scanning |
| \`fleet_status\` | Get fleet and agent status |

### Configuration

- **Enabled Domains**: ${enabledDomains}${moreDomainsCount > 0 ? ` (+${moreDomainsCount} more)` : ''}
- **Learning**: ${config.learning.enabled ? 'Enabled' : 'Disabled'} (${config.learning.embeddingModel} embeddings)
- **Max Concurrent Agents**: ${config.agents.maxConcurrent}
- **Background Workers**: ${config.workers.enabled.length > 0 ? config.workers.enabled.join(', ') : 'None'}

### V3 QE Agents

V3 QE agents are installed in \`.claude/agents/v3/\`. Use with Claude Code's Task tool:

\`\`\`javascript
// Example: Generate tests
Task({ prompt: "Generate unit tests for auth module", subagent_type: "qe-test-architect", run_in_background: true })

// Example: Analyze coverage
Task({ prompt: "Find coverage gaps in src/", subagent_type: "qe-coverage-specialist", run_in_background: true })

// Example: Security scan
Task({ prompt: "Run security audit", subagent_type: "qe-security-scanner", run_in_background: true })
\`\`\`

### Integration with Claude Flow

**AQE Fleet + Claude Flow work together:**

\`\`\`javascript
// STEP 1: Initialize Claude Flow swarm for coordination
Bash("npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 15")

// STEP 2: Initialize AQE Fleet for QE-specific work
mcp__agentic-qe__fleet_init({
  config: { topology: "hierarchical", maxAgents: 10, testingFocus: ["unit", "integration"] }
})

// STEP 3: Spawn agents via Claude Code Task tool (do the actual work)
Task({ prompt: "Generate tests for auth module", subagent_type: "qe-test-architect", run_in_background: true })
Task({ prompt: "Analyze coverage gaps", subagent_type: "qe-coverage-specialist", run_in_background: true })

// STEP 4: Store learnings in both systems
mcp__agentic-qe__memory_store({ key: "pattern-1", value: "...", namespace: "qe-patterns", persist: true })
Bash("npx @claude-flow/cli@latest memory store --key 'qe-pattern-1' --value '...' --namespace patterns")
\`\`\`

### Data Storage

- **Memory Backend**: \`.agentic-qe/memory.db\` (SQLite)
- **Pattern Storage**: \`.agentic-qe/data/memory.db\` (ReasoningBank)
- **HNSW Index**: \`.agentic-qe/data/hnsw/index.bin\`
- **Configuration**: \`.agentic-qe/config.yaml\`

### Best Practices

1. **Test Execution**: Always use \`npm test -- --run\` (not \`npm test\` which runs in watch mode)
2. **Coverage Targets**: Aim for 80%+ coverage on critical paths
3. **Quality Gates**: Run \`quality_assess\` before merging PRs
4. **Pattern Learning**: AQE learns from successful test patterns - consistent naming helps
5. **Fleet Coordination**: Use \`fleet_init\` before spawning multiple QE agents
6. **Memory Persistence**: Use \`persist: true\` for patterns you want to keep across sessions

### Troubleshooting

If MCP tools aren't working:
\`\`\`bash
# Verify MCP server is configured
cat .claude/mcp.json

# Check fleet status
mcp__agentic-qe__fleet_status({ includeAgentDetails: true })

# Reinitialize if needed
aqe init --auto
\`\`\`

---
*Generated by AQE v3 init - ${new Date().toISOString()}*
`;
}
