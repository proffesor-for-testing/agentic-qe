/**
 * Claude Code configuration module
 *
 * Generates Claude Code settings and MCP server configuration
 * CRITICAL for the learning system to function!
 *
 * @module cli/init/claude-config
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FleetConfig } from '../../types';

/**
 * Generate Claude Code settings
 *
 * Creates the .claude/settings.json file with proper MCP server configuration
 *
 * @param config - Fleet configuration
 */
export async function generateClaudeSettings(_fleetConfig: FleetConfig): Promise<void> {
  const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');

  // Check if settings.json already exists
  const settingsExists = await fs.pathExists(settingsPath);

  let existingSettings: any = {};
  if (settingsExists) {
    console.log(chalk.yellow('  ⓘ  .claude/settings.json already exists - merging AQE configuration'));
    try {
      existingSettings = await fs.readJson(settingsPath);
    } catch (error) {
      console.log(chalk.red('  ⚠️  Could not parse existing settings.json - creating backup'));
      await fs.copy(settingsPath, `${settingsPath}.backup`);
      console.log(chalk.gray(`    Backup saved to: ${settingsPath}.backup`));
    }
  }

  // Merge AQE settings with existing settings
  const aqeEnv = {
    AGENTDB_LEARNING_ENABLED: "true",
    AGENTDB_REASONING_ENABLED: "true",
    AGENTDB_AUTO_TRAIN: "true",
    AQE_MEMORY_ENABLED: "true"
  };

  const aqePermissions = [
    "Bash(npx agentdb:*)",
    "Bash(npx aqe:*)",
    "Bash(npm run test:*)",
    "Bash(git status)",
    "Bash(git diff:*)",
    "Bash(git log:*)",
    "Bash(git add:*)",
    "Bash(git commit:*)"
  ];

  const settings = {
    ...existingSettings,
    env: {
      ...(existingSettings.env || {}),
      ...aqeEnv
    },
    permissions: {
      allow: Array.from(new Set([
          ...(existingSettings.permissions?.allow || []),
          ...aqePermissions
        ])),
      deny: existingSettings.permissions?.deny || []
    },
    hooks: mergeHooks(existingSettings.hooks, getAQEHooks()),
    enabledMcpjsonServers: Array.from(new Set([
        ...(existingSettings.enabledMcpjsonServers || []),
        "agentic-qe"
      ]))
  };

  await fs.ensureDir(path.dirname(settingsPath));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });

  if (settingsExists) {
    console.log(chalk.green('  ✓ Merged AQE configuration into existing .claude/settings.json'));
  } else {
    console.log(chalk.green('  ✓ Created .claude/settings.json with AgentDB learning hooks'));
  }
  console.log(chalk.gray('    • PreToolUse: Semantic search + failure pattern detection'));
  console.log(chalk.gray('    • PostToolUse: Experience replay + verdict-based quality'));
  console.log(chalk.gray('    • Stop: Model training + memory optimization'));
}

/**
 * Get AQE hooks configuration
 *
 * SECURITY: All hook commands use jq -R '@sh' for proper shell escaping
 * to prevent shell injection attacks from malicious file paths/inputs.
 */
