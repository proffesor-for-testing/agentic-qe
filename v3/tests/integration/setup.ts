/**
 * Integration Test Setup
 *
 * Creates an isolated test database so integration tests never touch
 * the main .agentic-qe/memory.db. A fresh temporary directory is created
 * before each test file and destroyed after all its tests complete.
 *
 * This runs as a vitest setupFile — beforeAll/afterAll fire per test file.
 */

import { beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let testProjectRoot: string;

beforeAll(() => {
  // Reset any existing singleton from a previous test file in the same worker.
  // This ensures each test file gets a fresh DB connection.
  try {
    const { UnifiedMemoryManager } = require('../../src/kernel/unified-memory');
    UnifiedMemoryManager.resetInstance();
  } catch {
    // Not available — no singleton to reset
  }

  // Create a temp directory that mimics a project root with .agentic-qe/
  testProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-test-'));
  fs.mkdirSync(path.join(testProjectRoot, '.agentic-qe'), { recursive: true });

  // Override the project root so all DB access goes to the temp directory
  process.env.AQE_PROJECT_ROOT = testProjectRoot;
});

afterAll(() => {
  // Reset the singleton so it doesn't hold a connection to the temp DB
  try {
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
