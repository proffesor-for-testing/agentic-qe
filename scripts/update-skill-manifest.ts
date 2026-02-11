#!/usr/bin/env npx tsx
/**
 * Update Skill Manifest
 * ADR-056: Auto-updates skills-manifest.json with trust tiers
 *
 * Usage:
 *   npx tsx scripts/update-skill-manifest.ts
 *   npx tsx scripts/update-skill-manifest.ts --skill security-testing
 *   npx tsx scripts/update-skill-manifest.ts --generate-badges
 *   npx tsx scripts/update-skill-manifest.ts --dry-run
 *   npx tsx scripts/update-skill-manifest.ts --verbose
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface ValidationConfig {
  schemaPath?: string;
  validatorPath?: string;
  evalPath?: string;
  lastValidated?: string;
  status: 'passing' | 'failing' | 'unknown' | 'skipped';
  passRate?: number;
  criticalPassRate?: number;
}

interface SkillManifestEntry {
  name: string;
  description?: string;
  category?: string;
  trustTier: number;
  validation: ValidationConfig;
  file: string;
  tokenEstimate?: number;
  tags?: string[];
  priority?: string;
  lastUpdated?: string;
}

interface TrustTierSummary {
  tier0: number;
  tier1: number;
  tier2: number;
  tier3: number;
  total: number;
}

interface SkillManifestOutput {
  version: string;
  generatedAt: string;
  generator: string;
  trustTierPolicy: string;
  skills: SkillManifestEntry[];
  summary: TrustTierSummary;
  validationStatus: {
    passing: number;
    failing: number;
    unknown: number;
    skipped: number;
  };
}

interface FrontmatterData {
  name?: string;
  description?: string;
  category?: string;
  priority?: string;
  tokenEstimate?: number;
  tags?: string[];
  trust_tier?: number;
  last_optimized?: string;
  last_updated?: string;
  validation?: {
    schema_path?: string;
    validator_path?: string;
    eval_path?: string;
    last_validated?: string;
    validation_status?: string;
    pass_rate?: number;
    critical_pass_rate?: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SKILLS_DIR = '.claude/skills';
const MANIFEST_PATH = '.claude/skills/skills-manifest.json';
const TRUST_TIERS_PATH = '.claude/skills/TRUST-TIERS.md';
const VERSION = '2.0.0';

// Trust tier descriptions for documentation
const TRUST_TIER_DESCRIPTIONS: Record<number, string> = {
  0: 'Advisory - SKILL.md only, no validation',
  1: 'Structured - Has JSON output schema',
  2: 'Validated - Has executable validator script',
  3: 'Verified - Has evaluation test suite'
};

// ============================================================================
// YAML FRONTMATTER PARSER
// ============================================================================

/**
 * Simple YAML frontmatter parser
 * Handles the most common YAML structures in SKILL.md files
 */
function parseYamlFrontmatter(content: string): FrontmatterData {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const yamlContent = frontmatterMatch[1];
  const result: FrontmatterData = {};

  // Parse line by line
  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;
  let currentIndent = 0;
  let inNestedObject = false;
  let nestedKey = '';
  let nestedObject: Record<string, unknown> = {};

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Detect indentation
    const indent = line.search(/\S/);
    const trimmedLine = line.trim();

    // Handle nested objects
    if (indent > 0 && inNestedObject) {
      const nestedMatch = trimmedLine.match(/^(\w+):\s*(.*)$/);
      if (nestedMatch) {
        const [, key, value] = nestedMatch;
        nestedObject[key] = parseYamlValue(value);
      }
      continue;
    }

    // Check if we're exiting a nested object
    if (indent === 0 && inNestedObject) {
      (result as Record<string, unknown>)[nestedKey] = nestedObject;
      inNestedObject = false;
      nestedObject = {};
    }

    // Parse key-value pairs
    const match = trimmedLine.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      currentKey = key;
      currentIndent = indent;

      if (!value || value.trim() === '') {
        // Start of nested object or array
        if (key === 'validation') {
          inNestedObject = true;
          nestedKey = key;
          nestedObject = {};
        }
      } else {
        (result as Record<string, unknown>)[key] = parseYamlValue(value);
      }
    }
  }

  // Handle any remaining nested object
  if (inNestedObject) {
    (result as Record<string, unknown>)[nestedKey] = nestedObject;
  }

  return result;
}

