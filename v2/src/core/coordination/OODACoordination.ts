import { EventEmitter } from 'events';
import { SwarmMemoryManager, SerializableValue } from '../memory/SwarmMemoryManager';
import { SecureRandom } from '../../utils/SecureRandom.js';

export interface Observation {
  id: string;
  data: unknown;
  timestamp: number;
  source: string;
}

export interface Orientation {
  id: string;
  observations: string[];
  analysis: unknown;
  context: unknown;
  timestamp: number;
}

export interface Decision {
  id: string;
  orientationId: string;
  options: unknown[];
  selected: unknown;
  rationale: string;
  timestamp: number;
}

export interface Action {
  id: string;
  decisionId: string;
  type: string;
  parameters: unknown;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  timestamp: number;
}

export interface OODALoop {
  id: string;
  cycleNumber: number;
  observations: Observation[];
  orientation: Orientation | null;
  decision: Decision | null;
  action: Action | null;
  startTime: number;
  endTime?: number;
  duration?: number;
}

/**
 * Type guard to check if a value is a valid OODALoop
 */
function isOODALoop(value: unknown): value is OODALoop {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.cycleNumber === 'number' &&
    Array.isArray(obj.observations) &&
    typeof obj.startTime === 'number'
  );
}

/**
 * Convert OODALoop to a serializable value for memory storage
 */
function toSerializable(loop: OODALoop): Record<string, unknown> {
  return {
    id: loop.id,
    cycleNumber: loop.cycleNumber,
    observations: loop.observations,
    orientation: loop.orientation,
    decision: loop.decision,
    action: loop.action,
    startTime: loop.startTime,
    endTime: loop.endTime,
    duration: loop.duration
  };
}

/**
 * Convert a serializable value back to OODALoop
 */
function fromSerializable(value: SerializableValue): OODALoop | null {
  if (!isOODALoop(value)) {
    return null;
  }
  return value;
}

/**
 * OODACoordination - Observe-Orient-Decide-Act loop for agent decision making
 *
 * Implements the OODA loop pattern for rapid, adaptive decision cycles
 *
 * Features:
 * - Continuous observation gathering
 * - Context-aware orientation
 * - Decision making with options analysis
 * - Action execution and tracking
 * - Cycle performance metrics
 */
export class OODACoordination extends EventEmitter {
  private currentLoop: OODALoop | null = null;
  private cycleCount = 0;

  constructor(private memory: SwarmMemoryManager) {
    super();
  }

