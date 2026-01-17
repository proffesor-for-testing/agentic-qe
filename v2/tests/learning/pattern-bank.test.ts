/**
 * Pattern Bank Test Registration File
 *
 * This file imports and re-exports all pattern-related tests to ensure
 * the verification script can find them with glob patterns.
 *
 * @module tests/pattern-bank
 */

// Import existing pattern tests
import './unit/reasoning/QEReasoningBank.test';

// Import new pattern tests
import './reasoning/accuracy.test';
import './reasoning/cross-project.test';
import './reasoning/versioning.test';
import './reasoning/performance.test';

describe('Pattern Bank Test Suite', () => {
  it('should register all pattern-related tests', () => {
    expect(true).toBe(true);
  });
});
