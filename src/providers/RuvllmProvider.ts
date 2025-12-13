/**
 * RuvllmProvider - Local LLM Inference via @ruvector/ruvllm
 *
 * Provides local LLM inference with advanced features:
 * - TRM (Test-time Reasoning & Metacognition) for iterative refinement
 * - SONA (Self-Organizing Neural Architecture) for continuous learning
 * - Zero cloud costs for local inference
 * - Low latency for local operations
 * - Privacy-preserving (no data leaves the machine)
 * - Streaming support
 * - Model hot-swapping
 *
 * @module providers/RuvllmProvider
 * @version 2.0.0
 */

import { spawn, ChildProcess } from 'child_process';
import {
  ILLMProvider,
  LLMProviderConfig,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMStreamEvent,
  LLMEmbeddingOptions,
  LLMEmbeddingResponse,
  LLMTokenCountOptions,
  LLMHealthStatus,
  LLMProviderMetadata,
  LLMProviderError
} from './ILLMProvider';
import { Logger } from '../utils/Logger';
import {
  loadRuvLLM,
  type RuvLLMInstance,
  type SonaCoordinatorInstance,
  type ReasoningBankInstance,
  type LoraManagerInstance,
  type RuvLLMModule,
} from '../utils/ruvllm-loader';

// Re-export types for compatibility
type RuvLLM = RuvLLMInstance;
type SonaCoordinator = SonaCoordinatorInstance;
type ReasoningBank = ReasoningBankInstance;
type LoraManager = LoraManagerInstance;

/**
 * TRM (Test-time Reasoning & Metacognition) configuration
 */
export interface TRMConfig {
  /** Maximum refinement iterations */
  maxIterations?: number;
  /** Convergence threshold (0-1) - stop when improvement is below this */
  convergenceThreshold?: number;
  /** Quality metric to optimize for */
  qualityMetric?: 'coherence' | 'coverage' | 'diversity';
}

/**
 * SONA (Self-Organizing Neural Architecture) configuration
 */
export interface SONAConfig {
  /** LoRA rank for adapter */
  loraRank?: number;
  /** LoRA alpha scaling factor */
  loraAlpha?: number;
  /** Elastic Weight Consolidation lambda */
  ewcLambda?: number;
}

/**
 * Ruvllm-specific configuration with TRM and SONA support
 */
export interface RuvllmProviderConfig extends LLMProviderConfig {
  /** Path to ruvllm executable or 'npx' for npm usage */
  ruvllmPath?: string;
  /** Port for local server */
  port?: number;
  /** Default model name/path */
  defaultModel?: string;
  /** GPU layers to offload (-1 for all) */
  gpuLayers?: number;
  /** Context window size */
  contextSize?: number;
  /** Number of threads */
  threads?: number;
  /** Model temperature */
  defaultTemperature?: number;
  /** Enable embeddings model */
  enableEmbeddings?: boolean;
  /** Enable TRM (Test-time Reasoning & Metacognition) */
  enableTRM?: boolean;
  /** Enable SONA (Self-Organizing Neural Architecture) */
  enableSONA?: boolean;
  /** Maximum TRM iterations (default: 7) */
  maxTRMIterations?: number;
  /** TRM convergence threshold (default: 0.95) */
  convergenceThreshold?: number;
  /** SONA configuration */
  sonaConfig?: SONAConfig;
}

/**
 * TRM iteration tracking
 */
export interface TRMIteration {
  iteration: number;
  quality: number;
  improvement: number;
  reasoning?: string;
}

/**
 * TRM completion response
 */
export interface TRMCompletionResponse extends LLMCompletionResponse {
  trmIterations: number;
  finalQuality: number;
  convergenceHistory: TRMIteration[];
}

/**
 * Local model info
 */
interface LocalModelInfo {
  name: string;
  path: string;
  loaded: boolean;
  contextSize: number;
  parameters: number;
}

/**
 * Extended LLM completion options with TRM support
 */
export interface RuvllmCompletionOptions extends LLMCompletionOptions {
  /** TRM configuration for this request */
  trmConfig?: TRMConfig;
}

/**
 * RuvllmProvider - Local LLM inference implementation with TRM and SONA
 *
 * This provider enables local LLM inference using @ruvector/ruvllm, providing
 * cost-free, low-latency inference with advanced learning capabilities.
 *
 * Features:
 * - TRM for iterative quality improvement
 * - SONA for continuous learning from trajectories
 * - ReasoningBank for pattern reuse
 * - Memory search for context-aware responses
 * - LoRA adapters for task-specific optimization
 */
