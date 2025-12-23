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
  // AQE_MEMORY_PATH ensures hooks use the unified QE database (.agentic-qe/memory.db)
  // Note: agentdb.db is deprecated - all QE agents now use memory.db
  const aqeEnv = {
    AQE_MEMORY_PATH: ".agentic-qe/memory.db",
    AQE_MEMORY_ENABLED: "true",
    AQE_LEARNING_ENABLED: "true"
  };

  const aqePermissions = [
    "Bash(npx aqe:*)",
    "Bash(npm run lint)",
    "Bash(npm run test:*)",
    "Bash(npm test:*)",
    "Bash(git status)",
    "Bash(git diff:*)",
    "Bash(git log:*)",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git push)",
    "Bash(git config:*)",
    "Bash(git tag:*)",
    "Bash(git branch:*)",
    "Bash(git checkout:*)",
    "Bash(git stash:*)",
    "Bash(jq:*)",
    "Bash(node:*)",
    "Bash(which:*)",
    "Bash(pwd)",
    "Bash(ls:*)"
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
    console.log(chalk.green('  ✓ Created .claude/settings.json with QE learning hooks'));
  }
  console.log(chalk.gray('    • PreToolUse: Pattern intelligence from memory.db'));
  console.log(chalk.gray('    • PostToolUse: Task visualization events'));
  console.log(chalk.gray('    • PreCompact: QE agent reminder'));
  console.log(chalk.gray('    • Stop: Session summary'));
}

/**
 * Get AQE hooks configuration
 *
 * Clean QE-only hooks that use memory.db directly via better-sqlite3.
 * Note: agentdb.db and agentdb CLI are deprecated - all QE agents use memory.db
 *
 * SECURITY: All hook commands use jq for proper input handling
 * to prevent shell injection attacks from malicious file paths/inputs.
 */
