# Phase 3 Implementation Guide

**Version:** 1.0.0
**Date:** 2025-10-20
**Related:** phase3-architecture.md, phase3-diagrams.md

---

## Quick Start

This guide provides step-by-step instructions for implementing Phase 3 features: QUIC transport and Neural training.

---

## Prerequisites

### Required Dependencies

```json
{
  "dependencies": {
    "@fails-components/webtransport": "^0.1.4",
    "@tensorflow/tfjs-node": "^4.11.0",
    "@tensorflow/tfjs": "^4.11.0",
    "better-sqlite3": "^9.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "typescript": "^5.2.0"
  }
}
```

### System Requirements

- Node.js 18+ (for native QUIC support)
- 2GB+ RAM (for neural training)
- Linux/macOS (Windows support via WSL)

---

## Phase 3.1: QUIC Transport Implementation

### Step 1: Install QUIC Dependencies

```bash
npm install @fails-components/webtransport uuid
```

### Step 2: Create QUICTransportManager

**File:** `/workspaces/agentic-qe-cf/src/transport/QUICTransportManager.ts`

```typescript
import { QuicServer, QuicConnection, QuicStream } from '@fails-components/webtransport';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { AgentMessage, MessageType } from '../types';

export interface QUICConfig {
  port: number;
  cert: string;
  key: string;
  maxConnections?: number;
  connectionTimeout?: number;
  autoFallback?: boolean;
}

export class QUICTransportManager extends EventEmitter {
  private server?: QuicServer;
  private connections: Map<string, QuicConnection>;
  private memoryManager: SwarmMemoryManager;
  private config: QUICConfig;
  private peerRegistry: Map<string, PeerInfo>;

  constructor(config: QUICConfig, memoryManager: SwarmMemoryManager) {
    super();
    this.config = {
      maxConnections: 100,
      connectionTimeout: 30000,
      autoFallback: true,
      ...config
    };
    this.connections = new Map();
    this.peerRegistry = new Map();
    this.memoryManager = memoryManager;
  }

  /**
   * Initialize QUIC server
   */
  async initialize(): Promise<void> {
    try {
      // Load TLS certificates
      const cert = await fs.readFile(this.config.cert);
      const key = await fs.readFile(this.config.key);

      // Create QUIC server
      this.server = new QuicServer({
        port: this.config.port,
        cert,
        key,
        maxConnections: this.config.maxConnections
      });

      // Handle incoming connections
      this.server.on('connection', this.handleConnection.bind(this));

      // Start server
      await this.server.listen();

      console.info(`[QUIC] Server listening on port ${this.config.port}`);

      // Start peer discovery
      await this.discoverPeers();

    } catch (error) {
      console.error('[QUIC] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Connect to peer agent
   */
  async connectToPeer(agentId: string): Promise<QuicConnection> {
    // Check if already connected
    if (this.connections.has(agentId)) {
      return this.connections.get(agentId)!;
    }

    // Get peer info from registry
    const peerInfo = await this.getPeerInfo(agentId);
    if (!peerInfo) {
      throw new Error(`Peer not found: ${agentId}`);
    }

    try {
      // Establish QUIC connection
      const connection = await this.createConnection(peerInfo.address);

      // Cache connection
      this.connections.set(agentId, connection);

      console.info(`[QUIC] Connected to peer ${agentId} at ${peerInfo.address}`);

      return connection;

    } catch (error) {
      console.error(`[QUIC] Connection failed to ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Send message to peer
   */
  async sendMessage(agentId: string, message: AgentMessage): Promise<void> {
    try {
      const connection = await this.connectToPeer(agentId);

      // Open new stream
      const stream = await connection.createUnidirectionalStream();

      // Serialize message
      const data = JSON.stringify(message);

      // Send data
      await stream.write(Buffer.from(data));
      await stream.end();

      console.debug(`[QUIC] Sent message to ${agentId}: ${message.type}`);

    } catch (error) {
      console.error(`[QUIC] Send failed to ${agentId}:`, error);

      // Fallback to EventBus if autoFallback enabled
      if (this.config.autoFallback) {
        this.emit('fallback', { agentId, message });
      } else {
        throw error;
      }
    }
  }

  /**
   * Subscribe to messages
   */
  async subscribe(
    messageType: MessageType,
    handler: (message: AgentMessage) => void
  ): Promise<void> {
    this.on(`message:${messageType}`, handler);
  }

  /**
   * Handle incoming connection
   */
  private async handleConnection(connection: QuicConnection): Promise<void> {
    console.info('[QUIC] Incoming connection from:', connection.remoteAddress);

    // Handle incoming streams
    connection.on('stream', async (stream: QuicStream) => {
      try {
        // Read stream data
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));

        await new Promise((resolve) => stream.on('end', resolve));

        // Parse message
        const data = Buffer.concat(chunks).toString();
        const message = JSON.parse(data) as AgentMessage;

        // Emit message event
        this.emit(`message:${message.type}`, message);

      } catch (error) {
        console.error('[QUIC] Stream error:', error);
      }
    });
  }

  /**
   * Discover peers from agent_registry
   */
  private async discoverPeers(): Promise<void> {
    const agents = await this.memoryManager.queryAgentsByStatus('active');

    for (const agent of agents) {
      const perf = agent.performance as any;
      if (perf?.quicEnabled && perf?.quicAddress) {
        this.peerRegistry.set(agent.id, {
          agentId: agent.id,
          address: perf.quicAddress,
          lastSeen: Date.now()
        });
      }
    }

    console.info(`[QUIC] Discovered ${this.peerRegistry.size} peers`);
  }

  /**
   * Get peer info from registry
   */
  private async getPeerInfo(agentId: string): Promise<PeerInfo | null> {
    // Check cache first
    if (this.peerRegistry.has(agentId)) {
      return this.peerRegistry.get(agentId)!;
    }

    // Query from database
    const agent = await this.memoryManager.getAgent(agentId);
    if (!agent) return null;

    const perf = agent.performance as any;
    if (!perf?.quicEnabled || !perf?.quicAddress) {
      return null;
    }

    const peerInfo: PeerInfo = {
      agentId: agent.id,
      address: perf.quicAddress,
      lastSeen: Date.now()
    };

    this.peerRegistry.set(agentId, peerInfo);
    return peerInfo;
  }

  /**
   * Create QUIC connection
   */
  private async createConnection(address: string): Promise<QuicConnection> {
    // Parse address (format: "host:port")
    const [host, port] = address.split(':');

    // Create connection
    const connection = await QuicConnection.connect({
      host,
      port: parseInt(port),
      cert: await fs.readFile(this.config.cert),
      alpn: ['aqe-fleet']
    });

    return connection;
  }

  /**
   * Shutdown server
   */
  async shutdown(): Promise<void> {
    // Close all connections
    for (const [agentId, connection] of this.connections.entries()) {
      await connection.close();
      this.connections.delete(agentId);
    }

    // Close server
    if (this.server) {
      await this.server.close();
      this.server = undefined;
    }

    console.info('[QUIC] Server shutdown complete');
  }
}

