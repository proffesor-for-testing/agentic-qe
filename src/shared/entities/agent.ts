/**
 * Agentic QE v3 - Agent Entity
 * Core agent entity used across all domains
 */

import { AggregateRoot, EntityProps } from './base-entity';
import { AgentStatus, AgentType, DomainName } from '../types';

export interface AgentProps extends EntityProps {
  name: string;
  domain: DomainName;
  type: AgentType;
  status: AgentStatus;
  capabilities: string[];
  config?: Record<string, unknown>;
  metrics?: AgentMetrics;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  averageExecutionTime: number;
  lastActiveAt?: Date;
}

export class Agent extends AggregateRoot<AgentProps> {
  get name(): string {
    return this.props.name;
  }

  get domain(): DomainName {
    return this.props.domain;
  }

  get type(): AgentType {
    return this.props.type;
  }

  get status(): AgentStatus {
    return this.props.status;
  }

  get capabilities(): string[] {
    return [...this.props.capabilities];
  }

  get config(): Record<string, unknown> {
    return { ...this.props.config };
  }

  get metrics(): AgentMetrics {
    return this.props.metrics ?? {
      tasksCompleted: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
    };
  }

  get isAvailable(): boolean {
    return this.props.status === 'idle';
  }

  get isRunning(): boolean {
    return this.props.status === 'running';
  }

  start(): void {
    if (this.props.status !== 'idle' && this.props.status !== 'queued') {
      throw new Error(`Cannot start agent in status: ${this.props.status}`);
    }
    this.props.status = 'running';
    this.touch();
    this.addDomainEvent({
      type: 'AgentStarted',
      payload: { agentId: this.id, domain: this.domain },
      timestamp: new Date(),
    });
  }

  complete(): void {
    if (this.props.status !== 'running') {
      throw new Error(`Cannot complete agent not in running status`);
    }
    this.props.status = 'completed';
    this.props.metrics = {
      ...this.metrics,
      tasksCompleted: this.metrics.tasksCompleted + 1,
      tasksSucceeded: this.metrics.tasksSucceeded + 1,
      lastActiveAt: new Date(),
    };
    this.touch();
    this.addDomainEvent({
      type: 'AgentCompleted',
      payload: { agentId: this.id, domain: this.domain },
      timestamp: new Date(),
    });
  }

  fail(error: Error): void {
    if (this.props.status !== 'running') {
      throw new Error(`Cannot fail agent not in running status`);
    }
    this.props.status = 'failed';
    this.props.metrics = {
      ...this.metrics,
      tasksCompleted: this.metrics.tasksCompleted + 1,
      tasksFailed: this.metrics.tasksFailed + 1,
      lastActiveAt: new Date(),
    };
    this.touch();
    this.addDomainEvent({
      type: 'AgentFailed',
      payload: { agentId: this.id, domain: this.domain, error: error.message },
      timestamp: new Date(),
    });
  }

  reset(): void {
    this.props.status = 'idle';
    this.touch();
  }

  hasCapability(capability: string): boolean {
    return this.props.capabilities.includes(capability);
  }

  static create(props: Omit<AgentProps, 'id' | 'createdAt' | 'updatedAt'>): Agent {
    return new Agent({
      ...props,
      status: props.status ?? 'idle',
      metrics: props.metrics ?? {
        tasksCompleted: 0,
        tasksSucceeded: 0,
        tasksFailed: 0,
        averageExecutionTime: 0,
      },
    });
  }
}
