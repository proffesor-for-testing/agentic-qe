/**
 * N8n Platform Installer
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Installs n8n v2 agents and skills to user projects when --with-n8n flag is used.
 * Copies agent definitions from .claude/agents/n8n/ and installs n8n-specific skills.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { toErrorMessage } from '../shared/error-utils.js';

// ESM compatibility - __dirname is not available in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

export interface N8nAgentInfo {
  name: string;
  filename: string;
  description?: string;
  category: 'core' | 'advanced' | 'quality' | 'enterprise' | 'reliability';
}

export interface N8nInstallResult {
  success: boolean;
  agentsInstalled: N8nAgentInfo[];
  skillsInstalled: string[];
  configGenerated: boolean;
  errors: string[];
  agentsDir: string;
  skillsDir: string;
}

export interface N8nInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Install n8n agent definitions (default: true) */
  installAgents?: boolean;
  /** Install n8n skills (default: true) */
  installSkills?: boolean;
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
  /** N8n API configuration to pre-configure */
  n8nApiConfig?: {
    baseUrl?: string;
    apiKey?: string;
  };
}

// ============================================================================
// N8n Agent Categories
// ============================================================================

/**
 * N8n agent definitions organized by phase/category
 */
const N8N_AGENTS: Record<string, N8nAgentInfo[]> = {
  core: [
    { name: 'workflow-executor', filename: 'n8n-workflow-executor.md', category: 'core' },
    { name: 'node-validator', filename: 'n8n-node-validator.md', category: 'core' },
    { name: 'trigger-test', filename: 'n8n-trigger-test.md', category: 'core' },
    { name: 'expression-validator', filename: 'n8n-expression-validator.md', category: 'core' },
    { name: 'integration-test', filename: 'n8n-integration-test.md', category: 'core' },
    { name: 'security-auditor', filename: 'n8n-security-auditor.md', category: 'core' },
  ],
  advanced: [
    { name: 'unit-tester', filename: 'n8n-unit-tester.md', category: 'advanced' },
    { name: 'performance-tester', filename: 'n8n-performance-tester.md', category: 'advanced' },
    { name: 'ci-orchestrator', filename: 'n8n-ci-orchestrator.md', category: 'advanced' },
  ],
  quality: [
    { name: 'version-comparator', filename: 'n8n-version-comparator.md', category: 'quality' },
    { name: 'bdd-scenario-tester', filename: 'n8n-bdd-scenario-tester.md', category: 'quality' },
    { name: 'monitoring-validator', filename: 'n8n-monitoring-validator.md', category: 'quality' },
  ],
  enterprise: [
    { name: 'compliance-validator', filename: 'n8n-compliance-validator.md', category: 'enterprise' },
    { name: 'chaos-tester', filename: 'n8n-chaos-tester.md', category: 'enterprise' },
  ],
  reliability: [
    { name: 'base-agent', filename: 'n8n-base-agent.md', category: 'reliability' },
  ],
};

/**
 * N8n skills to install
 */
const N8N_SKILLS = [
  'n8n-expression-testing',
  'n8n-integration-testing-patterns',
  'n8n-security-testing',
  'n8n-trigger-testing-strategies',
  'n8n-workflow-testing-fundamentals',
];

// ============================================================================
// N8n Installer Class
// ============================================================================

export class N8nInstaller {
  private projectRoot: string;
  private options: N8nInstallerOptions;
  private sourceAgentsDir: string;
  private sourceSkillsDir: string;

  constructor(options: N8nInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.options = {
      installAgents: true,
      installSkills: true,
      overwrite: false,
      ...options,
    };
    this.sourceAgentsDir = this.findSourceAgentsDir();
    this.sourceSkillsDir = this.findSourceSkillsDir();
  }

  // ==========================================================================
  // Source Directory Detection
  // ==========================================================================

