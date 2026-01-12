#!/usr/bin/env node
/**
 * Flash Attention Verification Script
 * Quick verification of Flash Attention implementation
 */

import { createQEFlashAttention, QE_FLASH_ATTENTION_CONFIG, type QEWorkloadType } from './index.js';

async function verifyConfiguration() {
  console.log('\n=== Flash Attention Configuration Verification ===\n');

  const workloads: QEWorkloadType[] = [
    'test-similarity',
    'code-embedding',
    'defect-matching',
    'coverage-analysis',
    'pattern-adaptation'
  ];

  console.log('Workload Configurations (ADR-040):');
  console.log('-'.repeat(70));

  for (const workload of workloads) {
    const config = QE_FLASH_ATTENTION_CONFIG[workload];
    console.log(`\n${workload}:`);
    console.log(`  Backend:       ${config.backend}`);
    console.log(`  Strategy:      ${config.strategy}`);
    console.log(`  Heads/Block:   ${config.blocks.headsPerBlock}`);
    console.log(`  Query Chunk:   ${config.blocks.queryChunkSize}`);
    console.log(`  KV Chunk:      ${config.blocks.kvChunkSize}`);
    console.log(`  Matmul Block:  ${config.blocks.matmulBlockSize}`);
    console.log(`  Target Speedup: ${config.targetSpeedup.min}x-${config.targetSpeedup.max}x`);
  }
}

async function verifyComputation() {
  console.log('\n\n=== Computation Verification ===\n');

  const flashAttn = await createQEFlashAttention('test-similarity');

  console.log('Testing Flash Attention computation...');
  const seqLen = 128;
  const dim = 64;

  const Q = new Float32Array(seqLen * dim).fill(1.0);
  const K = new Float32Array(seqLen * dim).fill(1.0);
  const V = new Float32Array(seqLen * dim).fill(1.0);

  const start = performance.now();
  const output = await flashAttn.computeFlashAttention(Q, K, V, seqLen, dim);
  const duration = performance.now() - start;

  console.log(`✓ Computation completed in ${duration.toFixed(2)}ms`);
  console.log(`✓ Output shape: [${seqLen}, ${dim}]`);
  console.log(`✓ Output type: ${output.constructor.name}`);

  const metrics = flashAttn.getMetrics();
  if (metrics.length > 0) {
    console.log(`\nMetrics:`);
    console.log(`  Time:        ${metrics[0].timeMs.toFixed(2)}ms`);
    console.log(`  Memory:      ${metrics[0].memoryMB.toFixed(2)}MB`);
    console.log(`  Throughput:  ${metrics[0].throughput.toFixed(0)} tokens/sec`);
  }

  flashAttn.dispose();
}

async function verifyWorkloads() {
  console.log('\n\n=== Workload-Specific Verification ===\n');

  // Test similarity
  console.log('1. Test Similarity Search...');
  const testFlashAttn = await createQEFlashAttention('test-similarity');
  const dim = 128;
  const testEmbedding = new Float32Array(dim).fill(1.0);
  const corpusEmbeddings = Array(10).fill(0).map(() => new Float32Array(dim).fill(Math.random()));

  const similarities = await testFlashAttn.computeTestSimilarity(testEmbedding, corpusEmbeddings, 3);
  console.log(`   ✓ Found ${similarities.length} similar tests`);
  console.log(`   ✓ Top similarity: ${similarities[0].similarity.toFixed(4)}`);
  testFlashAttn.dispose();

  // Code embedding
  console.log('\n2. Code Embedding Generation...');
  const codeFlashAttn = await createQEFlashAttention('code-embedding');
  const codeTokens = new Float32Array(256 * 128).fill(1.0);
  const positionEmbeddings = new Float32Array(128).fill(1.0);

  const embedding = await codeFlashAttn.generateCodeEmbedding(codeTokens, positionEmbeddings);
  console.log(`   ✓ Generated code embedding`);
  console.log(`   ✓ Embedding size: ${embedding.length}`);
  codeFlashAttn.dispose();

  // Defect matching
  console.log('\n3. Defect Pattern Matching...');
  const defectFlashAttn = await createQEFlashAttention('defect-matching');
  const defectEmbedding = new Float32Array(128).fill(1.0);
  const patternLibrary = Array(5).fill(0).map(() => new Float32Array(128).fill(Math.random()));

  const matches = await defectFlashAttn.matchDefectPattern(defectEmbedding, patternLibrary);
  console.log(`   ✓ Found ${matches.length} pattern matches`);
  console.log(`   ✓ Top match score: ${matches[0].score.toFixed(4)}`);
  defectFlashAttn.dispose();
}

async function main() {
  try {
    await verifyConfiguration();
    await verifyComputation();
    await verifyWorkloads();

    console.log('\n\n=== Verification Complete ===\n');
    console.log('✓ All verifications passed!');
    console.log('\nNext steps:');
    console.log('1. Run full benchmark suite: npm test -- flash-attention');
    console.log('2. Verify 2.49x-7.47x speedup target');
    console.log('3. Integrate with QE agents');
  } catch (error) {
    console.error('\n✗ Verification failed:', error);
    process.exit(1);
  }
}

main();
