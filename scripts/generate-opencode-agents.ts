/**
 * generate-opencode-agents.ts
 *
 * Reads all .claude/agents/v3/*.md agent definitions and generates
 * .opencode/agents/{name}.yaml configs for the OpenCode platform.
 *
 * Agent .md files use YAML frontmatter + optional XML-tagged sections
 * (<qe_agent_definition>) or markdown body for non-XML agents.
 *
 * Usage: npx tsx scripts/generate-opencode-agents.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface AgentFrontmatter {
  name: string;
  description: string;
  domain?: string;
  capabilities?: string[];
}

interface AgentConfig {
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  permissions: Record<string, string>;
}

// Platform infrastructure agents to exclude (not QE agents)
const EXCLUDED_PREFIXES = [
  'v3-',
  'adr-',
  'claims-',
  'sparc-',
  'reasoningbank-',
  'swarm-memory-',
];

// Non-qe agent filenames that ARE QE-relevant and should be included
const INCLUDED_NON_QE = new Set([
  'collective-intelligence-coordinator',
  'ddd-domain-expert',
  'memory-specialist',
  'performance-engineer',
  'security-architect',
  'security-auditor',
]);

function isIncluded(basename: string): boolean {
  // Skip README
  if (basename === 'README') return false;

  // Include all qe-* agents
  if (basename.startsWith('qe-')) return true;

  // Include specific non-qe agents
  if (INCLUDED_NON_QE.has(basename)) return true;

  // Exclude platform infrastructure
  if (EXCLUDED_PREFIXES.some((p) => basename.startsWith(p))) return false;

  // Exclude anything else not in the include list
  return false;
}

function parseFrontmatter(content: string): AgentFrontmatter | null {
  // Normalize CRLF to LF before parsing
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  let currentArrayKey: string | null = null;
  const arrayValues: string[] = [];

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item continuation
    if (trimmed.startsWith('- ') && currentArrayKey) {
      arrayValues.push(trimmed.slice(2).trim().replace(/['"]/g, ''));
      continue;
    }

    // Flush previous array
    if (currentArrayKey && arrayValues.length > 0) {
      result[currentArrayKey] = [...arrayValues];
      currentArrayKey = null;
      arrayValues.length = 0;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Inline array
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((s: string) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    } else if (value === '' || value === '|') {
      // Possible multi-line array starting next line
      currentArrayKey = key;
    } else {
      result[key] = value;
    }
  }

  // Flush final array
  if (currentArrayKey && arrayValues.length > 0) {
    result[currentArrayKey] = [...arrayValues];
  }

  return result as unknown as AgentFrontmatter;
}

/** Extract content of an XML section like <identity>...</identity> */
function extractXmlSection(content: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const match = content.match(regex);
  if (!match) return null;
  return match[1].trim();
}

/** Extract the first meaningful paragraph after frontmatter (for non-XML agents) */
function extractFirstParagraph(content: string): string {
  const afterFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '');
  const lines = afterFrontmatter.split('\n');
  const paragraphs: string[] = [];

  let inParagraph = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (inParagraph) break;
      continue;
    }
    if (trimmed.startsWith('```') || trimmed.startsWith('<') || trimmed.startsWith('|')) {
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

  return paragraphs.join(' ').slice(0, 800);
}

/** Extract markdown sections (## headers) for non-XML agents */
function extractMarkdownSections(content: string): Map<string, string> {
  const afterFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '');
  const sections = new Map<string, string>();
  const regex = /^##\s+(.+)/gm;
  const headers: Array<{ title: string; start: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(afterFrontmatter)) !== null) {
    headers.push({ title: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < headers.length; i++) {
    const end = i + 1 < headers.length ? headers[i + 1].start : afterFrontmatter.length;
    const body = afterFrontmatter
      .slice(headers[i].start + headers[i].title.length + 3, end)
      .trim();
    // Take first ~500 chars, skip code blocks
    const cleaned = body
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\|[\s\S]*?\|/g, '')
      .trim()
      .slice(0, 500);
    if (cleaned) {
      sections.set(headers[i].title.toLowerCase(), cleaned);
    }
  }

  return sections;
}

/** Summarize memory_namespace section — extract just the namespace keys */
function summarizeMemoryNamespace(raw: string): string {
  const keys: string[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- aqe/') || trimmed.startsWith('- learning/')) {
      // Extract the namespace path (before the description)
      const parts = trimmed.slice(2).split(' - ');
      keys.push(parts[0].trim());
    }
  }
  if (keys.length === 0) return 'aqe/learning/*, aqe/patterns/*';
  // Deduplicate and limit
  const unique = [...new Set(keys)].slice(0, 6);
  return unique.join(', ');
}