function getAQEHooks(): any {
  return {
    PreToolUse: [
      {
        matcher: "Write|Edit|MultiEdit",
        hooks: [
          {
            type: "command",
            description: "Semantic Search - Query similar successful past edits",
            command: "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | jq -R '@sh' | xargs -I {} bash -c 'FILE={}; npx agentdb@latest query --domain \"successful-edits\" --query \"file:$FILE\" --k 5 --min-confidence 0.8 --format json 2>/dev/null | jq -r \".memories[]? | \\\"💡 Past Success: \\(.pattern.summary // \\\"No similar patterns found\\\")\\\" \" 2>/dev/null || true'"
          },
          {
            type: "command",
            description: "Failure Pattern Recognition - Warn about known failure patterns",
            command: "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | jq -R '@sh' | xargs -I {} bash -c 'FILE={}; npx agentdb@latest query --domain \"failed-edits\" --query \"file:$FILE\" --k 3 --min-confidence 0.7 --format json 2>/dev/null | jq -r \".memories[]? | \\\"🚨 Warning: Similar edit failed - \\(.pattern.reason // \\\"unknown\\\")\\\" \" 2>/dev/null || true'"
          }
        ]
      },
      {
        matcher: "Task",
        hooks: [
          {
            type: "command",
            description: "Trajectory Prediction - Predict optimal task sequence",
            command: "cat | jq -r '.tool_input.prompt // .tool_input.task // empty' | jq -R '@sh' | xargs -I {} bash -c 'TASK={}; npx agentdb@latest query --domain \"task-trajectories\" --query \"task:$TASK\" --k 3 --min-confidence 0.75 --format json 2>/dev/null | jq -r \".memories[]? | \\\"📋 Predicted Steps: \\(.pattern.trajectory // \\\"No trajectory data\\\") (Success Rate: \\(.confidence // 0))\\\" \" 2>/dev/null || true'"
          }
        ]
      }
    ],
    PostToolUse: [
      {
        matcher: "Write|Edit|MultiEdit",
        hooks: [
          {
            type: "command",
            description: "Experience Replay - Capture edit as RL experience",
            command: "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | jq -R '@sh' | xargs -I {} bash -c 'FILE={}; TIMESTAMP=$(date +%s); npx agentdb@latest store-pattern --type \"experience\" --domain \"code-edits\" --pattern \"{\\\"file\\\":$FILE,\\\"timestamp\\\":$TIMESTAMP,\\\"action\\\":\\\"edit\\\",\\\"state\\\":\\\"pre-test\\\"}\" --confidence 0.5 2>/dev/null || true'"
          },
          {
            type: "command",
            description: "Verdict-Based Quality - Async verdict assignment after tests",
            command: "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | jq -R '@sh' | xargs -I {} bash -c 'FILE={}; (sleep 2; TEST_RESULT=$(npm test --silent 2>&1 | grep -q \"pass\" && echo \"ACCEPT\" || echo \"REJECT\"); REWARD=$([ \"$TEST_RESULT\" = \"ACCEPT\" ] && echo \"1.0\" || echo \"-1.0\"); npx agentdb@latest store-pattern --type \"verdict\" --domain \"code-quality\" --pattern \"{\\\"file\\\":$FILE,\\\"verdict\\\":\\\"$TEST_RESULT\\\",\\\"reward\\\":$REWARD}\" --confidence $([ \"$TEST_RESULT\" = \"ACCEPT\" ] && echo \"0.95\" || echo \"0.3\") 2>/dev/null; if [ \"$TEST_RESULT\" = \"ACCEPT\" ]; then npx agentdb@latest store-pattern --type \"success\" --domain \"successful-edits\" --pattern \"{\\\"file\\\":$FILE,\\\"summary\\\":\\\"Edit passed tests\\\"}\" --confidence 0.9 2>/dev/null; else npx agentdb@latest store-pattern --type \"failure\" --domain \"failed-edits\" --pattern \"{\\\"file\\\":$FILE,\\\"reason\\\":\\\"Tests failed\\\"}\" --confidence 0.8 2>/dev/null; fi) &'"
          }
        ]
      },
      {
        matcher: "Task",
        hooks: [
          {
            type: "command",
            description: "Trajectory Storage - Record task trajectory for learning",
            command: "cat | jq -r '.tool_input.prompt // .tool_input.task // empty, .result.success // \"unknown\"' | paste -d'\\n' - - | jq -Rs 'split(\"\\n\") | {task: (.[0] | @sh), success: .[1]}' | jq -r 'CONFIDENCE=(if .success == \"true\" then \"0.95\" else \"0.5\" end); \"TASK=\\(.task); SUCCESS=\\(.success); npx agentdb@latest store-pattern --type trajectory --domain task-trajectories --pattern \\(\"{\\\\\\\"task\\\\\\\":\\\" + .task + \",\\\\\\\"success\\\\\\\":\\(.success),\\\\\\\"trajectory\\\\\\\":\\\\\\\"search→scaffold→test→refine\\\\\\\"}\\\" | @sh) --confidence \\(CONFIDENCE) 2>/dev/null || true\"' | bash"
          }
        ]
      }
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            description: "Session end - Train models and compress learnings",
            command: "bash -c 'npx agentdb@latest train --domain \"code-edits\" --epochs 10 --batch-size 32 2>/dev/null || true; npx agentdb@latest optimize-memory --compress true --consolidate-patterns true 2>/dev/null || true'"
          }
        ]
      }
    ]
  };
}

