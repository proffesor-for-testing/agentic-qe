/**
 * Agents Installer
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Installs V3 QE agents to user projects.
 * Agents are copied from .claude/agents/v3/ to the project's .claude/agents/v3/.
 */

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Types
// ============================================================================

export interface AgentInfo {
  name: string;
  type: 'v3-qe' | 'v3-subagent';
  description?: string;
  domain?: string;
}

export interface AgentsInstallResult {
  installed: AgentInfo[];
  skipped: string[];
  errors: string[];
  totalCount: number;
  agentsDir: string;
}

export interface AgentsInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Install V3 QE domain agents (default: true) */
  installQEAgents?: boolean;
  /** Install V3 subagents (default: true) */
  installSubagents?: boolean;
  /** Overwrite existing agents (default: false) */
  overwrite?: boolean;
  /** Agents to exclude by name pattern */
  exclude?: string[];
  /** Only install these agents (if specified) */
  include?: string[];
}

// ============================================================================
// Agent Categories
// ============================================================================

/**
 * V3 QE domain agents (mapped to 12 DDD bounded contexts)
 * NOTE: We only install v3-qe-* agents - core agents like adr-architect,
 * memory-specialist, etc. are claude-flow agents, NOT AQE agents.
 */
const V3_QE_AGENTS = [
  // Test Generation Domain
  'v3-qe-test-architect',
  'v3-qe-bdd-generator',
  'v3-qe-property-tester',
  'v3-qe-mutation-tester',

  // Test Execution Domain
  'v3-qe-parallel-executor',
  'v3-qe-flaky-hunter',
  'v3-qe-retry-handler',

  // Coverage Analysis Domain
  'v3-qe-coverage-specialist',
  'v3-qe-gap-detector',

  // Quality Assessment Domain
  'v3-qe-quality-gate',
  'v3-qe-code-complexity',
  'v3-qe-deployment-advisor',
  'v3-qe-risk-assessor',

  // Defect Intelligence Domain
  'v3-qe-defect-predictor',
  'v3-qe-regression-analyzer',
  'v3-qe-root-cause-analyzer',
  'v3-qe-impact-analyzer',

  // Requirements Validation Domain
  'v3-qe-requirements-validator',
  'v3-qe-qx-partner',

  // Code Intelligence Domain
  'v3-qe-code-intelligence',
  'v3-qe-kg-builder',
  'v3-qe-dependency-mapper',

  // Security Compliance Domain
  'v3-qe-security-scanner',
  'v3-qe-security-auditor',

  // Contract Testing Domain
  'v3-qe-contract-validator',
  'v3-qe-graphql-tester',

  // Visual Accessibility Domain
  'v3-qe-visual-tester',
  'v3-qe-accessibility-auditor',
  'v3-qe-responsive-tester',

  // Chaos Resilience Domain
  'v3-qe-chaos-engineer',
  'v3-qe-load-tester',
  'v3-qe-performance-tester',

  // Learning Optimization Domain
  'v3-qe-learning-coordinator',
  'v3-qe-pattern-learner',
  'v3-qe-metrics-optimizer',
  'v3-qe-transfer-specialist',

  // Fleet Coordination
  'v3-qe-fleet-commander',
  'v3-qe-queen-coordinator',

  // TDD Specialist
  'v3-qe-tdd-specialist',
  'v3-qe-integration-tester',
];

/**
 * V3 QE subagents (specialized sub-tasks)
 */
const V3_SUBAGENTS = [
  'v3-qe-code-reviewer',
  'v3-qe-integration-reviewer',
  'v3-qe-performance-reviewer',
  'v3-qe-security-reviewer',
  'v3-qe-tdd-red',
  'v3-qe-tdd-green',
  'v3-qe-tdd-refactor',
];

// ============================================================================
// Agents Installer Class
// ============================================================================

export class AgentsInstaller {
  private projectRoot: string;
  private options: AgentsInstallerOptions;
  private sourceAgentsDir: string;