interface PeerInfo {
  agentId: string;
  address: string;
  lastSeen: number;
}
```

### Step 3: Add QUIC Support to BaseAgent

**File:** `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts`

Add QUIC-related code to existing BaseAgent:

```typescript
// Add to BaseAgentConfig
export interface BaseAgentConfig {
  // ... existing fields ...
  enableQuic?: boolean;
  quicConfig?: QUICConfig;
}

// Add to BaseAgent class
export abstract class BaseAgent extends EventEmitter {
  // ... existing fields ...
  protected quicManager?: QUICTransportManager;
  protected readonly enableQuic: boolean;

  constructor(config: BaseAgentConfig) {
    super();
    // ... existing initialization ...
    this.enableQuic = config.enableQuic ?? false;
  }

  public async initialize(): Promise<void> {
    // ... existing initialization ...

    // Initialize QUIC if enabled
    if (this.enableQuic && this.memoryStore instanceof SwarmMemoryManager) {
      this.quicManager = new QUICTransportManager(
        this.config.quicConfig || { port: 4433, cert: './certs/agent.crt', key: './certs/agent.key' },
        this.memoryStore
      );

      await this.quicManager.initialize();

      // Handle fallback events
      this.quicManager.on('fallback', ({ agentId, message }) => {
        console.warn(`[QUIC] Fallback to EventBus for ${agentId}`);
        this.eventBus.emit('agent.message', message);
      });

      console.info(`[QUIC] Transport enabled for ${this.agentId.id}`);
    }

    // ... rest of initialization ...
  }

