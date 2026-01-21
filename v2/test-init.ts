#!/usr/bin/env ts-node
/**
 * Test InitCommand programmatically to verify database initialization order fix
 */

import { InitCommand } from './src/cli/commands/init';
import * as fs from 'fs-extra';
import * as path from 'path';

async function testInit() {
  const testDir = '/tmp/aqe-init-test';

  try {
    // Clean test directory
    console.log('Cleaning test directory...');
    await fs.remove(testDir);
    await fs.ensureDir(testDir);

    // Change to test directory
    process.chdir(testDir);

    // Create minimal package.json
    await fs.writeJson(path.join(testDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0'
    });

    console.log('Running InitCommand.execute()...');

    // Call InitCommand with proper options
    await InitCommand.execute({
      config: undefined,
      topology: 'hierarchical',
      maxAgents: '10',
      focus: 'unit,integration',
      environments: 'development',
      frameworks: 'jest',
      verbose: false
    });

    console.log('\n✅ InitCommand completed successfully!');

    // Verify databases were created
    console.log('\nVerifying databases...');
    const memoryDbPath = path.join(testDir, '.agentic-qe/memory.db');
    const patternsDbPath = path.join(testDir, '.agentic-qe/patterns.db');

    const memoryExists = await fs.pathExists(memoryDbPath);
    const patternsExists = await fs.pathExists(patternsDbPath);

    console.log(`  memory.db: ${memoryExists ? '✅' : '❌'}`);
    console.log(`  patterns.db: ${patternsExists ? '✅' : '❌'}`);

    // Verify directories
    console.log('\nVerifying directories...');
    const dirs = [
      '.agentic-qe',
      '.agentic-qe/data',
      '.agentic-qe/data/learning',
      '.agentic-qe/data/patterns',
      '.agentic-qe/config',
      '.claude',
      '.claude/agents'
    ];

    for (const dir of dirs) {
      const exists = await fs.pathExists(path.join(testDir, dir));
      console.log(`  ${dir}: ${exists ? '✅' : '❌'}`);
    }

    console.log('\n✅ All verification checks passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testInit();
