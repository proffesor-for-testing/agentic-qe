/**
 * Agentic QE v3 - Vitest Configuration
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      // Default: point at repo root so unit tests that accidentally touch DB
      // don't create a shadow v3/.agentic-qe/. Integration tests override this
      // in their setup file to use a temp directory (tests/integration/setup.ts).
      AQE_PROJECT_ROOT: path.resolve(__dirname, '..'),
    },
    include: ['tests/**/*.test.ts'],
    benchmark: {
      include: ['tests/**/*.bench.ts'],
    },
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
    testTimeout: 10000,
    hookTimeout: 15000,  // Prevent beforeEach/afterEach hangs (e.g., fleet init)
    // OOM & Segfault Prevention for DevPod/Codespaces (Vitest 4 format)
    // Process isolation via forks prevents HNSW native module segfaults.
    // fileParallelism is ON (default) so multiple files run concurrently
    // across forked workers — safe because each fork has its own HNSW instance.
    pool: 'forks',
    // OOM Prevention: Container cgroup = 8GB. NODE_OPTIONS=--max-old-space-size=2048 is
    // inherited by EVERY fork, so 3 processes × 2GB = 6GB for tests alone — leaving no
    // room for VS Code (~2GB) + Claude (~5GB). Fix: npm test script overrides NODE_OPTIONS
    // to --max-old-space-size=1024, capping ALL processes (main + forks) to 1GB each.
    fileParallelism: !process.env.CI,
    maxForks: 2,
    minForks: 1,
    isolate: true,     // Full process isolation prevents native module conflicts
    // Fail fast on OOM-prone environments
    bail: process.env.CI ? 5 : 0,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
