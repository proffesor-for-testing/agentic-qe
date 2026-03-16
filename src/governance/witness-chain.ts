/**
 * Witness Chain - Hash-Linked Audit Trail for Quality Gate Decisions
 *
 * Implements an append-only, hash-linked witness log for quality gate decisions.
 * Each receipt is cryptographically chained to its predecessor using SHA-256,
 * creating a tamper-evident audit trail.
 *
 * Features:
 * - Append-only witness log with SHA-256 hash linking
 * - Chain integrity verification with tamper detection
 * - SPRT (Sequential Probability Ratio Test) evidence accumulation
 * - Export/import for brain transfer
 * - Feature-flag gated via useWitnessChain
 *
 * @module governance/witness-chain
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { createHash, randomUUID } from 'crypto';
import { LoggerFactory } from '../logging/index.js';
import { getRuVectorFeatureFlags } from '../integrations/ruvector/feature-flags.js';

const logger = LoggerFactory.create('witness-chain');

// ============================================================================
// Types
// ============================================================================

/**
 * A decision to be witnessed and recorded in the chain.
 */
export interface WitnessDecision {
  /** Gate type that produced this decision */
  type: string; // 'coherence-gate', 'quality-gate', 'transfer-gate'
  /** Decision outcome */
  decision: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'PERMIT' | 'DEFER' | 'DENY';
  /** Contextual data for the decision */
  context: Record<string, unknown>;
  /** Accumulated SPRT evidence value (optional) */
  evidence?: number;
}

/**
 * An immutable receipt in the witness chain.
 * Each receipt is hash-linked to the previous receipt.
 */
export interface WitnessReceipt {
  /** Unique receipt identifier */
  id: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** SHA-256 hash of the previous receipt (genesis uses '0' x 64) */
  previousHash: string;
  /** SHA-256 hash of this receipt: hash(previousHash + JSON(decision) + timestamp) */
  hash: string;
  /** The decision that was witnessed */
  decision: WitnessDecision;
  /** Position in the chain (0-indexed) */
  chainIndex: number;
}

/**
 * Result of verifying the witness chain integrity.
 */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Total number of receipts checked */
  length: number;
  /** Index of the first invalid receipt (-1 if all valid) */
  brokenAt: number;
  /** Human-readable description of the verification outcome */
  message: string;
  /** Hash of the last receipt in the chain */
  lastHash: string;
}

/**
 * Serialized chain format for export/import.
 */
export interface WitnessChainExport {
  /** Format version */
  version: '1.0.0';
  /** Export timestamp */
  exportedAt: number;
  /** Number of receipts */
  length: number;
  /** The receipt chain */
  receipts: WitnessReceipt[];
}

// ============================================================================
// SPRT Accumulator
// ============================================================================

/**
 * Sequential Probability Ratio Test accumulator for Pass/Fail decisions.
 *
 * Simplified sequential decision rule with configurable evidence strength.
 * For production use, strength should reflect log-likelihood ratio of the
 * observation under the alternative vs null hypothesis.
 *
 * Accumulates evidence over a sequence of observations to decide between
 * two hypotheses (Pass vs Fail) with controlled error rates.
 *
 * Boundaries:
 * - Upper bound (accept H1 / PASS): ln(1/alpha)
 * - Lower bound (accept H0 / FAIL): ln(beta)
 *
 * Default evidence step: +0.5 for positive, -0.5 for negative.
 * Use addWeightedEvidence() for variable-strength observations.
 */
export class SPRTAccumulator {
  private logLikelihoodRatio: number = 0;
  private readonly upperBound: number;
  private readonly lowerBound: number;
  private observations: number = 0;

  /**
   * @param alpha - Type I error rate (false positive). Default: 0.05
   * @param beta - Type II error rate (false negative). Default: 0.05
   */
  constructor(alpha: number = 0.05, beta: number = 0.05) {
    this.upperBound = Math.log(1 / alpha);
    this.lowerBound = Math.log(beta);
  }

  /**
   * Add a weighted observation and return the current decision.
   *
   * The strength parameter controls the log-likelihood step size.
   * For production use, strength should reflect the log-likelihood ratio
   * of the observation under the alternative vs null hypothesis.
   *
   * @param positive - Whether this observation is positive evidence
   * @param strength - Evidence strength (step size). Default 0.5 for backward compat.
   * @returns Current decision: PASS, FAIL, or INCONCLUSIVE
   */
  addWeightedEvidence(positive: boolean, strength: number): 'PASS' | 'FAIL' | 'INCONCLUSIVE' {
    this.logLikelihoodRatio += positive ? strength : -strength;
    this.observations++;

    if (this.logLikelihoodRatio >= this.upperBound) return 'PASS';
    if (this.logLikelihoodRatio <= this.lowerBound) return 'FAIL';
    return 'INCONCLUSIVE';
  }

