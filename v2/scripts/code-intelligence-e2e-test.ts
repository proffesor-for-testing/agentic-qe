#!/usr/bin/env npx tsx
/**
 * Code Intelligence System E2E Integration Test
 *
 * Tests the full pipeline:
 * 1. Tree-sitter parsing → AST extraction
 * 2. AST chunking → Semantic chunks
 * 3. Ollama/nomic-embed-text → 768-dim embeddings
 * 4. RuVector PostgreSQL → Persistent storage
 * 5. Hybrid search → BM25 + vector retrieval
 * 6. Graph relationships → Code graph queries
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// Import code intelligence components
import { TreeSitterParser } from '../src/code-intelligence/parser/TreeSitterParser.js';
import { ASTChunker } from '../src/code-intelligence/chunking/ASTChunker.js';
import { NomicEmbedder } from '../src/code-intelligence/embeddings/NomicEmbedder.js';
import { OllamaClient } from '../src/code-intelligence/embeddings/OllamaClient.js';
import { CodeChunkStore } from '../src/code-intelligence/storage/CodeChunkStore.js';
import { GraphBuilder } from '../src/code-intelligence/graph/GraphBuilder.js';
import { HybridSearchEngine } from '../src/code-intelligence/search/HybridSearchEngine.js';

interface E2ETestResult {
  phase: string;
  success: boolean;
  duration: number;
  details: Record<string, unknown>;
  error?: string;
}

async function runE2ETest(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Code Intelligence System v2.0 - E2E Integration Test     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results: E2ETestResult[] = [];
  const startTime = Date.now();

  // Phase 1: Verify Ollama is running
  console.log('📡 Phase 1: Verifying Ollama connectivity...');
  const phase1Start = Date.now();
  try {
    const ollamaClient = new OllamaClient();
    const isHealthy = await ollamaClient.healthCheck();

    if (!isHealthy) {
      throw new Error('Ollama is not running or nomic-embed-text model is not available');
    }

    const testEmbedding = await ollamaClient.generateEmbedding('test code intelligence');
    results.push({
      phase: 'Ollama Verification',
      success: true,
      duration: Date.now() - phase1Start,
      details: { embeddingDimensions: testEmbedding.length },
    });
    console.log(`   ✅ Ollama healthy, embedding dimensions: ${testEmbedding.length}\n`);
  } catch (error) {
    results.push({
      phase: 'Ollama Verification',
      success: false,
      duration: Date.now() - phase1Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
    printSummary(results, startTime);
    process.exit(1);
  }

  // Phase 2: Verify PostgreSQL/RuVector connectivity
  console.log('🗄️  Phase 2: Verifying PostgreSQL/RuVector connectivity...');
  const phase2Start = Date.now();
  let codeChunkStore: CodeChunkStore | null = null;
  try {
    codeChunkStore = new CodeChunkStore({
      host: 'localhost',
      port: 5432,
      database: 'ruvector_db',
      user: 'ruvector',
      password: 'ruvector',
      debug: false,
    });

    await codeChunkStore.initialize();
    const health = await codeChunkStore.healthCheck();

    results.push({
      phase: 'PostgreSQL/RuVector Verification',
      success: health.healthy,
      duration: Date.now() - phase2Start,
      details: {
        ruvectorVersion: health.ruvectorVersion,
        existingChunks: health.chunkCount,
        existingEntities: health.entityCount,
      },
    });
    console.log(`   ✅ RuVector version: ${health.ruvectorVersion || 'N/A'}`);
    console.log(`   ✅ Existing chunks: ${health.chunkCount}, entities: ${health.entityCount}\n`);
  } catch (error) {
    results.push({
      phase: 'PostgreSQL/RuVector Verification',
      success: false,
      duration: Date.now() - phase2Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
    printSummary(results, startTime);
    process.exit(1);
  }

  // Phase 3: Parse sample TypeScript files
  console.log('🌳 Phase 3: Parsing TypeScript files with Tree-sitter...');
  const phase3Start = Date.now();
  try {
    const parser = new TreeSitterParser();

    // Find sample TypeScript files (limit to 10 for quick test)
    const sampleFiles = await glob('src/code-intelligence/**/*.ts', {
      cwd: process.cwd(),
      ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
    });

    const filesToParse = sampleFiles.slice(0, 10);
    let totalEntities = 0;

    for (const filePath of filesToParse) {
      const fullPath = path.join(process.cwd(), filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parseResult = parser.parseFile(fullPath, content, 'typescript');
      totalEntities += parseResult.entities.length;
    }

    results.push({
      phase: 'Tree-sitter Parsing',
      success: true,
      duration: Date.now() - phase3Start,
      details: {
        filesParsed: filesToParse.length,
        totalEntities,
        filesScanned: sampleFiles.length,
      },
    });
    console.log(`   ✅ Parsed ${filesToParse.length} files, extracted ${totalEntities} entities\n`);
  } catch (error) {
    results.push({
      phase: 'Tree-sitter Parsing',
      success: false,
      duration: Date.now() - phase3Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
  }

  // Phase 4: Chunk and embed a sample file
  console.log('✂️  Phase 4: Chunking and embedding sample file...');
  const phase4Start = Date.now();
  try {
    const chunker = new ASTChunker();
    const embedder = new NomicEmbedder();

    // Use a known file
    const sampleFilePath = path.join(process.cwd(), 'src/code-intelligence/graph/GraphBuilder.ts');
    const content = fs.readFileSync(sampleFilePath, 'utf-8');

    // Chunk (ASTChunker handles parsing internally)
    const chunkResult = chunker.chunkFile(sampleFilePath, content, 'typescript');

    // Embed first 3 chunks only (to save time)
    const chunksToEmbed = chunkResult.chunks.slice(0, 3);
    const embeddings: number[][] = [];

    for (const chunk of chunksToEmbed) {
      const embedding = await embedder.embed(chunk.content);
      embeddings.push(embedding);
    }

    results.push({
      phase: 'Chunking & Embedding',
      success: true,
      duration: Date.now() - phase4Start,
      details: {
        chunksCreated: chunkResult.chunks.length,
        chunksEmbedded: embeddings.length,
        embeddingDimensions: embeddings[0]?.length || 0,
        totalTokens: chunkResult.totalTokens,
      },
    });
    console.log(`   ✅ ${chunkResult.chunks.length} chunks created → ${embeddings.length} embeddings generated\n`);
  } catch (error) {
    results.push({
      phase: 'Chunking & Embedding',
      success: false,
      duration: Date.now() - phase4Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
  }

  // Phase 5: Store chunks in PostgreSQL
  console.log('💾 Phase 5: Storing chunks in PostgreSQL/RuVector...');
  const phase5Start = Date.now();
  try {
    if (!codeChunkStore) throw new Error('CodeChunkStore not initialized');

    const chunker = new ASTChunker();
    const embedder = new NomicEmbedder();

    // Chunk a sample file
    const sampleFilePath = path.join(process.cwd(), 'src/code-intelligence/embeddings/NomicEmbedder.ts');
    const content = fs.readFileSync(sampleFilePath, 'utf-8');
    const chunkResult = chunker.chunkFile(sampleFilePath, content, 'typescript');

    // Embed and store first 5 chunks
    const chunksToStore = chunkResult.chunks.slice(0, 5);
    let storedCount = 0;

    for (const chunk of chunksToStore) {
      const embedding = await embedder.embed(chunk.content);
      await codeChunkStore.storeChunk({
        id: `e2e-test-${chunk.id}`,
        filePath: chunk.filePath,
        content: chunk.content,
        embedding,
        chunkType: chunk.type,
        name: chunk.name || 'unnamed',
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: 'typescript',
        metadata: { test: true, timestamp: Date.now() },
      });
      storedCount++;
    }

    const stats = await codeChunkStore.getStats();

    results.push({
      phase: 'PostgreSQL Storage',
      success: true,
      duration: Date.now() - phase5Start,
      details: {
        chunksStored: storedCount,
        totalChunksInDB: stats.chunkCount,
        totalEntitiesInDB: stats.entityCount,
      },
    });
    console.log(`   ✅ Stored ${storedCount} chunks, total in DB: ${stats.chunkCount}\n`);
  } catch (error) {
    results.push({
      phase: 'PostgreSQL Storage',
      success: false,
      duration: Date.now() - phase5Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
  }

  // Phase 6: Test vector search
  console.log('🔍 Phase 6: Testing vector search...');
  const phase6Start = Date.now();
  try {
    if (!codeChunkStore) throw new Error('CodeChunkStore not initialized');

    const embedder = new NomicEmbedder();

    // Generate query embedding
    const queryText = 'generate embedding for code';
    const queryEmbedding = await embedder.embed(queryText);

    // Search
    const searchResults = await codeChunkStore.search(queryEmbedding, {
      topK: 5,
      minScore: 0.0,
      includeContent: true,
    });

    results.push({
      phase: 'Vector Search',
      success: searchResults.length > 0,
      duration: Date.now() - phase6Start,
      details: {
        query: queryText,
        resultsFound: searchResults.length,
        topScore: searchResults[0]?.score || 0,
        topResult: searchResults[0]?.name || 'none',
      },
    });

    if (searchResults.length > 0) {
      console.log(`   ✅ Found ${searchResults.length} results for "${queryText}"`);
      console.log(`   ✅ Top result: ${searchResults[0].name} (score: ${searchResults[0].score.toFixed(4)})\n`);
    } else {
      console.log(`   ⚠️  No results found (database may be empty)\n`);
    }
  } catch (error) {
    results.push({
      phase: 'Vector Search',
      success: false,
      duration: Date.now() - phase6Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
  }

  // Phase 7: Test hybrid search
  console.log('🔎 Phase 7: Testing hybrid search (BM25 + Vector)...');
  const phase7Start = Date.now();
  try {
    if (!codeChunkStore) throw new Error('CodeChunkStore not initialized');

    const embedder = new NomicEmbedder();

    const queryText = 'OllamaClient generate embedding';
    const queryEmbedding = await embedder.embed(queryText);

    const hybridResults = await codeChunkStore.hybridSearch(queryEmbedding, queryText, {
      topK: 5,
      semanticWeight: 0.7,
    });

    results.push({
      phase: 'Hybrid Search',
      success: hybridResults.length > 0,
      duration: Date.now() - phase7Start,
      details: {
        query: queryText,
        resultsFound: hybridResults.length,
        topScore: hybridResults[0]?.score || 0,
        topResult: hybridResults[0]?.name || 'none',
      },
    });

    if (hybridResults.length > 0) {
      console.log(`   ✅ Found ${hybridResults.length} hybrid results`);
      console.log(`   ✅ Top result: ${hybridResults[0].name} (hybrid score: ${hybridResults[0].score.toFixed(4)})\n`);
    } else {
      console.log(`   ⚠️  No hybrid results found\n`);
    }
  } catch (error) {
    results.push({
      phase: 'Hybrid Search',
      success: false,
      duration: Date.now() - phase7Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
  }

  // Phase 8: Test graph builder
  console.log('📊 Phase 8: Testing graph builder...');
  const phase8Start = Date.now();
  try {
    const graphBuilder = new GraphBuilder({ rootDir: process.cwd() });

    // Add some test nodes
    const fileNode = graphBuilder.addNode(
      'file',
      'TestFile.ts',
      '/test/TestFile.ts',
      1,
      100,
      'typescript'
    );

    const classNode = graphBuilder.addNode(
      'class',
      'TestClass',
      '/test/TestFile.ts',
      5,
      90,
      'typescript'
    );

    const methodNode = graphBuilder.addNode(
      'method',
      'testMethod',
      '/test/TestFile.ts',
      10,
      30,
      'typescript'
    );

    // Add relationships
    graphBuilder.addEdge(fileNode.id, classNode.id, 'contains', 1.0);
    graphBuilder.addEdge(classNode.id, methodNode.id, 'contains', 1.0);

    const stats = graphBuilder.getStats();

    results.push({
      phase: 'Graph Builder',
      success: stats.nodeCount >= 3 && stats.edgeCount >= 2,
      duration: Date.now() - phase8Start,
      details: {
        nodesCreated: stats.nodeCount,
        edgesCreated: stats.edgeCount,
        nodesByType: stats.nodesByType,
      },
    });
    console.log(`   ✅ Created ${stats.nodeCount} nodes, ${stats.edgeCount} edges\n`);

    graphBuilder.clear();
  } catch (error) {
    results.push({
      phase: 'Graph Builder',
      success: false,
      duration: Date.now() - phase8Start,
      details: {},
      error: (error as Error).message,
    });
    console.error(`   ❌ ${(error as Error).message}\n`);
  }

  // Cleanup
  if (codeChunkStore) {
    await codeChunkStore.close();
  }

  // Print summary
  printSummary(results, startTime);
}

function printSummary(results: E2ETestResult[], startTime: number): void {
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const duration = `${result.duration}ms`.padStart(8);
    const phase = result.phase.padEnd(35);
    console.log(`║ ${status} ${phase} ${duration}  ║`);
  }

  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Total: ${passed} passed, ${failed} failed                             ${totalDuration}ms ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n❌ E2E Test FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ E2E Test PASSED - Code Intelligence System is operational!');
  }
}

// Run the test
runE2ETest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
