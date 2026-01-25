#!/usr/bin/env node
/**
 * Test Dashboard Generator
 * Generates a simple test metrics dashboard for CI
 */

const fs = require('fs');
const path = require('path');

// Find all test files
function findTestFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Count tests in a file (simple heuristic)
function countTests(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const itMatches = content.match(/\bit\s*\(/g) || [];
    const testMatches = content.match(/\btest\s*\(/g) || [];
    return itMatches.length + testMatches.length;
  } catch {
    return 0;
  }
}

// Main
const testDirs = ['tests', 'v3/tests'];
let totalFiles = 0;
let totalTests = 0;
const categories = {};

for (const dir of testDirs) {
  const files = findTestFiles(dir);
  for (const file of files) {
    totalFiles++;
    const tests = countTests(file);
    totalTests += tests;

    // Categorize
    if (file.includes('/unit/')) {
      categories.unit = (categories.unit || 0) + tests;
    } else if (file.includes('/integration/')) {
      categories.integration = (categories.integration || 0) + tests;
    } else if (file.includes('/e2e/')) {
      categories.e2e = (categories.e2e || 0) + tests;
    } else {
      categories.other = (categories.other || 0) + tests;
    }
  }
}

console.log('# Test Dashboard');
console.log('');
console.log(`**Total Test Files**: ${totalFiles}`);
console.log(`**Total Tests**: ${totalTests}`);
console.log('');
console.log('## By Category');
for (const [cat, count] of Object.entries(categories)) {
  console.log(`- **${cat}**: ${count} tests`);
}
console.log('');
console.log('Dashboard generated successfully.');
