/**
 * Message Broker — Dual-mode: In-memory or RabbitMQ
 * Port: 3008
 *
 * Modes (set via BROKER_MODE env var):
 *   memory   — In-memory pub/sub with DLQ (default, zero dependencies)
 *   rabbitmq — Real RabbitMQ via AMQP (requires amqplib + running RabbitMQ)
 *
 * Usage:
 *   # In-memory (default)
 *   npx tsx services/message-broker.ts
 *
 *   # RabbitMQ
 *   BROKER_MODE=rabbitmq npx tsx services/message-broker.ts
 *   BROKER_MODE=rabbitmq RABBITMQ_URL=amqp://localhost:5672 npx tsx services/message-broker.ts
 *
 * Docker:
 *   docker compose up -d                          # in-memory (default)
 *   docker compose --profile rabbitmq up -d       # with RabbitMQ
 *
 * Enterprise message broker patterns:
 * - Topic-based publish/subscribe
 * - Dead Letter Queue (DLQ) with poison message detection
 * - Message acknowledgment and retry
 * - Correlation ID tracking
 * - Pull and push delivery models
 */

import { BaseMockService } from './base-mock-service.js';

// ── Configuration ────────────────────────────────────────────────────────

const BROKER_MODE = process.env.BROKER_MODE || 'memory';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const EXCHANGE_NAME = 'adidas-otc';
const DLQ_EXCHANGE = 'adidas-otc-dlq';
const STANDARD_TOPICS = [
  'order.transform', 'order.allocate', 'order.create', 'order.idoc', 'order.ingest',
];

// ── Types ────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  topic: string;
  payload: unknown;
  correlationId: string;
  publishedAt: string;
  attempts: number;
  maxRetries: number;
  status: 'pending' | 'delivered' | 'failed' | 'dlq';
  headers: Record<string, string>;
}

interface Subscription {
  id: string;
  topic: string;
  endpoint: string;
  createdAt: string;
  filter?: string;
}

interface DlqEntry {
  originalMessage: Message;
  reason: string;
  movedAt: string;
  reprocessable: boolean;
}

// ── RabbitMQ Connection ──────────────────────────────────────────────────
//
// When BROKER_MODE=rabbitmq, messages are published to and consumed from
// a real RabbitMQ instance via AMQP. The HTTP API surface stays identical.
// In-memory tracking runs in parallel so /broker/stats and /broker/dlq
// always work regardless of mode.

/* eslint-disable @typescript-eslint/no-explicit-any */
let amqpConnection: any = null;
let amqpChannel: any = null;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function connectRabbitMQ(): Promise<boolean> {
  if (BROKER_MODE !== 'rabbitmq') return false;

  try {
    // Dynamic import — amqplib is only needed for rabbitmq mode
    const amqplib = await import('amqplib');

    // Retry loop: RabbitMQ may still be starting in Docker
    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        amqpConnection = await amqplib.connect(RABBITMQ_URL);
        break;
      } catch {
        if (attempt === 15) throw new Error(`Failed to connect after ${attempt} attempts`);
        console.log(`  [Broker] RabbitMQ not ready, retry ${attempt}/15...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    amqpChannel = await amqpConnection.createChannel();
    await amqpChannel.prefetch(10);

    // Declare topic exchange for order messages
    await amqpChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    // Declare DLQ exchange (fanout — all dead letters go to one place)
    await amqpChannel.assertExchange(DLQ_EXCHANGE, 'fanout', { durable: true });

    // Set up queues per standard topic with DLQ binding
    for (const topic of STANDARD_TOPICS) {
      // DLQ queue for this topic
      await amqpChannel.assertQueue(`${topic}.dlq`, { durable: true });
      await amqpChannel.bindQueue(`${topic}.dlq`, DLQ_EXCHANGE, '');

      // Main queue with dead-letter routing
      await amqpChannel.assertQueue(topic, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': DLQ_EXCHANGE,
        },
      });
      await amqpChannel.bindQueue(topic, EXCHANGE_NAME, topic);
    }

    console.log(`  [Broker] Connected to RabbitMQ at ${RABBITMQ_URL}`);
    console.log(`  [Broker]   Exchange: ${EXCHANGE_NAME} | DLQ: ${DLQ_EXCHANGE}`);
    console.log(`  [Broker]   Queues: ${STANDARD_TOPICS.join(', ')}`);

    amqpConnection.on('close', () => {
      console.log('  [Broker] RabbitMQ connection closed');
      amqpChannel = null;
      amqpConnection = null;
    });

    amqpConnection.on('error', (err: Error) => {
      console.error(`  [Broker] RabbitMQ error: ${err.message}`);
    });

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [Broker] RabbitMQ init failed: ${msg}`);
    console.log('  [Broker] Falling back to in-memory mode');
    amqpChannel = null;
    amqpConnection = null;
    return false;
  }
}

