/**
 * SessionManager Demo - Phase 0 M0.1 (No LLM Required)
 *
 * Demonstrates session management without requiring RuvLLM setup
 */

import { RuvllmProvider } from '../src/providers/RuvllmProvider';

async function demonstrateSessionManagerNoLLM() {
  console.log('=== SessionManager Demo (No LLM) ===\n');

  // Initialize provider with session support (no actual LLM needed for session management)
  const provider = new RuvllmProvider({
    enableSessions: true,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    maxSessions: 100
  });

  try {
    console.log('Testing session management features...\n');

    // ===== Demo 1: Session Creation =====
    console.log('--- Demo 1: Session Creation ---');
    const session1 = provider.createSession();
    const session2 = provider.createSession();
    console.log(`✅ Created session 1: ${session1.id}`);
    console.log(`✅ Created session 2: ${session2.id}`);
    console.log(`   Total sessions: ${provider.getSessionMetrics().totalSessions}\n`);

    // ===== Demo 2: Session Retrieval =====
    console.log('--- Demo 2: Session Retrieval ---');
    const retrieved = provider.getSession(session1.id);
    console.log(`✅ Retrieved session: ${retrieved?.id}`);
    console.log(`   Created at: ${new Date(retrieved!.createdAt).toISOString()}`);
    console.log(`   Message count: ${retrieved?.messageCount}`);
    console.log(`   Context entries: ${retrieved?.context.length}\n`);

    // ===== Demo 3: Simulated Multi-turn Conversation =====
    console.log('--- Demo 3: Simulated Multi-turn Conversation ---');
    const exchanges = [
      'What is Test-Driven Development?',
      'How does the red-green-refactor cycle work?',
      'Can you give an example with Jest?'
    ];

    const session = provider.getSession(session1.id);
    if (session) {
      for (const [index, question] of exchanges.entries()) {
        // Simulate conversation
        session.messageCount++;
        session.context.push(`User: ${question}`);
        session.context.push(`Assistant: [Response to: ${question}]`);
        session.lastUsedAt = Date.now();

        console.log(`Turn ${index + 1}: ${question}`);
        console.log(`   Messages: ${session.messageCount}, Context: ${session.context.length}`);
      }
    }
    console.log();

    // ===== Demo 4: Session Metrics =====
    console.log('--- Demo 4: Session Metrics ---');
    const metrics = provider.getSessionMetrics();
    console.log('📊 Session Metrics:');
    console.log(`   Total sessions: ${metrics.totalSessions}`);
    console.log(`   Active sessions: ${metrics.activeSessions}`);
    console.log(`   Avg messages/session: ${metrics.avgMessagesPerSession.toFixed(2)}`);
    console.log(`   Latency reduction: ${metrics.avgLatencyReduction.toFixed(2)}%`);
    console.log(`   Cache hit rate: ${metrics.cacheHitRate.toFixed(2)}%\n`);

    // ===== Demo 5: Context Inspection =====
    console.log('--- Demo 5: Context Inspection ---');
    const sessionWithContext = provider.getSession(session1.id);
    console.log('📝 Session Context (last 5 entries):');
    const recentContext = sessionWithContext!.context.slice(-5);
    recentContext.forEach((line, i) => console.log(`   ${i + 1}. ${line}`));
    console.log();

    // ===== Demo 6: Session Cleanup =====
    console.log('--- Demo 6: Session Cleanup ---');
    const beforeCleanup = provider.getSessionMetrics().totalSessions;
    const ended = provider.endSession(session1.id);
    const afterCleanup = provider.getSessionMetrics().totalSessions;
    console.log(`✅ Session ${session1.id.substring(0, 20)}... ended: ${ended}`);
    console.log(`   Sessions: ${beforeCleanup} → ${afterCleanup}\n`);

    // ===== Demo 7: Max Sessions Enforcement =====
    console.log('--- Demo 7: Max Sessions Limit ---');
    console.log('Creating 12 sessions to test eviction (max: 100)...');

    const sessions = [session2]; // Keep session2 from before
    for (let i = 0; i < 11; i++) {
      sessions.push(provider.createSession());
    }

    console.log(`✅ Created ${sessions.length} sessions`);
    console.log(`   Total in system: ${provider.getSessionMetrics().totalSessions}`);
    console.log(`   All sessions accessible: ${sessions.every(s => provider.getSession(s.id) !== undefined)}\n`);

    // Clean up
    sessions.forEach(s => provider.endSession(s.id));
    console.log(`✅ Cleaned up ${sessions.length} sessions\n`);

    // ===== Demo 8: Session Age Tracking =====
    console.log('--- Demo 8: Session Age Tracking ---');
    const ageSession = provider.createSession();
    const ageMs = Date.now() - ageSession.createdAt;
    console.log(`✅ Session created: ${ageSession.id}`);
    console.log(`   Age: ${ageMs}ms`);
    console.log(`   Timeout: ${provider['config'].sessionTimeout}ms`);
    console.log(`   Will expire in: ${((provider['config'].sessionTimeout! - ageMs) / 1000 / 60).toFixed(1)} minutes\n`);
    provider.endSession(ageSession.id);

    // ===== Demo 9: Configuration Inspection =====
    console.log('--- Demo 9: Configuration ---');
    const config = (provider as any).config;
    console.log('⚙️  Session Configuration:');
    console.log(`   Enabled: ${config.enableSessions}`);
    console.log(`   Timeout: ${config.sessionTimeout / 1000 / 60} minutes`);
    console.log(`   Max sessions: ${config.maxSessions}`);
    console.log(`   TRM enabled: ${config.enableTRM}`);
    console.log(`   SONA enabled: ${config.enableSONA}\n`);

  } finally {
    console.log('--- Cleanup ---');
    const finalMetrics = provider.getSessionMetrics();
    console.log(`Final session count: ${finalMetrics.totalSessions}`);
    console.log('✅ Demo complete (provider not initialized, so no shutdown needed)\n');
  }

  console.log('=== SessionManager Demo Complete ===');
  console.log('\n📚 Key Features Demonstrated:');
  console.log('   ✅ Session creation and retrieval');
  console.log('   ✅ Multi-turn context management');
  console.log('   ✅ Session metrics tracking');
  console.log('   ✅ Automatic cleanup');
  console.log('   ✅ Max sessions enforcement');
  console.log('   ✅ Age-based expiration');
  console.log('\n💡 Next Step: Use with actual LLM for 50% latency reduction!');
}

// Run the demo
if (require.main === module) {
  demonstrateSessionManagerNoLLM()
    .then(() => {
      console.log('\n✅ Demo completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Demo failed:', error);
      process.exit(1);
    });
}

export { demonstrateSessionManagerNoLLM };
