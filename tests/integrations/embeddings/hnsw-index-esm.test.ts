import { afterEach, describe, expect, it, vi } from 'vitest';

const originalRequire = Object.getOwnPropertyDescriptor(globalThis, 'require');

afterEach(() => {
  if (originalRequire) {
    Object.defineProperty(globalThis, 'require', originalRequire);
  } else {
    Reflect.deleteProperty(globalThis, 'require');
  }
  vi.resetModules();
});

describe('HNSWIndex ESM compatibility', () => {
  it('should initialize when CommonJS require is unavailable globally', async () => {
    // Arrange: reproduce the published unbundled ESM environment from #586.
    Reflect.deleteProperty(globalThis, 'require');
    vi.resetModules();

    // Act
    const { HNSWEmbeddingIndex } = await import(
      '../../../src/integrations/embeddings/index/HNSWIndex.js'
    );
    const index = new HNSWEmbeddingIndex({ dimension: 4 });
    index.initializeIndex('test');

    // Assert
    expect(index.isInitialized('test')).toBe(true);
    index.clearAll();
  });
});
