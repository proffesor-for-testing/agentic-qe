#!/usr/bin/env npx tsx
/**
 * Code Intelligence - Knowledge Graph Indexer
 *
 * Indexes the V3 codebase and creates a knowledge graph with:
 * - Classes, functions, interfaces, types
 * - Import/export relationships
 * - File dependencies
 * - Test file mappings
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphService } from '../src/domains/code-intelligence/services/knowledge-graph.js';
import { HybridMemoryBackend } from '../src/kernel/hybrid-backend.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(color: keyof typeof colors, message: string): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Recursively get all TypeScript files from a directory
 */
function getTypeScriptFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, dist, and hidden directories
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }
      getTypeScriptFiles(fullPath, files);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main indexing function
 */
async function indexCodebase(): Promise<void> {
  const startTime = Date.now();

  log('bright', '\n========================================');
  log('cyan', '  Code Intelligence - Knowledge Graph Indexer');
  log('bright', '========================================\n');

  // Get project root
  const projectRoot = path.resolve(__dirname, '..');
  const srcDir = path.join(projectRoot, 'src');
  const testsDir = path.join(projectRoot, 'tests');

  // Collect all TypeScript files
  log('yellow', 'Scanning directories...');
  const srcFiles = getTypeScriptFiles(srcDir);
  const testFiles = getTypeScriptFiles(testsDir);
  const allFiles = [...srcFiles, ...testFiles];

  log('green', `Found ${srcFiles.length} source files in src/`);
  log('green', `Found ${testFiles.length} test files in tests/`);
  log('cyan', `Total: ${allFiles.length} TypeScript files\n`);

  // Initialize memory backend (persistent SQLite via HybridMemoryBackend)
  log('yellow', 'Initializing memory backend (SQLite: .agentic-qe/memory.db)...');
  const memory = new HybridMemoryBackend({
    sqlite: { path: '.agentic-qe/memory.db' },
    defaultNamespace: 'code-intelligence:kg',
  });
  await memory.initialize();

  // Initialize knowledge graph service
  log('yellow', 'Initializing Knowledge Graph Service...');
  const kgService = new KnowledgeGraphService(memory, {
    namespace: 'code-intelligence:kg',
    maxNodes: 100000,
    maxEdgesPerNode: 500,
    enableVectorEmbeddings: false, // Disable for faster indexing
    embeddingDimension: 384,
  });

  // Index all files
  log('yellow', '\nIndexing codebase...');
  const indexResult = await kgService.index({
    paths: allFiles,
    incremental: false,
    includeTests: true,
    languages: ['typescript'],
  });

  if (!indexResult.success) {
    log('red', `Indexing failed: ${indexResult.error.message}`);
    await memory.dispose();
    process.exit(1);
  }

  const result = indexResult.value;
  const duration = Date.now() - startTime;

  // Display results
  log('bright', '\n========================================');
  log('green', '  INDEXING COMPLETE');
  log('bright', '========================================\n');

  log('cyan', 'Statistics:');
  console.log(`  Files indexed:    ${result.filesIndexed}`);
  console.log(`  Nodes created:    ${result.nodesCreated}`);
  console.log(`  Edges created:    ${result.edgesCreated}`);
  console.log(`  Duration:         ${result.duration}ms`);
  console.log(`  Total time:       ${duration}ms`);

  if (result.errors.length > 0) {
    log('yellow', `\n  Errors: ${result.errors.length}`);
    for (const err of result.errors.slice(0, 5)) {
      console.log(`    - ${err.file}: ${err.error}`);
    }
    if (result.errors.length > 5) {
      console.log(`    ... and ${result.errors.length - 5} more`);
    }
  }

  // Query for most connected files (files with most imports/exports)
  log('cyan', '\n\nQuerying knowledge graph...');

  // Query all File nodes with higher limit
  const fileNodesResult = await kgService.query({
    query: 'MATCH (n:File) RETURN n',
    type: 'cypher',
    limit: 10000,
  });

  if (fileNodesResult.success) {
    log('green', `\nFile Nodes: ${fileNodesResult.value.nodes.length}`);
  }

  // Query for classes with higher limit
  const classNodesResult = await kgService.query({
    query: 'MATCH (n:class) RETURN n',
    type: 'cypher',
    limit: 10000,
  });

  if (classNodesResult.success) {
    log('green', `Class Nodes: ${classNodesResult.value.nodes.length}`);
  }

  // Query for functions with higher limit
  const funcNodesResult = await kgService.query({
    query: 'MATCH (n:function) RETURN n',
    type: 'cypher',
    limit: 10000,
  });

  if (funcNodesResult.success) {
    log('green', `Function Nodes: ${funcNodesResult.value.nodes.length}`);
  }

  // Query for interfaces with higher limit
  const ifaceNodesResult = await kgService.query({
    query: 'MATCH (n:interface) RETURN n',
    type: 'cypher',
    limit: 10000,
  });

  if (ifaceNodesResult.success) {
    log('green', `Interface Nodes: ${ifaceNodesResult.value.nodes.length}`);
  }

  // Query for modules
  const moduleNodesResult = await kgService.query({
    query: 'MATCH (n:module) RETURN n',
    type: 'cypher',
    limit: 10000,
  });

  if (moduleNodesResult.success) {
    log('green', `Module Nodes: ${moduleNodesResult.value.nodes.length}`);
  }

  // Query for contains relationships (File -> Entity)
  const containsEdgesResult = await kgService.query({
    query: 'MATCH (f:File)-[r:contains]->(e:class) RETURN f,r,e',
    type: 'cypher',
    limit: 10000,
  });

  if (containsEdgesResult.success) {
    log('green', `File-Contains-Class Edges: ${containsEdgesResult.value.edges.length}`);
  }

  // Query for import relationships
  const importEdgesResult = await kgService.query({
    query: 'MATCH (f:File)-[r:import]->(t:File) RETURN f,r,t',
    type: 'cypher',
    limit: 10000,
  });

  if (importEdgesResult.success) {
    log('green', `Import Edges: ${importEdgesResult.value.edges.length}`);
  }

  // Analyze domain structure by scanning ALL indexed files
  log('cyan', '\n\nDomain Structure Analysis:');

  const domains = new Map<string, number>();

  // Use the original allFiles array which has all file paths
  for (const filePath of allFiles) {
    if (filePath.includes('/domains/')) {
      const domainMatch = filePath.match(/\/domains\/([^/]+)\//);
      if (domainMatch) {
        const domain = domainMatch[1];
        domains.set(domain, (domains.get(domain) || 0) + 1);
      }
    }
  }

  // Sort domains by file count
  const sortedDomains = Array.from(domains.entries()).sort((a, b) => b[1] - a[1]);

  log('yellow', '\nDomains found:');
  for (const [domain, count] of sortedDomains) {
    console.log(`  - ${domain}: ${count} files`);
  }

  // Calculate statistics for top connected files
  log('cyan', '\n\nTop 10 Most Connected Files (by edges):');

  const fileEdgeCounts = new Map<string, { incoming: number; outgoing: number }>();

  if (fileNodesResult.success) {
    for (const node of fileNodesResult.value.nodes) {
      const edges = await kgService.getEdges(node.id, 'both');
      const incoming = edges.filter(e => e.target === node.id).length;
      const outgoing = edges.filter(e => e.source === node.id).length;

      fileEdgeCounts.set(node.properties.path as string, { incoming, outgoing });
    }
  }

  const topFiles = Array.from(fileEdgeCounts.entries())
    .map(([path, counts]) => ({ path, total: counts.incoming + counts.outgoing, ...counts }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  for (const file of topFiles) {
    const shortPath = file.path.replace(projectRoot, '');
    console.log(`  ${shortPath}`);
    console.log(`    Total: ${file.total} (in: ${file.incoming}, out: ${file.outgoing})`);
  }

  // Store metadata in memory
  log('cyan', '\n\nStoring knowledge graph metadata...');

  await memory.set('code-intelligence:kg:metadata', {
    indexedAt: new Date().toISOString(),
    filesIndexed: result.filesIndexed,
    nodesCreated: result.nodesCreated,
    edgesCreated: result.edgesCreated,
    duration: result.duration,
    domains: sortedDomains,
    topFiles: topFiles.slice(0, 10).map(f => ({
      path: f.path.replace(projectRoot, ''),
      edges: f.total,
    })),
  }, {
    namespace: 'code-intelligence:kg',
    persist: true,
  });

  // Get memory stats
  const memStats = memory.getStats();
  log('green', `\nMemory Stats: ${memStats.entries} entries, ${memStats.vectors} vectors`);

  // Summary
  log('bright', '\n========================================');
  log('green', '  SUMMARY');
  log('bright', '========================================\n');

  console.log(`  Total Files Indexed:     ${result.filesIndexed}`);
  console.log(`  Total Nodes:             ${result.nodesCreated}`);
  console.log(`  Total Edges:             ${result.edgesCreated}`);
  console.log(`  Domains Discovered:      ${sortedDomains.length}`);
  console.log(`  Indexing Duration:       ${result.duration}ms`);
  console.log(`  Total Duration:          ${duration}ms`);
  console.log(`  Avg Time per File:       ${(result.duration / result.filesIndexed).toFixed(2)}ms`);

  // Entity breakdown
  const classCount = classNodesResult.success ? classNodesResult.value.nodes.length : 0;
  const funcCount = funcNodesResult.success ? funcNodesResult.value.nodes.length : 0;
  const ifaceCount = ifaceNodesResult.success ? ifaceNodesResult.value.nodes.length : 0;
  const fileCount = fileNodesResult.success ? fileNodesResult.value.nodes.length : 0;
  const modCount = moduleNodesResult.success ? moduleNodesResult.value.nodes.length : 0;
  const otherCount = result.nodesCreated - classCount - funcCount - ifaceCount - fileCount - modCount;

  log('cyan', '\nEntity Breakdown:');
  console.log(`  Files:       ${fileCount}`);
  console.log(`  Classes:     ${classCount}`);
  console.log(`  Functions:   ${funcCount}`);
  console.log(`  Interfaces:  ${ifaceCount}`);
  console.log(`  Modules:     ${modCount}`);
  console.log(`  Other:       ${otherCount > 0 ? otherCount : 0}`);

  // Clean up
  kgService.destroy();
  await memory.dispose();

  log('green', '\nKnowledge graph indexing complete!');
}

// Run the indexer
indexCodebase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
