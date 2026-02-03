/**
 * Phase 07: Hooks
 * Configures Claude Code hooks for learning integration
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import type { AQEInitConfig } from '../types.js';

export interface HooksResult {
  configured: boolean;
  settingsPath: string;
  hookTypes: string[];
}

/**
 * Hooks phase - configures Claude Code hooks
 */
export class HooksPhase extends BasePhase<HooksResult> {
  readonly name = 'hooks';
  readonly description = 'Configure Claude Code hooks';
  readonly order = 70;
  readonly critical = false;
  readonly requiresPhases = ['configuration'] as const;

  async shouldRun(context: InitContext): Promise<boolean> {
    const config = context.config as AQEInitConfig;
    return config?.hooks?.claudeCode ?? true;
  }

  protected async run(context: InitContext): Promise<HooksResult> {
    const config = context.config as AQEInitConfig;
    const { projectRoot } = context;

    if (!config.hooks.claudeCode) {
      return {
        configured: false,
        settingsPath: '',
        hookTypes: [],
      };
    }

    // Create .claude directory
    const claudeDir = join(projectRoot, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Load existing settings
    const settingsPath = join(claudeDir, 'settings.json');
    let settings: Record<string, unknown> = {};

    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        settings = {};
      }
    }

    // Configure hooks
    const hooks = this.generateHooksConfig(config);
    const hookTypes = Object.keys(hooks);

    // Merge with existing hooks (deduplicate by command string)
    const existingHooks = settings.hooks as Record<string, unknown[]> || {};
    const mergedHooks: Record<string, unknown[]> = {};

    for (const [hookType, hookArray] of Object.entries(hooks)) {
      const existing = existingHooks[hookType] || [];
      const newHooks = hookArray as Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>;

      // Build set of existing commands for deduplication
      const existingCommands = new Set<string>();
      for (const hook of existing) {
        const h = hook as { matcher?: string; hooks?: Array<{ command?: string }> };
        if (h.hooks) {
          for (const innerHook of h.hooks) {
            if (innerHook.command) {
              existingCommands.add(innerHook.command);
            }
          }
        }
      }

      // Only add hooks that don't already exist
      const uniqueNewHooks = newHooks.filter(hook => {
        if (!hook.hooks) return true;
        // Check if any of the hook's commands already exist
        return !hook.hooks.some(h => h.command && existingCommands.has(h.command));
      });

      mergedHooks[hookType] = [...existing, ...uniqueNewHooks];
    }

    // Preserve hooks not in our list
    for (const [hookType, hookArray] of Object.entries(existingHooks)) {
      if (!mergedHooks[hookType]) {
        mergedHooks[hookType] = hookArray;
      }
    }

    settings.hooks = mergedHooks;

    // Add environment variables
    const existingEnv = settings.env as Record<string, string> || {};
    settings.env = {
      ...existingEnv,
      AQE_MEMORY_PATH: '.agentic-qe/memory.db',
      AQE_V3_MODE: 'true',
      AQE_LEARNING_ENABLED: config.learning.enabled ? 'true' : 'false',
    };

    // Add AQE metadata
    settings.aqe = {
      version: config.version,
      initialized: new Date().toISOString(),
      hooksConfigured: true,
    };

    // Enable MCP server
    const existingMcp = settings.enabledMcpjsonServers as string[] || [];
    if (!existingMcp.includes('aqe')) {
      settings.enabledMcpjsonServers = [...existingMcp, 'aqe'];
    }

    // Write settings
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    context.services.log(`  Settings: ${settingsPath}`);
    context.services.log(`  Hook types: ${hookTypes.join(', ')}`);

    return {
      configured: true,
      settingsPath,
      hookTypes,
    };
  }

  /**
   * Generate hooks configuration
   */
  private generateHooksConfig(config: AQEInitConfig): Record<string, unknown[]> {
    return {
      PreToolUse: [
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_file_path" ] && npx agentic-qe hooks pre-edit --file "$TOOL_INPUT_file_path" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Bash$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_command" ] && npx agentic-qe hooks pre-command --command "$TOOL_INPUT_command" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Task$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_prompt" ] && npx agentic-qe hooks pre-task --task-id "task-$(date +%s)" --description "$TOOL_INPUT_prompt" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],

      PostToolUse: [
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_file_path" ] && npx agentic-qe hooks post-edit --file "$TOOL_INPUT_file_path" --success "${TOOL_SUCCESS:-true}" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Bash$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_command" ] && npx agentic-qe hooks post-command --command "$TOOL_INPUT_command" --success "${TOOL_SUCCESS:-true}" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Task$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_RESULT_agent_id" ] && npx agentic-qe hooks post-task --task-id "$TOOL_RESULT_agent_id" --success "${TOOL_SUCCESS:-true}" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],

      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: '[ -n "$PROMPT" ] && npx agentic-qe hooks route --task "$PROMPT" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],

      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: '[ -n "$SESSION_ID" ] && npx agentic-qe hooks session-start --session-id "$SESSION_ID" 2>/dev/null || true',
              timeout: 10000,
              continueOnError: true,
            },
          ],
        },
      ],

      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'npx agentic-qe hooks session-end --save-state 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],
    };
  }
}

// Instance exported from index.ts
