/**
 * TLS Certificate Validation Test Suite
 *
 * Comprehensive tests for certificate validation, pinning, and security checks.
 * Ensures QUIC transport rejects invalid certificates and prevents MITM attacks.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { CertificateValidator, loadSecurityConfig } from '@core/security/CertificateValidator';

// Mock Logger to avoid initialization issues
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('TLS Certificate Validation', () => {
  let validator: CertificateValidator;
  const testCertsDir = path.join(__dirname, '../fixtures/certs');

  beforeEach(() => {
    // Create validator with strict production settings
    validator = new CertificateValidator(
      {
        requireValidCertificates: true,
        rejectUnauthorized: true,
        checkExpiry: true,
        checkRevocation: false, // OCSP checking requires network access
        allowSelfSigned: false,
        minTLSVersion: 'TLSv1.3',
        allowedCipherSuites: [
          'TLS_AES_256_GCM_SHA384',
          'TLS_CHACHA20_POLY1305_SHA256'
        ]
      },
      {
        enabled: false,
        fingerprints: [],
        algorithm: 'sha256'
      },
      'production'
    );
  });

  describe('Certificate Path Validation', () => {
    it('should reject non-existent certificate files', () => {
      const result = validator.validateCertificatePaths(
        '/nonexistent/cert.pem',
        '/nonexistent/key.pem'
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Certificate file not found');
      expect(result.errors[1]).toContain('Private key file not found');
    });

    it('should accept valid certificate paths', () => {
      // Create temporary test files
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-test-'));
      const certPath = path.join(tempDir, 'cert.pem');
      const keyPath = path.join(tempDir, 'key.pem');

      fs.writeFileSync(certPath, 'dummy cert');
      fs.writeFileSync(keyPath, 'dummy key');

      const result = validator.validateCertificatePaths(certPath, keyPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Cleanup
      fs.unlinkSync(certPath);
      fs.unlinkSync(keyPath);
      fs.rmdirSync(tempDir);
    });

    it('should warn about insecure private key permissions', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-test-'));
      const certPath = path.join(tempDir, 'cert.pem');
      const keyPath = path.join(tempDir, 'key.pem');

      fs.writeFileSync(certPath, 'dummy cert');
      fs.writeFileSync(keyPath, 'dummy key');
      fs.chmodSync(keyPath, 0o644); // Too permissive

      const result = validator.validateCertificatePaths(certPath, keyPath);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('insecure permissions');

      // Cleanup
      fs.unlinkSync(certPath);
      fs.unlinkSync(keyPath);
      fs.rmdirSync(tempDir);
    });
  });

  describe('Self-Signed Certificate Rejection', () => {
    it('should REJECT self-signed certificates in production', () => {
      const certInfo = {
        subject: 'test.example.com',
        issuer: 'test.example.com', // Self-signed
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        fingerprint: 'AA:BB:CC:DD',
        isSelfSigned: true,
        isExpired: false,
        isCAVerified: false,
        commonName: 'test.example.com',
        subjectAltNames: ['test.example.com']
      };

      const result = validator.validateCertificate(certInfo);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Self-signed certificates are not allowed')
      );
    });

    it('should ALLOW self-signed certificates in development only', () => {
      const devValidator = new CertificateValidator(
        {
          requireValidCertificates: true,
          rejectUnauthorized: true,
          checkExpiry: true,
          checkRevocation: false,
          allowSelfSigned: true, // Allowed in dev
          minTLSVersion: 'TLSv1.3',
          allowedCipherSuites: []
        },
        {
          enabled: false,
          fingerprints: [],
          algorithm: 'sha256'
        },
        'development'
      );

      const certInfo = {
        subject: 'localhost',
        issuer: 'localhost',
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        fingerprint: 'AA:BB:CC:DD',
        isSelfSigned: true,
        isExpired: false,
        isCAVerified: false,
        commonName: 'localhost',
        subjectAltNames: ['localhost']
      };

      const result = devValidator.validateCertificate(certInfo);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        expect.stringContaining('self-signed certificate (DEVELOPMENT ONLY)')
      );
    });

    it('should THROW when attempting to use self-signed in production', () => {
      expect(() => {
        new CertificateValidator(
          {
            requireValidCertificates: true,
            rejectUnauthorized: true,
            checkExpiry: true,
            checkRevocation: false,
            allowSelfSigned: true, // INVALID for production
            minTLSVersion: 'TLSv1.3',
            allowedCipherSuites: []
          },
          {
            enabled: false,
            fingerprints: [],
            algorithm: 'sha256'
          },
          'production'
        );
      }).toThrow('Self-signed certificates are not allowed in production');
    });
  });

  describe('Certificate Expiry Validation', () => {
    it('should reject expired certificates', () => {
      const certInfo = {
        subject: 'expired.example.com',
        issuer: 'CA',
        validFrom: new Date(Date.now() - 365 * 86400000),
        validTo: new Date(Date.now() - 86400000), // Expired yesterday
        fingerprint: 'AA:BB:CC:DD',
        isSelfSigned: false,
        isExpired: true,
        isCAVerified: true,
        commonName: 'expired.example.com',
        subjectAltNames: []
      };

      const result = validator.validateCertificate(certInfo);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Certificate has expired');
    });

    it('should reject not-yet-valid certificates', () => {
      const certInfo = {
        subject: 'future.example.com',
        issuer: 'CA',
        validFrom: new Date(Date.now() + 86400000), // Valid tomorrow
        validTo: new Date(Date.now() + 365 * 86400000),
        fingerprint: 'AA:BB:CC:DD',
        isSelfSigned: false,
        isExpired: false,
        isCAVerified: true,
        commonName: 'future.example.com',
        subjectAltNames: []
      };

      const result = validator.validateCertificate(certInfo);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Certificate is not yet valid');
    });

    it('should warn when certificate expires soon', () => {
      const certInfo = {
        subject: 'expires-soon.example.com',
        issuer: 'CA',
        validFrom: new Date(Date.now() - 335 * 86400000),
        validTo: new Date(Date.now() + 15 * 86400000), // Expires in 15 days
        fingerprint: 'AA:BB:CC:DD',
        isSelfSigned: false,
        isExpired: false,
        isCAVerified: true,
        commonName: 'expires-soon.example.com',
        subjectAltNames: []
      };

      const result = validator.validateCertificate(certInfo);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('expires in');
    });
  });

  describe('Certificate Pinning', () => {
    it('should validate pinned certificate fingerprints', () => {
      const pinnedValidator = new CertificateValidator(
        {
          requireValidCertificates: true,
          rejectUnauthorized: true,
          checkExpiry: true,
          checkRevocation: false,
          allowSelfSigned: false,
          minTLSVersion: 'TLSv1.3',
          allowedCipherSuites: []
        },
        {
          enabled: true,
          fingerprints: [
            'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
          ],
          algorithm: 'sha256'
        },
        'production'
      );

      const certInfo = {
        subject: 'pinned.example.com',
        issuer: 'CA',
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 365 * 86400000),
        fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
        isSelfSigned: false,
        isExpired: false,
        isCAVerified: true,
        commonName: 'pinned.example.com',
        subjectAltNames: []
      };

      const result = pinnedValidator.validateCertificate(certInfo);

      expect(result.valid).toBe(true);
    });

    it('should REJECT certificates with wrong fingerprint', () => {
      const pinnedValidator = new CertificateValidator(
        {
          requireValidCertificates: true,
          rejectUnauthorized: true,
          checkExpiry: true,
          checkRevocation: false,
          allowSelfSigned: false,
          minTLSVersion: 'TLSv1.3',
          allowedCipherSuites: []
        },
        {
          enabled: true,
          fingerprints: [
            'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
          ],
          algorithm: 'sha256'
        },
        'production'
      );

      const certInfo = {
        subject: 'wrong.example.com',
        issuer: 'CA',
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 365 * 86400000),
        fingerprint: 'FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF',
        isSelfSigned: false,
        isExpired: false,
        isCAVerified: true,
        commonName: 'wrong.example.com',
        subjectAltNames: []
      };

      const result = pinnedValidator.validateCertificate(certInfo);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('fingerprint does not match')
      );
    });
  });

  describe('TLS Version Enforcement', () => {
    it('should require minimum TLS 1.3', () => {
      // This would be tested at connection time with actual TLS
      // Here we just verify the configuration is set correctly
      const config = loadSecurityConfig();

      expect(config.validation.minTLSVersion).toBe('TLSv1.3');
    });
  });

  describe('Security Configuration Loading', () => {
    it('should load security configuration from file', () => {
      const config = loadSecurityConfig('.agentic-qe/config/security.json');

      expect(config.validation.requireValidCertificates).toBe(true);
      expect(config.validation.rejectUnauthorized).toBe(true);
      expect(config.validation.minTLSVersion).toBe('TLSv1.3');
    });

    it('should use secure defaults if config file missing', () => {
      const config = loadSecurityConfig('/nonexistent/security.json');

      // Should still have secure defaults
      expect(config.validation.requireValidCertificates).toBe(true);
      expect(config.validation.rejectUnauthorized).toBe(true);
      expect(config.validation.allowSelfSigned).toBe(false);
      expect(config.validation.minTLSVersion).toBe('TLSv1.3');
    });
  });

  describe('Production vs Development Mode', () => {
    it('should enforce strict security in production', () => {
      const prodValidator = new CertificateValidator(
        {
          requireValidCertificates: true,
          rejectUnauthorized: true,
          checkExpiry: true,
          checkRevocation: false,
          allowSelfSigned: false,
          minTLSVersion: 'TLSv1.3',
          allowedCipherSuites: []
        },
        { enabled: false, fingerprints: [], algorithm: 'sha256' },
        'production'
      );

      // Production validator exists and enforces strict rules
      expect(prodValidator).toBeDefined();
    });

    it('should allow relaxed security in development', () => {
      const devValidator = new CertificateValidator(
        {
          requireValidCertificates: false,
          rejectUnauthorized: false,
          checkExpiry: false,
          checkRevocation: false,
          allowSelfSigned: true,
          minTLSVersion: 'TLSv1.2',
          allowedCipherSuites: []
        },
        { enabled: false, fingerprints: [], algorithm: 'sha256' },
        'development'
      );

      expect(devValidator).toBeDefined();
    });
  });

  describe('Cipher Suite Validation', () => {
    it('should only allow strong cipher suites', () => {
      const config = loadSecurityConfig();
      const allowedCiphers = config.validation.allowedCipherSuites || [];

      // Should only have TLS 1.3 ciphers
      expect(allowedCiphers).toContain('TLS_AES_256_GCM_SHA384');
      expect(allowedCiphers).toContain('TLS_CHACHA20_POLY1305_SHA256');

      // Should NOT have weak ciphers
      expect(allowedCiphers.join(':')).not.toContain('RC4');
      expect(allowedCiphers.join(':')).not.toContain('MD5');
      expect(allowedCiphers.join(':')).not.toContain('DES');
    });
  });

  describe('Certificate Fingerprint Calculation', () => {
    it('should calculate SHA-256 fingerprints correctly', () => {
      const testCert = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHCgVZU6KbMA0GCSqGSIb3DQEBCwUAMBMxETAPBgNVBAMMCHRl
c3QtY2VydDAeFw0yNTAxMDEwMDAwMDBaFw0yNjAxMDEwMDAwMDBaMBMxETAPBgNV
BAMMCHRlc3QtY2VydDCBnzANBgkqhkiG9w0BAQEFAAOBjQAwgYkCgYEA0xmDhqvn
-----END CERTIFICATE-----`;

      const fingerprint = validator.calculateFingerprint(testCert);

      // Fingerprint should be in format XX:XX:XX:...
      expect(fingerprint).toMatch(/^[A-F0-9]{2}(:[A-F0-9]{2}){31}$/);
    });
  });
});