  /**
   * Start a new OODA loop cycle
   */
  async startCycle(): Promise<string> {
    this.cycleCount++;

    this.currentLoop = {
      id: `ooda-cycle-${this.cycleCount}-${Date.now()}`,
      cycleNumber: this.cycleCount,
      observations: [],
      orientation: null,
      decision: null,
      action: null,
      startTime: Date.now()
    };

    await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
      partition: 'ooda_cycles',
      ttl: 86400 // 24 hours
    });

    this.emit('ooda:cycle-started', this.currentLoop);

    return this.currentLoop.id;
  }

  /**
   * Observe - Gather raw data from environment
   */
  async observe(observation: Omit<Observation, 'id' | 'timestamp'>): Promise<Observation> {
    if (!this.currentLoop) {
      throw new Error('No active OODA cycle. Call startCycle() first.');
    }

    const obs: Observation = {
      id: `obs-${Date.now()}-${SecureRandom.generateId(5)}`,
      ...observation,
      timestamp: Date.now()
    };

    this.currentLoop.observations.push(obs);

    await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
      partition: 'ooda_cycles'
    });

    this.emit('ooda:observation-added', { cycle: this.currentLoop, observation: obs });

    return obs;
  }

  /**
   * Orient - Analyze observations and build situational awareness
   */
  async orient(analysis: unknown, context: unknown = {}): Promise<Orientation> {
    if (!this.currentLoop) {
      throw new Error('No active OODA cycle. Call startCycle() first.');
    }

    if (this.currentLoop.observations.length === 0) {
      throw new Error('Cannot orient without observations');
    }

    const orientation: Orientation = {
      id: `orient-${Date.now()}`,
      observations: this.currentLoop.observations.map(o => o.id),
      analysis,
      context,
      timestamp: Date.now()
    };

    this.currentLoop.orientation = orientation;

    await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
      partition: 'ooda_cycles'
    });

    this.emit('ooda:orientation-completed', { cycle: this.currentLoop, orientation });

    return orientation;
  }

  /**
   * Decide - Make decision based on orientation
   */
  async decide(options: unknown[], selected: unknown, rationale: string): Promise<Decision> {
    if (!this.currentLoop) {
      throw new Error('No active OODA cycle. Call startCycle() first.');
    }

    if (!this.currentLoop.orientation) {
      throw new Error('Cannot decide without orientation');
    }

    const decision: Decision = {
      id: `decision-${Date.now()}`,
      orientationId: this.currentLoop.orientation.id,
      options,
      selected,
      rationale,
      timestamp: Date.now()
    };

    this.currentLoop.decision = decision;

    await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
      partition: 'ooda_cycles'
    });

    this.emit('ooda:decision-made', { cycle: this.currentLoop, decision });

    return decision;
  }

  /**
   * Act - Execute the decided action
   */
  async act(type: string, parameters: unknown, executor: () => Promise<unknown>): Promise<Action> {
    if (!this.currentLoop) {
      throw new Error('No active OODA cycle. Call startCycle() first.');
    }

    if (!this.currentLoop.decision) {
      throw new Error('Cannot act without decision');
    }

    const action: Action = {
      id: `action-${Date.now()}`,
      decisionId: this.currentLoop.decision.id,
      type,
      parameters,
      status: 'pending',
      timestamp: Date.now()
    };

    this.currentLoop.action = action;

    await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
      partition: 'ooda_cycles'
    });

    this.emit('ooda:action-started', { cycle: this.currentLoop, action });

    try {
      action.status = 'executing';
      const result = await executor();
      action.status = 'completed';
      action.result = result;

      this.currentLoop.action = action;
      await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
        partition: 'ooda_cycles'
      });

      this.emit('ooda:action-completed', { cycle: this.currentLoop, action });

    } catch (error) {
      action.status = 'failed';
      action.result = { error: error instanceof Error ? error.message : String(error) };

      this.currentLoop.action = action;
      await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
        partition: 'ooda_cycles'
      });

      this.emit('ooda:action-failed', { cycle: this.currentLoop, action, error });
    }

    return action;
  }

  /**
   * Complete current OODA cycle
   */
  async completeCycle(): Promise<OODALoop> {
    if (!this.currentLoop) {
      throw new Error('No active OODA cycle');
    }

    this.currentLoop.endTime = Date.now();
    this.currentLoop.duration = this.currentLoop.endTime - this.currentLoop.startTime;

    await this.memory.store(`ooda:cycle:${this.currentLoop.id}`, toSerializable(this.currentLoop), {
      partition: 'ooda_cycles'
    });

    this.emit('ooda:cycle-completed', this.currentLoop);

    const completedLoop = this.currentLoop;
    this.currentLoop = null;

    return completedLoop;
  }

  /**
   * Get current active cycle
   */
  getCurrentCycle(): OODALoop | null {
    return this.currentLoop ? { ...this.currentLoop } : null;
  }

  /**
   * Get cycle history
   */
  async getCycleHistory(limit: number = 10): Promise<OODALoop[]> {
    const cycles = await this.memory.query('ooda:cycle:%', {
      partition: 'ooda_cycles'
    });

    return cycles
      .map(entry => fromSerializable(entry.value))
      .filter((loop): loop is OODALoop => loop !== null)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  /**
   * Get average cycle time
   */
  async getAverageCycleTime(): Promise<number> {
    const cycles = await this.getCycleHistory(100);
    const completedCycles = cycles.filter(c => c.duration !== undefined);

    if (completedCycles.length === 0) {
      return 0;
    }

    const totalDuration = completedCycles.reduce((sum, c) => sum + (c.duration || 0), 0);
    return totalDuration / completedCycles.length;
  }
}
