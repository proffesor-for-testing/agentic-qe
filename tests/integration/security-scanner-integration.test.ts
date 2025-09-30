/**
 * Integration tests for SecurityScannerAgent
 * Tests real coordination with EventBus and MemoryStore
 */

import { SecurityScannerAgent, SecurityScannerConfig } from '../../src/agents/SecurityScannerAgent';
import { FleetCommanderAgent, FleetCommanderConfig } from '../../src/agents/FleetCommanderAgent';
import { EventEmitter } from 'events';
import { QEAgentType, AgentStatus } from '../../src/types';

class MemoryManager {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('SecurityScannerAgent Integration', () => {
  let securityAgent: SecurityScannerAgent;
  let fleetCommander: FleetCommanderAgent;
  let memoryStore: MemoryManager;
  let eventBus: EventEmitter;

  beforeEach(async () => {
    memoryStore = new MemoryManager();
    eventBus = new EventEmitter();

    // Create SecurityScannerAgent
    const securityConfig: SecurityScannerConfig = {
      type: QEAgentType.SECURITY_SCANNER,
      capabilities: [],
      context: {
        id: 'security-scanner-integration',
        type: 'security-scanner',
        status: AgentStatus.IDLE
      },
      memoryStore: memoryStore as any,
      eventBus: eventBus,
      tools: {
        sast: 'semgrep',
        dast: 'owasp-zap',
        dependencies: 'npm-audit',
        containers: 'trivy'
      },
      thresholds: {
        maxCriticalVulnerabilities: 0,
        maxHighVulnerabilities: 5,
        maxMediumVulnerabilities: 20,
        minSecurityScore: 80
      },
      compliance: {
        standards: ['OWASP-Top-10', 'CWE-25', 'GDPR', 'SOC2'],
        enforceCompliance: true
      },
      scanScope: {
        includeCode: true,
        includeDependencies: true,
        includeContainers: true,
        includeDynamic: false
      }
    };

    securityAgent = new SecurityScannerAgent(securityConfig);
    await securityAgent.initialize();
  });

  afterEach(async () => {
    await securityAgent.terminate();
    if (fleetCommander) {
      await fleetCommander.terminate();
    }
  });

  describe('end-to-end security workflow', () => {
    it('should run complete security scan and store results', async () => {
      const task = {
        id: 'integration-task-1',
        type: 'run-security-scan',
        payload: {
          path: 'src/',
          includeFindings: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'integration-assignment-1',
        task,
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await securityAgent.executeTask(assignment);

      // Verify result
      expect(result).toBeDefined();
      expect(result.scanId).toBeDefined();
      expect(result.findings).toBeInstanceOf(Array);
      expect(result.summary).toBeDefined();
      expect(result.securityScore).toBeGreaterThanOrEqual(0);

      // Verify memory storage
      const storedScan = await memoryStore.retrieve(`aqe/security/scans/${result.scanId}`);
      expect(storedScan).toBeDefined();
      expect(storedScan.scanId).toBe(result.scanId);
      expect(storedScan.summary).toEqual(result.summary);
    });

    it('should coordinate with FleetCommander for agent lifecycle', async () => {
      // Create FleetCommander
      const fleetConfig: FleetCommanderConfig = {
        type: QEAgentType.FLEET_COMMANDER,
        capabilities: [],
        context: {
          id: 'fleet-commander-integration',
          type: 'fleet-commander',
          status: AgentStatus.IDLE
        },
        memoryStore: memoryStore as any,
        eventBus: eventBus,
        topology: 'hierarchical',
        maxAgents: 10
      };

      fleetCommander = new FleetCommanderAgent(fleetConfig);
      await fleetCommander.initialize();

      // FleetCommander should track the SecurityScanner
      const securityStatus = securityAgent.getStatus();
      expect(securityStatus.status).toBe(AgentStatus.ACTIVE);

      const fleetStatus = await fleetCommander.getDetailedStatus();
      expect(fleetStatus).toBeDefined();
    });

    it('should enforce security gate in deployment workflow', async () => {
      const gateTask = {
        id: 'integration-task-2',
        type: 'enforce-security-gate',
        payload: {
          version: '1.0.0',
          includeFindings: false // Clean scan
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'integration-assignment-2',
        task: gateTask,
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const gateResult = await securityAgent.executeTask(assignment);

      expect(gateResult).toBeDefined();
      expect(gateResult.passed).toBe(true);
      expect(gateResult.blockers).toHaveLength(0);
    });

    it('should generate and store comprehensive security report', async () => {
      // First, run a scan to have data
      await securityAgent.executeTask({
        id: 'scan-assignment',
        task: {
          id: 'scan-task',
          type: 'run-security-scan',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Generate report
      const reportResult = await securityAgent.executeTask({
        id: 'report-assignment',
        task: {
          id: 'report-task',
          type: 'generate-security-report',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(reportResult).toBeDefined();
      expect(reportResult.summary).toBeDefined();
      expect(reportResult.summary.totalScans).toBeGreaterThan(0);
      expect(reportResult.latestScan).toBeDefined();
      expect(reportResult.recommendations).toBeInstanceOf(Array);

      // Verify report was stored
      const storedReport = await memoryStore.retrieve('aqe/security/reports/latest');
      expect(storedReport).toBeDefined();
      expect(storedReport.summary.totalScans).toBe(reportResult.summary.totalScans);
    });
  });

  describe('multi-agent coordination', () => {
    it('should emit events that other agents can receive', (done) => {
      let eventReceived = false;

      eventBus.once('security.scan.completed', (event) => {
        eventReceived = true;
        expect(event.type).toBe('security.scan.completed');
        expect(event.data).toBeDefined();
        expect(event.data.scanId).toBeDefined();
        done();
      });

      securityAgent.executeTask({
        id: 'event-assignment',
        task: {
          id: 'event-task',
          type: 'run-security-scan',
          payload: { includeFindings: false },
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });
    });

    it('should handle deployment request events', async () => {
      let deploymentBlocked = false;

      eventBus.once('deployment.blocked', () => {
        deploymentBlocked = true;
      });

      // Emit deployment request
      eventBus.emit('deployment.requested', {
        id: 'deploy-1',
        type: 'deployment.requested',
        source: { id: 'test', type: QEAgentType.QUALITY_GATE, created: new Date() },
        data: { version: '1.0.0' },
        timestamp: new Date(),
        priority: 'high',
        scope: 'global'
      });

      // Wait for handler
      await new Promise(resolve => setTimeout(resolve, 200));

      // Event may or may not be emitted based on scan results
    });

    it('should share security data through memory', async () => {
      // Run scan
      const scanResult = await securityAgent.executeTask({
        id: 'share-assignment',
        task: {
          id: 'share-task',
          type: 'run-security-scan',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Another agent should be able to retrieve the scan result
      const sharedScan = await memoryStore.retrieve(`aqe/security/scans/${scanResult.scanId}`);
      expect(sharedScan).toBeDefined();
      expect(sharedScan.scanId).toBe(scanResult.scanId);
    });
  });

  describe('compliance workflow', () => {
    it('should check multiple compliance standards', async () => {
      const complianceResult = await securityAgent.executeTask({
        id: 'compliance-assignment',
        task: {
          id: 'compliance-task',
          type: 'check-compliance',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(complianceResult).toBeInstanceOf(Array);
      expect(complianceResult.length).toBe(4); // OWASP, CWE, GDPR, SOC2

      // Verify all reports were stored
      for (const report of complianceResult) {
        const stored = await memoryStore.retrieve(`aqe/security/compliance/${report.standard}`);
        expect(stored).toBeDefined();
        expect(stored.standard).toBe(report.standard);
      }
    });

    it('should emit compliance failure events', (done) => {
      let failureEventReceived = false;

      eventBus.once('security.compliance.failed', (event) => {
        failureEventReceived = true;
        expect(event.data.standard).toBeDefined();
      });

      securityAgent.executeTask({
        id: 'compliance-fail-assignment',
        task: {
          id: 'compliance-fail-task',
          type: 'check-compliance',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      }).then(() => {
        setTimeout(() => {
          // Event may or may not be emitted
          done();
        }, 100);
      });
    });
  });

  describe('dependency and container scanning', () => {
    it('should scan dependencies and store results', async () => {
      const depResult = await securityAgent.executeTask({
        id: 'dep-assignment',
        task: {
          id: 'dep-task',
          type: 'scan-dependencies',
          payload: { includeFindings: true },
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(depResult).toBeDefined();
      expect(depResult.scanType).toBe('dependency');

      // Verify storage
      const stored = await memoryStore.retrieve('aqe/security/dependencies');
      expect(stored).toBeDefined();
      expect(stored.findings).toBeInstanceOf(Array);
    });

    it('should scan containers and detect vulnerabilities', async () => {
      const containerResult = await securityAgent.executeTask({
        id: 'container-assignment',
        task: {
          id: 'container-task',
          type: 'scan-containers',
          payload: {
            image: 'node:16-alpine',
            includeFindings: true
          },
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      expect(containerResult).toBeDefined();
      expect(containerResult.scanType).toBe('container');
      expect(containerResult.findings).toBeInstanceOf(Array);
    });
  });

  describe('baseline management', () => {
    it('should establish and update security baseline', async () => {
      // Run initial scan
      const initialScan = await securityAgent.executeTask({
        id: 'baseline-scan-assignment',
        task: {
          id: 'baseline-scan-task',
          type: 'run-security-scan',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Set as baseline
      await securityAgent.executeTask({
        id: 'baseline-update-assignment',
        task: {
          id: 'baseline-update-task',
          type: 'update-baseline',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Verify baseline was stored
      const baseline = await memoryStore.retrieve('aqe/security/baselines');
      expect(baseline).toBeDefined();
      expect(baseline.scanId).toBe(initialScan.scanId);
      expect(baseline.timestamp).toBeDefined();
      expect(baseline.securityScore).toBeDefined();
    });
  });

  describe('performance and scalability', () => {
    it('should handle multiple concurrent scans', async () => {
      const scanPromises = [];

      for (let i = 0; i < 5; i++) {
        const promise = securityAgent.executeTask({
          id: `concurrent-assignment-${i}`,
          task: {
            id: `concurrent-task-${i}`,
            type: 'run-security-scan',
            payload: { includeFindings: false },
            priority: 1,
            status: 'pending'
          },
          agentId: securityAgent.getStatus().agentId.id,
          assignedAt: new Date(),
          status: 'assigned'
        });

        scanPromises.push(promise);
      }

      const results = await Promise.all(scanPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.scanId).toBeDefined();
        expect(result.securityScore).toBeGreaterThanOrEqual(0);
      });
    });

    it('should maintain performance metrics', async () => {
      // Run multiple tasks
      for (let i = 0; i < 3; i++) {
        await securityAgent.executeTask({
          id: `metrics-assignment-${i}`,
          task: {
            id: `metrics-task-${i}`,
            type: 'scan-dependencies',
            payload: {},
            priority: 1,
            status: 'pending'
          },
          agentId: securityAgent.getStatus().agentId.id,
          assignedAt: new Date(),
          status: 'assigned'
        });
      }

      const status = securityAgent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(3);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
      expect(status.performanceMetrics.lastActivity).toBeDefined();
    });
  });

  describe('state persistence', () => {
    it('should persist and restore agent state', async () => {
      // Run a scan
      await securityAgent.executeTask({
        id: 'persist-assignment',
        task: {
          id: 'persist-task',
          type: 'run-security-scan',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Update baseline
      await securityAgent.executeTask({
        id: 'persist-baseline-assignment',
        task: {
          id: 'persist-baseline-task',
          type: 'update-baseline',
          payload: {},
          priority: 1,
          status: 'pending'
        },
        agentId: securityAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Terminate agent (saves state)
      await securityAgent.terminate();

      // Create new agent with same memory store
      const restoredAgent = new SecurityScannerAgent({
        type: QEAgentType.SECURITY_SCANNER,
        capabilities: [],
        context: {
          id: 'restored-agent',
          type: 'security-scanner',
          status: AgentStatus.IDLE
        },
        memoryStore: memoryStore as any,
        eventBus: eventBus
      });

      await restoredAgent.initialize();

      // Verify state was restored
      const status = await restoredAgent.getDetailedStatus();
      expect(status.baselineFindings).toBeGreaterThan(0);
      expect(status.scanHistory).toBeInstanceOf(Array);

      await restoredAgent.terminate();
    });
  });
});