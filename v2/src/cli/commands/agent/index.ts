/**
 * Agent Commands Index
 *
 * Exports all agent management commands for CLI integration.
 * Complete suite of 10+ agent lifecycle and monitoring commands.
 *
 * @module cli/commands/agent
 */

// Core lifecycle commands
export { AgentSpawnCommand, SpawnOptions, SpawnResult } from './spawn';
export { AgentKillCommand, KillOptions } from './kill';
export { AgentRestartCommand, RestartOptions, RestartResult } from './restart';

// Information and monitoring commands
export { AgentListCommand, ListOptions, AgentInfo } from './list';
export { AgentMetricsCommand, MetricsOptions, AgentMetrics } from './metrics';
export { AgentLogsCommand, LogsOptions } from './logs';
export { AgentInspectCommand, InspectOptions, InspectResult } from './inspect';

// Task management commands
export { AgentAssignCommand, AssignOptions, AssignResult } from './assign';

// Interactive monitoring commands
export { AgentAttachCommand, AttachOptions, AttachSession } from './attach';
export { AgentDetachCommand, DetachOptions, DetachResult } from './detach';

/**
 * Command Categories
 */
export const AGENT_COMMANDS = {
  lifecycle: ['spawn', 'kill', 'restart'],
  monitoring: ['list', 'metrics', 'logs', 'inspect'],
  tasks: ['assign'],
  interactive: ['attach', 'detach']
} as const;

/**
 * Get all available agent commands
 */
export function getAvailableCommands(): string[] {
  return Object.values(AGENT_COMMANDS).flatMap(arr => [...arr]);
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: keyof typeof AGENT_COMMANDS): string[] {
  return [...AGENT_COMMANDS[category]];
}
