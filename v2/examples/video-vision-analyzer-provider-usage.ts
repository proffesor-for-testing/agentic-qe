/**
 * Examples of using video-vision-analyzer with provider abstraction
 *
 * This demonstrates the new provider-based API that replaces direct Anthropic SDK usage.
 */

import { ClaudeProvider } from '../src/providers/ClaudeProvider';
import { RuvllmProvider } from '../src/providers/RuvllmProvider';
import type { ILLMProvider } from '../src/providers/ILLMProvider';
import {
  analyzeVideoWithVision,
  type VideoFrame,
  type VisionOptions,
  type VideoContext
} from '../src/mcp/tools/qe/accessibility/video-vision-analyzer';

// Mock video frames for demonstration
const mockFrames: VideoFrame[] = [
  {
    timestamp: 0,
    dataUrl: 'data:image/jpeg;base64,...'
  },
  {
    timestamp: 5,
    dataUrl: 'data:image/jpeg;base64,...'
  }
];

// Mock video context for fallback
const videoContext: VideoContext = {
  pageTitle: 'My Tutorial Page',
  videoTitle: 'Introduction to Testing',
  videoSrc: 'https://example.com/video.mp4',
  duration: 30,
  nearbyHeadings: ['Software Testing Basics'],
  nearbyText: ['This tutorial covers unit testing, integration testing, and more.']
};

/**
 * Example 1: Using ClaudeProvider with vision capability
 * This is the recommended approach for production use
 */