  /**
   * Send message with QUIC support
   */
  protected async sendMessageToAgent(
    targetAgentId: string,
    message: AgentMessage
  ): Promise<void> {
    if (this.quicManager) {
      try {
        await this.quicManager.sendMessage(targetAgentId, message);
        return;
      } catch (error) {
        console.warn(`[QUIC] Send failed, falling back to EventBus:`, error);
      }
    }

    // Fallback to EventBus
    this.eventBus.emit('agent.message', message);
  }

  /**
   * Subscribe with QUIC support
   */
  protected async subscribeToMessages(
    messageType: MessageType,
    handler: (message: AgentMessage) => void
  ): Promise<void> {
    if (this.quicManager) {
      await this.quicManager.subscribe(messageType, handler);
    }

    // Also subscribe via EventBus for compatibility
    this.registerEventHandler({
      eventType: 'agent.message',
      handler: async (event: QEEvent) => {
        const msg = event.data as AgentMessage;
        if (msg.type === messageType) {
          handler(msg);
        }
      }
    });
  }
}
```

### Step 4: Testing QUIC Transport

**File:** `/workspaces/agentic-qe-cf/tests/transport/QUICTransportManager.test.ts`

```typescript
import { QUICTransportManager } from '../../src/transport/QUICTransportManager';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentMessage } from '../../src/types';

describe('QUICTransportManager', () => {
  let memoryManager: SwarmMemoryManager;
  let transport: QUICTransportManager;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager(':memory:');
    await memoryManager.initialize();

    transport = new QUICTransportManager(
      {
        port: 4433,
        cert: './test/certs/test.crt',
        key: './test/certs/test.key'
      },
      memoryManager
    );
  });

  afterEach(async () => {
    await transport.shutdown();
    await memoryManager.close();
  });

  it('should initialize QUIC server', async () => {
    await transport.initialize();
    expect(transport['server']).toBeDefined();
  });

  it('should connect to peer', async () => {
    // Register peer in agent_registry
    await memoryManager.registerAgent({
      id: 'agent-1',
      type: 'test-generator',
      capabilities: [],
      status: 'active',
      performance: {
        quicEnabled: true,
        quicAddress: '127.0.0.1:4434'
      }
    });

    await transport.initialize();
    const connection = await transport.connectToPeer('agent-1');
    expect(connection).toBeDefined();
  });

  it('should send message via QUIC', async () => {
    // Setup peer
    await memoryManager.registerAgent({
      id: 'agent-1',
      type: 'test-generator',
      capabilities: [],
      status: 'active',
      performance: {
        quicEnabled: true,
        quicAddress: '127.0.0.1:4434'
      }
    });

    await transport.initialize();

    const message: AgentMessage = {
      id: 'msg-1',
      from: { id: 'agent-0', type: 'coordinator', created: new Date() },
      to: { id: 'agent-1', type: 'test-generator', created: new Date() },
      type: 'task-assignment',
      payload: { task: 'generate tests' },
      timestamp: new Date(),
      priority: 'medium'
    };

    await expect(transport.sendMessage('agent-1', message)).resolves.not.toThrow();
  });
});
```

---

## Phase 3.2: Neural Training Implementation

### Step 1: Install TensorFlow Dependencies

```bash
npm install @tensorflow/tfjs-node @tensorflow/tfjs
```

### Step 2: Create NeuralPatternMatcher

**File:** `/workspaces/agentic-qe-cf/src/neural/NeuralPatternMatcher.ts`

```typescript
import * as tf from '@tensorflow/tfjs-node';
import { QEReasoningBank, TestPattern } from '../reasoning/QEReasoningBank';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';

export interface NeuralConfig {
  modelPath?: string;
  batchSize?: number;
  epochs?: number;
  validationSplit?: number;
  cacheSize?: number;
}

