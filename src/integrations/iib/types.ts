/**
 * Agentic QE v3 - IIB Payload Provider Types
 * Generic IBM Integration Bus / App Connect Enterprise types.
 * Reusable across all clients using IBM IIB/ACE middleware.
 *
 * PRIMARY STRATEGY: MQ queue browse via `ibmmq`.
 * Every IIB flow reads from / writes to MQ queues regardless of
 * its external protocol (MQ, SOAP, HTTP, file). Browse mode is
 * read-only — safe for shared environments.
 *
 * Other strategies (IIB Admin REST, EAI hub, Sterling audit) are
 * bonus/fallback options. See providers/ for implementations.
 */

import type { Result } from '../../shared/types';

// ============================================================================
// IIB Provider Interface
// ============================================================================

/**
 * Provides access to IIB message flow transaction data.
 * One implementation per access strategy.
 */
export interface IIBPayloadProvider {
  getFlowTransactions(
    flowName: string,
    filter: IIBTransactionFilter
  ): Promise<Result<IIBTransaction[], IIBError>>;

  browseQueue(
    queueName: string,
    filter: IIBTransactionFilter
  ): Promise<Result<IIBTransaction[], IIBError>>;

  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface IIBTransactionFilter {
  orderId?: string;
  timeRangeMinutes?: number;
  maxMessages?: number;
}

export interface IIBTransaction {
  flowName: string;
  queueName: string;
  timestamp: string;
  payload: string;                     // Raw XML/JSON message body
  direction: 'input' | 'output';
  correlationId?: string;
  messageId?: string;
  /** EPOCH GraphQL EVENT_NAME — the IIB terminal name (e.g., "Input", "HTTP Reply") */
  eventName?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface IIBError {
  message: string;
  status?: number;
  flowName?: string;
  mqReasonCode?: number;
}

// ============================================================================
// MQ Browse Configuration (PRIMARY)
// ============================================================================

export interface MQBrowseConfig {
  /** Queue manager name (e.g., 'QMGR_ADWE_01') */
  queueManager: string;
  /** MQ hostname (e.g., 'mq.adidas.com') */
  host: string;
  /** MQ listener port (e.g., 1414) */
  port: number;
  /** MQ channel name (e.g., 'SYSTEM.DEF.SVRCONN') */
  channel: string;
  /** Optional username for MQ auth */
  username?: string;
  /** Optional password for MQ auth */
  password?: string;
  /** Max message size in bytes. Default: 64KB */
  maxMessageSize?: number;
  /** Connection timeout in ms. Default: 15000 */
  connectTimeout?: number;
}

// ============================================================================
// EPOCH DB Configuration (FALLBACK Layer 2 — MQ Browse is primary)
// ============================================================================

export interface EpochDBConfig {
  /** Oracle hostname (e.g., 'MNGUS014' or '10.137.12.138') */
  host: string;
  /** Oracle listener port (default: 1521) */
  port: number;
  /** Oracle service name (e.g., 'MNGORA11') */
  serviceName: string;
  /** Database user (e.g., 'DOM232' for EPOCH schema) */
  user: string;
  /** Database password */
  password: string;
  /** Target schema (e.g., 'omsdev') */
  schema?: string;
  /** Connection pool minimum (default: 2) */
  poolMin?: number;
  /** Connection pool maximum (default: 10) */
  poolMax?: number;
  /** Connection timeout in ms (default: 15000) */
  connectTimeout?: number;
}

// ============================================================================
// Queue Mapping (client-specific)
// ============================================================================

/**
 * Maps IIB flow names to their input/output MQ queue names.
 * Each client provides their own mapping in clients/<name>/queue-mapping.ts.
 */
export interface FlowQueueMapping {
  flowName: string;
  inputQueue?: string;
  outputQueue?: string;
}

// ============================================================================
// Provider Configuration (backward-compatible)
// ============================================================================

export interface IIBProviderConfig {
  strategy: 'mq-browse' | 'epoch-db' | 'admin-rest' | 'eai-hub' | 'sterling-audit';
  /** MQ browse config — required when strategy is 'mq-browse' */
  mqBrowse?: MQBrowseConfig;
  /** Flow-to-queue mappings — required when strategy is 'mq-browse' or 'epoch-db' */
  queueMappings?: FlowQueueMapping[];
  /** EPOCH DB config — required when strategy is 'epoch-db' */
  epochDb?: EpochDBConfig;
  /** Base URL — for admin-rest or eai-hub strategies */
  baseUrl?: string;
  auth?: {
    method: 'basic' | 'bearer' | 'apikey';
    username?: string;
    password?: string;
    token?: string;
  };
  timeout?: number;
}