  constructor(options: AgentsInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.options = {
      installQEAgents: true,
      installSubagents: true,
      overwrite: false,
      exclude: [],
      include: undefined,
      ...options,
    };

    // Find the source agents directory
    this.sourceAgentsDir = this.findSourceAgentsDir();
  }

  /**
   * Find the source agents directory
   * Looks in multiple locations to support different installation scenarios
   */
  private findSourceAgentsDir(): string {
    // Try relative to this module (development)
    const moduleDir = dirname(fileURLToPath(import.meta.url));

    // Possible locations for agents
    const possiblePaths = [
      // Development: relative to v3/src/init/ (3 levels up to agentic-qe root)
      join(moduleDir, '../../../.claude/agents/v3'),
      // Development: relative to v3/dist/init/ (3 levels up to agentic-qe root)
      join(moduleDir, '../../../.claude/agents/v3'),
      // NPM package: assets directory at package root (dist/init -> dist -> package root)
      join(moduleDir, '../../assets/agents/v3'),
      // Local install: in node_modules
      join(this.projectRoot, 'node_modules/@agentic-qe/v3/assets/agents/v3'),
    ];

    for (const agentsPath of possiblePaths) {
      if (existsSync(agentsPath)) {
        return agentsPath;
      }
    }

    // If no agents found, return the first path (will fail gracefully)
    return possiblePaths[0];
  }

