/**
 * Event types for the QE Event Bus
 */

export interface BaseEvent {
  timestamp: number;
}

export interface AgentEvent extends BaseEvent {
  agentId: string;
}

export interface AgentSpawnedEvent extends AgentEvent {
  type: string;
  capabilities?: string[];
}

export interface AgentReadyEvent extends AgentEvent {
  status: 'ready';
}

export interface AgentCompletedEvent extends AgentEvent {
  result: 'success' | 'failure' | 'cancelled';
  duration: number;
  output?: any;
}

export interface AgentErrorEvent extends AgentEvent {
  error: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  stack?: string;
}

export interface TestEvent extends BaseEvent {
  testId: string;
}

export interface TestStartedEvent extends TestEvent {
  suite: string;
  testCount?: number;
}

export interface TestProgressEvent extends TestEvent {
  completed: number;
  total: number;
  currentTest?: string;
}

export interface TestCompletedEvent extends TestEvent {
  passed: number;
  failed: number;
  skipped?: number;
  duration: number;
  coverage?: number;
}

export interface QualityGateEvent extends BaseEvent {
  gateId: string;
  status: 'passed' | 'failed' | 'warning';
  metrics: Record<string, number>;
}

export interface CoverageEvent extends BaseEvent {
  moduleId: string;
  coverage: number;
  gaps: string[];
}

/**
 * Event type mapping
 */
export type EventTypeMap = {
  'agent:spawned': AgentSpawnedEvent;
  'agent:ready': AgentReadyEvent;
  'agent:completed': AgentCompletedEvent;
  'agent:error': AgentErrorEvent;
  'test:started': TestStartedEvent;
  'test:progress': TestProgressEvent;
  'test:completed': TestCompletedEvent;
  'quality:gate': QualityGateEvent;
  'coverage:analyzed': CoverageEvent;
};

export type EventType = keyof EventTypeMap;
export type EventHandler<T = any> = (data: T) => void | Promise<void>;
