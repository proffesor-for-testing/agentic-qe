#!/usr/bin/env npx tsx
/**
 * Skill Activation Conflict Detector
 * Detects overlapping skill descriptions that may cause mis-routing.
 *
 * Uses semantic similarity (all-MiniLM-L6-v2 via @xenova/transformers)
 * with TF-IDF n-gram fallback when ML model is unavailable.
 *
 * Usage:
 *   npx tsx scripts/detect-skill-conflicts.ts
 *   npx tsx scripts/detect-skill-conflicts.ts --threshold 0.6
 *   npx tsx scripts/detect-skill-conflicts.ts --json
 *   npx tsx scripts/detect-skill-conflicts.ts --top 20
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface SkillInfo {
  name: string;
  description: string;
}

interface ConflictPair {
  skillA: string;
  skillB: string;
  similarity: number;
  descA: string;
  descB: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SKILLS_DIR = '.claude/skills';
const PLATFORM_PREFIXES = ['v3-', 'flow-nexus-', 'agentdb-', 'reasoningbank-', 'swarm-'];
const CRITICAL_THRESHOLD = 0.85;
const WARNING_THRESHOLD = 0.70;
const INFO_THRESHOLD = 0.55;

// ============================================================================
// FRONTMATTER PARSER (from update-skill-manifest.ts)
// ============================================================================

function parseYamlFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    if (indent > 0) continue; // skip nested
    const kv = line.trim().match(/^(\w+):\s*(.+)$/);
    if (kv) {
      let val: unknown = kv[2].trim();
      if ((val as string).startsWith('"') && (val as string).endsWith('"')) {
        val = (val as string).slice(1, -1);
      } else if ((val as string).startsWith("'") && (val as string).endsWith("'")) {
        val = (val as string).slice(1, -1);
      }
      result[kv[1]] = val;
    }
  }
  return result;
}

// ============================================================================
// SKILL DISCOVERY
// ============================================================================

function getProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function discoverSkills(projectRoot: string): SkillInfo[] {
  const skillsPath = join(projectRoot, SKILLS_DIR);
  if (!existsSync(skillsPath)) {
    console.error(`Skills directory not found: ${skillsPath}`);
    process.exit(1);
  }

  const skills: SkillInfo[] = [];
  const entries = readdirSync(skillsPath);

  for (const entry of entries) {
    const fullPath = join(skillsPath, entry);
    if (entry.startsWith('.') || !statSync(fullPath).isDirectory()) continue;

    // Exclude platform skills
    if (PLATFORM_PREFIXES.some(p => entry.startsWith(p))) continue;

    // Find SKILL.md
    const skillMd = existsSync(join(fullPath, 'SKILL.md'))
      ? join(fullPath, 'SKILL.md')
      : existsSync(join(fullPath, 'skill.md'))
        ? join(fullPath, 'skill.md')
        : null;
    if (!skillMd) continue;

    const content = readFileSync(skillMd, 'utf-8');
    const frontmatter = parseYamlFrontmatter(content);

    // Get description from frontmatter or first paragraph after frontmatter
    let description = (frontmatter.description as string) || '';
    if (!description) {
      const bodyMatch = content.match(/^---[\s\S]*?---\s*\n+(?:#[^\n]*\n+)?([\s\S]*?)(?:\n\n|\n#)/);
      if (bodyMatch) {
        description = bodyMatch[1].trim().slice(0, 300);
      }
    }

    if (description) {
      skills.push({ name: entry, description });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// TF-IDF N-GRAM FALLBACK SIMILARITY
// ============================================================================

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function ngramSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  // Jaccard similarity
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============================================================================
// EMBEDDING-BASED SIMILARITY
// ============================================================================

async function computeEmbeddingSimilarities(
  skills: SkillInfo[]
): Promise<ConflictPair[] | null> {
  try {
    const { computeBatchEmbeddings } = await import('../v3/src/learning/real-embeddings.js');
    const { cosineSimilarity } = await import('../v3/src/shared/utils/vector-math.js');

    console.log(`Computing embeddings for ${skills.length} skill descriptions...`);
    const descriptions = skills.map(s => s.description);
    const embeddings = await computeBatchEmbeddings(descriptions);

    if (embeddings.length !== skills.length) {
      console.warn(`Embedding count mismatch: got ${embeddings.length}, expected ${skills.length}`);
      return null;
    }

    const pairs: ConflictPair[] = [];
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        pairs.push({
          skillA: skills[i].name,
          skillB: skills[j].name,
          similarity: sim,
          descA: skills[i].description,
          descB: skills[j].description,
        });
      }
    }

    return pairs;
  } catch (err) {
    console.warn(`[Fallback] Transformer embeddings unavailable: ${(err as Error).message}`);
    console.warn('[Fallback] Using token-overlap similarity instead.\n');
    return null;
  }
}

function computeTokenSimilarities(skills: SkillInfo[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const sim = ngramSimilarity(skills[i].description, skills[j].description);
      pairs.push({
        skillA: skills[i].name,
        skillB: skills[j].name,
        similarity: sim,
        descA: skills[i].description,
        descB: skills[j].description,
      });
    }
  }
  return pairs;
}

// ============================================================================
// OUTPUT
// ============================================================================

function truncateDesc(desc: string, maxLen = 60): string {
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen - 3) + '...';
}

function formatResults(
  pairs: ConflictPair[],
  skillCount: number,
  thresholds: { critical: number; warning: number; info: number },
  topN?: number,
): { output: string; critical: ConflictPair[]; warnings: ConflictPair[]; info: ConflictPair[] } {
  // Sort by similarity descending
  pairs.sort((a, b) => b.similarity - a.similarity);

  const critical = pairs.filter(p => p.similarity >= thresholds.critical);
  const warnings = pairs.filter(p => p.similarity >= thresholds.warning && p.similarity < thresholds.critical);
  const info = pairs.filter(p => p.similarity >= thresholds.info && p.similarity < thresholds.warning);

  const totalPairs = (skillCount * (skillCount - 1)) / 2;
  const sep = '='.repeat(64);

  let out = `\n${sep}\nSKILL ACTIVATION CONFLICT DETECTOR\n${skillCount} AQE skills analyzed | ${totalPairs} pairs compared\n${sep}\n`;

  let idx = 1;

  const formatSection = (label: string, items: ConflictPair[], limit?: number): string => {
    if (items.length === 0) return `\n${label}:\n  (none)\n`;
    const shown = limit ? items.slice(0, limit) : items;
    let s = `\n${label}:\n`;
    for (const p of shown) {
      s += `  ${String(idx++).padStart(3)}. ${p.skillA} <-> ${p.skillB}${' '.repeat(Math.max(1, 50 - p.skillA.length - p.skillB.length))}${p.similarity.toFixed(3)}\n`;
      s += `       a: "${truncateDesc(p.descA)}"\n`;
      s += `       b: "${truncateDesc(p.descB)}"\n`;
    }
    if (limit && items.length > limit) {
      s += `  ... and ${items.length - limit} more\n`;
    }
    return s;
  };

  const limit = topN;
  out += formatSection(`CRITICAL CONFLICTS (similarity >= ${thresholds.critical})`, critical, limit);
  out += formatSection(`WARNING CONFLICTS (similarity >= ${thresholds.warning})`, warnings, limit);
  out += formatSection(`INFO (similarity >= ${thresholds.info})`, info, limit);

  out += `\n${sep}\nSUMMARY: ${critical.length} critical | ${warnings.length} warnings | ${info.length} info\n${sep}\n`;

  return { output: out, critical, warnings, info };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  let customThreshold: number | undefined;
  let jsonOutput = false;
  let topN: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--threshold':
        customThreshold = parseFloat(args[++i]);
        break;
      case '--json':
        jsonOutput = true;
        break;
      case '--top':
        topN = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        console.log(`
Skill Activation Conflict Detector

Usage:
  npx tsx scripts/detect-skill-conflicts.ts [options]

Options:
  --threshold <n>  Custom warning threshold (default: 0.70)
  --json           Write results to scripts/skill-conflicts.json
  --top <n>        Show top N pairs per severity level
  --help           Show this help
`);
        process.exit(0);
    }
  }

  const thresholds = {
    critical: CRITICAL_THRESHOLD,
    warning: customThreshold ?? WARNING_THRESHOLD,
    info: INFO_THRESHOLD,
  };

  const projectRoot = getProjectRoot();
  const skills = discoverSkills(projectRoot);
  console.log(`Discovered ${skills.length} AQE skills (platform skills excluded)`);

  // Try ML embeddings first, fall back to token overlap
  let pairs = await computeEmbeddingSimilarities(skills);
  const method = pairs ? 'transformer-embeddings' : 'token-overlap';
  if (!pairs) {
    pairs = computeTokenSimilarities(skills);
  }

  const { output, critical, warnings, info } = formatResults(pairs, skills.length, thresholds, topN);
  console.log(output);

  if (jsonOutput) {
    const jsonPath = join(projectRoot, 'scripts', 'skill-conflicts.json');
    const data = {
      generatedAt: new Date().toISOString(),
      method,
      skillCount: skills.length,
      pairCount: pairs.length,
      thresholds,
      critical: critical.map(p => ({ ...p, descA: undefined, descB: undefined, skillA: p.skillA, skillB: p.skillB, similarity: p.similarity })),
      warnings: warnings.map(p => ({ skillA: p.skillA, skillB: p.skillB, similarity: p.similarity })),
      info: info.map(p => ({ skillA: p.skillA, skillB: p.skillB, similarity: p.similarity })),
    };
    writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`JSON results written to ${jsonPath}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
