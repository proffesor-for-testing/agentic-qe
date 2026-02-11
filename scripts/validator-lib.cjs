#!/usr/bin/env node

/**
 * AQE Skill Validator Library v3.0.0 (Cross-Platform)
 *
 * Node.js port of validator-lib.sh — works on Windows, macOS, and Linux.
 * Provides JSON validation, schema checking, content term matching,
 * and structured result output without requiring bash, jq, or grep.
 *
 * Usage:
 *   const lib = require('./validator-lib.cjs');
 *   lib.validateJson(filePath);
 *   lib.jsonGet(filePath, 'output.summary');
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const VERSION = '3.0.0';

// Colors (disable if not TTY)
const isTTY = process.stdout.isTTY;
const c = {
  red: isTTY ? '\x1b[0;31m' : '',
  green: isTTY ? '\x1b[0;32m' : '',
  yellow: isTTY ? '\x1b[1;33m' : '',
  blue: isTTY ? '\x1b[0;34m' : '',
  cyan: isTTY ? '\x1b[0;36m' : '',
  reset: isTTY ? '\x1b[0m' : '',
};

// Exit codes
const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_SKIP = 2;

// Logging
const verbose = process.env.AQE_DEBUG === '1';

function info(msg) { console.log(`${c.blue}[INFO]${c.reset} ${msg}`); }
function success(msg) { console.log(`${c.green}[PASS]${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}[WARN]${c.reset} ${msg}`); }
function error(msg) { console.error(`${c.red}[FAIL]${c.reset} ${msg}`); }
function debug(msg) { if (verbose) console.log(`${c.cyan}[DEBUG]${c.reset} ${msg}`); }

// Tool detection (cross-platform)
function commandExists(cmd) {
  const isWindows = process.platform === 'win32';
  const check = spawnSync(isWindows ? 'where' : 'which', [cmd], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: isWindows,
  });
  return check.status === 0;
}

// JSON operations (no jq needed)
function validateJson(filePath) {
  if (!fs.existsSync(filePath)) {
    error(`File not found: ${filePath}`);
    return false;
  }
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    debug(`JSON syntax valid: ${filePath}`);
    return true;
  } catch (e) {
    error(`Invalid JSON syntax in: ${filePath} — ${e.message}`);
    return false;
  }
}

function jsonParse(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function jsonGet(filePath, dotPath) {
  try {
    const data = jsonParse(filePath);
    return resolvePath(data, dotPath);
  } catch {
    return null;
  }
}

function jsonCount(filePath, dotPath) {
  const val = jsonGet(filePath, dotPath);
  return Array.isArray(val) ? val.length : 0;
}

function resolvePath(obj, dotPath) {
  const keys = dotPath.replace(/^\./, '').split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null) return null;
    const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]];
      if (!Array.isArray(current)) return null;
      current = current[parseInt(arrayMatch[2], 10)];
    } else {
      current = current[key];
    }
  }
  return current;
}

// Content validation
function containsAll(content, terms) {
  const lower = content.toLowerCase();
  const missing = terms.filter(t => !lower.includes(t.toLowerCase()));
  if (missing.length > 0) {
    debug(`Missing required terms: ${missing.join(', ')}`);
    return { pass: false, missing };
  }
  return { pass: true, missing: [] };
}

function containsNone(content, terms) {
  const lower = content.toLowerCase();
  const found = terms.filter(t => lower.includes(t.toLowerCase()));
  if (found.length > 0) {
    debug(`Found forbidden terms: ${found.join(', ')}`);
    return { pass: false, found };
  }
  return { pass: true, found: [] };
}

function validateEnum(value, allowed) {
  return allowed.includes(value);
}

// Schema validation (basic — checks required fields and types)
function validateJsonSchema(schemaPath, dataPath) {
  if (!fs.existsSync(schemaPath)) { error(`Schema not found: ${schemaPath}`); return 1; }
  if (!fs.existsSync(dataPath)) { error(`Data not found: ${dataPath}`); return 1; }

  try {
    const schema = jsonParse(schemaPath);
    const data = jsonParse(dataPath);

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      const missing = schema.required.filter(f => !(f in data));
      if (missing.length > 0) {
        error(`Schema validation failed: missing required fields: ${missing.join(', ')}`);
        return 1;
      }
    }

    // Check property types
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in data && prop.type) {
          const actual = Array.isArray(data[key]) ? 'array' : typeof data[key];
          if (prop.type === 'integer' && typeof data[key] === 'number') continue;
          if (actual !== prop.type) {
            error(`Schema validation failed: ${key} expected ${prop.type}, got ${actual}`);
            return 1;
          }
        }
        // Check enum
        if (key in data && prop.enum && !prop.enum.includes(data[key])) {
          error(`Schema validation failed: ${key}='${data[key]}' not in enum [${prop.enum.join(', ')}]`);
          return 1;
        }
      }
    }

    debug('Schema validation passed');
    return 0;
  } catch (e) {
    error(`Schema validation error: ${e.message}`);
    return 1;
  }
}

// Output formatting
function outputValidationReport(skillName, schemaStatus, contentStatus, toolStatus) {
  const overall = [schemaStatus, contentStatus, toolStatus].some(s => s === 'failed')
    ? 'failed'
    : [schemaStatus, contentStatus, toolStatus].some(s => s === 'skipped')
      ? 'partial'
      : 'passed';

  return JSON.stringify({
    skillName,
    overallStatus: overall,
    validations: { schema: schemaStatus, content: contentStatus, tools: toolStatus },
    timestamp: new Date().toISOString(),
  }, null, 2);
}

// Self-test
function runSelfTest() {
  info(`Running validator library self-test (v${VERSION})...`);
  console.log('');

  let passed = 0, failed = 0;
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aqe-validate-'));
  const testJson = path.join(tmpDir, 'test.json');
  const testSchema = path.join(tmpDir, 'schema.json');
  const invalidJson = path.join(tmpDir, 'invalid.json');

  fs.writeFileSync(testJson, JSON.stringify({
    skillName: 'test-skill', status: 'success',
    output: { summary: 'Test output', findings: [] },
  }));
  fs.writeFileSync(testSchema, JSON.stringify({
    type: 'object', required: ['skillName', 'status'],
    properties: { skillName: { type: 'string' }, status: { type: 'string', enum: ['success', 'partial', 'failed'] } },
  }));
  fs.writeFileSync(invalidJson, '{ invalid json');

  // Test validateJson
  if (validateJson(testJson)) { passed++; success('validateJson(valid): passed'); }
  else { failed++; error('validateJson(valid): failed'); }

  if (!validateJson(invalidJson)) { passed++; success('validateJson(invalid): correctly rejected'); }
  else { failed++; error('validateJson(invalid): incorrectly accepted'); }

  // Test jsonGet
  const name = jsonGet(testJson, 'skillName');
  if (name === 'test-skill') { passed++; success(`jsonGet('skillName'): got '${name}'`); }
  else { failed++; error(`jsonGet('skillName'): expected 'test-skill', got '${name}'`); }

  // Test jsonCount
  const count = jsonCount(testJson, 'output.findings');
  if (count === 0) { passed++; success(`jsonCount('output.findings'): got ${count}`); }
  else { failed++; error(`jsonCount('output.findings'): expected 0, got ${count}`); }

  // Test containsAll
  const ca1 = containsAll('hello world', ['hello', 'world']);
  if (ca1.pass) { passed++; success("containsAll('hello world', 'hello', 'world'): passed"); }
  else { failed++; error('containsAll: failed'); }

  const ca2 = containsAll('hello world', ['hello', 'foo']);
  if (!ca2.pass) { passed++; success("containsAll('hello world', 'hello', 'foo'): correctly failed"); }
  else { failed++; error('containsAll: should have failed'); }

  // Test containsNone
  const cn1 = containsNone('hello world', ['foo', 'bar']);
  if (cn1.pass) { passed++; success("containsNone('hello world', 'foo', 'bar'): passed"); }
  else { failed++; error('containsNone: failed'); }

  // Test schema validation
  const sv = validateJsonSchema(testSchema, testJson);
  if (sv === 0) { passed++; success('validateJsonSchema(): passed'); }
  else { failed++; error('validateJsonSchema(): failed'); }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('');
  console.log('==============================================');
  info(`Self-test complete: Passed=${passed} Failed=${failed}`);
  console.log('==============================================');
  return failed === 0;
}

module.exports = {
  VERSION, EXIT_PASS, EXIT_FAIL, EXIT_SKIP,
  info, success, warn, error, debug,
  commandExists, validateJson, jsonParse, jsonGet, jsonCount, resolvePath,
  containsAll, containsNone, validateEnum, validateJsonSchema,
  outputValidationReport, runSelfTest,
};

// Run self-test if executed directly
if (require.main === module) {
  const ok = runSelfTest();
  process.exit(ok ? 0 : 1);
}
