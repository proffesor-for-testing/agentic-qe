/**
 * Recursive splitter for large code entities
 * Splits entities >512 tokens while preserving semantic boundaries
 */

import { CodeEntity } from '../parser/types.js';
import { CodeChunk, ChunkingConfig, TokenCounter, EntityType } from './types.js';
import { createHash } from 'crypto';

export class ChunkSplitter {
  constructor(
    private config: ChunkingConfig,
    private tokenCounter: TokenCounter
  ) {}

  /**
   * Split a large entity into smaller chunks recursively
   */
  splitEntity(entity: CodeEntity): CodeChunk[] {
    const tokenCount = this.tokenCounter.count(entity.content);

    // If entity fits within max tokens, return as single chunk
    if (tokenCount <= this.config.maxTokens) {
      return [this.createChunk(entity, entity.content, 0, 1)];
    }

    // Entity is too large - split recursively
    if (!this.config.splitLargeEntities) {
      // Return as single chunk even if over limit
      return [this.createChunk(entity, entity.content, 0, 1)];
    }

    return this.recursiveSplit(entity);
  }

  /**
   * Recursively split entity at semantic boundaries
   */
  private recursiveSplit(entity: CodeEntity): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = entity.content.split('\n');

    // Try to split at natural boundaries
    const boundaries = this.findSemanticBoundaries(entity.content, entity.language);

    if (boundaries.length === 0) {
      // No semantic boundaries found, split by line count
      return this.splitByLines(entity, lines);
    }

    // Split at boundaries
    let currentStart = 0;
    let splitIndex = 0;

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const segmentLines = lines.slice(currentStart, boundary.lineIndex);
      const segmentContent = segmentLines.join('\n');
      const segmentTokens = this.tokenCounter.count(segmentContent);

      // If this segment is too large, recursively split it
      if (segmentTokens > this.config.maxTokens) {
        const subChunks = this.splitByLines(
          entity,
          segmentLines,
          currentStart
        );
        chunks.push(...subChunks);
      } else if (segmentTokens >= this.config.minTokens || i === boundaries.length - 1) {
        // Valid chunk size or last segment
        chunks.push(
          this.createChunkFromLines(
            entity,
            segmentLines,
            entity.lineStart + currentStart,
            splitIndex++,
            0 // Will be calculated later
          )
        );
      }

