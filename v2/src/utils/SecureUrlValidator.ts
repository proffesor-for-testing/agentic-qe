/**
 * Secure URL Validator - Native TypeScript Implementation
 *
 * A secure, zero-dependency URL validation utility using the WHATWG URL API
 * to replace validator.js isURL() and avoid CVE-2025-56200.
 *
 * @module SecureUrlValidator
 * @see CVE-2025-56200 - validator.js URL validation bypass vulnerability
 */

export interface UrlValidationOptions {
  /**
   * Allowed URL protocols (e.g., ['http:', 'https:'])
   * Default: ['http:', 'https:']
   */
  allowedProtocols?: string[];

  /**
   * Whether to allow URLs with authentication (username:password@host)
   * Default: false (for security)
   */
  allowAuthentication?: boolean;

  /**
   * Whether to require a valid TLD (top-level domain)
   * Default: true
   */
  requireTld?: boolean;

  /**
   * Whether to allow localhost URLs
   * Default: false (for production safety)
   */
  allowLocalhost?: boolean;

  /**
   * Whether to allow IP addresses (IPv4/IPv6)
   * Default: true
   */
  allowIpAddress?: boolean;

  /**
   * Maximum URL length
   * Default: 2048 (browser limit)
   */
  maxLength?: number;

  /**
   * Custom domain allowlist (if provided, only these domains are allowed)
   */
  allowedDomains?: string[];

  /**
   * Custom domain blocklist (if provided, these domains are rejected)
   */
  blockedDomains?: string[];
}

export interface UrlValidationResult {
  /**
   * Whether the URL is valid
   */
  valid: boolean;

  /**
   * Error message if invalid
   */
  error?: string;

  /**
   * Parsed URL object if valid
   */
  url?: URL;

  /**
   * Security warnings (non-fatal)
   */
  warnings?: string[];
}

/**
 * Default validation options
 */
const DEFAULT_OPTIONS: Required<Omit<UrlValidationOptions, 'allowedDomains' | 'blockedDomains'>> = {
  allowedProtocols: ['http:', 'https:'],
  allowAuthentication: false,
  requireTld: true,
  allowLocalhost: false,
  allowIpAddress: true,
  maxLength: 2048,
};

/**
 * Dangerous URL protocols that should always be blocked for security
 */
const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
];

/**
 * TLD validation regex (common TLDs)
 * Note: This is not exhaustive but covers most cases
 */
const TLD_REGEX = /\.[a-z]{2,}$/i;

/**
 * IPv4 address regex
 */
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * IPv6 address regex (simplified)
 */
const IPV6_REGEX = /^\[?[0-9a-f:]+\]?$/i;

/**
 * Validates a URL string using the WHATWG URL API
 *
 * This is the secure replacement for validator.js isURL() function.
 * It uses the native URL constructor which properly handles all edge cases
 * and prevents the CVE-2025-56200 vulnerability.
 *
 * @param urlString - The URL string to validate
 * @param options - Validation options
 * @returns Validation result with details
 *
 * @example
 * ```typescript
 * // Basic validation
 * const result = validateUrl('https://example.com');
 * if (result.valid) {
 *   console.log('Valid URL:', result.url?.href);
 * }
 *
 * // Strict validation for user input
 * const strictResult = validateUrl(userInput, {
 *   allowedProtocols: ['https:'],
 *   requireTld: true,
 *   allowLocalhost: false,
 *   allowAuthentication: false,
 * });
 *
 * // Custom domain allowlist
 * const allowlistResult = validateUrl(url, {
 *   allowedDomains: ['example.com', 'trusted-site.org'],
 * });
 * ```
 */