  /**
   * Add an observation with default strength (0.5) and return the current decision.
   *
   * @param positive - Whether this observation is positive evidence
   * @returns Current decision: PASS, FAIL, or INCONCLUSIVE
   */
  addEvidence(positive: boolean): 'PASS' | 'FAIL' | 'INCONCLUSIVE' {
    return this.addWeightedEvidence(positive, 0.5);
  }

  /**
   * Get the current log-likelihood ratio.
   */
  getRatio(): number {
    return this.logLikelihoodRatio;
  }

  /**
   * Get the total number of observations.
   */
  getObservations(): number {
    return this.observations;
  }

  /**
   * Get the SPRT boundaries.
   */
  getBounds(): { upper: number; lower: number } {
    return { upper: this.upperBound, lower: this.lowerBound };
  }

  /**
   * Reset the accumulator to its initial state.
   */
  reset(): void {
    this.logLikelihoodRatio = 0;
    this.observations = 0;
  }
}

// ============================================================================
// Witness Chain
// ============================================================================

/** Genesis hash: 64 hex zeros */
const GENESIS_HASH = '0'.repeat(64);

/**
 * Append-only, hash-linked witness chain for quality gate decisions.
 *
 * Maintains an ordered sequence of witness receipts where each receipt
 * references the hash of its predecessor, forming a tamper-evident chain.
 *
 * @example
 * ```typescript
 * const chain = new WitnessChain();
 * const receipt = chain.appendWitness({
 *   type: 'coherence-gate',
 *   decision: 'PASS',
 *   context: { energy: 0.23, threshold: 0.4 },
 * });
 * const result = chain.verifyChain();
 * console.log(result.valid); // true
 * ```
 */
export class WitnessChain {
  private receipts: WitnessReceipt[] = [];
  private lastHash: string = GENESIS_HASH;
  private readonly sprtAccumulators: Map<string, SPRTAccumulator> = new Map();

  /**
   * Append a witness decision to the chain.
   *
   * Creates a new receipt hash-linked to the previous receipt and appends
   * it to the chain. Optionally updates the SPRT accumulator for the
   * decision type.
   *
   * @param decision - The decision to witness
   * @returns The new witness receipt with its chain hash
   */
  appendWitness(decision: WitnessDecision): WitnessReceipt {
    const id = randomUUID();
    const timestamp = Date.now();
    const chainIndex = this.receipts.length;

    // Compute receipt hash: SHA-256(previousHash + JSON(decision) + timestamp)
    const hashPayload = this.lastHash + JSON.stringify(decision) + timestamp;
    const hash = createHash('sha256').update(hashPayload).digest('hex');

    const receipt: WitnessReceipt = {
      id,
      timestamp,
      previousHash: this.lastHash,
      hash,
      decision,
      chainIndex,
    };

    this.receipts.push(receipt);
    this.lastHash = hash;

    // Update SPRT accumulator for this decision type
    this.updateSPRT(decision);

    logger.debug('Witness appended', {
      chainIndex,
      type: decision.type,
      decision: decision.decision,
      hash: hash.slice(0, 16) + '...',
    });

    return receipt;
  }

  /**
   * Verify the integrity of the entire witness chain.
   *
   * Walks the chain from genesis to tip, recomputing each receipt's hash
   * and checking it against the stored value. Reports the first breakage.
   *
   * @returns Verification result with validity, length, and break point
   */
  verifyChain(): ChainVerificationResult {
    if (this.receipts.length === 0) {
      return {
        valid: true,
        length: 0,
        brokenAt: -1,
        message: 'Chain is empty (valid)',
        lastHash: GENESIS_HASH,
      };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < this.receipts.length; i++) {
      const receipt = this.receipts[i];

      // Check previousHash link
      if (receipt.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          length: this.receipts.length,
          brokenAt: i,
          message: `Chain broken at index ${i}: previousHash mismatch`,
          lastHash: this.lastHash,
        };
      }

      // Recompute hash
      const hashPayload =
        receipt.previousHash + JSON.stringify(receipt.decision) + receipt.timestamp;
      const expectedHash = createHash('sha256').update(hashPayload).digest('hex');

      if (receipt.hash !== expectedHash) {
        return {
          valid: false,
          length: this.receipts.length,
          brokenAt: i,
          message: `Chain broken at index ${i}: hash mismatch (tamper detected)`,
          lastHash: this.lastHash,
        };
      }

      expectedPrevHash = receipt.hash;
    }