      currentStart = boundary.lineIndex;
    }

    // Handle remaining lines
    if (currentStart < lines.length) {
      const remainingLines = lines.slice(currentStart);
      const remainingContent = remainingLines.join('\n');
      const remainingTokens = this.tokenCounter.count(remainingContent);

      if (remainingTokens > this.config.maxTokens) {
        chunks.push(...this.splitByLines(entity, remainingLines, currentStart));
      } else {
        chunks.push(
          this.createChunkFromLines(
            entity,
            remainingLines,
            entity.lineStart + currentStart,
            splitIndex++,
            0
          )
        );
      }
    }

    // Update totalSplits metadata
    const totalSplits = chunks.length;
    chunks.forEach((chunk) => {
      chunk.metadata.totalSplits = totalSplits;
    });

    return chunks;
  }

  /**
   * Find semantic boundaries in code (function/class boundaries, blank lines, etc.)
   */
  private findSemanticBoundaries(
    content: string,
    language: string
  ): Array<{ lineIndex: number; type: string }> {
    const boundaries: Array<{ lineIndex: number; type: string }> = [];
    const lines = content.split('\n');

    // Language-specific patterns
    const patterns = this.getLanguagePatterns(language);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Blank line boundary
      if (line === '') {
        boundaries.push({ lineIndex: i, type: 'blank' });
        continue;
      }

      // Function/method boundary
      if (patterns.functionStart.some((p) => line.match(p))) {
        boundaries.push({ lineIndex: i, type: 'function' });
        continue;
      }

      // Class boundary
      if (patterns.classStart.some((p) => line.match(p))) {
        boundaries.push({ lineIndex: i, type: 'class' });
        continue;
      }

      // Block end boundary (closing braces)
      if (patterns.blockEnd.some((p) => line.match(p))) {
        boundaries.push({ lineIndex: i + 1, type: 'block-end' });
      }
    }

    return boundaries;
  }

  /**
   * Get language-specific regex patterns for boundary detection
   */
  private getLanguagePatterns(language: string): {
    functionStart: RegExp[];
    classStart: RegExp[];
    blockEnd: RegExp[];
  } {
    const patterns: Record<
      string,
      { functionStart: RegExp[]; classStart: RegExp[]; blockEnd: RegExp[] }
    > = {
      typescript: {
        functionStart: [
          /^(export\s+)?(async\s+)?function\s+/,
          /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
          /^(private|public|protected)\s+(async\s+)?\w+\s*\(/,
        ],
        classStart: [/^(export\s+)?(abstract\s+)?class\s+/, /^(export\s+)?interface\s+/],
        blockEnd: [/^\s*\};\s*$/, /^\s*\}\s*$/, /^\s*\}\);\s*$/],
      },
      javascript: {
        functionStart: [
          /^(export\s+)?(async\s+)?function\s+/,
          /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
        ],
        classStart: [/^(export\s+)?class\s+/],
        blockEnd: [/^\s*\};\s*$/, /^\s*\}\s*$/, /^\s*\}\);\s*$/],
      },
      python: {
        functionStart: [/^(async\s+)?def\s+/, /^@\w+/],
        classStart: [/^class\s+/],
        blockEnd: [/^[^\s]/], // Python: dedent indicates block end
      },
      go: {
        functionStart: [/^func\s+/, /^func\s+\(\w+\s+\*?\w+\)\s+\w+/],
        classStart: [/^type\s+\w+\s+struct/, /^type\s+\w+\s+interface/],
        blockEnd: [/^\}/],
      },
      rust: {
        functionStart: [/^(pub\s+)?(async\s+)?fn\s+/, /^impl\s+/],
        classStart: [/^(pub\s+)?struct\s+/, /^(pub\s+)?trait\s+/, /^(pub\s+)?enum\s+/],
        blockEnd: [/^\}/],
      },
    };

    return (
      patterns[language] || {
        functionStart: [],
        classStart: [],
        blockEnd: [/^\}/],
      }
    );
  }

  /**
   * Split entity by line count when no semantic boundaries work
   */
  private splitByLines(
    entity: CodeEntity,
    lines: string[],
    startOffset: number = 0
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    let currentLines: string[] = [];
    let currentLineStart = entity.lineStart + startOffset;
    let splitIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      currentLines.push(lines[i]);
      const content = currentLines.join('\n');
      const tokenCount = this.tokenCounter.count(content);

      // If we exceed max tokens, create a chunk
      if (tokenCount > this.config.maxTokens) {
        // Remove the last line that pushed us over
        currentLines.pop();

        if (currentLines.length > 0) {
          chunks.push(
            this.createChunkFromLines(
              entity,
              currentLines,
              currentLineStart,
              splitIndex++,
              0
            )
          );
        }

        // Start new chunk with the line that pushed us over
        currentLines = [lines[i]];
        currentLineStart = entity.lineStart + startOffset + i;
      }
    }

    // Add remaining lines as final chunk
    if (currentLines.length > 0) {
      chunks.push(
        this.createChunkFromLines(
          entity,
          currentLines,
          currentLineStart,
          splitIndex++,
          0
        )
      );
    }

    // Update totalSplits
    const totalSplits = chunks.length;
    chunks.forEach((chunk) => {
      chunk.metadata.totalSplits = totalSplits;
    });

    return chunks;
  }

  /**
   * Create a chunk from entity
   */
  private createChunk(
    entity: CodeEntity,
    content: string,
    splitIndex: number,
    totalSplits: number
  ): CodeChunk {
    const tokenCount = this.tokenCounter.count(content);

    return {
      id: this.generateChunkId(entity.filePath, entity.lineStart, splitIndex),
      content,
      filePath: entity.filePath,
      language: entity.language,
      lineStart: entity.lineStart,
      lineEnd: entity.lineEnd,
      tokenCount,
      parentEntity: entity.metadata.parentClass,
      entityType: this.mapEntityType(entity.type),
      metadata: {
        filePath: entity.filePath,
        language: entity.language,
        lineStart: entity.lineStart,
        lineEnd: entity.lineEnd,
        parentEntity: entity.metadata.parentClass,
        entityType: this.mapEntityType(entity.type),
        signature: entity.signature,
        isComplete: totalSplits === 1,
        splitIndex: totalSplits > 1 ? splitIndex : undefined,
        totalSplits: totalSplits > 1 ? totalSplits : undefined,
        originalEntityName: entity.name,
        ...entity.metadata,
      },
    };
  }

  /**
   * Create chunk from lines
   */
  private createChunkFromLines(
    entity: CodeEntity,
    lines: string[],
    lineStart: number,
    splitIndex: number,
    totalSplits: number
  ): CodeChunk {
    const content = lines.join('\n');
    const tokenCount = this.tokenCounter.count(content);
    const lineEnd = lineStart + lines.length - 1;

    return {
      id: this.generateChunkId(entity.filePath, lineStart, splitIndex),
      content,
      filePath: entity.filePath,
      language: entity.language,
      lineStart,
      lineEnd,
      tokenCount,
      parentEntity: entity.metadata.parentClass,
      entityType: this.mapEntityType(entity.type),
      metadata: {
        filePath: entity.filePath,
        language: entity.language,
        lineStart,
        lineEnd,
        parentEntity: entity.metadata.parentClass,
        entityType: this.mapEntityType(entity.type),
        signature: entity.signature,
        isComplete: false,
        splitIndex,
        totalSplits,
        originalEntityName: entity.name,
        ...entity.metadata,
      },
    };
  }

  /**
   * Map parser entity type to chunk entity type
   */
  private mapEntityType(type: string): EntityType {
    const mapping: Record<string, EntityType> = {
      function: 'function',
      class: 'class',
      method: 'method',
      interface: 'interface',
      type: 'type',
    };

    return mapping[type] || 'fragment';
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(filePath: string, lineStart: number, splitIndex: number): string {
    const content = `${filePath}:${lineStart}:${splitIndex}`;
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}
