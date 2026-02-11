#!/usr/bin/env node

/**
 * AQE Universal Skill Validator v3.0.0 (Cross-Platform)
 *
 * Replaces per-skill validate.sh scripts with a single Node.js runner.
 * Reads validate-config.json from the skill directory for configuration.
 *
 * Usage:
 *   node scripts/validate-skill.cjs <skill-name> --self-test
 *   node scripts/validate-skill.cjs <skill-name> <output-file> [--json] [--verbose]
 *   node scripts/validate-skill.cjs --list-skills
 *
 * Config file format (validate-config.json):
 * {
 *   "skillName": "api-testing-patterns",
 *   "skillVersion": "1.0.0",
 *   "requiredTools": ["jq"],
 *   "optionalTools": ["node", "supertest"],
 *   "schemaPath": "schemas/output.json",
 *   "requiredFields": ["skillName", "status", "output"],
 *   "requiredNonEmptyFields": ["output.summary"],
 *   "mustContainTerms": ["api", "test"],
 *   "mustNotContainTerms": ["TODO", "FIXME"],
 *   "enumValidations": { ".status": ["success", "partial", "failed"] }
 * }
 */

const fs = require('fs');
const path = require('path');
const lib = require('./validator-lib.cjs');

// =============================================================================
// Argument Parsing
// =============================================================================

const args = process.argv.slice(2);
let skillName = null;
let outputFile = null;
let selfTest = false;
let jsonOnly = false;
let listTools = false;
let listSkills = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--self-test': selfTest = true; break;
    case '--json': jsonOnly = true; break;
    case '--verbose': case '-v': process.env.AQE_DEBUG = '1'; break;
    case '--list-tools': listTools = true; break;
    case '--list-skills': listSkills = true; break;
    case '--help': case '-h': printHelp(); process.exit(0);
    default:
      if (!skillName) skillName = args[i];
      else if (!outputFile) outputFile = args[i];
  }
}

function printHelp() {
  console.log(`
AQE Universal Skill Validator v${lib.VERSION}

Usage:
  node scripts/validate-skill.cjs <skill-name> --self-test
  node scripts/validate-skill.cjs <skill-name> <output-file> [--json] [--verbose]
  node scripts/validate-skill.cjs --list-skills

Options:
  --self-test     Run validator self-test for the skill
  --json          Output results as JSON only
  --verbose, -v   Enable debug output
  --list-tools    Show available validation tools
  --list-skills   List all skills with validate-config.json
  --help, -h      Show this help
`);
}

// =============================================================================
// Skill Discovery
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

