#!/usr/bin/env node

/**
 * Test script for CLAUDE.md update functionality
 * Tests that the init script properly updates target project's CLAUDE.md
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const chalk = require('chalk');

// Create temp test directory
const testDir = path.join(__dirname, 'test-project');

console.log(chalk.cyan('\n🧪 Testing CLAUDE.md Update Functionality\n'));

// Clean up if test directory exists
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// Create test directory
fs.mkdirSync(testDir, { recursive: true });
console.log(chalk.green('✅ Created test directory:'), testDir);

// Test 1: Creating new CLAUDE.md
console.log(chalk.cyan('\nTest 1: Creating new CLAUDE.md in empty project'));
try {
  // SECURITY FIX: Use execFileSync instead of execSync to prevent command injection
  // Pass arguments as array (no shell interpretation)
  execFileSync('node', [path.join(__dirname, '..', 'bin', 'agentic-qe-real'), 'init', testDir], {
    stdio: 'inherit'
  });

  const claudeMdPath = path.join(testDir, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (content.includes('AGENTIC QE FLEET - CRITICAL RULES')) {
      console.log(chalk.green('✅ Test 1 PASSED: CLAUDE.md created with AQE rules'));
    } else {
      console.log(chalk.red('❌ Test 1 FAILED: CLAUDE.md missing AQE rules'));
    }
  } else {
    console.log(chalk.red('❌ Test 1 FAILED: CLAUDE.md not created'));
  }
} catch (error) {
  console.log(chalk.red('❌ Test 1 FAILED:'), error.message);
}

// Test 2: Updating existing CLAUDE.md
console.log(chalk.cyan('\nTest 2: Updating existing CLAUDE.md'));

// Create a new test directory for this test
const testDir2 = path.join(__dirname, 'test-project-2');
if (fs.existsSync(testDir2)) {
  fs.rmSync(testDir2, { recursive: true, force: true });
}
fs.mkdirSync(testDir2, { recursive: true });

// Create existing CLAUDE.md with some content
const existingContent = `# Claude Code Configuration

## Project Overview
This is an existing project with its own configuration.

## Build Commands
- npm run build
- npm run test
`;

fs.writeFileSync(path.join(testDir2, 'CLAUDE.md'), existingContent);

try {
  // SECURITY FIX: Use execFileSync instead of execSync to prevent command injection
  execFileSync('node', [path.join(__dirname, '..', 'bin', 'agentic-qe-real'), 'init', testDir2], {
    stdio: 'inherit'
  });

  const claudeMdPath = path.join(testDir2, 'CLAUDE.md');
  const updatedContent = fs.readFileSync(claudeMdPath, 'utf-8');

  if (updatedContent.includes('AGENTIC QE FLEET - CRITICAL RULES') &&
      updatedContent.includes('This is an existing project')) {
    console.log(chalk.green('✅ Test 2 PASSED: Existing CLAUDE.md updated with AQE rules'));
  } else {
    console.log(chalk.red('❌ Test 2 FAILED: CLAUDE.md not properly updated'));
  }
} catch (error) {
  console.log(chalk.red('❌ Test 2 FAILED:'), error.message);
}

// Test 3: Verify idempotency (running init twice)
console.log(chalk.cyan('\nTest 3: Testing idempotency (running init twice)'));
try {
  // Run init again on testDir2
  // SECURITY FIX: Use execFileSync instead of execSync to prevent command injection
  execFileSync('node', [path.join(__dirname, '..', 'bin', 'agentic-qe-real'), 'init', testDir2], {
    stdio: 'inherit'
  });

  const claudeMdPath = path.join(testDir2, 'CLAUDE.md');
  const content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Count occurrences of the AQE header
  const matches = content.match(/AGENTIC QE FLEET - CRITICAL RULES/g);
  if (matches && matches.length === 1) {
    console.log(chalk.green('✅ Test 3 PASSED: AQE rules not duplicated on second run'));
  } else {
    console.log(chalk.red('❌ Test 3 FAILED: AQE rules duplicated or missing'));
  }
} catch (error) {
  console.log(chalk.red('❌ Test 3 FAILED:'), error.message);
}

// Clean up test directories
console.log(chalk.cyan('\n🧹 Cleaning up test directories...'));
fs.rmSync(testDir, { recursive: true, force: true });
fs.rmSync(testDir2, { recursive: true, force: true });
console.log(chalk.green('✅ Test directories cleaned up'));

console.log(chalk.cyan('\n✨ Testing complete!\n'));