export interface NeuralPrediction {
  pattern: TestPattern;
  confidence: number;
  reasoning: string;
  modelVersion: string;
  inferenceTime: number;
}

export class NeuralPatternMatcher {
  private model?: tf.LayersModel;
  private reasoningBank: QEReasoningBank;
  private memoryManager: SwarmMemoryManager;
  private config: NeuralConfig;
  private cache: Map<string, NeuralPrediction[]>;

  constructor(
    config: NeuralConfig,
    reasoningBank: QEReasoningBank,
    memoryManager: SwarmMemoryManager
  ) {
    this.config = {
      batchSize: 32,
      epochs: 50,
      validationSplit: 0.2,
      cacheSize: 1000,
      ...config
    };
    this.reasoningBank = reasoningBank;
    this.memoryManager = memoryManager;
    this.cache = new Map();
  }

  /**
   * Initialize neural model
   */
  async initialize(modelPath?: string): Promise<void> {
    if (modelPath) {
      // Load pre-trained model
      this.model = await tf.loadLayersModel(`file://${modelPath}`);
      console.info('[Neural] Loaded model from:', modelPath);
    } else {
      // Create new model
      this.model = this.createModel();
      console.info('[Neural] Created new model');
    }
  }

  /**
   * Train model on patterns
   */
  async train(patterns: TestPattern[]): Promise<TrainingMetrics> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    // Extract features and labels
    const { features, labels } = await this.prepareTrainingData(patterns);

    // Split train/validation
    const splitIndex = Math.floor(patterns.length * (1 - this.config.validationSplit!));
    const trainFeatures = features.slice(0, splitIndex);
    const trainLabels = labels.slice(0, splitIndex);
    const valFeatures = features.slice(splitIndex);
    const valLabels = labels.slice(splitIndex);

    // Convert to tensors
    const xTrain = tf.tensor2d(trainFeatures);
    const yTrain = tf.tensor2d(trainLabels);
    const xVal = tf.tensor2d(valFeatures);
    const yVal = tf.tensor2d(valLabels);

