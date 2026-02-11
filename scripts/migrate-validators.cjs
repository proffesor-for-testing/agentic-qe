#!/usr/bin/env node

/**
 * Migrate validate.sh → validate-config.json
 *
 * Auto-extracts configuration from existing bash validate.sh scripts
 * and generates cross-platform validate-config.json files.
 *
 * Usage:
 *   node scripts/migrate-validators.cjs              # migrate all skills
 *   node scripts/migrate-validators.cjs --dry-run    # preview without writing
 *   node scripts/migrate-validators.cjs --skill api-testing-patterns  # single skill
 */

const fs = require('fs');
const path = require('path');

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const singleSkill = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : null;

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIRS = [
  path.join(PROJECT_ROOT, '.claude', 'skills'),
  path.join(PROJECT_ROOT, 'v3', '.claude', 'skills'),
];

function extractConfig(shContent, skillDir) {
  const config = {
    skillName: '',
    skillVersion: '1.0.0',
    requiredTools: [],
    optionalTools: [],
    schemaPath: null,
    requiredFields: [],
    requiredNonEmptyFields: [],
    mustContainTerms: [],
    mustNotContainTerms: [],
    enumValidations: {},
  };

  // Extract SKILL_NAME
  const nameMatch = shContent.match(/SKILL_NAME="([^"]+)"/);
  if (nameMatch) config.skillName = nameMatch[1];

  // Extract SKILL_VERSION
  const versionMatch = shContent.match(/SKILL_VERSION="([^"]+)"/);
  if (versionMatch) config.skillVersion = versionMatch[1];

  // Extract REQUIRED_TOOLS
  const reqToolsMatch = shContent.match(/REQUIRED_TOOLS=\(([^)]*)\)/);
  if (reqToolsMatch) {
    config.requiredTools = reqToolsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract OPTIONAL_TOOLS
  const optToolsMatch = shContent.match(/OPTIONAL_TOOLS=\(([^)]*)\)/);
  if (optToolsMatch) {
    config.optionalTools = optToolsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract SCHEMA_PATH (relative)
  const schemaMatch = shContent.match(/SCHEMA_PATH="\$SKILL_DIR\/([^"]+)"/);
  if (schemaMatch) config.schemaPath = schemaMatch[1];

  // Extract REQUIRED_FIELDS
  const reqFieldsMatch = shContent.match(/REQUIRED_FIELDS=\(([^)]*)\)/);
  if (reqFieldsMatch) {
    config.requiredFields = reqFieldsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract REQUIRED_NON_EMPTY_FIELDS
  const reqNonEmptyMatch = shContent.match(/REQUIRED_NON_EMPTY_FIELDS=\(([^)]*)\)/);
  if (reqNonEmptyMatch) {
    config.requiredNonEmptyFields = reqNonEmptyMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract MUST_CONTAIN_TERMS
  const mustContainMatch = shContent.match(/MUST_CONTAIN_TERMS=\(([^)]*)\)/);
  if (mustContainMatch) {
    config.mustContainTerms = mustContainMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract MUST_NOT_CONTAIN_TERMS
  const mustNotContainMatch = shContent.match(/MUST_NOT_CONTAIN_TERMS=\(([^)]*)\)/);
  if (mustNotContainMatch) {
    config.mustNotContainTerms = mustNotContainMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract ENUM_VALIDATIONS
  const enumMatch = shContent.match(/ENUM_VALIDATIONS=\(([\s\S]*?)\)/);
  if (enumMatch) {
    const enumLines = enumMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    for (const line of enumLines) {
      const [fieldPath, values] = line.split(':');
      if (fieldPath && values) {
        config.enumValidations[fieldPath] = values.split(',');
      }
    }
  }

  return config;
}

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const skillsDir of SKILLS_DIRS) {
  if (!fs.existsSync(skillsDir)) continue;

  const skills = fs.readdirSync(skillsDir).filter(d => {
    if (d.startsWith('.') || d.endsWith('.json') || d.endsWith('.md')) return false;
    if (singleSkill && d !== singleSkill) return false;
    return fs.statSync(path.join(skillsDir, d)).isDirectory();
  });

  for (const skill of skills) {
    const shPath = path.join(skillsDir, skill, 'scripts', 'validate.sh');
    const configPath = path.join(skillsDir, skill, 'scripts', 'validate-config.json');

    if (!fs.existsSync(shPath)) {
      skipped++;
      continue;
    }

    // Skip if config already exists and not in single-skill mode
    if (fs.existsSync(configPath) && !singleSkill) {
      console.log(`${YELLOW}[SKIP]${RESET} ${skill} — validate-config.json already exists`);
      skipped++;
      continue;
    }

    try {
      const shContent = fs.readFileSync(shPath, 'utf-8');
      const config = extractConfig(shContent, path.join(skillsDir, skill));

      // Use skill directory name if SKILL_NAME not found
      if (!config.skillName) config.skillName = skill;

      if (dryRun) {
        console.log(`${CYAN}[DRY-RUN]${RESET} ${skill}:`);
        console.log(JSON.stringify(config, null, 2));
        console.log('');
      } else {
        // Ensure scripts directory exists
        const scriptsDir = path.join(skillsDir, skill, 'scripts');
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        console.log(`${GREEN}[OK]${RESET} ${skill} → validate-config.json`);
      }
      migrated++;
    } catch (e) {
      console.log(`${RED}[FAIL]${RESET} ${skill}: ${e.message}`);
      failed++;
    }
  }
}

console.log('');
console.log('==============================================');
console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
if (dryRun) console.log('(dry-run mode — no files were written)');
console.log('==============================================');
