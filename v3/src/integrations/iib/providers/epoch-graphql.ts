/**
 * Agentic QE v3 - EPOCH Monitoring GraphQL Provider
 *
 * Queries the EPOCH Monitoring database via its GraphQL API to retrieve
 * actual IIB message flow transaction data including full message bodies.
 *
 * This is the PREFERRED Layer 2 strategy when MQ Browse is not available:
 * - Returns actual IIB message payloads (Body field) — not indirect DB state
 * - Simple HTTP GET with GraphQL query — no special client libraries needed
 * - Read-only — safe for shared environments
 *
 * API contract discovered from: EPOCH_DB_GraphQL.postman_collection.json
 *   Endpoint: GET {baseUrl}/graphqlmdsit
 *   Query: getMessageList(OrderNo, MsgFlowName, LocalTransactionID, EventName)
 *   Returns: MSGFLOW_NAME, EVENT_NAME, LOCAL_TRANSACTION_ID,
 *            PARENT_TRANSACTION_ID, GLOBAL_TRANSACTION_ID, EVENT_TIMESTAMP, Body
 *
 * Provider priority: MQ Browse (primary) > EPOCH GraphQL (preferred fallback) > EPOCH DB (last resort)
 */

import type { Result } from '../../../shared/types';
import { ok, err } from '../../../shared/types';
import type {
  IIBPayloadProvider,
  IIBTransactionFilter,
  IIBTransaction,
  IIBError,
  FlowQueueMapping,
} from '../types';

// ============================================================================
// Configuration
// ============================================================================

export interface EpochGraphQLConfig {
  /** Base URL for the EPOCH GraphQL API (e.g., 'http://10.146.28.234:8082') */
  baseUrl: string;
  /** GraphQL endpoint path (default: '/graphqlmdsit') */
  endpoint?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

// ============================================================================
// GraphQL Response Types
// ============================================================================

interface EpochMessage {
  MSGFLOW_NAME: string;
  EVENT_NAME: string;
  LOCAL_TRANSACTION_ID: string;
  PARENT_TRANSACTION_ID: string;
  GLOBAL_TRANSACTION_ID: string;
  EVENT_TIMESTAMP: string;
  Body: string;
}

interface GraphQLResponse {
  data?: {
    getMessageList?: EpochMessage[];
  };
  errors?: Array<{ message: string }>;
}

// ============================================================================
// EPOCH GraphQL Provider
// ============================================================================

class EpochGraphQLProvider implements IIBPayloadProvider {
  private readonly config: EpochGraphQLConfig;
  private readonly queueMappings: FlowQueueMapping[];
  private readonly flowToQueueMap: Map<string, FlowQueueMapping>;
  private readonly queueToFlowMap: Map<string, string>;

  constructor(config: EpochGraphQLConfig, queueMappings: FlowQueueMapping[]) {
    this.config = config;
    this.queueMappings = queueMappings;
    this.flowToQueueMap = new Map(queueMappings.map(m => [m.flowName, m]));
    this.queueToFlowMap = new Map();
    for (const m of queueMappings) {
      if (m.inputQueue) this.queueToFlowMap.set(m.inputQueue, m.flowName);
      if (m.outputQueue) this.queueToFlowMap.set(m.outputQueue, m.flowName);
    }
  }

  // ============================================================================
  // IIBPayloadProvider — getFlowTransactions
  // ============================================================================

  async getFlowTransactions(
    flowName: string,
    filter: IIBTransactionFilter
  ): Promise<Result<IIBTransaction[], IIBError>> {
    try {
      if (!filter.orderId) {
        return err({ message: 'EPOCH GraphQL requires orderId filter', flowName });
      }

      const messages = await this.queryEpoch(filter.orderId, flowName);

      if (messages.length === 0) {
        return ok([]);
      }

      const mapping = this.flowToQueueMap.get(flowName);
      const direction = this.inferDirection(flowName);

      const transactions: IIBTransaction[] = messages.map((msg) => ({
        flowName: msg.MSGFLOW_NAME || flowName,
        queueName: mapping?.outputQueue ?? mapping?.inputQueue ?? flowName,
        timestamp: msg.EVENT_TIMESTAMP || new Date().toISOString(),
        payload: msg.Body || '',
        direction,
        correlationId: filter.orderId,
        messageId: msg.LOCAL_TRANSACTION_ID || msg.GLOBAL_TRANSACTION_ID,
        eventName: msg.EVENT_NAME || undefined,
      }));

      // Apply maxMessages limit
      const limit = filter.maxMessages ?? transactions.length;
      return ok(transactions.slice(0, limit));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err({ message: `EPOCH GraphQL query failed: ${message}`, flowName });
    }
  }

