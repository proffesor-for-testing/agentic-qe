/**
 * ContextFormatter
 *
 * Formats code context for optimal LLM consumption.
 * Includes metadata, relationship context, and intelligent truncation.
 *
 * Goals:
 * - Minimize tokens while preserving essential information
 * - Include navigational metadata (file paths, line numbers)
 * - Show relationship context (imports, calls, tests)
 * - Smart truncation for large code blocks
 */

import type { GraphNode } from '../../code-intelligence/graph/types.js';
import type { SearchResult } from '../../code-intelligence/search/types.js';
import type { ExpandedNode } from './GraphExpander.js';

export interface FormattingOptions {
  /** Include file paths (default: true) */
  includeFilePaths: boolean;
  /** Include line numbers (default: true) */
  includeLineNumbers: boolean;
  /** Include entity metadata (default: true) */
  includeMetadata: boolean;
  /** Include relationship context (default: true) */
  includeRelationships: boolean;
  /** Maximum lines per code block (default: 50) */
  maxLinesPerBlock: number;
  /** Truncation strategy (default: 'middle') */
  truncationStrategy: 'start' | 'middle' | 'end' | 'smart';
  /** Markdown formatting (default: true) */
  useMarkdown: boolean;
}

export interface FormattedContext {
  content: string;
  metadata: {
    totalChunks: number;
    totalLines: number;
    totalTokensEstimate: number;
    truncated: boolean;
  };
}

const DEFAULT_OPTIONS: FormattingOptions = {
  includeFilePaths: true,
  includeLineNumbers: true,
  includeMetadata: true,
  includeRelationships: true,
  maxLinesPerBlock: 50,
  truncationStrategy: 'middle',
  useMarkdown: true,
};

export class ContextFormatter {
  private options: FormattingOptions;

  constructor(options: Partial<FormattingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Format search results with graph context.
   */
  format(
    searchResults: SearchResult[],
    expandedNodes: ExpandedNode[],
    options?: Partial<FormattingOptions>
  ): FormattedContext {
    const opts = { ...this.options, ...options };
    const sections: string[] = [];
    let totalLines = 0;
    let truncated = false;

    // Primary results section
    if (searchResults.length > 0) {
      const primarySection = this.formatPrimaryResults(searchResults, opts);
      sections.push(primarySection.content);
      totalLines += primarySection.lines;
      truncated = truncated || primarySection.truncated;
    }

    // Related code section
    if (expandedNodes.length > 0 && opts.includeRelationships) {
      const relatedSection = this.formatRelatedCode(expandedNodes, opts);
      sections.push(relatedSection.content);
      totalLines += relatedSection.lines;
      truncated = truncated || relatedSection.truncated;
    }

    const content = sections.join('\n\n');
    const totalTokensEstimate = this.estimateTokens(content);

    return {
      content,
      metadata: {
        totalChunks: searchResults.length + expandedNodes.length,
        totalLines,
        totalTokensEstimate,
        truncated,
      },
    };
  }

  /**
   * Format primary search results.
   */
  private formatPrimaryResults(
    results: SearchResult[],
    opts: FormattingOptions
  ): { content: string; lines: number; truncated: boolean } {
    const sections: string[] = [];
    let totalLines = 0;
    let truncated = false;

    if (opts.useMarkdown) {
      sections.push('## Relevant Code');
      sections.push('');
    }

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const formatted = this.formatCodeBlock(result, opts, `Result ${i + 1}`);
      sections.push(formatted.content);
      totalLines += formatted.lines;
      truncated = truncated || formatted.truncated;

      if (i < results.length - 1) {
        sections.push('');
      }
    }

    return {
      content: sections.join('\n'),
      lines: totalLines,
      truncated,
    };
  }

  /**
   * Format related code from graph expansion.
   */
  private formatRelatedCode(
    nodes: ExpandedNode[],
    opts: FormattingOptions
  ): { content: string; lines: number; truncated: boolean } {
    const sections: string[] = [];
    let totalLines = 0;
    let truncated = false;

    if (opts.useMarkdown) {
      sections.push('## Related Code');
      sections.push('');
    }

    // Group by relationship type
    const grouped = new Map<string, ExpandedNode[]>();
    for (const node of nodes) {
      const relationship = node.relationship;
      if (!grouped.has(relationship)) {
        grouped.set(relationship, []);
      }
      grouped.get(relationship)!.push(node);
    }

    // Format each group
    for (const [relationship, relatedNodes] of grouped.entries()) {
      if (opts.useMarkdown) {
        sections.push(`### ${this.capitalizeRelationship(relationship)}`);
        sections.push('');
      }

      for (let i = 0; i < relatedNodes.length; i++) {
        const node = relatedNodes[i];
        const formatted = this.formatGraphNode(node, opts);
        sections.push(formatted.content);
        totalLines += formatted.lines;
        truncated = truncated || formatted.truncated;

        if (i < relatedNodes.length - 1) {
          sections.push('');
        }
      }

      sections.push('');
    }

    return {
      content: sections.join('\n'),
      lines: totalLines,
      truncated,
    };
  }

