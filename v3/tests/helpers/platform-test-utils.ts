/**
 * Shared test utilities for platform installer tests.
 * Provides mock fs setup and assertion helpers.
 */

import { vi, type Mock } from 'vitest';

export interface MockFsHandles {
  existsSync: Mock;
  mkdirSync: Mock;
  writeFileSync: Mock;
  readFileSync: Mock;
}

/**
 * Set up fs mocks and return typed handles.
 * Call this INSIDE vi.mock('fs', ...) or use the returned mocks after vi.mock.
 */
export function getMockFs(): MockFsHandles {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  return {
    existsSync: fs.existsSync as Mock,
    mkdirSync: fs.mkdirSync as Mock,
    writeFileSync: fs.writeFileSync as Mock,
    readFileSync: fs.readFileSync as Mock,
  };
}

/**
 * Assert that writeFileSync was called with the given path and content matching a regex or string.
 */
export function expectFileWritten(
  writeFileSync: Mock,
  path: string,
  contentMatcher: string | RegExp
): void {
  const call = writeFileSync.mock.calls.find(
    (c: unknown[]) => c[0] === path
  );
  if (!call) {
    throw new Error(`writeFileSync was not called with path: ${path}`);
  }
  if (typeof contentMatcher === 'string') {
    expect(call[1]).toContain(contentMatcher);
  } else {
    expect(call[1]).toMatch(contentMatcher);
  }
}

/**
 * Assert that mkdirSync was called with the given path.
 */
export function expectDirCreated(mkdirSync: Mock, path: string): void {
  const call = mkdirSync.mock.calls.find(
    (c: unknown[]) => c[0] === path
  );
  if (!call) {
    throw new Error(`mkdirSync was not called with path: ${path}`);
  }
}

// Re-export expect from vitest for use in helpers
import { expect } from 'vitest';