/** Map agent domain to relevant MCP tools */
function mapToolsFromDomain(domain: string | undefined, name: string): string[] {
  const baseTools = ['read', 'edit', 'bash', 'grep', 'glob'];
  const mcpTools = new Set<string>();

  // Always include memory tools for learning
  mcpTools.add('mcp:agentic-qe:memory_store');
  mcpTools.add('mcp:agentic-qe:memory_query');
  mcpTools.add('mcp:agentic-qe:memory_retrieve');

  const d = (domain || '').toLowerCase();
  const n = name.toLowerCase();

  // Security
  if (d.includes('security') || n.includes('security') || n.includes('pentest')) {
    mcpTools.add('mcp:agentic-qe:security_scan_comprehensive');
  }

  // Testing / test generation
  if (
    d.includes('test') ||
    n.includes('test') ||
    n.includes('tdd') ||
    n.includes('mutation') ||
    n.includes('property') ||
    n.includes('bdd')
  ) {
    mcpTools.add('mcp:agentic-qe:test_generate_enhanced');
    mcpTools.add('mcp:agentic-qe:test_execute_parallel');
  }

  // Coverage
  if (d.includes('coverage') || n.includes('coverage') || n.includes('gap')) {
    mcpTools.add('mcp:agentic-qe:coverage_analyze_sublinear');
  }

  // Quality
  if (d.includes('quality') || n.includes('quality') || n.includes('review') || n.includes('gate')) {
    mcpTools.add('mcp:agentic-qe:quality_assess');
  }

  // API / Contract
  if (d.includes('contract') || n.includes('contract') || n.includes('graphql') || n.includes('odata') || n.includes('soap')) {
    mcpTools.add('mcp:agentic-qe:contract_validate');
  }

  // Performance
  if (d.includes('performance') || n.includes('performance') || n.includes('load')) {
    mcpTools.add('mcp:agentic-qe:quality_assess');
  }

  // Defect / debugging
  if (d.includes('defect') || n.includes('defect') || n.includes('root-cause') || n.includes('debug')) {
    mcpTools.add('mcp:agentic-qe:defect_predict');
    mcpTools.add('mcp:agentic-qe:code_index');
  }

  // Accessibility
  if (d.includes('accessibility') || n.includes('accessibility') || n.includes('a11y') || n.includes('responsive') || n.includes('visual')) {
    mcpTools.add('mcp:agentic-qe:accessibility_test');
  }

  // Chaos / resilience
  if (d.includes('chaos') || n.includes('chaos') || n.includes('resilience')) {
    mcpTools.add('mcp:agentic-qe:chaos_test');
  }

  // Compliance
  if (d.includes('compliance') || n.includes('compliance') || n.includes('sod')) {
    mcpTools.add('mcp:agentic-qe:security_scan_comprehensive');
  }

  // Requirements / BDD
  if (d.includes('requirements') || n.includes('requirements') || n.includes('bdd')) {
    mcpTools.add('mcp:agentic-qe:requirements_validate');
  }

  // Code intelligence / knowledge graph
  if (d.includes('code-intelligence') || n.includes('code-intelligence') || n.includes('kg-builder') || n.includes('dependency') || n.includes('complexity')) {
    mcpTools.add('mcp:agentic-qe:code_index');
  }

  // Fleet / coordination
  if (n.includes('fleet') || n.includes('coordinator') || n.includes('queen') || n.includes('parallel')) {
    mcpTools.add('mcp:agentic-qe:fleet_status');
    mcpTools.add('mcp:agentic-qe:task_orchestrate');
    mcpTools.add('mcp:agentic-qe:agent_spawn');
  }

  // Learning / transfer / metrics / patterns
  if (n.includes('learning') || n.includes('transfer') || n.includes('metrics') || n.includes('pattern')) {
    mcpTools.add('mcp:agentic-qe:memory_share');
  }

  // Deployment
  if (n.includes('deployment')) {
    mcpTools.add('mcp:agentic-qe:quality_assess');
    mcpTools.add('mcp:agentic-qe:security_scan_comprehensive');
  }

  return [...baseTools, ...Array.from(mcpTools)];
}

/** Build systemPrompt for agents with <qe_agent_definition> XML sections */
function buildXmlSystemPrompt(name: string, content: string, fm: AgentFrontmatter): string {
  const identity = extractXmlSection(content, 'identity') || fm.description;
  const capabilities = extractXmlSection(content, 'capabilities');
  const defaultToAction = extractXmlSection(content, 'default_to_action');
  const memoryNamespace = extractXmlSection(content, 'memory_namespace');
  const outputFormat = extractXmlSection(content, 'output_format');
  const coordinationNotes = extractXmlSection(content, 'coordination_notes');

  const parts: string[] = [];

  parts.push(`You are ${name}, a specialized QE agent in the Agentic QE v3 platform.\n`);
  parts.push(identity);

  if (capabilities) {
    parts.push(`\nCore Capabilities:\n${capabilities}`);
  }

  if (defaultToAction) {
    parts.push(`\nOperating Principles:\n${defaultToAction}`);
  }

  // Memory integration — summarized
  const nsKeys = memoryNamespace ? summarizeMemoryNamespace(memoryNamespace) : 'aqe/learning/*, aqe/patterns/*';
  parts.push(`\nMemory Integration:
- Query past patterns before starting: use mcp:agentic-qe:memory_query
- Store findings after completion: use mcp:agentic-qe:memory_store
- Namespaces: ${nsKeys}`);

  // Learning protocol — summarized (not the full code blocks)
  parts.push(`\nLearning Protocol:
After each task, store outcomes with reward scoring (0-1 scale) using
mcp:agentic-qe:memory_store. Query historical patterns with
mcp:agentic-qe:memory_query before starting new work.`);

  if (outputFormat) {
    parts.push(`\nOutput Format:\n${outputFormat}`);
  }

  if (coordinationNotes) {
    // Strip code blocks from coordination notes
    const cleanNotes = coordinationNotes.replace(/```[\s\S]*?```/g, '').trim();
    if (cleanNotes) {
      parts.push(`\nArchitecture Notes:\n${cleanNotes}`);
    }
  }

  return parts.join('\n');
}

