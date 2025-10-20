# Secure QUIC Transport Integration Example

## Complete Production-Ready Example

This example demonstrates how to integrate secure QUIC transport with the AQE Fleet using production-grade security.

## Prerequisites

1. **CA-Signed Certificate** (Let's Encrypt or Internal CA)
2. **Security Configuration** (`.agentic-qe/config/security.json`)
3. **Environment Variables** (`NODE_ENV=production`)

## Step-by-Step Integration

### 1. Install Dependencies

```bash
npm install @agentic-qe/core
```

### 2. Obtain Certificates

**Option A: Let's Encrypt (Recommended)**

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificate
sudo certbot certonly --standalone -d fleet.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/fleet.yourdomain.com/
```

**Option B: Internal CA**

See: `docs/security/CERTIFICATE-SETUP-GUIDE.md`

### 3. Create Fleet Coordinator

```typescript
// src/fleet/SecureFleetCoordinator.ts

import { createSecureQUICTransport } from '@agentic-qe/core/transport/SecureQUICTransport';
import { Logger } from '@agentic-qe/core/utils/Logger';

export class SecureFleetCoordinator {
  private transport: any;
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  async initialize() {
    // Initialize secure QUIC transport with production certificates
    this.transport = await createSecureQUICTransport({
      host: process.env.FLEET_HOST || 'fleet.yourdomain.com',
      port: parseInt(process.env.FLEET_PORT || '4433'),

      // Security configuration (REQUIRED)
      security: {
        certPath: '/etc/letsencrypt/live/fleet.yourdomain.com/fullchain.pem',
        keyPath: '/etc/letsencrypt/live/fleet.yourdomain.com/privkey.pem',
        caPath: '/etc/letsencrypt/live/fleet.yourdomain.com/chain.pem',

        // Always enabled in production
        enableTLS: true,
        verifyPeer: true,

        // Optional: Mutual TLS
        requireClientCertificates: false,

        // Optional: Token authentication
        enableTokenAuth: true,
        token: process.env.FLEET_AUTH_TOKEN
      },

      // QUIC features
      enable0RTT: true,
      maxConcurrentStreams: 200,
      congestionControl: 'bbr',

      // Channels for different message types
      channels: [
        { id: 'coordination', name: 'Coordination', type: 'broadcast', priority: 10 },
        { id: 'test-results', name: 'Test Results', type: 'unicast', priority: 5 },
        { id: 'metrics', name: 'Metrics', type: 'multicast', priority: 1 }
      ]
    });

    // Subscribe to coordination events
    await this.setupEventHandlers();

    // Verify security status
    const securityStatus = this.transport.getSecurityStatus();
    this.logger.info('Fleet coordinator initialized', securityStatus);
  }

  private async setupEventHandlers() {
    // Handle agent status updates
    this.transport.on('message:received', (message: any) => {
      if (message.channel === 'coordination') {
        this.handleCoordinationMessage(message);
      } else if (message.channel === 'test-results') {
        this.handleTestResults(message);
      }
    });

    // Handle connection events
    this.transport.on('connection:established', (peer: any) => {
      this.logger.info('Agent connected', { peerId: peer.agentId });
    });

    this.transport.on('connection:lost', (peer: any, reason: Error) => {
      this.logger.warn('Agent disconnected', { peerId: peer.agentId, reason: reason.message });
    });

    // Handle errors
    this.transport.on('transport:error', (error: Error) => {
      this.logger.error('Transport error', { error: error.message });
    });
  }

  async broadcastTask(task: any) {
    await this.transport.broadcast({
      id: crypto.randomUUID(),
      from: 'fleet-coordinator',
      to: '*',
      channel: 'coordination',
      type: 'broadcast',
      payload: {
        action: 'task:assigned',
        task
      },
      priority: 10,
      timestamp: new Date()
    });
  }

  private async handleCoordinationMessage(message: any) {
    const { action, agentId, status } = message.payload;

    if (action === 'agent:status') {
      this.logger.debug('Agent status update', { agentId, status });
      // Update agent registry
    } else if (action === 'task:completed') {
      this.logger.info('Task completed', { agentId, taskId: message.payload.taskId });
      // Process results
    }
  }

  private async handleTestResults(message: any) {
    this.logger.info('Test results received', {
      agentId: message.from,
      results: message.payload
    });
    // Store results, update metrics, etc.
  }

  async close() {
    await this.transport.close();
  }
}
```

### 4. Create Secure Agent

```typescript
// src/agents/SecureTestGeneratorAgent.ts

import { createSecureQUICTransport } from '@agentic-qe/core/transport/SecureQUICTransport';
import { Logger } from '@agentic-qe/core/utils/Logger';

export class SecureTestGeneratorAgent {
  private transport: any;
  private logger: Logger;
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.logger = Logger.getInstance();
  }

  async connect() {
    // Connect to fleet coordinator with client certificate
    this.transport = await createSecureQUICTransport({
      host: process.env.FLEET_HOST || 'fleet.yourdomain.com',
      port: parseInt(process.env.FLEET_PORT || '4433'),

      security: {
        // Client certificate for mutual TLS
        certPath: `/etc/aqe/agents/${this.agentId}/cert.pem`,
        keyPath: `/etc/aqe/agents/${this.agentId}/key.pem`,
        caPath: '/etc/aqe/ca/ca-cert.pem',

        enableTLS: true,
        verifyPeer: true,

        // Token authentication
        enableTokenAuth: true,
        token: process.env.AGENT_AUTH_TOKEN
      },

      channels: [
        { id: 'coordination', name: 'Coordination', type: 'broadcast', priority: 10 },
        { id: 'test-results', name: 'Test Results', type: 'unicast', priority: 5 }
      ]
    });

    // Subscribe to task assignments
    this.transport.on('message:received', (message: any) => {
      if (message.payload.action === 'task:assigned') {
        this.handleTask(message.payload.task);
      }
    });

    // Report agent status periodically
    setInterval(() => this.reportStatus(), 10000);

    this.logger.info('Agent connected', { agentId: this.agentId });
  }

  private async handleTask(task: any) {
    this.logger.info('Handling task', { taskId: task.id });

    try {
      // Generate tests
      const result = await this.generateTests(task);

      // Report completion
      await this.transport.send('fleet-coordinator', {
        id: crypto.randomUUID(),
        from: this.agentId,
        to: 'fleet-coordinator',
        channel: 'test-results',
        type: 'direct',
        payload: {
          action: 'task:completed',
          taskId: task.id,
          result
        },
        priority: 5,
        timestamp: new Date()
      });
    } catch (error) {
      // Report failure
      await this.transport.send('fleet-coordinator', {
        id: crypto.randomUUID(),
        from: this.agentId,
        to: 'fleet-coordinator',
        channel: 'coordination',
        type: 'direct',
        payload: {
          action: 'task:failed',
          taskId: task.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        priority: 10,
        timestamp: new Date()
      });
    }
  }

  private async generateTests(task: any): Promise<any> {
    // Test generation logic
    return {
      tests: [],
      coverage: 0.95,
      timestamp: new Date()
    };
  }

  private async reportStatus() {
    await this.transport.send('fleet-coordinator', {
      id: crypto.randomUUID(),
      from: this.agentId,
      to: 'fleet-coordinator',
      channel: 'coordination',
      type: 'direct',
      payload: {
        action: 'agent:status',
        status: 'ready',
        load: this.getCurrentLoad()
      },
      priority: 1,
      timestamp: new Date()
    });
  }

  private getCurrentLoad(): number {
    // Calculate current load
    return 0.5;
  }

  async disconnect() {
    await this.transport.close();
  }
}
```

### 5. Environment Configuration

```bash
# .env.production

# Fleet Configuration
FLEET_HOST=fleet.yourdomain.com
FLEET_PORT=4433
NODE_ENV=production

# Authentication
FLEET_AUTH_TOKEN=your-secure-token-here
AGENT_AUTH_TOKEN=agent-secure-token-here

# Certificate Paths (Let's Encrypt)
CERT_PATH=/etc/letsencrypt/live/fleet.yourdomain.com/fullchain.pem
KEY_PATH=/etc/letsencrypt/live/fleet.yourdomain.com/privkey.pem
CA_PATH=/etc/letsencrypt/live/fleet.yourdomain.com/chain.pem

# Certificate Pinning (Optional)
ENABLE_CERT_PINNING=true
CERT_FINGERPRINTS=AA:BB:CC:DD:...

# Logging
LOG_LEVEL=info
ENABLE_AUDIT_LOGGING=true
```

### 6. Docker Deployment

```dockerfile
# Dockerfile

FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Create certificate directory
RUN mkdir -p /app/certs

# Set proper permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose QUIC port
EXPOSE 4433/udp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('./health-check.js')"

# Start application
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml

version: '3.8'

services:
  fleet-coordinator:
    build: .
    container_name: fleet-coordinator
    ports:
      - "4433:4433/udp"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - FLEET_HOST=fleet.yourdomain.com
      - FLEET_PORT=4433
    restart: unless-stopped
    networks:
      - aqe-fleet

  agent-test-generator:
    build: .
    container_name: agent-test-generator
    depends_on:
      - fleet-coordinator
    volumes:
      - /etc/aqe/agents/test-generator:/app/certs:ro
    environment:
      - NODE_ENV=production
      - FLEET_HOST=fleet-coordinator
      - FLEET_PORT=4433
      - AGENT_ID=test-generator-01
    restart: unless-stopped
    networks:
      - aqe-fleet

networks:
  aqe-fleet:
    driver: bridge
```

### 7. Kubernetes Deployment

```yaml
# k8s/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: fleet-coordinator
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fleet-coordinator
  template:
    metadata:
      labels:
        app: fleet-coordinator
    spec:
      containers:
      - name: coordinator
        image: your-registry/fleet-coordinator:latest
        ports:
        - containerPort: 4433
          protocol: UDP
        env:
        - name: NODE_ENV
          value: "production"
        - name: FLEET_HOST
          valueFrom:
            configMapKeyRef:
              name: fleet-config
              key: host
        - name: FLEET_PORT
          value: "4433"
        - name: FLEET_AUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: fleet-secrets
              key: auth-token
        volumeMounts:
        - name: certificates
          mountPath: /etc/letsencrypt
          readOnly: true
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: certificates
        secret:
          secretName: tls-certificates
      - name: logs
        persistentVolumeClaim:
          claimName: fleet-logs
```

## Security Checklist

Before deploying to production:

- [ ] CA-signed certificates installed
- [ ] Certificate expiry monitoring configured
- [ ] Auto-renewal setup (Let's Encrypt)
- [ ] Certificate pinning configured (optional)
- [ ] TLS 1.3 enforced
- [ ] Strong cipher suites only
- [ ] Private key permissions set to 0600
- [ ] Audit logging enabled
- [ ] Environment variables secured
- [ ] Firewall rules configured
- [ ] Backup certificates stored securely
- [ ] Certificate rotation procedure documented
- [ ] Incident response plan created
- [ ] Team trained on security procedures

## Monitoring

```typescript
// src/monitoring/SecurityMonitor.ts

import { SecureQUICTransport } from '@agentic-qe/core/transport/SecureQUICTransport';

export class SecurityMonitor {
  async monitorTransport(transport: SecureQUICTransport) {
    // Check security status
    const status = transport.getSecurityStatus();

    console.log('Security Status:', {
      tlsEnabled: status.tlsEnabled,
      peerVerification: status.peerVerification,
      certificatePinning: status.certificatePinning,
      minTLSVersion: status.minTLSVersion
    });

    // Check connection health
    const health = transport.getHealth();

    if (health.status !== 'healthy') {
      console.warn('Transport health degraded:', health.message);
    }

    // Monitor stats
    const stats = transport.getStats();

    console.log('Transport Stats:', {
      connectedPeers: transport.getPeers().length,
      activeStreams: stats.activeStreams,
      avgRTT: stats.avgRTT,
      packetLoss: stats.packetLoss
    });
  }
}
```

## Troubleshooting

### Certificate Errors

```bash
# Verify certificate
openssl x509 -in /etc/letsencrypt/live/fleet.yourdomain.com/fullchain.pem -text -noout

# Check expiration
openssl x509 -enddate -noout -in /etc/letsencrypt/live/fleet.yourdomain.com/fullchain.pem

# Test TLS connection
openssl s_client -connect fleet.yourdomain.com:4433 -tls1_3
```

### View Logs

```bash
# Security audit log
tail -f .agentic-qe/logs/security-audit.log

# Application log
tail -f .agentic-qe/logs/fleet.log
```

## Support

- Documentation: `docs/security/`
- Certificate Guide: `docs/security/CERTIFICATE-SETUP-GUIDE.md`
- Security Team: security@yourdomain.com

---

**Version:** 1.0.0
**Last Updated:** 2025-10-20
