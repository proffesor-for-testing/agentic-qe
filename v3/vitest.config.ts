/**
 * Agentic QE v3 - Vitest Configuration
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import os from 'os';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      // ISOLATION: Use temp directory so tests never write to production memory.db.
      // Each test process (via forks pool) gets its own DB in the OS temp dir.
      // This prevents test runs from inflating .agentic-qe/memory.db.
      AQE_PROJECT_ROOT: path.join(os.tmpdir(), `aqe-vitest-${process.pid}`),
    },
    include: ['tests/**/*.test.ts'],
    benchmark: {
      include: ['tests/**/*.bench.ts'],
    },
    exclude: [
      'node_modules',
      'dist',
      '**/browser/**',
      '**/*.e2e.test.ts',
      '**/vibium/**',
      '**/browser-swarm-coordinator.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'junit'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
    testTimeout: 10000,
    hookTimeout: 15000,  // Prevent beforeEach/afterEach hangs (e.g., fleet init)
    // OOM & Segfault Prevention for DevPod/Codespaces (Vitest 4 format)
    // Process isolation via forks prevents HNSW native module segfaults.
    // fileParallelism is OFF in DevPod to prevent concurrent fleet inits from
    // allocating multiple HNSW indices + Queen + Kernel stacks simultaneously.
    // CI uses sequential execution too since test files share global fleet state.
    pool: 'forks',
    // OOM Prevention (Issue #294):
    // DevPod has 16GB total. VS Code (~2GB) + Claude (~5GB) = 7GB overhead.
    // Each fleet init allocates ~200-400MB (13 domain plugins + HNSW native memory).
    // With maxForks=2 + main process: 3 × 1GB heap + native = ~4-5GB for tests.
    // Setting maxForks=1 keeps peak at ~2-3GB, leaving headroom for the environment.
    fileParallelism: false,
    maxForks: 1,
    minForks: 1,
    isolate: true,     // Full process isolation prevents native module conflicts
    // Fail fast on OOM-prone environments
    bail: process.env.CI ? 5 : 3,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@kernel': path.resolve(__dirname, './src/kernel'),
      '@domains': path.resolve(__dirname, './src/domains'),
      '@coordination': path.resolve(__dirname, './src/coordination'),
      '@adapters': path.resolve(__dirname, './src/adapters'),
      '@integrations': path.resolve(__dirname, './src/integrations'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
