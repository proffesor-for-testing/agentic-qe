/**
 * generate-opencode-agents.ts
 *
 * Reads all .claude/skills/SKILL.md files and generates .opencode/agents/qe-{name}.yaml
 * configs for the OpenCode platform.
 *
 * Usage: npx tsx scripts/generate-opencode-agents.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface SkillFrontmatter {
  name: string;
  description: string;
  domain?: string;
  category?: string;
  trust_tier: number;
  tags?: string[];
  agents?: string[];
}

interface AgentConfig {
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  permissions: Record<string, string>;
}

// Platform infrastructure skills to exclude (not AQE skills)
const EXCLUDED_PREFIXES = [
  'v3-',
  'flow-nexus-',
  'agentdb-',
  'reasoningbank-',
  'swarm-',
  'hive-mind-',
  'hooks-',
];

// Map trust_tier to model selection
function tierToModel(tier: number): string {
  switch (tier) {
    case 0:
    case 1:
      return 'claude-haiku-3-5';
    case 2:
      return 'claude-sonnet-4-6';
    case 3:
      return 'claude-sonnet-4-6';
    default:
      return 'claude-sonnet-4-6';
  }
}

// Map skill domain/tags to relevant MCP tools
function mapToolsFromTags(tags: string[], name: string): string[] {
  const baseTools = ['read', 'edit', 'bash', 'grep', 'glob'];
  const mcpTools = new Set<string>();

  // Always include memory tools for learning
  mcpTools.add('mcp:agentic-qe:memory_store');
  mcpTools.add('mcp:agentic-qe:memory_query');

  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const nameLower = name.toLowerCase();

  // Security-related
  if (
    tagSet.has('security') ||
    tagSet.has('owasp') ||
    tagSet.has('sast') ||
    tagSet.has('dast') ||
    nameLower.includes('security')
  ) {
    mcpTools.add('mcp:agentic-qe:security_scan_comprehensive');
  }

  // Testing/test generation
  if (
    tagSet.has('tdd') ||
    tagSet.has('testing') ||
    tagSet.has('test-design') ||
    nameLower.includes('test')
  ) {
    mcpTools.add('mcp:agentic-qe:test_generate_enhanced');
    mcpTools.add('mcp:agentic-qe:test_execute_parallel');
  }

  // Coverage
  if (tagSet.has('coverage') || nameLower.includes('coverage')) {
    mcpTools.add('mcp:agentic-qe:coverage_analyze_sublinear');
  }

  // Quality
  if (
    tagSet.has('quality') ||
    tagSet.has('code-review') ||
    nameLower.includes('quality') ||
    nameLower.includes('review')
  ) {
    mcpTools.add('mcp:agentic-qe:quality_assess');
  }

  // API/Contract
  if (tagSet.has('api') || tagSet.has('contract') || tagSet.has('pact')) {
    mcpTools.add('mcp:agentic-qe:contract_validate');
  }

  // Performance
  if (tagSet.has('performance') || tagSet.has('load-testing') || nameLower.includes('performance')) {
    mcpTools.add('mcp:agentic-qe:quality_assess');
  }

  // Defect/debugging
  if (
    tagSet.has('defect') ||
    nameLower.includes('defect') ||
    nameLower.includes('debug')
  ) {
    mcpTools.add('mcp:agentic-qe:defect_predict');
    mcpTools.add('mcp:agentic-qe:code_index');
  }

  // Accessibility
  if (tagSet.has('accessibility') || tagSet.has('a11y') || tagSet.has('wcag')) {
    mcpTools.add('mcp:agentic-qe:accessibility_test');
  }

  // Chaos
  if (tagSet.has('chaos') || tagSet.has('resilience')) {
    mcpTools.add('mcp:agentic-qe:chaos_test');
  }

  // Compliance
  if (tagSet.has('compliance') || tagSet.has('gdpr') || tagSet.has('hipaa')) {
    mcpTools.add('mcp:agentic-qe:security_scan_comprehensive');
  }

  return [...baseTools, ...Array.from(mcpTools)];
}

function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: any = {};

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((s: string) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    } else if (key === 'trust_tier') {
      result[key] = parseInt(value, 10);
    } else {
      result[key] = value;
    }
  }

  return result as SkillFrontmatter;
}

function extractFirstParagraph(content: string): string {
  // Get content after frontmatter and first heading
  const afterFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '');
  const lines = afterFrontmatter.split('\n');
  const paragraphs: string[] = [];

  let inParagraph = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('<') || trimmed.startsWith('```')) {
      if (inParagraph) break;
      continue;
    }
    if (trimmed === '') {
      if (inParagraph) break;
      continue;
    }
    inParagraph = true;
    paragraphs.push(trimmed);
  }

  return paragraphs.join(' ').slice(0, 500);
}

function generateAgentYaml(config: AgentConfig): string {
  const toolsList = config.tools.map((t) => `  - "${t}"`).join('\n');
  const permsList = Object.entries(config.permissions)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  return `name: ${config.name}
description: "${config.description}"
model: "${config.model}"
systemPrompt: |
  ${config.systemPrompt.replace(/\n/g, '\n  ')}

  Available MCP tools from agentic-qe server are listed in the tools section below.
  Always store findings and patterns in memory using mcp:agentic-qe:memory_store for learning.
  Query past patterns using mcp:agentic-qe:memory_query before starting work.
tools:
${toolsList}
permissions:
${permsList}
`;
}

function isExcluded(name: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

async function main(): Promise<void> {
  const skillsDir = path.resolve(__dirname, '../.claude/skills');
  const outputDir = path.resolve(__dirname, '../.opencode/agents');

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  let generated = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isExcluded(entry.name)) {
      skipped++;
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      skipped++;
      continue;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || !frontmatter.name) {
      skipped++;
      continue;
    }

    const safeName = entry.name.replace(/[^a-z0-9-]/g, '-');
    const description = frontmatter.description || extractFirstParagraph(content);
    const tags = frontmatter.tags ?? [];
    const tools = mapToolsFromTags(tags, frontmatter.name);
    const model = tierToModel(frontmatter.trust_tier ?? 2);

    // Build system prompt from description and first paragraph
    const briefInstructions = extractFirstParagraph(content);
    const systemPrompt = `You are a specialized QE agent for ${frontmatter.name}.
${description}

${briefInstructions}`;

    const config: AgentConfig = {
      name: `qe-${safeName}`,
      description: description.slice(0, 200),
      model,
      systemPrompt,
      tools,
      permissions: {
        read: 'allow',
        grep: 'allow',
        glob: 'allow',
        edit: 'ask',
        bash: 'ask',
        '"mcp:agentic-qe:*"': 'allow',
      },
    };

    const yaml = generateAgentYaml(config);
    const outputPath = path.join(outputDir, `qe-${safeName}.yaml`);
    fs.writeFileSync(outputPath, yaml, 'utf-8');
    generated++;
  }

  console.log(`Agent generation complete: ${generated} generated, ${skipped} skipped`);
  console.log(`Output directory: ${outputDir}`);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
