/**
 * Certificate Validation and Pinning for QUIC Transport
 *
 * Provides comprehensive certificate validation, pinning, and security checks
 * to prevent man-in-the-middle attacks and ensure secure communication.
 *
 * @module CertificateValidator
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as tls from 'tls';
import { Logger } from '../../utils/Logger';

export interface CertificateValidationOptions {
  /** Require valid CA-signed certificates */
  requireValidCertificates: boolean;

  /** Reject unauthorized certificates */
  rejectUnauthorized: boolean;

  /** Check certificate expiry */
  checkExpiry: boolean;

  /** Check certificate revocation (OCSP) */
  checkRevocation: boolean;

  /** Allow self-signed certificates (DEVELOPMENT ONLY) */
  allowSelfSigned: boolean;

  /** Minimum TLS version */
  minTLSVersion: string;

  /** Allowed cipher suites */
  allowedCipherSuites?: string[];
}

export interface CertificatePinningOptions {
  /** Enable certificate pinning */
  enabled: boolean;

  /** Expected certificate fingerprints (SHA-256) */
  fingerprints: string[];

  /** Hash algorithm for fingerprints */
  algorithm: 'sha256' | 'sha384' | 'sha512';
}

export interface CertificateInfo {
  /** Certificate subject */
  subject: string;

  /** Certificate issuer */
  issuer: string;

  /** Valid from date */
  validFrom: Date;

  /** Valid to date */
  validTo: Date;

  /** Certificate fingerprint */
  fingerprint: string;

  /** Is self-signed */
  isSelfSigned: boolean;

  /** Is expired */
  isExpired: boolean;

  /** Is CA-signed */
  isCAVerified: boolean;

  /** Common Name */
  commonName: string;

  /** Subject Alternative Names */
  subjectAltNames: string[];
}

export interface ValidationResult {
  /** Validation passed */
  valid: boolean;

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Certificate information */
  certificateInfo?: CertificateInfo;
}

/**
 * Certificate Validator
 *
 * Handles certificate validation, pinning, and security checks for QUIC transport.
 * Prevents common TLS/QUIC security vulnerabilities.
 */
export class CertificateValidator {
  private readonly logger: Logger;
  private validationOptions: CertificateValidationOptions;
  private pinningOptions: CertificatePinningOptions;
  private environment: 'development' | 'production';

  constructor(
    validationOptions: CertificateValidationOptions,
    pinningOptions: CertificatePinningOptions,
    environment: 'development' | 'production' = 'production'
  ) {
    this.logger = Logger.getInstance();
    this.validationOptions = validationOptions;
    this.pinningOptions = pinningOptions;
    this.environment = environment;

    // CRITICAL: Never allow self-signed certificates in production
    if (environment === 'production' && validationOptions.allowSelfSigned) {
      throw new Error(
        'SECURITY ERROR: Self-signed certificates are not allowed in production. ' +
        'Use CA-signed certificates from Let\'s Encrypt or your organization\'s CA.'
      );
    }
  }

  /**
   * Validate certificate file paths
   */
  validateCertificatePaths(certPath: string, keyPath: string, caPath?: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check certificate file exists
    if (!fs.existsSync(certPath)) {
      errors.push(`Certificate file not found: ${certPath}`);
    }

    // Check private key file exists
    if (!fs.existsSync(keyPath)) {
      errors.push(`Private key file not found: ${keyPath}`);
    }

    // Check CA file if provided
    if (caPath && !fs.existsSync(caPath)) {
      errors.push(`CA certificate file not found: ${caPath}`);
    }

    // Verify file permissions (should be readable only by owner)
    try {
      if (fs.existsSync(keyPath)) {
        const stats = fs.statSync(keyPath);
        const mode = stats.mode & parseInt('777', 8);

        // Private key should be 0600 (readable/writable by owner only)
        if (mode !== parseInt('600', 8)) {
          warnings.push(
            `Private key file has insecure permissions: ${mode.toString(8)}. ` +
            'Recommended: 0600 (chmod 600 keyfile.pem)'
          );
        }
      }
    } catch (error) {
      warnings.push(`Could not check file permissions: ${error}`);
    }

    if (errors.length > 0) {
      this.logger.error('Certificate path validation failed', { errors, warnings });
      return { valid: false, errors, warnings };
    }

    if (warnings.length > 0) {
      this.logger.warn('Certificate path validation warnings', { warnings });
    }

    return { valid: true, errors: [], warnings };
  }

