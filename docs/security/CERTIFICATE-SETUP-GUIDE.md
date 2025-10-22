# Certificate Setup Guide for QUIC Transport

## Overview

The AQE Fleet QUIC transport requires **CA-signed TLS certificates** for production use. Self-signed certificates are **NEVER** allowed in production environments.

This guide covers:
1. ✅ Let's Encrypt (Free, Automated)
2. ✅ Internal Certificate Authority
3. ✅ Certificate Pinning
4. ✅ Certificate Rotation
5. ❌ Self-Signed Certificates (Development Only)

## ⚠️ CRITICAL SECURITY REQUIREMENTS

### Production Environment

**MANDATORY:**
- ✅ Use CA-signed certificates (Let's Encrypt or organizational CA)
- ✅ Enable certificate validation (`rejectUnauthorized: true`)
- ✅ Use TLS 1.3 minimum
- ✅ Verify peer certificates
- ✅ Use strong cipher suites only

**FORBIDDEN:**
- ❌ Self-signed certificates
- ❌ Disabled certificate validation (`rejectUnauthorized: false`)
- ❌ TLS 1.2 or older
- ❌ Weak cipher suites (RC4, MD5, DES)
- ❌ Expired certificates

### Development Environment

**Allowed (with warnings):**
- ⚠️ Self-signed certificates (for local testing only)
- ⚠️ Relaxed validation (never commit to production)

## Option 1: Let's Encrypt (Recommended for Production)

### Why Let's Encrypt?

- ✅ **Free** certificates
- ✅ **Automated** issuance and renewal
- ✅ **Trusted** by all major platforms
- ✅ **Easy** integration with certbot

### Step 1: Install Certbot

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot

# CentOS/RHEL
sudo yum install certbot

# macOS
brew install certbot
```

### Step 2: Obtain Certificate

**For Domain with Web Server (HTTP-01 Challenge):**

```bash
sudo certbot certonly --standalone \
  -d fleet.yourdomain.com \
  --preferred-challenges http \
  --agree-tos \
  --email admin@yourdomain.com
```

**For Domain without Web Server (DNS-01 Challenge):**

```bash
sudo certbot certonly --manual \
  -d fleet.yourdomain.com \
  --preferred-challenges dns \
  --agree-tos \
  --email admin@yourdomain.com
```

Follow the prompts to add DNS TXT records.

### Step 3: Locate Certificates

Let's Encrypt certificates are stored in:

```bash
/etc/letsencrypt/live/fleet.yourdomain.com/
├── cert.pem       # Server certificate
├── chain.pem      # Intermediate certificates
├── fullchain.pem  # cert.pem + chain.pem (use this)
└── privkey.pem    # Private key
```

### Step 4: Configure AQE Fleet

```json
{
  "quic": {
    "security": {
      "enableTLS": true,
      "verifyPeer": true,
      "certificates": {
        "certPath": "/etc/letsencrypt/live/fleet.yourdomain.com/fullchain.pem",
        "keyPath": "/etc/letsencrypt/live/fleet.yourdomain.com/privkey.pem",
        "caPath": "/etc/letsencrypt/live/fleet.yourdomain.com/chain.pem"
      }
    }
  }
}
```

### Step 5: Set Proper Permissions

```bash
# Private key should be readable only by the application user
sudo chown aqe-user:aqe-group /etc/letsencrypt/live/fleet.yourdomain.com/privkey.pem
sudo chmod 600 /etc/letsencrypt/live/fleet.yourdomain.com/privkey.pem

# Certificates can be world-readable
sudo chmod 644 /etc/letsencrypt/live/fleet.yourdomain.com/fullchain.pem
sudo chmod 644 /etc/letsencrypt/live/fleet.yourdomain.com/chain.pem
```

### Step 6: Automate Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab for automatic renewal
sudo crontab -e

# Add this line (runs twice daily)
0 0,12 * * * certbot renew --quiet --post-hook "systemctl restart aqe-fleet"
```

## Option 2: Internal Certificate Authority

### When to Use Internal CA

- 🏢 Enterprise environments
- 🔒 Air-gapped networks
- 🌐 Internal-only services
- 📜 Strict compliance requirements

### Step 1: Create Root CA

```bash
# Generate CA private key
openssl genrsa -aes256 -out ca-key.pem 4096

# Generate CA certificate (valid for 10 years)
openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -out ca-cert.pem \
  -subj "/C=US/ST=State/L=City/O=YourOrg/OU=IT/CN=YourOrg Root CA"
```

### Step 2: Generate Server Certificate

```bash
# Generate server private key
openssl genrsa -out fleet-key.pem 4096

# Create certificate signing request
openssl req -new -key fleet-key.pem -out fleet-csr.pem \
  -subj "/C=US/ST=State/L=City/O=YourOrg/OU=IT/CN=fleet.internal.com"

# Create SAN extension file
cat > san.cnf <<EOF
subjectAltName = DNS:fleet.internal.com,DNS:*.fleet.internal.com,IP:10.0.0.1
EOF

# Sign certificate with CA (valid for 1 year)
openssl x509 -req -days 365 -in fleet-csr.pem \
  -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
  -out fleet-cert.pem -sha256 -extfile san.cnf
```

### Step 3: Distribute CA Certificate

All fleet nodes need to trust your CA certificate:

```bash
# Copy CA certificate to system trust store

# Ubuntu/Debian
sudo cp ca-cert.pem /usr/local/share/ca-certificates/yourorg-ca.crt
sudo update-ca-certificates

# CentOS/RHEL
sudo cp ca-cert.pem /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust

# Node.js environment variable
export NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem
```

### Step 4: Configure AQE Fleet

```json
{
  "quic": {
    "security": {
      "enableTLS": true,
      "verifyPeer": true,
      "certificates": {
        "certPath": "/path/to/fleet-cert.pem",
        "keyPath": "/path/to/fleet-key.pem",
        "caPath": "/path/to/ca-cert.pem"
      }
    }
  }
}
```

## Option 3: Certificate Pinning (Extra Security)

Certificate pinning provides additional protection against compromised CAs.

### Step 1: Calculate Certificate Fingerprint

```bash
# Calculate SHA-256 fingerprint
openssl x509 -noout -fingerprint -sha256 -inform pem -in fleet-cert.pem

# Output: SHA256 Fingerprint=AA:BB:CC:DD:EE:FF:...
```

### Step 2: Configure Pinning

```json
{
  "tls": {
    "certificatePinning": {
      "enabled": true,
      "fingerprints": [
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
      ],
      "algorithm": "sha256"
    }
  }
}
```

### Step 3: Update Fingerprints on Certificate Rotation

**IMPORTANT:** When rotating certificates, update pinned fingerprints **BEFORE** deploying new certificates.

```bash
# Calculate new certificate fingerprint
NEW_FINGERPRINT=$(openssl x509 -noout -fingerprint -sha256 -inform pem -in new-fleet-cert.pem | cut -d= -f2)

# Add to configuration (keep old fingerprint during transition)
{
  "fingerprints": [
    "OLD:FINGERPRINT:HERE",
    "NEW:FINGERPRINT:HERE"
  ]
}

# Deploy configuration update to all nodes
# Wait for confirmation
# Deploy new certificate
# Remove old fingerprint after transition period
```

## Certificate Rotation Procedures

### Automated Rotation (Let's Encrypt)

Let's Encrypt handles rotation automatically. Just ensure auto-renewal is configured.

### Manual Rotation (Internal CA)

**30 Days Before Expiry:**

1. Generate new certificate
2. Calculate new fingerprint (if pinning enabled)
3. Update pinning configuration with **both** old and new fingerprints
4. Deploy configuration to all nodes

**7 Days Before Expiry:**

1. Deploy new certificate to all nodes
2. Restart services with rolling deployment
3. Verify all nodes using new certificate
4. Monitor for connection issues

**After Successful Rotation:**

1. Remove old fingerprint from pinning configuration
2. Securely delete old private key
3. Update certificate inventory
4. Schedule next rotation

## Development Environment Setup

### Self-Signed Certificate (Development Only)

**⚠️ WARNING: NEVER use self-signed certificates in production!**

```bash
# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -newkey rsa:4096 -keyout dev-key.pem -out dev-cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost"

# Set permissions
chmod 600 dev-key.pem
chmod 644 dev-cert.pem
```

### Development Configuration

```json
{
  "quic": {
    "security": {
      "enableTLS": true,
      "verifyPeer": false,
      "certificates": {
        "certPath": "./certs/dev-cert.pem",
        "keyPath": "./certs/dev-key.pem"
      }
    }
  }
}
```

**Set environment variable:**

```bash
export NODE_ENV=development
```

## Troubleshooting

### Certificate Verification Failed

**Error:** `Certificate verification failed: self signed certificate`

**Solution:** Use CA-signed certificates or set `NODE_ENV=development` for testing.

### Certificate Expired

**Error:** `Certificate has expired`

**Solution:** Renew certificate and restart services.

### Certificate Not Yet Valid

**Error:** `Certificate is not yet valid`

**Solution:** Check system clock synchronization (NTP).

### Wrong Host

**Error:** `Hostname/IP does not match certificate's altnames`

**Solution:** Ensure certificate includes correct Subject Alternative Names (SANs).

### Permission Denied

**Error:** `EACCES: permission denied, open 'privkey.pem'`

**Solution:** Fix file permissions:

```bash
sudo chown aqe-user:aqe-group privkey.pem
sudo chmod 600 privkey.pem
```

### Certificate Chain Incomplete

**Error:** `unable to verify the first certificate`

**Solution:** Use `fullchain.pem` instead of `cert.pem` (Let's Encrypt).

## Security Best Practices

### ✅ DO

- Use CA-signed certificates in production
- Enable certificate validation (`rejectUnauthorized: true`)
- Use TLS 1.3 minimum
- Rotate certificates before expiration
- Use strong key sizes (4096-bit RSA or 256-bit ECDSA)
- Set proper file permissions (600 for private keys)
- Monitor certificate expiration dates
- Use certificate pinning for critical services
- Automate certificate renewal
- Test certificate rotation procedures

### ❌ DON'T

- Use self-signed certificates in production
- Disable certificate validation
- Use weak cipher suites
- Store private keys in version control
- Share private keys via email or Slack
- Use certificates past expiration
- Ignore certificate warnings
- Use default passwords for CA keys
- Forget to backup private keys securely
- Use TLS 1.2 or older

## Compliance Considerations

### PCI DSS Requirements

- TLS 1.2+ required (TLS 1.3 recommended)
- Strong cipher suites only
- No weak protocols (SSL, TLS 1.0/1.1)
- Certificate expiration monitoring

### HIPAA Requirements

- End-to-end encryption
- Strong authentication
- Audit logging of certificate events
- Secure key management

### SOC 2 Requirements

- Certificate inventory
- Rotation procedures
- Access controls
- Change management

## Reference Commands

### View Certificate Details

```bash
# View certificate information
openssl x509 -in cert.pem -text -noout

# Check certificate expiration
openssl x509 -enddate -noout -in cert.pem

# Verify certificate chain
openssl verify -CAfile ca-cert.pem cert.pem

# Test TLS connection
openssl s_client -connect fleet.example.com:4433 -tls1_3
```

### Certificate Conversion

```bash
# PEM to DER
openssl x509 -outform der -in cert.pem -out cert.der

# DER to PEM
openssl x509 -inform der -in cert.der -out cert.pem

# PKCS#12 to PEM
openssl pkcs12 -in cert.p12 -out cert.pem -nodes
```

## Support

For certificate-related issues:

1. Check logs: `tail -f .agentic-qe/logs/security-audit.log`
2. Verify configuration: `cat .agentic-qe/config/security.json`
3. Test certificate: `openssl x509 -in cert.pem -text -noout`
4. Review documentation: `docs/security/`

---

**Version:** 1.0.0
**Last Updated:** 2025-10-20
**Maintainer:** AQE Security Team