    // Train model
    const history = await this.model.fit(xTrain, yTrain, {
      epochs: this.config.epochs!,
      batchSize: this.config.batchSize!,
      validationData: [xVal, yVal],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.info(`[Neural] Epoch ${epoch + 1}: loss=${logs?.loss.toFixed(4)}, accuracy=${logs?.acc.toFixed(4)}`);
        }
      }
    });

    // Clean up tensors
    xTrain.dispose();
    yTrain.dispose();
    xVal.dispose();
    yVal.dispose();

    return {
      finalLoss: history.history.loss[history.history.loss.length - 1] as number,
      finalAccuracy: history.history.acc[history.history.acc.length - 1] as number,
      valLoss: history.history.val_loss[history.history.val_loss.length - 1] as number,
      valAccuracy: history.history.val_acc[history.history.val_acc.length - 1] as number
    };
  }

  /**
   * Predict patterns for context
   */
  async predict(
    context: {
      codeType: string;
      framework?: string;
      language?: string;
      keywords?: string[];
      codeSnippet?: string;
    },
    topK: number = 5
  ): Promise<NeuralPrediction[]> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    // Check cache
    const cacheKey = JSON.stringify(context);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const startTime = Date.now();

    // Extract features
    const features = await this.extractFeatures(context);
    const input = tf.tensor2d([features]);

    // Run inference
    const output = this.model.predict(input) as tf.Tensor;
    const predictions = await output.data();

    // Get top-K patterns
    const patternIds = Array.from(this.reasoningBank['patterns'].keys());
    const topIndices = this.getTopKIndices(Array.from(predictions), topK);

    const results: NeuralPrediction[] = [];
    for (const idx of topIndices) {
      const patternId = patternIds[idx];
      const pattern = await this.reasoningBank.getPattern(patternId);

      if (pattern) {
        results.push({
          pattern,
          confidence: predictions[idx],
          reasoning: `Neural model prediction with ${(predictions[idx] * 100).toFixed(1)}% confidence`,
          modelVersion: '1.0.0',
          inferenceTime: Date.now() - startTime
        });
      }
    }

    // Cache result
    this.cache.set(cacheKey, results);
    if (this.cache.size > this.config.cacheSize!) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    // Clean up tensors
    input.dispose();
    output.dispose();

    return results;
  }

  /**
   * Create neural network model
   */
  private createModel(): tf.LayersModel {
    const model = tf.sequential();

    // Input layer + first hidden layer
    model.add(tf.layers.dense({
      inputShape: [512],
      units: 256,
      activation: 'relu'
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Second hidden layer
    model.add(tf.layers.dense({
      units: 128,
      activation: 'relu'
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Third hidden layer
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu'
    }));
    model.add(tf.layers.dropout({ rate: 0.1 }));

    // Output layer
    model.add(tf.layers.dense({
      units: 100, // Max pattern classes
      activation: 'softmax'
    }));

    // Compile model
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  /**
   * Prepare training data
   */
  private async prepareTrainingData(
    patterns: TestPattern[]
  ): Promise<{ features: number[][]; labels: number[][] }> {
    const features: number[][] = [];
    const labels: number[][] = [];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];

      // Extract features (512-dim vector)
      const featureVec = await this.extractFeatures({
        codeType: pattern.category,
        framework: pattern.framework,
        language: pattern.language,
        keywords: pattern.metadata.tags
      });

      features.push(featureVec);

      // One-hot encode label
      const label = new Array(patterns.length).fill(0);
      label[i] = 1;
      labels.push(label);
    }

    return { features, labels };
  }

  /**
   * Extract features from context
   */
  private async extractFeatures(context: any): Promise<number[]> {
    // Simplified feature extraction (in production, use BERT embeddings)
    const features = new Array(512).fill(0);

    // Framework encoding (first 64 dims)
    if (context.framework === 'jest') features[0] = 1;
    if (context.framework === 'mocha') features[1] = 1;

    // Language encoding (next 64 dims)
    if (context.language === 'typescript') features[64] = 1;
    if (context.language === 'javascript') features[65] = 1;

    // Keywords encoding (next 128 dims)
    if (context.keywords) {
      context.keywords.forEach((kw: string, i: number) => {
        if (i < 128) features[128 + i] = 1;
      });
    }

    return features;
  }

  /**
   * Get top-K indices
   */
  private getTopKIndices(arr: number[], k: number): number[] {
    return arr
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => b.val - a.val)
      .slice(0, k)
      .map(item => item.idx);
  }

  /**
   * Save model
   */
  async saveModel(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    await this.model.save(`file://${path}`);
    console.info('[Neural] Model saved to:', path);
  }
}

interface TrainingMetrics {
  finalLoss: number;
  finalAccuracy: number;
  valLoss: number;
  valAccuracy: number;
}
```

### Step 3: Add Neural Support to BaseAgent

Add to existing BaseAgent:

```typescript
// Add to BaseAgentConfig
export interface BaseAgentConfig {
  // ... existing fields ...
  enableNeural?: boolean;
  neuralConfig?: NeuralConfig;
}

// Add to BaseAgent class
protected neuralMatcher?: NeuralPatternMatcher;
protected readonly enableNeural: boolean;

constructor(config: BaseAgentConfig) {
  super();
  // ... existing initialization ...
  this.enableNeural = config.enableNeural ?? false;
}

public async initialize(): Promise<void> {
  // ... existing initialization ...

  // Initialize neural matcher if enabled
  if (this.enableNeural && this.memoryStore instanceof SwarmMemoryManager) {
    const reasoningBank = new QEReasoningBank();
    this.neuralMatcher = new NeuralPatternMatcher(
      this.config.neuralConfig || {},
      reasoningBank,
      this.memoryStore
    );
    await this.neuralMatcher.initialize(this.config.neuralConfig?.modelPath);
    console.info(`[Neural] Pattern matcher enabled for ${this.agentId.id}`);
  }

  // ... rest of initialization ...
}

/**
 * Get pattern recommendation with neural support
 */
