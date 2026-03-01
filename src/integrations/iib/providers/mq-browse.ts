/**
 * Agentic QE v3 - MQ Browse Provider
 * Implements IIBPayloadProvider using IBM MQ queue browse via `ibmmq`.
 *
 * Browse mode (MQOO_BROWSE) reads messages without consuming them —
 * safe for shared environments. Every IIB flow has MQ queues on
 * input/output regardless of external protocol (MQ, SOAP, HTTP, file).
 *
 * Requires:
 * - npm install ibmmq (optional dependency — dynamically imported)
 * - IBM MQ Redistributable Client (bundled with ibmmq on most platforms)
 * - MQ connection credentials from Adidas middleware team
 *
 * IMPORTANT: The ibmmq Promise API (ConnxPromise, OpenPromise, etc.) must
 * be validated against the installed ibmmq version on first real use.
 * Run `npm test -- --run tests/unit/integrations/iib/` after installing ibmmq.
 */

import type { Result } from '../../../shared/types';
import { ok, err } from '../../../shared/types';
import type {
  IIBPayloadProvider,
  IIBTransactionFilter,
  IIBTransaction,
  IIBError,
  MQBrowseConfig,
  FlowQueueMapping,
} from '../types';

// ============================================================================
// Dynamic ibmmq Import
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mq: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MQC: any = null;

async function loadMqLibrary(): Promise<void> {
  if (mq) return;
  try {
    const mod = await import('ibmmq');
    // Validate Promise API exists (ibmmq v2.0+ required)
    const required = ['ConnxPromise', 'OpenPromise', 'GetPromise', 'ClosePromise', 'DiscPromise'];
    const missing = required.filter(m => typeof (mod as Record<string, unknown>)[m] !== 'function');
    if (missing.length > 0) {
      throw new Error(
        `ibmmq package missing Promise API: ${missing.join(', ')}. ` +
        'Requires ibmmq v2.0+. Upgrade: npm install ibmmq@latest'
      );
    }
    mq = mod;
    MQC = mod.MQC;
  } catch (e) {
    if (e instanceof Error && e.message.includes('Promise API')) throw e;
    throw new Error(
      'ibmmq package not installed. Run: npm install ibmmq\n' +
      'Requires IBM MQ Redistributable Client (bundled with ibmmq on most platforms).'
    );
  }
}

// ============================================================================
// MQ Reason Codes
// ============================================================================

const MQRC_NO_MSG_AVAILABLE = 2033;
const MQRC_TRUNCATED_MSG_FAILED = 2080;
const MQRC_HCONN_ERROR = 2018;
const MQRC_CONNECTION_BROKEN = 2009;
const MQRC_Q_MGR_NOT_AVAILABLE = 2059;

