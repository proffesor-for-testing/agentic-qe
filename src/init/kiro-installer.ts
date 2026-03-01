/**
 * Kiro Platform Installer
 * Converts OpenCode YAML agents/skills to Kiro JSON format and generates
 * MCP config, steering files, and hooks for AWS Kiro IDE integration.
 *
 * Follows the OpenCode/N8n installer pattern (ADR-025).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { toErrorMessage } from '../shared/error-utils.js';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

export interface KiroInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Install Kiro agent definitions (default: true) */
  installAgents?: boolean;
  /** Install Kiro skill definitions (default: true) */
  installSkills?: boolean;
  /** Install Kiro hooks (default: true) */
  installHooks?: boolean;
  /** Install steering files (default: true) */
  installSteering?: boolean;
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
}

export interface KiroInstallResult {
  success: boolean;
  agentsInstalled: string[];
  skillsInstalled: string[];
  hooksInstalled: string[];
  steeringInstalled: string[];
  mcpConfigured: boolean;
  errors: string[];
  targetDir: string;
}

interface ParsedYamlAgent {
  name: string;
  description: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];
  permissions?: Record<string, string>;
}

interface ParsedYamlSkill {
  name: string;
  description: string;
  minModelTier?: string;
  tags?: string[];
  steps?: Array<{ name: string; description: string; tools?: string[]; prompt?: string }>;
}

// ============================================================================
// Kiro Installer Class
// ============================================================================

export class KiroInstaller {
  private projectRoot: string;
  private options: Required<
    Pick<KiroInstallerOptions, 'installAgents' | 'installSkills' | 'installHooks' | 'installSteering' | 'overwrite'>
  > &
    KiroInstallerOptions;
  private openCodeDir: string;

  constructor(options: KiroInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.options = {
      installAgents: true,
      installSkills: true,
      installHooks: true,
      installSteering: true,
      overwrite: false,
      ...options,
    };
    this.openCodeDir = this.findOpenCodeDir();
  }

  // ==========================================================================
  // Source Directory Detection
  // ==========================================================================