  /**
   * Install agents to the project
   */
  async install(): Promise<AgentsInstallResult> {
    const result: AgentsInstallResult = {
      installed: [],
      skipped: [],
      errors: [],
      totalCount: 0,
      agentsDir: join(this.projectRoot, '.claude', 'agents', 'v3'),
    };

    // Check if source agents exist
    if (!existsSync(this.sourceAgentsDir)) {
      result.errors.push(`Source agents directory not found: ${this.sourceAgentsDir}`);
      return result;
    }

    // Create target agents directory
    const targetAgentsDir = join(this.projectRoot, '.claude', 'agents', 'v3');
    if (!existsSync(targetAgentsDir)) {
      mkdirSync(targetAgentsDir, { recursive: true });
    }

    // Create subagents directory
    const targetSubagentsDir = join(targetAgentsDir, 'subagents');
    if (!existsSync(targetSubagentsDir)) {
      mkdirSync(targetSubagentsDir, { recursive: true });
    }

    // Get list of available agents
    const availableAgents = this.getAvailableAgents();
    result.totalCount = availableAgents.length;

    // Filter agents based on options
    const agentsToInstall = this.filterAgents(availableAgents);

    // Install each agent
    for (const agentName of agentsToInstall) {
      try {
        const agentInfo = await this.installAgent(agentName, targetAgentsDir, targetSubagentsDir);
        if (agentInfo) {
          result.installed.push(agentInfo);
        } else {
          result.skipped.push(agentName);
        }
      } catch (error) {
        result.errors.push(`Failed to install ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Create agents index file
    await this.createAgentsIndex(targetAgentsDir, result.installed);

    return result;
  }

  /**
   * Get list of available agents from source directory
   */
  private getAvailableAgents(): string[] {
    const agents: string[] = [];

    try {
      // Get root-level agents
      const entries = readdirSync(this.sourceAgentsDir);
      for (const entry of entries) {
        const fullPath = join(this.sourceAgentsDir, entry);
        const stat = statSync(fullPath);

        if (stat.isFile() && entry.endsWith('.md')) {
          agents.push(entry.replace('.md', ''));
        } else if (stat.isDirectory() && entry === 'subagents') {
          // Get subagents
          const subentries = readdirSync(fullPath);
          for (const subentry of subentries) {
            if (subentry.endsWith('.md')) {
              agents.push(`subagents/${subentry.replace('.md', '')}`);
            }
          }
        }
      }
    } catch {
      return [];
    }

    return agents;
  }

  /**
   * Filter agents based on installation options
   * Only installs qe-* agents (QE agents and subagents)
   * Does NOT install claude-flow core agents (adr-architect, memory-specialist, etc.)
   */
  private filterAgents(availableAgents: string[]): string[] {
    // First, filter to only include qe-* agents (AQE agents, not claude-flow agents)
    let filtered = availableAgents.filter(a => {
      const name = a.includes('/') ? a.split('/')[1] : a;
      // Only include agents that start with qe- (our QE agents)
      return name.startsWith('qe-');
    });

    // Apply include filter if specified
    if (this.options.include && this.options.include.length > 0) {
      filtered = filtered.filter(a => {
        const name = a.includes('/') ? a.split('/')[1] : a;
        return this.options.include!.includes(name);
      });
    }

    // Apply exclude filter
    if (this.options.exclude && this.options.exclude.length > 0) {
      filtered = filtered.filter(a => {
        const name = a.includes('/') ? a.split('/')[1] : a;
        return !this.options.exclude!.some(pattern =>
          name.includes(pattern) || name.match(new RegExp(pattern))
        );
      });
    }

    // Filter by agent type
    if (!this.options.installQEAgents) {
      filtered = filtered.filter(a => {
        const name = a.includes('/') ? a.split('/')[1] : a;
        return !V3_QE_AGENTS.includes(name);
      });
    }

    if (!this.options.installSubagents) {
      filtered = filtered.filter(a => !a.startsWith('subagents/'));
    }

    return filtered;
  }

  /**
   * Install a single agent
   */
  private async installAgent(
    agentPath: string,
    targetDir: string,
    targetSubagentsDir: string
  ): Promise<AgentInfo | null> {
    const isSubagent = agentPath.startsWith('subagents/');
    const agentName = isSubagent ? agentPath.split('/')[1] : agentPath;

    const sourceFile = join(this.sourceAgentsDir, `${agentPath}.md`);
    const targetFile = isSubagent
      ? join(targetSubagentsDir, `${agentName}.md`)
      : join(targetDir, `${agentName}.md`);

    // Check if agent already exists and overwrite is disabled
    if (existsSync(targetFile) && !this.options.overwrite) {
      return null; // Skip, will be added to skipped list
    }

    // Copy agent file
    if (existsSync(sourceFile)) {
      copyFileSync(sourceFile, targetFile);
    } else {
      throw new Error(`Source file not found: ${sourceFile}`);
    }

    // Determine agent type
    const agentType = this.getAgentType(agentName, isSubagent);

    // Get description from agent file
    const description = this.getAgentDescription(targetFile);

    // Get domain from agent name
    const domain = this.getAgentDomain(agentName);

    return {
      name: agentName,
      type: agentType,
      description,
      domain,
    };
  }

  /**
   * Get the type of an agent based on its name
   */
  private getAgentType(_agentName: string, isSubagent: boolean): 'v3-qe' | 'v3-subagent' {
    if (isSubagent) return 'v3-subagent';
    return 'v3-qe';
  }

  /**
   * Extract description from agent markdown file
   */
  private getAgentDescription(agentFile: string): string | undefined {
    if (!existsSync(agentFile)) return undefined;

    try {
      const content = readFileSync(agentFile, 'utf-8');
      // Look for description in frontmatter
      const descMatch = content.match(/description:\s*["']?([^"'\n]+)["']?/i);
      if (descMatch) return descMatch[1].trim();

      // Try to get first non-header paragraph
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-') && !trimmed.startsWith('```') && !trimmed.startsWith('---')) {
          return trimmed.slice(0, 100) + (trimmed.length > 100 ? '...' : '');
        }
      }
    } catch {
      // Ignore read errors
    }

    return undefined;
  }