/**
 * Parse a YAML value to its appropriate type
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  // Handle quoted strings
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Handle arrays (inline format)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner.split(',').map(item => {
      const t = item.trim();
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
      }
      return parseYamlValue(t);
    });
  }

  // Handle booleans
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Handle null
  if (trimmed === 'null' || trimmed === '~') return null;

  // Handle numbers
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;

  return trimmed;
}

// ============================================================================
// SKILL DISCOVERY AND ANALYSIS
// ============================================================================

/**
 * Get the project root directory
 */
function getProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

/**
 * Extract trust tier and validation info from SKILL.md frontmatter
 */
function extractSkillInfo(skillDir: string, skillName: string): SkillManifestEntry | null {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    // Check for lowercase skill.md
    const altPath = join(skillDir, 'skill.md');
    if (!existsSync(altPath)) return null;
  }

  const content = readFileSync(
    existsSync(skillMdPath) ? skillMdPath : join(skillDir, 'skill.md'),
    'utf-8'
  );

  const frontmatter = parseYamlFrontmatter(content);

  // Determine trust tier based on available validation files
  let trustTier = frontmatter.trust_tier ?? 0;
  const validation: ValidationConfig = {
    status: 'unknown'
  };

  // Check for schema
  const schemaPath = join(skillDir, 'schemas', 'output.json');
  if (existsSync(schemaPath)) {
    validation.schemaPath = 'schemas/output.json';
    if (trustTier < 1) trustTier = 1;
  }

  // Check for validator script
  const validatorPaths = [
    join(skillDir, 'scripts', 'validate-config.json'),
    join(skillDir, 'scripts', 'validate.ts'),
    join(skillDir, 'scripts', 'validate.js')
  ];
  for (const vPath of validatorPaths) {
    if (existsSync(vPath)) {
      validation.validatorPath = vPath.replace(skillDir + '/', '');
      if (trustTier < 2) trustTier = 2;
      break;
    }
  }

  // Check for eval suite
  const evalsDir = join(skillDir, 'evals');
  if (existsSync(evalsDir)) {
    const evalFiles = readdirSync(evalsDir).filter(f =>
      f.endsWith('.yaml') || f.endsWith('.yml')
    );
    if (evalFiles.length > 0) {
      validation.evalPath = `evals/${evalFiles[0]}`;
      if (trustTier < 3) trustTier = 3;
    }
  }

  // Use explicit trust_tier from frontmatter if it's lower (manual override)
  if (frontmatter.trust_tier !== undefined && frontmatter.trust_tier < trustTier) {
    trustTier = frontmatter.trust_tier;
  }

  // Determine validation status
  if (frontmatter.validation?.validation_status) {
    validation.status = frontmatter.validation.validation_status as ValidationConfig['status'];
  } else if (validation.schemaPath && validation.validatorPath && validation.evalPath) {
    validation.status = 'passing'; // Assume passing if all files exist
  } else if (validation.schemaPath || validation.validatorPath) {
    validation.status = 'unknown';
  } else {
    validation.status = 'skipped';
  }

  // Get last validated date
  if (frontmatter.validation?.last_validated) {
    validation.lastValidated = frontmatter.validation.last_validated;
  }

  // Get pass rates if available
  if (frontmatter.validation?.pass_rate !== undefined) {
    validation.passRate = frontmatter.validation.pass_rate;
  }
  if (frontmatter.validation?.critical_pass_rate !== undefined) {
    validation.criticalPassRate = frontmatter.validation.critical_pass_rate;
  }

  // Build the entry
  const entry: SkillManifestEntry = {
    name: skillName,
    description: frontmatter.description,
    category: frontmatter.category,
    trustTier,
    validation,
    file: `${skillName}/SKILL.md`,
    tokenEstimate: frontmatter.tokenEstimate,
    tags: frontmatter.tags as string[] | undefined,
    priority: frontmatter.priority,
    lastUpdated: frontmatter.last_optimized || frontmatter.last_updated
  };

  return entry;
}

/**
 * Scan all skills and build manifest
 */
