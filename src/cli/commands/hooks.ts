#!/usr/bin/env node

/**
 * Agentic QE v3 - Hooks Commands
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Self-learning hooks system for pattern recognition and guidance generation.
 * This module composes all hooks subcommands from per-handler modules.
 */

import { Command } from 'commander';
import { QE_HOOK_EVENTS } from '../../learning/qe-hooks.js';
import {
  getHooksSystem,
  state,
  type HooksSystemState,
} from './hooks-handlers/hooks-shared.js';
import { registerEditingHooks } from './hooks-handlers/editing-hooks.js';
import { registerRoutingHooks } from './hooks-handlers/routing-hooks.js';
import { registerStatsHooks } from './hooks-handlers/stats-hooks.js';
import { registerSessionHooks } from './hooks-handlers/session-hooks.js';
import { registerTaskHooks } from './hooks-handlers/task-hooks.js';
import { registerCommandHooks } from './hooks-handlers/command-hooks.js';

// ============================================================================
// Hooks Command Creation
// ============================================================================

/**
 * Create the hooks command with all subcommands
 */
export function createHooksCommand(): Command {
  const hooks = new Command('hooks')
    .description('Self-learning QE hooks for pattern recognition and guidance')
    .addHelpText('after', `
Examples:
  # File editing hooks (learning from edits)
  aqe hooks pre-edit --file src/utils.ts --operation create
  aqe hooks post-edit --file src/utils.ts --success

  # Task routing and guidance
  aqe hooks route --task "Generate tests for UserService"
  aqe hooks pre-task --description "Generate tests" --json
  aqe hooks post-task --task-id "task-123" --success true

  # Bash command hooks
  aqe hooks pre-command --command "npm test" --json
  aqe hooks post-command --command "npm test" --success true

  # Session lifecycle (Stop hook)
  aqe hooks session-start --session-id "session-123"
  aqe hooks session-end --save-state --json

  # Pattern management
  aqe hooks learn --name "test-pattern" --description "A test pattern"
  aqe hooks search --query "authentication"
  aqe hooks stats
  aqe hooks list
    `);

  // Register all handler groups
  registerEditingHooks(hooks);
  registerRoutingHooks(hooks);
  registerStatsHooks(hooks);
  registerSessionHooks(hooks);
  registerTaskHooks(hooks);
  registerCommandHooks(hooks);

  return hooks;
}

// ============================================================================
// Exports
// ============================================================================

export {
  getHooksSystem,
  state as hooksState,
  QE_HOOK_EVENTS,
  type HooksSystemState,
};
