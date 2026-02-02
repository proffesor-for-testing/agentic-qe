#!/usr/bin/env node
/**
 * Test skill frontmatter schema validation
 * Tests both valid and invalid frontmatter scenarios
 */

const fs = require('fs');
const path = require('path');

// Simple YAML frontmatter parser with nested object support
function extractFrontmatter(content) {
  const match = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!match) return null;

  const yaml = match[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const result = {};

  let currentKey = null;
  let inArray = false;
  let arrayItems = [];
  let inNestedObject = false;
  let nestedObjectKey = null;

  for (let line of yaml.split('\n')) {
    line = line.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Detect indentation level
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Handle nested object properties (2 spaces indentation)
    if (indent === 2 && inNestedObject && nestedObjectKey) {
      const nestedMatch = trimmed.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
      if (nestedMatch) {
        const nKey = nestedMatch[1];
        const nValue = nestedMatch[2].trim();

        if (nValue === '' || nValue === '[]') {
          result[nestedObjectKey][nKey] = [];
        } else if (nValue.startsWith('[') && nValue.endsWith(']')) {
          result[nestedObjectKey][nKey] = nValue.slice(1, -1).split(',').map(s => s.trim().replace(/["']/g, ''));
        } else if (nValue.startsWith('"') || nValue.startsWith("'")) {
          result[nestedObjectKey][nKey] = nValue.replace(/^["']|["']$/g, '');
        } else if (nValue === 'true') {
          result[nestedObjectKey][nKey] = true;
        } else if (nValue === 'false') {
          result[nestedObjectKey][nKey] = false;
        } else if (!isNaN(parseFloat(nValue)) && !nValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
          result[nestedObjectKey][nKey] = parseFloat(nValue);
        } else {
          result[nestedObjectKey][nKey] = nValue;
        }
        continue;
      }
    }

    // Handle array items
    if (trimmed.startsWith('-') && (inArray || inNestedObject)) {
      const itemValue = trimmed.slice(1).trim().replace(/["']/g, '');
      if (inArray) {
        arrayItems.push(itemValue);
      }
      continue;
    }

    // Handle top-level keys (no indentation)
    if (indent === 0) {
      const keyMatch = trimmed.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
      if (keyMatch) {
        // Save pending array
        if (currentKey && inArray) {
          result[currentKey] = arrayItems;
          arrayItems = [];
        }

        inArray = false;
        inNestedObject = false;
        nestedObjectKey = null;
        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();

        if (value === '' || value === '[]') {
          // Could be array or object - check next line indent
          inArray = true;
          arrayItems = [];
          // Also prepare for potential nested object
          result[currentKey] = {};
          inNestedObject = true;
          nestedObjectKey = currentKey;
        } else if (value.startsWith('[') && value.endsWith(']')) {
          result[currentKey] = value.slice(1, -1).split(',').map(s => s.trim().replace(/["']/g, ''));
        } else if (value.startsWith('"') || value.startsWith("'")) {
          result[currentKey] = value.replace(/^["']|["']$/g, '');
        } else if (value === 'true') {
          result[currentKey] = true;
        } else if (value === 'false') {
          result[currentKey] = false;
        } else if (!isNaN(parseFloat(value)) && !value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          result[currentKey] = parseFloat(value);
        } else {
          result[currentKey] = value;
        }
      }
    }
  }

  // Save pending array
  if (currentKey && inArray && arrayItems.length > 0) {
    result[currentKey] = arrayItems;
  }

  // Clean up empty objects that were meant to be empty arrays
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'object' && !Array.isArray(result[key]) && Object.keys(result[key]).length === 0) {
      result[key] = [];
    }
  }

  return result;
}

// Validate against schema rules
function validateAgainstSchema(fm) {
  const errors = [];

  // Required fields
  if (!fm.name) errors.push('Missing required field: name');
  if (!fm.description) errors.push('Missing required field: description');

  // Type validations
  if (fm.name && typeof fm.name !== 'string') errors.push('name must be a string');
  if (fm.description && typeof fm.description !== 'string') errors.push('description must be a string');
  if (fm.trust_tier !== undefined && (typeof fm.trust_tier !== 'number' || fm.trust_tier < 0 || fm.trust_tier > 3)) {
    errors.push('trust_tier must be an integer 0-3');
  }

  // Trust tier conditional requirements
  const tier = fm.trust_tier || 0;
  if (tier >= 1) {
    if (!fm.validation) {
      errors.push('trust_tier >= 1 requires validation block');
    } else if (!fm.validation.schema_path) {
      errors.push('trust_tier >= 1 requires validation.schema_path');
    }
  }
  if (tier >= 2) {
    if (!fm.validation || !fm.validation.validator_path) {
      errors.push('trust_tier >= 2 requires validation.validator_path');
    }
  }
  if (tier >= 3) {
    if (!fm.validation || !fm.validation.eval_path) {
      errors.push('trust_tier >= 3 requires validation.eval_path');
    }
  }

  // Validation block structure
  if (fm.validation) {
    if (fm.validation.schema_path && !fm.validation.schema_path.match(/^schemas\/.*\.json$/)) {
      errors.push('validation.schema_path must match pattern schemas/*.json');
    }
    if (fm.validation.validator_path && !fm.validation.validator_path.match(/^scripts\/.*\.(sh|ts|js)$/)) {
      errors.push('validation.validator_path must match pattern scripts/*.(sh|ts|js)');
    }
    if (fm.validation.eval_path && !fm.validation.eval_path.match(/^evals\/.*\.ya?ml$/)) {
      errors.push('validation.eval_path must match pattern evals/*.yaml');
    }
    if (fm.validation.pass_rate !== undefined && (fm.validation.pass_rate < 0 || fm.validation.pass_rate > 1)) {
      errors.push('validation.pass_rate must be 0.0-1.0');
    }
  }

  return errors;
}

// Test cases
const testCases = [
  {
    name: 'Minimal valid frontmatter (Tier 0)',
    yaml: `---
name: test-skill
description: "A test skill with minimal frontmatter for backward compatibility"
---`,
    expectValid: true
  },
  {
    name: 'Full frontmatter (Tier 3)',
    yaml: `---
name: security-testing
description: "Full featured security testing skill"
category: specialized-testing
priority: critical
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate.sh
  eval_path: evals/security-testing.yaml
  last_validated: 2026-02-02
  validation_status: passing
  pass_rate: 0.95
---`,
    expectValid: true
  },
  {
    name: 'Tier 1 without schema_path',
    yaml: `---
name: broken-skill
description: "A skill with trust_tier 1 but no schema"
trust_tier: 1
---`,
    expectValid: false,
    expectedError: 'trust_tier >= 1 requires validation block'
  },
  {
    name: 'Tier 2 without validator_path',
    yaml: `---
name: broken-skill
description: "A skill with trust_tier 2 but no validator"
trust_tier: 2
validation:
  schema_path: schemas/output.json
---`,
    expectValid: false,
    expectedError: 'trust_tier >= 2 requires validation.validator_path'
  },
  {
    name: 'Tier 3 without eval_path',
    yaml: `---
name: broken-skill
description: "A skill with trust_tier 3 but no evals"
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate.sh
---`,
    expectValid: false,
    expectedError: 'trust_tier >= 3 requires validation.eval_path'
  },
  {
    name: 'Missing name',
    yaml: `---
description: "A skill without a name"
---`,
    expectValid: false,
    expectedError: 'Missing required field: name'
  },
  {
    name: 'Missing description',
    yaml: `---
name: nameless
---`,
    expectValid: false,
    expectedError: 'Missing required field: description'
  },
  {
    name: 'Invalid schema_path pattern',
    yaml: `---
name: test-skill
description: "A skill with invalid schema path"
trust_tier: 1
validation:
  schema_path: invalid/path.json
---`,
    expectValid: false,
    expectedError: 'validation.schema_path must match pattern'
  }
];

console.log('=== Skill Frontmatter Schema Validation Tests ===\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const fm = extractFrontmatter(tc.yaml);
  const errors = fm ? validateAgainstSchema(fm) : ['No frontmatter found'];
  const isValid = errors.length === 0;

  const testPassed = tc.expectValid === isValid &&
    (!tc.expectedError || errors.some(e => e.includes(tc.expectedError)));

  if (testPassed) {
    console.log(`[PASS] ${tc.name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${tc.name}`);
    console.log(`  Expected valid: ${tc.expectValid}, Got valid: ${isValid}`);
    console.log(`  Errors: ${errors.join('; ')}`);
    if (tc.expectedError) {
      console.log(`  Expected error containing: ${tc.expectedError}`);
    }
    failed++;
  }
}

console.log(`\n=== Results: ${passed}/${passed + failed} tests passed ===`);

if (failed > 0) {
  process.exit(1);
}
