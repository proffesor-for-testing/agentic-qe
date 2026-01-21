/**
 * Agentic QE v3 - Base Domain Interface
 * Template for all domain implementations
 */

import { DomainName, DomainEvent } from '../shared/types';
import { DomainPlugin, DomainHealth, EventBus, MemoryBackend } from '../kernel/interfaces';

/**
 * Abstract base class for domain plugins
 */
export abstract class BaseDomainPlugin implements DomainPlugin {
  protected _initialized = false;
  protected _health: DomainHealth = {
    status: 'healthy',
    agents: { total: 0, active: 0, idle: 0, failed: 0 },
    errors: [],
  };

  constructor(
    protected readonly eventBus: EventBus,
    protected readonly memory: MemoryBackend
  ) {}

  abstract get name(): DomainName;
  abstract get version(): string;
  abstract get dependencies(): DomainName[];

  isReady(): boolean {
    return this._initialized;
  }

  getHealth(): DomainHealth {
    return { ...this._health };
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    await this.onInitialize();
    this.subscribeToEvents();
    this._initialized = true;
  }

  async dispose(): Promise<void> {
    await this.onDispose();
    this._initialized = false;
  }

  async handleEvent(event: DomainEvent): Promise<void> {
    await this.onEvent(event);
  }

  abstract getAPI<T>(): T;

  // Override in subclasses
  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}
  protected async onEvent(_event: DomainEvent): Promise<void> {}
  protected subscribeToEvents(): void {}

  // Helper methods
  protected async publishEvent<T>(type: string, payload: T): Promise<void> {
    const event: DomainEvent<T> = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date(),
      source: this.name,
      payload,
    };
    await this.eventBus.publish(event);
  }

  protected updateHealth(updates: Partial<DomainHealth>): void {
    this._health = { ...this._health, ...updates };
  }
}
