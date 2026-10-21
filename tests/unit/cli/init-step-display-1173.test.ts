/**
 * `aqe init` step display (#1173).
 *
 * A critical phase failure used to print only the step name and then
 * "Initialization failed. Check errors above." with no error anywhere on
 * screen. The failed step's message must now be shown under it.
 */

import { describe, it, expect } from 'vitest';
import { formatInitStepLines } from '../../../src/cli/handlers/init-handler.js';

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('formatInitStepLines', () => {
  it('should_print_the_error_message_under_a_failed_step', () => {
    const lines = formatInitStepLines([
      { step: 'Generate configuration', status: 'success', message: 'Generate configuration completed', durationMs: 1 },
      {
        step: 'Initialize persistence database',
        status: 'error',
        message:
          'Initialize persistence database failed: SQLite persistence initialization FAILED: ' +
          'better-sqlite3 native module could not be loaded: its compiled binary is missing.\n' +
          '  Fix a global install (reinstall, naming the package):\n' +
          '    npm install -g agentic-qe --allow-scripts=agentic-qe,better-sqlite3,hnswlib-node',
        durationMs: 2,
      },
    ]).map(stripAnsi);

    expect(lines).toEqual([
      '  * Generate configuration (1ms)',
      '  x Initialize persistence database (2ms)',
      '      Initialize persistence database failed: SQLite persistence initialization FAILED: ' +
        'better-sqlite3 native module could not be loaded: its compiled binary is missing.',
      '        Fix a global install (reinstall, naming the package):',
      '          npm install -g agentic-qe --allow-scripts=agentic-qe,better-sqlite3,hnswlib-node',
    ]);
  });

  it('should_not_print_messages_for_successful_steps', () => {
    const lines = formatInitStepLines([
      { step: 'Analyze project structure', status: 'success', message: 'Analyze project structure completed', durationMs: 619 },
    ]).map(stripAnsi);

    expect(lines).toEqual(['  * Analyze project structure (619ms)']);
  });

  it('should_tolerate_a_failed_step_without_a_message', () => {
    const lines = formatInitStepLines([
      { step: 'Initialize persistence database', status: 'error', message: '', durationMs: 2 },
    ]).map(stripAnsi);

    expect(lines).toEqual(['  x Initialize persistence database (2ms)']);
  });
});