export class RuvllmProvider implements ILLMProvider {
  private readonly logger: Logger;
  private config: RuvllmProviderConfig;
  private isInitialized: boolean;
  private serverProcess?: ChildProcess;
  private baseUrl: string;
  private loadedModel?: LocalModelInfo;
  private requestCount: number;

  // RuvLLM components (properly typed from @ruvector/ruvllm)
  private ruvllm?: RuvLLM;
  private sonaCoordinator?: SonaCoordinator;
  private reasoningBank?: ReasoningBank;
  private loraManager?: LoraManager;

  constructor(config: RuvllmProviderConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'ruvllm',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 120000, // Longer timeout for local inference
      maxRetries: config.maxRetries ?? 2,
      ruvllmPath: config.ruvllmPath || 'npx',
      port: config.port ?? 8080,
      defaultModel: config.defaultModel || 'llama-3.2-3b-instruct',
      gpuLayers: config.gpuLayers ?? -1,
      contextSize: config.contextSize ?? 4096,
      threads: config.threads ?? 4,
      defaultTemperature: config.defaultTemperature ?? 0.7,
      enableEmbeddings: config.enableEmbeddings ?? false,
      enableTRM: config.enableTRM ?? true,
      enableSONA: config.enableSONA ?? true,
      maxTRMIterations: config.maxTRMIterations ?? 7,
      convergenceThreshold: config.convergenceThreshold ?? 0.95,
      sonaConfig: {
        loraRank: config.sonaConfig?.loraRank ?? 8,
        loraAlpha: config.sonaConfig?.loraAlpha ?? 16,
        ewcLambda: config.sonaConfig?.ewcLambda ?? 2000
      }
    };
    this.isInitialized = false;
    this.baseUrl = `http://localhost:${this.config.port}`;
    this.requestCount = 0;
  }

  /**
   * Initialize the ruvllm provider with TRM and SONA support
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('RuvllmProvider already initialized');
      return;
    }

    try {
      // Load ruvLLM via CJS (ESM build is broken)
      const ruvllmModule = loadRuvLLM();

      if (!ruvllmModule) {
        // Check if server is already running (fallback mode)
        const isRunning = await this.checkServerHealth();
        if (isRunning) {
          this.isInitialized = true;
          this.logger.info('Connected to existing ruvllm server (fallback mode, ruvLLM lib unavailable)');
          return;
        }
        throw new Error('RuvLLM library not available and no server running');
      }

      // Initialize RuvLLM core
      this.ruvllm = new ruvllmModule.RuvLLM({
        learningEnabled: this.config.enableSONA ?? true,
        embeddingDim: 768,
        ewcLambda: this.config.sonaConfig?.ewcLambda ?? 2000
      });

      // Initialize SONA components if enabled
      if (this.config.enableSONA) {
        this.sonaCoordinator = new ruvllmModule.SonaCoordinator();
        this.reasoningBank = new ruvllmModule.ReasoningBank(0.85); // 85% similarity threshold

        // Initialize LoRA manager
        this.loraManager = new ruvllmModule.LoraManager();

        this.logger.info('SONA components initialized', {
          loraRank: this.config.sonaConfig?.loraRank,
          loraAlpha: this.config.sonaConfig?.loraAlpha,
          ewcLambda: this.config.sonaConfig?.ewcLambda
        });
      }

      // Check if server is already running (fallback mode)
      const isRunning = await this.checkServerHealth();
      if (isRunning) {
        this.isInitialized = true;
        this.logger.info('Connected to existing ruvllm server (fallback mode)');
        return;
      }

      // Start ruvllm server as fallback
      await this.startServer();
      this.isInitialized = true;

      this.logger.info('RuvllmProvider initialized', {
        model: this.config.defaultModel,
        port: this.config.port,
        gpuLayers: this.config.gpuLayers,
        enableTRM: this.config.enableTRM,
        enableSONA: this.config.enableSONA,
        maxTRMIterations: this.config.maxTRMIterations
      });

    } catch (error) {
      throw new LLMProviderError(
        `Failed to initialize ruvllm: ${(error as Error).message}`,
        'ruvllm',
        'INIT_ERROR',
        false,
        error as Error
      );
    }
  }

  /**
   * Complete a prompt using ruvLLM with optional TRM refinement
   */
  async complete(options: RuvllmCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    // Use TRM if enabled and configured
    if (this.config.enableTRM && options.trmConfig) {
      const trmResponse = await this.completeTRM(options);
      return trmResponse;
    }

    return this.completeBasic(options);
  }

  /**
   * Complete with TRM (Test-time Reasoning & Metacognition)
   */
  async completeTRM(options: RuvllmCompletionOptions): Promise<TRMCompletionResponse> {
    const maxIterations = options.trmConfig?.maxIterations ?? this.config.maxTRMIterations ?? 7;
    const convergenceThreshold = options.trmConfig?.convergenceThreshold ?? this.config.convergenceThreshold ?? 0.95;
    const qualityMetric = options.trmConfig?.qualityMetric ?? 'coherence';

    const startTime = Date.now();
    const history: TRMIteration[] = [];

    // Initial completion
    let current = await this.completeBasic(options);
    let quality = this.measureQuality(current, qualityMetric);

    history.push({
      iteration: 0,
      quality,
      improvement: 0,
      reasoning: 'Initial completion'
    });

    this.logger.debug('TRM iteration 0', { quality, metric: qualityMetric });

    // Iterative refinement
    for (let i = 1; i < maxIterations; i++) {
      // Refine using previous output
      const refined = await this.refineTRM(current, options, qualityMetric);
      const newQuality = this.measureQuality(refined, qualityMetric);
      const improvement = newQuality - quality;

      history.push({
        iteration: i,
        quality: newQuality,
        improvement,
        reasoning: `Refinement iteration ${i}`
      });

      this.logger.debug(`TRM iteration ${i}`, { quality: newQuality, improvement });

      // Check convergence
      if (improvement < (1 - convergenceThreshold)) {
        this.logger.info('TRM converged', { iterations: i + 1, finalQuality: newQuality });
        break;
      }

      current = refined;
      quality = newQuality;
    }

    // Track trajectory if SONA enabled
    if (this.config.enableSONA && this.sonaCoordinator) {
      await this.trackTrajectory(
        this.extractInput(options),
        this.extractOutput(current),
        quality
      );
    }

    return {
      ...current,
      trmIterations: history.length,
      finalQuality: quality,
      convergenceHistory: history,
      metadata: {
        ...current.metadata,
        trmLatency: Date.now() - startTime,
        qualityMetric
      }
    };
  }

  /**
   * Basic completion without TRM
   */
  private async completeBasic(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    const startTime = Date.now();

    try {
      // Check if ruvLLM instance is available
      if (this.ruvllm) {
        // Use ruvLLM query API
        const input = this.extractInput(options);

        // Search memory for relevant context
        const memoryResults = this.ruvllm.searchMemory(input, 5);

        // Query with routing
        const response = this.ruvllm.query(input, {
          maxTokens: options.maxTokens || 2048,
          temperature: options.temperature ?? this.config.defaultTemperature
        });

        // Build response
        const result: LLMCompletionResponse = {
          content: [{
            type: 'text',
            text: response.text || ''
          }],
          usage: {
            input_tokens: response.contextSize || 0,
            output_tokens: this.estimateTokens(response.text || '')
          },
          model: response.model || this.config.defaultModel!,
          stop_reason: 'end_turn',
          id: response.requestId || `ruvllm-${Date.now()}`,
          metadata: {
            latency: response.latencyMs || (Date.now() - startTime),
            confidence: response.confidence,
            memoryHits: memoryResults.length,
            cost: 0
          }
        };

        // Add to memory
        this.ruvllm.addMemory(response.text, {
          input,
          timestamp: Date.now(),
          model: response.model
        });

        this.requestCount++;
        return result;
      }

      // Fallback to OpenAI-compatible API
      return this.completeViaServer(options, startTime);

    } catch (error) {
      throw new LLMProviderError(
        `Ruvllm completion failed: ${(error as Error).message}`,
        'ruvllm',
        'INFERENCE_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Complete via OpenAI-compatible server (fallback)
   */
  private async completeViaServer(
    options: LLMCompletionOptions,
    startTime: number
  ): Promise<LLMCompletionResponse> {
    const requestBody = {
      model: options.model || this.config.defaultModel,
      messages: options.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')
      })),
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? this.config.defaultTemperature,
      stream: false
    };

    // Add system message if provided
    if (options.system && options.system.length > 0) {
      const systemContent = options.system.map(s => s.text).join('\n');
      requestBody.messages = [
        { role: 'system', content: systemContent },
        ...requestBody.messages
      ];
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    this.requestCount++;

    return {
      content: [{
        type: 'text',
        text: data.choices?.[0]?.message?.content || ''
      }],
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0
      },
      model: data.model || this.config.defaultModel!,
      stop_reason: this.mapStopReason(data.choices?.[0]?.finish_reason),
      id: data.id || `ruvllm-${Date.now()}`,
      metadata: {
        latency: Date.now() - startTime,
        cost: 0
      }
    };
  }

  /**
   * Refine output using TRM
   */
  private async refineTRM(
    previous: LLMCompletionResponse,
    options: LLMCompletionOptions,
    metric: string
  ): Promise<LLMCompletionResponse> {
    const previousText = previous.content[0].text;

    // Create refinement prompt
    const refinementMessages = [
      ...options.messages,
      {
        role: 'assistant' as const,
        content: previousText
      },
      {
        role: 'user' as const,
        content: `Review and improve the above response to maximize ${metric}. Provide a refined version that addresses any weaknesses.`
      }
    ];

    return this.completeBasic({
      ...options,
      messages: refinementMessages
    });
  }

  /**
   * Measure quality of a completion
   */
  private measureQuality(response: LLMCompletionResponse, metric: string): number {
    const text = response.content[0].text;

    switch (metric) {
      case 'coherence':
        return this.measureCoherence(text);
      case 'coverage':
        return this.measureCoverage(text);
      case 'diversity':
        return this.measureDiversity(text);
      default:
        return this.measureCoherence(text);
    }
  }

  /**
   * Measure coherence (sentence flow, structure)
   */
  private measureCoherence(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    // Simple heuristics:
    // - Longer responses are more coherent
    // - More sentences indicate better structure
    // - Normalized by length to avoid bias
    const avgSentenceLength = text.length / sentences.length;
    const normalizedLength = Math.min(avgSentenceLength / 100, 1.0);
    const sentenceCount = Math.min(sentences.length / 10, 1.0);

    return (normalizedLength + sentenceCount) / 2;
  }

  /**
   * Measure coverage (breadth of content)
   */
  private measureCoverage(text: string): number {
    // Measure unique words as proxy for coverage
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);

    if (words.length === 0) return 0;
    return Math.min(uniqueWords.size / words.length, 1.0);
  }

  /**
   * Measure diversity (variety in expression)
   */
  private measureDiversity(text: string): number {
    // Measure vocabulary richness
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const uniqueWords = new Set(words);

    if (words.length === 0) return 0;

    // Type-token ratio
    return Math.min(uniqueWords.size / words.length * 2, 1.0);
  }

  /**
   * Track trajectory in SONA
   */
  private async trackTrajectory(input: string, output: string, confidence: number): Promise<void> {
    if (!this.sonaCoordinator) return;

    try {
      const ruvllmModule = loadRuvLLM();
      if (!ruvllmModule) return;

      const trajectory = new ruvllmModule.TrajectoryBuilder()
        .startStep('query', input)
        .endStep(output, confidence)
        .complete('success');

      this.sonaCoordinator.recordTrajectory(trajectory);

      // Store in reasoning bank if high confidence
      // ReasoningBank.store(type, embedding, metadata)
      if (this.reasoningBank && confidence > 0.85 && this.ruvllm) {
        const rawEmbedding = this.ruvllm.embed(input);
        // Convert Float32Array to number[] for ReasoningBank
        const embedding = Array.from(rawEmbedding);
        this.reasoningBank.store(
          'query_response' as const,
          embedding,
          {
            input,
            output,
            confidence,
            timestamp: Date.now()
          }
        );
      }

      this.logger.debug('Trajectory tracked', { confidence, hasReasoningBank: !!this.reasoningBank });

    } catch (error) {
      this.logger.warn('Failed to track trajectory', { error: (error as Error).message });
    }
  }

  /**
   * Extract input text from options
   */
  private extractInput(options: LLMCompletionOptions): string {
    const messages = options.messages.map(m =>
      typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')
    );
    return messages.join(' ');
  }

  /**
   * Extract output text from response
   */
  private extractOutput(response: LLMCompletionResponse): string {
    return response.content.map(c => c.text).join('');
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Stream a completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    try {
      const requestBody = {
        model: options.model || this.config.defaultModel,
        messages: options.messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')
        })),
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? this.config.defaultTemperature,
        stream: true
      };

      if (options.system && options.system.length > 0) {
        const systemContent = options.system.map(s => s.text).join('\n');
        requestBody.messages = [
          { role: 'system', content: systemContent },
          ...requestBody.messages
        ];
      }

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      yield { type: 'message_start' };
      yield { type: 'content_block_start', content_block: { type: 'text', text: '' } };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: content }
                };
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      yield { type: 'content_block_stop' };
      yield { type: 'message_stop' };

      this.requestCount++;

    } catch (error) {
      throw new LLMProviderError(
        `Ruvllm stream failed: ${(error as Error).message}`,
        'ruvllm',
        'STREAM_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Generate embeddings using ruvLLM
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    this.ensureInitialized();

    try {
      // Use ruvLLM embedding if available
      if (this.ruvllm) {
        const rawEmbedding = this.ruvllm.embed(options.text);
        // Convert Float32Array to number[] for consistent return type
        const embedding = Array.from(rawEmbedding);

        return {
          embedding,
          model: options.model || 'ruvllm-embedding',
          tokens: this.estimateTokens(options.text)
        };
      }

      // Fallback to server API
      if (!this.config.enableEmbeddings) {
        throw new LLMProviderError(
          'Embeddings not enabled. Set enableEmbeddings: true in config.',
          'ruvllm',
          'UNSUPPORTED',
          false
        );
      }

      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || 'embedding',
          input: options.text
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      return {
        embedding: data.data?.[0]?.embedding || [],
        model: data.model || 'embedding',
        tokens: data.usage?.total_tokens || 0
      };

    } catch (error) {
      throw new LLMProviderError(
        `Embedding generation failed: ${(error as Error).message}`,
        'ruvllm',
        'EMBEDDING_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Count tokens in text
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    return this.estimateTokens(options.text);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      // Check ruvLLM instance
      if (this.ruvllm) {
        return {
          healthy: true,
          latency: Date.now() - startTime,
          timestamp: new Date(),
          metadata: {
            model: this.config.defaultModel,
            requestCount: this.requestCount,
            sonaEnabled: !!this.sonaCoordinator,
            trmEnabled: this.config.enableTRM,
            mode: 'native'
          }
        };
      }

      // Fallback to server health check
      const isHealthy = await this.checkServerHealth();

      return {
        healthy: isHealthy,
        latency: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          model: this.config.defaultModel,
          port: this.config.port,
          requestCount: this.requestCount,
          mode: 'server'
        }
      };

    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get provider metadata
   */
  getMetadata(): LLMProviderMetadata {
    return {
      name: 'ruvllm',
      version: '2.0.0',
      models: [
        'llama-3.2-3b-instruct',
        'llama-3.2-1b-instruct',
        'llama-3.1-8b-instruct',
        'phi-3-mini',
        'mistral-7b-instruct',
        'qwen2-7b-instruct'
      ],
      capabilities: {
        streaming: true,
        caching: false,
        embeddings: this.config.enableEmbeddings!,
        vision: false
      },
      costs: {
        inputPerMillion: 0,
        outputPerMillion: 0
      },
      location: 'local'
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }

    // Clean up ruvLLM resources
    this.ruvllm = undefined;
    this.sonaCoordinator = undefined;
    this.reasoningBank = undefined;
    this.loraManager = undefined;

    this.isInitialized = false;
    this.logger.info('RuvllmProvider shutdown', {
      requestCount: this.requestCount
    });
  }

  /**
   * Track cost (always 0 for local inference)
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    return 0;
  }

  /**
   * Start the ruvllm server (fallback mode)
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'ruvllm',
        'serve',
        '--model', this.config.defaultModel!,
        '--port', String(this.config.port),
        '--gpu-layers', String(this.config.gpuLayers),
        '--context-size', String(this.config.contextSize),
        '--threads', String(this.config.threads)
      ];

      if (this.config.ruvllmPath === 'npx') {
        this.serverProcess = spawn('npx', args, {
          stdio: this.config.debug ? 'inherit' : 'pipe'
        });
      } else {
        this.serverProcess = spawn(this.config.ruvllmPath!, args.slice(1), {
          stdio: this.config.debug ? 'inherit' : 'pipe'
        });
      }

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start ruvllm: ${error.message}`));
      });

      // Wait for server to be ready
      const checkInterval = setInterval(async () => {
        try {
          const isReady = await this.checkServerHealth();
          if (isReady) {
            clearInterval(checkInterval);
            resolve();
          }
        } catch {
          // Server not ready yet
        }
      }, 500);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for ruvllm server to start'));
      }, 60000);
    });
  }

  /**
   * Check if server is healthy (fallback mode)
   */
  private async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ensure provider is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'RuvllmProvider not initialized. Call initialize() first.',
        'ruvllm',
        'NOT_INITIALIZED',
        false
      );
    }
  }

  /**
   * Map finish reason to standard stop reason
   */
  private mapStopReason(reason: string): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'length':
        return 'max_tokens';
      case 'stop':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