/**
 * Merge existing hooks with AQE hooks (avoiding duplicates)
 */
function mergeHooks(existing: any, aqeHooks: any): any {
  if (!existing) {
    return aqeHooks;
  }

  const merged: any = { ...existing };

  // Merge each hook type
  for (const hookType of ['PreToolUse', 'PostToolUse', 'Stop', 'PreCompact']) {
    if (aqeHooks[hookType]) {
      if (!merged[hookType]) {
        merged[hookType] = aqeHooks[hookType];
      } else {
        // Append AQE hooks to existing hooks (avoid duplicates based on description)
        const existingDescriptions = new Set(
          merged[hookType].flatMap((item: any) =>
            item.hooks?.map((h: any) => h.description) || [item.description]
          ).filter(Boolean)
        );

        for (const aqeHook of aqeHooks[hookType]) {
          const aqeDescriptions = aqeHook.hooks?.map((h: any) => h.description) || [aqeHook.description];
          const hasAnyDuplicate = aqeDescriptions.some((desc: string) => existingDescriptions.has(desc));

          if (!hasAnyDuplicate) {
            merged[hookType].push(aqeHook);
          }
        }
      }
    }
  }

  return merged;
}

/**
 * Setup MCP server configuration
 *
 * Configures the Model Context Protocol server for agent coordination
 */
export async function setupMCPServer(): Promise<void> {
  console.log(chalk.cyan('\n  🔌 Setting up MCP server integration...\n'));

  try {
    // Check if claude CLI is available
    const { execSync } = require('child_process');

    try {
      execSync('which claude', { stdio: 'ignore' });
    } catch {
      console.log(chalk.yellow('  ⚠️  Claude Code CLI not found'));
      console.log(chalk.gray('  ℹ️  Please add MCP server manually after installing Claude Code:'));
      console.log(chalk.cyan('     claude mcp add agentic-qe npx aqe-mcp'));
      console.log(chalk.gray('\n  Download Claude Code: https://claude.com/claude-code'));
      return;
    }

    // Check if MCP server is already added
    try {
      const mcpList = execSync('claude mcp list', { encoding: 'utf-8' });
      if (mcpList.includes('agentic-qe')) {
        console.log(chalk.green('  ✓ MCP server already configured'));
        console.log(chalk.gray('    • Server: agentic-qe'));
        console.log(chalk.gray('    • Command: npx aqe-mcp'));
        return;
      }
    } catch {
      // Ignore errors, proceed with adding
    }

    // Add MCP server
    console.log(chalk.gray('  • Adding MCP server to Claude Code...'));
    execSync('claude mcp add agentic-qe npx aqe-mcp', { stdio: 'inherit' });

    console.log(chalk.green('\n  ✓ MCP server added successfully'));
    console.log(chalk.gray('    • Server: agentic-qe'));
    console.log(chalk.gray('    • Tools: 102 MCP tools available'));
    console.log(chalk.gray('    • Memory: Shared memory coordination enabled'));

  } catch (error: any) {
    console.log(chalk.yellow('  ⚠️  Could not auto-configure MCP server'));
    console.log(chalk.gray(`  Error: ${error.message}`));
    console.log(chalk.gray('\n  Please add manually:'));
    console.log(chalk.cyan('     claude mcp add agentic-qe npx aqe-mcp'));
  }
}
