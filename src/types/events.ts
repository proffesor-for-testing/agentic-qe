/**
 * Event type definitions for Agentic QE Framework
 */

import { AgentId, QEEvent, EventType } from './index';

// ============================================================================
// Event Categories
// ============================================================================

export interface AgentEvent extends QEEvent {
  category: 'agent';
  type: EventType;
}

export interface TestEvent extends QEEvent {
  category: 'test';
  type: EventType;
}

export interface QualityEvent extends QEEvent {
  category: 'quality';
  type: EventType;
}

export interface SystemEvent extends QEEvent {
  category: 'system';
  type: EventType;
}

// ============================================================================
// Specific Event Types
// ============================================================================

export interface AgentSpawnedEvent extends AgentEvent {
  type: EventType.AGENT_SPAWNED;
  data: {
    agentId: AgentId;
    capabilities: string[];
    resources: Record<string, any>;
  };
}

export interface AgentTerminatedEvent extends AgentEvent {
  type: EventType.AGENT_TERMINATED;
  data: {
    agentId: AgentId;
    reason: string;
    finalState: Record<string, any>;
  };
}

export interface TestGeneratedEvent extends TestEvent {
  type: EventType.TEST_GENERATED;
  data: {
    suiteId: string;
    testCount: number;
    coverageProjection: number;
    generationTime: number;
  };
}

export interface TestExecutedEvent extends TestEvent {
  type: EventType.TEST_EXECUTED;
  data: {
    testId: string;
    result: 'passed' | 'failed' | 'skipped';
    duration: number;
    coverage: number;
  };
}

export interface QualityGateEvaluatedEvent extends QualityEvent {
  type: EventType.QUALITY_GATE_EVALUATED;
  data: {
    gateId: string;
    decision: 'PASS' | 'FAIL' | 'ESCALATE';
    score: number;
    threshold: number;
  };
}

export interface DefectPredictedEvent extends QualityEvent {
  type: EventType.QUALITY_DEFECT_PREDICTED;
  data: {
    location: string;
    probability: number;
    severity: string;
    confidence: number;
  };
}

export interface SystemErrorEvent extends SystemEvent {
  type: EventType.SYSTEM_ERROR;
  data: {
    component: string;
    error: Error;
    context: Record<string, any>;
  };
}

export interface SystemPerformanceEvent extends SystemEvent {
  type: EventType.SYSTEM_PERFORMANCE;
  data: {
    metric: string;
    value: number;
    threshold: number;
    timestamp: Date;
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

export type EventListener<T extends QEEvent = QEEvent> = (event: T) => Promise<void> | void;

export interface EventSubscription {
  id: string;
  eventType: string;
  listener: EventListener;
  options: {
    once?: boolean;
    timeout?: number;
    filter?: (event: QEEvent) => boolean;
  };
}