/**
 * Integration Test Setup
 *
 * Creates an isolated test database so integration tests never touch
 * the main .agentic-qe/memory.db. A temporary directory is created
 * before all tests and destroyed after all tests complete.
 */

import { beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let testProjectRoot: string;

beforeAll(() => {
  // Create a temp directory that mimics a project root with .agentic-qe/
  testProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-test-'));
  fs.mkdirSync(path.join(testProjectRoot, '.agentic-qe'), { recursive: true });

  // Override the project root so all DB access goes to the temp directory
  process.env.AQE_PROJECT_ROOT = testProjectRoot;
});

afterAll(() => {
  // Reset the singleton so it doesn't hold a connection to the temp DB
  try {
    // Dynamic import to avoid circular dependency issues at module load
    const { UnifiedMemoryManager } = require('../../src/kernel/unified-memory');
    UnifiedMemoryManager.resetInstance();
  } catch {
    // May not be available in all test environments
  }

  // Clean up the temp directory
  if (testProjectRoot && fs.existsSync(testProjectRoot)) {
    fs.rmSync(testProjectRoot, { recursive: true, force: true });
  }
});