  /**
   * Get domain from agent name
   */
  private getAgentDomain(agentName: string): string | undefined {
    // Map agent names to DDD domains
    const domainMap: Record<string, string> = {
      'test-architect': 'test-generation',
      'bdd-generator': 'test-generation',
      'property-tester': 'test-generation',
      'mutation-tester': 'test-generation',
      'parallel-executor': 'test-execution',
      'flaky-hunter': 'test-execution',
      'retry-handler': 'test-execution',
      'coverage-specialist': 'coverage-analysis',
      'gap-detector': 'coverage-analysis',
      'quality-gate': 'quality-assessment',
      'code-complexity': 'quality-assessment',
      'deployment-advisor': 'quality-assessment',
      'risk-assessor': 'quality-assessment',
      'defect-predictor': 'defect-intelligence',
      'regression-analyzer': 'defect-intelligence',
      'root-cause-analyzer': 'defect-intelligence',
      'impact-analyzer': 'defect-intelligence',
      'requirements-validator': 'requirements-validation',
      'qx-partner': 'requirements-validation',
      'code-intelligence': 'code-intelligence',
      'kg-builder': 'code-intelligence',
      'dependency-mapper': 'code-intelligence',
      'security-scanner': 'security-compliance',
      'security-auditor': 'security-compliance',
      'contract-validator': 'contract-testing',
      'graphql-tester': 'contract-testing',
      'visual-tester': 'visual-accessibility',
      'accessibility-auditor': 'visual-accessibility',
      'responsive-tester': 'visual-accessibility',
      'chaos-engineer': 'chaos-resilience',
      'load-tester': 'chaos-resilience',
      'performance-tester': 'chaos-resilience',
      'learning-coordinator': 'learning-optimization',
      'pattern-learner': 'learning-optimization',
      'metrics-optimizer': 'learning-optimization',
      'transfer-specialist': 'learning-optimization',
    };

    // Extract the key part of the agent name (remove v3-qe- prefix)
    const key = agentName.replace('v3-qe-', '');
    return domainMap[key];
  }

  /**
   * Create an agents index file for easy reference
   */
  private async createAgentsIndex(agentsDir: string, installed: AgentInfo[]): Promise<void> {
    const qeAgents = installed.filter(a => a.type === 'v3-qe');
    const subagents = installed.filter(a => a.type === 'v3-subagent');

    // Group QE agents by domain
    const byDomain = new Map<string, AgentInfo[]>();
    for (const agent of qeAgents) {
      const domain = agent.domain || 'general';
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)!.push(agent);
    }

    const indexContent = `# AQE V3 Agents Index

This directory contains V3 QE agents installed by \`aqe init\`.

> **Note**: This directory only contains AQE-specific agents (v3-qe-*).
> Claude-flow core agents (adr-architect, memory-specialist, etc.) are part of
> the claude-flow system and are available separately.

## Summary

- **Total Agents**: ${installed.length}
- **V3 QE Domain Agents**: ${qeAgents.length}
- **V3 Subagents**: ${subagents.length}

## Usage

Spawn agents using Claude Code's Task tool:

\`\`\`javascript
Task("Generate tests for UserService", "...", "v3-qe-test-architect")
Task("Analyze coverage gaps", "...", "v3-qe-coverage-specialist")
Task("Run security scan", "...", "v3-qe-security-scanner")
\`\`\`

## V3 QE Domain Agents (${qeAgents.length})

Quality Engineering agents mapped to the 12 DDD bounded contexts.

${Array.from(byDomain.entries()).map(([domain, agents]) => `
### ${domain.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

${agents.map(a => `- **${a.name}**${a.description ? `: ${a.description}` : ''}`).join('\n')}
`).join('\n')}

## V3 Subagents (${subagents.length})

Specialized sub-task agents for TDD and code review.

${subagents.map(a => `- **${a.name}**${a.description ? `: ${a.description}` : ''}`).join('\n')}

---

*Generated by AQE v3 init on ${new Date().toISOString()}*
`;

    writeFileSync(join(agentsDir, 'README.md'), indexContent, 'utf-8');
  }
}

/**
 * Factory function to create an agents installer
 */
export function createAgentsInstaller(options: AgentsInstallerOptions): AgentsInstaller {
  return new AgentsInstaller(options);
}

/**
 * Quick function to install all agents with defaults
 */
export async function installAgents(projectRoot: string): Promise<AgentsInstallResult> {
  const installer = createAgentsInstaller({ projectRoot });
  return await installer.install();
}