function isConnectionError(reasonCode: number | undefined): boolean {
  return reasonCode === MQRC_HCONN_ERROR
    || reasonCode === MQRC_CONNECTION_BROKEN
    || reasonCode === MQRC_Q_MGR_NOT_AVAILABLE;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_MESSAGE_SIZE = 64 * 1024;  // 64KB
const LARGE_MESSAGE_SIZE = 1024 * 1024;      // 1MB fallback for truncated messages
const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_CONNECT_TIMEOUT = 15000;

// ============================================================================
// MQ Browse Provider Implementation
// ============================================================================

class MQBrowseProvider implements IIBPayloadProvider {
  private config: MQBrowseConfig;
  private queueMappings: Map<string, FlowQueueMapping>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hConn: any = null;

  constructor(config: MQBrowseConfig, mappings: FlowQueueMapping[]) {
    this.config = config;
    this.queueMappings = new Map(mappings.map((m) => [m.flowName, m]));
  }

  async getFlowTransactions(
    flowName: string,
    filter: IIBTransactionFilter
  ): Promise<Result<IIBTransaction[], IIBError>> {
    const mapping = this.queueMappings.get(flowName);
    if (!mapping) {
      return err({
        message: `No queue mapping found for flow '${flowName}'. ` +
          `Available flows: ${[...this.queueMappings.keys()].join(', ')}`,
        flowName,
      });
    }

    const allTransactions: IIBTransaction[] = [];

    for (const [queueName, direction] of this.getQueuesForMapping(mapping)) {
      const result = await this.browseQueue(queueName, filter);
      if (result.success) {
        for (const txn of result.value) {
          txn.flowName = flowName;
          txn.direction = direction;
          allTransactions.push(txn);
        }
      }
      // Non-fatal: if one queue fails, still return results from the other
    }

    return ok(allTransactions);
  }

  async browseQueue(
    queueName: string,
    filter: IIBTransactionFilter
  ): Promise<Result<IIBTransaction[], IIBError>> {
    try {
      await loadMqLibrary();
      const transactions = await this.browseWithReconnect(queueName, filter);
      return ok(transactions);
    } catch (e) {
      return err({
        message: e instanceof Error ? e.message : String(e),
        mqReasonCode: extractReasonCode(e),
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await loadMqLibrary();
      const conn = await this.connect();
      await this.disconnect(conn);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  private async browseWithReconnect(
    queueName: string,
    filter: IIBTransactionFilter
  ): Promise<IIBTransaction[]> {
    try {
      const conn = await this.ensureConnection();
      return await this.browseMessages(conn, queueName, filter);
    } catch (e) {
      // Reconnect once on stale connection errors — route through ensureConnection()
      // to serialize concurrent reconnection attempts via the pendingConnect mutex
      if (isConnectionError(extractReasonCode(e))) {
        this.hConn = null;
        const conn = await this.ensureConnection();
        return await this.browseMessages(conn, queueName, filter);
      }
      throw e;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pendingConnect: Promise<any> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensureConnection(): Promise<any> {
    if (this.hConn) return this.hConn;
    // Serialize concurrent connection attempts — all callers await the same promise
    if (!this.pendingConnect) {
      this.pendingConnect = this.connect()
        .then(conn => { this.hConn = conn; this.pendingConnect = null; return conn; })
        .catch(e => { this.pendingConnect = null; throw e; });
    }
    return this.pendingConnect;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async connect(): Promise<any> {
    const cd = new mq.MQCD();
    cd.ConnectionName = `${this.config.host}(${this.config.port})`;
    cd.ChannelName = this.config.channel;

    const cno = new mq.MQCNO();
    cno.Options = MQC.MQCNO_CLIENT_BINDING;
    cno.ClientConn = cd;

    // Set up authentication if credentials provided
    if (this.config.username) {
      const csp = new mq.MQCSP();
      csp.UserId = this.config.username;
      csp.Password = this.config.password ?? '';
      cno.SecurityParms = csp;
    }

    // Apply connection timeout via Promise.race — ibmmq has no built-in connect timeout
    const timeoutMs = this.config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
    const connectPromise = mq.ConnxPromise(this.config.queueManager, cno);
    if (timeoutMs <= 0) return connectPromise;

    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(
          `MQ connection to ${this.config.host}(${this.config.port}) timed out after ${timeoutMs}ms`
        )),
        timeoutMs
      );
    });

    return Promise.race([connectPromise, timeoutPromise]).finally(() => clearTimeout(timer!));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async disconnect(conn: any): Promise<void> {
    try {
      await mq.DiscPromise(conn);
    } catch {
      // Ignore disconnect errors
    }
    if (conn === this.hConn) {
      this.hConn = null;
    }
  }

  // ============================================================================
  // Browse Logic
  // ============================================================================

  private async browseMessages(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn: any,
    queueName: string,
    filter: IIBTransactionFilter
  ): Promise<IIBTransaction[]> {
    const od = new mq.MQOD();
    od.ObjectName = queueName;

    const openOptions = MQC.MQOO_BROWSE | MQC.MQOO_FAIL_IF_QUIESCING;
    const hObj = await mq.OpenPromise(conn, od, openOptions);

    const transactions: IIBTransaction[] = [];
    const maxMessages = filter.maxMessages ?? DEFAULT_MAX_MESSAGES;
    const maxSize = this.config.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    let buf = Buffer.alloc(maxSize);
    let isFirst = true;

    try {
      while (transactions.length < maxMessages) {
        const md = new mq.MQMD();
        const gmo = new mq.MQGMO();
        gmo.Options = (isFirst ? MQC.MQGMO_BROWSE_FIRST : MQC.MQGMO_BROWSE_NEXT)
          | MQC.MQGMO_NO_WAIT
          | MQC.MQGMO_CONVERT
          | MQC.MQGMO_FAIL_IF_QUIESCING;
        gmo.MatchOptions = MQC.MQMO_NONE;

        isFirst = false;

        let dataLen: number;
        try {
          dataLen = await mq.GetPromise(hObj, md, gmo, buf);
        } catch (e: unknown) {
          const rc = extractReasonCode(e);
          if (rc === MQRC_NO_MSG_AVAILABLE) break;
          if (rc === MQRC_TRUNCATED_MSG_FAILED) {
            // Message larger than buffer — retry with larger buffer, then restore
            const largeBuf = Buffer.alloc(LARGE_MESSAGE_SIZE);
            try {
              // Reset browse cursor: re-browse current message with larger buffer
              gmo.Options = MQC.MQGMO_BROWSE_MSG_UNDER_CURSOR
                | MQC.MQGMO_NO_WAIT
                | MQC.MQGMO_CONVERT
                | MQC.MQGMO_FAIL_IF_QUIESCING;
              dataLen = await mq.GetPromise(hObj, md, gmo, largeBuf);
              buf = largeBuf; // Use large buffer for remainder if one msg was big
            } catch {
              // Still can't read — skip this message
              continue;
            }
            // Fall through to process the message from largeBuf
            const body = largeBuf.subarray(0, dataLen).toString('utf-8');
            if (this.matchesFilter(body, filter) && this.matchesTimeRange(md, filter)) {
              transactions.push(this.buildTransaction(queueName, body, md));
            }
            continue;
          }
          throw e;
        }

        const body = buf.subarray(0, dataLen).toString('utf-8');

        if (!this.matchesFilter(body, filter)) continue;
        if (!this.matchesTimeRange(md, filter)) continue;

        transactions.push(this.buildTransaction(queueName, body, md));
      }
    } finally {
      await mq.ClosePromise(hObj, 0);
    }

    return transactions;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private matchesFilter(body: string, filter: IIBTransactionFilter): boolean {
    // Filter by order ID — match in attribute or element value context, not substring
    if (filter.orderId) {
      const id = filter.orderId;
      // Match: OrderNo="APT93030618" or >APT93030618< or "APT93030618"
      if (!body.includes(`"${id}"`) && !body.includes(`>${id}<`)) {
        return false;
      }
    }

    // Time range filtering is done by matchesTimeRange in browseMessages
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private matchesTimeRange(md: any, filter: IIBTransactionFilter): boolean {
    if (!filter.timeRangeMinutes) return true;
    const msgDate = this.parseMqTimestamp(md.PutDate, md.PutTime);
    if (!msgDate || isNaN(msgDate.getTime())) return true; // Can't determine timestamp — include the message
    const cutoff = new Date(Date.now() - filter.timeRangeMinutes * 60 * 1000);
    return msgDate >= cutoff;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildTransaction(queueName: string, body: string, md: any): IIBTransaction {
    return {
      flowName: '',  // Caller sets this
      queueName,
      timestamp: this.formatMqTimestamp(md.PutDate, md.PutTime),
      payload: body,
      direction: 'output',  // Caller can override
      correlationId: md.CorrelId ? Buffer.from(md.CorrelId).toString('hex') : undefined,
      messageId: md.MsgId ? Buffer.from(md.MsgId).toString('hex') : undefined,
    };
  }

  private getQueuesForMapping(
    mapping: FlowQueueMapping
  ): Array<[string, 'input' | 'output']> {
    const queues: Array<[string, 'input' | 'output']> = [];
    if (mapping.inputQueue) queues.push([mapping.inputQueue, 'input']);
    if (mapping.outputQueue) queues.push([mapping.outputQueue, 'output']);
    return queues;
  }

  private parseMqTimestamp(putDate: string, putTime: string): Date | null {
    // MQMD PutDate format: YYYYMMDD, PutTime format: HHMMSSTH
    if (!putDate || putDate.length < 8) return null;
    try {
      const year = putDate.substring(0, 4);
      const month = putDate.substring(4, 6);
      const day = putDate.substring(6, 8);
      const hour = putTime?.substring(0, 2) ?? '00';
      const min = putTime?.substring(2, 4) ?? '00';
      const sec = putTime?.substring(4, 6) ?? '00';
      return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    } catch {
      return null;
    }
  }

  private formatMqTimestamp(putDate: string, putTime: string): string {
    const date = this.parseMqTimestamp(putDate, putTime);
    return date ? date.toISOString() : `${putDate ?? ''}T${putTime ?? ''}`;
  }
}

function extractReasonCode(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'mqrc' in e) {
    return (e as { mqrc: number }).mqrc;
  }
  return undefined;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an MQ browse provider.
 * Requires ibmmq optional dependency and MQ connection credentials.
 *
 * @param config - MQ connection config (host, port, channel, queue manager)
 * @param mappings - Flow-to-queue name mappings (client-specific)
 */
export function createMQBrowseProvider(
  config: MQBrowseConfig,
  mappings: FlowQueueMapping[]
): IIBPayloadProvider {
  return new MQBrowseProvider(config, mappings);
}
