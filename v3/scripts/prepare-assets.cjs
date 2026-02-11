#!/usr/bin/env node

/**
 * Prepare assets for npm publish (cross-platform replacement for prepare-assets.sh)
 * Copies QE skills and agents from the main repo to the v3 package.
 *
 * Uses CommonJS for maximum Node.js compatibility across Windows, Mac, and Linux.
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const V3_DIR = path.dirname(SCRIPT_DIR);
const REPO_ROOT = path.dirname(V3_DIR);

const V2_QE_SKILLS = [
  'accessibility-testing',
  'api-testing-patterns',
  'bug-reporting-excellence',
  'chaos-engineering-resilience',
  'code-review-quality',
  'compatibility-testing',
  'compliance-testing',
  'consultancy-practices',
  'context-driven-testing',
  'contract-testing',
  'database-testing',
  'exploratory-testing-advanced',
  'holistic-testing-pact',
  'localization-testing',
  'mobile-testing',
  'mutation-testing',
  'pair-programming',
  'performance-testing',
  'quality-metrics',
  'refactoring-patterns',
  'regression-testing',
  'risk-based-testing',
  'security-testing',
  'shift-left-testing',
  'shift-right-testing',
  'six-thinking-hats',
  'tdd-london-chicago',
  'technical-writing',
  'test-automation-strategy',
  'test-data-management',
  'test-design-techniques',
  'test-environment-management',
  'test-reporting-analytics',
  'verification-quality',
  'visual-testing-advanced',
  'xp-practices',
];

/**
 * Ensure a directory exists, creating it and all parents if necessary.
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Count entries in a directory, returning 0 if the directory does not exist.
 */
function countEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath).length;
  } catch {
    return 0;
  }
}

/**
 * Count all .md files recursively under a directory.
 */
function countMdFilesRecursive(dirPath) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countMdFilesRecursive(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        count++;
      }
    }
  } catch {
    // Directory does not exist or is not readable
  }
  return count;
}

function main() {
  console.log('Preparing assets for npm publish...');

  // Create asset directories
  const skillsDir = path.join(V3_DIR, 'assets', 'skills');
  const agentsDir = path.join(V3_DIR, 'assets', 'agents', 'v3');
  ensureDir(skillsDir);
  ensureDir(agentsDir);

  // --- Copy skills ---
  console.log('Copying skills...');
  const sourceSkillsDir = path.join(REPO_ROOT, '.claude', 'skills');

  if (fs.existsSync(sourceSkillsDir)) {
    const v2Set = new Set(V2_QE_SKILLS);
    let copiedCount = 0;

    try {
      const entries = fs.readdirSync(sourceSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;
        const shouldInclude =
          skillName.startsWith('qe-') ||
          skillName === 'agentic-quality-engineering' ||
          skillName === 'aqe-v2-v3-migration' ||
          v2Set.has(skillName);

        if (shouldInclude) {
          const src = path.join(sourceSkillsDir, skillName);
          const dest = path.join(skillsDir, skillName);
          fs.cpSync(src, dest, { recursive: true });
          copiedCount++;
        }
      }
    } catch (err) {
      console.error('  Error reading skills directory:', err.message);
    }

    console.log('  Copied ' + copiedCount + ' skills');
  } else {
    console.log('  Skills directory not found at ' + sourceSkillsDir);
  }

  // --- Copy agents ---
  console.log('Copying agents...');
  const sourceAgentsDir = path.join(REPO_ROOT, '.claude', 'agents', 'v3');

  if (fs.existsSync(sourceAgentsDir)) {
    // Copy qe-*.md agent files
    try {
      const agentFiles = fs.readdirSync(sourceAgentsDir).filter(function (f) {
        return f.startsWith('qe-') && f.endsWith('.md');
      });
      for (const file of agentFiles) {
        const src = path.join(sourceAgentsDir, file);
        const dest = path.join(agentsDir, file);
        if (fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (err) {
      console.error('  Error copying agent files:', err.message);
    }

    // Copy subagents
    const sourceSubagentsDir = path.join(sourceAgentsDir, 'subagents');
    if (fs.existsSync(sourceSubagentsDir)) {
      const destSubagentsDir = path.join(agentsDir, 'subagents');
      ensureDir(destSubagentsDir);

      try {
        const subagentFiles = fs.readdirSync(sourceSubagentsDir).filter(function (f) {
          return f.startsWith('qe-') && f.endsWith('.md');
        });
        for (const file of subagentFiles) {
          const src = path.join(sourceSubagentsDir, file);
          const dest = path.join(destSubagentsDir, file);
          if (fs.statSync(src).isFile()) {
            fs.copyFileSync(src, dest);
          }
        }
      } catch (err) {
        console.error('  Error copying subagent files:', err.message);
      }
    }

    const agentCount = countMdFilesRecursive(agentsDir);
    console.log('  Copied ' + agentCount + ' agents');
  } else {
    console.log('  Agents directory not found at ' + sourceAgentsDir);
  }

  // --- Copy validation infrastructure (ADR-056) ---
  console.log('Copying validation infrastructure...');
  const sourceValidationDir = path.join(REPO_ROOT, '.claude', 'skills', '.validation');

  if (fs.existsSync(sourceValidationDir)) {
    const destValidationDir = path.join(skillsDir, '.validation');
    ensureDir(destValidationDir);
    fs.cpSync(sourceValidationDir, destValidationDir, { recursive: true });

    console.log('  Copied validation infrastructure');

    const schemasCount = countEntries(path.join(destValidationDir, 'schemas'));
    const templatesCount = countEntries(path.join(destValidationDir, 'templates'));
    const examplesCount = countEntries(path.join(destValidationDir, 'examples'));

    console.log('    - schemas: ' + schemasCount + ' files');
    console.log('    - templates: ' + templatesCount + ' files');
    console.log('    - examples: ' + examplesCount + ' files');
  } else {
    console.log('  Validation directory not found at ' + sourceValidationDir);
  }

  console.log('Asset preparation complete!');
}

main();