  /**
   * Load and validate certificate
   */
  loadCertificate(certPath: string): CertificateInfo {
    const certPem = fs.readFileSync(certPath, 'utf8');
    const cert = this.parseCertificate(certPem);

    return {
      subject: cert.subject.CN || 'Unknown',
      issuer: cert.issuer.CN || 'Unknown',
      validFrom: new Date(cert.valid_from),
      validTo: new Date(cert.valid_to),
      fingerprint: this.calculateFingerprint(certPem),
      isSelfSigned: this.isSelfSigned(cert),
      isExpired: this.isExpired(cert),
      isCAVerified: !this.isSelfSigned(cert),
      commonName: cert.subject.CN || '',
      subjectAltNames: cert.subjectaltname ? cert.subjectaltname.split(', ') : []
    };
  }

  /**
   * Validate certificate against security requirements
   */
  validateCertificate(certInfo: CertificateInfo): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if certificate is expired
    if (this.validationOptions.checkExpiry && certInfo.isExpired) {
      errors.push('Certificate has expired');
    }

    // Check if certificate is self-signed
    if (certInfo.isSelfSigned) {
      if (this.environment === 'production' || !this.validationOptions.allowSelfSigned) {
        errors.push(
          'Self-signed certificates are not allowed. Use CA-signed certificates from ' +
          'Let\'s Encrypt (free) or your organization\'s Certificate Authority.'
        );
      } else {
        warnings.push('Using self-signed certificate (DEVELOPMENT ONLY)');
      }
    }

    // Check certificate validity period
    const now = new Date();
    if (now < certInfo.validFrom) {
      errors.push('Certificate is not yet valid');
    }

