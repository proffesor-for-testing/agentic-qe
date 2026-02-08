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
      // Ensure all test processes use the repo root database, not v3/.agentic-qe/
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
    // CI uses 1GB heap — keep sequential to avoid OOM. Local dev uses parallel forks.
    fileParallelism: !process.env.CI,
    maxForks: process.env.CI ? 2 : 6,
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
