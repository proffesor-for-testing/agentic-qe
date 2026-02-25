/**
 * generate-opencode-skills.ts
 *
 * Reads all .claude/skills/SKILL.md files and generates .opencode/skills/{name}.yaml
 * configs for the OpenCode platform.
 *
 * Usage: npx tsx scripts/generate-opencode-skills.ts
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
}

interface SkillStep {
  name: string;
  description: string;
  tools: string[];
  prompt: string;
}

interface SkillConfig {
  name: string;
  description: string;
  minModelTier: string;
  tags: string[];
  steps: SkillStep[];
}

// Platform infrastructure skills to exclude
const EXCLUDED_PREFIXES = [
  'v3-',
  'flow-nexus-',
  'agentdb-',
  'reasoningbank-',
  'swarm-',
  'hive-mind-',
  'hooks-',
];

function tierToMinModel(tier: number): string {
  switch (tier) {
    case 0:
    case 1:
      return 'tier1-any';
    case 2:
      return 'tier2-good';
    case 3:
      return 'tier3-best';
    default:
      return 'tier2-good';
  }
}

function parseFrontmatter(content: string): SkillFrontmatter | null {
  // Normalize CRLF to LF before parsing
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip nested YAML keys (indented lines that are part of objects)
    if (line.startsWith('  ') && !line.trim().startsWith('-')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

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

  return result as unknown as SkillFrontmatter;
}

/**
 * Extract phases/steps from markdown headers (## and ### sections)
 */
function extractSteps(content: string): SkillStep[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const afterFrontmatter = normalized.replace(/^---[\s\S]*?---\n*/, '');
  const steps: SkillStep[] = [];

  // Find all ## and ### Phase/Step headers
  const phaseRegex = /^#{2,3}\s+(?:Phase\s+\d+\s*[-—:]\s*)?(?:Step\s+\d+\s*[-—:]\s*)?(.+)/gm;
  const sections: Array<{ title: string; start: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = phaseRegex.exec(afterFrontmatter)) !== null) {
    sections.push({
      title: match[1].trim(),
      start: match.index,
    });
  }

  // Skip certain headers that are not actual steps
  const skipHeaders = [
    'quick reference card',
    'when to use',
    'agent coordination',
    'fleet coordination',
    'memory namespace',
    'related skills',
    'remember',
    'common mistakes',
    'common pitfalls',
    'anti-patterns',
    'tools',
    'purpose',
    'activation',
    'quick start',
    'prerequisites',
    'see also',
    'references',
  ];

  for (let i = 0; i < sections.length && steps.length < 8; i++) {
    const section = sections[i];
    const titleLower = section.title.toLowerCase();

    if (skipHeaders.some((skip) => titleLower.includes(skip))) continue;

    const end = i + 1 < sections.length ? sections[i + 1].start : afterFrontmatter.length;
    const body = afterFrontmatter.slice(section.start, end);

    // Extract first meaningful paragraph as description
    const lines = body.split('\n').slice(1);
    const descLines: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === '' && descLines.length > 0) break;
      if (t.startsWith('#') || t.startsWith('```') || t.startsWith('|') || t.startsWith('<')) break;
      if (t !== '') descLines.push(t);
    }

    const description = descLines.join(' ').slice(0, 300) || section.title;
    const stepName = section.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40);

    // Determine tools from step content
    const tools: string[] = ['bash', 'read'];
    const bodyLower = body.toLowerCase();
    if (bodyLower.includes('edit') || bodyLower.includes('fix') || bodyLower.includes('change') || bodyLower.includes('modify')) {
      tools.push('edit');
    }
    if (bodyLower.includes('grep') || bodyLower.includes('search') || bodyLower.includes('find')) {
      tools.push('grep');
    }
    if (bodyLower.includes('mcp') || bodyLower.includes('memory') || bodyLower.includes('agentic-qe')) {
      tools.push('mcp:agentic-qe:*');
    }

    steps.push({
      name: stepName,
      description,
      tools,
      prompt: description,
    });
  }

  // If no steps extracted, create a single generic step
  if (steps.length === 0) {
    steps.push({
      name: 'execute',
      description: 'Execute the skill workflow',
      tools: ['bash', 'read', 'edit', 'grep'],
      prompt: 'Execute the skill workflow as described in the skill documentation.',
    });
  }

  return steps;
}

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function generateSkillYaml(config: SkillConfig): string {
  const tagsList = config.tags.map((t) => `"${escapeYamlString(t)}"`).join(', ');

  let yaml = `name: ${config.name}
description: "${escapeYamlString(config.description)}"
minModelTier: ${config.minModelTier}
tags: [${tagsList}]
steps:
`;

  for (const step of config.steps) {
    const toolsList = step.tools.map((t) => `"${t}"`).join(', ');
    yaml += `  - name: ${step.name}
    description: "${escapeYamlString(step.description)}"
    tools: [${toolsList}]
    prompt: |
      ${step.prompt.replace(/\n/g, '\n      ')}
`;
  }

  return yaml;
}

function isExcluded(name: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Compute the output name, avoiding double qe- prefix */
function computeOutputName(dirName: string): string {
  const safeName = dirName.replace(/[^a-z0-9-]/g, '-');
  // If directory already starts with qe- or qcsd-, don't add qe- prefix
  if (safeName.startsWith('qe-') || safeName.startsWith('qcsd-')) {
    return safeName;
  }
  return `qe-${safeName}`;
}

async function main(): Promise<void> {
  const skillsDir = path.resolve(__dirname, '../.claude/skills');
  const outputDir = path.resolve(__dirname, '../.opencode/skills');

  fs.mkdirSync(outputDir, { recursive: true });

  // Clear existing generated skills
  for (const existing of fs.readdirSync(outputDir)) {
    if (existing.endsWith('.yaml')) {
      fs.unlinkSync(path.join(outputDir, existing));
    }
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  let generated = 0;
  let skipped = 0;
  const skippedNames: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isExcluded(entry.name)) {
      skipped++;
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      skippedNames.push(`${entry.name} (no SKILL.md)`);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || !frontmatter.name) {
      skippedNames.push(`${entry.name} (no frontmatter/name)`);
      skipped++;
      continue;
    }

    const outputName = computeOutputName(entry.name);
    const tags = [...(frontmatter.tags ?? []), 'qe', 'quality-engineering'];
    if (frontmatter.category) tags.push(frontmatter.category);
    if (frontmatter.domain) tags.push(frontmatter.domain);

    const steps = extractSteps(content);
    const minModelTier = tierToMinModel(frontmatter.trust_tier ?? 2);

    const config: SkillConfig = {
      name: outputName,
      description: (frontmatter.description || frontmatter.name).slice(0, 300),
      minModelTier,
      tags: [...new Set(tags)],
      steps,
    };

    const yaml = generateSkillYaml(config);
    const outputPath = path.join(outputDir, `${outputName}.yaml`);
    fs.writeFileSync(outputPath, yaml, 'utf-8');
    generated++;
  }

  console.log(`Skill generation complete: ${generated} generated, ${skipped} skipped`);
  if (skippedNames.length > 0) {
    console.log(`Skipped details: ${skippedNames.join(', ')}`);
  }
  console.log(`Output directory: ${outputDir}`);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