  /**
   * Format a code block from search result.
   */
  private formatCodeBlock(
    result: SearchResult,
    opts: FormattingOptions,
    label?: string
  ): { content: string; lines: number; truncated: boolean } {
    const lines: string[] = [];

    // Header
    if (label && opts.useMarkdown) {
      lines.push(`### ${label}`);
    }

    // File path and line numbers
    if (opts.includeFilePaths) {
      const location = opts.includeLineNumbers
        ? `${result.filePath}:${result.startLine}-${result.endLine}`
        : result.filePath;
      lines.push(opts.useMarkdown ? `**File:** \`${location}\`` : `File: ${location}`);
    }

    // Entity metadata
    if (opts.includeMetadata && (result.entityType || result.entityName)) {
      const metadata: string[] = [];
      if (result.entityType) metadata.push(`Type: ${result.entityType}`);
      if (result.entityName) metadata.push(`Name: ${result.entityName}`);
      if (result.score !== undefined) {
        metadata.push(`Relevance: ${(result.score * 100).toFixed(1)}%`);
      }
      lines.push(opts.useMarkdown ? `**${metadata.join(' | ')}**` : metadata.join(' | '));
    }

    lines.push('');

    // Code content with truncation
    const { content, truncated } = this.truncateContent(
      result.content,
      opts.maxLinesPerBlock,
      opts.truncationStrategy
    );

    const language = this.detectLanguage(result.filePath);
    if (opts.useMarkdown) {
      lines.push(`\`\`\`${language}`);
      lines.push(content);
      lines.push('```');
    } else {
      lines.push(content);
    }

    const totalLines = content.split('\n').length;

    return {
      content: lines.join('\n'),
      lines: totalLines,
      truncated,
    };
  }

  /**
   * Format a graph node.
   */
  private formatGraphNode(
    expandedNode: ExpandedNode,
    opts: FormattingOptions
  ): { content: string; lines: number; truncated: boolean } {
    const node = expandedNode.node;
    const lines: string[] = [];

    // File path and line numbers
    if (opts.includeFilePaths) {
      const location = opts.includeLineNumbers
        ? `${node.filePath}:${node.startLine}-${node.endLine}`
        : node.filePath;
      lines.push(opts.useMarkdown ? `**\`${location}\`**` : location);
    }

    // Node metadata
    if (opts.includeMetadata) {
      const metadata: string[] = [];
      metadata.push(`Type: ${node.type}`);
      metadata.push(`Label: ${node.label}`);
      if (expandedNode.depth > 0) {
        metadata.push(`Depth: ${expandedNode.depth}`);
      }
      lines.push(metadata.join(' | '));
    }

    // Note: Graph nodes don't have content - would need to read from file
    // For now, just show metadata
    lines.push('');

    return {
      content: lines.join('\n'),
      lines: 3,
      truncated: false,
    };
  }

  /**
   * Truncate content based on strategy.
   */
  private truncateContent(
    content: string,
    maxLines: number,
    strategy: FormattingOptions['truncationStrategy']
  ): { content: string; truncated: boolean } {
    const lines = content.split('\n');

    if (lines.length <= maxLines) {
      return { content, truncated: false };
    }

    let truncatedLines: string[];

    switch (strategy) {
      case 'start':
        truncatedLines = lines.slice(0, maxLines);
        truncatedLines.push('// ... (truncated)');
        break;

      case 'end':
        truncatedLines = ['// ... (truncated)'];
        truncatedLines.push(...lines.slice(-maxLines));
        break;

      case 'middle':
        const half = Math.floor(maxLines / 2);
        truncatedLines = lines.slice(0, half);
        truncatedLines.push('// ... (truncated)');
        truncatedLines.push(...lines.slice(-half));
        break;

      case 'smart':
        // Keep important lines (function signatures, class definitions, etc.)
        truncatedLines = this.smartTruncate(lines, maxLines);
        break;

      default:
        truncatedLines = lines.slice(0, maxLines);
    }

    return {
      content: truncatedLines.join('\n'),
      truncated: true,
    };
  }

  /**
   * Smart truncation preserving important lines.
   */
  private smartTruncate(lines: string[], maxLines: number): string[] {
    const important: number[] = [];
    const importantPatterns = [
      /^\s*(export\s+)?(class|interface|function|const|let|var)\s+/,
      /^\s*\/\*\*/, // JSDoc comments
      /^\s*import\s+/,
      /^\s*@\w+/, // Decorators
    ];

    // Find important lines
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of importantPatterns) {
        if (pattern.test(lines[i])) {
          important.push(i);
          break;
        }
      }
    }

    // If we have enough important lines, use those
    if (important.length >= maxLines) {
      return important.slice(0, maxLines).map(i => lines[i]);
    }

    // Otherwise, include important lines plus context
    const result: string[] = [];
    const included = new Set<number>();

    for (const idx of important) {
      // Include important line and 2 lines of context
      for (let i = Math.max(0, idx - 2); i <= Math.min(lines.length - 1, idx + 2); i++) {
        if (!included.has(i) && result.length < maxLines) {
          included.add(i);
          result.push(lines[i]);
        }
      }

      if (result.length >= maxLines) break;
    }

    return result;
  }

  /**
   * Detect programming language from file path.
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
    };
    return langMap[ext || ''] || '';
  }

  /**
   * Capitalize relationship name for display.
   */
  private capitalizeRelationship(rel: string): string {
    return rel
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Estimate token count (rough heuristic: ~4 chars per token).
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Update formatting options.
   */
  updateOptions(options: Partial<FormattingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options.
   */
  getOptions(): FormattingOptions {
    return { ...this.options };
  }
}
