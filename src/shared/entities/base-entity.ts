/**
 * Agentic QE v3 - Base Entity
 * Foundation for all domain entities
 */

import { v4 as uuidv4 } from 'uuid';

export interface EntityProps {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export abstract class BaseEntity<T extends EntityProps> {
  protected readonly _id: string;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;
  protected props: T;

  constructor(props: T) {
    this._id = props.id ?? uuidv4();
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this.props = props;
  }

  get id(): string {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }

  equals(other: BaseEntity<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this === other) {
      return true;
    }
    return this._id === other._id;
  }
}

/**
 * Aggregate Root - Entry point to an aggregate
 */
export abstract class AggregateRoot<T extends EntityProps> extends BaseEntity<T> {
  private _domainEvents: DomainEventRecord[] = [];

  protected addDomainEvent(event: DomainEventRecord): void {
    this._domainEvents.push(event);
  }

  public pullDomainEvents(): DomainEventRecord[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  public hasDomainEvents(): boolean {
    return this._domainEvents.length > 0;
  }
}

interface DomainEventRecord {
  type: string;
  payload: unknown;
  timestamp: Date;
}