function findSkillDir(name) {
  const candidates = [
    path.join(SKILLS_DIR, name),
    path.join(PROJECT_ROOT, 'v3', '.claude', 'skills', name),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function loadConfig(skillDir) {
  const configPath = path.join(skillDir, 'scripts', 'validate-config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    lib.error(`Failed to parse ${configPath}: ${e.message}`);
    return null;
  }
}

// =============================================================================
// List Skills Mode
// =============================================================================

if (listSkills) {
  const skills = fs.readdirSync(SKILLS_DIR).filter(d => {
    const configPath = path.join(SKILLS_DIR, d, 'scripts', 'validate-config.json');
    return fs.existsSync(configPath);
  });

  if (skills.length === 0) {
    console.log('No skills with validate-config.json found.');
    console.log('Run: node scripts/migrate-validators.cjs to generate configs from existing .sh files.');
  } else {
    console.log(`Skills with cross-platform validators (${skills.length}):`);
    for (const s of skills) console.log(`  - ${s}`);
  }
  process.exit(0);
}

// =============================================================================
// List Tools Mode
// =============================================================================

if (listTools) {
  const tools = ['jq', 'node', 'python3', 'ajv', 'jsonschema', 'playwright'];
  console.log('Available validation tools:');
  for (const t of tools) {
    console.log(`  ${lib.commandExists(t) ? '[OK]' : '[MISSING]'} ${t}`);
  }
  process.exit(0);
}

// =============================================================================
// Main
// =============================================================================

if (!skillName) {
  lib.error('No skill name specified');
  printHelp();
  process.exit(1);
}

const skillDir = findSkillDir(skillName);
if (!skillDir) {
  lib.error(`Skill not found: ${skillName}`);
  process.exit(1);
}

const config = loadConfig(skillDir);
if (!config) {
  // Fallback: try to run the .sh validator via bash
  const shPath = path.join(skillDir, 'scripts', 'validate.sh');
  if (fs.existsSync(shPath) && lib.commandExists('bash')) {
    lib.warn('No validate-config.json found, falling back to validate.sh via bash');
    const bashArgs = selfTest ? '--self-test' : outputFile || '';
    try {
      const { execSync } = require('child_process');
      execSync(`bash "${shPath}" ${bashArgs}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
      process.exit(0);
    } catch (e) {
      process.exit(e.status || 1);
    }
  }
  lib.error(`No validate-config.json found for ${skillName}. Run: node scripts/migrate-validators.cjs`);
  process.exit(1);
}

// =============================================================================
// Self-Test Mode
// =============================================================================

if (selfTest) {
  console.log('==============================================');
  lib.info(`Running ${config.skillName} Validator Self-Test`);
  console.log('==============================================');
  console.log('');

  let passed = true;
  let warnings = 0;

  // Step 1: Required tools
  console.log('--- Step 1: Required Tools ---');
  for (const tool of (config.requiredTools || [])) {
    if (lib.commandExists(tool)) {
      lib.success(`Required tool available: ${tool}`);
    } else {
      lib.error(`Required tool MISSING: ${tool}`);
      passed = false;
    }
  }
  console.log('');

  // Step 2: Optional tools
  console.log('--- Step 2: Optional Tools ---');
  for (const tool of (config.optionalTools || [])) {
    if (lib.commandExists(tool)) {
      lib.success(`Optional tool available: ${tool}`);
    } else {
      lib.warn(`Optional tool missing: ${tool}`);
      warnings++;
    }
  }
  console.log('');

  // Step 3: Schema file
  console.log('--- Step 3: Schema File ---');
  const schemaPath = config.schemaPath
    ? path.resolve(skillDir, config.schemaPath)
    : null;

  if (schemaPath && fs.existsSync(schemaPath)) {
    lib.success('Schema file exists');
    if (lib.validateJson(schemaPath)) {
      lib.success('Schema file is valid JSON');
    } else {
      lib.error('Schema file is NOT valid JSON');
      passed = false;
    }
  } else if (schemaPath) {
    lib.error(`Schema file not found: ${schemaPath}`);
    passed = false;
  } else {
    lib.warn('No schema configured');
    warnings++;
  }
  console.log('');

  // Step 4: Library self-test
  console.log('--- Step 4: Validator Library Self-Test ---');
  if (lib.runSelfTest()) {
    lib.success('Library self-test passed');
  } else {
    lib.error('Library self-test FAILED');
    passed = false;
  }
  console.log('');

  // Summary
  console.log('==============================================');
  console.log(`Self-Test Summary for ${config.skillName}`);
  console.log('==============================================');

  if (passed) {
    if (warnings > 0) {
      lib.warn(`Self-test PASSED with ${warnings} warning(s)`);
    } else {
      lib.success('Self-test PASSED');
    }
    process.exit(0);
  } else {
    lib.error('Self-test FAILED');
    process.exit(1);
  }
}

// =============================================================================
// Output File Validation Mode
// =============================================================================

if (!outputFile) {
  lib.error('No output file specified');
  console.log(`Usage: node scripts/validate-skill.cjs ${skillName} <output-file>`);
  process.exit(1);
}

if (!fs.existsSync(outputFile)) {
  lib.error(`Output file not found: ${outputFile}`);
  process.exit(1);
}

const statuses = {
  tools: 'passed', json: 'passed', schema: 'passed',
  fields: 'passed', enums: 'passed', content: 'passed',
};
let errorCount = 0;

// Step 1: Tools
if (!jsonOnly) console.log('--- Step 1: Tool Availability ---');
for (const tool of (config.requiredTools || [])) {
  if (!lib.commandExists(tool)) {
    lib.error(`Missing required tool: ${tool}`);
    statuses.tools = 'failed';
    errorCount++;
  }
}
if (statuses.tools === 'failed') {
  if (jsonOnly) console.log(lib.outputValidationReport(config.skillName, 'skipped', 'skipped', 'failed'));
  process.exit(lib.EXIT_SKIP);
}
if (!jsonOnly) { lib.success('Tool check passed'); console.log(''); }

// Step 2: JSON syntax
if (!jsonOnly) console.log('--- Step 2: JSON Syntax ---');
if (!lib.validateJson(outputFile)) {
  statuses.json = 'failed';
  errorCount++;
  if (jsonOnly) console.log(lib.outputValidationReport(config.skillName, 'failed', 'failed', statuses.tools));
  process.exit(lib.EXIT_FAIL);
}
if (!jsonOnly) { lib.success('JSON syntax valid'); console.log(''); }

// Step 3: Schema validation
if (!jsonOnly) console.log('--- Step 3: Schema Validation ---');
const schemaFile = config.schemaPath ? path.resolve(skillDir, config.schemaPath) : null;
if (schemaFile && fs.existsSync(schemaFile)) {
  const result = lib.validateJsonSchema(schemaFile, outputFile);
  if (result === 0) { if (!jsonOnly) lib.success('Schema validation passed'); }
  else if (result === 1) { statuses.schema = 'failed'; errorCount++; }
  else { statuses.schema = 'skipped'; }
} else {
  statuses.schema = 'skipped';
  if (!jsonOnly) lib.warn('Schema validation skipped (no schema file)');
}
if (!jsonOnly) console.log('');

// Step 4: Required fields
if (!jsonOnly) console.log('--- Step 4: Required Fields ---');
const data = lib.jsonParse(outputFile);
const missingFields = (config.requiredFields || []).filter(f => {
  const val = lib.resolvePath(data, f);
  return val == null;
});
const emptyFields = (config.requiredNonEmptyFields || []).filter(f => {
  const val = lib.resolvePath(data, f);
  return val == null || val === '' || (Array.isArray(val) && val.length === 0) ||
    (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0);
});
if (missingFields.length > 0) {
  lib.error(`Missing required fields: ${missingFields.join(', ')}`);
  statuses.fields = 'failed';
  errorCount++;
}
if (emptyFields.length > 0) {
  lib.error(`Empty required fields: ${emptyFields.join(', ')}`);
  statuses.fields = 'failed';
  errorCount++;
}
if (statuses.fields === 'passed' && !jsonOnly) lib.success('All required fields present');
if (!jsonOnly) console.log('');

// Step 5: Enum validation
if (!jsonOnly) console.log('--- Step 5: Enum Validation ---');
for (const [fieldPath, allowed] of Object.entries(config.enumValidations || {})) {
  const val = lib.resolvePath(data, fieldPath.replace(/^\./, ''));
  if (val != null && !allowed.includes(val)) {
    lib.error(`Invalid value for ${fieldPath}: '${val}' (allowed: ${allowed.join(', ')})`);
    statuses.enums = 'failed';
    errorCount++;
  }
}
if (statuses.enums === 'passed' && !jsonOnly) lib.success('All enum fields valid');
if (!jsonOnly) console.log('');

// Step 6: Content terms
if (!jsonOnly) console.log('--- Step 6: Content Terms ---');
const fileContent = fs.readFileSync(outputFile, 'utf-8');
const ca = lib.containsAll(fileContent, config.mustContainTerms || []);
if (!ca.pass) {
  lib.error(`Output missing required terms: ${ca.missing.join(', ')}`);
  statuses.content = 'failed';
  errorCount++;
}
const cn = lib.containsNone(fileContent, config.mustNotContainTerms || []);
if (!cn.pass) {
  lib.error(`Output contains forbidden terms: ${cn.found.join(', ')}`);
  statuses.content = 'failed';
  errorCount++;
}
if (statuses.content === 'passed' && !jsonOnly) lib.success('Content terms validated');
if (!jsonOnly) console.log('');

// Overall
const overall = Object.values(statuses).some(s => s === 'failed') ? 'failed'
  : Object.values(statuses).some(s => s === 'skipped') ? 'partial' : 'passed';

if (jsonOnly) {
  console.log(lib.outputValidationReport(config.skillName, statuses.schema, statuses.content, statuses.tools));
} else {
  console.log('==============================================');
  console.log(`Validation Summary for ${config.skillName}`);
  console.log('==============================================');
  for (const [k, v] of Object.entries(statuses)) {
    console.log(`  ${k.padEnd(15)} ${v}`);
  }
  console.log(`  ${'overall'.padEnd(15)} ${overall}`);
  console.log(`  ${'errors'.padEnd(15)} ${errorCount}`);
  console.log('==============================================');
}

process.exit(overall === 'failed' ? lib.EXIT_FAIL : lib.EXIT_PASS);
