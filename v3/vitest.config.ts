/**
 * Agentic QE v3 - Vitest Configuration
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
    maxForks: 6,       // 6 parallel forked processes (8 cores available)
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