async function example1_ClaudeProviderWithVision() {
  console.log('\n=== Example 1: ClaudeProvider with Vision ===\n');

  // Initialize Claude provider
  const provider = new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-3-7-sonnet-20250219'
  });

  await provider.initialize();

  // Use provider with video analyzer
  const options: VisionOptions = {
    llmProvider: provider,
    model: 'claude-3-7-sonnet-20250219',
    videoContext // Fallback if vision fails
  };

  try {
    const result = await analyzeVideoWithVision(mockFrames, options);

    console.log('Overall Description:', result.overallDescription);
    console.log('Scene Count:', result.sceneDescriptions.length);
    console.log('WebVTT Preview:', result.webVTT.substring(0, 200) + '...');

    await provider.shutdown();
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

/**
 * Example 2: Automatic fallback when provider lacks vision
 * Local models often don't support vision - this gracefully handles that
 */
async function example2_LocalProviderWithFallback() {
  console.log('\n=== Example 2: Local Provider with Fallback ===\n');

  // Initialize local provider (no vision support)
  const provider = new RuvllmProvider({
    baseUrl: 'http://localhost:8000',
    defaultModel: 'llama-3'
  });

  await provider.initialize();

  // Check if provider supports vision
  const metadata = provider.getMetadata();
  console.log('Provider supports vision:', metadata.capabilities.vision);

  // Use provider - will automatically fall back to context-based captions
  const options: VisionOptions = {
    llmProvider: provider,
    videoContext // REQUIRED for fallback when vision not supported
  };

  try {
    const result = await analyzeVideoWithVision(mockFrames, options);

    console.log('Fallback worked! Generated captions from context.');
    console.log('Overall Description:', result.overallDescription);

    await provider.shutdown();
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

/**
 * Example 3: Provider abstraction with custom model selection
 * Use different models for cost/quality tradeoff
 */
async function example3_CustomModelSelection() {
  console.log('\n=== Example 3: Custom Model Selection ===\n');

  const provider = new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  await provider.initialize();

  // Use cheaper model for quick analysis
  const quickOptions: VisionOptions = {
    llmProvider: provider,
    model: 'claude-3-5-haiku-20241022', // Faster, cheaper
    videoContext
  };

  // Use better model for detailed analysis
  const detailedOptions: VisionOptions = {
    llmProvider: provider,
    model: 'claude-opus-4-20250514', // More detailed, more expensive
    videoContext
  };

  console.log('Quick analysis with Haiku...');
  const quickResult = await analyzeVideoWithVision(mockFrames, quickOptions);
  console.log('Tokens used:', quickResult);

  console.log('\nDetailed analysis with Opus...');
  const detailedResult = await analyzeVideoWithVision(mockFrames, detailedOptions);
  console.log('Tokens used:', detailedResult);

  await provider.shutdown();
}

/**
 * Example 4: Backward compatibility with legacy API
 * Old code still works with deprecation warnings
 */
async function example4_BackwardCompatibility() {
  console.log('\n=== Example 4: Backward Compatibility ===\n');

  // Legacy API: Direct Anthropic (deprecated but still works)
  const legacyOptions: VisionOptions = {
    provider: 'anthropic',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    videoContext
  };

  console.log('Using legacy API (will show deprecation warning)...');
  const result = await analyzeVideoWithVision(mockFrames, legacyOptions);

  console.log('Legacy API still works!');
  console.log('Scene Count:', result.sceneDescriptions.length);
}

/**
 * Example 5: Error handling and graceful degradation
 * Shows how to handle various failure scenarios
 */
async function example5_ErrorHandlingAndGracefulDegradation() {
  console.log('\n=== Example 5: Error Handling and Graceful Degradation ===\n');

  const provider = new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  await provider.initialize();

  // Scenario 1: Provider with vision but API fails
  const optionsWithFallback: VisionOptions = {
    llmProvider: provider,
    videoContext // Will use this if API fails
  };

  try {
    const result = await analyzeVideoWithVision(mockFrames, optionsWithFallback);
    console.log('Success or graceful fallback:', result.sceneDescriptions.length, 'scenes');
  } catch (error) {
    console.log('Complete failure (no fallback available)');
  }

  // Scenario 2: Provider without vision and no context
  const localProvider = new RuvllmProvider({
    baseUrl: 'http://localhost:8000'
  });

  await localProvider.initialize();

  const optionsWithoutFallback: VisionOptions = {
    llmProvider: localProvider
    // No videoContext - will throw error
  };

  try {
    await analyzeVideoWithVision(mockFrames, optionsWithoutFallback);
  } catch (error) {
    console.log('Expected error:', (error as Error).message);
  }

  await provider.shutdown();
  await localProvider.shutdown();
}

/**
 * Example 6: Factory pattern for provider creation
 * Clean dependency injection pattern
 */
async function example6_FactoryPatternWithDI() {
  console.log('\n=== Example 6: Factory Pattern with DI ===\n');

  // Factory function to create vision provider based on environment
  async function createVisionProvider(): Promise<ILLMProvider> {
    if (process.env.ANTHROPIC_API_KEY) {
      const provider = new ClaudeProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
        defaultModel: 'claude-3-7-sonnet-20250219'
      });
      await provider.initialize();
      return provider;
    }

    throw new Error('No vision provider available. Set ANTHROPIC_API_KEY.');
  }

  // Use factory
  const provider = await createVisionProvider();

  const options: VisionOptions = {
    llmProvider: provider,
    videoContext
  };

  const result = await analyzeVideoWithVision(mockFrames, options);
  console.log('Injected provider analysis complete:', result.sceneDescriptions.length, 'scenes');

  await provider.shutdown();
}

/**
 * Example 7: Cost tracking with provider abstraction
 * Monitor costs across multiple vision analysis calls
 */
async function example7_CostTracking() {
  console.log('\n=== Example 7: Cost Tracking ===\n');

  const provider = new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-3-7-sonnet-20250219'
  });

  await provider.initialize();

  // Track costs
  let totalCost = 0;

  for (let i = 0; i < 3; i++) {
    const options: VisionOptions = {
      llmProvider: provider,
      videoContext
    };

    const result = await analyzeVideoWithVision(mockFrames, options);

    // Cost tracking is built into the provider
    const cost = provider.getTotalCost();
    console.log(`Analysis ${i + 1}: $${cost.toFixed(6)}`);
    totalCost = cost;
  }

  console.log(`\nTotal cost for all analyses: $${totalCost.toFixed(6)}`);

  await provider.shutdown();
}

// Run examples
async function main() {
  console.log('Video Vision Analyzer - Provider Abstraction Examples\n');
  console.log('='.repeat(60));

  try {
    await example1_ClaudeProviderWithVision();
    await example2_LocalProviderWithFallback();
    await example3_CustomModelSelection();
    await example4_BackwardCompatibility();
    await example5_ErrorHandlingAndGracefulDegradation();
    await example6_FactoryPatternWithDI();
    await example7_CostTracking();

    console.log('\n' + '='.repeat(60));
    console.log('All examples completed successfully!');
  } catch (error) {
    console.error('Example execution failed:', error);
    process.exit(1);
  }
}

// Uncomment to run examples:
// main();

export {
  example1_ClaudeProviderWithVision,
  example2_LocalProviderWithFallback,
  example3_CustomModelSelection,
  example4_BackwardCompatibility,
  example5_ErrorHandlingAndGracefulDegradation,
  example6_FactoryPatternWithDI,
  example7_CostTracking
};