protected async getPatternRecommendation(
  context: {
    codeType: string;
    framework?: string;
    language?: string;
    keywords?: string[];
    codeSnippet?: string;
  }
): Promise<PatternMatch[]> {
  // Try neural prediction first
  if (this.neuralMatcher) {
    try {
      const predictions = await this.neuralMatcher.predict(context, 5);
      return predictions.map(pred => ({
        pattern: pred.pattern,
        confidence: pred.confidence,
        reasoning: pred.reasoning,
        applicability: pred.confidence * pred.pattern.successRate
      }));
    } catch (error) {
      console.warn('[Neural] Prediction failed, falling back to rule-based:', error);
    }
  }

  // Fallback to QEReasoningBank
  const reasoningBank = new QEReasoningBank();
  return await reasoningBank.findMatchingPatterns(context, 5);
}
```

---

## Configuration Examples

### Complete Configuration

**File:** `.agentic-qe/config/fleet.json`

```json
{
  "features": {
    "quicTransport": true,
    "neuralTraining": true
  },
  "quic": {
    "enabled": true,
    "port": 4433,
    "cert": "./certs/agent.crt",
    "key": "./certs/agent.key",
    "maxConnections": 100,
    "connectionTimeout": 30000,
    "autoFallback": true,
    "peerDiscovery": {
      "enabled": true,
      "interval": 60000
    }
  },
  "neural": {
    "enabled": true,
    "modelPath": "./models/test-pattern-v1.0.0",
    "trainingInterval": 86400000,
    "minPatterns": 50,
    "batchSize": 32,
    "epochs": 50,
    "validationSplit": 0.2,
    "cacheSize": 1000,
    "warmCache": true
  }
}
```

### Agent-Specific Configuration

```typescript
const testGeneratorAgent = new TestGeneratorAgent({
  memoryStore: new SwarmMemoryManager('./fleet.db'),
  eventBus: new EventEmitter(),
  capabilities: [/* ... */],
  context: { projectName: 'my-app' },

  // Phase 3 features
  enableQuic: true,
  quicConfig: {
    port: 4433,
    cert: './certs/agent.crt',
    key: './certs/agent.key'
  },
  enableNeural: true,
  neuralConfig: {
    modelPath: './models/test-pattern-v1.0.0'
  }
});
```

---

## Testing Guidelines

### QUIC Testing

```bash
# Run QUIC transport tests
npm test -- tests/transport/QUICTransportManager.test.ts

# Benchmark QUIC latency
npm run benchmark:quic
```

### Neural Testing

```bash
# Run neural pattern matcher tests
npm test -- tests/neural/NeuralPatternMatcher.test.ts

# Train model
npm run neural:train

# Validate model accuracy
npm run neural:validate
```

---

## Troubleshooting

### QUIC Connection Fails

**Problem:** `QUIC connection timeout`

**Solution:**
1. Check firewall rules: `sudo ufw allow 4433/udp`
2. Verify certificates: `openssl x509 -in ./certs/agent.crt -text`
3. Check peer discovery: Agent must be in `agent_registry` with `quicEnabled: true`

### Neural Training Fails

**Problem:** `Insufficient patterns for training`

**Solution:**
1. Ensure QEReasoningBank has 50+ patterns
2. Run pattern generation: `npm run patterns:generate`
3. Check pattern quality: `npm run patterns:validate`

### Memory Issues

**Problem:** `JavaScript heap out of memory`

**Solution:**
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

---

## Next Steps

1. **Review architecture:** Read [phase3-architecture.md](./phase3-architecture.md)
2. **Study diagrams:** Review [phase3-diagrams.md](./phase3-diagrams.md)
3. **Implement QUIC:** Follow Phase 3.1 steps above
4. **Implement Neural:** Follow Phase 3.2 steps above
5. **Run tests:** Validate both features work correctly
6. **Deploy:** Roll out to production with feature flags

---

## Additional Resources

- [QUIC RFC 9000](https://datatracker.ietf.org/doc/html/rfc9000)
- [TensorFlow.js Guide](https://www.tensorflow.org/js/guide)
- [Node.js QUIC Documentation](https://nodejs.org/api/quic.html)
- [Transfer Learning Tutorial](https://www.tensorflow.org/tutorials/images/transfer_learning)