function getAQEHooks(): any {
  // Pattern intelligence hook - queries memory.db for relevant patterns when editing files
  // Uses better-sqlite3 for direct database access (fast, no external CLI dependency)
  const patternQueryCommand = `cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | head -1 | xargs -I {} node -e "const db=require('better-sqlite3')('.agentic-qe/memory.db',{readonly:true});try{const r=db.prepare(\\"SELECT pattern,confidence FROM patterns WHERE domain='code-edits' AND pattern LIKE '%\\" + process.argv[1].replace(/'/g,\\"''\\")+\\"%' ORDER BY confidence DESC LIMIT 3\\").all();r.forEach(p=>console.log('💡 Pattern:',p.pattern.substring(0,80),'('+Math.round(p.confidence*100)+'%)'));db.close()}catch(e){}" "{}" 2>/dev/null || true`;

  return {
    PreToolUse: [
      {
        matcher: "Write|Edit|MultiEdit",
        hooks: [
          {
            type: "command",
            command: patternQueryCommand
          }
        ]
      },
      {
        matcher: "Task",
        hooks: [
          {
            type: "command",
            command: "bash scripts/hooks/emit-task-spawn.sh 2>/dev/null || true"
          }
        ]
      }
    ],
    PostToolUse: [
      {
        matcher: "Task",
        hooks: [
          {
            type: "command",
            command: "node scripts/hooks/capture-task-learning.js 2>/dev/null || true"
          },
          {
            type: "command",
            command: "bash scripts/hooks/emit-task-complete.sh 2>/dev/null || true"
          }
        ]
      }
    ],
    PreCompact: [
      {
        matcher: "manual",
        hooks: [
          {
            type: "command",
            command: `/bin/bash -c 'echo "🔄 PreCompact: Review CLAUDE.md for 20 QE agents, skills, and learning protocols"'`
          }
        ]
      },
      {
        matcher: "auto",
        hooks: [
          {
            type: "command",
            command: `/bin/bash -c 'echo "🔄 Auto-Compact: 20 QE agents available. Use: npx aqe learn status"'`
          }
        ]
      }
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `echo '📊 Session ended. Run: npx aqe learn status' 2>/dev/null || true`
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
 * Generate MCP server definitions file
 *
 * Creates the .claude/mcp.json file that defines available MCP servers.
 * This is REQUIRED for enabledMcpjsonServers in settings.json to work.
 *
 * @param config - Fleet configuration
 */
export async function generateMcpJson(_fleetConfig: FleetConfig): Promise<void> {
  const mcpJsonPath = path.join(process.cwd(), '.claude', 'mcp.json');

  // Check if mcp.json already exists
  const mcpJsonExists = await fs.pathExists(mcpJsonPath);

  let existingConfig: any = { mcpServers: {} };
  if (mcpJsonExists) {
    console.log(chalk.yellow('  ⓘ  .claude/mcp.json already exists - merging AQE server'));
    try {
      existingConfig = await fs.readJson(mcpJsonPath);
      if (!existingConfig.mcpServers) {
        existingConfig.mcpServers = {};
      }
    } catch (error) {
      console.log(chalk.red('  ⚠️  Could not parse existing mcp.json - creating backup'));
      await fs.copy(mcpJsonPath, `${mcpJsonPath}.backup`);
      console.log(chalk.gray(`    Backup saved to: ${mcpJsonPath}.backup`));
    }
  }

  // Define agentic-qe MCP server
  const aqeMcpServer = {
    command: "npx",
    args: ["aqe-mcp"],
    env: {
      AQE_MEMORY_PATH: ".agentic-qe/memory.db",
      AQE_LEARNING_ENABLED: "true",
      NODE_NO_WARNINGS: "1"
    }
  };

  // Merge with existing config
  const mcpConfig = {
    mcpServers: {
      ...existingConfig.mcpServers,
      "agentic-qe": aqeMcpServer
    }
  };

  await fs.ensureDir(path.dirname(mcpJsonPath));
  await fs.writeJson(mcpJsonPath, mcpConfig, { spaces: 2 });

  if (mcpJsonExists) {
    console.log(chalk.green('  ✓ Merged agentic-qe server into existing .claude/mcp.json'));
  } else {
    console.log(chalk.green('  ✓ Created .claude/mcp.json with agentic-qe server'));
  }
  console.log(chalk.gray('    • Server: agentic-qe'));
  console.log(chalk.gray('    • Command: npx aqe-mcp'));
  console.log(chalk.gray('    • Tools: 102 MCP tools for learning, memory, analysis'));
}

/**
 * Setup MCP server configuration
 *
 * Configures the Model Context Protocol server for agent coordination.
 * This function handles both:
 * 1. Project-level config (.claude/mcp.json) - via generateMcpJson()
 * 2. Global config (claude mcp add) - for users who prefer global setup
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
      console.log(chalk.gray('  ℹ️  MCP server defined in .claude/mcp.json (project-level)'));
      console.log(chalk.gray('  ℹ️  For global setup after installing Claude Code:'));
      console.log(chalk.cyan('     claude mcp add agentic-qe npx aqe-mcp'));
      console.log(chalk.gray('\n  Download Claude Code: https://claude.com/claude-code'));
      return;
    }

    // Check if MCP server is already added globally
    try {
      const mcpList = execSync('claude mcp list', { encoding: 'utf-8' });
      if (mcpList.includes('agentic-qe')) {
        console.log(chalk.green('  ✓ MCP server already configured globally'));
        console.log(chalk.gray('    • Server: agentic-qe'));
        console.log(chalk.gray('    • Command: npx aqe-mcp'));
        return;
      }
    } catch {
      // Ignore errors, proceed with adding
    }

    // Add MCP server globally
    console.log(chalk.gray('  • Adding MCP server to Claude Code globally...'));
    execSync('claude mcp add agentic-qe npx aqe-mcp', { stdio: 'inherit' });

    console.log(chalk.green('\n  ✓ MCP server added successfully'));
    console.log(chalk.gray('    • Server: agentic-qe'));
    console.log(chalk.gray('    • Tools: 102 MCP tools available'));
    console.log(chalk.gray('    • Memory: Shared memory coordination enabled'));

  } catch (error: any) {
    console.log(chalk.yellow('  ⚠️  Could not auto-configure MCP server globally'));
    console.log(chalk.gray(`  Error: ${error.message}`));
    console.log(chalk.gray('  ℹ️  Project-level config in .claude/mcp.json will still work'));
    console.log(chalk.gray('\n  For global setup, run manually:'));
    console.log(chalk.cyan('     claude mcp add agentic-qe npx aqe-mcp'));
  }
}
