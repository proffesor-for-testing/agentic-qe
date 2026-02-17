/**
 * Witness Engine Adapter Unit Tests
 * ADR-052: A1.4 - Unit Tests for Witness Engine
 *
 * Tests the witness adapter for creating cryptographic proofs,
 * audit trails, and reproducible computation records.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock WASM module for WitnessEngine
 */
vi.mock('prime-radiant-advanced-wasm', () => ({
  WitnessEngine: vi.fn().mockImplementation(() => ({
    add_node: vi.fn(),
    add_edge: vi.fn(),
    create_witness: vi.fn().mockReturnValue({
      id: 'witness-1',
      hash: 'abc123',
      valid: true,
      timestamp: Date.now(),
    }),
    replay_witness: vi.fn().mockReturnValue(true),
    verify_witness: vi.fn().mockReturnValue({ valid: true, matched: 10, total: 10 }),
    get_witness_chain: vi.fn().mockReturnValue(['witness-1', 'witness-2']),
    compute_merkle_root: vi.fn().mockReturnValue('merkle-root-hash'),
    get_node_count: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

/**
 * Types for Witness Engine
 */
interface WitnessNodeData {
  id: string;
  event: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface WitnessEdgeData {
  source: string;
  target: string;
  relation: 'precedes' | 'causes' | 'validates';
}

interface WitnessRecord {
  id: string;
  hash: string;
  valid: boolean;
  timestamp: number;
  events: unknown[];
  signature?: string;
}

interface WitnessVerificationResult {
  valid: boolean;
  matched: number;
  total: number;
  discrepancies: string[];
}

interface WitnessReplayResult {
  success: boolean;
  reproducible: boolean;
  deviations: string[];
}

interface WitnessEngineConfig {
  hashAlgorithm: 'sha256' | 'sha512' | 'blake3';
  enableMerkleTree: boolean;
  maxChainLength: number;
}

/**
 * Mock WASM WitnessEngine interface
 */
interface WasmWitnessEngine {
  add_node: (id: string, data: unknown) => void;
  add_edge: (source: string, target: string, relation: string) => void;
  create_witness: (events: unknown[]) => { id: string; hash: string; valid: boolean; timestamp: number };
  replay_witness: (witnessId: string) => boolean;
  verify_witness: (witness: WitnessRecord) => { valid: boolean; matched: number; total: number };
  get_witness_chain: (startId: string) => string[];
  compute_merkle_root: (witnessIds: string[]) => string;
  get_node_count: () => number;
  reset: () => void;
  dispose: () => void;
}

/**
 * WitnessAdapter - Wraps the WASM WitnessEngine
 */
class WitnessAdapter {
  private engine: WasmWitnessEngine;
  private readonly config: WitnessEngineConfig;
  private nodes: Map<string, WitnessNodeData> = new Map();
  private edges: WitnessEdgeData[] = [];
  private witnesses: Map<string, WitnessRecord> = new Map();
  private initialized = false;

  constructor(wasmEngine: WasmWitnessEngine, config: Partial<WitnessEngineConfig> = {}) {
    this.engine = wasmEngine;
    this.config = {
      hashAlgorithm: config.hashAlgorithm ?? 'sha256',
      enableMerkleTree: config.enableMerkleTree ?? true,
      maxChainLength: config.maxChainLength ?? 1000,
    };
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  get witnessCount(): number {
    return this.witnesses.size;
  }

  /**
   * Add an event node to the witness graph
   */
  addNode(node: WitnessNodeData): void {
    this.ensureInitialized();

    if (this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, node);
    this.engine.add_node(node.id, {
      event: node.event,
      timestamp: node.timestamp,
      metadata: node.metadata,
    });
  }

  /**
   * Add a temporal/causal edge between events
   */
  addEdge(edge: WitnessEdgeData): void {
    this.ensureInitialized();

    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source event '${edge.source}' not found`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target event '${edge.target}' not found`);
    }

    this.edges.push(edge);
    this.engine.add_edge(edge.source, edge.target, edge.relation);
  }

  /**
   * Create a witness record from events (primary operation)
   */
  createWitness(events: unknown[]): WitnessRecord {
    this.ensureInitialized();

    if (events.length === 0) {
      throw new Error('Cannot create witness from empty events');
    }

    const wasmResult = this.engine.create_witness(events);

    const witness: WitnessRecord = {
      id: wasmResult.id,
      hash: wasmResult.hash,
      valid: wasmResult.valid,
      timestamp: wasmResult.timestamp,
      events,
      signature: this.generateSignature(events, wasmResult.hash),
    };

    this.witnesses.set(witness.id, witness);
    return witness;
  }

  /**
   * Replay a witness to verify reproducibility (primary metric: replay success)
   */
  replayWitness(witnessId: string): WitnessReplayResult {
    this.ensureInitialized();

    const witness = this.witnesses.get(witnessId);
    if (!witness) {
      return {
        success: false,
        reproducible: false,
        deviations: [`Witness '${witnessId}' not found`],
      };
    }

    const replaySuccess = this.engine.replay_witness(witnessId);
    const verification = this.engine.verify_witness(witness);

    const deviations: string[] = [];
    if (!replaySuccess) {
      deviations.push('Replay execution failed');
    }
    if (verification.matched < verification.total) {
      deviations.push(`${verification.total - verification.matched} events could not be matched`);
    }

    return {
      success: replaySuccess && verification.valid && verification.matched === verification.total,
      reproducible: replaySuccess,
      deviations,
    };
  }

  /**
   * Verify a witness record
   */
  verifyWitness(witnessId: string): WitnessVerificationResult {
    this.ensureInitialized();

    const witness = this.witnesses.get(witnessId);
    if (!witness) {
      return {
        valid: false,
        matched: 0,
        total: 0,
        discrepancies: [`Witness '${witnessId}' not found`],
      };
    }

    const result = this.engine.verify_witness(witness);
    const discrepancies: string[] = [];

    if (!result.valid) {
      discrepancies.push('Witness signature verification failed');
    }
    if (result.matched < result.total) {
      discrepancies.push(`${result.total - result.matched} events did not match`);
    }

    return {
      valid: result.valid && result.matched === result.total,
      matched: result.matched,
      total: result.total,
      discrepancies,
    };
  }

  /**
   * Get witness chain starting from a specific witness
   */
  getWitnessChain(startId: string): string[] {
    this.ensureInitialized();
    return this.engine.get_witness_chain(startId);
  }

  /**
   * Compute Merkle root for a set of witnesses
   */
  computeMerkleRoot(witnessIds: string[]): string {
    this.ensureInitialized();

    if (!this.config.enableMerkleTree) {
      throw new Error('Merkle tree computation is disabled');
    }

    return this.engine.compute_merkle_root(witnessIds);
  }

  /**
   * Get a specific witness by ID
   */
  getWitness(witnessId: string): WitnessRecord | undefined {
    return this.witnesses.get(witnessId);
  }

  /**
   * Get all witnesses
   */
  getAllWitnesses(): WitnessRecord[] {
    return Array.from(this.witnesses.values());
  }

  /**
   * Reset the engine state
   */
  reset(): void {
    this.nodes.clear();
    this.edges = [];
    this.witnesses.clear();
    this.engine.reset();
  }

  /**
   * Dispose of engine resources
   */
  dispose(): void {
    this.engine.dispose();
    this.initialized = false;
  }

  private generateSignature(events: unknown[], hash: string): string {
    // Simplified signature generation
    const content = JSON.stringify(events) + hash;
    let signature = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      signature = (signature << 5) - signature + char;
      signature = signature & signature;
    }
    return `sig_${this.config.hashAlgorithm}_${Math.abs(signature).toString(16)}`;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('WitnessAdapter not initialized');
    }
  }
}

describe('WitnessAdapter', () => {
  let adapter: WitnessAdapter;
  let mockEngine: WasmWitnessEngine;

  beforeEach(() => {
    mockEngine = {
      add_node: vi.fn(),
      add_edge: vi.fn(),
      create_witness: vi.fn().mockReturnValue({
        id: 'witness-1',
        hash: 'abc123def456',
        valid: true,
        timestamp: Date.now(),
      }),
      replay_witness: vi.fn().mockReturnValue(true),
      verify_witness: vi.fn().mockReturnValue({ valid: true, matched: 10, total: 10 }),
      get_witness_chain: vi.fn().mockReturnValue(['witness-1', 'witness-2', 'witness-3']),
      compute_merkle_root: vi.fn().mockReturnValue('merkle-root-abc123'),
      get_node_count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    adapter = new WitnessAdapter(mockEngine);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with WASM loader', () => {
      expect(adapter.isInitialized).toBe(true);
    });

    it('should use default configuration', () => {
      expect(adapter.nodeCount).toBe(0);
      expect(adapter.edgeCount).toBe(0);
      expect(adapter.witnessCount).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customAdapter = new WitnessAdapter(mockEngine, {
        hashAlgorithm: 'sha512',
        enableMerkleTree: false,
      });
      expect(customAdapter.isInitialized).toBe(true);
    });
  });

  describe('addNode', () => {
    it('should add nodes correctly', () => {
      const node: WitnessNodeData = {
        id: 'event-1',
        event: { type: 'task_started', taskId: '123' },
        timestamp: Date.now(),
      };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledWith('event-1', {
        event: { type: 'task_started', taskId: '123' },
        timestamp: node.timestamp,
        metadata: undefined,
      });
    });

    it('should add multiple nodes', () => {
      const now = Date.now();
      adapter.addNode({ id: 'e1', event: 'start', timestamp: now });
      adapter.addNode({ id: 'e2', event: 'process', timestamp: now + 100 });
      adapter.addNode({ id: 'e3', event: 'end', timestamp: now + 200 });

      expect(adapter.nodeCount).toBe(3);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(3);
    });

    it('should handle node with metadata', () => {
      const node: WitnessNodeData = {
        id: 'event-1',
        event: 'test',
        timestamp: Date.now(),
        metadata: { agent: 'agent-1', priority: 'high' },
      };

      adapter.addNode(node);

      expect(mockEngine.add_node).toHaveBeenCalledWith('event-1', expect.objectContaining({
        metadata: { agent: 'agent-1', priority: 'high' },
      }));
    });

    it('should update existing node', () => {
      adapter.addNode({ id: 'e1', event: 'initial', timestamp: Date.now() });
      adapter.addNode({ id: 'e1', event: 'updated', timestamp: Date.now() });

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(1);
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      const now = Date.now();
      adapter.addNode({ id: 'e1', event: 'first', timestamp: now });
      adapter.addNode({ id: 'e2', event: 'second', timestamp: now + 100 });
    });

    it('should add edges correctly', () => {
      const edge: WitnessEdgeData = {
        source: 'e1',
        target: 'e2',
        relation: 'precedes',
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
      expect(mockEngine.add_edge).toHaveBeenCalledWith('e1', 'e2', 'precedes');
    });

    it('should add multiple edges with different relations', () => {
      adapter.addNode({ id: 'e3', event: 'third', timestamp: Date.now() + 200 });

      adapter.addEdge({ source: 'e1', target: 'e2', relation: 'precedes' });
      adapter.addEdge({ source: 'e2', target: 'e3', relation: 'causes' });
      adapter.addEdge({ source: 'e1', target: 'e3', relation: 'validates' });

      expect(adapter.edgeCount).toBe(3);
      expect(mockEngine.add_edge).toHaveBeenCalledTimes(3);
    });

    it('should throw error for missing source event', () => {
      expect(() =>
        adapter.addEdge({ source: 'missing', target: 'e2', relation: 'precedes' })
      ).toThrow("Source event 'missing' not found");
    });

    it('should throw error for missing target event', () => {
      expect(() =>
        adapter.addEdge({ source: 'e1', target: 'missing', relation: 'precedes' })
      ).toThrow("Target event 'missing' not found");
    });
  });

  describe('createWitness', () => {
    it('should create witness from events (primary operation)', () => {
      const events = [
        { type: 'task_started', taskId: '123' },
        { type: 'step_completed', step: 1 },
        { type: 'task_finished', result: 'success' },
      ];

      const witness = adapter.createWitness(events);

      expect(witness.id).toBe('witness-1');
      expect(witness.hash).toBe('abc123def456');
      expect(witness.valid).toBe(true);
      expect(witness.events).toEqual(events);
      expect(witness.signature).toBeDefined();
      expect(adapter.witnessCount).toBe(1);
    });

    it('should throw for empty events', () => {
      expect(() => adapter.createWitness([])).toThrow('Cannot create witness from empty events');
    });

    it('should create multiple witnesses', () => {
      mockEngine.create_witness = vi.fn()
        .mockReturnValueOnce({ id: 'witness-1', hash: 'hash1', valid: true, timestamp: Date.now() })
        .mockReturnValueOnce({ id: 'witness-2', hash: 'hash2', valid: true, timestamp: Date.now() });

      adapter.createWitness([{ event: 1 }]);
      adapter.createWitness([{ event: 2 }]);

      expect(adapter.witnessCount).toBe(2);
    });

    it('should handle empty input gracefully by throwing', () => {
      expect(() => adapter.createWitness([])).toThrow();
    });

    it('should handle large input (100+ events)', () => {
      const events = Array.from({ length: 150 }, (_, i) => ({
        type: 'event',
        index: i,
        data: `data-${i}`,
      }));

      const witness = adapter.createWitness(events);

      expect(witness.events).toHaveLength(150);
      expect(witness.valid).toBe(true);
    });
  });

  describe('replayWitness', () => {
    beforeEach(() => {
      adapter.createWitness([{ event: 'test' }]);
    });

    it('should replay witness successfully (primary metric)', () => {
      const result = adapter.replayWitness('witness-1');

      expect(result.success).toBe(true);
      expect(result.reproducible).toBe(true);
      expect(result.deviations).toHaveLength(0);
    });

    it('should detect failed replay', () => {
      mockEngine.replay_witness = vi.fn().mockReturnValue(false);

      const result = adapter.replayWitness('witness-1');

      expect(result.success).toBe(false);
      expect(result.reproducible).toBe(false);
      expect(result.deviations).toContain('Replay execution failed');
    });

    it('should handle non-existent witness', () => {
      const result = adapter.replayWitness('non-existent');

      expect(result.success).toBe(false);
      expect(result.deviations).toContain("Witness 'non-existent' not found");
    });

    it('should detect mismatched events', () => {
      // First create a witness, then modify the mock to return mismatched results
      adapter.createWitness([{ event: 'test' }]);
      mockEngine.verify_witness = vi.fn().mockReturnValue({ valid: true, matched: 8, total: 10 });

      const result = adapter.replayWitness('witness-1');

      expect(result.success).toBe(false);
      expect(result.deviations.some((d) => d.includes('could not be matched'))).toBe(true);
    });
  });

  describe('verifyWitness', () => {
    beforeEach(() => {
      adapter.createWitness([{ event: 'test' }]);
    });

    it('should verify valid witness', () => {
      const result = adapter.verifyWitness('witness-1');

      expect(result.valid).toBe(true);
      expect(result.matched).toBe(10);
      expect(result.total).toBe(10);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('should detect invalid witness', () => {
      mockEngine.verify_witness = vi.fn().mockReturnValue({ valid: false, matched: 5, total: 10 });

      const result = adapter.verifyWitness('witness-1');

      expect(result.valid).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThan(0);
    });

    it('should handle non-existent witness', () => {
      const result = adapter.verifyWitness('non-existent');

      expect(result.valid).toBe(false);
      expect(result.discrepancies).toContain("Witness 'non-existent' not found");
    });
  });

  describe('getWitnessChain', () => {
    it('should get witness chain', () => {
      const chain = adapter.getWitnessChain('witness-1');

      expect(chain).toEqual(['witness-1', 'witness-2', 'witness-3']);
      expect(mockEngine.get_witness_chain).toHaveBeenCalledWith('witness-1');
    });
  });

  describe('computeMerkleRoot', () => {
    it('should compute Merkle root', () => {
      const root = adapter.computeMerkleRoot(['witness-1', 'witness-2']);

      expect(root).toBe('merkle-root-abc123');
      expect(mockEngine.compute_merkle_root).toHaveBeenCalledWith(['witness-1', 'witness-2']);
    });

    it('should throw when Merkle tree disabled', () => {
      const noMerkleAdapter = new WitnessAdapter(mockEngine, { enableMerkleTree: false });

      expect(() => noMerkleAdapter.computeMerkleRoot(['w1'])).toThrow(
        'Merkle tree computation is disabled'
      );
    });
  });

  describe('getWitness / getAllWitnesses', () => {
    it('should get witness by ID', () => {
      const created = adapter.createWitness([{ event: 'test' }]);
      const retrieved = adapter.getWitness('witness-1');

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent witness', () => {
      const retrieved = adapter.getWitness('non-existent');

      expect(retrieved).toBeUndefined();
    });

    it('should get all witnesses', () => {
      mockEngine.create_witness = vi.fn()
        .mockReturnValueOnce({ id: 'w1', hash: 'h1', valid: true, timestamp: Date.now() })
        .mockReturnValueOnce({ id: 'w2', hash: 'h2', valid: true, timestamp: Date.now() });

      adapter.createWitness([{ e: 1 }]);
      adapter.createWitness([{ e: 2 }]);

      const all = adapter.getAllWitnesses();

      expect(all).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      adapter.addNode({ id: 'e1', event: 'test', timestamp: Date.now() });
      adapter.createWitness([{ event: 'test' }]);

      adapter.reset();

      expect(adapter.nodeCount).toBe(0);
      expect(adapter.edgeCount).toBe(0);
      expect(adapter.witnessCount).toBe(0);
      expect(mockEngine.reset).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose engine resources', () => {
      adapter.dispose();

      expect(mockEngine.dispose).toHaveBeenCalled();
      expect(adapter.isInitialized).toBe(false);
    });

    it('should throw after disposal', () => {
      adapter.dispose();

      expect(() => adapter.createWitness([{ event: 'test' }])).toThrow(
        'WitnessAdapter not initialized'
      );
    });
  });
});

// Export for use in other tests
export { WitnessAdapter };
export type { WitnessNodeData, WitnessEdgeData, WitnessRecord, WitnessVerificationResult, WitnessReplayResult };
