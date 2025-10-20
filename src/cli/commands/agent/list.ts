/**
 * Agent List Command
 * Lists all agents with optional filtering
 */

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
    // Simulate reading agent data (in real implementation, read from disk)
    const mockAgents: AgentInfo[] = [
      { id: 'agent-1', type: 'test-generator', status: 'active' },
      { id: 'agent-2', type: 'test-executor', status: 'idle' },
      { id: 'agent-3', type: 'quality-analyzer', status: 'active' }
    ];

    // Apply filter if specified
    let agents = mockAgents;
    if (options.filter) {
      agents = mockAgents.filter(a => a.status === options.filter);
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
