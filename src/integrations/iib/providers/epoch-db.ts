/**
 * Agentic QE v3 - Sterling DB State Verifier (via EPOCH DB connection)
 *
 * IMPORTANT: This is a FALLBACK Layer 2 strategy, NOT the primary.
 * MQ Browse is the primary IIB provider (verifies actual message flow execution).
 * This provider queries Sterling's YFS_* tables via the same Oracle connection
 * that the EPOCH monitoring tool uses. It verifies DATABASE STATE — indirect
 * evidence that IIB flows ran — NOT actual message payloads.
 *
 * Limitations:
 * - Cannot prove a specific IIB flow executed — only that expected DB state exists
 * - A step will pass if the data exists regardless of how it got there
 * - Use MQ Browse when available for real IIB flow verification
 *
 * Requires:
 * - npm install oracledb (optional dependency — dynamically imported)
 * - Oracle Instant Client OR oracledb thin mode (Oracle 21c+)
 * - EPOCH DB credentials from Adidas middleware team
 *
 * Schema discovered from: omnihub-baseline/em-dashboard/env/sit/epochreportdetails.properties
 * Tables: YFS_ORDER_HEADER, YFS_ORDER_LINE, YFS_ORDER_RELEASE, YFS_ORDER_RELEASE_STATUS,
 *         YFS_SHIPMENT, YFS_SHIPMENT_LINE, YFS_SHIPMENT_CONTAINER, YFS_ORDER_INVOICE,
 *         YFS_PERSON_INFO, YFS_RECEIPT_HEADER, YFS_NOTES, YFS_COMMON_CODE, YFS_STATUS
 */

import type { Result } from '../../../shared/types';
import { ok, err } from '../../../shared/types';
import type {
  IIBPayloadProvider,
  IIBTransactionFilter,
  IIBTransaction,
  IIBError,
  EpochDBConfig,
  FlowQueueMapping,
} from '../types';

// ============================================================================
// Dynamic oracledb Import
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oracledb: any = null;

async function loadOracleLibrary(): Promise<void> {
  if (oracledb) return;
  try {
    const mod = await import('oracledb');
    oracledb = mod.default ?? mod;
    // Enable thin mode by default (no Oracle Instant Client needed for 21c+)
    if (typeof oracledb.initOracleClient === 'function') {
      try { oracledb.initOracleClient(); } catch { /* thin mode fallback */ }
    }
  } catch {
    throw new Error(
      'oracledb package not installed. Run: npm install oracledb\n' +
      'For Oracle 21c+ databases, thin mode works without Oracle Instant Client.'
    );
  }
}

// ============================================================================
// EPOCH DB Provider Implementation
// ============================================================================

