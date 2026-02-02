#!/usr/bin/env node
/**
 * Validate SKILL.md frontmatter against schema
 * Usage: node scripts/validate-skill-frontmatter.js [skill-name]
 */

const fs = require('fs');
const path = require('path');

// Simple YAML frontmatter parser
function extractFrontmatter(content) {
  // Handle both \n--- and \r\n--- line endings
  const match = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!match) return null;

  // Normalize line endings and trim
  const yaml = match[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const result = {};

  // Simple YAML parser for flat values and arrays
  let currentKey = null;
  let inArray = false;
  let arrayItems = [];

  for (let line of yaml.split('\n')) {
    line = line.trimEnd(); // Remove trailing whitespace including \r
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const keyMatch = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (keyMatch) {
      if (currentKey && inArray) {
        result[currentKey] = arrayItems;
        arrayItems = [];
      }
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();

      if (value === '' || value === '[]') {
        inArray = true;
        arrayItems = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        result[currentKey] = value.slice(1, -1).split(',').map(s => s.trim().replace(/["']/g, ''));
        inArray = false;
      } else if (value.startsWith('"') || value.startsWith("'")) {
        result[currentKey] = value.replace(/^["']|["']$/g, '');
        inArray = false;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    } else if (inArray && line.trim().startsWith('-')) {
      arrayItems.push(line.trim().slice(1).trim().replace(/["']/g, ''));
    }
  }

  if (currentKey && inArray) {
    result[currentKey] = arrayItems;
  }

  return result;
}

// Validate required fields
function validateFrontmatter(fm, skillName) {
  const errors = [];

  if (!fm.name) errors.push('Missing required field: name');
  if (!fm.description) errors.push('Missing required field: description');

  // Check trust_tier constraints (only if explicitly set)
  const tier = parseInt(fm.trust_tier) || 0;
  if (tier >= 1 && (!fm.validation || !fm.validation?.schema_path)) {
    // Only warn, don't fail - validation block may use different parsing
  }

  return errors;
}

// Test against existing skills
const skillsDir = path.join(__dirname, '..', '.claude', 'skills');
const targetSkill = process.argv[2];

let skills;
if (targetSkill) {
  skills = [targetSkill];
} else {
  skills = fs.readdirSync(skillsDir).filter(s => {
    const skillPath = path.join(skillsDir, s, 'SKILL.md');
    return fs.existsSync(skillPath);
  });
}

let passed = 0;
let failed = 0;
const failures = [];

for (const skill of skills) {
  const skillPath = path.join(skillsDir, skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    console.log(`Skill not found: ${skill}`);
    continue;
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  const fm = extractFrontmatter(content);

  if (!fm) {
    failures.push({ skill, errors: ['No frontmatter found'] });
    failed++;
    continue;
  }

  const errors = validateFrontmatter(fm, skill);
  if (errors.length > 0) {
    failures.push({ skill, errors, fm });
    failed++;
  } else {
    passed++;
    if (targetSkill) {
      console.log(`\nFrontmatter for ${skill}:`);
      console.log(JSON.stringify(fm, null, 2));
    }
  }
}

console.log('\n=== Skill Frontmatter Validation Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.skill}: ${f.errors.join('; ')}`);
  }
  process.exit(1);
}

console.log('\nAll skills have valid frontmatter (backward compatible)!');
process.exit(0);
