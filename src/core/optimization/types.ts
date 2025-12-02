/**
 * Types for SwarmOptimizer and related components
 */

export interface OptimizationConfig {
  targetSpeedup: number; // e.g., 3.0 for 3x
  maxAgents: number;
  enableAutoTuning: boolean;
  enableBottleneckDetection?: boolean;
  enableAdaptiveScaling?: boolean;
}

export interface TopologyRecommendation {
  topology: 'hierarchical' | 'mesh' | 'ring' | 'star';
  reasoning: string;
  expectedSpeedup: number;
  agentAllocation: Map<string, number>;
  confidence: number;
}

export interface WorkloadProfile {
  taskCount: number;
  taskTypes: Map<string, number>; // type -> count
  averageComplexity: number;
  parallelizability: number; // 0-1
  resourceIntensity: number; // 0-1
  interdependencies: number; // 0-1
}

export interface AgentAllocation {
  allocations: Map<string, string[]>; // agentId -> taskIds
  reasoning: string;
  loadBalance: number; // 0-1 (1 = perfectly balanced)
  expectedDuration: number; // milliseconds
}

export interface PerformanceMetrics {
  taskThroughput: number; // tasks/second
  averageLatency: number; // milliseconds
  resourceUtilization: number; // 0-1
  bottlenecks: Bottleneck[];
  timestamp: Date;
}

export interface Bottleneck {
  type: 'agent' | 'memory' | 'coordination' | 'io';
  location: string;
  severity: number; // 0-1
  impact: string;
  recommendation: string;
}

export interface OptimizationResult {
  success: boolean;
  improvements: Map<string, number>; // metric -> improvement %
  topology?: TopologyRecommendation;
  allocation?: AgentAllocation;
  timestamp: Date;
}
