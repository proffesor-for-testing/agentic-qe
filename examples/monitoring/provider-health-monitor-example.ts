/**
 * ProviderHealthMonitor Usage Example
 *
 * Demonstrates how to use the ProviderHealthMonitor to track
 * LLM provider health with circuit breaker pattern.
 */

import { ProviderHealthMonitor } from '../../src/monitoring/ProviderHealthMonitor';
import { OllamaProvider } from '../../src/providers/OllamaProvider';

async function main() {
  // Initialize health monitor with custom configuration
  const monitor = new ProviderHealthMonitor({
    checkIntervalMs: 30000,       // Check every 30 seconds
    timeoutMs: 5000,              // 5 second timeout for health checks
    failureThreshold: 3,          // Open circuit after 3 failures
    recoveryTimeMs: 60000,        // Wait 60 seconds before retry
    healthyLatencyThresholdMs: 3000 // Consider unhealthy if latency > 3s
  });

  // Initialize Ollama provider
  const ollamaProvider = new OllamaProvider({
    baseUrl: 'http://localhost:11434',
    defaultModel: 'qwen3-coder:30b'
  });

  try {
    await ollamaProvider.initialize();
  } catch (error) {
    console.error('Failed to initialize Ollama provider:', error);
    return;
  }

  // Register provider with health monitor
  monitor.registerProvider('ollama', async () => {
    return await ollamaProvider.healthCheck();
  });

  // Listen to health change events
  monitor.on('health-change', (data) => {
    console.log(`\n🏥 Health Status Change:`);
    console.log(`  Provider: ${data.providerId}`);
    console.log(`  Status: ${data.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`  Latency: ${data.latency}ms`);
    console.log(`  Error Rate: ${(data.errorRate * 100).toFixed(2)}%`);
    console.log(`  Availability: ${(data.availability * 100).toFixed(2)}%`);
  });

  // Listen to circuit breaker events
  monitor.on('circuit-change', (data) => {
    console.log(`\n⚡ Circuit Breaker State Change:`);
    console.log(`  Provider: ${data.providerId}`);
    console.log(`  Previous State: ${data.previousState}`);
    console.log(`  Current State: ${data.circuitState}`);
    console.log(`  Consecutive Failures: ${data.consecutiveFailures}`);

    if (data.circuitState === 'open') {
      console.log(`  🚨 Circuit OPENED - Provider is temporarily disabled`);
    } else if (data.circuitState === 'half-open') {
      console.log(`  🔄 Circuit HALF-OPEN - Testing recovery...`);
    } else if (data.circuitState === 'closed') {
      console.log(`  ✅ Circuit CLOSED - Provider is operational`);
    }
  });

  // Start automatic monitoring
  monitor.startMonitoring();
  console.log('🚀 Started health monitoring for Ollama provider\n');

  // Perform manual health check
  console.log('📊 Performing manual health check...');
  const result = await monitor.checkProviderHealth('ollama');
  console.log(`  Healthy: ${result.healthy ? '✅' : '❌'}`);
  console.log(`  Latency: ${result.latency}ms`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }

  // Get current health state
  const state = monitor.getProviderHealth('ollama');
  console.log('\n📈 Current Health State:');
  console.log(`  Provider ID: ${state?.providerId}`);
  console.log(`  Healthy: ${state?.healthy ? '✅' : '❌'}`);
  console.log(`  Circuit State: ${state?.circuitState}`);
  console.log(`  Latency: ${state?.latency}ms`);
  console.log(`  Error Rate: ${((state?.errorRate || 0) * 100).toFixed(2)}%`);
  console.log(`  Availability: ${((state?.availability || 0) * 100).toFixed(2)}%`);
  console.log(`  Check Count: ${state?.checkCount}`);
  console.log(`  Success Count: ${state?.successCount}`);
  console.log(`  Consecutive Failures: ${state?.consecutiveFailures}`);

  // Check if provider is healthy
  const isHealthy = monitor.isProviderHealthy('ollama');
  console.log(`\n🔍 Provider Health Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);

  // Get all healthy providers
  const healthyProviders = monitor.getHealthyProviders();
  console.log(`\n💚 Healthy Providers: ${healthyProviders.join(', ') || 'None'}`);

  // Example: Simulate circuit breaker behavior
  console.log('\n🧪 Testing Circuit Breaker...');

  // Manually force circuit open (e.g., for maintenance)
  console.log('  Forcing circuit open for maintenance...');
  monitor.forceCircuitOpen('ollama');
  console.log(`  Circuit State: ${monitor.getCircuitState('ollama')}`);

  // Try health check with open circuit
  const resultWithOpenCircuit = await monitor.checkProviderHealth('ollama');
  console.log(`  Health check result: ${resultWithOpenCircuit.error}`);

  // Reset circuit
  console.log('  Resetting circuit...');
  monitor.resetCircuit('ollama');
  console.log(`  Circuit State: ${monitor.getCircuitState('ollama')}`);

  // Keep running for a bit to see periodic checks
  console.log('\n⏱️  Running for 2 minutes to demonstrate periodic checks...');
  console.log('    (Press Ctrl+C to exit)\n');

  await new Promise(resolve => setTimeout(resolve, 120000));

  // Cleanup
  console.log('\n🧹 Stopping health monitoring...');
  monitor.stopMonitoring();

  await ollamaProvider.shutdown();
  console.log('✅ Shutdown complete');
}

// Run example
main().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});
