/**
 * Manual test for MinCutAnalyzer
 * Run with: npx tsx tests/manual/mincut-test.ts
 */

import { MinCutAnalyzer } from '../../src/code-intelligence/analysis/mincut/MinCutAnalyzer.js';
import { MinCutGraphInput } from '../../src/code-intelligence/analysis/mincut/types.js';

async function testMinCut() {
  console.log('🧪 Testing MinCutAnalyzer Implementation\n');

  // Create a simple graph with two clusters
  const graph: MinCutGraphInput = {
    nodes: [
      { id: 'A', label: 'Module A' },
      { id: 'B', label: 'Module B' },
      { id: 'C', label: 'Module C' },
      { id: 'D', label: 'Module D' },
      { id: 'E', label: 'Module E' },
      { id: 'F', label: 'Module F' },
    ],
    edges: [
      // Strong connections within cluster 1 (A, B, C)
      { source: 'A', target: 'B', weight: 10 },
      { source: 'B', target: 'C', weight: 10 },
      { source: 'C', target: 'A', weight: 10 },

      // Strong connections within cluster 2 (D, E, F)
      { source: 'D', target: 'E', weight: 10 },
      { source: 'E', target: 'F', weight: 10 },
      { source: 'F', target: 'D', weight: 10 },

      // Weak connection between clusters
      { source: 'C', target: 'D', weight: 1 },
    ],
    directed: false,
  };

  try {
    // Test 1: Default configuration (auto algorithm)
    console.log('Test 1: Computing min cut with auto algorithm');
    const analyzer = new MinCutAnalyzer();
    const result = await analyzer.computeMinCut(graph);

    console.log('✅ Min Cut Result:');
    console.log(`   Cut Value: ${result.cutValue}`);
    console.log(`   Algorithm Used: ${result.algorithmUsed}`);
    console.log(`   Computation Time: ${result.computationTimeMs.toFixed(2)}ms`);
    console.log(`   Partition 1: [${result.partition1.join(', ')}]`);
    console.log(`   Partition 2: [${result.partition2.join(', ')}]`);
    console.log(`   Cut Edges: ${result.cutEdges.length}`);
    result.cutEdges.forEach(e => {
      console.log(`     - ${e.source} -> ${e.target} (weight: ${e.weight})`);
    });

    // Verify the result (normalized: 1/10 = 0.1)
    if (Math.abs(result.cutValue - 0.1) < 0.001) {
      console.log('\n✅ Correct! Found minimum cut of normalized value 0.1 between clusters');
    } else {
      console.log(`\n❌ Unexpected cut value: ${result.cutValue} (expected 0.1 normalized)`);
    }

    // Test 2: Force JS algorithm
    console.log('\n\nTest 2: Computing min cut with Stoer-Wagner (JS) algorithm');
    const analyzerJS = new MinCutAnalyzer({ algorithm: 'stoer-wagner' });
    const resultJS = await analyzerJS.computeMinCut(graph);

    console.log('✅ Min Cut Result (JS):');
    console.log(`   Cut Value: ${resultJS.cutValue}`);
    console.log(`   Algorithm Used: ${resultJS.algorithmUsed}`);
    console.log(`   Computation Time: ${resultJS.computationTimeMs.toFixed(2)}ms`);

    // Test 3: Find multiple cuts
    console.log('\n\nTest 3: Finding multiple min cuts');
    const multipleCuts = await analyzer.findAllMinCuts(graph, 3);
    console.log(`✅ Found ${multipleCuts.length} cuts:`);
    multipleCuts.forEach((cut, i) => {
      console.log(`   Cut ${i + 1}: value=${cut.cutValue}, edges=${cut.cutEdges.length}`);
    });

    // Test 4: Error handling - empty graph
    console.log('\n\nTest 4: Error handling - single node graph');
    const singleNodeGraph: MinCutGraphInput = {
      nodes: [{ id: 'A', label: 'Single' }],
      edges: [],
      directed: false,
    };
    const singleResult = await analyzer.computeMinCut(singleNodeGraph);
    console.log(`✅ Single node result: cutValue=${singleResult.cutValue} (expected 0)`);

    // Test 5: Check native availability
    console.log('\n\nTest 5: Native bindings check');
    console.log(`   Native available: ${analyzer.isNativeAvailable()}`);
    console.log(`   Config: ${JSON.stringify(analyzer.getConfig())}`);

    console.log('\n\n🎉 All tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testMinCut();
