/**
 * AST-aware code chunker with semantic preservation
 * Splits code into 256-512 token chunks while preserving function/class boundaries
 */

import { WebTreeSitterParser } from '../parser/WebTreeSitterParser.js';
import { CodeEntity } from '../parser/types.js';
import { ChunkSplitter } from './ChunkSplitter.js';
import {
  CodeChunk,
  ChunkingResult,
  ChunkingConfig,
  TokenCounter,
  EntityType,
} from './types.js';
import { createHash } from 'crypto';

/**
 * Simple word-based token counter (approximation)
 * ~4 characters per token for code
 */
export class SimpleTokenCounter implements TokenCounter {
  count(text: string): number {
    // Approximate: 4 chars per token
    // This is a rough approximation; for production, use tiktoken
    const chars = text.length;
    const tokens = Math.ceil(chars / 4);
    return tokens;
  }
}

export class ASTChunker {
  private parser: WebTreeSitterParser;
  private tokenCounter: TokenCounter;
  private config: ChunkingConfig;
  private splitter: ChunkSplitter;

  constructor(config?: Partial<ChunkingConfig>, tokenCounter?: TokenCounter) {
    this.parser = new WebTreeSitterParser();
    this.tokenCounter = tokenCounter || new SimpleTokenCounter();

    // Default configuration
    this.config = {
      minTokens: config?.minTokens ?? 256,
      maxTokens: config?.maxTokens ?? 512,
      overlapPercent: config?.overlapPercent ?? 15,
      overlapTokens: config?.overlapTokens ?? 50,
      preserveSemanticBoundaries: config?.preserveSemanticBoundaries ?? true,
      splitLargeEntities: config?.splitLargeEntities ?? true,
    };

    // Calculate overlap tokens if not provided
    if (!config?.overlapTokens && config?.overlapPercent) {
      this.config.overlapTokens = Math.round(
        this.config.maxTokens * (this.config.overlapPercent / 100)
      );
    }

    this.splitter = new ChunkSplitter(this.config, this.tokenCounter);
  }

  /**
   * Chunk a file using AST-aware semantic boundaries
   */
  async chunkFile(filePath: string, content: string, language?: string): Promise<ChunkingResult> {
    // Parse file to extract entities
    const parseResult = await this.parser.parseFile(filePath, content, language);

    if (parseResult.errors.length > 0) {
      // Fallback to line-based chunking if parsing fails
      return this.fallbackChunking(filePath, content, language || 'unknown');
    }

    // Sort entities by line number
    const sortedEntities = parseResult.entities.sort(
      (a, b) => a.lineStart - b.lineStart
    );

    const chunks: CodeChunk[] = [];
    let processedLines = new Set<number>();

    // Process each entity
    for (const entity of sortedEntities) {
      // Skip if already processed (e.g., method inside class)
      if (processedLines.has(entity.lineStart)) {
        continue;
      }

      // Split entity into chunks
      const entityChunks = this.splitter.splitEntity(entity);
      chunks.push(...entityChunks);

      // Mark lines as processed
      for (let i = entity.lineStart; i <= entity.lineEnd; i++) {
        processedLines.add(i);
      }
    }

    // Handle lines not covered by entities (module-level code, imports, etc.)
    const uncoveredChunks = this.processUncoveredLines(
      filePath,
      content,
      language || 'unknown',
      processedLines
    );
    chunks.push(...uncoveredChunks);

    // Sort chunks by line number
    chunks.sort((a, b) => a.lineStart - b.lineStart);

    // Add overlap between chunks
    const chunksWithOverlap = this.addOverlap(chunks, content);

    // Calculate statistics
    const stats = this.calculateStats(chunksWithOverlap);

    return {
      chunks: chunksWithOverlap,
      stats,
    };
  }

  /**
   * Process lines not covered by parsed entities
   */
  private processUncoveredLines(
    filePath: string,
    content: string,
    language: string,
    processedLines: Set<number>
  ): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    let currentLines: string[] = [];
    let currentLineStart = 1;

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;

