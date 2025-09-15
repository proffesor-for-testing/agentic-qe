/**
 * Integration tests for agent collaboration
 */

import { EventEmitter } from 'events';
import {
  RequirementsExplorerAgent,
  RiskOracleAgent,
  SecuritySentinelAgent,
  HierarchicalCoordinatorAgent,
  MeshCoordinatorAgent
} from '../../src/agents';
import { DistributedMemorySystem } from '../../src/memory/distributed-memory';
import {
  AgentId,
  AgentConfig,
  TaskDefinition,
  PACTLevel,
  ILogger,
  IEventBus
} from '../../src/core/types';

describe('Agent Collaboration Integration Tests', () => {
  let logger: ILogger;
  let eventBus: IEventBus;
  let memory: DistributedMemorySystem;

  beforeEach(() => {
    logger = console;
    eventBus = new EventEmitter() as IEventBus;
    memory = new DistributedMemorySystem(logger, eventBus);
  });

  describe('Requirements-Risk-Security Pipeline', () => {
    it('should collaborate on requirement analysis and risk assessment', async () => {
      // Create agents
      const reqAgent = new RequirementsExplorerAgent(
        { id: 'req-001', swarmId: 'test', type: 'requirements-explorer', instance: 1 },
        {
          name: 'Requirements Explorer',
          type: 'requirements-explorer',
          pactLevel: PACTLevel.COLLABORATIVE,
          capabilities: {
            maxConcurrentTasks: 3,
            supportedTaskTypes: ['analyze-requirements'],
            pactLevel: PACTLevel.COLLABORATIVE,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'internal'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 5000
          }
        },
        logger,
        eventBus,
        memory
      );

      const riskAgent = new RiskOracleAgent(
        { id: 'risk-001', swarmId: 'test', type: 'risk-oracle', instance: 1 },
        {
          name: 'Risk Oracle',
          type: 'risk-oracle',
          pactLevel: PACTLevel.PROACTIVE,
          capabilities: {
            maxConcurrentTasks: 3,
            supportedTaskTypes: ['risk-assessment'],
            pactLevel: PACTLevel.PROACTIVE,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'internal'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 5000
          }
        },
        logger,
        eventBus,
        memory
      );

      const secAgent = new SecuritySentinelAgent(
        { id: 'sec-001', swarmId: 'test', type: 'security-sentinel', instance: 1 },
        {
          name: 'Security Sentinel',
          type: 'security-sentinel',
          pactLevel: PACTLevel.TARGETED,
          capabilities: {
            maxConcurrentTasks: 3,
            supportedTaskTypes: ['security-scan'],
            pactLevel: PACTLevel.TARGETED,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'elevated'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 5000
          }
        },
        logger,
        eventBus,
        memory
      );

      // Initialize agents
      await Promise.all([
        reqAgent.initialize(),
        riskAgent.initialize(),
        secAgent.initialize()
      ]);

      // Phase 1: Requirements Analysis
      const reqTask: TaskDefinition = {
        id: 'req-task-001',
        type: 'analyze-requirements',
        priority: 'high',
        context: {
          requirements: [
            'User authentication with OAuth2',
            'Handle 1000 concurrent users',
            'Process payments securely',
            'Response time under 500ms'
          ]
        },
        constraints: {},
        dependencies: [],
        expectedOutcome: 'Requirements analysis',
        metadata: {}
      };

      const reqResult = await reqAgent.executeTask(reqTask);
      expect(reqResult.success).toBe(true);
      expect(reqResult.decision).toBeDefined();

      // Store requirements analysis in shared memory
      await memory.store('requirements-analysis', reqResult, {
        agentId: 'req-001',
        timestamp: new Date(),
        ttl: 3600000
      });

      // Phase 2: Risk Assessment based on requirements
      const riskTask: TaskDefinition = {
        id: 'risk-task-001',
        type: 'risk-assessment',
        priority: 'high',
        context: {
          requirementsAnalysis: reqResult,
          criticalAreas: ['authentication', 'payments', 'performance']
        },
        constraints: {},
        dependencies: ['req-task-001'],
        expectedOutcome: 'Risk assessment',
        metadata: {}
      };

      const riskResult = await riskAgent.executeTask(riskTask);
      expect(riskResult.success).toBe(true);
      expect(riskResult.decision.risks).toBeDefined();

      // Store risk assessment in shared memory
      await memory.store('risk-assessment', riskResult, {
        agentId: 'risk-001',
        timestamp: new Date(),
        ttl: 3600000
      });

      // Phase 3: Security Scan based on risks
      const secTask: TaskDefinition = {
        id: 'sec-task-001',
        type: 'security-scan',
        priority: 'critical',
        context: {
          risks: riskResult.decision.risks,
          endpoints: ['/api/auth', '/api/payment'],
          vulnerabilities: ['SQL Injection', 'XSS', 'CSRF']
        },
        constraints: {},
        dependencies: ['risk-task-001'],
        expectedOutcome: 'Security vulnerabilities',
        metadata: {}
      };

      const secResult = await secAgent.executeTask(secTask);
      expect(secResult.success).toBe(true);

      // Verify collaboration through shared memory
      const sharedReqData = await memory.retrieve('requirements-analysis');
      const sharedRiskData = await memory.retrieve('risk-assessment');

      expect(sharedReqData).toBeDefined();
      expect(sharedRiskData).toBeDefined();
    });
  });

  describe('Swarm Coordination', () => {
    it('should coordinate agents in hierarchical topology', async () => {
      const coordinator = new HierarchicalCoordinatorAgent(
        { id: 'coord-001', swarmId: 'test', type: 'hierarchical-coordinator', instance: 1 },
        {
          name: 'Hierarchical Coordinator',
          type: 'hierarchical-coordinator',
          pactLevel: PACTLevel.AUTONOMOUS,
          capabilities: {
            maxConcurrentTasks: 5,
            supportedTaskTypes: ['coordinate-swarm'],
            pactLevel: PACTLevel.AUTONOMOUS,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'elevated'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 10000
          }
        },
        logger,
        eventBus,
        memory
      );

      await coordinator.initialize();

      // Create worker agents
      const workers = [];
      for (let i = 1; i <= 3; i++) {
        const worker = new RequirementsExplorerAgent(
          { id: `worker-${i}`, swarmId: 'test', type: 'requirements-explorer', instance: i },
          {
            name: `Worker ${i}`,
            type: 'requirements-explorer',
            pactLevel: PACTLevel.COLLABORATIVE,
            capabilities: {
              maxConcurrentTasks: 1,
              supportedTaskTypes: ['analyze-requirements'],
              pactLevel: PACTLevel.COLLABORATIVE,
              rstHeuristics: ['SFDIPOT'],
              contextAwareness: true,
              explainability: true,
              learningEnabled: true,
              securityClearance: 'internal'
            },
            environment: {
              runtime: 'node',
              version: '18.0.0',
              workingDirectory: '.',
              logLevel: 'info',
              timeout: 5000
            }
          },
          logger,
          eventBus,
          memory
        );
        await worker.initialize();
        workers.push(worker);
      }

      // Coordinate swarm task
      const coordTask: TaskDefinition = {
        id: 'coord-task-001',
        type: 'coordinate-swarm',
        priority: 'high',
        context: {
          topology: 'hierarchical',
          agents: workers.map(w => w.id.id),
          task: 'Distributed requirements analysis',
          subtasks: [
            'Analyze functional requirements',
            'Analyze non-functional requirements',
            'Identify ambiguities'
          ]
        },
        constraints: {},
        dependencies: [],
        expectedOutcome: 'Coordinated analysis',
        metadata: {}
      };

      const coordResult = await coordinator.executeTask(coordTask);
      expect(coordResult.success).toBe(true);
      expect(coordResult.decision.action).toContain('coordinate');
    });

    it('should coordinate agents in mesh topology', async () => {
      const meshCoordinator = new MeshCoordinatorAgent(
        { id: 'mesh-001', swarmId: 'test', type: 'mesh-coordinator', instance: 1 },
        {
          name: 'Mesh Coordinator',
          type: 'mesh-coordinator',
          pactLevel: PACTLevel.COLLABORATIVE,
          capabilities: {
            maxConcurrentTasks: 5,
            supportedTaskTypes: ['coordinate-swarm'],
            pactLevel: PACTLevel.COLLABORATIVE,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'internal'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 10000
          }
        },
        logger,
        eventBus,
        memory
      );

      await meshCoordinator.initialize();

      // Create peer agents
      const peers = [];
      for (let i = 1; i <= 3; i++) {
        const peer = new RiskOracleAgent(
          { id: `peer-${i}`, swarmId: 'test', type: 'risk-oracle', instance: i },
          {
            name: `Peer ${i}`,
            type: 'risk-oracle',
            pactLevel: PACTLevel.COLLABORATIVE,
            capabilities: {
              maxConcurrentTasks: 1,
              supportedTaskTypes: ['risk-assessment'],
              pactLevel: PACTLevel.COLLABORATIVE,
              rstHeuristics: ['SFDIPOT'],
              contextAwareness: true,
              explainability: true,
              learningEnabled: true,
              securityClearance: 'internal'
            },
            environment: {
              runtime: 'node',
              version: '18.0.0',
              workingDirectory: '.',
              logLevel: 'info',
              timeout: 5000
            }
          },
          logger,
          eventBus,
          memory
        );
        await peer.initialize();
        peers.push(peer);
      }

      const meshTask: TaskDefinition = {
        id: 'mesh-task-001',
        type: 'coordinate-swarm',
        priority: 'high',
        context: {
          topology: 'mesh',
          agents: peers.map(p => p.id.id),
          task: 'Collaborative risk assessment',
          consensus: 'majority'
        },
        constraints: {},
        dependencies: [],
        expectedOutcome: 'Peer coordination',
        metadata: {}
      };

      const meshResult = await meshCoordinator.executeTask(meshTask);
      expect(meshResult.success).toBe(true);
    });
  });

  describe('Memory Sharing', () => {
    it('should share knowledge between agents', async () => {
      const agent1 = new RequirementsExplorerAgent(
        { id: 'agent-1', swarmId: 'test', type: 'requirements-explorer', instance: 1 },
        {
          name: 'Agent 1',
          type: 'requirements-explorer',
          pactLevel: PACTLevel.COLLABORATIVE,
          capabilities: {
            maxConcurrentTasks: 1,
            supportedTaskTypes: ['analyze-requirements'],
            pactLevel: PACTLevel.COLLABORATIVE,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'internal'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 5000
          }
        },
        logger,
        eventBus,
        memory
      );

      const agent2 = new RiskOracleAgent(
        { id: 'agent-2', swarmId: 'test', type: 'risk-oracle', instance: 1 },
        {
          name: 'Agent 2',
          type: 'risk-oracle',
          pactLevel: PACTLevel.COLLABORATIVE,
          capabilities: {
            maxConcurrentTasks: 1,
            supportedTaskTypes: ['risk-assessment'],
            pactLevel: PACTLevel.COLLABORATIVE,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'internal'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 5000
          }
        },
        logger,
        eventBus,
        memory
      );

      await agent1.initialize();
      await agent2.initialize();

      // Agent 1 stores knowledge
      const knowledge = {
        type: 'requirement-pattern',
        pattern: 'authentication-flow',
        risks: ['session-hijacking', 'brute-force'],
        confidence: 0.85
      };

      await agent1.storeMemory('auth-knowledge', knowledge);

      // Share knowledge from agent1 to agent2
      await memory.share('agent-1', 'agent-2', 'auth-knowledge');

      // Agent 2 retrieves shared knowledge
      const sharedKnowledge = await agent2.retrieveMemory('auth-knowledge');

      expect(sharedKnowledge).toBeDefined();
      expect(sharedKnowledge?.value).toEqual(knowledge);
    });
  });

  describe('Event-Driven Collaboration', () => {
    it('should collaborate through events', async () => {
      const events: any[] = [];

      // Set up event listeners
      eventBus.on('task:completed', (data) => {
        events.push({ type: 'task:completed', data });
      });

      eventBus.on('risk:identified', (data) => {
        events.push({ type: 'risk:identified', data });
      });

      const agent = new RiskOracleAgent(
        { id: 'event-agent', swarmId: 'test', type: 'risk-oracle', instance: 1 },
        {
          name: 'Event Agent',
          type: 'risk-oracle',
          pactLevel: PACTLevel.PROACTIVE,
          capabilities: {
            maxConcurrentTasks: 1,
            supportedTaskTypes: ['risk-assessment'],
            pactLevel: PACTLevel.PROACTIVE,
            rstHeuristics: ['SFDIPOT'],
            contextAwareness: true,
            explainability: true,
            learningEnabled: true,
            securityClearance: 'internal'
          },
          environment: {
            runtime: 'node',
            version: '18.0.0',
            workingDirectory: '.',
            logLevel: 'info',
            timeout: 5000
          }
        },
        logger,
        eventBus,
        memory
      );

      await agent.initialize();

      const task: TaskDefinition = {
        id: 'event-task-001',
        type: 'risk-assessment',
        priority: 'high',
        context: {
          component: 'payment-system',
          changes: { linesChanged: 500 }
        },
        constraints: {},
        dependencies: [],
        expectedOutcome: 'Risk assessment',
        metadata: {}
      };

      await agent.executeTask(task);

      // Verify events were emitted
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'task:completed')).toBe(true);
    });
  });
});