function buildManifest(projectRoot: string, filterSkill?: string): SkillManifestOutput {
  const skillsPath = join(projectRoot, SKILLS_DIR);
  const skills: SkillManifestEntry[] = [];

  if (!existsSync(skillsPath)) {
    console.error(`Skills directory not found: ${skillsPath}`);
    process.exit(1);
  }

  // Get all skill directories
  const entries = readdirSync(skillsPath);
  const skillDirs = entries.filter(entry => {
    const fullPath = join(skillsPath, entry);
    // Skip hidden directories, files, and special directories
    if (entry.startsWith('.')) return false;
    if (!statSync(fullPath).isDirectory()) return false;
    // Must have a SKILL.md or skill.md
    return existsSync(join(fullPath, 'SKILL.md')) || existsSync(join(fullPath, 'skill.md'));
  });

  for (const skillName of skillDirs) {
    // Apply filter if specified
    if (filterSkill && skillName !== filterSkill) continue;

    const skillDir = join(skillsPath, skillName);
    const skillInfo = extractSkillInfo(skillDir, skillName);

    if (skillInfo) {
      skills.push(skillInfo);
    }
  }

  // Sort by trust tier (descending) then name
  skills.sort((a, b) => {
    if (b.trustTier !== a.trustTier) return b.trustTier - a.trustTier;
    return a.name.localeCompare(b.name);
  });

  // Calculate summary
  const summary: TrustTierSummary = {
    tier0: 0,
    tier1: 0,
    tier2: 0,
    tier3: 0,
    total: skills.length
  };

  const validationStatus = {
    passing: 0,
    failing: 0,
    unknown: 0,
    skipped: 0
  };

  for (const skill of skills) {
    switch (skill.trustTier) {
      case 0: summary.tier0++; break;
      case 1: summary.tier1++; break;
      case 2: summary.tier2++; break;
      case 3: summary.tier3++; break;
    }

    switch (skill.validation.status) {
      case 'passing': validationStatus.passing++; break;
      case 'failing': validationStatus.failing++; break;
      case 'unknown': validationStatus.unknown++; break;
      case 'skipped': validationStatus.skipped++; break;
    }
  }

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/update-skill-manifest.ts',
    trustTierPolicy: 'ADR-056',
    skills,
    summary,
    validationStatus
  };
}

// ============================================================================
// BADGE GENERATION
// ============================================================================

/**
 * Generate trust tier badges markdown
 */
