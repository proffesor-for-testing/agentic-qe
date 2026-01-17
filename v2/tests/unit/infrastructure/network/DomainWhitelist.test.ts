/**
 * Unit tests for DomainWhitelist
 *
 * @module tests/unit/infrastructure/network/DomainWhitelist.test
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import {
  DomainWhitelist,
  COMMON_DOMAIN_PRESETS,
  createWhitelistFromPresets,
} from '../../../../src/infrastructure/network/DomainWhitelist.js';

describe('DomainWhitelist', () => {
  describe('constructor', () => {
    it('should create an empty whitelist', () => {
      const whitelist = new DomainWhitelist();
      expect(whitelist.isEmpty()).toBe(true);
      expect(whitelist.size()).toBe(0);
    });

    it('should initialize with provided domains', () => {
      const domains = ['example.com', 'api.test.com'];
      const whitelist = new DomainWhitelist(domains);
      expect(whitelist.size()).toBe(2);
      expect(whitelist.isAllowed('example.com')).toBe(true);
      expect(whitelist.isAllowed('api.test.com')).toBe(true);
    });
  });

  describe('addDomain', () => {
    it('should add exact domain', () => {
      const whitelist = new DomainWhitelist();
      whitelist.addDomain('example.com');
      expect(whitelist.isAllowed('example.com')).toBe(true);
      expect(whitelist.size()).toBe(1);
    });

    it('should normalize domain to lowercase', () => {
      const whitelist = new DomainWhitelist();
      whitelist.addDomain('EXAMPLE.COM');
      expect(whitelist.isAllowed('example.com')).toBe(true);
      expect(whitelist.isAllowed('Example.Com')).toBe(true);
    });

    it('should not add duplicate domains', () => {
      const whitelist = new DomainWhitelist();
      whitelist.addDomain('example.com');
      whitelist.addDomain('example.com');
      whitelist.addDomain('EXAMPLE.COM');
      expect(whitelist.size()).toBe(1);
    });

    it('should add wildcard pattern', () => {
      const whitelist = new DomainWhitelist();
      whitelist.addDomain('*.example.com');
      expect(whitelist.size()).toBe(1);
    });
  });

  describe('removeDomain', () => {
    it('should remove exact domain', () => {
      const whitelist = new DomainWhitelist(['example.com', 'test.com']);
      whitelist.removeDomain('example.com');
      expect(whitelist.isAllowed('example.com')).toBe(false);
      expect(whitelist.isAllowed('test.com')).toBe(true);
      expect(whitelist.size()).toBe(1);
    });

    it('should remove wildcard pattern', () => {
      const whitelist = new DomainWhitelist(['*.example.com']);
      whitelist.removeDomain('*.example.com');
      expect(whitelist.isAllowed('sub.example.com')).toBe(false);
      expect(whitelist.size()).toBe(0);
    });

    it('should handle non-existent domain gracefully', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      whitelist.removeDomain('nonexistent.com');
      expect(whitelist.size()).toBe(1);
    });
  });

  describe('isAllowed - exact matching', () => {
    it('should allow exact domain match', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isAllowed('example.com')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isAllowed('EXAMPLE.COM')).toBe(true);
      expect(whitelist.isAllowed('Example.Com')).toBe(true);
    });

    it('should reject non-whitelisted domain', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isAllowed('other.com')).toBe(false);
    });

    it('should not match subdomains for exact domains', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isAllowed('sub.example.com')).toBe(false);
    });
  });

  describe('isAllowed - wildcard matching', () => {
    it('should match subdomains with wildcard pattern', () => {
      const whitelist = new DomainWhitelist(['*.example.com']);
      expect(whitelist.isAllowed('api.example.com')).toBe(true);
      expect(whitelist.isAllowed('www.example.com')).toBe(true);
      expect(whitelist.isAllowed('deep.sub.example.com')).toBe(true);
    });

    it('should match exact domain with wildcard pattern', () => {
      const whitelist = new DomainWhitelist(['*.example.com']);
      expect(whitelist.isAllowed('example.com')).toBe(true);
    });

    it('should not match different base domain', () => {
      const whitelist = new DomainWhitelist(['*.example.com']);
      expect(whitelist.isAllowed('api.other.com')).toBe(false);
      expect(whitelist.isAllowed('exampleX.com')).toBe(false);
    });

    it('should handle multiple wildcard patterns', () => {
      const whitelist = new DomainWhitelist(['*.example.com', '*.test.com']);
      expect(whitelist.isAllowed('api.example.com')).toBe(true);
      expect(whitelist.isAllowed('api.test.com')).toBe(true);
      expect(whitelist.isAllowed('api.other.com')).toBe(false);
    });

    it('should handle mixed exact and wildcard domains', () => {
      const whitelist = new DomainWhitelist(['exact.com', '*.wildcard.com']);
      expect(whitelist.isAllowed('exact.com')).toBe(true);
      expect(whitelist.isAllowed('sub.exact.com')).toBe(false);
      expect(whitelist.isAllowed('wildcard.com')).toBe(true);
      expect(whitelist.isAllowed('sub.wildcard.com')).toBe(true);
    });
  });

  describe('isUrlAllowed', () => {
    it('should extract domain from URL', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isUrlAllowed('https://example.com/path')).toBe(true);
      expect(whitelist.isUrlAllowed('http://example.com:8080/api')).toBe(true);
    });

    it('should reject URL with non-whitelisted domain', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isUrlAllowed('https://other.com/path')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.isUrlAllowed('not-a-url')).toBe(false);
      expect(whitelist.isUrlAllowed('')).toBe(false);
    });

    it('should work with wildcard patterns', () => {
      const whitelist = new DomainWhitelist(['*.example.com']);
      expect(whitelist.isUrlAllowed('https://api.example.com/v1')).toBe(true);
      expect(whitelist.isUrlAllowed('https://api.other.com/v1')).toBe(false);
    });
  });

  describe('listDomains', () => {
    it('should return all domains', () => {
      const domains = ['example.com', '*.test.com', 'api.other.com'];
      const whitelist = new DomainWhitelist(domains);
      expect(whitelist.listDomains()).toEqual(domains);
    });

    it('should return empty array for empty whitelist', () => {
      const whitelist = new DomainWhitelist();
      expect(whitelist.listDomains()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all domains', () => {
      const whitelist = new DomainWhitelist(['a.com', 'b.com', '*.c.com']);
      whitelist.clear();
      expect(whitelist.isEmpty()).toBe(true);
      expect(whitelist.size()).toBe(0);
      expect(whitelist.isAllowed('a.com')).toBe(false);
    });
  });

  describe('merge', () => {
    it('should merge two whitelists', () => {
      const whitelist1 = new DomainWhitelist(['a.com', 'b.com']);
      const whitelist2 = new DomainWhitelist(['c.com', '*.d.com']);
      whitelist1.merge(whitelist2);

      expect(whitelist1.size()).toBe(4);
      expect(whitelist1.isAllowed('a.com')).toBe(true);
      expect(whitelist1.isAllowed('c.com')).toBe(true);
      expect(whitelist1.isAllowed('sub.d.com')).toBe(true);
    });

    it('should handle duplicates during merge', () => {
      const whitelist1 = new DomainWhitelist(['a.com', 'b.com']);
      const whitelist2 = new DomainWhitelist(['b.com', 'c.com']);
      whitelist1.merge(whitelist2);

      expect(whitelist1.size()).toBe(3);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const original = new DomainWhitelist(['a.com', '*.b.com']);
      const cloned = original.clone();

      // Modify original
      original.addDomain('c.com');
      original.removeDomain('a.com');

      // Clone should be unchanged
      expect(cloned.size()).toBe(2);
      expect(cloned.isAllowed('a.com')).toBe(true);
      expect(cloned.isAllowed('c.com')).toBe(false);
    });
  });

  describe('getMatchingPattern', () => {
    it('should return exact domain match', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.getMatchingPattern('example.com')).toBe('example.com');
    });

    it('should return wildcard pattern match', () => {
      const whitelist = new DomainWhitelist(['*.example.com']);
      expect(whitelist.getMatchingPattern('api.example.com')).toBe('*.example.com');
    });

    it('should return null for no match', () => {
      const whitelist = new DomainWhitelist(['example.com']);
      expect(whitelist.getMatchingPattern('other.com')).toBeNull();
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize and deserialize', () => {
      const domains = ['example.com', '*.test.com', 'api.other.com'];
      const whitelist = new DomainWhitelist(domains);
      const json = whitelist.toJSON();
      const restored = DomainWhitelist.fromJSON(json);

      expect(restored.listDomains()).toEqual(domains);
      expect(restored.isAllowed('example.com')).toBe(true);
      expect(restored.isAllowed('sub.test.com')).toBe(true);
    });
  });
});

describe('COMMON_DOMAIN_PRESETS', () => {
  it('should have anthropic preset', () => {
    expect(COMMON_DOMAIN_PRESETS.anthropic).toContain('api.anthropic.com');
  });

  it('should have github preset', () => {
    expect(COMMON_DOMAIN_PRESETS.github).toContain('api.github.com');
    expect(COMMON_DOMAIN_PRESETS.github).toContain('github.com');
  });

  it('should have security preset', () => {
    expect(COMMON_DOMAIN_PRESETS.security).toContain('nvd.nist.gov');
    expect(COMMON_DOMAIN_PRESETS.security).toContain('cve.mitre.org');
  });

  it('should have localhost preset', () => {
    expect(COMMON_DOMAIN_PRESETS.localhost).toContain('localhost');
    expect(COMMON_DOMAIN_PRESETS.localhost).toContain('127.0.0.1');
  });
});

describe('createWhitelistFromPresets', () => {
  it('should create whitelist from single preset', () => {
    const whitelist = createWhitelistFromPresets('anthropic');
    expect(whitelist.isAllowed('api.anthropic.com')).toBe(true);
  });

  it('should create whitelist from multiple presets', () => {
    const whitelist = createWhitelistFromPresets('anthropic', 'github');
    expect(whitelist.isAllowed('api.anthropic.com')).toBe(true);
    expect(whitelist.isAllowed('api.github.com')).toBe(true);
  });

  it('should handle empty presets', () => {
    const whitelist = createWhitelistFromPresets();
    expect(whitelist.isEmpty()).toBe(true);
  });
});
