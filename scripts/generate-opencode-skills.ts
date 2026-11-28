/**
 * generate-opencode-skills.ts
 *
 * Reads all .claude/skills/SKILL.md files and generates .opencode/skills/{name}.yaml
 * configs for the OpenCode platform.
 *
 * Usage: npx tsx scripts/generate-opencode-skills.ts           # regenerate
 *        npx tsx scripts/generate-opencode-skills.ts --check   # exit 1 if committed yaml drifted (#1494)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/** Skill-local resource dirs; `aqe init` copies none of them into `.opencode/skills/<name>/`. */
const LOCAL_REF = /(?<![\w./-])((?:steps|schemas|scripts|templates|resources|references)\/[\w./-]*\w)/g;
const LOCAL_LINK = /\[([^\]\n]*)\]\(((?:steps|schemas|scripts|templates|resources|references)\/[^)\s]+)\)/g;

/**
 * OpenCode gets one flattened SKILL.md per skill, without the skill's `steps/`,
 * `scripts/`, `references/`... files, so a skill-local path in a prompt is a dead end
 * there (#1494). Point each one that the npm package ships (`assets/skills/<dir>/...`) at
 * its installed copy under `node_modules/agentic-qe/`. Markdown links become plain paths.
 */
function packageLocalPaths(text: string, dirName: string, packagedSkillsDir: string): string {
  const shipped = (rel: string): boolean => fs.existsSync(path.join(packagedSkillsDir, dirName, rel.split('#')[0]));
  const pkg = (rel: string): string => `node_modules/agentic-qe/assets/skills/${dirName}/${rel}`;
  return text
    .replace(LOCAL_LINK, (whole, label: string, rel: string) => {
      if (!shipped(rel)) return whole;
      return label === rel ? `\`${pkg(rel)}\`` : `${label} (\`${pkg(rel)}\`)`;
    })
    .replace(LOCAL_REF, (rel: string) => (shipped(rel) ? pkg(rel) : rel));
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

export const DEFAULT_SKILLS_DIR = path.resolve(__dirname, '../.claude/skills');
export const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../.opencode/skills');
/** The npm package's skill copies: what `node_modules/agentic-qe/assets/skills/` holds. */
export const DEFAULT_PACKAGED_SKILLS_DIR = path.resolve(__dirname, '../assets/skills');

export interface OpenCodeSkillsBuild {
  /** `<name>.yaml` -> file content, for every skill the generator emits. */
  files: Map<string, string>;
  skipped: string[];
}

/**
 * Build every `.opencode/skills/<name>.yaml` from `.claude/skills/<dir>/SKILL.md`.
 * Pure (reads only): `main` writes the result, `--check` and the drift test compare it.
 *
 * Two source dirs can map to one output name (`browser` and `qe-browser` both give
 * `qe-browser`). The dir already named like the output wins; any other clash is an error,
 * so the result never depends on directory order.
 */
export function buildOpenCodeSkills(
  skillsDir: string,
  packagedSkillsDir = DEFAULT_PACKAGED_SKILLS_DIR,
): OpenCodeSkillsBuild {
  const files = new Map<string, string>();
  const owners = new Map<string, string>();
  const skipped: string[] = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isExcluded(entry.name)) {
      skipped.push(`${entry.name} (excluded)`);
      continue;
    }

    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      skipped.push(`${entry.name} (no SKILL.md)`);
      continue;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || !frontmatter.name) {
      skipped.push(`${entry.name} (no frontmatter/name)`);
      continue;
    }

    const outputName = computeOutputName(entry.name);
    const owner = owners.get(outputName);
    if (owner !== undefined) {
      if (owner === outputName) {
        skipped.push(`${entry.name} (${outputName} comes from .claude/skills/${outputName})`);
        continue;
      }
      if (entry.name !== outputName) {
        throw new Error(`.claude/skills/${owner} and .claude/skills/${entry.name} both map to ${outputName}.yaml`);
      }
      skipped.push(`${owner} (${outputName} comes from .claude/skills/${outputName})`);
    }
    owners.set(outputName, entry.name);

    const tags = [...(frontmatter.tags ?? []), 'qe', 'quality-engineering'];
    if (frontmatter.category) tags.push(frontmatter.category);
    if (frontmatter.domain) tags.push(frontmatter.domain);

    const config: SkillConfig = {
      name: outputName,
      description: (frontmatter.description || frontmatter.name).slice(0, 300),
      minModelTier: tierToMinModel(frontmatter.trust_tier ?? 2),
      tags: [...new Set(tags)],
      steps: extractSteps(content).map((step) => ({
        ...step,
        description: packageLocalPaths(step.description, entry.name, packagedSkillsDir),
        prompt: packageLocalPaths(step.prompt, entry.name, packagedSkillsDir),
      })),
    };
    files.set(`${outputName}.yaml`, generateSkillYaml(config));
  }

  return { files, skipped };
}

export interface OpenCodeSkillsDrift {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Compare a build with the yaml files committed in `outputDir`. */
export function diffOpenCodeSkills(build: OpenCodeSkillsBuild, outputDir: string): OpenCodeSkillsDrift {
  const committed = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).filter((f) => f.endsWith('.yaml'))
    : [];
  const added = [...build.files.keys()].filter((f) => !committed.includes(f)).sort();
  const removed = committed.filter((f) => !build.files.has(f)).sort();
  const changed = committed
    .filter((f) => build.files.has(f) && fs.readFileSync(path.join(outputDir, f), 'utf-8') !== build.files.get(f))
    .sort();
  return { added, removed, changed };
}

function main(): void {
  const check = process.argv.includes('--check');
  const build = buildOpenCodeSkills(DEFAULT_SKILLS_DIR);

  if (check) {
    const drift = diffOpenCodeSkills(build, DEFAULT_OUTPUT_DIR);
    const total = drift.added.length + drift.removed.length + drift.changed.length;
    for (const f of drift.added) console.log(`  [MISSING] .opencode/skills/${f}`);
    for (const f of drift.removed) console.log(`  [STALE]   .opencode/skills/${f}`);
    for (const f of drift.changed) console.log(`  [DRIFT]   .opencode/skills/${f}`);
    if (total > 0) {
      console.error(`\n✗ .opencode/skills differs from the generator output (${total} file(s)).`);
      console.error('  Run: npx tsx scripts/generate-opencode-skills.ts');
      process.exit(1);
    }
    console.log(`✓ .opencode/skills matches the generator output (${build.files.size} skills)`);
    return;
  }

  fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  // Clear existing generated skills
  for (const existing of fs.readdirSync(DEFAULT_OUTPUT_DIR)) {
    if (existing.endsWith('.yaml')) fs.unlinkSync(path.join(DEFAULT_OUTPUT_DIR, existing));
  }
  for (const [file, yaml] of build.files) {
    fs.writeFileSync(path.join(DEFAULT_OUTPUT_DIR, file), yaml, 'utf-8');
  }

  console.log(`Skill generation complete: ${build.files.size} generated, ${build.skipped.length} skipped`);
  const details = build.skipped.filter((s) => !s.endsWith('(excluded)'));
  if (details.length > 0) console.log(`Skipped details: ${details.join(', ')}`);
  console.log(`Output directory: ${DEFAULT_OUTPUT_DIR}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (err) {
    console.error('Generation failed:', err);
    process.exit(1);
  }
}