  private findOpenCodeDir(): string {
    const possiblePaths = [
      join(__dirname, '../../.opencode'),
      join(process.cwd(), '.opencode'),
      join(process.cwd(), '.opencode'),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return join(process.cwd(), '.opencode');
  }

  // ==========================================================================
  // Installation
  // ==========================================================================

  async install(): Promise<KiroInstallResult> {
    const targetDir = join(this.projectRoot, '.kiro');
    const result: KiroInstallResult = {
      success: true,
      agentsInstalled: [],
      skillsInstalled: [],
      hooksInstalled: [],
      steeringInstalled: [],
      mcpConfigured: false,
      errors: [],
      targetDir,
    };

    try {
      // MCP config is always installed (core integration)
      result.mcpConfigured = this.installMcpConfig(targetDir);

      // Convert OpenCode agents → Kiro agents
      if (this.options.installAgents) {
        const agentResult = this.installAgents(targetDir);
        result.agentsInstalled = agentResult.installed;
        result.errors.push(...agentResult.errors);
      }

      // Convert OpenCode skills → Kiro SKILL.md files
      if (this.options.installSkills) {
        const skillResult = this.installSkills(targetDir);
        result.skillsInstalled = skillResult.installed;
        result.errors.push(...skillResult.errors);
      }

      // Generate Kiro hooks
      if (this.options.installHooks) {
        const hookResult = this.installHooks(targetDir);
        result.hooksInstalled = hookResult.installed;
        result.errors.push(...hookResult.errors);
      }

      // Generate steering files
      if (this.options.installSteering) {
        const steeringResult = this.installSteering(targetDir);
        result.steeringInstalled = steeringResult.installed;
        result.errors.push(...steeringResult.errors);
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Kiro installation failed: ${toErrorMessage(error)}`);
    }

    return result;
  }

  // ==========================================================================
  // MCP Configuration
  // ==========================================================================

  private installMcpConfig(targetDir: string): boolean {
    const settingsDir = join(targetDir, 'settings');
    const configPath = join(settingsDir, 'mcp.json');

    if (existsSync(configPath) && !this.options.overwrite) {
      return false;
    }

    mkdirSync(settingsDir, { recursive: true });

    const config = {
      mcpServers: {
        'agentic-qe': {
          command: 'npx',
          args: ['-y', 'agentic-qe@latest', 'mcp'],
          env: {
            AQE_MEMORY_PATH: '.agentic-qe/memory.db',
            AQE_V3_MODE: 'true',
          },
          disabled: false,
          autoApprove: [
            'fleet_init',
            'fleet_status',
            'test_generate_enhanced',
            'coverage_analyze_sublinear',
            'quality_assess',
            'memory_store',
            'memory_query',
          ],
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return true;
  }

  // ==========================================================================
  // Agent Conversion: OpenCode YAML → Kiro JSON
  // ==========================================================================

  private installAgents(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const sourceDir = join(this.openCodeDir, 'agents');
    const targetAgentsDir = join(targetDir, 'agents');

    if (!existsSync(sourceDir)) {
      // No OpenCode agents to convert — generate a default QE agent
      mkdirSync(targetAgentsDir, { recursive: true });
      this.writeDefaultQEAgent(targetAgentsDir);
      installed.push('qe-specialist');
      return { installed, errors };
    }

    mkdirSync(targetAgentsDir, { recursive: true });

    const files = readdirSync(sourceDir).filter(f => f.endsWith('.yaml'));

    for (const file of files) {
      const name = file.replace('.yaml', '');
      const targetFile = join(targetAgentsDir, `${name}.json`);

      if (existsSync(targetFile) && !this.options.overwrite) {
        continue;
      }

      try {
        const yaml = readFileSync(join(sourceDir, file), 'utf-8');
        const parsed = this.parseYamlAgent(yaml);
        const kiroAgent = this.convertToKiroAgent(parsed);
        writeFileSync(targetFile, JSON.stringify(kiroAgent, null, 2) + '\n');
        installed.push(name);
      } catch (error) {
        errors.push(`Failed to convert agent ${file}: ${toErrorMessage(error)}`);
      }
    }

    // Phase 2: Convert QE-relevant subagents from .claude/agents/ (markdown format)
    const claudeAgentsDir = join(this.options.projectRoot, '.claude', 'agents');
    if (existsSync(claudeAgentsDir)) {
      const qeSubagentDirs = ['subagents', 'n8n', 'testing', 'analysis'];
      for (const subdir of qeSubagentDirs) {
        const dirPath = join(claudeAgentsDir, subdir);
        if (!existsSync(dirPath)) continue;

        const mdFiles = readdirSync(dirPath, { recursive: false })
          .filter((f): f is string => typeof f === 'string' && f.endsWith('.md') && f !== 'README.md');

        for (const file of mdFiles) {
          const name = file.replace('.md', '');
          const targetFile = join(targetAgentsDir, `${name}.json`);

          // Skip if already exists (OpenCode agent takes precedence)
          if (existsSync(targetFile) && !this.options.overwrite) continue;

          try {
            const content = readFileSync(join(dirPath, file), 'utf-8');
            const kiroAgent = this.convertMdAgentToKiro(content, name);
            if (kiroAgent) {
              writeFileSync(targetFile, JSON.stringify(kiroAgent, null, 2) + '\n');
              installed.push(name);
            }
          } catch (error) {
            errors.push(`Failed to convert subagent ${file}: ${toErrorMessage(error)}`);
          }
        }
      }
    }

    return { installed, errors };
  }

  /**
   * Convert a Claude Code markdown agent (.md) to Kiro JSON format.
   * These have YAML frontmatter + XML-structured prompt body.
   */
  private convertMdAgentToKiro(content: string, name: string): Record<string, unknown> | null {
    // Extract YAML frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) return null;

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();

    const getField = (key: string): string => {
      const re = new RegExp(`^${key}:\\s*"?([^"\n]*)"?`, 'm');
      const m = frontmatter.match(re);
      return m?.[1]?.trim() ?? '';
    };

    const agentName = getField('name') || name;
    const description = getField('description') || `QE subagent: ${name}`;

    // Convert mcp: references in the prompt body
    const prompt = body.replace(/mcp:agentic-qe:/g, '@agentic-qe/');

    // Map model from frontmatter, falling back to category/priority heuristics
    const rawModel = getField('model');
    const priority = getField('priority');
    let model = 'claude-sonnet-4';
    if (rawModel) {
      if (rawModel.includes('opus')) model = 'claude-opus-4';
      else if (rawModel.includes('haiku')) model = 'claude-haiku-4';
    } else if (priority === 'critical') {
      model = 'claude-sonnet-4';
    }

    return {
      name: agentName,
      description,
      model,
      prompt,
      mcpServers: {
        'agentic-qe': {
          command: 'npx',
          args: ['-y', 'agentic-qe@latest', 'mcp'],
        },
      },
      tools: ['read', 'write', 'shell', '@agentic-qe'],
      includeMcpJson: true,
    };
  }

