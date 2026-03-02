/**
 * Tests for Resource Blocking
 */

import { describe, it, expect } from 'vitest';
import {
  shouldBlockRequest,
  getResourceBlockingPreset,
  type ResourceBlockingConfig,
} from '../../../../src/integrations/browser/resource-blocking';

describe('shouldBlockRequest', () => {
  const functionalConfig: ResourceBlockingConfig = {
    enabled: true,
    blockedCategories: ['image', 'font', 'media', 'stylesheet', 'tracking', 'advertising'],
  };

  it('returns false when blocking is disabled', () => {
    const config: ResourceBlockingConfig = { enabled: false, blockedCategories: ['image'] };
    expect(shouldBlockRequest('https://example.com/photo.jpg', 'image', config)).toBe(false);
  });

  it('blocks image resource type', () => {
    expect(shouldBlockRequest('https://example.com/photo.jpg', 'image', functionalConfig)).toBe(true);
  });

  it('blocks font resource type', () => {
    expect(shouldBlockRequest('https://fonts.gstatic.com/roboto.woff2', 'font', functionalConfig)).toBe(true);
  });

  it('blocks media resource type', () => {
    expect(shouldBlockRequest('https://example.com/video.mp4', 'media', functionalConfig)).toBe(true);
  });

  it('blocks stylesheet resource type', () => {
    expect(shouldBlockRequest('https://example.com/styles.css', 'stylesheet', functionalConfig)).toBe(true);
  });

  it('allows script resource type (not blocked)', () => {
    expect(shouldBlockRequest('https://example.com/app.js', 'script', functionalConfig)).toBe(false);
  });

  it('allows XHR/fetch resource type (not blocked)', () => {
    expect(shouldBlockRequest('https://api.example.com/data', 'xhr', functionalConfig)).toBe(false);
  });

  it('blocks known tracking domains', () => {
    expect(
      shouldBlockRequest('https://www.google-analytics.com/analytics.js', 'script', functionalConfig)
    ).toBe(true);
  });

  it('blocks known advertising domains', () => {
    expect(
      shouldBlockRequest('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'script', functionalConfig)
    ).toBe(true);
  });

  it('blocks subdomains of tracking domains', () => {
    expect(
      shouldBlockRequest('https://cdn.segment.com/next-integrations.js', 'script', functionalConfig)
    ).toBe(true);
  });

  it('respects allow patterns (highest priority)', () => {
    const config: ResourceBlockingConfig = {
      enabled: true,
      blockedCategories: ['image'],
      allowPatterns: ['*example.com/logo*'],
    };
    expect(shouldBlockRequest('https://example.com/logo.png', 'image', config)).toBe(false);
  });

  it('applies block patterns in addition to categories', () => {
    const config: ResourceBlockingConfig = {
      enabled: true,
      blockedCategories: [],
      blockPatterns: ['*evil-tracker.com*'],
    };
    expect(shouldBlockRequest('https://evil-tracker.com/track.js', 'script', config)).toBe(true);
  });

  it('handles invalid URLs gracefully', () => {
    expect(shouldBlockRequest('not-a-url', 'script', functionalConfig)).toBe(false);
  });
});

describe('getResourceBlockingPreset', () => {
  it('returns functional preset', () => {
    const preset = getResourceBlockingPreset('functional');
    expect(preset.enabled).toBe(true);
    expect(preset.blockedCategories).toContain('image');
    expect(preset.blockedCategories).toContain('tracking');
    expect(preset.blockedCategories).toContain('advertising');
  });

  it('returns visual preset (blocking disabled)', () => {
    const preset = getResourceBlockingPreset('visual');
    expect(preset.enabled).toBe(false);
    expect(preset.blockedCategories).toHaveLength(0);
  });

  it('returns performance preset', () => {
    const preset = getResourceBlockingPreset('performance');
    expect(preset.enabled).toBe(true);
    expect(preset.blockedCategories).toContain('image');
    expect(preset.blockedCategories).toContain('font');
    expect(preset.blockedCategories).not.toContain('stylesheet');
  });

  it('passes through a config object unchanged', () => {
    const config: ResourceBlockingConfig = {
      enabled: true,
      blockedCategories: ['media'],
    };
    expect(getResourceBlockingPreset(config)).toBe(config);
  });

  it('returns a copy that cannot mutate the original preset', () => {
    const preset1 = getResourceBlockingPreset('functional');
    preset1.blockedCategories.push('websocket');
    const preset2 = getResourceBlockingPreset('functional');
    expect(preset2.blockedCategories).not.toContain('websocket');
  });
});
