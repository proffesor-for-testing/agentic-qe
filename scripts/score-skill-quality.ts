#!/usr/bin/env npx tsx
/**
 * Skill Quality Scorer
 * Deterministic quality scoring for SKILL.md files across 8 dimensions.
 *
 * Usage:
 *   npx tsx scripts/score-skill-quality.ts
 *   npx tsx scripts/score-skill-quality.ts --skill api-testing-patterns
 *   npx tsx scripts/score-skill-quality.ts --suggestions
 *   npx tsx scripts/score-skill-quality.ts --json
 *   npx tsx scripts/score-skill-quality.ts --min-score 70
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface DimensionScores {
  description: number;   // 0-10
  frontmatter: number;   // 0-10
  conciseness: number;   // 0-10
  actionability: number; // 0-10
  structure: number;     // 0-10
  triggers: number;      // 0-10
  codeExamples: number;  // 0-10
  metadata: number;      // 0-10
}

interface SkillScore {
  name: string;
  score: number;
  grade: string;
  dimensions: DimensionScores;
  suggestions: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SKILLS_DIR = '.claude/skills';
const PLATFORM_PREFIXES = ['v3-', 'flow-nexus-', 'agentdb-', 'reasoningbank-', 'swarm-'];

const EXPECTED_FRONTMATTER_FIELDS = [
  'name', 'description', 'category', 'priority', 'tokenEstimate',
  'agents', 'tags', 'trust_tier', 'validation', 'dependencies',
  'implementation_status', 'optimization_version', 'last_optimized',
  'quick_reference_card',
];

const TRIGGER_TERMS = [
  'owasp', 'pact', 'k6', 'artillery', 'jmeter', 'wcag', 'gdpr', 'hipaa',
  'soc2', 'pci', 'jest', 'vitest', 'playwright', 'cypress', 'selenium',
  'supertest', 'graphql', 'rest', 'grpc', 'openapi', 'swagger', 'postman',
  'cucumber', 'gherkin', 'bdd', 'tdd', 'mutation', 'stryker', 'pitest',
  'sonarqube', 'eslint', 'prettier', 'docker', 'kubernetes', 'terraform',
  'kafka', 'rabbitmq', 'redis', 'postgresql', 'mongodb', 'dynamodb',
  'oauth', 'jwt', 'saml', 'oidc', 'xss', 'sqli', 'csrf', 'ssrf',
  'sast', 'dast', 'iast', 'sca', 'sbom', 'cve',
];

const WEIGHTS: Record<keyof DimensionScores, number> = {
  description: 20,
  frontmatter: 15,
  conciseness: 15,
  actionability: 15,
  structure: 15,
  triggers: 10,
  codeExamples: 5,
  metadata: 5,
};

// ============================================================================
// FRONTMATTER PARSER (from detect-skill-conflicts.ts)
// ============================================================================

function parseYamlFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, unknown> = {};
  const lines = match[1].split('\n');
  let inNested = false;
  let nestedKey = '';
  const nestedObj: Record<string, unknown> = {};

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);

    if (indent > 0 && inNested) {
      const kv = line.trim().match(/^([\w_]+):\s*(.+)$/);
      if (kv) nestedObj[kv[1]] = parseYamlValue(kv[2]);
      continue;
    }
    if (indent === 0 && inNested) {
      result[nestedKey] = { ...nestedObj };
      inNested = false;
    }

    const kv = line.trim().match(/^([\w_]+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      if (!value || value.trim() === '') {
        inNested = true;
        nestedKey = key;
        Object.keys(nestedObj).forEach(k => delete nestedObj[k]);
      } else {
        result[key] = parseYamlValue(value.trim());
      }
    }
  }
  if (inNested) result[nestedKey] = { ...nestedObj };
  return result;
}

function parseYamlValue(value: string): unknown {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']'))
    return t.slice(1, -1).split(',').map(i => {
      const s = i.trim();
      return (s.startsWith('"') || s.startsWith("'")) ? s.slice(1, -1) : s;
    });
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  if (!isNaN(n) && t !== '') return n;
  return t;
}

// ============================================================================
// SKILL DISCOVERY (from detect-skill-conflicts.ts)
// ============================================================================

function getProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

interface SkillFile {
  name: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

function discoverSkills(projectRoot: string, filterSkill?: string): SkillFile[] {
  const skillsPath = join(projectRoot, SKILLS_DIR);
  if (!existsSync(skillsPath)) {
    console.error(`Skills directory not found: ${skillsPath}`);
    process.exit(1);
  }

  const skills: SkillFile[] = [];
  for (const entry of readdirSync(skillsPath)) {
    if (entry.startsWith('.') || !statSync(join(skillsPath, entry)).isDirectory()) continue;
    if (PLATFORM_PREFIXES.some(p => entry.startsWith(p))) continue;
    if (filterSkill && entry !== filterSkill) continue;

    const mdPath = existsSync(join(skillsPath, entry, 'SKILL.md'))
      ? join(skillsPath, entry, 'SKILL.md')
      : existsSync(join(skillsPath, entry, 'skill.md'))
        ? join(skillsPath, entry, 'skill.md')
        : null;
    if (!mdPath) continue;

    const content = readFileSync(mdPath, 'utf-8');
    const frontmatter = parseYamlFrontmatter(content);
    const bodyMatch = content.match(/^---[\s\S]*?---\s*\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : content;

    skills.push({ name: entry, content, frontmatter, body });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// SCORING DIMENSIONS
// ============================================================================

function scoreDescription(fm: Record<string, unknown>, body: string): { score: number; suggestions: string[] } {
  let pts = 0;
  const suggestions: string[] = [];
  const desc = String(fm.description || '');

  if (!desc) {
    suggestions.push('Add a "description" field to frontmatter');
    return { score: 0, suggestions };
  }

  // Length sweet spot: 50-200 chars
  if (desc.length >= 50 && desc.length <= 200) pts += 4;
  else if (desc.length >= 30 && desc.length <= 250) pts += 2;
  else suggestions.push(`Description length ${desc.length} chars — aim for 50-200`);

  // "Use when" trigger phrase
  if (/use when/i.test(desc)) pts += 3;
  else suggestions.push('Add "Use when..." trigger phrase to description');

  // Named tools/standards in description
  const descLower = desc.toLowerCase();
  const mentionedTools = TRIGGER_TERMS.filter(t => descLower.includes(t));
  if (mentionedTools.length >= 2) pts += 3;
  else if (mentionedTools.length === 1) pts += 2;
  else suggestions.push('Mention specific tools/standards in description (e.g., Pact, k6, OWASP)');

  return { score: Math.min(10, pts), suggestions };
}

function scoreFrontmatter(fm: Record<string, unknown>): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  const present = EXPECTED_FRONTMATTER_FIELDS.filter(f => fm[f] !== undefined);
  const ratio = present.length / EXPECTED_FRONTMATTER_FIELDS.length;
  const score = Math.round(ratio * 10);

  const missing = EXPECTED_FRONTMATTER_FIELDS.filter(f => fm[f] === undefined);
  if (missing.length > 0 && missing.length <= 5) {
    suggestions.push(`Add missing frontmatter: ${missing.join(', ')}`);
  } else if (missing.length > 5) {
    suggestions.push(`Add ${missing.length} missing frontmatter fields (e.g., ${missing.slice(0, 3).join(', ')})`);
  }

  return { score, suggestions };
}

function scoreConciseness(body: string): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  const lines = body.split('\n').length;

  let score: number;
  if (lines >= 200 && lines <= 400) score = 10;
  else if (lines >= 150 && lines <= 500) score = 8;
  else if (lines >= 100 && lines <= 600) score = 6;
  else if (lines >= 50 && lines <= 800) score = 4;
  else if (lines > 1200) { score = 1; suggestions.push(`Body is ${lines} lines — aim for 200-400 for optimal readability`); }
  else if (lines > 800) { score = 3; suggestions.push(`Body is ${lines} lines — consider trimming to 200-400`); }
  else if (lines < 50) { score = 3; suggestions.push(`Body is only ${lines} lines — expand with tables, examples, decision matrices`); }
  else score = 4;

  return { score, suggestions };
}

function scoreActionability(body: string): { score: number; suggestions: string[] } {
  let pts = 0;
  const suggestions: string[] = [];

  // <default_to_action> block
  if (body.includes('<default_to_action>')) pts += 5;
  else suggestions.push('Add a <default_to_action> block with immediate action steps');

  // Verb-led numbered steps (e.g., "1. IDENTIFY", "2. TEST")
  const numberedSteps = body.match(/^\d+\.\s+[A-Z]{2,}/gm);
  if (numberedSteps && numberedSteps.length >= 3) pts += 3;
  else if (numberedSteps && numberedSteps.length >= 1) pts += 1;
  else suggestions.push('Use verb-led numbered steps (e.g., "1. IDENTIFY...", "2. TEST...")');

  // Decision matrix (pattern selection, when-to-use table)
  if (/quick pattern selection|when to use|decision matrix|pattern selection/i.test(body)) pts += 2;
  else if (/\|.*\|.*\|/m.test(body)) pts += 1;

  return { score: Math.min(10, pts), suggestions };
}

function scoreStructure(body: string): { score: number; suggestions: string[] } {
  let pts = 0;
  const suggestions: string[] = [];

  // Quick Reference Card
  if (/quick reference card/i.test(body)) pts += 3;
  else suggestions.push('Add a "Quick Reference Card" section');

  // Related Skills / Integration section
  if (/related skills|related commands|integration with/i.test(body)) pts += 2;
  else suggestions.push('Add a "Related Skills" section');

  // Remember / Rules / Best Practices
  if (/^##?\s*(remember|rules|best practices|critical)/im.test(body)) pts += 2;

  // 3+ markdown tables
  const tables = body.match(/\|.*\|.*\|/g);
  if (tables && tables.length >= 6) pts += 2;  // header+row = 2 lines per table, so 6 = 3+ tables
  else if (tables && tables.length >= 4) pts += 1;
  else suggestions.push('Add more markdown tables for quick-scan reference');

  // Agent Coordination section
  if (/agent coordination/i.test(body)) pts += 1;

  return { score: Math.min(10, pts), suggestions };
}

function scoreTriggers(fm: Record<string, unknown>, body: string): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  const desc = String(fm.description || '').toLowerCase();
  const first60 = body.split('\n').slice(0, 60).join('\n').toLowerCase();
  const combined = desc + ' ' + first60;

  const found = TRIGGER_TERMS.filter(t => combined.includes(t));
  let score: number;
  if (found.length >= 5) score = 10;
  else if (found.length >= 3) score = 7;
  else if (found.length >= 1) score = 4;
  else { score = 1; suggestions.push('Add specific tool/standard names (OWASP, Pact, k6, WCAG, etc.) in description and intro'); }

  return { score, suggestions };
}

function scoreCodeExamples(body: string): { score: number; suggestions: string[] } {
  const suggestions: string[] = [];
  const blocks = body.match(/```[\s\S]*?```/g);
  const count = blocks ? blocks.length : 0;

  let score: number;
  if (count >= 4) score = 10;
  else if (count >= 2) score = 7;
  else if (count === 1) score = 4;
  else { score = 0; suggestions.push('Add fenced code examples to illustrate usage'); }

  return { score, suggestions };
}

function scoreMetadata(fm: Record<string, unknown>): { score: number; suggestions: string[] } {
  let pts = 0;
  const suggestions: string[] = [];

  // Tags (3+)
  const tags = Array.isArray(fm.tags) ? fm.tags : [];
  if (tags.length >= 3) pts += 3;
  else if (tags.length >= 1) pts += 1;
  else suggestions.push('Add 3+ tags to frontmatter');

  // Valid category
  if (fm.category) pts += 3;
  else suggestions.push('Add a "category" field to frontmatter');

  // Priority set
  if (fm.priority) pts += 2;
  else suggestions.push('Add a "priority" field to frontmatter');

  // tokenEstimate present
  if (fm.tokenEstimate !== undefined) pts += 2;
  else suggestions.push('Add a "tokenEstimate" field to frontmatter');

  return { score: Math.min(10, pts), suggestions };
}

// ============================================================================
// SCORING ORCHESTRATION
// ============================================================================

function scoreSkill(skill: SkillFile): SkillScore {
  const allSuggestions: string[] = [];

  const desc = scoreDescription(skill.frontmatter, skill.body);
  const fm = scoreFrontmatter(skill.frontmatter);
  const conc = scoreConciseness(skill.body);
  const act = scoreActionability(skill.body);
  const str = scoreStructure(skill.body);
  const trg = scoreTriggers(skill.frontmatter, skill.body);
  const code = scoreCodeExamples(skill.body);
  const meta = scoreMetadata(skill.frontmatter);

  const dimensions: DimensionScores = {
    description: desc.score,
    frontmatter: fm.score,
    conciseness: conc.score,
    actionability: act.score,
    structure: str.score,
    triggers: trg.score,
    codeExamples: code.score,
    metadata: meta.score,
  };

  // Weighted score out of 100
  let weighted = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    weighted += (dimensions[key as keyof DimensionScores] / 10) * weight;
  }
  const score = Math.round(weighted);

  allSuggestions.push(...desc.suggestions, ...fm.suggestions, ...conc.suggestions,
    ...act.suggestions, ...str.suggestions, ...trg.suggestions, ...code.suggestions, ...meta.suggestions);

  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

  return { name: skill.name, score, grade, dimensions, suggestions: allSuggestions };
}

// ============================================================================
// OUTPUT
// ============================================================================

function formatResults(scores: SkillScore[], showSuggestions: boolean): string {
  const sep = '='.repeat(120);
  const dimHeaders = 'Desc  FM Conc  Act  Str  Trg Code Meta';
  const header = `Skill${' '.repeat(39)}Score Grade  ${dimHeaders}`;
  const divider = '-'.repeat(120);

  let out = `\n${sep}\nSKILL QUALITY SCORER\n${scores.length} AQE skills analyzed\n${sep}\n${header}\n${divider}\n`;

  for (const s of scores) {
    const d = s.dimensions;
    const name = s.name.length > 42 ? s.name.slice(0, 39) + '...' : s.name.padEnd(42);
    out += `${name}  ${String(s.score).padStart(3)}     ${s.grade}    ${String(d.description).padStart(2)}  ${String(d.frontmatter).padStart(2)}   ${String(d.conciseness).padStart(2)}   ${String(d.actionability).padStart(2)}   ${String(d.structure).padStart(2)}   ${String(d.triggers).padStart(2)}   ${String(d.codeExamples).padStart(2)}   ${String(d.metadata).padStart(2)}\n`;
  }

  // Summary
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of scores) grades[s.grade as keyof typeof grades]++;
  const avg = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const median = sorted.length % 2 === 0
    ? Math.round((sorted[sorted.length / 2 - 1].score + sorted[sorted.length / 2].score) / 2)
    : sorted[Math.floor(sorted.length / 2)].score;

  out += `${sep}\nSUMMARY: A=${grades.A} B=${grades.B} C=${grades.C} D=${grades.D} F=${grades.F} | avg=${avg} median=${median}\n${sep}\n`;

  if (showSuggestions) {
    out += '\nIMPROVEMENT SUGGESTIONS:\n';
    for (const s of scores) {
      if (s.suggestions.length === 0) continue;
      out += `\n  ${s.name} (${s.grade}, ${s.score}):\n`;
      for (const sug of s.suggestions) {
        out += `    - ${sug}\n`;
      }
    }
  }

  return out;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  let filterSkill: string | undefined;
  let showSuggestions = false;
  let jsonOutput = false;
  let minScore: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--skill': filterSkill = args[++i]; break;
      case '--suggestions': showSuggestions = true; break;
      case '--json': jsonOutput = true; break;
      case '--min-score': minScore = parseInt(args[++i], 10); break;
      case '--help': case '-h':
        console.log(`
Skill Quality Scorer

Usage:
  npx tsx scripts/score-skill-quality.ts [options]

Options:
  --skill <name>     Score a single skill
  --suggestions      Show improvement suggestions
  --json             Write results to scripts/skill-quality-scores.json
  --min-score <n>    Only show skills scoring >= n
  --help             Show this help
`);
        process.exit(0);
    }
  }

  const projectRoot = getProjectRoot();
  const skills = discoverSkills(projectRoot, filterSkill);

  if (skills.length === 0) {
    console.error(filterSkill ? `Skill not found: ${filterSkill}` : 'No skills found');
    process.exit(1);
  }

  let scores = skills.map(scoreSkill);
  scores.sort((a, b) => b.score - a.score);

  if (minScore !== undefined) {
    scores = scores.filter(s => s.score >= minScore);
  }

  console.log(formatResults(scores, showSuggestions));

  if (jsonOutput) {
    const jsonPath = join(projectRoot, 'scripts', 'skill-quality-scores.json');
    const data = {
      generatedAt: new Date().toISOString(),
      skillCount: scores.length,
      scores: scores.map(s => ({
        name: s.name,
        score: s.score,
        grade: s.grade,
        dimensions: s.dimensions,
        suggestions: s.suggestions,
      })),
    };
    writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`JSON results written to ${jsonPath}`);
  }
}

main();