  // ============================================================================
  // IIBPayloadProvider — browseQueue
  // ============================================================================

  async browseQueue(
    queueName: string,
    filter: IIBTransactionFilter
  ): Promise<Result<IIBTransaction[], IIBError>> {
    const flowName = this.queueToFlowMap.get(queueName);
    if (!flowName) {
      return err({ message: `No flow mapping found for queue: ${queueName}` });
    }
    return this.getFlowTransactions(flowName, filter);
  }

  // ============================================================================
  // IIBPayloadProvider — healthCheck
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    try {
      // Send a minimal introspection query to verify the server is alive.
      // Accept 200-499 (server is alive even if it rejects our query);
      // only 5xx or network errors mean truly unavailable.
      const url = this.buildUrl();
      const probe = JSON.stringify({ query: '{ __typename }' });
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: probe,
        signal: AbortSignal.timeout(5000),
      });
      return response.status < 500;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // GraphQL Query
  // ============================================================================

  private async queryEpoch(orderNo: string, flowName: string): Promise<EpochMessage[]> {
    const query = `{
      getMessageList(OrderNo: "${this.sanitize(orderNo)}", MsgFlowName: "${this.sanitize(flowName)}", LocalTransactionID: "", EventName: "") {
        MSGFLOW_NAME
        EVENT_NAME
        LOCAL_TRANSACTION_ID
        PARENT_TRANSACTION_ID
        GLOBAL_TRANSACTION_ID
        EVENT_TIMESTAMP
        Body
      }
    }`;

    const url = this.buildUrl();
    const timeout = this.config.timeout ?? 30_000;

    // IMPORTANT: Must use POST. The Postman collection shows GET+body with
    // "disableBodyPruning: true" — that's a Postman-only hack. Node.js fetch()
    // silently drops the body on GET per the Fetch spec. POST is the standard
    // way to send a GraphQL query body.
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`EPOCH GraphQL HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json() as GraphQLResponse;

    // Check errors first — GraphQL can return partial data + errors simultaneously
    if (json.errors?.length) {
      const detail = json.errors.map(e => e.message).join('; ');
      throw new Error(`EPOCH GraphQL error: ${detail}`);
    }

    return json.data?.getMessageList ?? [];
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private buildUrl(): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const endpoint = this.config.endpoint ?? '/graphqlmdsit';
    return `${base}${endpoint}`;
  }

  private inferDirection(flowName: string): 'input' | 'output' {
    const inputFlows = [
      'MF_ADS_WMS_ShipmentConfirm_SYNC',
      'MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC',
      'MF_ADS_CARRIER_KAFKA_OMS_PUSH_PODUpdate',
      'MF_ADS_WMS_ReturnConfirmation_SYNC',
    ];
    return inputFlows.includes(flowName) ? 'input' : 'output';
  }

  /** Sanitize GraphQL string values — prevent injection */
  private sanitize(value: string): string {
    return value.replace(/["\\\n\r]/g, '');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an EPOCH GraphQL IIB provider.
 * Preferred fallback when MQ Browse is unavailable — returns actual IIB payloads.
 *
 * @param config - EPOCH GraphQL API connection config
 * @param queueMappings - Flow-to-queue name mappings (client-specific)
 */
export function createEpochGraphQLProvider(
  config: EpochGraphQLConfig,
  queueMappings: FlowQueueMapping[]
): IIBPayloadProvider {
  return new EpochGraphQLProvider(config, queueMappings);
}
