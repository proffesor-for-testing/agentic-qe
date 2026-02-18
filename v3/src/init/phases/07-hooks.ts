/**
 * Phase 07: Hooks
 * Configures Claude Code hooks for learning integration.
 *
 * Smart merge strategy:
 * - Detects existing AQE/agentic-qe hooks and REPLACES them (no duplicates)
 * - Preserves any non-AQE hooks from the user's existing config
 * - Adds full env vars and v3 settings sections
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { safeJsonParse } from '../../shared/safe-json.js';
import {
  isAqeHookEntry,
  mergeHooksSmart,
  generateAqeEnvVars,
  generateV3SettingsSections,
} from '../settings-merge.js';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import type { AQEInitConfig } from '../types.js';

export interface HooksResult {
  configured: boolean;
  settingsPath: string;
  hookTypes: string[];
  existingAqeDetected: boolean;
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
        existingAqeDetected: false,
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
        settings = safeJsonParse<Record<string, unknown>>(content);
      } catch {
        settings = {};
      }
    }

    // Generate new AQE hooks
    const aqeHooks = this.generateHooksConfig(config);
    const hookTypes = Object.keys(aqeHooks);

    // Detect if there are existing AQE hooks
    const existingHooks = (settings.hooks as Record<string, unknown[]>) || {};
    const existingAqeDetected = this.hasExistingAqeHooks(existingHooks);

    if (existingAqeDetected) {
      context.services.log('  Detected existing AQE hooks — replacing with updated config');
    }

    // Smart merge: remove old AQE hooks, keep user hooks, add new AQE hooks
    settings.hooks = mergeHooksSmart(existingHooks, aqeHooks);

    // Set full AQE environment variables
    const existingEnv = (settings.env as Record<string, string>) || {};
    settings.env = {
      ...existingEnv,
      ...generateAqeEnvVars(config),
    };

    // Apply v3 settings sections (statusLine, permissions, v3Configuration, v3Learning, etc.)
    const v3Sections = generateV3SettingsSections(config);
    for (const [key, value] of Object.entries(v3Sections)) {
      settings[key] = value;
    }

    // Enable MCP servers (deduplicate, replace old 'aqe' with 'agentic-qe')
    let existingMcp = (settings.enabledMcpjsonServers as string[]) || [];
    // Remove legacy 'aqe' entry if present (renamed to 'agentic-qe')
    existingMcp = existingMcp.filter(s => s !== 'aqe');
    if (!existingMcp.includes('agentic-qe')) {
      existingMcp.push('agentic-qe');
    }
    settings.enabledMcpjsonServers = existingMcp;

    // Write settings
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    context.services.log(`  Settings: ${settingsPath}`);
    context.services.log(`  Hook types: ${hookTypes.join(', ')}`);

    return {
      configured: true,
      settingsPath,
      hookTypes,
      existingAqeDetected,
    };
  }

  /**
   * Check if existing hooks contain any AQE/agentic-qe entries
   */
  private hasExistingAqeHooks(hooks: Record<string, unknown[]>): boolean {
    for (const hookArray of Object.values(hooks)) {
      if (!Array.isArray(hookArray)) continue;
      for (const entry of hookArray) {
        if (isAqeHookEntry(entry)) return true;
      }
    }
    return false;
  }

  /**
   * Generate hooks configuration
   *
   * Uses `npx agentic-qe` for portability - works without global installation.
   * All hooks use --json output for structured data and fail silently with continueOnError.
   */
  private generateHooksConfig(_config: AQEInitConfig): Record<string, unknown[]> {
    // Shell injection safety: env vars like $TOOL_INPUT_file_path are set by
    // Claude Code as environment variables before invoking the hook command.
    // We pass them via --file "$TOOL_INPUT_file_path" which is safe because
    // the shell expands the env var into a single quoted argument. We avoid
    // constructing shell commands from user-controlled $TOOL_INPUT_prompt or
    // $TOOL_INPUT_command by using env-var passthrough where possible.

    return {
      PreToolUse: [
        // File guardian — MUST be first to block before learning hooks run
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [
            {
              type: 'command',
              command: 'npx agentic-qe hooks guard --file "$TOOL_INPUT_file_path" --json',
              timeout: 3000,
              continueOnError: true,
            },
          ],
        },
        // Learning: pre-edit context
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [
            {
              type: 'command',
              command: 'npx agentic-qe hooks pre-edit --file "$TOOL_INPUT_file_path" --json',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        // Command bouncer — blocks dangerous commands
        {
          matcher: '^Bash$',
          hooks: [
            {
              type: 'command',
              command: 'npx agentic-qe hooks pre-command --command "$TOOL_INPUT_command" --json',
              timeout: 3000,
              continueOnError: true,
            },
          ],
        },
        // Task routing
        {
          matcher: '^Task$',
          hooks: [
            {
              type: 'command',
              command: 'npx agentic-qe hooks pre-task --description "$TOOL_INPUT_prompt" --json',
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
              command: 'npx agentic-qe hooks post-edit --file "$TOOL_INPUT_file_path" --success --json',
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
              command: 'npx agentic-qe hooks post-command --command "$TOOL_INPUT_command" --success --json',
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
              command: 'npx agentic-qe hooks post-task --task-id "$TOOL_RESULT_agent_id" --success --json',
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
              command: 'npx agentic-qe hooks route --task "$PROMPT" --json',
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
              command: 'npx agentic-qe hooks session-start --session-id "$SESSION_ID" --json',
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
              command: 'npx agentic-qe hooks session-end --save-state --json',
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
