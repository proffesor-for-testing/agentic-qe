/**
 * Agent Kill Command
 * Terminates running agents
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface KillOptions {
  agentId: string;
  graceful?: boolean;
  force?: boolean;
}

export class AgentKillCommand {
  static async execute(options: KillOptions): Promise<void> {
    const agentFile = path.join('.agentic-qe/agents', `${options.agentId}.json`);

    // Check if agent exists
    const agentExists = await fs.pathExists(agentFile);

    if (!agentExists) {
      throw new Error('Agent not found');
    }

    // Read current agent state
    const agentData = await fs.readJson(agentFile);

    // Simulate graceful or force kill
    if (options.graceful) {
      // Graceful shutdown: wait for current task to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update agent status to terminated
    agentData.status = 'terminated';
    agentData.terminatedAt = new Date().toISOString();

    await fs.writeJson(agentFile, agentData, { spaces: 2 });
  }
}
