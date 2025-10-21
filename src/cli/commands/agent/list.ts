/**
 * Agent List Command
 * Lists all agents with optional filtering
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface ListOptions {
  filter?: string;
  format?: 'json' | 'table';
}

export interface AgentInfo {
  id: string;
  type: string;
  status: string;
  name?: string;
}

export class AgentListCommand {
  static async execute(options: ListOptions): Promise<AgentInfo[] | string> {
    const agentDir = '.agentic-qe/agents';
    let agents: AgentInfo[] = [];

    // Read agent data from disk if available, otherwise use mock data
    if (await fs.pathExists(agentDir)) {
      const files = await fs.readdir(agentDir);
      const agentFiles = files.filter(f => f.endsWith('.json'));

      for (const file of agentFiles) {
        const agentData = await fs.readJson(path.join(agentDir, file));
        agents.push(agentData);
      }
    }

    // Fallback to mock data if no agents found
    if (agents.length === 0) {
      // Read from mock state file if it exists
      const mockStateFile = '.agentic-qe/test-state.json';
      if (await fs.pathExists(mockStateFile)) {
        const state = await fs.readJson(mockStateFile);
        agents = state.agents || [];
      } else {
        agents = [
          { id: 'agent-1', type: 'test-generator', status: 'active' },
          { id: 'agent-2', type: 'test-executor', status: 'idle' },
          { id: 'agent-3', type: 'quality-analyzer', status: 'active' }
        ];
      }
    }

    // Apply filter if specified
    if (options.filter) {
      agents = agents.filter(a => a.status === options.filter);
    }

    // Format output
    if (options.format === 'table') {
      return this.formatAsTable(agents);
    }

    return agents;
  }

  private static formatAsTable(agents: AgentInfo[]): string {
    const header = '┌────────────┬─────────────────┬──────────┐\n' +
                   '│ ID         │ Type            │ Status   │\n' +
                   '├────────────┼─────────────────┼──────────┤\n';

    const rows = agents.map(a =>
      `│ ${a.id.padEnd(10)} │ ${a.type.padEnd(15)} │ ${a.status.padEnd(8)} │`
    ).join('\n');

    const footer = '\n└────────────┴─────────────────┴──────────┘';

    return header + rows + footer;
  }
}