/** Build systemPrompt for non-XML agents (markdown body with capabilities in frontmatter) */
function buildMarkdownSystemPrompt(name: string, content: string, fm: AgentFrontmatter): string {
  const firstParagraph = extractFirstParagraph(content);
  const sections = extractMarkdownSections(content);

  const parts: string[] = [];

  parts.push(`You are ${name}, a specialized agent in the Agentic QE v3 platform.\n`);
  parts.push(firstParagraph);

  // Capabilities from frontmatter
  if (fm.capabilities && fm.capabilities.length > 0) {
    const capList = fm.capabilities
      .map((c) => `- ${c.replace(/_/g, ' ')}`)
      .join('\n');
    parts.push(`\nCore Capabilities:\n${capList}`);
  }

  // Include relevant markdown sections
  const relevantKeys = ['key responsibilities', 'core principles', 'workflow', 'approach', 'methodology'];
  for (const [key, value] of sections) {
    if (relevantKeys.some((r) => key.includes(r))) {
      parts.push(`\n${key.charAt(0).toUpperCase() + key.slice(1)}:\n${value.slice(0, 400)}`);
    }
  }

  // Memory integration
  parts.push(`\nMemory Integration:
- Query past patterns before starting: use mcp:agentic-qe:memory_query
- Store findings after completion: use mcp:agentic-qe:memory_store
- Namespaces: aqe/learning/*, aqe/patterns/*`);

  parts.push(`\nLearning Protocol:
After each task, store outcomes with reward scoring (0-1 scale) using
mcp:agentic-qe:memory_store. Query historical patterns with
mcp:agentic-qe:memory_query before starting new work.`);

  return parts.join('\n');
}

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function generateAgentYaml(config: AgentConfig): string {
  const toolsList = config.tools.map((t) => `  - "${t}"`).join('\n');
  const permsList = Object.entries(config.permissions)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  // Indent systemPrompt for YAML block scalar
  const indentedPrompt = config.systemPrompt.replace(/\n/g, '\n  ');

  return `name: ${config.name}
description: "${escapeYamlString(config.description)}"
model: "${config.model}"
systemPrompt: |
  ${indentedPrompt}

  Available MCP tools from agentic-qe server are listed in the tools section below.
  Always store findings and patterns in memory using mcp:agentic-qe:memory_store for learning.
  Query past patterns using mcp:agentic-qe:memory_query before starting work.
tools:
${toolsList}
permissions:
${permsList}
`;
}

async function main(): Promise<void> {
  const agentsDir = path.resolve(__dirname, '../.claude/agents/v3');
  const outputDir = path.resolve(__dirname, '../.opencode/agents');

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Clear existing generated agents
  for (const existing of fs.readdirSync(outputDir)) {
    if (existing.endsWith('.yaml')) {
      fs.unlinkSync(path.join(outputDir, existing));
    }
  }

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  let generated = 0;
  let skipped = 0;

  for (const file of files) {
    const basename = file.replace(/\.md$/, '');
    if (!isIncluded(basename)) {
      skipped++;
      continue;
    }

    const filePath = path.join(agentsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter || !frontmatter.name) {
      console.warn(`  SKIP (no frontmatter): ${file}`);
      skipped++;
      continue;
    }

    // Normalize CRLF for consistent parsing
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const hasXml = normalizedContent.includes('<qe_agent_definition>');
    const agentName = frontmatter.name;
    const description = (frontmatter.description || agentName).slice(0, 300);
    const domain = frontmatter.domain;

    // Build system prompt based on format
    const systemPrompt = hasXml
      ? buildXmlSystemPrompt(agentName, normalizedContent, frontmatter)
      : buildMarkdownSystemPrompt(agentName, normalizedContent, frontmatter);

    // Map tools from domain and name
    const tools = mapToolsFromDomain(domain, agentName);

    // Model selection: default to sonnet
    const model = 'claude-sonnet-4-6';

    const config: AgentConfig = {
      name: agentName,
      description,
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
    const outputPath = path.join(outputDir, `${agentName}.yaml`);
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