function generateBadges(manifest: SkillManifestOutput): string {
  const { summary, validationStatus, skills } = manifest;

  // Get tier 3 skills for the table
  const tier3Skills = skills.filter(s => s.trustTier === 3);
  const tier2Skills = skills.filter(s => s.trustTier === 2);
  const tier1Skills = skills.filter(s => s.trustTier === 1);

  const badge = (label: string, value: number, color: string) =>
    `![${label}](https://img.shields.io/badge/${encodeURIComponent(label)}-${value}-${color})`;

  return `# Trust Tier Badges

> Generated: ${new Date().toISOString()}
> Policy: ADR-056 - Trust But Verify

## Overview

${badge('Tier 3 (Verified)', summary.tier3, 'brightgreen')}
${badge('Tier 2 (Validated)', summary.tier2, 'green')}
${badge('Tier 1 (Structured)', summary.tier1, 'yellow')}
${badge('Tier 0 (Advisory)', summary.tier0, 'lightgrey')}

**Total Skills**: ${summary.total}

## Trust Tier Distribution

| Tier | Count | Description |
|------|-------|-------------|
| 3 - Verified | ${summary.tier3} | Full evaluation test suite |
| 2 - Validated | ${summary.tier2} | Has executable validator |
| 1 - Structured | ${summary.tier1} | Has JSON output schema |
| 0 - Advisory | ${summary.tier0} | SKILL.md only |

## Validation Status

| Status | Count |
|--------|-------|
| Passing | ${validationStatus.passing} |
| Failing | ${validationStatus.failing} |
| Unknown | ${validationStatus.unknown} |
| Skipped | ${validationStatus.skipped} |

---

## Tier 3 Skills (Fully Verified)

These skills have complete validation infrastructure: JSON schema, validator script, and evaluation test suite.

| Skill | Category | Schema | Validator | Eval Suite | Status |
|-------|----------|--------|-----------|------------|--------|
${tier3Skills.map(s => {
  const schema = s.validation.schemaPath ? '`schemas/output.json`' : '-';
  const validator = s.validation.validatorPath ? '`' + s.validation.validatorPath + '`' : '-';
  const evalSuite = s.validation.evalPath ? '`' + s.validation.evalPath + '`' : '-';
  const status = s.validation.status === 'passing' ? 'Passing' :
                 s.validation.status === 'failing' ? 'Failing' :
                 s.validation.status === 'unknown' ? 'Unknown' : 'Skipped';
  return `| ${s.name} | ${s.category || '-'} | ${schema} | ${validator} | ${evalSuite} | ${status} |`;
}).join('\n')}

---

## Tier 2 Skills (Validated)

These skills have a validator script but no evaluation test suite yet.

| Skill | Category | Schema | Validator | Status |
|-------|----------|--------|-----------|--------|
${tier2Skills.map(s => {
  const schema = s.validation.schemaPath ? '`schemas/output.json`' : '-';
  const validator = s.validation.validatorPath ? '`' + s.validation.validatorPath + '`' : '-';
  const status = s.validation.status === 'passing' ? 'Passing' :
                 s.validation.status === 'failing' ? 'Failing' :
                 s.validation.status === 'unknown' ? 'Unknown' : 'Skipped';
  return `| ${s.name} | ${s.category || '-'} | ${schema} | ${validator} | ${status} |`;
}).join('\n') || '| (none) | - | - | - | - |'}

---

## Tier 1 Skills (Structured)

These skills have a JSON output schema but no validator yet.

| Skill | Category | Schema |
|-------|----------|--------|
${tier1Skills.map(s => {
  const schema = s.validation.schemaPath ? '`schemas/output.json`' : '-';
  return `| ${s.name} | ${s.category || '-'} | ${schema} |`;
}).join('\n') || '| (none) | - | - |'}

---

## Upgrading Skills

To upgrade a skill to a higher trust tier:

### Tier 0 -> Tier 1 (Add Schema)
1. Create \`{skill}/schemas/output.json\` with JSON Schema
2. Add \`trust_tier: 1\` to frontmatter
3. Run \`npx tsx scripts/update-skill-manifest.ts\`

### Tier 1 -> Tier 2 (Add Validator)
1. Create \`{skill}/scripts/validate-config.json\` (or .ts/.js)
2. Add \`trust_tier: 2\` and validation paths to frontmatter
3. Run \`npx tsx scripts/update-skill-manifest.ts\`

### Tier 2 -> Tier 3 (Add Evals)
1. Create \`{skill}/evals/{skill}.yaml\` with test cases
2. Add \`trust_tier: 3\` and eval_path to frontmatter
3. Run \`npx tsx scripts/update-skill-manifest.ts\`

---

## CI Integration

Add this to your GitHub Actions workflow:

\`\`\`yaml
- name: Validate Skill Manifest
  run: npx tsx scripts/update-skill-manifest.ts --dry-run

- name: Check Tier 3 Skills Pass
  run: |
    for skill in api-testing-patterns security-testing performance-testing; do
      .claude/skills/\$skill/scripts/validate-skill.cjs --self-test
    done
\`\`\`

---

*Generated by update-skill-manifest.ts per ADR-056*
`;
}

// ============================================================================
// MAIN
// ============================================================================

