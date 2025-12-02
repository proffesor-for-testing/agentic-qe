/**
 * Types for WorkflowOrchestrator and related components
 */

export interface WorkflowStep {
  id: string;
  name: string;
  agentType: string;
  action: string;
  inputs: Record<string, any>;
  dependencies: string[];
  timeout: number;
  retries: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  strategy: 'parallel' | 'sequential' | 'adaptive';
  checkpointEnabled: boolean;
  timeout: number;
  metadata: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  checkpoint?: WorkflowCheckpoint;
  results: Map<string, any>;
  metrics: ExecutionMetrics;
}

export interface WorkflowCheckpoint {
  executionId: string;
  timestamp: Date;
  completedSteps: string[];
  stepResults: Map<string, any>;
  state: Record<string, any>;
}

export interface ExecutionMetrics {
  totalDuration: number;
  stepDurations: Map<string, number>;
  retryCount: number;
  parallelization: number;
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  inputs: Record<string, any>;
  stepResults: Map<string, StepResult>;
  startTime: number;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'timeout';
  output: any;
  error?: Error;
  duration: number;
  retryCount: number;
  agentId?: string;
}

export interface ExecutionPlan {
  phases: ExecutionPhase[];
  criticalPath: string[];
  estimatedDuration: number;
}

export interface ExecutionPhase {
  id: string;
  steps: WorkflowStep[];
  isParallel: boolean;
  dependencies: string[];
}

export interface QueuedTask {
  id: string;
  step: WorkflowStep;
  executionId: string;
  priority: number;
  enqueuedAt: number;
}

export interface WorkloadProfile {
  stepCount: number;
  averageComplexity: number;
  parallelizability: number;
  resourceIntensity: number;
  interdependencies: number;
}

export type ExecutionStrategy = 'parallel' | 'sequential' | 'hybrid';

export interface EventHandler<T = any> {
  (data: T): void | Promise<void>;
}
