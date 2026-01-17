/**
 * Q-Learning Test Registration File
 *
 * Re-exports all Q-learning related tests to ensure they're detected by the verification script.
 * This file serves as an entry point for all learning system tests.
 */

// Re-export unit tests
export * from './learning/QLearning.test';
export * from './learning/ExperienceReplayBuffer.test';

// Re-export integration tests
export * from './learning/integration.test';

// Re-export convergence validation tests
export * from './learning/convergence.test';

// Re-export performance benchmark tests
export * from './learning/performance.test';

/**
 * Test suite summary:
 * - QLearning.test.ts: Core Q-learning algorithm tests
 * - ExperienceReplayBuffer.test.ts: Experience replay buffer tests
 * - integration.test.ts: End-to-end integration tests
 * - convergence.test.ts: Q-value convergence and 20% improvement validation
 * - performance.test.ts: Performance benchmarks for learning operations
 */
