/**
 * Fleet Optimize Command
 * Optimize fleet topology and workload distribution
 */

import { FleetManager } from '../../../core/FleetManager';
import { Logger } from '../../../utils/Logger';
import { AgentStatus } from '../../../core/Agent';

export interface OptimizeOptions {
  fleetManager: FleetManager;
  autoApply?: boolean;
}

export interface OptimizeResult {
  success: boolean;
  currentTopology: string;
  recommendedTopology: string;
  optimizations: Optimization[];
  workloadAnalysis: WorkloadAnalysis;
  rebalanceNeeded: boolean;
  rebalanceSuggestions?: RebalanceSuggestion[];
  applied: boolean;
}

interface Optimization {
  type: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
}

interface WorkloadAnalysis {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  busyAgents: number;
  averageLoad: number;
  loadDistribution: Record<string, number>;
}

interface RebalanceSuggestion {
  action: 'spawn' | 'remove' | 'redistribute';
  agentType: string;
  reason: string;
  priority: number;
}

export async function optimize(options: OptimizeOptions): Promise<OptimizeResult> {
  const logger = Logger.getInstance();

  try {
    const agents = options.fleetManager.getAllAgents();
    const status = options.fleetManager.getStatus();

    // Analyze workload
    const activeAgents = agents.filter(a => a.getStatus() === AgentStatus.ACTIVE).length;
    const idleAgents = agents.filter(a => a.getStatus() === AgentStatus.IDLE).length;
    const busyAgents = agents.filter(a => a.getStatus() === AgentStatus.BUSY).length;

    const averageLoad = agents.length > 0
      ? (busyAgents / agents.length) * 100
      : 0;

    // Calculate load distribution by agent type
    const loadDistribution: Record<string, number> = {};
    for (const agent of agents) {
      const type = agent.getType();
      loadDistribution[type] = (loadDistribution[type] || 0) + 1;
    }

    const workloadAnalysis: WorkloadAnalysis = {
      totalAgents: agents.length,
      activeAgents,
      idleAgents,
      busyAgents,
      averageLoad: parseFloat(averageLoad.toFixed(2)),
      loadDistribution
    };

    // Determine current topology (simplified)
    let currentTopology = 'unknown';
    if (agents.length <= 3) currentTopology = 'star';
    else if (agents.length <= 6) currentTopology = 'hierarchical';
    else currentTopology = 'mesh';

    // Generate optimizations
    const optimizations: Optimization[] = [];

    // Check for idle agents
    if (idleAgents > agents.length * 0.3) {
      optimizations.push({
        type: 'scale_down',
        description: `${idleAgents} agents are idle (>30% of fleet)`,
        impact: 'medium',
        recommendation: 'Consider reducing fleet size to save resources'
      });
    }

    // Check for overloaded agents
    if (averageLoad > 80) {
      optimizations.push({
        type: 'scale_up',
        description: `Average load is ${averageLoad.toFixed(1)}% (>80%)`,
        impact: 'high',
        recommendation: 'Consider adding more agents to distribute workload'
      });
    }

    // Check for load imbalance
    const loadValues = Object.values(loadDistribution);
    const maxLoad = Math.max(...loadValues);
    const minLoad = Math.min(...loadValues);
    if (maxLoad - minLoad > 3) {
      optimizations.push({
        type: 'rebalance',
        description: 'Uneven load distribution across agent types',
        impact: 'medium',
        recommendation: 'Rebalance agents to match workload patterns'
      });
    }

    // Recommend topology
    let recommendedTopology = currentTopology;
    if (agents.length > 10 && currentTopology !== 'mesh') {
      recommendedTopology = 'mesh';
      optimizations.push({
        type: 'topology',
        description: 'Large fleet would benefit from mesh topology',
        impact: 'high',
        recommendation: 'Switch to mesh topology for better peer-to-peer communication'
      });
    }

    // Generate rebalance suggestions
    const rebalanceNeeded = optimizations.some(o => o.type === 'rebalance' || o.type === 'scale_up');
    const rebalanceSuggestions: RebalanceSuggestion[] = [];

    if (averageLoad > 80) {
      // Find most loaded agent type
      const mostLoadedType = Object.entries(loadDistribution)
        .sort((a, b) => b[1] - a[1])[0];

      if (mostLoadedType) {
        rebalanceSuggestions.push({
          action: 'spawn',
          agentType: mostLoadedType[0],
          reason: 'High load on this agent type',
          priority: 3
        });
      }
    }

    // Auto-apply if requested
    let applied = false;
    if (options.autoApply && rebalanceSuggestions.length > 0) {
      for (const suggestion of rebalanceSuggestions) {
        if (suggestion.action === 'spawn') {
          try {
            await options.fleetManager.spawnAgent(suggestion.agentType);
            applied = true;
            logger.info(`Auto-spawned ${suggestion.agentType} agent`);
          } catch (error) {
            logger.error(`Failed to spawn agent: ${error}`);
          }
        }
      }
    }

    return {
      success: true,
      currentTopology,
      recommendedTopology,
      optimizations,
      workloadAnalysis,
      rebalanceNeeded,
      rebalanceSuggestions: rebalanceNeeded ? rebalanceSuggestions : undefined,
      applied
    };

  } catch (error) {
    logger.error('Failed to optimize fleet:', error);
    throw error;
  }
}