  private parseYamlAgent(yaml: string): ParsedYamlAgent {
    const get = (key: string): string => {
      // Match key at start of line (not indented — top-level only)
      const re = new RegExp(`^${key}:\\s*(?:"([^"]*)"|(.*))`, 'm');
      const m = yaml.match(re);
      return m ? (m[1] ?? m[2] ?? '').trim() : '';
    };

    // Extract systemPrompt (multiline block after "systemPrompt: |")
    let systemPrompt = '';
    const promptMatch = yaml.match(/^systemPrompt:\s*\|\s*\n([\s\S]*?)(?=\n\w|\n$)/m);
    if (promptMatch) {
      systemPrompt = promptMatch[1]
        .split('\n')
        .map(l => l.replace(/^ {2}/, ''))
        .join('\n')
        .trim();
    }

    // Extract tools list
    const tools: string[] = [];
    const toolsMatch = yaml.match(/^tools:\s*\n((?:\s+-\s+.*\n?)*)/m);
    if (toolsMatch) {
      const lines = toolsMatch[1].split('\n');
      for (const line of lines) {
        const tm = line.match(/^\s+-\s+"?([^"\n]+)"?/);
        if (tm) tools.push(tm[1].trim());
      }
    }

    // Extract permissions
    const permissions: Record<string, string> = {};
    const permMatch = yaml.match(/^permissions:\s*\n((?:\s+.*\n?)*)/m);
    if (permMatch) {
      const lines = permMatch[1].split('\n');
      for (const line of lines) {
        const pm = line.match(/^\s+"?([^":]+)"?\s*:\s*(\w+)/);
        if (pm) permissions[pm[1].trim()] = pm[2].trim();
      }
    }

    return {
      name: get('name'),
      description: get('description'),
      model: get('model') || undefined,
      systemPrompt: systemPrompt || undefined,
      tools,
      permissions,
    };
  }

  private convertToKiroAgent(agent: ParsedYamlAgent): Record<string, unknown> {
    // Map Claude Code tool names to Kiro equivalents, then convert MCP refs
    const toolNameMap: Record<string, string> = {
      'bash': 'shell', 'edit': 'write', 'grep': 'shell', 'glob': 'shell',
    };
    const kiroTools = [...new Set(agent.tools?.map(t => {
      if (t.startsWith('mcp:agentic-qe:')) {
        return `@agentic-qe/${t.replace('mcp:agentic-qe:', '')}`;
      }
      return toolNameMap[t] ?? t;
    }) ?? [])];

    // Build allowedTools from permissions, mapping Claude Code names to Kiro equivalents
    const allowedToolsSet = new Set<string>();
    if (agent.permissions) {
      for (const [key, value] of Object.entries(agent.permissions)) {
        if (value === 'allow') {
          if (key.startsWith('mcp:agentic-qe:')) {
            allowedToolsSet.add(`@agentic-qe/${key.replace('mcp:agentic-qe:', '')}`);
          } else {
            allowedToolsSet.add(toolNameMap[key] ?? key);
          }
        }
      }
    }
    const allowedTools = [...allowedToolsSet];

    // Map model names
    let model = 'claude-sonnet-4';
    if (agent.model) {
      if (agent.model.includes('opus')) model = 'claude-opus-4';
      else if (agent.model.includes('haiku')) model = 'claude-haiku-4';
    }

    // Convert mcp:agentic-qe: references in prompt text to Kiro @agentic-qe/ format
    const rawPrompt = agent.systemPrompt ?? `You are ${agent.name}, a specialized QE agent in the Agentic QE v3 platform.`;
    const prompt = rawPrompt.replace(/mcp:agentic-qe:/g, '@agentic-qe/');

    const kiroAgent: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
      model,
      prompt,
      mcpServers: {
        'agentic-qe': {
          command: 'npx',
          args: ['-y', 'agentic-qe@latest', 'mcp'],
        },
      },
      tools: kiroTools.length > 0 ? kiroTools : ['read', 'write', 'shell', '@agentic-qe'],
      includeMcpJson: true,
    };

    if (allowedTools.length > 0) {
      kiroAgent.allowedTools = allowedTools;
    }

    return kiroAgent;
  }

  private writeDefaultQEAgent(targetDir: string): void {
    const agent = {
      name: 'qe-specialist',
      description: 'Quality Engineering specialist powered by Agentic QE',
      model: 'claude-sonnet-4',
      prompt: 'You are a QE specialist. Use AQE tools for test generation, coverage analysis, and quality assessment. Always call fleet_init before other AQE tools.',
      mcpServers: {
        'agentic-qe': {
          command: 'npx',
          args: ['-y', 'agentic-qe@latest', 'mcp'],
        },
      },
      tools: ['read', 'write', 'shell', '@agentic-qe'],
      allowedTools: ['read', 'write', 'shell', '@agentic-qe/*'],
      includeMcpJson: true,
      welcomeMessage: 'QE Agent ready. I can generate tests, analyze coverage, and assess quality.',
    };

    writeFileSync(join(targetDir, 'qe-specialist.json'), JSON.stringify(agent, null, 2) + '\n');
  }

  // ==========================================================================
  // Skill Conversion: Claude Code SKILL.md → Kiro SKILL.md (full content)
  // Falls back to OpenCode YAML → Kiro SKILL.md for skills without Claude source
  // ==========================================================================

  private installSkills(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const targetSkillsDir = join(targetDir, 'skills');
    const claudeSkillsDir = join(this.options.projectRoot, '.claude', 'skills');
    const openCodeSkillsDir = join(this.openCodeDir, 'skills');

    mkdirSync(targetSkillsDir, { recursive: true });

    // Build a set of OpenCode skill names to convert
    const openCodeSkills = new Set<string>();
    if (existsSync(openCodeSkillsDir)) {
      for (const f of readdirSync(openCodeSkillsDir).filter(f => f.endsWith('.yaml'))) {
        openCodeSkills.add(f.replace('.yaml', ''));
      }
    }

    // For each OpenCode skill, try Claude Code source first (full content)
    for (const skillName of openCodeSkills) {
      const kiroSkillDir = join(targetSkillsDir, skillName);
      const targetFile = join(kiroSkillDir, 'SKILL.md');

      if (existsSync(targetFile) && !this.options.overwrite) {
        continue;
      }

      try {
        // Try Claude Code source (full rich content)
        const claudeSource = this.findClaudeSkillSource(claudeSkillsDir, skillName);
        if (claudeSource) {
          const kiroMd = this.convertClaudeSkillToKiro(claudeSource, skillName);
          mkdirSync(kiroSkillDir, { recursive: true });
          writeFileSync(targetFile, kiroMd, { mode: 0o644 });
          installed.push(skillName);
        } else {
          // Fallback: convert from OpenCode YAML (thin content)
          const yamlPath = join(openCodeSkillsDir, `${skillName}.yaml`);
          if (existsSync(yamlPath)) {
            const yaml = readFileSync(yamlPath, 'utf-8');
            const parsed = this.parseYamlSkill(yaml);
            const markdown = this.convertToSkillMd(parsed);
            mkdirSync(kiroSkillDir, { recursive: true });
            writeFileSync(targetFile, markdown, { mode: 0o644 });
            installed.push(skillName);
          }
        }
      } catch (error) {
        errors.push(`Failed to convert skill ${skillName}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  /**
   * Find the Claude Code source SKILL.md for a given OpenCode skill name.
   * OpenCode skills use `qe-` prefix; Claude Code may use bare name or `qe-` prefix.
   */
  private findClaudeSkillSource(claudeSkillsDir: string, skillName: string): string | null {
    if (!existsSync(claudeSkillsDir)) return null;

    // Try direct match: qe-database-testing -> .claude/skills/qe-database-testing/SKILL.md
    const directPath = join(claudeSkillsDir, skillName, 'SKILL.md');
    if (existsSync(directPath)) return readFileSync(directPath, 'utf-8');

    // Try without qe- prefix: qe-database-testing -> .claude/skills/database-testing/SKILL.md
    const bareName = skillName.replace(/^qe-/, '');
    const barePath = join(claudeSkillsDir, bareName, 'SKILL.md');
    if (existsSync(barePath)) return readFileSync(barePath, 'utf-8');

    // Try QCSD skills: qcsd-ideation-swarm -> .claude/skills/qcsd-ideation-swarm/SKILL.md
    if (skillName.startsWith('qcsd-')) {
      const qcsdPath = join(claudeSkillsDir, skillName, 'SKILL.md');
      if (existsSync(qcsdPath)) return readFileSync(qcsdPath, 'utf-8');
    }

    return null;
  }

  /**
   * Convert a Claude Code SKILL.md to Kiro format:
   * - Replace frontmatter with Kiro-compatible fields (inclusion, name, description)
   * - Keep the full markdown body content intact
   * - Convert mcp:agentic-qe: references to @agentic-qe/ format
   */
  private convertClaudeSkillToKiro(claudeContent: string, skillName: string): string {
    // Extract frontmatter and body
    const fmMatch = claudeContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) {
      // No frontmatter — wrap the entire content
      return `---\ninclusion: auto\nname: ${skillName}\ndescription: AQE skill\n---\n\n${claudeContent}`;
    }

    const frontmatter = fmMatch[1];
    let body = fmMatch[2];

    // Extract name and description from original frontmatter
    const nameMatch = frontmatter.match(/^name:\s*(.+)/m);
    const descMatch = frontmatter.match(/^description:\s*"?([^"\n]*)"?/m);
    const tagsMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m);

    const description = descMatch?.[1]?.trim() ?? '';
    const tags = tagsMatch?.[1]?.trim() ?? '';

    // Build Kiro frontmatter (agentskills.io compatible)
    const kiroFrontmatter = [
      '---',
      'inclusion: auto',
      `name: ${skillName}`,
      `description: "${description}"`,
      tags ? `tags: [${tags}]` : '',
      '---',
    ].filter(Boolean).join('\n');

    // Convert mcp:agentic-qe: references to @agentic-qe/ in body
    body = body.replace(/mcp:agentic-qe:/g, '@agentic-qe/');

    // Remove Claude Code-specific directives that Kiro won't understand
    // (keep <default_to_action> blocks — they're useful instructions)

    return `${kiroFrontmatter}\n${body}`;
  }

  private parseYamlSkill(yaml: string): ParsedYamlSkill {
    const get = (key: string): string => {
      const re = new RegExp(`^${key}:\\s*(?:"([^"]*)"|(.*))`, 'm');
      const m = yaml.match(re);
      return m ? (m[1] ?? m[2] ?? '').trim() : '';
    };

    // Extract tags
    const tags: string[] = [];
    const tagsMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m);
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(',').map(t => t.trim().replace(/^"|"$/g, '')));
    }

    // Extract steps — split on `  - name:` boundaries, capture description + full prompt
    const steps: ParsedYamlSkill['steps'] = [];
    const stepsMatch = yaml.match(/^steps:\s*\n([\s\S]*)$/m);
    if (stepsMatch) {
      // Split into individual step blocks on the `- name:` delimiter
      const rawBlocks = stepsMatch[1].split(/\n\s*-\s+name:\s*/);
      for (const block of rawBlocks) {
        if (!block.trim()) continue;
        // First line of the block is the step name
        const nameMatch = block.match(/^([^\n]+)/);
        if (!nameMatch) continue;
        const rawName = nameMatch[1].trim();
        // Clean step name: remove leading `- name:` residue and YAML artifacts
        const cleanName = rawName.replace(/^-\s*name:\s*/, '').replace(/^["']|["']$/g, '');

        const descMatch = block.match(/description:\s*"([^"]*)"/);
        const description = descMatch?.[1]?.trim() ?? '';

        // Capture multi-line prompt content (everything indented after `prompt: |`)
        let prompt = '';
        const promptMatch = block.match(/prompt:\s*\|\s*\n([\s\S]*?)(?=\n\s+-\s+name:|\n\s*$|$)/);
        if (promptMatch) {
          prompt = promptMatch[1]
            .split('\n')
            .map(l => l.replace(/^ {4,6}/, ''))
            .join('\n')
            .trim();
        }

        steps.push({ name: cleanName, description, prompt });
      }
    }

    return {
      name: get('name'),
      description: get('description'),
      minModelTier: get('minModelTier') || undefined,
      tags,
      steps,
    };
  }

  private convertToSkillMd(skill: ParsedYamlSkill): string {
    const lines: string[] = [];

    // YAML front matter for Kiro skill discovery
    lines.push('---');
    lines.push('inclusion: auto');
    lines.push(`name: ${skill.name}`);
    lines.push(`description: ${skill.description}`);
    lines.push('---');
    lines.push('');
    lines.push(`# ${skill.name}`);
    lines.push('');
    lines.push(skill.description);
    lines.push('');

    if (skill.tags && skill.tags.length > 0) {
      lines.push(`**Tags:** ${skill.tags.join(', ')}`);
      lines.push('');
    }

    lines.push('## Prerequisites');
    lines.push('');
    lines.push('This skill requires the AQE MCP server. Ensure it is configured in `.kiro/settings/mcp.json`.');
    lines.push('');

    if (skill.steps && skill.steps.length > 0) {
      lines.push('## Steps');
      lines.push('');
      for (let i = 0; i < skill.steps.length; i++) {
        const step = skill.steps[i];
        // Format step name: convert kebab-case to Title Case, strip leading numbering
        const displayName = step.name
          .replace(/^[-\d]+\s*/, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`### ${i + 1}. ${displayName}`);
        lines.push('');
        // Use description as body; fall back to prompt if description is just a title
        const body = step.description && step.description.length > step.name.length
          ? step.description
          : step.prompt && step.prompt.length > step.name.length
            ? step.prompt
            : step.description || step.prompt || '';
        if (body) {
          lines.push(body);
          lines.push('');
        }
      }
    }

    lines.push('## MCP Tools');
    lines.push('');
    lines.push('Use AQE tools via the `@agentic-qe` MCP server:');
    lines.push('');
    lines.push('- `@agentic-qe/fleet_init` — Initialize the QE fleet');
    lines.push('- `@agentic-qe/test_generate_enhanced` — Generate tests');
    lines.push('- `@agentic-qe/coverage_analyze_sublinear` — Analyze coverage');
    lines.push('- `@agentic-qe/quality_assess` — Assess quality gates');
    lines.push('- `@agentic-qe/memory_store` — Store learned patterns');
    lines.push('- `@agentic-qe/memory_query` — Query past patterns');
    lines.push('');

    return lines.join('\n');
  }

  // ==========================================================================
  // Hooks Generation
  // ==========================================================================

  private installHooks(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const hooksDir = join(targetDir, 'hooks');

    mkdirSync(hooksDir, { recursive: true });

    const hooks = this.getKiroHooks();

    for (const hook of hooks) {
      const filePath = join(hooksDir, hook.filename);

      if (existsSync(filePath) && !this.options.overwrite) {
        continue;
      }

      try {
        writeFileSync(filePath, JSON.stringify(hook.config, null, 2) + '\n');
        installed.push(hook.filename);
      } catch (error) {
        errors.push(`Failed to install hook ${hook.filename}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  private getKiroHooks(): Array<{ filename: string; config: Record<string, unknown> }> {
    return [
      {
        filename: 'aqe-test-updater.kiro.hook',
        config: {
          name: 'AQE Test Updater',
          description: 'Auto-generate or update tests when source files change',
          version: '1',
          when: {
            type: 'fileEdited',
            patterns: ['src/**/*.ts', 'src/**/*.js', '!**/*.test.*', '!**/*.spec.*', '!**/node_modules/**'],
          },
          then: {
            type: 'askAgent',
            prompt:
              'A source file was edited. Use @agentic-qe/test_generate_enhanced to check if corresponding tests need updating. Only update tests if the public API changed.',
          },
        },
      },
      {
        filename: 'aqe-coverage-check.kiro.hook',
        config: {
          name: 'AQE Coverage Check',
          description: 'Run coverage analysis after test files are created or edited',
          version: '1',
          when: {
            type: 'fileEdited',
            patterns: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],
          },
          then: {
            type: 'askAgent',
            prompt:
              'A test file was modified. Use @agentic-qe/coverage_analyze_sublinear to check if coverage targets are still met. Report any gaps.',
          },
        },
      },
      {
        filename: 'aqe-spec-quality-gate.kiro.hook',
        config: {
          name: 'AQE Spec Quality Gate',
          description: 'Run quality assessment after each spec task completes',
          version: '1',
          when: {
            type: 'postSpecTask',
          },
          then: {
            type: 'askAgent',
            prompt:
              'A spec task just completed. Use @agentic-qe/quality_assess on the files changed by this task. If coverage drops below 80% or quality gates fail, flag it before moving to the next task.',
          },
        },
      },
      {
        filename: 'aqe-security-scan.kiro.hook',
        config: {
          name: 'AQE Security Scan',
          description: 'Run security scan when security-sensitive files change',
          version: '1',
          when: {
            type: 'fileEdited',
            patterns: ['**/auth/**', '**/security/**', '**/middleware/**', '**/*credential*', '**/*secret*'],
          },
          then: {
            type: 'askAgent',
            prompt:
              'A security-sensitive file was modified. Use @agentic-qe/security_scan_comprehensive to check for vulnerabilities. Flag any OWASP Top 10 issues.',
          },
        },
      },
      {
        filename: 'aqe-pre-commit-quality.kiro.hook',
        config: {
          name: 'AQE Pre-Commit Quality',
          description: 'Run quality assessment before agent stops to ensure standards are met',
          version: '1',
          when: {
            type: 'agentStop',
          },
          then: {
            type: 'askAgent',
            prompt:
              'Before finishing, use @agentic-qe/quality_assess to verify all modified files meet quality standards. Store the result with @agentic-qe/memory_store for learning.',
          },
        },
      },
    ];
  }

  // ==========================================================================
  // Steering Files
  // ==========================================================================

  private installSteering(targetDir: string): { installed: string[]; errors: string[] } {
    const installed: string[] = [];
    const errors: string[] = [];
    const steeringDir = join(targetDir, 'steering');

    mkdirSync(steeringDir, { recursive: true });

    const files = this.getSteeringFiles();

    for (const file of files) {
      const filePath = join(steeringDir, file.filename);

      if (existsSync(filePath) && !this.options.overwrite) {
        continue;
      }

      try {
        writeFileSync(filePath, file.content);
        installed.push(file.filename);
      } catch (error) {
        errors.push(`Failed to install steering file ${file.filename}: ${toErrorMessage(error)}`);
      }
    }

    return { installed, errors };
  }

  private getSteeringFiles(): Array<{ filename: string; content: string }> {
    return [
      {
        filename: 'qe-standards.md',
        content: `---
inclusion: auto
name: qe-standards
description: Quality engineering standards and practices. Triggered when discussing tests, coverage, quality gates, or code review.
---

# Quality Engineering Standards (AQE v3)

## Test Generation
- Use \`@agentic-qe/test_generate_enhanced\` for AI-powered test creation
- Follow the test pyramid: 70% unit, 20% integration, 10% e2e
- Use boundary value analysis and equivalence partitioning
- Always call \`@agentic-qe/fleet_init\` before using other AQE tools

## Coverage Analysis
- Use \`@agentic-qe/coverage_analyze_sublinear\` for O(log n) gap detection
- Target: 80% statement coverage minimum
- Focus on risk-weighted coverage, not just line counts

## Quality Gates
- Use \`@agentic-qe/quality_assess\` before marking tasks complete
- Gates: coverage threshold, complexity limits, security scan pass
- Store results with \`@agentic-qe/memory_store\` for pattern learning

## Learning
- Query past patterns with \`@agentic-qe/memory_query\` before starting work
- Store successful patterns after task completion
- Use namespace \`aqe/learning/patterns/\` for pattern storage
`,
      },
      {
        filename: 'testing-conventions.md',
        content: `---
inclusion: fileMatch
name: testing-conventions
description: Testing conventions for test files
fileMatchPattern: "**/*.test.{ts,js,tsx,jsx}"
---

# Testing Conventions

## Structure
- Use Arrange-Act-Assert (AAA) pattern
- One logical assertion per test
- Descriptive names: \`should_returnValue_when_condition\`

## Frameworks
- Unit tests: Vitest or Jest
- Integration tests: Vitest with real dependencies
- E2E tests: Playwright

## Mocking
- Mock external dependencies at system boundaries
- Prefer dependency injection over module mocking
- Never mock the system under test
`,
      },
    ];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createKiroInstaller(options: KiroInstallerOptions): KiroInstaller {
  return new KiroInstaller(options);
}