async function closeRabbitMQ(): Promise<void> {
  try {
    if (amqpChannel) await amqpChannel.close();
    if (amqpConnection) await amqpConnection.close();
  } catch { /* ignore cleanup errors */ }
}

// ── Service ──────────────────────────────────────────────────────────────

export function createMessageBrokerService(): BaseMockService {
  const service = new BaseMockService({ name: 'message-broker', port: 3008 });

  // In-memory state (always active — used for stats/DLQ HTTP endpoints)
  const topics = new Map<string, Message[]>();
  const subscriptions: Subscription[] = [];
  const dlq: DlqEntry[] = [];
  const delivered: Message[] = [];

  // Initialize standard topics
  for (const t of STANDARD_TOPICS) {
    topics.set(t, []);
  }

  // Fire-and-forget RabbitMQ connection (non-blocking)
  // Falls back to pure in-memory if RabbitMQ is unavailable
  connectRabbitMQ();

  // ── Broker mode ────────────────────────────────────────────────────────
  service.route('GET', '/broker/mode', (_req, res) => {
    service['json'](res, {
      configured: BROKER_MODE,
      active: amqpChannel ? 'rabbitmq' : 'memory',
      rabbitmqUrl: BROKER_MODE === 'rabbitmq' ? RABBITMQ_URL : null,
      exchange: amqpChannel ? EXCHANGE_NAME : null,
    });
  });

  // ── List topics ────────────────────────────────────────────────────────
  service.route('GET', '/broker/topics', (_req, res) => {
    const list = Array.from(topics.entries()).map(([name, msgs]) => ({
      name,
      total: msgs.length,
      pending: msgs.filter(m => m.status === 'pending').length,
      delivered: msgs.filter(m => m.status === 'delivered').length,
    }));
    service['json'](res, { topics: list });
  });

  // ── Publish message ────────────────────────────────────────────────────
  service.route('POST', '/broker/publish', (_req, res, body) => {
    const req = body as {
      topic: string;
      payload: unknown;
      correlationId?: string;
      headers?: Record<string, string>;
    } | null;

    if (!req?.topic || !req?.payload) {
      service['json'](res, { error: 'topic and payload required' }, 400);
      return;
    }

    if (!topics.has(req.topic)) {
      topics.set(req.topic, []);
    }

    const message: Message = {
      id: `MSG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      topic: req.topic,
      payload: req.payload,
      correlationId: req.correlationId || `COR-${Date.now().toString(36)}`,
      publishedAt: new Date().toISOString(),
      attempts: 0,
      maxRetries: 3,
      status: 'pending',
      headers: req.headers || {},
    };

    // Store in-memory (always, for stats tracking)
    topics.get(req.topic)!.push(message);
    console.log(`  [Broker] Published to ${req.topic}: ${message.id} (${amqpChannel ? 'AMQP' : 'memory'})`);

    // Publish via AMQP if connected
    if (amqpChannel) {
      try {
        amqpChannel.publish(
          EXCHANGE_NAME,
          req.topic,
          Buffer.from(JSON.stringify({
            id: message.id,
            payload: message.payload,
            correlationId: message.correlationId,
            publishedAt: message.publishedAt,
            headers: message.headers,
          })),
          {
            persistent: true,
            messageId: message.id,
            correlationId: message.correlationId,
            contentType: 'application/json',
            timestamp: Date.now(),
          },
        );
      } catch (err) {
        console.log(`  [Broker] AMQP publish error: ${err}`);
        // In-memory store already has the message — non-fatal
      }
    }

    // Auto-deliver to push subscribers (in-memory path)
    const subs = subscriptions.filter(s => s.topic === req.topic);
    for (const sub of subs) {
      deliverMessage(message, sub).catch(() => { /* handled by DLQ */ });
    }

    service['json'](res, {
      messageId: message.id,
      topic: req.topic,
      correlationId: message.correlationId,
      status: 'published',
      subscriberCount: subs.length,
      backend: amqpChannel ? 'rabbitmq' : 'memory',
    }, 201);
  });

  // ── Subscribe (push model) ─────────────────────────────────────────────
  service.route('POST', '/broker/subscribe', (_req, res, body) => {
    const req = body as { topic: string; endpoint: string; filter?: string } | null;

    if (!req?.topic || !req?.endpoint) {
      service['json'](res, { error: 'topic and endpoint required' }, 400);
      return;
    }

    const sub: Subscription = {
      id: `SUB-${Date.now().toString(36)}`,
      topic: req.topic,
      endpoint: req.endpoint,
      createdAt: new Date().toISOString(),
      filter: req.filter,
    };
    subscriptions.push(sub);
    console.log(`  [Broker] Subscribed ${sub.id} → ${req.topic} → ${req.endpoint}`);

    // If RabbitMQ is connected, also create an AMQP consumer that pushes to the endpoint
    if (amqpChannel) {
      try {
        const queueName = `push.${req.topic}.${sub.id}`;
        amqpChannel.assertQueue(queueName, {
          durable: true,
          arguments: { 'x-dead-letter-exchange': DLQ_EXCHANGE },
        }).then(() => amqpChannel.bindQueue(queueName, EXCHANGE_NAME, req.topic))
          .then(() => amqpChannel.consume(queueName, async (amqpMsg: any) => {
            if (!amqpMsg) return;
            try {
              const payload = JSON.parse(amqpMsg.content.toString());
              const response = await fetch(sub.endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Message-Id': payload.id || amqpMsg.properties.messageId,
                  'X-Correlation-Id': payload.correlationId || '',
                  'X-Topic': req.topic,
                  'X-Backend': 'rabbitmq',
                },
                body: JSON.stringify(payload.payload || payload),
              });
              if (response.ok) {
                amqpChannel?.ack(amqpMsg);
              } else {
                amqpChannel?.nack(amqpMsg, false, false); // reject, don't requeue → DLQ
              }
            } catch {
              amqpChannel?.nack(amqpMsg, false, false);
            }
          }))
          .catch((err: Error) => console.log(`  [Broker] AMQP consumer error: ${err.message}`));
      } catch { /* non-fatal */ }
    }

    service['json'](res, sub, 201);
  });

  // ── Consume (pull model) ───────────────────────────────────────────────
  service.route('POST', '/broker/consume', (_req, res, body) => {
    const req = body as { topic: string; maxMessages?: number } | null;

    if (!req?.topic) {
      service['json'](res, { error: 'topic required' }, 400);
      return;
    }

    const msgs = topics.get(req.topic);
    if (!msgs) {
      service['json'](res, { messages: [], topic: req.topic });
      return;
    }

    const max = req.maxMessages || 10;
    const pending = msgs.filter(m => m.status === 'pending').slice(0, max);

    pending.forEach(m => {
      m.status = 'delivered';
      m.attempts++;
      delivered.push(m);
    });

    service['json'](res, {
      topic: req.topic,
      messages: pending.map(m => ({
        id: m.id,
        payload: m.payload,
        correlationId: m.correlationId,
        publishedAt: m.publishedAt,
        headers: m.headers,
      })),
      count: pending.length,
    });
  });

  // ── Acknowledge / NACK ─────────────────────────────────────────────────
  service.route('POST', '/broker/ack', (_req, res, body) => {
    const req = body as { messageId: string; success: boolean; error?: string } | null;

    if (!req?.messageId) {
      service['json'](res, { error: 'messageId required' }, 400);
      return;
    }

    for (const [, msgs] of topics) {
      const msg = msgs.find(m => m.id === req.messageId);
      if (!msg) continue;

      if (req.success) {
        msg.status = 'delivered';
        console.log(`  [Broker] ACK ${msg.id}`);
      } else {
        msg.attempts++;
        if (msg.attempts >= msg.maxRetries) {
          moveToDlq(msg, req.error || 'Max retries exceeded');
        } else {
          msg.status = 'pending';
          console.log(`  [Broker] NACK ${msg.id}, retry ${msg.attempts}/${msg.maxRetries}`);
        }
      }
      service['json'](res, { messageId: msg.id, status: msg.status, attempts: msg.attempts });
      return;
    }
    service['json'](res, { error: 'Message not found' }, 404);
  });

  // ── DLQ: list ──────────────────────────────────────────────────────────
  service.route('GET', '/broker/dlq', (_req, res) => {
    service['json'](res, {
      count: dlq.length,
      poisonMessages: dlq.filter(d => !d.reprocessable).length,
      reprocessable: dlq.filter(d => d.reprocessable).length,
      entries: dlq.map(d => ({
        messageId: d.originalMessage.id,
        topic: d.originalMessage.topic,
        correlationId: d.originalMessage.correlationId,
        reason: d.reason,
        movedAt: d.movedAt,
        reprocessable: d.reprocessable,
        attempts: d.originalMessage.attempts,
      })),
    });
  });

  // ── DLQ: reprocess ─────────────────────────────────────────────────────
  service.route('POST', '/broker/dlq/reprocess', (_req, res, body) => {
    const req = body as { messageId: string } | null;

    if (!req?.messageId) {
      service['json'](res, { error: 'messageId required' }, 400);
      return;
    }

    const idx = dlq.findIndex(d => d.originalMessage.id === req.messageId);
    if (idx === -1) {
      service['json'](res, { error: 'Message not found in DLQ' }, 404);
      return;
    }

    const entry = dlq[idx];
    if (!entry.reprocessable) {
      service['json'](res, { error: 'Poison message — cannot reprocess' }, 422);
      return;
    }

    entry.originalMessage.status = 'pending';
    entry.originalMessage.attempts = 0;
    dlq.splice(idx, 1);
    console.log(`  [Broker] Reprocessing ${entry.originalMessage.id}`);
    service['json'](res, { messageId: entry.originalMessage.id, status: 'requeued' });
  });

  // ── Stats ──────────────────────────────────────────────────────────────
  service.route('GET', '/broker/stats', (_req, res) => {
    let totalMessages = 0;
    let pendingCount = 0;
    const topicStats: Record<string, { total: number; pending: number; delivered: number; dlq: number }> = {};

    for (const [name, msgs] of topics) {
      const stats = {
        total: msgs.length,
        pending: msgs.filter(m => m.status === 'pending').length,
        delivered: msgs.filter(m => m.status === 'delivered').length,
        dlq: msgs.filter(m => m.status === 'dlq').length,
      };
      topicStats[name] = stats;
      totalMessages += stats.total;
      pendingCount += stats.pending;
    }

    service['json'](res, {
      mode: amqpChannel ? 'rabbitmq' : 'memory',
      rabbitmqConnected: !!amqpChannel,
      totalMessages,
      pendingMessages: pendingCount,
      deliveredMessages: delivered.length,
      dlqSize: dlq.length,
      subscriptionCount: subscriptions.length,
      topics: topicStats,
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  function moveToDlq(msg: Message, reason: string): void {
    msg.status = 'dlq';
    const isPoisonMessage = /deserialization|schema|corrupt|parse|malformed/i.test(reason);
    dlq.push({
      originalMessage: msg,
      reason,
      movedAt: new Date().toISOString(),
      reprocessable: !isPoisonMessage,
    });
    console.log(`  [Broker] DLQ ${msg.id}: ${reason} (poison: ${isPoisonMessage})`);
  }

  async function deliverMessage(message: Message, sub: Subscription): Promise<void> {
    try {
      const response = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Message-Id': message.id,
          'X-Correlation-Id': message.correlationId,
          'X-Topic': message.topic,
        },
        body: JSON.stringify(message.payload),
      });
      if (response.ok) {
        message.status = 'delivered';
        message.attempts++;
        delivered.push(message);
        console.log(`  [Broker] Delivered ${message.id} → ${sub.endpoint}`);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      message.attempts++;
      if (message.attempts >= message.maxRetries) {
        moveToDlq(message, err instanceof Error ? err.message : String(err));
      } else {
        console.log(`  [Broker] Delivery retry ${message.attempts}: ${message.id}`);
      }
    }
  }

  return service;
}

// ── Standalone startup ───────────────────────────────────────────────────

if (process.argv[1]?.endsWith('message-broker.ts') || process.argv[1]?.endsWith('message-broker.js')) {
  const svc = createMessageBrokerService();
  svc.start();

  // Graceful shutdown — close RabbitMQ connection
  process.on('SIGINT', async () => {
    await closeRabbitMQ();
    await svc.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeRabbitMQ();
    await svc.stop();
    process.exit(0);
  });
}
