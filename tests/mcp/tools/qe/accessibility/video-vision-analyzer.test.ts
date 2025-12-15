/**
 * Tests for video-vision-analyzer with provider abstraction
 *
 * Verifies:
 * - Provider abstraction works correctly
 * - Vision capability detection
 * - Fallback to context-based captions when vision not supported
 * - Backward compatibility with legacy API
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { ILLMProvider, LLMCompletionResponse, LLMProviderMetadata } from '../../../../../src/providers/ILLMProvider';
import {
  analyzeVideoWithVision,
  type VideoFrame,
  type VisionOptions,
  type VideoContext
} from '../../../../../src/mcp/tools/qe/accessibility/video-vision-analyzer';

// Mock video frames
const mockFrames: VideoFrame[] = [
  {
    timestamp: 0,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQ='
  },
  {
    timestamp: 5,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQ='
  }
];

// Mock video context
const mockVideoContext: VideoContext = {
  pageTitle: 'Test Page',
  videoTitle: 'Test Video Tutorial',
  videoSrc: 'https://example.com/video.mp4',
  duration: 30,
  nearbyHeadings: ['Introduction to Testing'],
  nearbyText: ['This video covers the basics of software testing']
};

describe('Video Vision Analyzer - Provider Abstraction', () => {
  describe('ILLMProvider Integration', () => {
    it('should use vision-capable provider successfully', async () => {
      // Create mock vision-capable provider
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Frame description for accessibility' }],
          usage: { input_tokens: 100, output_tokens: 50 },
          model: 'claude-3-7-sonnet-20250219',
          stop_reason: 'end_turn',
          id: 'msg_123'
        } as LLMCompletionResponse),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn().mockResolvedValue(100),
        healthCheck: jest.fn().mockResolvedValue({ healthy: true, timestamp: new Date() }),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-3-7-sonnet-20250219'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true // Vision supported
          },
          costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn().mockResolvedValue(undefined),
        trackCost: jest.fn().mockReturnValue(0.001)
      };

      const options: VisionOptions = {
        provider: 'provider',
        llmProvider: mockProvider,
        model: 'claude-3-7-sonnet-20250219'
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result).toBeDefined();
      expect(result.sceneDescriptions).toHaveLength(2);
      expect(result.overallDescription).toBeDefined();
      expect(result.webVTT).toContain('WEBVTT');
      expect(mockProvider.complete).toHaveBeenCalled();
      expect(mockProvider.getMetadata).toHaveBeenCalled();
    });

    it('should detect and reject non-vision provider without context', async () => {
      // Create mock non-vision provider
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn(),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'ruvllm',
          version: '1.0.0',
          models: ['llama-3'],
          capabilities: {
            streaming: true,
            caching: false,
            embeddings: true,
            vision: false // No vision support
          },
          costs: { inputPerMillion: 0, outputPerMillion: 0 },
          location: 'local'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider
      };

      await expect(analyzeVideoWithVision(mockFrames, options)).rejects.toThrow(
        /does not support vision capabilities/
      );

      expect(mockProvider.getMetadata).toHaveBeenCalled();
      expect(mockProvider.complete).not.toHaveBeenCalled();
    });

    it('should fallback to context-based captions when provider lacks vision', async () => {
      // Create mock non-vision provider
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn(),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'ruvllm',
          version: '1.0.0',
          models: ['llama-3'],
          capabilities: {
            streaming: true,
            caching: false,
            embeddings: true,
            vision: false
          },
          costs: { inputPerMillion: 0, outputPerMillion: 0 },
          location: 'local'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider,
        videoContext: mockVideoContext
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result).toBeDefined();
      expect(result.sceneDescriptions).toHaveLength(2);
      expect(result.overallDescription).toContain('Test Video Tutorial');
      expect(mockProvider.complete).not.toHaveBeenCalled(); // Should not call vision API
    });

    it('should fallback to context when vision provider fails', async () => {
      // Create mock provider that fails
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockRejectedValue(new Error('API rate limit exceeded')),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-3-7-sonnet-20250219'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true
          },
          costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider,
        videoContext: mockVideoContext
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result).toBeDefined();
      expect(result.sceneDescriptions).toHaveLength(2);
      expect(result.overallDescription).toContain('Test Video Tutorial');
      expect(mockProvider.complete).toHaveBeenCalled(); // Attempted vision
    });

    it('should require llmProvider when using provider mode', async () => {
      const options: VisionOptions = {
        provider: 'provider'
        // Missing llmProvider
      };

      await expect(analyzeVideoWithVision(mockFrames, options)).rejects.toThrow(
        /llmProvider option is required/
      );
    });

    it('should auto-detect llmProvider even without provider mode', async () => {
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test description' }],
          usage: { input_tokens: 100, output_tokens: 50 },
          model: 'claude-3-7-sonnet-20250219',
          stop_reason: 'end_turn',
          id: 'msg_123'
        } as LLMCompletionResponse),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-3-7-sonnet-20250219'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true
          },
          costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        // No provider specified, but llmProvider provided
        llmProvider: mockProvider
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result).toBeDefined();
      expect(mockProvider.complete).toHaveBeenCalled();
    });

    it('should use custom model with provider', async () => {
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Custom model description' }],
          usage: { input_tokens: 100, output_tokens: 50 },
          model: 'claude-opus-4-20250514',
          stop_reason: 'end_turn',
          id: 'msg_123'
        } as LLMCompletionResponse),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-opus-4-20250514'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true
          },
          costs: { inputPerMillion: 15.0, outputPerMillion: 75.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider,
        model: 'claude-opus-4-20250514'
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result).toBeDefined();
      expect(mockProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-20250514'
        })
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy Ollama provider', async () => {
      const options: VisionOptions = {
        provider: 'ollama',
        ollamaBaseUrl: 'http://localhost:11434',
        videoContext: mockVideoContext
      };

      // Mock fetch for Ollama
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, // Simulate Ollama not running
        statusText: 'Connection refused'
      } as Response);

      const result = await analyzeVideoWithVision(mockFrames, options);

      // Should fallback to context-based
      expect(result).toBeDefined();
      expect(result.overallDescription).toContain('Test Video Tutorial');
    });

    it('should support legacy free provider', async () => {
      const options: VisionOptions = {
        provider: 'free',
        videoContext: mockVideoContext
      };

      // Mock fetch for Ollama
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Connection refused'
      } as Response);

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result).toBeDefined();
      expect(result.sceneDescriptions).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown provider type', async () => {
      const options: VisionOptions = {
        provider: 'unknown-provider' as any
      };

      await expect(analyzeVideoWithVision(mockFrames, options)).rejects.toThrow(
        /Unknown vision provider/
      );
    });

    it('should provide helpful error when vision provider fails without context', async () => {
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockRejectedValue(new Error('Network error')),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-3-7-sonnet-20250219'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true
          },
          costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider
        // No videoContext for fallback
      };

      await expect(analyzeVideoWithVision(mockFrames, options)).rejects.toThrow(/Network error/);
    });
  });

  describe('Content Generation', () => {
    it('should generate valid WebVTT output', async () => {
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Detailed video frame description for accessibility compliance' }],
          usage: { input_tokens: 100, output_tokens: 50 },
          model: 'claude-3-7-sonnet-20250219',
          stop_reason: 'end_turn',
          id: 'msg_123'
        } as LLMCompletionResponse),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-3-7-sonnet-20250219'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true
          },
          costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result.webVTT).toContain('WEBVTT');
      expect(result.webVTT).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    it('should generate extended description for aria-describedby', async () => {
      const mockProvider: ILLMProvider = {
        initialize: jest.fn().mockResolvedValue(undefined),
        complete: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test description' }],
          usage: { input_tokens: 100, output_tokens: 50 },
          model: 'claude-3-7-sonnet-20250219',
          stop_reason: 'end_turn',
          id: 'msg_123'
        } as LLMCompletionResponse),
        streamComplete: jest.fn(),
        embed: jest.fn(),
        countTokens: jest.fn(),
        healthCheck: jest.fn(),
        getMetadata: jest.fn().mockReturnValue({
          name: 'claude',
          version: '1.0.0',
          models: ['claude-3-7-sonnet-20250219'],
          capabilities: {
            streaming: true,
            caching: true,
            embeddings: false,
            vision: true
          },
          costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
          location: 'cloud'
        } as LLMProviderMetadata),
        shutdown: jest.fn(),
        trackCost: jest.fn()
      };

      const options: VisionOptions = {
        llmProvider: mockProvider
      };

      const result = await analyzeVideoWithVision(mockFrames, options);

      expect(result.extendedDescription).toBeDefined();
      expect(result.extendedDescription).toContain('[00:00:00.000]');
    });
  });
});