      if (processedLines.has(lineNumber)) {
        // Flush current chunk if any
        if (currentLines.length > 0) {
          const chunkContent = currentLines.join('\n').trim();
          if (chunkContent.length > 0) {
            chunks.push(
              this.createModuleChunk(
                filePath,
                currentLines,
                currentLineStart,
                language
              )
            );
          }
          currentLines = [];
        }
        continue;
      }

      currentLines.push(lines[i]);

      // Check if we should create a chunk
      const currentContent = currentLines.join('\n');
      const tokenCount = this.tokenCounter.count(currentContent);

      if (tokenCount >= this.config.maxTokens) {
        chunks.push(
          this.createModuleChunk(filePath, currentLines, currentLineStart, language)
        );
        currentLines = [];
        currentLineStart = i + 2;
      } else if (currentLines.length === 1) {
        currentLineStart = lineNumber;
      }
    }

    // Flush remaining lines
    if (currentLines.length > 0) {
      const chunkContent = currentLines.join('\n').trim();
      if (chunkContent.length > 0) {
        chunks.push(
          this.createModuleChunk(filePath, currentLines, currentLineStart, language)
        );
      }
    }

    return chunks;
  }

  /**
   * Create a module-level chunk (imports, constants, etc.)
   */
  private createModuleChunk(
    filePath: string,
    lines: string[],
    lineStart: number,
    language: string
  ): CodeChunk {
    const content = lines.join('\n');
    const tokenCount = this.tokenCounter.count(content);
    const lineEnd = lineStart + lines.length - 1;

    return {
      id: this.generateChunkId(filePath, lineStart),
      content,
      filePath,
      language,
      lineStart,
      lineEnd,
      tokenCount,
      entityType: 'module',
      metadata: {
        filePath,
        language,
        lineStart,
        lineEnd,
        entityType: 'module',
        isComplete: true,
      },
    };
  }

  /**
   * Add overlap between consecutive chunks
   */
  private addOverlap(chunks: CodeChunk[], fileContent: string): CodeChunk[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const overlapTokens = this.config.overlapTokens || 50;
    const chunksWithOverlap: CodeChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let content = chunk.content;
      let originalTokenCount = chunk.tokenCount;

      // Add overlap from previous chunk
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapContent = this.extractOverlap(
          prevChunk.content,
          overlapTokens,
          'end'
        );

        if (overlapContent && overlapContent.trim()) {
          content = overlapContent + '\n' + content;
          chunk.metadata.hasOverlapStart = true;
          chunk.metadata.overlapTokens = this.tokenCounter.count(overlapContent);
        }
      }

      // Add overlap to next chunk (will be prepended when processing next chunk)
      // This is already handled in the previous chunk's loop

      chunksWithOverlap.push({
        ...chunk,
        content,
        tokenCount: this.tokenCounter.count(content),
        metadata: {
          ...chunk.metadata,
          originalTokenCount,
        },
      });
    }

    return chunksWithOverlap;
  }

  /**
   * Extract overlap content from chunk
   */
  private extractOverlap(
    content: string,
    targetTokens: number,
    position: 'start' | 'end'
  ): string | null {
    const lines = content.split('\n');

    if (position === 'end') {
      // Extract from end
      let overlapLines: string[] = [];
      let tokens = 0;

      for (let i = lines.length - 1; i >= 0; i--) {
        overlapLines.unshift(lines[i]);
        const overlapContent = overlapLines.join('\n');
        tokens = this.tokenCounter.count(overlapContent);

        if (tokens >= targetTokens) {
          break;
        }
      }

      return overlapLines.length > 0 ? overlapLines.join('\n') : null;
    } else {
      // Extract from start
      let overlapLines: string[] = [];
      let tokens = 0;

      for (let i = 0; i < lines.length; i++) {
        overlapLines.push(lines[i]);
        const overlapContent = overlapLines.join('\n');
        tokens = this.tokenCounter.count(overlapContent);

        if (tokens >= targetTokens) {
          break;
        }
      }

      return overlapLines.length > 0 ? overlapLines.join('\n') : null;
    }
  }

  /**
   * Fallback to line-based chunking if AST parsing fails
   */
  private fallbackChunking(
    filePath: string,
    content: string,
    language: string
  ): ChunkingResult {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    let currentLines: string[] = [];
    let currentLineStart = 1;

    for (let i = 0; i < lines.length; i++) {
      currentLines.push(lines[i]);
      const currentContent = currentLines.join('\n');
      const tokenCount = this.tokenCounter.count(currentContent);

      if (tokenCount >= this.config.maxTokens) {
        chunks.push(
          this.createFragmentChunk(
            filePath,
            currentLines,
            currentLineStart,
            language
          )
        );
        currentLines = [];
        currentLineStart = i + 2;
      } else if (currentLines.length === 1) {
        currentLineStart = i + 1;
      }
    }

    // Flush remaining lines
    if (currentLines.length > 0) {
      chunks.push(
        this.createFragmentChunk(filePath, currentLines, currentLineStart, language)
      );
    }

    const stats = this.calculateStats(chunks);

    return {
      chunks,
      stats,
    };
  }

  /**
   * Create a fragment chunk (fallback)
   */
  private createFragmentChunk(
    filePath: string,
    lines: string[],
    lineStart: number,
    language: string
  ): CodeChunk {
    const content = lines.join('\n');
    const tokenCount = this.tokenCounter.count(content);
    const lineEnd = lineStart + lines.length - 1;

    return {
      id: this.generateChunkId(filePath, lineStart),
      content,
      filePath,
      language,
      lineStart,
      lineEnd,
      tokenCount,
      entityType: 'fragment',
      metadata: {
        filePath,
        language,
        lineStart,
        lineEnd,
        entityType: 'fragment',
        isComplete: false,
        isFallback: true,
      },
    };
  }

  /**
   * Calculate chunking statistics
   */
  private calculateStats(chunks: CodeChunk[]): ChunkingResult['stats'] {
    const totalChunks = chunks.length;

    if (totalChunks === 0) {
      return {
        totalChunks: 0,
        avgTokens: 0,
        minTokens: 0,
        maxTokens: 0,
        semanticPreservation: 0,
        totalTokens: 0,
      };
    }

    // Use original token count if available (before overlap)
    const tokenCounts = chunks.map((c) =>
      (c.metadata.originalTokenCount as number) || c.tokenCount
    );
    const totalTokens = tokenCounts.reduce((sum, t) => sum + t, 0);
    const avgTokens = totalTokens / totalChunks;
    const minTokens = Math.min(...tokenCounts);
    const maxTokens = Math.max(...tokenCounts);

    // Calculate semantic preservation (% of chunks with complete semantic units)
    const completeChunks = chunks.filter(
      (c) => c.metadata.isComplete === true
    ).length;
    const semanticPreservation = (completeChunks / totalChunks) * 100;

    return {
      totalChunks,
      avgTokens: Math.round(avgTokens),
      minTokens,
      maxTokens,
      semanticPreservation: Math.round(semanticPreservation * 100) / 100,
      totalTokens,
    };
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(filePath: string, lineStart: number): string {
    const content = `${filePath}:${lineStart}:${Date.now()}`;
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get configuration
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ChunkingConfig>): void {
    this.config = { ...this.config, ...config };

    // Recalculate overlap tokens if needed
    if (config.overlapPercent && !config.overlapTokens) {
      this.config.overlapTokens = Math.round(
        this.config.maxTokens * (this.config.overlapPercent / 100)
      );
    }

    // Update splitter config
    this.splitter = new ChunkSplitter(this.config, this.tokenCounter);
  }
}