export function validateUrl(
  urlString: string,
  options: UrlValidationOptions = {}
): UrlValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // Step 1: Length validation
  if (urlString.length > opts.maxLength) {
    return {
      valid: false,
      error: `URL exceeds maximum length of ${opts.maxLength} characters`,
    };
  }

  // Step 2: Check for dangerous protocols BEFORE URL parsing
  // This prevents the CVE-2025-56200 vulnerability
  const lowerUrl = urlString.toLowerCase();
  for (const dangerousProto of DANGEROUS_PROTOCOLS) {
    if (lowerUrl.startsWith(dangerousProto)) {
      return {
        valid: false,
        error: `Dangerous protocol detected: ${dangerousProto}`,
      };
    }
  }

  // Step 3: WHATWG URL parsing (the secure way)
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // Step 4: Protocol validation
  if (!opts.allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      error: `Protocol '${url.protocol}' is not allowed. Allowed protocols: ${opts.allowedProtocols.join(', ')}`,
    };
  }

  // Step 5: Authentication validation
  if (!opts.allowAuthentication && (url.username || url.password)) {
    return {
      valid: false,
      error: 'URLs with authentication (username:password) are not allowed',
    };
  }

  // Step 6: Hostname validation
  if (!url.hostname) {
    return {
      valid: false,
      error: 'URL must have a valid hostname',
    };
  }

  // Step 7: Localhost validation
  const isLocalhost = url.hostname === 'localhost' ||
                     url.hostname === '127.0.0.1' ||
                     url.hostname === '[::1]';

  if (isLocalhost && !opts.allowLocalhost) {
    return {
      valid: false,
      error: 'Localhost URLs are not allowed',
    };
  }

  // Step 8: IP address validation
  const isIpv4 = IPV4_REGEX.test(url.hostname);
  const isIpv6 = IPV6_REGEX.test(url.hostname);
  const isIpAddress = isIpv4 || isIpv6;

  if (isIpAddress && !opts.allowIpAddress) {
    return {
      valid: false,
      error: 'IP addresses are not allowed',
    };
  }

  // Step 9: TLD validation (for non-IP, non-localhost hosts)
  if (opts.requireTld && !isIpAddress && !isLocalhost) {
    if (!TLD_REGEX.test(url.hostname)) {
      return {
        valid: false,
        error: 'URL must have a valid top-level domain (TLD)',
      };
    }
  }

  // Step 10: Domain allowlist validation
  if (options.allowedDomains && options.allowedDomains.length > 0) {
    const isAllowed = options.allowedDomains.some(domain => {
      return url.hostname === domain || url.hostname.endsWith('.' + domain);
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Domain '${url.hostname}' is not in the allowlist`,
      };
    }
  }

  // Step 11: Domain blocklist validation
  if (options.blockedDomains && options.blockedDomains.length > 0) {
    const isBlocked = options.blockedDomains.some(domain => {
      return url.hostname === domain || url.hostname.endsWith('.' + domain);
    });

    if (isBlocked) {
      return {
        valid: false,
        error: `Domain '${url.hostname}' is blocked`,
      };
    }
  }

  // Step 12: Security warnings (non-fatal)
  if (url.protocol === 'http:' && opts.allowedProtocols.includes('https:')) {
    warnings.push('Using HTTP instead of HTTPS (insecure)');
  }

  if (url.username || url.password) {
    warnings.push('URL contains authentication credentials');
  }

  // Success!
  return {
    valid: true,
    url,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Simple boolean validation (for drop-in replacement of validator.isURL)
 *
 * @param urlString - The URL string to validate
 * @param options - Validation options
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * if (isValidUrl('https://example.com')) {
 *   // URL is valid
 * }
 * ```
 */
export function isValidUrl(
  urlString: string,
  options: UrlValidationOptions = {}
): boolean {
  return validateUrl(urlString, options).valid;
}

/**
 * Sanitize URL by parsing and reconstructing it
 * This ensures the URL is properly formatted and safe
 *
 * @param urlString - The URL string to sanitize
 * @param options - Validation options
 * @returns Sanitized URL string or null if invalid
 *
 * @example
 * ```typescript
 * const clean = sanitizeUrl('HTTP://EXAMPLE.COM/path');
 * // Returns: 'http://example.com/path'
 * ```
 */
export function sanitizeUrl(
  urlString: string,
  options: UrlValidationOptions = {}
): string | null {
  const result = validateUrl(urlString, options);
  return result.valid ? result.url!.href : null;
}

/**
 * Extract and validate hostname from URL
 *
 * @param urlString - The URL string
 * @returns Hostname or null if invalid
 */
export function extractHostname(urlString: string): string | null {
  const result = validateUrl(urlString);
  return result.valid ? result.url!.hostname : null;
}

/**
 * Check if URL is HTTPS
 *
 * @param urlString - The URL string
 * @returns true if HTTPS, false otherwise
 */
export function isHttps(urlString: string): boolean {
  const result = validateUrl(urlString);
  return result.valid && result.url!.protocol === 'https:';
}

/**
 * Preset validation configurations for common use cases
 */
export const UrlValidationPresets = {
  /**
   * Strict validation for production user input
   */
  STRICT: {
    allowedProtocols: ['https:'],
    allowAuthentication: false,
    requireTld: true,
    allowLocalhost: false,
    allowIpAddress: false,
  } as UrlValidationOptions,

  /**
   * Standard web URLs (HTTP/HTTPS)
   */
  WEB: {
    allowedProtocols: ['http:', 'https:'],
    allowAuthentication: false,
    requireTld: true,
    allowLocalhost: false,
    allowIpAddress: true,
  } as UrlValidationOptions,

  /**
   * Development mode (allows localhost)
   */
  DEVELOPMENT: {
    allowedProtocols: ['http:', 'https:'],
    allowAuthentication: false,
    requireTld: false,
    allowLocalhost: true,
    allowIpAddress: true,
  } as UrlValidationOptions,

  /**
   * API endpoints (allows authentication)
   */
  API: {
    allowedProtocols: ['http:', 'https:'],
    allowAuthentication: true,
    requireTld: true,
    allowLocalhost: false,
    allowIpAddress: true,
  } as UrlValidationOptions,
};
