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
    // OOM & Segfault Prevention for DevPod/Codespaces
    // Problems:
    // 1. 286 test files × HNSW (100MB) + WASM (20MB) = OOM
    // 2. Concurrent HNSW native module access = segfault
    // Solution: Use forks pool with limited workers for process isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,     // Limit to 2 parallel processes
        minForks: 1,
        isolate: true,   // Full process isolation prevents native module conflicts
      },
    },
    // Disable file parallelism - run one test file at a time per worker
    fileParallelism: false,
    // Sequence heavy integration tests
    sequence: {
      shuffle: false,
    },
    // Fail fast on OOM-prone environments
    bail: process.env.CI ? 5 : 0,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