    return {
      valid: true,
      length: this.receipts.length,
      brokenAt: -1,
      message: `Chain valid (${this.receipts.length} receipts)`,
      lastHash: this.lastHash,
    };
  }

  /**
   * Get receipts from the chain.
   *
   * @param limit - Maximum number of receipts to return (from most recent).
   *                If omitted, returns the entire chain.
   * @returns Array of witness receipts
   */
  getChain(limit?: number): WitnessReceipt[] {
    if (limit !== undefined && limit > 0) {
      return [...this.receipts.slice(-limit)];
    }
    return [...this.receipts];
  }

  /**
   * Get the total number of receipts in the chain.
   */
  getChainLength(): number {
    return this.receipts.length;
  }

  /**
   * Get the hash of the most recent receipt (chain tip).
   */
  getLastHash(): string {
    return this.lastHash;
  }

  /**
   * Export the chain as a JSON string for brain transfer.
   *
   * @returns JSON string containing the full chain
   */
  exportChain(): string {
    const data: WitnessChainExport = {
      version: '1.0.0',
      exportedAt: Date.now(),
      length: this.receipts.length,
      receipts: this.receipts,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import a chain from a JSON string.
   *
   * Validates the imported chain integrity before accepting it.
   * Replaces the current chain if valid.
   *
   * @param data - JSON string from exportChain()
   * @returns true if import was successful, false if data was invalid
   */
  importChain(data: string): boolean {
    try {
      const parsed = JSON.parse(data) as WitnessChainExport;

      // Validate structure
      if (!parsed || parsed.version !== '1.0.0' || !Array.isArray(parsed.receipts)) {
        logger.warn('Import failed: invalid format');
        return false;
      }

      // Validate chain integrity before accepting
      const savedReceipts = this.receipts;
      const savedLastHash = this.lastHash;

      this.receipts = parsed.receipts;
      this.lastHash =
        parsed.receipts.length > 0
          ? parsed.receipts[parsed.receipts.length - 1].hash
          : GENESIS_HASH;

      const verification = this.verifyChain();
      if (!verification.valid) {
        // Rollback
        this.receipts = savedReceipts;
        this.lastHash = savedLastHash;
        logger.warn('Import failed: chain integrity check failed', {
          message: verification.message,
        });
        return false;
      }

      logger.info('Chain imported successfully', { length: parsed.receipts.length });
      return true;
    } catch (error) {
      logger.warn('Import failed: parse error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get or create an SPRT accumulator for a decision type.
   *
   * @param type - The decision type (e.g., 'coherence-gate')
   * @param alpha - Type I error rate (default: 0.05)
   * @param beta - Type II error rate (default: 0.05)
   * @returns The SPRT accumulator for the given type
   */
  getSPRT(type: string, alpha?: number, beta?: number): SPRTAccumulator {
    if (!this.sprtAccumulators.has(type)) {
      this.sprtAccumulators.set(type, new SPRTAccumulator(alpha, beta));
    }
    return this.sprtAccumulators.get(type)!;
  }

  /**
   * Get a receipt by chain index.
   *
   * @param index - The chain index (0-based)
   * @returns The receipt at the given index, or undefined if out of range
   */
  getReceipt(index: number): WitnessReceipt | undefined {
    return this.receipts[index];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Update the SPRT accumulator based on the decision.
   */
  private updateSPRT(decision: WitnessDecision): void {
    const positive = decision.decision === 'PASS' || decision.decision === 'PERMIT';
    const accumulator = this.getSPRT(decision.type);
    accumulator.addEvidence(positive);
  }
}

// ============================================================================
// SQLite-Backed Witness Chain
// ============================================================================

/**
 * Persistence interface for witness chain SQLite backing.
 *
 * Implementations must provide methods to store and retrieve receipts
 * from the unified SQLite database. This keeps WitnessChain decoupled
 * from the database layer.
 */
export interface IWitnessChainPersistence {
  /** Store a receipt in SQLite. Called after each appendWitness(). */
  insertReceipt(receipt: WitnessReceipt): void;
  /** Load all receipts from SQLite, ordered by chainIndex. */
  loadAllReceipts(): WitnessReceipt[];
  /** Get the total count of persisted receipts. */
  getReceiptCount(): number;
}

/**
 * SQLite-backed WitnessChain that persists receipts to the unified database.
 *
 * Extends WitnessChain with optional SQLite persistence. When a persistence
 * backend is provided, each witness receipt is written to SQLite on append,
 * and the chain can be restored from SQLite on startup.
 *
 * @example
 * ```typescript
 * const persistence = createWitnessChainSQLitePersistence(db);
 * const chain = createPersistentWitnessChain(persistence);
 * // Chain is automatically loaded from SQLite on creation
 * ```
 */
export class PersistentWitnessChain extends WitnessChain {
  private readonly persistence: IWitnessChainPersistence;

  constructor(persistence: IWitnessChainPersistence) {
    super();
    this.persistence = persistence;

    // Restore chain from SQLite
    const storedReceipts = persistence.loadAllReceipts();
    if (storedReceipts.length > 0) {
      const exported: WitnessChainExport = {
        version: '1.0.0',
        exportedAt: Date.now(),
        length: storedReceipts.length,
        receipts: storedReceipts,
      };
      const imported = this.importChain(JSON.stringify(exported));
      if (imported) {
        logger.info('Witness chain restored from SQLite', {
          receipts: storedReceipts.length,
        });
      } else {
        logger.warn('Failed to restore witness chain from SQLite — starting fresh');
      }
    }
  }

  /**
   * Append a witness and persist it to SQLite.
   */
  override appendWitness(decision: WitnessDecision): WitnessReceipt {
    const receipt = super.appendWitness(decision);
    try {
      this.persistence.insertReceipt(receipt);
    } catch (err) {
      logger.warn('Failed to persist witness receipt to SQLite', {
        chainIndex: receipt.chainIndex,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return receipt;
  }
}

/**
 * Create a SQLite persistence backend using better-sqlite3.
 *
 * Creates the `witness_chain_receipts` table if it doesn't exist
 * and provides insert/load methods.
 *
 * @param db - better-sqlite3 Database instance (from unified persistence)
 * @returns IWitnessChainPersistence implementation
 */
export function createWitnessChainSQLitePersistence(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown }; exec: (sql: string) => void },
): IWitnessChainPersistence {
  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS witness_chain_receipts (
      id TEXT PRIMARY KEY,
      chain_index INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      previous_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      decision_outcome TEXT NOT NULL,
      decision_context TEXT NOT NULL,
      decision_evidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_witness_chain_index
    ON witness_chain_receipts(chain_index)
  `);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO witness_chain_receipts
    (id, chain_index, timestamp, previous_hash, hash,
     decision_type, decision_outcome, decision_context, decision_evidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const loadAllStmt = db.prepare(`
    SELECT * FROM witness_chain_receipts ORDER BY chain_index ASC
  `);

  const countStmt = db.prepare(`
    SELECT COUNT(*) as cnt FROM witness_chain_receipts
  `);

  return {
    insertReceipt(receipt: WitnessReceipt): void {
      insertStmt.run(
        receipt.id,
        receipt.chainIndex,
        receipt.timestamp,
        receipt.previousHash,
        receipt.hash,
        receipt.decision.type,
        receipt.decision.decision,
        JSON.stringify(receipt.decision.context),
        receipt.decision.evidence ?? null,
      );
    },

    loadAllReceipts(): WitnessReceipt[] {
      const rows = loadAllStmt.all() as Array<{
        id: string;
        chain_index: number;
        timestamp: number;
        previous_hash: string;
        hash: string;
        decision_type: string;
        decision_outcome: string;
        decision_context: string;
        decision_evidence: number | null;
      }>;

      return rows.map(row => {
        let context: Record<string, unknown> = {};
        try {
          context = JSON.parse(row.decision_context) as Record<string, unknown>;
        } catch {
          logger.warn('Corrupt decision_context in witness receipt, using empty object', {
            receiptId: row.id,
            chainIndex: row.chain_index,
          });
        }
        return {
          id: row.id,
          chainIndex: row.chain_index,
          timestamp: row.timestamp,
          previousHash: row.previous_hash,
          hash: row.hash,
          decision: {
            type: row.decision_type,
            decision: row.decision_outcome as WitnessDecision['decision'],
            context,
            evidence: row.decision_evidence ?? undefined,
          },
        };
      });
    },

    getReceiptCount(): number {
      const row = countStmt.get() as { cnt: number };
      return row.cnt;
    },
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new WitnessChain instance (in-memory).
 *
 * @returns A new empty WitnessChain
 */
export function createWitnessChain(): WitnessChain {
  return new WitnessChain();
}

/**
 * Create a SQLite-backed WitnessChain that persists receipts.
 *
 * @param persistence - SQLite persistence backend
 * @returns A PersistentWitnessChain loaded from SQLite
 */
export function createPersistentWitnessChain(
  persistence: IWitnessChainPersistence,
): PersistentWitnessChain {
  return new PersistentWitnessChain(persistence);
}

/**
 * Check if the witness chain feature is enabled.
 *
 * @returns true if the useWitnessChain feature flag is on
 */
export function isWitnessChainFeatureEnabled(): boolean {
  return getRuVectorFeatureFlags().useWitnessChain;
}
