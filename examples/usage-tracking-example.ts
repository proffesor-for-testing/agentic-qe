/**
 * Usage Tracking and Caching Example
 * Demonstrates the new usage tracking and frequency-based preloading features
 *
 * Issue #115 Phase 3 Track I Implementation
 */

import { getToolLoader } from '../src/mcp/lazy-loader.js';

// Get the singleton loader instance
const loader = getToolLoader();

console.log('=== Usage Tracking and Caching Demo ===\n');

// 1. Simulate tool usage patterns
console.log('1. Simulating tool usage...');
loader.trackToolUsage('mcp__agentic_qe__test_generate_enhanced');
loader.trackToolUsage('mcp__agentic_qe__test_execute');
loader.trackToolUsage('mcp__agentic_qe__coverage_analyze_stream');
loader.trackToolUsage('mcp__agentic_qe__coverage_detect_gaps_ml');
loader.trackToolUsage('mcp__agentic_qe__coverage_recommend_tests');
loader.trackToolUsage('mcp__agentic_qe__test_generate_enhanced'); // Used again
loader.trackToolUsage('mcp__agentic_qe__coverage_analyze_stream'); // Used again
loader.trackToolUsage('mcp__agentic_qe__qe_qualitygate_evaluate');
loader.trackToolUsage('mcp__agentic_qe__qe_code_quality_complexity');

// 2. Load some domains to track domain usage
console.log('\n2. Loading domains...');
loader.loadDomain('coverage');
loader.loadDomain('quality');
loader.loadDomain('coverage'); // Load again (should show already loaded)

// 3. Simulate more tool usage
console.log('\n3. Simulating more tool usage...');
loader.trackToolUsage('mcp__agentic_qe__coverage_analyze_stream'); // Coverage tool
loader.trackToolUsage('mcp__agentic_qe__coverage_detect_gaps_ml'); // Coverage tool
loader.trackToolUsage('mcp__agentic_qe__qe_qualitygate_evaluate'); // Quality tool
loader.trackToolUsage('mcp__agentic_qe__performance_run_benchmark');

// 4. Get top tools usage statistics
console.log('\n4. Top 5 Most Used Tools:');
const topTools = loader.getTopTools(5);
topTools.forEach((stat, index) => {
  console.log(`   ${index + 1}. ${stat.toolName}`);
  console.log(`      - Call count: ${stat.callCount}`);
  console.log(`      - Domain: ${stat.domain || 'unknown'}`);
  console.log(`      - Last used: ${new Date(stat.lastUsed).toLocaleString()}`);
});

// 5. Get domain usage statistics
console.log('\n5. Domain Usage Statistics:');
const domainStats = loader.getDomainUsageStats();
domainStats.forEach((stat) => {
  console.log(`   ${stat.domain}:`);
  console.log(`      - Load count: ${stat.loadCount}`);
  console.log(`      - Tool usage count: ${stat.toolUsageCount}`);
  console.log(`      - Average tools per load: ${stat.averageToolsPerLoad.toFixed(2)}`);
  console.log(`      - Last loaded: ${new Date(stat.lastLoaded).toLocaleString()}`);
});

// 6. Demonstrate preloading frequent domains
console.log('\n6. Preloading frequently used domains (threshold: 2)...');
const preloadResults = loader.preloadFrequentDomains(2);
preloadResults.forEach((result) => {
  console.log(`   - Loaded ${result.domain}: ${result.toolsLoaded.length} tools`);
});

// 7. Export usage statistics
console.log('\n7. Exporting usage statistics...');
const exportedStats = loader.exportUsageStats();
console.log(`   - Exported ${exportedStats.toolStats.length} tool stats`);
console.log(`   - Exported ${exportedStats.domainStats.length} domain stats`);
console.log(`   - Export timestamp: ${new Date(exportedStats.exportedAt).toLocaleString()}`);

// 8. Show current loader state
console.log('\n8. Current Loader State:');
const stats = loader.getStats();
console.log(`   - Core tools: ${stats.coreTools}`);
console.log(`   - Loaded domains: ${stats.loadedDomains.join(', ')}`);
console.log(`   - Available domains: ${stats.availableDomains.join(', ')}`);
console.log(`   - Total loaded: ${stats.totalLoaded}`);
console.log(`   - Total available: ${stats.totalAvailable}`);

// 9. Demonstrate import/export cycle
console.log('\n9. Testing import/export cycle...');
const savedStats = loader.exportUsageStats();
loader.clearUsageStats();
console.log('   - Cleared all usage stats');

const emptyStats = loader.getToolUsageStats();
console.log(`   - Tool stats after clear: ${emptyStats.length}`);

loader.importUsageStats(savedStats);
const restoredStats = loader.getToolUsageStats();
console.log(`   - Tool stats after import: ${restoredStats.length}`);

// 10. Show tracking state
console.log('\n10. Usage Tracking State:');
console.log(`   - Tracking enabled: ${loader.isUsageTrackingEnabled()}`);

// Disable and re-enable tracking
loader.setUsageTracking(false);
console.log(`   - After disable: ${loader.isUsageTrackingEnabled()}`);

loader.setUsageTracking(true);
console.log(`   - After enable: ${loader.isUsageTrackingEnabled()}`);

console.log('\n=== Demo Complete ===');
