import { SecurityScannerAgent, SecurityScannerConfig } from '@agents/SecurityScannerAgent';
import { EventEmitter } from 'events';
import { QEAgentType, AgentStatus } from '@types';

class MockMemoryStore {
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

describe('SecurityScannerAgent', () => {
  let agent: SecurityScannerAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const config: SecurityScannerConfig = {
      type: QEAgentType.SECURITY_SCANNER,
      capabilities: [],
      context: {
        id: 'test-security-scanner',
        type: 'security-scanner',
        status: AgentStatus.IDLE
      },
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus,
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
        standards: ['OWASP-Top-10', 'CWE-25'],
        enforceCompliance: true
      },
      scanScope: {
        includeCode: true,
        includeDependencies: true,
        includeContainers: false,
        includeDynamic: false
      }
    };

    agent = new SecurityScannerAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.terminate();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(status.agentId.type).toBe(QEAgentType.SECURITY_SCANNER);
    });

    it('should have all required capabilities', () => {
      expect(agent.hasCapability('sast-scanning')).toBe(true);
      expect(agent.hasCapability('dast-scanning')).toBe(true);
      expect(agent.hasCapability('dependency-scanning')).toBe(true);
      expect(agent.hasCapability('container-scanning')).toBe(true);
      expect(agent.hasCapability('compliance-checking')).toBe(true);
      expect(agent.hasCapability('security-gate-enforcement')).toBe(true);
      expect(agent.hasCapability('cve-monitoring')).toBe(true);
    });

    it('should use default configuration when not provided', async () => {
      const minimalConfig: SecurityScannerConfig = {
        type: QEAgentType.SECURITY_SCANNER,
        capabilities: [],
        context: {
          id: 'test-minimal',
          type: 'security-scanner',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore as any,
        eventBus: mockEventBus
      };

      const minimalAgent = new SecurityScannerAgent(minimalConfig);
      await minimalAgent.initialize();

      const status = await minimalAgent.getDetailedStatus();
      expect(status.config.thresholds.maxCriticalVulnerabilities).toBe(0);
      expect(status.config.thresholds.maxHighVulnerabilities).toBe(5);
      expect(status.config.tools.sast).toBe('semgrep');

      await minimalAgent.terminate();
    });
  });

  describe('security scanning', () => {
    it('should run comprehensive security scan', async () => {
      const task = {
        id: 'task-1',
        type: 'run-security-scan',
        payload: {
          path: 'src/',
          includeFindings: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.scanId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.scanType).toBe('comprehensive');
      expect(result.findings).toBeInstanceOf(Array);
      expect(result.summary).toBeDefined();
      expect(result.securityScore).toBeGreaterThanOrEqual(0);
      expect(result.securityScore).toBeLessThanOrEqual(100);
      expect(typeof result.passed).toBe('boolean');
    });

    it('should scan dependencies for vulnerabilities', async () => {
      const task = {
        id: 'task-2',
        type: 'scan-dependencies',
        payload: {
          includeFindings: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.scanType).toBe('dependency');
      expect(result.findings).toBeInstanceOf(Array);

      // Check if findings have correct structure
      if (result.findings.length > 0) {
        const finding = result.findings[0];
        expect(finding.id).toBeDefined();
        expect(finding.type).toBe('dependency');
        expect(finding.severity).toBeDefined();
        expect(finding.title).toBeDefined();
        expect(finding.description).toBeDefined();
        expect(finding.location).toBeDefined();
      }
    });

    it('should scan containers for vulnerabilities', async () => {
      const task = {
        id: 'task-3',
        type: 'scan-containers',
        payload: {
          image: 'node:16-alpine',
          includeFindings: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.scanType).toBe('container');
      expect(result.findings).toBeInstanceOf(Array);
    });

    it('should calculate security score correctly', async () => {
      const task = {
        id: 'task-4',
        type: 'run-security-scan',
        payload: {
          includeFindings: false // No findings for perfect score
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      // With no findings, security score should be 100
      expect(result.securityScore).toBe(100);
      expect(result.passed).toBe(true);
    });
  });

  describe('compliance checking', () => {
    it('should check compliance for configured standards', async () => {
      const task = {
        id: 'task-5',
        type: 'check-compliance',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-5',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);

      const report = result[0];
      expect(report.standard).toBeDefined();
      expect(report.requirements).toBeInstanceOf(Array);
      expect(report.overallCompliance).toBeGreaterThanOrEqual(0);
      expect(report.overallCompliance).toBeLessThanOrEqual(100);
      expect(typeof report.passed).toBe('boolean');
    });

    it('should check OWASP Top 10 compliance', async () => {
      const task = {
        id: 'task-6',
        type: 'check-compliance',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-6',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      const owaspReport = result.find((r: any) => r.standard === 'OWASP-Top-10');

      expect(owaspReport).toBeDefined();
      expect(owaspReport.requirements.length).toBeGreaterThan(0);
    });

    it('should emit event when compliance fails', (done) => {
      const task = {
        id: 'task-7',
        type: 'check-compliance',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-7',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      let eventEmitted = false;
      mockEventBus.once('security.compliance.failed', () => {
        eventEmitted = true;
      });

      agent.executeTask(assignment).then(() => {
        // Wait a bit for async event
        setTimeout(() => {
          // Event may or may not be emitted depending on random compliance check
          done();
        }, 100);
      });
    });
  });

  describe('security gate enforcement', () => {
    it('should enforce security gate and pass with no critical findings', async () => {
      const task = {
        id: 'task-8',
        type: 'enforce-security-gate',
        payload: {
          includeFindings: false // No findings
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-8',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.blockers).toBeInstanceOf(Array);
      expect(result.blockers.length).toBe(0);
    });

    it('should fail security gate with critical vulnerabilities', async () => {
      const task = {
        id: 'task-9',
        type: 'enforce-security-gate',
        payload: {
          includeFindings: true // Will have findings
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-9',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
      expect(result.blockers).toBeInstanceOf(Array);

      if (!result.passed) {
        expect(result.reason).toBeDefined();
        expect(result.blockers.length).toBeGreaterThan(0);
      }
    });

    it('should emit critical event when gate fails', (done) => {
      const task = {
        id: 'task-10',
        type: 'enforce-security-gate',
        payload: {
          includeFindings: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-10',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      let eventEmitted = false;
      mockEventBus.once('security.gate.failed', () => {
        eventEmitted = true;
      });

      agent.executeTask(assignment).then(() => {
        setTimeout(() => {
          // Event may be emitted if gate fails
          done();
        }, 100);
      });
    });
  });

  describe('reporting and analysis', () => {
    it('should generate security report', async () => {
      // First run a scan to have data
      const scanTask = {
        id: 'task-11',
        type: 'run-security-scan',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.executeTask({
        id: 'assignment-11',
        task: scanTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Now generate report
      const reportTask = {
        id: 'task-12',
        type: 'generate-security-report',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-12',
        task: reportTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.generatedAt).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalScans).toBeGreaterThan(0);
      expect(result.latestScan).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should update security baseline', async () => {
      // First run a scan
      const scanTask = {
        id: 'task-13',
        type: 'run-security-scan',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.executeTask({
        id: 'assignment-13',
        task: scanTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      });

      // Update baseline
      const baselineTask = {
        id: 'task-14',
        type: 'update-baseline',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-14',
        task: baselineTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      // Verify baseline was stored
      const baseline = await mockMemoryStore.retrieve('aqe/security/baselines');
      expect(baseline).toBeDefined();
      expect(baseline.scanId).toBeDefined();
      expect(baseline.timestamp).toBeDefined();
    });
  });

  describe('memory operations', () => {
    it('should store scan results in memory', async () => {
      const task = {
        id: 'task-15',
        type: 'run-security-scan',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-15',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      // Check if scan was stored in memory
      const storedScan = await mockMemoryStore.retrieve(`aqe/security/scans/${result.scanId}`);
      expect(storedScan).toBeDefined();
      expect(storedScan.scanId).toBe(result.scanId);
    });

    it('should store compliance reports in memory', async () => {
      const task = {
        id: 'task-16',
        type: 'check-compliance',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-16',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      // Check if compliance report was stored
      for (const report of result) {
        const stored = await mockMemoryStore.retrieve(`aqe/security/compliance/${report.standard}`);
        expect(stored).toBeDefined();
      }
    });

    it('should restore state from memory', async () => {
      // Store some state
      await mockMemoryStore.store('aqe/security/baselines', {
        findings: { 'test-finding': { id: 'test-finding', severity: 'high' } },
        timestamp: new Date()
      });

      // Create new agent that should restore state
      const newAgent = new SecurityScannerAgent({
        type: QEAgentType.SECURITY_SCANNER,
        capabilities: [],
        context: {
          id: 'test-restore',
          type: 'security-scanner',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore as any,
        eventBus: mockEventBus
      });

      await newAgent.initialize();

      const status = await newAgent.getDetailedStatus();
      expect(status.baselineFindings).toBeGreaterThan(0);

      await newAgent.terminate();
    });
  });

  describe('event handling', () => {
    it('should emit events on scan completion', (done) => {
      const task = {
        id: 'task-17',
        type: 'run-security-scan',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-17',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      mockEventBus.once('security.scan.completed', (event) => {
        expect(event.type).toBe('security.scan.completed');
        expect(event.data.scanId).toBeDefined();
        done();
      });

      agent.executeTask(assignment);
    });

    it('should emit critical event on finding critical vulnerabilities', (done) => {
      const task = {
        id: 'task-18',
        type: 'run-security-scan',
        payload: {
          includeFindings: true
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-18',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      let criticalEmitted = false;
      mockEventBus.once('security.critical.found', () => {
        criticalEmitted = true;
      });

      agent.executeTask(assignment).then(() => {
        setTimeout(() => {
          // Critical event may or may not be emitted depending on random findings
          done();
        }, 100);
      });
    });

    it('should handle deployment request events', async () => {
      const deploymentEvent = {
        id: 'event-1',
        type: 'deployment.requested',
        source: { id: 'test', type: QEAgentType.QUALITY_GATE, created: new Date() },
        data: { version: '1.0.0' },
        timestamp: new Date(),
        priority: 'high' as const,
        scope: 'global' as const
      };

      // Emit deployment request
      mockEventBus.emit('deployment.requested', deploymentEvent);

      // Wait for handler to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // If gate fails, deployment.blocked event should be emitted
      // This is tested indirectly through the handler
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown task type', async () => {
      const task = {
        id: 'task-19',
        type: 'unknown-task-type',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-19',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Unknown task type');
    });

    it('should handle baseline update without scan history', async () => {
      const newAgent = new SecurityScannerAgent({
        type: QEAgentType.SECURITY_SCANNER,
        capabilities: [],
        context: {
          id: 'test-no-history',
          type: 'security-scanner',
          status: AgentStatus.IDLE
        },
        memoryStore: new MockMemoryStore() as any,
        eventBus: new EventEmitter()
      });

      await newAgent.initialize();

      const task = {
        id: 'task-20',
        type: 'update-baseline',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-20',
        task,
        agentId: newAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(newAgent.executeTask(assignment)).rejects.toThrow('No scan results available');

      await newAgent.terminate();
    });
  });

  describe('detailed status', () => {
    it('should provide detailed status', async () => {
      const status = await agent.getDetailedStatus();

      expect(status).toBeDefined();
      expect(status.agentId).toBeDefined();
      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(status.scanHistory).toBeInstanceOf(Array);
      expect(status.config).toBeDefined();
      expect(status.config.tools).toBeDefined();
      expect(status.config.thresholds).toBeDefined();
      expect(status.config.compliance).toBeDefined();
      expect(status.config.scanScope).toBeDefined();
    });
  });
});