  /**
   * Find the source n8n agents directory
   */
  private findSourceAgentsDir(): string {
    const possiblePaths = [
      // From v3/src/init/ context (development)
      join(__dirname, '../../../.claude/agents/n8n'),
      join(__dirname, '../../.claude/agents/n8n'),
      // From project root
      join(process.cwd(), '.claude/agents/n8n'),
      // NPM package location
      join(__dirname, '../../assets/agents/n8n'),
      // Monorepo location
      join(process.cwd(), '../.claude/agents/n8n'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Default to project root location
    return join(process.cwd(), '.claude/agents/n8n');
  }

  /**
   * Find the source skills directory
   */
  private findSourceSkillsDir(): string {
    const possiblePaths = [
      join(__dirname, '../../../.claude/skills'),
      join(__dirname, '../../.claude/skills'),
      join(process.cwd(), '.claude/skills'),
      join(__dirname, '../../assets/skills'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return join(process.cwd(), '.claude/skills');
  }

  // ==========================================================================
  // Installation
  // ==========================================================================

  /**
   * Install n8n agents and skills
   */
  async install(): Promise<N8nInstallResult> {
    const result: N8nInstallResult = {
      success: true,
      agentsInstalled: [],
      skillsInstalled: [],
      configGenerated: false,
      errors: [],
      agentsDir: join(this.projectRoot, '.claude/agents/n8n'),
      skillsDir: join(this.projectRoot, '.claude/skills'),
    };

    try {
      // Install agents
      if (this.options.installAgents) {
        const agentResult = await this.installAgents(result.agentsDir);
        result.agentsInstalled = agentResult.installed;
        result.errors.push(...agentResult.errors);
      }

      // Install skills
      if (this.options.installSkills) {
        const skillResult = await this.installSkills(result.skillsDir);
        result.skillsInstalled = skillResult.installed;
        result.errors.push(...skillResult.errors);
      }

      // Generate n8n section for config
      if (this.options.n8nApiConfig) {
        result.configGenerated = true;
      }

      // Create agents index
      if (result.agentsInstalled.length > 0) {
        this.createAgentsIndex(result.agentsDir, result.agentsInstalled);
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Installation failed: ${toErrorMessage(error)}`
      );
    }

    return result;
  }

  /**
   * Install n8n agent definitions
   */
  private async installAgents(
    targetDir: string
  ): Promise<{ installed: N8nAgentInfo[]; errors: string[] }> {
    const installed: N8nAgentInfo[] = [];
    const errors: string[] = [];

    // Create target directory
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Check if source exists
    if (!existsSync(this.sourceAgentsDir)) {
      errors.push(`Source agents directory not found: ${this.sourceAgentsDir}`);
      return { installed, errors };
    }

    // Get available agent files
    const availableFiles = readdirSync(this.sourceAgentsDir).filter((f) =>
      f.endsWith('.md')
    );

    // Install each agent
    for (const category of Object.keys(N8N_AGENTS)) {
      for (const agent of N8N_AGENTS[category]) {
        const sourceFile = join(this.sourceAgentsDir, agent.filename);
        const targetFile = join(targetDir, agent.filename);

        // Check if source exists
        if (!availableFiles.includes(agent.filename)) {
          continue; // Skip if not available
        }

        // Check if target exists and overwrite is disabled
        if (existsSync(targetFile) && !this.options.overwrite) {
          continue; // Skip existing
        }

        try {
          // Copy agent file
          copyFileSync(sourceFile, targetFile);

          // Extract description from file
          const content = readFileSync(sourceFile, 'utf-8');
          const descMatch = content.match(/description:\s*["']?(.+?)["']?\n/);
          agent.description = descMatch?.[1] || `n8n ${agent.name} agent`;

          installed.push(agent);
        } catch (error) {
          errors.push(
            `Failed to install ${agent.name}: ${toErrorMessage(error)}`
          );
        }
      }
    }

    return { installed, errors };
  }

  /**
   * Install n8n skills
   */
  private async installSkills(
    targetDir: string
  ): Promise<{ installed: string[]; errors: string[] }> {
    const installed: string[] = [];
    const errors: string[] = [];

    // Create target directory
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Check if source exists
    if (!existsSync(this.sourceSkillsDir)) {
      errors.push(`Source skills directory not found: ${this.sourceSkillsDir}`);
      return { installed, errors };
    }

    // Install each n8n skill
    for (const skillName of N8N_SKILLS) {
      const sourceSkillDir = join(this.sourceSkillsDir, skillName);
      const targetSkillDir = join(targetDir, skillName);

      if (!existsSync(sourceSkillDir)) {
        continue; // Skip if not available
      }

      if (existsSync(targetSkillDir) && !this.options.overwrite) {
        continue; // Skip existing
      }

      try {
        // Copy skill directory
        this.copyDirectory(sourceSkillDir, targetSkillDir);
        installed.push(skillName);
      } catch (error) {
        errors.push(
          `Failed to install skill ${skillName}: ${toErrorMessage(error)}`
        );
      }
    }

    return { installed, errors };
  }

  /**
   * Copy a directory recursively
   */
  private copyDirectory(source: string, target: string): void {
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
    }

    const entries = readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const targetPath = join(target, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        copyFileSync(sourcePath, targetPath);
      }
    }
  }

  /**
   * Create agents index README
   */
  private createAgentsIndex(targetDir: string, agents: N8nAgentInfo[]): void {
    const indexPath = join(targetDir, 'README.md');

    const byCategory = {
      core: agents.filter((a) => a.category === 'core'),
      advanced: agents.filter((a) => a.category === 'advanced'),
      quality: agents.filter((a) => a.category === 'quality'),
      enterprise: agents.filter((a) => a.category === 'enterprise'),
      reliability: agents.filter((a) => a.category === 'reliability'),
    };

    let content = `# N8n Testing Agents

> Auto-generated by \`aqe init --with-n8n\`

## Overview

These agents provide comprehensive testing capabilities for n8n workflow automation.

| Category | Count |
|----------|-------|
| Core | ${byCategory.core.length} |
| Advanced | ${byCategory.advanced.length} |
| Quality | ${byCategory.quality.length} |
| Enterprise | ${byCategory.enterprise.length} |
| Reliability | ${byCategory.reliability.length} |
| **Total** | **${agents.length}** |

## Usage with Claude Code

\`\`\`javascript
// Spawn an n8n agent
Task("Test n8n workflow triggers", "n8n-trigger-test")
Task("Run security audit on workflow", "n8n-security-auditor")
\`\`\`

## Agent Categories

`;

    for (const [category, categoryAgents] of Object.entries(byCategory)) {
      if (categoryAgents.length === 0) continue;

      content += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      for (const agent of categoryAgents) {
        content += `- **${agent.name}**: ${agent.description || 'N8n testing agent'}\n`;
      }
      content += '\n';
    }

    content += `---
Generated: ${new Date().toISOString()}
`;

    writeFileSync(indexPath, content);
  }

  // ==========================================================================
  // Configuration Generation
  // ==========================================================================

  /**
   * Generate n8n configuration section for YAML config
   */
  generateConfigSection(): Record<string, unknown> {
    return {
      n8n: {
        enabled: true,
        installAgents: this.options.installAgents,
        installSkills: this.options.installSkills,
        apiConfig: this.options.n8nApiConfig || null,
      },
    };
  }

  /**
   * Generate CLAUDE.md section for n8n
   */
  generateClaudeMdSection(): string {
    return `
## N8n Workflow Testing

This project includes n8n workflow testing agents. Use them with Claude Code:

\`\`\`javascript
// Security audit
Task("Audit n8n workflow for vulnerabilities", "n8n-security-auditor")

// Performance testing
Task("Run load test on workflow", "n8n-performance-tester")

// Trigger validation
Task("Test webhook triggers", "n8n-trigger-test")

// Expression validation
Task("Validate n8n expressions", "n8n-expression-validator")
\`\`\`

### Available N8n Agents

| Agent | Purpose |
|-------|---------|
| n8n-workflow-executor | Execute and validate workflows |
| n8n-security-auditor | Security vulnerability scanning |
| n8n-performance-tester | Performance benchmarking |
| n8n-trigger-test | Trigger validation |
| n8n-expression-validator | Expression syntax checking |
| n8n-compliance-validator | Regulatory compliance |
| n8n-chaos-tester | Resilience testing |

### V3 Domain Integration

N8n agents map to v3 domains:
- Security agents → security-compliance domain
- Performance agents → test-execution domain
- Compliance agents → security-compliance domain
- Chaos agents → chaos-resilience domain

`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new N8n Installer instance
 */
export function createN8nInstaller(options: N8nInstallerOptions): N8nInstaller {
  return new N8nInstaller(options);
}

/**
 * Quick install function
 */
export async function installN8n(
  projectRoot: string,
  options?: Partial<N8nInstallerOptions>
): Promise<N8nInstallResult> {
  const installer = createN8nInstaller({ projectRoot, ...options });
  return installer.install();
}
