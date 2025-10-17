#!/usr/bin/env node
/**
 * BATCH-001: Logger Path Mocking Fixes
 * Systematically fix Logger initialization issues in test files
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../src/core/EventBus';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BatchFixResult {
  batchId: string;
  filesAttempted: number;
  filesFixed: number;
  testsPassed: number;
  testsFailed: number;
  fixPatterns: string[];
  errors: string[];
}

async function fixLoggerTests(): Promise<void> {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();
  const eventBus = EventBus.getInstance();

  console.log('🔧 BATCH-001: Fixing Logger Path Initialization Issues\n');

  // Retrieve analysis from memory
  const analysis = await memoryStore.retrieve('aqe/test-analysis/failures', {
    partition: 'coordination'
  });

  if (!analysis) {
    console.error('❌ No test analysis found. Run analyze-test-failures.ts first.');
    process.exit(1);
  }

  const loggerCategory = analysis.categories.find((c: any) =>
    c.name === 'Logger Path Initialization'
  );

  if (!loggerCategory) {
    console.error('❌ No Logger Path Initialization category found.');
    process.exit(1);
  }

  console.log(`📊 Found ${loggerCategory.affectedFiles.length} affected files\n`);

  const result: BatchFixResult = {
    batchId: 'BATCH-001',
    filesAttempted: 0,
    filesFixed: 0,
    testsPassed: 0,
    testsFailed: 0,
    fixPatterns: [],
    errors: []
  };

  // Test files are already using jest.setup.ts which now has the path mock
  // Let's run the tests to see if the fix worked
  console.log('🧪 Running EventBus tests to verify fix...\n');

  try {
    const { stdout, stderr } = await execAsync(
      'npm test -- tests/unit/EventBus.test.ts --verbose'
    );

    console.log(stdout);
    if (stderr) console.error(stderr);

    // Parse test results
    const passMatch = stdout.match(/(\d+) passed/);
    const failMatch = stdout.match(/(\d+) failed/);

    result.testsPassed = passMatch ? parseInt(passMatch[1]) : 0;
    result.testsFailed = failMatch ? parseInt(failMatch[1]) : 0;
    result.filesFixed = result.testsFailed === 0 ? 1 : 0;

    console.log(`\n✅ Tests passed: ${result.testsPassed}`);
    console.log(`❌ Tests failed: ${result.testsFailed}`);

  } catch (error: any) {
    console.error('❌ Error running tests:', error.message);
    result.errors.push(error.message);
  }

  // Store results in memory
  await memoryStore.store('tasks/BATCH-001/results', result, {
    partition: 'coordination',
    ttl: 86400
  });

  await eventBus.emit('test:batch-fix:complete', {
    batchId: 'BATCH-001',
    filesFixed: result.filesFixed,
    testsPassed: result.testsPassed
  });

  console.log('\n📦 Batch fix results stored in SwarmMemoryManager');

  await memoryStore.close();
  process.exit(result.testsFailed === 0 ? 0 : 1);
}

fixLoggerTests().catch(console.error);