class EpochDBProvider implements IIBPayloadProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any = null;
  private pendingPool: Promise<void> | null = null;
  private readonly config: EpochDBConfig;
  private readonly queueMappings: FlowQueueMapping[];
  private readonly flowToQueueMap: Map<string, FlowQueueMapping>;
  private readonly queueToFlowMap: Map<string, string>;

  constructor(config: EpochDBConfig, queueMappings: FlowQueueMapping[]) {
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
  // Connection Pool Management
  // ============================================================================

  private async ensurePool(): Promise<void> {
    if (this.pool) return;
    if (this.pendingPool) { await this.pendingPool; return; }

    this.pendingPool = (async () => {
      await loadOracleLibrary();
      const connectString = `${this.config.host}:${this.config.port}/${this.config.serviceName}`;
      this.pool = await oracledb.createPool({
        user: this.config.user,
        password: this.config.password,
        connectString,
        poolMin: this.config.poolMin ?? 2,
        poolMax: this.config.poolMax ?? 10,
        poolTimeout: Math.floor((this.config.connectTimeout ?? 15000) / 1000),
      });
    })();

    try {
      await this.pendingPool;
    } finally {
      this.pendingPool = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async query(sql: string, binds: Record<string, any>): Promise<any[]> {
    await this.ensurePool();
    const conn = await this.pool.getConnection();
    try {
      const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return result.rows ?? [];
    } finally {
      await conn.close();
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
        return err({ message: 'EPOCH DB requires orderId filter', flowName });
      }

      const mapping = this.flowToQueueMap.get(flowName);
      const direction = this.inferDirection(flowName);

      // -----------------------------------------------------------------------
      // Step 1: Resolve ORDER_HEADER_KEY from order number
      // -----------------------------------------------------------------------
      const headerRows = await this.query(
        `SELECT yoh.ORDER_HEADER_KEY, yoh.CREATETS
         FROM ${this.t('YFS_ORDER_HEADER')} yoh
         WHERE yoh.ORDER_NO = :orderId AND ROWNUM <= 1`,
        { orderId: filter.orderId }
      );

      if (headerRows.length === 0) {
        return ok([]);
      }

      const orderHeaderKey = headerRows[0].ORDER_HEADER_KEY;

      // -----------------------------------------------------------------------
      // Step 2: Run flow-specific evidence query when available.
      // A flow-specific query checks for DB state that SHOULD exist only after
      // the specific IIB flow executed. This is indirect evidence (DB state,
      // not actual message payloads), but targeted to the flow.
      // Returns empty if no flow-specific query exists (honest: no evidence).
      // -----------------------------------------------------------------------
      const flowQuery = this.getFlowSpecificQuery(flowName, filter.orderId, orderHeaderKey);
      let evidenceRows: unknown[];
      let evidenceDescription: string;

      if (flowQuery) {
        evidenceRows = await this.query(flowQuery.sql, flowQuery.binds);
        evidenceDescription = flowQuery.evidenceDescription;
      } else {
        // No flow-specific query for this flow — we cannot provide evidence.
        // Returning empty is honest: we don't know if this flow ran.
        return ok([]);
      }

      if (evidenceRows.length === 0) {
        // Flow-specific evidence not found → the flow likely hasn't run yet
        return ok([]);
      }

      // -----------------------------------------------------------------------
      // Step 3: Build transaction with evidence payload
      // -----------------------------------------------------------------------
      const payload = JSON.stringify({
        _provider: 'sterling-db-state-verifier',
        _warning: 'This is DB state evidence, not an actual IIB message payload',
        evidenceDescription,
        flowName,
        evidence: evidenceRows,
      });

      const timestamp = headerRows[0].CREATETS
        ? new Date(headerRows[0].CREATETS).toISOString()
        : new Date().toISOString();

      const transaction: IIBTransaction = {
        flowName,
        queueName: mapping?.outputQueue ?? mapping?.inputQueue ?? flowName,
        timestamp,
        payload,
        direction,
        correlationId: filter.orderId,
        messageId: `epoch-${orderHeaderKey}`,
      };

      return ok([transaction]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err({ message: `EPOCH DB query failed: ${message}`, flowName });
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
      const rows = await this.query('SELECT 1 AS ALIVE FROM DUAL', {});
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Disconnect (pool teardown)
  // ============================================================================

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close(0);
      this.pool = null;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /** Prefix table name with schema if configured */
  private t(tableName: string): string {
    return this.config.schema ? `${this.config.schema}.${tableName}` : tableName;
  }

  private inferDirection(flowName: string): 'input' | 'output' {
    // Flows that receive data INTO OMS are 'input'; flows that send data OUT are 'output'
    const inputFlows = [
      'MF_ADS_WMS_ShipmentConfirm_SYNC',
      'MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC',
      'MF_ADS_CARRIER_KAFKA_OMS_PUSH_PODUpdate',
      'MF_ADS_WMS_ReturnConfirmation_SYNC',
    ];
    return inputFlows.includes(flowName) ? 'input' : 'output';
  }

  /**
   * Map IIB flow name → flow-specific DB evidence query.
   * Returns the SQL + description of what DB state proves the flow ran.
   * If no flow-specific query exists, returns null (caller returns empty — no evidence).
   */
  private getFlowSpecificQuery(flowName: string, orderId: string, orderHeaderKey: string): {
    sql: string;
    binds: Record<string, unknown>;
    evidenceDescription: string;
  } | null {
    switch (flowName) {
      case 'MF_ADS_OMS_ShipmentRequest_WMS_SYNC':
        // ShipmentRequest → evidence: SHIPMENT records with SHIP_NODE
        return {
          sql: `SELECT ys.SHIPMENT_NO, ys.STATUS, ys.SHIPNODE_KEY
                FROM ${this.t('YFS_SHIPMENT')} ys
                JOIN ${this.t('YFS_SHIPMENT_LINE')} ysl ON ys.SHIPMENT_KEY = ysl.SHIPMENT_KEY
                WHERE ysl.ORDER_HEADER_KEY = :ohk AND ys.SHIPNODE_KEY IS NOT NULL`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Shipment records with ship node assigned',
        };

      case 'MF_ADS_WMS_ShipmentConfirm_SYNC':
        // ShipConfirm → evidence: SHIPMENT with SHIP_DATE populated
        return {
          sql: `SELECT ys.SHIPMENT_NO, ys.SHIP_DATE, ysc.TRACKING_NO
                FROM ${this.t('YFS_SHIPMENT')} ys
                JOIN ${this.t('YFS_SHIPMENT_LINE')} ysl ON ys.SHIPMENT_KEY = ysl.SHIPMENT_KEY
                LEFT JOIN ${this.t('YFS_SHIPMENT_CONTAINER')} ysc ON ys.SHIPMENT_KEY = ysc.SHIPMENT_KEY
                WHERE ysl.ORDER_HEADER_KEY = :ohk AND ys.SHIP_DATE IS NOT NULL`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Shipment with ship date and tracking (post-WMS confirm)',
        };

      case 'MF_ADS_OMS_AFS_SalesOrderCreation':
        // AFS SO Creation → evidence: ORDER_RELEASE_STATUS with status >= 3200
        return {
          sql: `SELECT yors.STATUS, yors.STATUS_DATE
                FROM ${this.t('YFS_ORDER_RELEASE_STATUS')} yors
                JOIN ${this.t('YFS_ORDER_LINE')} yol ON yors.ORDER_LINE_KEY = yol.ORDER_LINE_KEY
                WHERE yol.ORDER_HEADER_KEY = :ohk AND yors.STATUS >= '3200'`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Order release status >= 3200 (released to AFS)',
        };

      case 'MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC':
        // NShift label → evidence: SHIPMENT_CONTAINER with TRACKING_NO
        return {
          sql: `SELECT ysc.TRACKING_NO, ysc.CONTAINER_NO
                FROM ${this.t('YFS_SHIPMENT_CONTAINER')} ysc
                JOIN ${this.t('YFS_SHIPMENT')} ys ON ysc.SHIPMENT_KEY = ys.SHIPMENT_KEY
                JOIN ${this.t('YFS_SHIPMENT_LINE')} ysl ON ys.SHIPMENT_KEY = ysl.SHIPMENT_KEY
                WHERE ysl.ORDER_HEADER_KEY = :ohk AND ysc.TRACKING_NO IS NOT NULL`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Tracking numbers assigned (post-NShift label)',
        };

      case 'MF_ADS_OMS_AFS_Invoice':
        // Invoice flow → evidence: ORDER_INVOICE records
        return {
          sql: `SELECT yin.INVOICE_NO, yin.INVOICE_TYPE, yin.TOTAL_AMOUNT
                FROM ${this.t('YFS_ORDER_INVOICE')} yin
                WHERE yin.ORDER_HEADER_KEY = :ohk`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Invoice records created',
        };

      case 'MF_ADS_EPOCH_ReturnAuthorization_WE':
        // Return auth → evidence: ORDER_HEADER with DOC_TYPE 0003 linked to original
        return {
          sql: `SELECT yoh.ORDER_NO, yoh.DOCUMENT_TYPE, yoh.STATUS
                FROM ${this.t('YFS_ORDER_HEADER')} yoh
                WHERE yoh.ORDER_NO = :orderId AND yoh.DOCUMENT_TYPE = '0003'`,
          binds: { orderId },
          evidenceDescription: 'Return order (doc type 0003) exists',
        };

      case 'MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC':
        // PP SO Ack → evidence: ORDER_RELEASE with RELEASE_STATUS indicating AFS acknowledged
        return {
          sql: `SELECT yor.ORDER_RELEASE_KEY, yor.STATUS
                FROM ${this.t('YFS_ORDER_RELEASE')} yor
                JOIN ${this.t('YFS_ORDER_LINE')} yol ON yor.ORDER_LINE_KEY = yol.ORDER_LINE_KEY
                WHERE yol.ORDER_HEADER_KEY = :ohk AND yor.STATUS >= '3350'`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Order release status >= 3350 (AFS acknowledged)',
        };

      case 'MF_ADS_CARRIER_KAFKA_OMS_PUSH_PODUpdate':
        // POD Update → evidence: SHIPMENT with DELIVERY_DATE populated
        return {
          sql: `SELECT ys.SHIPMENT_NO, ys.DELIVERY_DATE, ys.STATUS
                FROM ${this.t('YFS_SHIPMENT')} ys
                JOIN ${this.t('YFS_SHIPMENT_LINE')} ysl ON ys.SHIPMENT_KEY = ysl.SHIPMENT_KEY
                WHERE ysl.ORDER_HEADER_KEY = :ohk AND ys.DELIVERY_DATE IS NOT NULL`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Shipment with delivery date (post-POD update)',
        };

      case 'MF_ADS_WMS_ReturnConfirmation_SYNC':
        // Return confirm → evidence: RECEIPT_HEADER for the order
        return {
          sql: `SELECT yrh.RECEIPT_HEADER_KEY, yrh.RECEIPT_NO, yrh.STATUS
                FROM ${this.t('YFS_RECEIPT_HEADER')} yrh
                WHERE yrh.ORDER_HEADER_KEY = :ohk`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Receipt header exists (post-WMS return confirmation)',
        };

      case 'MF_ADS_OMS_AFS_ReturnSalesOrderCreation':
        // Return SO creation → evidence: ORDER_LINE on return order with status >= 3700
        return {
          sql: `SELECT yol.ORDER_LINE_KEY, yol.STATUS
                FROM ${this.t('YFS_ORDER_LINE')} yol
                WHERE yol.ORDER_HEADER_KEY = :ohk AND yol.STATUS >= '3700'`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Return order lines with status >= 3700 (return SO created in AFS)',
        };

      case 'MF_ADS_OMS_AFS_CreditNote':
        // Credit note → evidence: ORDER_INVOICE with CREDIT_MEMO type
        return {
          sql: `SELECT yin.INVOICE_NO, yin.INVOICE_TYPE, yin.TOTAL_AMOUNT
                FROM ${this.t('YFS_ORDER_INVOICE')} yin
                WHERE yin.ORDER_HEADER_KEY = :ohk AND yin.INVOICE_TYPE = 'CREDIT_MEMO'`,
          binds: { ohk: orderHeaderKey },
          evidenceDescription: 'Credit memo invoice exists',
        };

      default:
        // No flow-specific query available — return null so caller gets empty result.
        // This is honest: we have no evidence this specific flow ran.
        return null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Sterling DB state verifier (via EPOCH DB connection).
 * This is a FALLBACK IIB provider — prefer MQ Browse for real flow verification.
 * Returns DB state as indirect evidence that IIB flows executed.
 *
 * @param config - Oracle DB connection config (host, port, service name, credentials)
 * @param queueMappings - Flow-to-queue name mappings (client-specific)
 */
export function createEpochDBProvider(
  config: EpochDBConfig,
  queueMappings: FlowQueueMapping[]
): IIBPayloadProvider & { disconnect(): Promise<void> } {
  return new EpochDBProvider(config, queueMappings);
}
