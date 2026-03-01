/**
 * Integration Test DB Isolation
 *
 * Import this in integration test files that use services with KV persistence
 * (e.g., ComplianceReporter, EvolutionPipeline, ContinueGate).
 *
 * Creates an isolated temp database per test file so tests never touch
 * the main .agentic-qe/memory.db. The temp directory is created before
 * all tests and destroyed after all tests complete.
 *
 * Usage in test files:
 *   import '../setup';  // at the top of the test file
 */

import { beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let testProjectRoot: string | null = null;
let originalProjectRoot: string | undefined;

beforeAll(() => {
  // Save original value to restore in afterAll
  originalProjectRoot = process.env.AQE_PROJECT_ROOT;

  // Reset any existing singleton from a previous test file in the same worker
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

  // Restore original project root
  if (originalProjectRoot !== undefined) {
    process.env.AQE_PROJECT_ROOT = originalProjectRoot;
  }

  // Clean up the temp directory
  if (testProjectRoot && fs.existsSync(testProjectRoot)) {
    fs.rmSync(testProjectRoot, { recursive: true, force: true });
  }
  testProjectRoot = null;
});
