/**
 * QuotaManager Usage Examples
 *
 * Demonstrates how to use QuotaManager for tracking and enforcing
 * free tier quotas across LLM providers.
 */

import { createQuotaManager, QuotaManager, QuotaManagerConfig } from '../src/monitoring/QuotaManager';

// Example 1: Using the factory with default providers
console.log('=== Example 1: Default Provider Configuration ===');

const manager = createQuotaManager({
  enforcementMode: 'warn',
  alertCallback: (status) => {
    console.log(`Alert for ${status.providerId}:`);
    console.log(`  - Warning level: ${status.warningLevel}`);
    console.log(`  - Usage: ${status.dailyUsed}/${status.dailyLimit} (${status.percentageUsed.toFixed(2)}%)`);
    console.log(`  - Remaining: ${status.dailyRemaining} requests`);
  }
});

// Record some requests
manager.recordRequests('groq', 100);
manager.recordRequest('openrouter');

// Check status
const groqStatus = manager.getQuotaStatus('groq');
console.log(`Groq quota: ${groqStatus?.dailyUsed}/${groqStatus?.dailyLimit}`);
console.log(`Minute usage: ${groqStatus?.minuteUsed}/${groqStatus?.minuteLimit}`);

// Example 2: Custom provider configuration
console.log('\n=== Example 2: Custom Provider Configuration ===');

const customConfig: QuotaManagerConfig = {
  providers: [
    {
      providerId: 'custom-llm',
      dailyLimit: 1000,
      minuteLimit: 5,
      resetTimeUtc: '00:00',
      warningThresholds: [70, 85, 95]
    }
  ],
  enforcementMode: 'block', // Block requests when quota exceeded
  alertCallback: (status) => {
    if (status.warningLevel === 'critical') {
      console.error(`CRITICAL: ${status.providerId} at ${status.percentageUsed.toFixed(1)}%`);
    }
  }
};

const customManager = new QuotaManager(customConfig);

// Test quota enforcement
for (let i = 0; i < 1100; i++) {
  if (customManager.canMakeRequest('custom-llm')) {
    customManager.recordRequest('custom-llm');
  } else {
    console.log(`Request ${i + 1} blocked - quota exhausted`);
    break;
  }
}

// Example 3: Auto-reset scheduling
console.log('\n=== Example 3: Auto-Reset Scheduling ===');

const autoResetManager = createQuotaManager({
  enforcementMode: 'warn'
});

// Listen for reset events
autoResetManager.on('quota-reset', (status) => {
  console.log(`Quota reset for ${status.providerId} at ${new Date().toISOString()}`);
});

// Start auto-reset (resets at midnight UTC)
autoResetManager.startAutoReset();

// Record requests
autoResetManager.recordRequests('groq', 1000);

// Check remaining quota
const remaining = autoResetManager.getRemainingQuota('groq');
console.log(`Remaining quota - Daily: ${remaining.daily}, Minute: ${remaining.minute}`);

// Later, stop auto-reset
// autoResetManager.stopAutoReset();

// Example 4: Multiple provider tracking
console.log('\n=== Example 4: Multiple Provider Tracking ===');

const multiManager = createQuotaManager();

// Simulate requests to different providers
multiManager.recordRequests('groq', 500);
multiManager.recordRequests('openrouter', 25);
multiManager.recordRequests('ollama', 10000); // Unlimited

// Get all statuses
const allStatuses = multiManager.getAllQuotaStatus();
console.log('\nAll Provider Statuses:');
allStatuses.forEach((status, providerId) => {
  console.log(`${providerId}:`);
  console.log(`  Daily: ${status.dailyUsed}/${status.dailyLimit === Infinity ? '∞' : status.dailyLimit}`);
  console.log(`  Warning: ${status.warningLevel}`);
  console.log(`  Exhausted: ${status.isExhausted}`);
});

// Example 5: Warning threshold events
console.log('\n=== Example 5: Warning Threshold Events ===');

const warningManager = createQuotaManager();

// Listen for warning events
warningManager.on('quota-warning', (status) => {
  console.log(`⚠️  Warning threshold crossed for ${status.providerId}`);
  console.log(`   Current usage: ${status.percentageUsed.toFixed(1)}%`);
});

// Listen for exhaustion events
warningManager.on('quota-exhausted', (status) => {
  console.log(`🚨 Quota exhausted for ${status.providerId}`);
  console.log(`   Next reset: ${status.nextResetTime.toISOString()}`);
});

// Trigger warnings by using quota
warningManager.recordRequests('openrouter', 40); // 80% warning
warningManager.recordRequests('openrouter', 5);  // 90% warning
warningManager.recordRequests('openrouter', 5);  // Exhausted

// Example 6: Dynamic provider registration
console.log('\n=== Example 6: Dynamic Provider Registration ===');

const dynamicManager = createQuotaManager({ providers: [] });

// Register providers dynamically
dynamicManager.registerProvider({
  providerId: 'new-provider',
  dailyLimit: 500,
  minuteLimit: 10,
  resetTimeUtc: '00:00',
  warningThresholds: [80, 90]
});

// Update quota for existing provider
dynamicManager.updateQuota('new-provider', {
  dailyLimit: 1000, // Increased limit
  minuteLimit: 20
});

const newProviderStatus = dynamicManager.getQuotaStatus('new-provider');
console.log(`New provider quota: ${newProviderStatus?.dailyLimit}`);

// Example 7: Manual quota reset
console.log('\n=== Example 7: Manual Quota Reset ===');

const resetManager = createQuotaManager();

// Use some quota
resetManager.recordRequests('groq', 1000);
console.log(`Before reset: ${resetManager.getQuotaStatus('groq')?.dailyUsed} used`);

// Manual reset
resetManager.resetDailyQuota('groq');
console.log(`After reset: ${resetManager.getQuotaStatus('groq')?.dailyUsed} used`);

// Reset all providers
resetManager.resetAllDailyQuotas();
console.log('All quotas reset');

console.log('\n=== Examples Complete ===');

// Cleanup
manager.stopAutoReset();
autoResetManager.stopAutoReset();
warningManager.stopAutoReset();
resetManager.stopAutoReset();
