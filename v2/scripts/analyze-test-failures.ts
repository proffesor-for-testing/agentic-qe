#!/usr/bin/env node
/**
 * Test Failure Analysis Script
 * Analyzes test failures and categorizes them for systematic fixing
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../src/core/EventBus';
import * as path from 'path';
import * as fs from 'fs';

interface FailureCategory {
  name: string;
  pattern: RegExp;
  priority: 'high' | 'medium' | 'low';
  fixStrategy: string;
  affectedFiles: string[];
}

async function analyzeTestFailures(): Promise<void> {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();
  const eventBus = EventBus.getInstance();

  console.log('🔍 Analyzing test failures...\n');

  // Read test log
  const logPath = path.join(process.cwd(), 'test-initial-run.log');
  let testLog = '';

  if (fs.existsSync(logPath)) {
    testLog = fs.readFileSync(logPath, 'utf-8');
  } else {
    console.error('❌ Test log file not found. Run tests first.');
    process.exit(1);
  }

  // Define failure categories
  const categories: FailureCategory[] = [
    {
      name: 'Logger Path Initialization',
      pattern: /TypeError: The "path" argument must be of type string\. Received undefined.*Logger\.ts:46/s,
      priority: 'high',
      fixStrategy: 'Mock path module in test setup to return valid paths',
      affectedFiles: []
    },
    {
      name: 'Missing await keywords',
      pattern: /Cannot read properties of undefined \(reading 'initialize'\)/,
      priority: 'high',
      fixStrategy: 'Add await to async initialization calls',
      affectedFiles: []
    },
    {
      name: 'Mock configuration issues',
      pattern: /jest\.mock.*is not a function/s,
      priority: 'high',
      fixStrategy: 'Fix jest.mock() factory functions and return types',
      affectedFiles: []
    },
    {
      name: 'Timeout errors',
      pattern: /Exceeded timeout of \d+ms/,
      priority: 'medium',
      fixStrategy: 'Increase test timeout or optimize test performance',
      affectedFiles: []
    },
    {
      name: 'Database initialization',
      pattern: /SQLITE_BUSY|database is locked/,
      priority: 'high',
      fixStrategy: 'Add database connection pooling and retry logic',
      affectedFiles: []
    }
  ];

  // Extract failed test files
  const failRegex = /FAIL (tests\/.*\.test\.ts)/g;
  const failedFiles = new Set<string>();
  let match;

  while ((match = failRegex.exec(testLog)) !== null) {
    failedFiles.add(match[1]);
  }

  console.log(`📊 Found ${failedFiles.size} failed test files\n`);

  // Categorize failures
  const analysis = {
    totalFailures: failedFiles.size,
    categories: [] as any[],
    affectedFiles: Array.from(failedFiles),
    fixBatches: [] as any[]
  };

  for (const category of categories) {
    const matches = testLog.match(category.pattern);
    if (matches && matches.length > 0) {
      // Find affected files for this category
      const affectedInCategory = Array.from(failedFiles).filter(file => {
        const fileContent = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
        return category.pattern.test(fileContent) || testLog.includes(file);
      });

      category.affectedFiles = affectedInCategory;

      analysis.categories.push({
        name: category.name,
        priority: category.priority,
        count: matches.length,
        fixStrategy: category.fixStrategy,
        affectedFiles: category.affectedFiles
      });

      console.log(`🔴 ${category.name} (${category.priority} priority)`);
      console.log(`   Occurrences: ${matches.length}`);
      console.log(`   Fix Strategy: ${category.fixStrategy}`);
      console.log(`   Affected files: ${category.affectedFiles.length}`);
      console.log('');
    }
  }

  // Create fix batches
  const batches = [
    {
      id: 'BATCH-001',
      name: 'Logger and Path Mocking',
      priority: 'high',
      files: analysis.categories
        .filter(c => c.name === 'Logger Path Initialization')
        .flatMap(c => c.affectedFiles)
        .slice(0, 15)
    },
    {
      id: 'BATCH-002',
      name: 'Async/Await Fixes',
      priority: 'high',
      files: analysis.categories
        .filter(c => c.name === 'Missing await keywords')
        .flatMap(c => c.affectedFiles)
        .slice(0, 15)
    },
    {
      id: 'BATCH-003',
      name: 'Mock Configuration',
      priority: 'high',
      files: analysis.categories
        .filter(c => c.name === 'Mock configuration issues')
        .flatMap(c => c.affectedFiles)
        .slice(0, 15)
    }
  ];

  analysis.fixBatches = batches;

  // Store analysis in SwarmMemoryManager
  await memoryStore.store('aqe/test-analysis/failures', analysis, {
    partition: 'coordination',
    ttl: 86400 // 24 hours
  });

  console.log('✅ Analysis complete and stored in SwarmMemoryManager\n');
  console.log('📦 Fix Batches Created:');
  batches.forEach(batch => {
    console.log(`   ${batch.id}: ${batch.name} (${batch.files.length} files)`);
  });

  // Emit analysis event
  await eventBus.emit('test:analysis:complete', {
    totalFailures: analysis.totalFailures,
    categories: analysis.categories.length,
    batches: batches.length
  });

  await memoryStore.close();
  process.exit(0);
}

analyzeTestFailures().catch(console.error);
