/**
 * Knowledge Graph Output Formatter
 *
 * Formats CLI output for knowledge graph operations with:
 * - Color-coded search results
 * - Progress bars for indexing
 * - Formatted statistics
 * - Pretty-printed query results
 */

import chalk from 'chalk';
import cliProgress from 'cli-progress';
import type { QueryResult, IndexingProgress, IndexingResult } from '../../code-intelligence/orchestrator/types.js';
import * as path from 'path';

export class KGOutputFormatter {
  /**
   * Format query results with color coding and structure
   */
  formatQueryResults(result: QueryResult, verbose: boolean): void {
    if (result.results.length === 0) {
      console.log(chalk.yellow('\n⚠️  No results found'));
      return;
    }

    console.log(chalk.green(`\n✅ Found ${result.results.length} results:\n`));

    result.results.forEach((item, index) => {
      // Score indicator
      const scoreColor = this.getScoreColor(item.score);
      const scoreBar = this.getScoreBar(item.score);

      // File path with line numbers
      const location = chalk.cyan(`${item.filePath}:${item.startLine}-${item.endLine}`);

      // Entity info
      const entityInfo = item.entityName
        ? chalk.yellow(`${item.entityType || 'code'} ${item.entityName}`)
        : chalk.gray(item.entityType || 'code');

      console.log(`${chalk.bold(`${index + 1}.`)} ${location} ${scoreColor(`(score: ${item.score.toFixed(2)})`)} ${scoreBar}`);
      console.log(`   ${entityInfo}`);

      // Code snippet (truncated)
      const snippet = this.formatCodeSnippet(item.content, verbose);
      console.log(chalk.gray(snippet));

      // Related code (if available)
      if (item.relatedCode && item.relatedCode.length > 0) {
        console.log(chalk.blue('   Related code:'));
        item.relatedCode.slice(0, verbose ? 10 : 3).forEach((related) => {
          const relIcon = this.getRelationshipIcon(related.relationship);
          console.log(chalk.gray(`     ${relIcon} ${related.relationship}: ${related.filePath}`));
        });
        if (!verbose && item.relatedCode.length > 3) {
          console.log(chalk.gray(`     ... and ${item.relatedCode.length - 3} more`));
        }
      }

      console.log(); // Empty line between results
    });

    // Metadata
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray(`Query: "${result.metadata.query}"`));
    console.log(chalk.gray(`Total matches: ${result.metadata.totalMatches}`));
    console.log(chalk.gray(`Search time: ${result.metadata.searchTimeMs}ms`));
    if (result.metadata.graphExpansionTimeMs) {
      console.log(chalk.gray(`Graph expansion time: ${result.metadata.graphExpansionTimeMs}ms`));
    }
  }

  /**
   * Format indexing result
   */
  formatIndexingResult(result: IndexingResult, progress: IndexingProgress | null): void {
    if (result.success) {
      console.log(chalk.green('\n✅ Indexing completed successfully!\n'));
    } else {
      console.log(chalk.yellow('\n⚠️  Indexing completed with errors\n'));
    }

    // Statistics
    console.log(chalk.blue('Statistics:'));
    console.log(chalk.gray(`  Files indexed: ${result.stats.filesIndexed}`));
    console.log(chalk.gray(`  Chunks created: ${result.stats.chunksCreated}`));
    console.log(chalk.gray(`  Embeddings generated: ${result.stats.embeddingsGenerated}`));
    console.log(chalk.gray(`  Graph nodes: ${result.stats.nodesCreated}`));
    console.log(chalk.gray(`  Graph edges: ${result.stats.edgesCreated}`));
    console.log(chalk.gray(`  Total time: ${this.formatDuration(result.stats.totalTimeMs)}`));
    console.log(chalk.gray(`  Average time per file: ${result.stats.averageTimePerFileMs.toFixed(2)}ms`));

    // Failures
    if (result.failures.length > 0) {
      console.log(chalk.red(`\n❌ Failed files (${result.failures.length}):`));
      result.failures.slice(0, 10).forEach((failure) => {
        console.log(chalk.red(`  ${failure.file}`));
        console.log(chalk.gray(`    ${failure.error}`));
      });
      if (result.failures.length > 10) {
        console.log(chalk.gray(`  ... and ${result.failures.length - 10} more`));
      }
    }

    // Progress errors
    if (progress && progress.errors.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Warnings (${progress.errors.length}):`));
      progress.errors.slice(0, 5).forEach((error) => {
        console.log(chalk.yellow(`  ${error.file}`));
        console.log(chalk.gray(`    ${error.error}`));
      });
      if (progress.errors.length > 5) {
        console.log(chalk.gray(`  ... and ${progress.errors.length - 5} more`));
      }
    }
  }

  /**
   * Format statistics
   */
  formatStats(stats: any, usingDatabase: boolean, verbose: boolean): void {
    // Storage mode
    const storageIcon = usingDatabase ? '💾' : '💭';
    const storageMode = usingDatabase ? 'Database (RuVector PostgreSQL)' : 'In-memory';
    console.log(chalk.blue(`${storageIcon} Storage: ${storageMode}\n`));

    // Database stats (primary source when using database)
    if (stats.database) {
      const healthIcon = stats.database.databaseHealthy ? chalk.green('✓') : chalk.red('✗');
      console.log(chalk.yellow('🗄️  Database (Persisted):'));
      console.log(chalk.gray(`  Status: ${healthIcon} ${stats.database.databaseHealthy ? 'Healthy' : 'Unhealthy'}`));
      console.log(chalk.green(`  Code chunks: ${stats.database.chunkCount.toLocaleString()}`));
      console.log(chalk.gray(`  Entities: ${stats.database.entityCount.toLocaleString()}`));
      console.log(chalk.gray(`  Relationships: ${stats.database.relationshipCount.toLocaleString()}`));
    }

    // Indexer stats (in-memory cache)
    console.log(chalk.yellow('\n📚 Indexer (Session Cache):'));
    if (stats.indexer) {
      console.log(chalk.gray(`  Cached files: ${stats.indexer.totalFiles || 0}`));
      console.log(chalk.gray(`  Cached chunks: ${stats.indexer.totalChunks || 0}`));
      console.log(chalk.gray(`  Cache size: ${stats.indexer.cacheSize || 0}`));
    } else {
      console.log(chalk.gray('  No indexer stats available'));
    }

    // Graph stats (in-memory)
    console.log(chalk.yellow('\n🕸️  Knowledge Graph (Session):'));
    if (stats.graph) {
      console.log(chalk.gray(`  Nodes: ${stats.graph.nodeCount || 0}`));
      console.log(chalk.gray(`  Edges: ${stats.graph.edgeCount || 0}`));

      if (verbose && stats.graph.nodesByType) {
        console.log(chalk.gray('  Nodes by type:'));
        Object.entries(stats.graph.nodesByType).forEach(([type, count]) => {
          console.log(chalk.gray(`    ${type}: ${count}`));
        });
      }

      if (verbose && stats.graph.edgesByType) {
        console.log(chalk.gray('  Edges by type:'));
        Object.entries(stats.graph.edgesByType).forEach(([type, count]) => {
          console.log(chalk.gray(`    ${type}: ${count}`));
        });
      }
    } else {
      console.log(chalk.gray('  No graph stats available'));
    }

    // Search stats
    console.log(chalk.yellow('\n🔍 Search Engine:'));
    if (stats.search) {
      console.log(chalk.gray(`  Indexed documents: ${stats.search.documentCount || 0}`));
      console.log(chalk.gray(`  Total queries: ${stats.search.totalQueries || 0}`));
      console.log(chalk.gray(`  Average query time: ${(stats.search.averageQueryTime || 0).toFixed(2)}ms`));
    } else {
      console.log(chalk.gray('  No search stats available'));
    }
  }

  /**
   * Create progress bar for indexing
   */
  createProgressBar(): cliProgress.SingleBar {
    return new cliProgress.SingleBar({
      format: `${chalk.cyan('{bar}')} {percentage}% | {phase} | {file} | Chunks: {chunks} | Embeddings: {embeddings}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    }, cliProgress.Presets.shades_classic);
  }

  // === Private Helper Methods ===

  /**
   * Get color for score
   */
  private getScoreColor(score: number): (text: string) => string {
    if (score >= 0.9) return chalk.green.bold;
    if (score >= 0.7) return chalk.green;
    if (score >= 0.5) return chalk.yellow;
    return chalk.red;
  }

  /**
   * Get visual score bar
   */
  private getScoreBar(score: number): string {
    const barLength = 10;
    const filled = Math.round(score * barLength);
    const empty = barLength - filled;

    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);

    const color = this.getScoreColor(score);
    return color(`[${filledBar}${emptyBar}]`);
  }

  /**
   * Format code snippet
   */
  private formatCodeSnippet(content: string, verbose: boolean): string {
    const maxLines = verbose ? 10 : 3;
    const lines = content.split('\n');

    let snippet = lines.slice(0, maxLines)
      .map((line) => `   ${line}`)
      .join('\n');

    if (lines.length > maxLines) {
      snippet += `\n   ${chalk.gray(`... (${lines.length - maxLines} more lines)`)}`;
    }

    return snippet;
  }

  /**
   * Get icon for relationship type
   */
  private getRelationshipIcon(relationship: string): string {
    const icons: Record<string, string> = {
      imports: '📦',
      exports: '📤',
      calls: '📞',
      extends: '🔼',
      implements: '🔸',
      tests: '🧪',
      defines: '📝',
      uses: '🔗',
    };
    return icons[relationship] || '→';
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}