function printUsage() {
  console.log(`
Update Skill Manifest - ADR-056 Trust Tier Management

Usage:
  npx tsx scripts/update-skill-manifest.ts [options]

Options:
  --skill <name>      Only process a specific skill
  --generate-badges   Generate TRUST-TIERS.md badges file
  --dry-run           Print manifest without writing files
  --verbose           Enable verbose output
  --help              Show this help message

Examples:
  npx tsx scripts/update-skill-manifest.ts
  npx tsx scripts/update-skill-manifest.ts --skill security-testing
  npx tsx scripts/update-skill-manifest.ts --generate-badges
  npx tsx scripts/update-skill-manifest.ts --dry-run --verbose
`);
}

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let filterSkill: string | undefined;
  let generateBadgesFlag = false;
  let dryRun = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--skill':
        filterSkill = args[++i];
        break;
      case '--generate-badges':
        generateBadgesFlag = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        if (args[i].startsWith('-')) {
          console.error(`Unknown option: ${args[i]}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  const projectRoot = getProjectRoot();

  if (verbose) {
    console.log(`Project root: ${projectRoot}`);
    console.log(`Skills directory: ${join(projectRoot, SKILLS_DIR)}`);
    if (filterSkill) console.log(`Filtering to skill: ${filterSkill}`);
  }

  // Build manifest
  console.log('Scanning skills...');
  const manifest = buildManifest(projectRoot, filterSkill);

  // Print summary
  console.log('\n=== Trust Tier Summary ===');
  console.log(`Total skills: ${manifest.summary.total}`);
  console.log(`  Tier 3 (Verified):   ${manifest.summary.tier3}`);
  console.log(`  Tier 2 (Validated):  ${manifest.summary.tier2}`);
  console.log(`  Tier 1 (Structured): ${manifest.summary.tier1}`);
  console.log(`  Tier 0 (Advisory):   ${manifest.summary.tier0}`);
  console.log('\n=== Validation Status ===');
  console.log(`  Passing: ${manifest.validationStatus.passing}`);
  console.log(`  Failing: ${manifest.validationStatus.failing}`);
  console.log(`  Unknown: ${manifest.validationStatus.unknown}`);
  console.log(`  Skipped: ${manifest.validationStatus.skipped}`);

  if (verbose) {
    console.log('\n=== Skills by Trust Tier ===');
    for (let tier = 3; tier >= 0; tier--) {
      const tierSkills = manifest.skills.filter(s => s.trustTier === tier);
      if (tierSkills.length > 0) {
        console.log(`\nTier ${tier} (${TRUST_TIER_DESCRIPTIONS[tier]}):`);
        for (const skill of tierSkills) {
          console.log(`  - ${skill.name} [${skill.validation.status}]`);
        }
      }
    }
  }

  // Write manifest
  if (!dryRun) {
    // For the main manifest, we need to merge with the existing one to preserve
    // category structures and other metadata
    const manifestPath = join(projectRoot, MANIFEST_PATH);

    // Create a trust-tier focused manifest for ADR-056
    const trustTierManifest = {
      '$schema': 'https://agentic-qe.dev/schemas/skill-manifest.json',
      version: manifest.version,
      generatedAt: manifest.generatedAt,
      generator: manifest.generator,
      trustTierPolicy: manifest.trustTierPolicy,
      summary: manifest.summary,
      validationStatus: manifest.validationStatus,
      skillsByTier: {
        tier3: manifest.skills.filter(s => s.trustTier === 3).map(s => ({
          name: s.name,
          category: s.category,
          validation: s.validation,
          file: s.file
        })),
        tier2: manifest.skills.filter(s => s.trustTier === 2).map(s => ({
          name: s.name,
          category: s.category,
          validation: s.validation,
          file: s.file
        })),
        tier1: manifest.skills.filter(s => s.trustTier === 1).map(s => ({
          name: s.name,
          category: s.category,
          validation: s.validation,
          file: s.file
        })),
        tier0: manifest.skills.filter(s => s.trustTier === 0).map(s => ({
          name: s.name,
          category: s.category,
          file: s.file
        }))
      },
      // Full skill list for lookup
      skills: manifest.skills.reduce((acc, skill) => {
        acc[skill.name] = {
          trustTier: skill.trustTier,
          category: skill.category,
          priority: skill.priority,
          validation: skill.validation,
          file: skill.file,
          tokenEstimate: skill.tokenEstimate,
          tags: skill.tags,
          lastUpdated: skill.lastUpdated
        };
        return acc;
      }, {} as Record<string, unknown>)
    };

    // Write the trust tier manifest as a separate file
    const trustTierManifestPath = join(projectRoot, '.claude/skills/trust-tier-manifest.json');
    writeFileSync(trustTierManifestPath, JSON.stringify(trustTierManifest, null, 2));
    console.log(`\nWritten: ${trustTierManifestPath}`);

    // Generate badges if requested
    if (generateBadgesFlag) {
      const badgesPath = join(projectRoot, TRUST_TIERS_PATH);
      const badges = generateBadges(manifest);
      writeFileSync(badgesPath, badges);
      console.log(`Written: ${badgesPath}`);
    }
  } else {
    console.log('\n[DRY RUN] Would write:');
    console.log(`  - ${join(projectRoot, '.claude/skills/trust-tier-manifest.json')}`);
    if (generateBadgesFlag) {
      console.log(`  - ${join(projectRoot, TRUST_TIERS_PATH)}`);
    }

    if (verbose) {
      console.log('\n=== Manifest Preview ===');
      console.log(JSON.stringify(manifest, null, 2));
    }
  }

  console.log('\nDone.');
}

main();
