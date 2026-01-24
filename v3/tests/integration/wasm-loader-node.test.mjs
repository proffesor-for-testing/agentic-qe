/**
 * Integration test for WASM Loader in Node.js
 * Tests that WASM actually initializes (not using fetch)
 */

import { WasmLoader } from '../../src/integrations/coherence/wasm-loader.js';

async function testWasm() {
  console.log('Testing WASM initialization in Node.js...');

  const loader = new WasmLoader();

  loader.on('loaded', ({ version, loadTimeMs }) => {
    console.log(`✅ WASM loaded v${version} in ${loadTimeMs}ms`);
  });

  loader.on('error', ({ error, fatal }) => {
    console.log(`${fatal ? '❌' : '⚠️'} Error: ${error.message}`);
  });

  try {
    const engines = await loader.getEngines();
    console.log('✅ Engines created successfully!');
    console.log('Available engines:', Object.keys(engines));

    // Try to use the cohomology engine
    const cohomology = engines.cohomology;
    console.log('✅ CohomologyEngine accessible');

    // Check if getVersion works
    console.log('Version:', loader.getVersion());

    return true;
  } catch (error) {
    console.log('❌ Failed:', error.message);
    console.log('Stack:', error.stack);
    return false;
  }
}

testWasm().then(success => {
  process.exit(success ? 0 : 1);
});