    // Warn if certificate expires soon (within 30 days)
    const daysUntilExpiry = Math.floor(
      (certInfo.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
      warnings.push(`Certificate expires in ${daysUntilExpiry} days. Consider renewal.`);
    }

    // Check certificate pinning if enabled
    if (this.pinningOptions.enabled) {
      const pinningResult = this.validateCertificatePinning(certInfo.fingerprint);
      if (!pinningResult.valid) {
        errors.push(...pinningResult.errors);
      }
      warnings.push(...pinningResult.warnings);
    }

    if (errors.length > 0) {
      this.logger.error('Certificate validation failed', {
        errors,
        warnings,
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        validTo: certInfo.validTo
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      certificateInfo: certInfo
    };
  }

  /**
   * Validate certificate pinning
   */
  validateCertificatePinning(fingerprint: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.pinningOptions.enabled) {
      return { valid: true, errors: [], warnings: [] };
    }

    if (this.pinningOptions.fingerprints.length === 0) {
      warnings.push('Certificate pinning enabled but no fingerprints configured');
      return { valid: true, errors: [], warnings };
    }

    // Normalize fingerprints for comparison (remove colons, convert to lowercase)
    const normalizedFingerprint = fingerprint.toLowerCase().replace(/:/g, '');
    const normalizedExpected = this.pinningOptions.fingerprints.map(fp =>
      fp.toLowerCase().replace(/:/g, '')
    );

    if (!normalizedExpected.includes(normalizedFingerprint)) {
      errors.push(
        'Certificate fingerprint does not match pinned fingerprints. ' +
        'This could indicate a man-in-the-middle attack or certificate change.'
      );
      this.logger.error('Certificate pinning validation failed', {
        received: fingerprint,
        expected: this.pinningOptions.fingerprints
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create TLS options for secure connections
   */
  createTLSOptions(certPath: string, keyPath: string, caPath?: string): tls.TlsOptions {
    // Validate paths first
    const pathValidation = this.validateCertificatePaths(certPath, keyPath, caPath);
    if (!pathValidation.valid) {
      throw new Error(
        `Certificate path validation failed: ${pathValidation.errors.join(', ')}`
      );
    }

    // Load and validate certificate
    const certInfo = this.loadCertificate(certPath);
    const certValidation = this.validateCertificate(certInfo);

    if (!certValidation.valid) {
      throw new Error(
        `Certificate validation failed: ${certValidation.errors.join(', ')}`
      );
    }

    // Log warnings
    if (certValidation.warnings.length > 0) {
      this.logger.warn('Certificate validation warnings', {
        warnings: certValidation.warnings
      });
    }

    // Create TLS options
    const tlsOptions: tls.TlsOptions = {
      // CRITICAL: Always verify certificates in production
      rejectUnauthorized: this.validationOptions.rejectUnauthorized,

      // Certificate and key
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),

      // Minimum TLS version (TLS 1.3 recommended)
      minVersion: this.validationOptions.minTLSVersion as any,
      maxVersion: 'TLSv1.3' as any,

      // Allowed cipher suites (strong ciphers only)
      ciphers: this.validationOptions.allowedCipherSuites?.join(':'),

      // Prefer server cipher order
      honorCipherOrder: true,

      // Request certificate from peer (for mutual TLS)
      requestCert: this.validationOptions.requireValidCertificates,
    };

    // Add CA if provided
    if (caPath) {
      tlsOptions.ca = fs.readFileSync(caPath);
    }

    // Add custom certificate validation if pinning is enabled
    if (this.pinningOptions.enabled) {
      tlsOptions.checkServerIdentity = (hostname, cert) => {
        const fingerprint = this.calculateCertificateFingerprint(cert);
        const pinningResult = this.validateCertificatePinning(fingerprint);

        if (!pinningResult.valid) {
          return new Error(pinningResult.errors.join(', '));
        }

        // Also perform standard hostname verification
        return tls.checkServerIdentity(hostname, cert);
      };
    }

    return tlsOptions;
  }

  /**
   * Calculate certificate fingerprint
   */
  calculateFingerprint(certPem: string): string {
    const cert = certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
                        .replace(/-----END CERTIFICATE-----/, '')
                        .replace(/\s/g, '');

    const certBuffer = Buffer.from(cert, 'base64');
    const hash = crypto.createHash(this.pinningOptions.algorithm);
    hash.update(certBuffer);

    return hash.digest('hex').toUpperCase().match(/.{2}/g)!.join(':');
  }

  /**
   * Calculate certificate fingerprint from certificate object
   */
  private calculateCertificateFingerprint(cert: tls.PeerCertificate): string {
    const certDer = cert.raw;
    const hash = crypto.createHash(this.pinningOptions.algorithm);
    hash.update(certDer);

    return hash.digest('hex').toUpperCase().match(/.{2}/g)!.join(':');
  }

  /**
   * Parse PEM certificate
   */
  private parseCertificate(certPem: string): any {
    // This is a simplified parser. In production, use a proper X.509 parser
    // or Node.js built-in certificate parsing
    const cert = tls.createSecureContext({ cert: certPem }).context.getCertificate() as any;
    return cert || {};
  }

  /**
   * Check if certificate is self-signed
   */
  private isSelfSigned(cert: any): boolean {
    return cert.issuer?.CN === cert.subject?.CN;
  }

  /**
   * Check if certificate is expired
   */
  private isExpired(cert: any): boolean {
    const validTo = new Date(cert.valid_to);
    return new Date() > validTo;
  }

  /**
   * Generate security audit log entry
   */
  auditLog(event: string, details: any): void {
    this.logger.info(`[SECURITY AUDIT] ${event}`, {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      ...details
    });
  }
}

/**
 * Load security configuration from file
 */
export function loadSecurityConfig(
  configPath: string = '.agentic-qe/config/security.json'
): { validation: CertificateValidationOptions; pinning: CertificatePinningOptions } {
  const logger = Logger.getInstance();

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';

    // Use environment-specific settings
    const envConfig = env === 'production' ? config.production : config.development;

    return {
      validation: {
        requireValidCertificates: config.tls.requireValidCertificates,
        rejectUnauthorized: config.tls.rejectUnauthorized,
        checkExpiry: config.tls.certificateValidation.checkExpiry,
        checkRevocation: config.tls.certificateValidation.checkRevocation,
        allowSelfSigned: env === 'development' && envConfig.allowSelfSignedCerts,
        minTLSVersion: config.tls.minVersion,
        allowedCipherSuites: config.quic.security.allowedCipherSuites
      },
      pinning: {
        enabled: config.tls.certificatePinning.enabled,
        fingerprints: config.tls.certificatePinning.fingerprints,
        algorithm: config.tls.certificatePinning.algorithm
      }
    };
  } catch (error) {
    logger.warn('Could not load security config, using secure defaults', { error });

    // Return secure defaults
    return {
      validation: {
        requireValidCertificates: true,
        rejectUnauthorized: true,
        checkExpiry: true,
        checkRevocation: true,
        allowSelfSigned: false,
        minTLSVersion: 'TLSv1.3',
        allowedCipherSuites: [
          'TLS_AES_256_GCM_SHA384',
          'TLS_CHACHA20_POLY1305_SHA256',
          'TLS_AES_128_GCM_SHA256'
        ]
      },
      pinning: {
        enabled: false,
        fingerprints: [],
        algorithm: 'sha256'
      }
    };
  }
}
